-- Generalize composite financial identities beyond a single provider.
-- Keeps prior prompt knowledge, extends canonical identifiers, and hardens typed routing.

alter table public.business_financial_identifiers
  drop constraint if exists business_financial_identifiers_identifier_type_check;

alter table public.business_financial_identifiers
  add constraint business_financial_identifiers_identifier_type_check
  check (identifier_type = any (array[
    'account_number'::text,
    'wallet_number'::text,
    'customer_line'::text,
    'merchant_point'::text,
    'terminal_number'::text,
    'phone_number'::text,
    'national_id'::text,
    'passport_number'::text,
    'unique_account_name'::text,
    'iban'::text,
    'other'::text
  ]));

create or replace function public.normalize_financial_identifier(p_value text)
returns text
language sql
immutable
parallel safe
set search_path to ''
as $function$
  select nullif(
    lower(
      regexp_replace(
        translate(btrim(coalesce(p_value, '')), '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789'),
        '[^0-9A-Za-zء-ي]+',
        '',
        'g'
      )
    ),
    ''
  );
$function$;

create or replace function public.write_business_financial_account(
  p_business_id uuid,
  p_account_id uuid,
  p_legacy_account_id text,
  p_financial_entity_code text,
  p_financial_entity_raw text,
  p_account_holder_name text,
  p_account_label text,
  p_is_multicurrency boolean,
  p_identifiers jsonb,
  p_routing_enabled boolean
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_account_id uuid := p_account_id;
  v_created boolean := false;
  v_identifier jsonb;
  v_identifier_type text;
  v_identifier_value text;
  v_currency text;
  v_items jsonb;
  v_item jsonb;
  v_legacy_account_id text := nullif(btrim(coalesce(p_legacy_account_id, '')), '');
  v_entity_routing_enabled boolean;
  v_holder_name text := nullif(btrim(coalesce(p_account_holder_name, '')), '');
  v_requires_holder_name boolean := false;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  perform 1
  from public.business_profiles bp
  where bp.id = p_business_id
    and (bp.owner_user_id = v_uid or public.is_platform_admin(v_uid))
  for update;
  if not found then raise exception 'business_owner_required'; end if;

  select fe.routing_enabled into v_entity_routing_enabled
  from public.financial_entities fe
  where fe.code = p_financial_entity_code and fe.status = 'active';
  if not found then raise exception 'invalid_financial_entity'; end if;

  if p_financial_entity_code = 'other'
     and nullif(btrim(coalesce(p_financial_entity_raw, '')), '') is null then
    raise exception 'financial_entity_raw_required';
  end if;

  if jsonb_typeof(coalesce(p_identifiers, '[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(p_identifiers, '[]'::jsonb)) = 0 then
    raise exception 'financial_identifier_required';
  end if;
  if jsonb_array_length(p_identifiers) > 20 then raise exception 'too_many_financial_identifiers'; end if;

  select exists (
    select 1
    from jsonb_array_elements(p_identifiers) item
    where item->>'identifier_type' in ('phone_number','national_id','passport_number','unique_account_name')
  ) into v_requires_holder_name;

  if v_requires_holder_name and v_holder_name is null then
    raise exception 'account_holder_name_required_for_composite_identifier';
  end if;

  if v_account_id is not null then
    perform 1 from public.business_financial_accounts a
    where a.id = v_account_id and a.business_id = p_business_id
    for update;
    if not found then raise exception 'financial_account_not_found'; end if;
  else
    v_account_id := gen_random_uuid();
    v_created := true;
  end if;

  insert into public.business_financial_accounts (
    id,business_id,legacy_account_id,financial_entity_code,financial_entity_raw,
    account_holder_name,account_label,is_multicurrency,routing_enabled,
    verification_status,verified_at,verified_by_user_id,status,metadata,created_by_user_id
  ) values (
    v_account_id,p_business_id,
    coalesce(v_legacy_account_id, 'acc_' || replace(v_account_id::text, '-', '')),
    p_financial_entity_code,
    case when p_financial_entity_code='other' then nullif(btrim(p_financial_entity_raw),'') else null end,
    v_holder_name,nullif(btrim(coalesce(p_account_label,'')),''),coalesce(p_is_multicurrency,false),
    coalesce(p_routing_enabled,true) and coalesce(v_entity_routing_enabled,false),
    'unverified',null,null,'active',
    jsonb_build_object('last_write_source','business_financial_account_rpc','identity_contract','typed-identifiers-v2'),
    v_uid
  )
  on conflict (id) do update set
    financial_entity_code=excluded.financial_entity_code,
    financial_entity_raw=excluded.financial_entity_raw,
    account_holder_name=excluded.account_holder_name,
    account_label=excluded.account_label,
    is_multicurrency=excluded.is_multicurrency,
    routing_enabled=excluded.routing_enabled,
    verification_status='unverified',verified_at=null,verified_by_user_id=null,status='active',
    metadata=public.business_financial_accounts.metadata || excluded.metadata,
    updated_at=now();

  update public.business_financial_identifiers
  set status='archived',routing_enabled=false,updated_at=now()
  where financial_account_id=v_account_id and status='active';

  for v_identifier in select value from jsonb_array_elements(p_identifiers)
  loop
    v_identifier_type := nullif(btrim(coalesce(v_identifier->>'identifier_type','')),'');
    v_identifier_value := nullif(btrim(coalesce(v_identifier->>'identifier_value','')),'');
    v_currency := nullif(upper(btrim(coalesce(v_identifier->>'currency',''))),'');

    if v_identifier_type is null or v_identifier_type not in (
      'account_number','wallet_number','customer_line','merchant_point','terminal_number',
      'phone_number','national_id','passport_number','unique_account_name','iban','other'
    ) then raise exception 'invalid_financial_identifier_type'; end if;

    if v_identifier_value is null or public.normalize_financial_identifier(v_identifier_value) is null then
      raise exception 'invalid_financial_identifier_value';
    end if;

    if v_identifier_type='phone_number' and private.normalize_yemen_phone(v_identifier_value) is null then
      raise exception 'invalid_yemen_phone';
    end if;

    if v_currency is not null and v_currency not in ('YER','SAR','USD') then
      raise exception 'invalid_financial_identifier_currency';
    end if;

    insert into public.business_financial_identifiers (
      financial_account_id,identifier_type,identifier_value,currency,is_primary,
      routing_enabled,verification_status,status,metadata
    ) values (
      v_account_id,v_identifier_type,v_identifier_value,v_currency,
      coalesce((v_identifier->>'is_primary')::boolean,false),
      (coalesce(p_routing_enabled,true) and coalesce(v_entity_routing_enabled,false))
        and coalesce((v_identifier->>'routing_enabled')::boolean,true),
      'unverified','active',
      jsonb_build_object(
        'source','business_financial_account_rpc',
        'match_mode',case when v_identifier_type in ('phone_number','national_id','passport_number','unique_account_name')
          then 'entity_identifier_holder_name' else 'typed_identifier' end
      )
    );
  end loop;

  insert into public.business_financial_account_events (
    business_id,financial_account_id,event_type,actor_user_id,snapshot,metadata
  )
  select p_business_id,v_account_id,case when v_created then 'created' else 'updated' end,v_uid,
    to_jsonb(a) || jsonb_build_object('identifiers',coalesce((
      select jsonb_agg(to_jsonb(i) order by i.created_at,i.id)
      from public.business_financial_identifiers i
      where i.financial_account_id=a.id and i.status='active'
    ),'[]'::jsonb)),
    jsonb_build_object('source','business_financial_account_rpc','identity_contract','typed-identifiers-v2')
  from public.business_financial_accounts a where a.id=v_account_id;

  perform public.sync_business_financial_accounts_legacy_cache(p_business_id);
  v_items := public.business_financial_accounts_json(p_business_id,false);
  select entry.value into v_item
  from jsonb_array_elements(v_items) entry(value)
  where entry.value->>'account_id'=v_account_id::text limit 1;

  return jsonb_build_object('ok',true,'item',v_item,'items',v_items,'account_id',v_account_id);
end;
$function$;

create or replace function private.route_operation_by_exact_identifier(p_operation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_operation public.operations%rowtype;
  v_identifier text;
  v_identifier_type text;
  v_identifier_source text;
  v_phone text;
  v_holder_name text;
  v_composite boolean := false;
  v_business_id uuid;
  v_account_id uuid;
  v_account_verified text;
  v_identifier_verified text;
  v_candidate_count integer;
  v_inbox_id uuid;
  v_status text;
  v_match_strategy text;
begin
  select * into v_operation from public.operations where id=p_operation_id;
  if not found or v_operation.ai_status<>'completed' then
    return jsonb_build_object('ok',false,'reason','analysis_not_completed');
  end if;

  if nullif(v_operation.credited_account_normalized,'') is not null then
    v_identifier:=v_operation.credited_account_normalized;
    v_identifier_type:='account_number';
    v_identifier_source:='credited_account';
  elsif nullif(v_operation.receiver_account_normalized,'') is not null then
    v_identifier:=v_operation.receiver_account_normalized;
    v_identifier_type:=coalesce(nullif(v_operation.receiver_identifier_type,''),'unknown');
    v_identifier_source:='receiver_account';
  elsif nullif(v_operation.document_account_normalized,'') is not null then
    v_identifier:=v_operation.document_account_normalized;
    v_identifier_type:='account_number';
    v_identifier_source:='document_account';
  end if;

  if v_identifier is null then return jsonb_build_object('ok',false,'reason','credited_identifier_missing'); end if;

  v_composite := v_identifier_type in ('phone_number','national_id','passport_number','unique_account_name');
  if v_composite then
    v_holder_name:=public.normalize_financial_name(v_operation.receiver_name);
    if v_holder_name is null then
      return jsonb_build_object('ok',false,'reason','receiver_name_required_for_composite_match','identifier_type',v_identifier_type);
    end if;
  end if;

  if v_identifier_type='phone_number' then
    v_phone:=private.normalize_yemen_phone(v_identifier);
    if v_phone is null then return jsonb_build_object('ok',false,'reason','invalid_receiver_phone'); end if;
  end if;

  with candidates as (
    select distinct on (fa.business_id)
      fa.business_id,fa.id account_id,fa.verification_status account_verified,
      fi.verification_status identifier_verified
    from public.business_financial_identifiers fi
    join public.business_financial_accounts fa on fa.id=fi.financial_account_id
    where fi.status='active' and fi.routing_enabled=true
      and fa.status='active' and fa.routing_enabled=true
      and (fi.currency is null or upper(fi.currency)=upper(coalesce(v_operation.currency,'')))
      and (
        (v_identifier_type='phone_number' and fi.identifier_type='phone_number'
          and private.normalize_yemen_phone(fi.identifier_value)=v_phone)
        or
        (v_identifier_type='unique_account_name' and fi.identifier_type='unique_account_name'
          and public.normalize_financial_name(fi.identifier_value)=public.normalize_financial_name(v_identifier))
        or
        (v_identifier_type not in ('phone_number','unique_account_name')
          and fi.identifier_type=case
            when v_identifier_type in ('financial_account_number','account_number') then 'account_number'
            when v_identifier_type='financial_line' then 'customer_line'
            else v_identifier_type end
          and fi.identifier_value_normalized=public.normalize_financial_identifier(v_identifier))
      )
      and (not v_composite or (
        fa.financial_entity_code=v_operation.financial_entity_code
        and public.normalize_financial_name(fa.account_holder_name)=v_holder_name
      ))
    order by fa.business_id,fi.is_primary desc,fi.created_at asc
  )
  select count(*),(array_agg(business_id))[1],(array_agg(account_id))[1],
         (array_agg(account_verified))[1],(array_agg(identifier_verified))[1]
  into v_candidate_count,v_business_id,v_account_id,v_account_verified,v_identifier_verified
  from candidates;

  if v_candidate_count<>1 or v_business_id is null then
    return jsonb_build_object(
      'ok',false,
      'reason',case
        when v_composite and v_candidate_count=0 then 'composite_identifier_not_found'
        when v_composite then 'composite_identifier_ambiguous'
        when v_candidate_count=0 then 'exact_identifier_not_found'
        else 'exact_identifier_ambiguous' end,
      'candidate_count',v_candidate_count,'identifier_type',v_identifier_type,'identifier_source',v_identifier_source
    );
  end if;

  select id,status into v_inbox_id,v_status
  from public.business_payment_inbox
  where business_id=v_business_id and operation_id=p_operation_id;
  if v_inbox_id is not null then
    return jsonb_build_object('ok',true,'created',false,'item_id',v_inbox_id,'status',v_status);
  end if;

  v_match_strategy:=case v_identifier_type
    when 'phone_number' then 'exact_phone_name_identifier'
    when 'national_id' then 'exact_national_id_name_identifier'
    when 'passport_number' then 'exact_passport_name_identifier'
    when 'unique_account_name' then 'exact_unique_account_name_identifier'
    else 'exact_typed_identifier' end;

  if v_account_verified='verified' and v_identifier_verified='verified' then
    v_inbox_id:=private.enqueue_business_payment_inbox_system(
      v_business_id,p_operation_id,null,v_account_id,'live',100,v_match_strategy,
      jsonb_build_object(
        'identifier',case when v_identifier_type='phone_number' then v_phone else v_identifier end,
        'identifier_type',v_identifier_type,'identifier_source',v_identifier_source,
        'receiver_name_normalized',case when v_composite then v_holder_name else null end,
        'entity_code',v_operation.financial_entity_code,
        'routing_precedence',case when v_composite then 'entity_typed_identifier_holder_name' else 'exact_typed_identifier' end
      )
    );
    v_status:='new';
  else
    insert into public.business_payment_inbox(
      business_id,operation_id,financial_account_id,source_mode,status,priority,
      match_score,match_strategy,routing_snapshot
    ) values (
      v_business_id,p_operation_id,v_account_id,'canary','review_required',95,100,
      v_match_strategy||'_unverified',
      jsonb_build_object(
        'identifier',case when v_identifier_type='phone_number' then v_phone else v_identifier end,
        'identifier_type',v_identifier_type,'identifier_source',v_identifier_source,
        'receiver_name_normalized',case when v_composite then v_holder_name else null end,
        'entity_code',v_operation.financial_entity_code,'verification_required',true
      )
    ) returning id,status into v_inbox_id,v_status;
    perform private.record_business_payment_inbox_event(
      v_inbox_id,'enqueued',null,null,'review_required','financial_identifier_verification_required',
      jsonb_build_object('identifier_type',v_identifier_type,'match_strategy',v_match_strategy)
    );
    perform private.notify_business_payment_review_required(v_inbox_id);
  end if;

  return jsonb_build_object(
    'ok',true,'created',true,'item_id',v_inbox_id,'status',v_status,
    'business_id',v_business_id,'financial_account_id',v_account_id,'match_strategy',v_match_strategy
  );
end;
$function$;

-- Preserve every rule from prompt v7/v8 and replace only the appended provider-specific section.
update public.ai_prompts
set version=9,
    prompt_text=split_part(prompt_text,E'\n\nقواعد بن دول باي والحسابات المعتمدة على رقم الجوال:',1) || E'\n\nقواعد الحسابات التي تُعرّف باسم المستفيد ومعرّف مرتبط به:\n- هذه القواعد عامة ولا ترتبط ببن دول باي أو بجهة مالية واحدة؛ طبّقها على أي بنك أو محفظة أو شركة صرافة يظهر إشعارها هذا النمط.\n- إذا ظهر اسم المستفيد أو صاحب الحساب مقرونًا برقم جوال، صنف الرقم phone_number داخل identifiers للطرف المستفيد، وضعه في receiver_account للتوافق، واجعل receiver_identifier_type="phone_number".\n- إذا ظهر الاسم مقرونًا برقم هوية وطنية، صنف الرقم national_id. وإذا ظهر رقم جواز، صنفه passport_number. وإذا كانت الجهة تعرض اسم حساب فريدًا بوصفه المعرّف نفسه، استخدم unique_account_name.\n- لا تصنف رقم الجوال أو الهوية أو الجواز account_number لمجرد أنه رقم ظاهر في إشعار مالي.\n- الاسم والمعرّف المرتبط به يمثلان هوية مركبة للطرف؛ لا تحذف الاسم ولا تستبدل المعرّف برقم المرسل أو المرجع أو رقم الحوالة.\n- استمر في تحديد financial_entity من شعار الجهة واسمها وعناوين القالب والقرائن المعتمدة في القواعد السابقة. لا تستخدم نمط الاسم+الجوال لتغيير الجهة المالية أو تخمينها.\n- reference_number هو رقم الحوالة أو الإشعار أو المرجع، وليس حسابًا ماليًا.\n- الرسوم أو العمولة لا تساوي amount؛ amount هو المبلغ الرئيسي للعملية فقط.\n- أضف evidence لكل معرّف من التسمية الظاهرة مثل رقم موبايل المستفيد أو رقم الهوية أو اسم الحساب.',
    notes='Prompt v9: preserve all previous provider/template rules and generalize composite beneficiary identities across all financial entities.',
    updated_at=now()
where prompt_key='sanad_operation_extraction_v1' and is_active=true;

-- Keep the analysis projection typed instead of collapsing sensitive identifiers to other.
do $block$
declare v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='private' and p.proname='apply_operation_analysis_contract_v2';

  v_def:=replace(v_def,
    E"when 'national_id' then 'other'\n    when 'passport_number' then 'other'\n    when 'unique_account_name' then 'other'",
    E"when 'national_id' then 'national_id'\n    when 'passport_number' then 'passport_number'\n    when 'unique_account_name' then 'unique_account_name'");
  execute v_def;
end;
$block$;

-- Harden shadow matching so typed/composite identifiers cannot collide by numeric value alone.
do $block$
declare v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='evaluate_operation_financial_routing_shadow';

  v_def:=replace(v_def,
    E'on i.identifier_value_normalized = s.value_normalized\n       and i.status = \'active\'\n       and i.routing_enabled = true',
    E'on (\n          (s.inferred_type = \'phone_number\' and i.identifier_type = \'phone_number\'\n            and private.normalize_yemen_phone(i.identifier_value) = private.normalize_yemen_phone(s.value_normalized))\n          or (s.inferred_type = \'unique_account_name\' and i.identifier_type = \'unique_account_name\'\n            and public.normalize_financial_name(i.identifier_value) = public.normalize_financial_name(s.value_normalized))\n          or (s.inferred_type not in (\'phone_number\',\'unique_account_name\')\n            and i.identifier_value_normalized = s.value_normalized\n            and (s.inferred_type in (\'unknown\',\'other\') or i.identifier_type = s.inferred_type))\n        )\n       and i.status = \'active\'\n       and i.routing_enabled = true');

  v_def:=replace(v_def,
    E"and a.financial_entity_code = v_entity_code\n    ),",
    E"and a.financial_entity_code = v_entity_code\n       and (s.inferred_type not in ('phone_number','national_id','passport_number','unique_account_name')\n         or public.normalize_financial_name(a.account_holder_name)=public.normalize_financial_name(\n           case when s.role='sender_account' then v_operation.sender_name else v_operation.receiver_name end\n         ))\n    ),");
  execute v_def;
end;
$block$;

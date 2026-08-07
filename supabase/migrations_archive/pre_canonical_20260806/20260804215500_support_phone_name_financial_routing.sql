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
  v_receiver_name text;
  v_is_phone boolean := false;
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
    v_identifier := v_operation.credited_account_normalized;
    v_identifier_type := 'account_number';
    v_identifier_source := 'credited_account';
  elsif nullif(v_operation.receiver_account_normalized,'') is not null then
    v_identifier := v_operation.receiver_account_normalized;
    v_identifier_type := coalesce(nullif(v_operation.receiver_identifier_type,''),'unknown');
    v_identifier_source := 'receiver_account';
  elsif nullif(v_operation.document_account_normalized,'') is not null then
    v_identifier := v_operation.document_account_normalized;
    v_identifier_type := 'account_number';
    v_identifier_source := 'document_account';
  end if;

  if v_identifier is null then
    return jsonb_build_object('ok',false,'reason','credited_identifier_missing');
  end if;

  v_is_phone := v_identifier_source='receiver_account' and v_identifier_type='phone_number';
  if v_is_phone then
    v_phone := private.normalize_yemen_phone(v_identifier);
    v_receiver_name := public.normalize_financial_name(v_operation.receiver_name);
    if v_phone is null then
      return jsonb_build_object('ok',false,'reason','invalid_receiver_phone');
    end if;
    if v_receiver_name is null then
      return jsonb_build_object('ok',false,'reason','receiver_name_required_for_phone_match');
    end if;
  end if;

  with candidates as (
    select distinct on (fa.business_id)
      fa.business_id,
      fa.id account_id,
      fa.verification_status account_verified,
      fi.verification_status identifier_verified
    from public.business_financial_identifiers fi
    join public.business_financial_accounts fa on fa.id=fi.financial_account_id
    where fi.status='active'
      and fi.routing_enabled=true
      and fa.status='active'
      and fa.routing_enabled=true
      and (fi.currency is null or upper(fi.currency)=upper(coalesce(v_operation.currency,'')))
      and (
        (not v_is_phone and fi.identifier_value_normalized=v_identifier)
        or
        (
          v_is_phone
          and fi.identifier_type='phone_number'
          and private.normalize_yemen_phone(fi.identifier_value_normalized)=v_phone
          and fa.financial_entity_code=v_operation.financial_entity_code
          and public.normalize_financial_name(fa.account_holder_name)=v_receiver_name
        )
      )
    order by fa.business_id,fi.is_primary desc,fi.created_at asc
  )
  select count(*),(array_agg(business_id))[1],(array_agg(account_id))[1],(array_agg(account_verified))[1],(array_agg(identifier_verified))[1]
  into v_candidate_count,v_business_id,v_account_id,v_account_verified,v_identifier_verified
  from candidates;

  if v_candidate_count<>1 or v_business_id is null then
    return jsonb_build_object(
      'ok',false,
      'reason',case
        when v_is_phone and v_candidate_count=0 then 'phone_name_identifier_not_found'
        when v_is_phone then 'phone_name_identifier_ambiguous'
        when v_candidate_count=0 then 'exact_identifier_not_found'
        else 'exact_identifier_ambiguous'
      end,
      'candidate_count',v_candidate_count,
      'identifier_type',v_identifier_type,
      'identifier_source',v_identifier_source
    );
  end if;

  select id,status into v_inbox_id,v_status
  from public.business_payment_inbox
  where business_id=v_business_id and operation_id=p_operation_id;

  if v_inbox_id is not null then
    return jsonb_build_object('ok',true,'created',false,'item_id',v_inbox_id,'status',v_status);
  end if;

  v_match_strategy := case when v_is_phone then 'exact_phone_name_identifier' else 'exact_credited_identifier' end;

  if v_account_verified='verified' and v_identifier_verified='verified' then
    v_inbox_id:=private.enqueue_business_payment_inbox_system(
      v_business_id,p_operation_id,null,v_account_id,'live',100,v_match_strategy,
      jsonb_build_object(
        'identifier',case when v_is_phone then v_phone else v_identifier end,
        'identifier_type',v_identifier_type,
        'identifier_source',v_identifier_source,
        'receiver_name_normalized',case when v_is_phone then v_receiver_name else null end,
        'entity_code',v_operation.financial_entity_code,
        'entity_mismatch_warning',false,
        'routing_precedence',case when v_is_phone then 'entity_phone_name_composite' else 'exact_identifier_first' end
      )
    );
    v_status:='new';
  else
    insert into public.business_payment_inbox(
      business_id,operation_id,financial_account_id,source_mode,status,priority,match_score,match_strategy,routing_snapshot
    ) values(
      v_business_id,p_operation_id,v_account_id,'canary','review_required',95,100,
      v_match_strategy||'_unverified',
      jsonb_build_object(
        'identifier',case when v_is_phone then v_phone else v_identifier end,
        'identifier_type',v_identifier_type,
        'identifier_source',v_identifier_source,
        'receiver_name_normalized',case when v_is_phone then v_receiver_name else null end,
        'entity_code',v_operation.financial_entity_code,
        'routing_precedence',case when v_is_phone then 'entity_phone_name_composite' else 'exact_identifier_first' end,
        'verification_required',true
      )
    ) returning id,status into v_inbox_id,v_status;

    perform private.record_business_payment_inbox_event(
      v_inbox_id,'enqueued',null,null,'review_required','financial_identifier_verification_required',
      jsonb_build_object('identifier',case when v_is_phone then v_phone else v_identifier end,'match_strategy',v_match_strategy)
    );
    perform private.notify_business_payment_review_required(v_inbox_id);
  end if;

  return jsonb_build_object(
    'ok',true,'created',true,'item_id',v_inbox_id,'status',v_status,
    'business_id',v_business_id,'financial_account_id',v_account_id,'match_strategy',v_match_strategy
  );
end;
$function$;

create or replace function private.route_operation_by_exact_identifier_trigger()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if new.ai_status='completed' and (
    tg_op='INSERT'
    or old.ai_status is distinct from new.ai_status
    or old.credited_account_normalized is distinct from new.credited_account_normalized
    or old.receiver_account_normalized is distinct from new.receiver_account_normalized
    or old.receiver_identifier_type is distinct from new.receiver_identifier_type
    or old.receiver_name_normalized is distinct from new.receiver_name_normalized
    or old.document_account_normalized is distinct from new.document_account_normalized
    or old.currency is distinct from new.currency
    or old.financial_entity_code is distinct from new.financial_entity_code
  ) then
    perform private.route_operation_by_exact_identifier(new.id);
  end if;
  return new;
end;
$function$;

update public.ai_prompts
set version=8,
    prompt_text=prompt_text || E'\n\nقواعد بن دول باي والحسابات المعتمدة على رقم الجوال:\n- إذا ظهر الحقل «رقم موبايل المستفيد» أو «رقم جوال المستفيد» أو ما يعادله، صنفه phone_number داخل identifiers للطرف المستفيد.\n- ضع رقم الجوال نفسه في receiver_account للتوافق، واجعل receiver_identifier_type="phone_number".\n- استخرج اسم المستفيد كاملًا في receiver_name من حقل «اسم المستفيد».\n- لا تصنف رقم الجوال account_number أو wallet_number لمجرد أنه رقم مالي ظاهر في الإشعار.\n- في هذا القالب يمثل اسم المستفيد + رقم جواله هوية الحساب؛ يجب عدم حذف أي منهما أو استبدال أحدهما برقم المرسل أو رقم الحوالة.\n- رقم حوالة بن دول باي هو reference_number وليس رقم حساب.\n- قيمة «العمولة» ليست amount؛ amount هو المبلغ الرئيسي فقط.\n- عند ظهور اسم المستفيد ورقم موبايله بوضوح، أضف للطرف credited_party معرفًا من النوع phone_number مع evidence يتضمن تسمية رقم موبايل المستفيد.',
    notes='Prompt v8: support BinDawol Pay beneficiary identity as financial entity + account holder name + phone number; preserve transfer reference and exclude fee.',
    updated_at=now()
where prompt_key='sanad_operation_extraction_v1'
  and is_active=true
  and position('قواعد بن دول باي والحسابات المعتمدة على رقم الجوال' in prompt_text)=0;
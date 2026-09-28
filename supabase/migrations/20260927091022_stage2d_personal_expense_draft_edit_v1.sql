-- Stage 2D.2-B, first slice: expense revision on the canonical action ID.
-- Extract the existing v1 normalizer/review builder; both create and edit call it.
-- No second action store, no approval on edit, and no ERP writes.
begin;

create or replace function private.normalize_sanad_agent_action_v1(
  p_thread_id uuid, p_action_type text, p_payload jsonb,
  p_action_id uuid, p_attachment_ids uuid[]
) returns jsonb
language plpgsql security invoker set search_path=''
as $$
declare
  v_uid uuid := auth.uid();
  v_thread public.sanad_agent_threads%rowtype;
  v_action_type text := lower(btrim(coalesce(p_action_type,'')));
  v_payload jsonb := coalesce(p_payload,'{}'::jsonb);
  v_normalized jsonb := '{}'::jsonb;
  v_review jsonb := '{}'::jsonb;
  v_business uuid;
  v_party uuid;
  v_party_name text;
  v_type text;
  v_currency text;
  v_amount numeric(24,6);
  v_description text;
  v_transaction_at timestamptz;
  v_account uuid;
  v_account_name text;
  v_account_currency text;
  v_source_account uuid;
  v_source_name text;
  v_source_currency text;
  v_destination_account uuid;
  v_destination_name text;
  v_destination_currency text;
  v_category uuid;
  v_category_name text;
  v_document_type text;
  v_document_date date;
  v_due_date date;
  v_document_number text;
  v_notes text;
  v_lines jsonb := '[]'::jsonb;
  v_line jsonb;
  v_line_description text;
  v_quantity numeric(24,6);
  v_unit_price numeric(24,6);
  v_discount numeric(24,6);
  v_tax numeric(24,6);
  v_total numeric(24,6) := 0;
  v_line_count integer := 0;
  v_action_id uuid := p_action_id;
  v_attachment_ids uuid[] := coalesce(p_attachment_ids,'{}'::uuid[]);
begin
  if v_uid is null then
    raise exception 'authentication_required' using errcode='42501';
  end if;

  select * into v_thread
  from public.sanad_agent_threads
  where id=p_thread_id and user_id=v_uid and status='active';

  if not found then
    raise exception 'agent_thread_not_found' using errcode='P0002';
  end if;

  if v_action_type not in ('personal_transaction','commercial_document_draft') then
    raise exception 'agent_action_type_not_allowed' using errcode='22023';
  end if;

  if jsonb_typeof(v_payload) is distinct from 'object' or p_action_id is null then
    raise exception 'invalid_action_payload' using errcode='22023';
  end if;
  if (v_action_type='personal_transaction' and
      (v_thread.project_kind is distinct from 'personal' or v_thread.business_id is not null)) then
    raise exception 'agent_action_personal_project_required' using errcode='42501';
  end if;
  if (v_action_type='commercial_document_draft' and
      (v_thread.project_kind is distinct from 'business' or v_thread.business_id is null)) then
    raise exception 'agent_action_business_project_mismatch' using errcode='42501';
  end if;

  if cardinality(v_attachment_ids)>5 then
    raise exception 'too_many_action_attachments' using errcode='22023';
  end if;

  if exists (
    select 1
    from unnest(v_attachment_ids) x(id)
    left join public.sanad_agent_attachments a
      on a.id=x.id and a.user_id=v_uid and a.thread_id=p_thread_id and a.status='ready'
    where a.id is null
  ) then
    raise exception 'action_attachment_not_ready_or_not_owned' using errcode='22023';
  end if;

  if v_action_type='personal_transaction' then
    v_type := lower(btrim(coalesce(v_payload->>'transaction_type','')));
    if v_type not in ('income','expense','transfer') then
      raise exception 'invalid_personal_transaction_type' using errcode='22023';
    end if;

    begin
      v_amount := (v_payload->>'amount')::numeric(24,6);
    exception when others then
      raise exception 'invalid_action_amount' using errcode='22023';
    end;
    if v_amount is null or v_amount<=0 or v_amount>99999999999999 then
      raise exception 'invalid_action_amount' using errcode='22023';
    end if;

    v_description := nullif(left(btrim(coalesce(v_payload->>'description','')),500),'');
    begin
      v_transaction_at := coalesce(nullif(v_payload->>'transaction_at','')::timestamptz,now());
    exception when others then
      raise exception 'invalid_action_transaction_at' using errcode='22023';
    end;

    if v_type in ('income','expense') then
      v_currency := upper(btrim(coalesce(v_payload->>'currency','')));
      if v_currency !~ '^[A-Z]{3}$' then
        raise exception 'invalid_action_currency' using errcode='22023';
      end if;
      begin v_account := nullif(v_payload->>'account_id','')::uuid;
      exception when others then raise exception 'invalid_action_account_id' using errcode='22023'; end;
      if v_account is null then raise exception 'action_account_required' using errcode='22023'; end if;

      select a.name,a.currency into v_account_name,v_account_currency
      from public.personal_finance_accounts a
      where a.id=v_account and a.user_id=v_uid and a.status='active' and a.system_role is null;
      if v_account_name is null then raise exception 'action_account_not_found' using errcode='P0002'; end if;
      if v_account_currency<>v_currency then raise exception 'action_account_currency_mismatch' using errcode='22023'; end if;

      begin v_category := nullif(v_payload->>'category_id','')::uuid;
      exception when others then raise exception 'invalid_action_category_id' using errcode='22023'; end;
      if v_category is not null then
        select c.name into v_category_name
        from public.personal_finance_categories c
        where c.id=v_category and c.user_id=v_uid and c.status='active' and c.kind=v_type;
        if v_category_name is null then raise exception 'action_category_not_found' using errcode='P0002'; end if;
      end if;

      v_normalized := jsonb_build_object(
        'transaction_type',v_type,
        'amount',v_amount,
        'currency',v_currency,
        'account_id',v_account,
        'category_id',v_category,
        'description',v_description,
        'transaction_at',v_transaction_at,
        'source','assistant',
        'metadata',jsonb_build_object(
          'ui_surface','sanad_agent',
          'sanad_agent_action_id',v_action_id,
          'sanad_agent_thread_id',p_thread_id
        )
      );

      v_review := jsonb_build_object(
        'title',case when v_type='income' then 'مراجعة تسجيل دخل شخصي' else 'مراجعة تسجيل مصروف شخصي' end,
        'summary',coalesce(v_description,case when v_type='income' then 'دخل شخصي' else 'مصروف شخصي' end),
        'currency',v_currency,
        'amount',v_amount,
        'fields',jsonb_build_array(
          jsonb_build_object('label','النوع','value',case when v_type='income' then 'دخل' else 'مصروف' end),
          jsonb_build_object('label','الحساب','value',v_account_name),
          jsonb_build_object('label','التصنيف','value',coalesce(v_category_name,'بدون تصنيف')),
          jsonb_build_object('label','المبلغ','value',v_amount::text||' '||v_currency),
          jsonb_build_object('label','التاريخ','value',v_transaction_at::text)
        ),
        'approval_effect','سيتم إنشاء وترحيل قيد مالي شخصي داخل سند بعد اعتمادك الصريح.',
        'writes_to_erp',false
      );
    else
      begin v_source_account := nullif(v_payload->>'source_account_id','')::uuid;
      exception when others then raise exception 'invalid_action_source_account_id' using errcode='22023'; end;
      begin v_destination_account := nullif(v_payload->>'destination_account_id','')::uuid;
      exception when others then raise exception 'invalid_action_destination_account_id' using errcode='22023'; end;
      if v_source_account is null or v_destination_account is null or v_source_account=v_destination_account then
        raise exception 'valid_transfer_accounts_required' using errcode='22023';
      end if;

      select a.name,a.currency into v_source_name,v_source_currency
      from public.personal_finance_accounts a
      where a.id=v_source_account and a.user_id=v_uid and a.status='active' and a.system_role is null;
      select a.name,a.currency into v_destination_name,v_destination_currency
      from public.personal_finance_accounts a
      where a.id=v_destination_account and a.user_id=v_uid and a.status='active' and a.system_role is null;
      if v_source_name is null or v_destination_name is null then raise exception 'action_transfer_account_not_found' using errcode='P0002'; end if;
      if v_source_currency<>v_destination_currency then raise exception 'cross_currency_transfer_requires_explicit_exchange_workflow' using errcode='22023'; end if;
      v_currency := v_source_currency;

      v_normalized := jsonb_build_object(
        'transaction_type','transfer',
        'amount',v_amount,
        'currency',v_currency,
        'source_account_id',v_source_account,
        'destination_account_id',v_destination_account,
        'description',v_description,
        'transaction_at',v_transaction_at,
        'source','assistant',
        'metadata',jsonb_build_object(
          'ui_surface','sanad_agent',
          'sanad_agent_action_id',v_action_id,
          'sanad_agent_thread_id',p_thread_id
        )
      );

      v_review := jsonb_build_object(
        'title','مراجعة تحويل مالي شخصي',
        'summary',coalesce(v_description,'تحويل بين حسابين شخصيين'),
        'currency',v_currency,
        'amount',v_amount,
        'fields',jsonb_build_array(
          jsonb_build_object('label','من','value',v_source_name),
          jsonb_build_object('label','إلى','value',v_destination_name),
          jsonb_build_object('label','المبلغ','value',v_amount::text||' '||v_currency),
          jsonb_build_object('label','التاريخ','value',v_transaction_at::text)
        ),
        'approval_effect','سيتم إنشاء وترحيل تحويل مالي شخصي داخل سند بعد اعتمادك الصريح.',
        'writes_to_erp',false
      );
    end if;

  else
    begin v_business := nullif(v_payload->>'business_id','')::uuid;
    exception when others then raise exception 'invalid_action_business_id' using errcode='22023'; end;
    if v_business is null then raise exception 'action_business_required' using errcode='22023'; end if;
    if v_thread.business_id is not null and v_thread.business_id<>v_business then
      raise exception 'action_business_thread_mismatch' using errcode='22023';
    end if;
    if not private.user_is_business_owner(v_business,v_uid) then
      raise exception 'business_owner_required' using errcode='42501';
    end if;

    v_document_type := lower(btrim(coalesce(v_payload->>'document_type','')));
    if v_document_type not in ('quotation','sales_invoice','purchase_invoice','receipt','payment','expense') then
      raise exception 'invalid_action_document_type' using errcode='22023';
    end if;

    v_currency := upper(btrim(coalesce(v_payload->>'currency','')));
    if v_currency !~ '^[A-Z]{3}$' then raise exception 'invalid_action_currency' using errcode='22023'; end if;

    begin v_party := nullif(v_payload->>'party_id','')::uuid;
    exception when others then raise exception 'invalid_action_party_id' using errcode='22023'; end;
    if v_party is not null then
      select p.display_name into v_party_name
      from public.business_parties p
      where p.id=v_party and p.business_id=v_business and p.status='active';
      if v_party_name is null then raise exception 'action_party_not_found' using errcode='P0002'; end if;
    end if;

    begin v_document_date := coalesce(nullif(v_payload->>'document_date','')::date,current_date);
    exception when others then raise exception 'invalid_action_document_date' using errcode='22023'; end;
    begin v_due_date := nullif(v_payload->>'due_date','')::date;
    exception when others then raise exception 'invalid_action_due_date' using errcode='22023'; end;
    if v_due_date is not null and v_due_date<v_document_date then
      raise exception 'invalid_action_due_date' using errcode='22023';
    end if;

    v_document_number := nullif(left(btrim(coalesce(v_payload->>'document_number','')),120),'');
    v_notes := nullif(left(btrim(coalesce(v_payload->>'notes','')),500),'');
    v_description := nullif(left(btrim(coalesce(v_payload->>'description','')),500),'');

    if jsonb_typeof(v_payload->'lines')='array' and jsonb_array_length(v_payload->'lines')>0 then
      if jsonb_array_length(v_payload->'lines')>20 then raise exception 'too_many_action_lines' using errcode='22023'; end if;
      for v_line in select value from jsonb_array_elements(v_payload->'lines') loop
        v_line_description := nullif(left(btrim(coalesce(v_line->>'description','')),300),'');
        if v_line_description is null then raise exception 'action_line_description_required' using errcode='22023'; end if;
        begin v_quantity := coalesce(nullif(v_line->>'quantity','')::numeric,1);
        exception when others then raise exception 'invalid_action_line_quantity' using errcode='22023'; end;
        begin v_unit_price := coalesce(nullif(v_line->>'unit_price','')::numeric,0);
        exception when others then raise exception 'invalid_action_line_unit_price' using errcode='22023'; end;
        begin v_discount := coalesce(nullif(v_line->>'discount_amount','')::numeric,0);
        exception when others then raise exception 'invalid_action_line_discount' using errcode='22023'; end;
        begin v_tax := coalesce(nullif(v_line->>'tax_amount','')::numeric,0);
        exception when others then raise exception 'invalid_action_line_tax' using errcode='22023'; end;
        if v_quantity<=0 or v_unit_price<0 or v_discount<0 or v_tax<0 then raise exception 'invalid_action_line_amounts' using errcode='22023'; end if;
        if v_discount>(v_quantity*v_unit_price) then raise exception 'action_line_discount_exceeds_gross' using errcode='22023'; end if;
        v_lines := v_lines || jsonb_build_array(jsonb_build_object(
          'description',v_line_description,
          'quantity',v_quantity,
          'unit_price',v_unit_price,
          'discount_amount',v_discount,
          'tax_amount',v_tax
        ));
        v_total := v_total + ((v_quantity*v_unit_price)-v_discount+v_tax);
        v_line_count := v_line_count+1;
      end loop;
    else
      begin v_amount := (v_payload->>'amount')::numeric(24,6);
      exception when others then raise exception 'invalid_action_amount' using errcode='22023'; end;
      if v_amount is null or v_amount<=0 then raise exception 'invalid_action_amount' using errcode='22023'; end if;
      if v_description is null then raise exception 'action_description_required' using errcode='22023'; end if;
      v_lines := jsonb_build_array(jsonb_build_object(
        'description',v_description,
        'quantity',1,
        'unit_price',v_amount,
        'discount_amount',0,
        'tax_amount',0
      ));
      v_total := v_amount;
      v_line_count := 1;
    end if;

    if v_total<0 or v_total>99999999999999 then raise exception 'invalid_action_total' using errcode='22023'; end if;

    v_normalized := jsonb_build_object(
      'business_id',v_business,
      'party_id',v_party,
      'document_type',v_document_type,
      'document_number',v_document_number,
      'document_date',v_document_date,
      'due_date',v_due_date,
      'currency',v_currency,
      'lines',v_lines,
      'notes',v_notes,
      'metadata',jsonb_build_object(
        'ui_surface','sanad_agent',
        'sanad_agent_action_id',v_action_id,
        'sanad_agent_thread_id',p_thread_id
      )
    );

    v_review := jsonb_build_object(
      'title','مراجعة إنشاء مسودة تجارية',
      'summary',case v_document_type
        when 'sales_invoice' then 'فاتورة بيع'
        when 'purchase_invoice' then 'فاتورة شراء'
        when 'receipt' then 'سند قبض'
        when 'payment' then 'سند صرف'
        when 'expense' then 'مصروف تجاري'
        when 'quotation' then 'عرض سعر'
        else v_document_type end,
      'currency',v_currency,
      'amount',v_total,
      'fields',jsonb_build_array(
        jsonb_build_object('label','المستند','value',case v_document_type
          when 'sales_invoice' then 'فاتورة بيع'
          when 'purchase_invoice' then 'فاتورة شراء'
          when 'receipt' then 'سند قبض'
          when 'payment' then 'سند صرف'
          when 'expense' then 'مصروف تجاري'
          when 'quotation' then 'عرض سعر'
          else v_document_type end),
        jsonb_build_object('label','الطرف','value',coalesce(v_party_name,'غير محدد')),
        jsonb_build_object('label','الإجمالي','value',v_total::text||' '||v_currency),
        jsonb_build_object('label','عدد البنود','value',v_line_count::text),
        jsonb_build_object('label','التاريخ','value',v_document_date::text)
      ),
      'approval_effect','سيتم إنشاء مستند تجاري بحالة Draft داخل سند فقط. لن يتم ترحيله إلى الدفتر أو إلى إبداع.',
      'writes_to_erp',false
    );
  end if;


  return jsonb_build_object('payload',v_normalized,'review',v_review,'business_id',v_business);
end;
$$;
revoke all on function private.normalize_sanad_agent_action_v1(uuid,text,jsonb,uuid,uuid[])
 from public,anon,authenticated;

create or replace function public.create_my_sanad_agent_action_draft_v1(
  p_thread_id uuid,
  p_action_type text,
  p_payload jsonb,
  p_request_id uuid default null,
  p_tool_call_id text default null,
  p_attachment_ids uuid[] default '{}'::uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_uid uuid := auth.uid();
  v_action_type text := lower(btrim(coalesce(p_action_type,'')));
  v_action_id uuid := gen_random_uuid();
  v_contract jsonb;
  v_normalized jsonb;
  v_review jsonb;
  v_business uuid;
  v_fingerprint text;
  v_existing public.sanad_agent_actions%rowtype;
  v_attachment_ids uuid[] := coalesce(p_attachment_ids,'{}'::uuid[]);
begin
  v_contract := private.normalize_sanad_agent_action_v1(
    p_thread_id,v_action_type,p_payload,v_action_id,v_attachment_ids);
  v_normalized := v_contract->'payload';
  v_review := v_contract->'review';
  v_business := (v_contract->>'business_id')::uuid;
  -- Exclude per-action audit metadata from idempotency. Otherwise the freshly
  -- generated action UUID would make every logically identical draft unique.
  v_fingerprint := md5(v_action_type||'|'||p_thread_id::text||'|'||(v_normalized - 'metadata')::text);

  select * into v_existing
  from public.sanad_agent_actions
  where user_id=v_uid and fingerprint=v_fingerprint and status in ('review','approved','executing')
  order by created_at desc
  limit 1;

  if found then
    return to_jsonb(v_existing);
  end if;

  insert into public.sanad_agent_actions(
    id,user_id,thread_id,business_id,action_type,status,payload,review,attachment_ids,
    request_id,tool_call_id,fingerprint
  ) values (
    v_action_id,v_uid,p_thread_id,v_business,v_action_type,'review',v_normalized,v_review,
    v_attachment_ids,p_request_id,left(nullif(coalesce(p_tool_call_id,''),''),200),v_fingerprint
  ) on conflict (user_id,fingerprint) where status in ('review','approved','executing')
    do nothing;
  if not found then
    select * into v_existing from public.sanad_agent_actions
    where user_id=v_uid and fingerprint=v_fingerprint
      and status in ('review','approved','executing');
    if found then return to_jsonb(v_existing); end if;
    raise exception 'agent_action_concurrent_edit' using errcode='40001';
  end if;

  insert into public.sanad_agent_action_events(action_id,user_id,event_type,data)
  values (
    v_action_id,v_uid,'created',
    jsonb_build_object('request_id',p_request_id,'tool_call_id',p_tool_call_id,'action_type',v_action_type)
  );

  return (
    select to_jsonb(a)
    from public.sanad_agent_actions a
    where a.id=v_action_id
  );
end;
$$;


create or replace function public.update_my_sanad_agent_action_draft_v2(
  p_action_id uuid, p_expected_version integer, p_payload jsonb
) returns jsonb
language plpgsql security definer set search_path=''
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.sanad_agent_actions%rowtype;
  v_contract jsonb;
  v_payload jsonb;
  v_review jsonb;
  v_fingerprint text;
begin
  if v_uid is null then raise exception 'authentication_required' using errcode='42501'; end if;
  if p_expected_version is null or p_expected_version<1 then
    raise exception 'valid_expected_version_required' using errcode='22023';
  end if;
  select * into v_row from public.sanad_agent_actions
  where id=p_action_id and user_id=v_uid for update;
  if not found then raise exception 'agent_action_not_found' using errcode='P0002'; end if;
  if v_row.status<>'review' then raise exception 'agent_action_not_editable' using errcode='22023'; end if;
  if v_row.version<>p_expected_version then
    raise exception 'agent_action_version_conflict' using errcode='40001';
  end if;
  if v_row.action_type<>'personal_transaction' or v_row.payload->>'transaction_type' is distinct from 'expense'
     or v_row.business_id is not null then
    raise exception 'agent_action_edit_variant_not_supported' using errcode='22023';
  end if;
  -- Complete editable-field replacement, never a permissive merge of caller JSON.
  -- Missing optional values must be explicit null; unknown/scope/metadata keys fail closed.
  if jsonb_typeof(p_payload) is distinct from 'object' then
    raise exception 'invalid_action_payload' using errcode='22023';
  end if;
  if not (p_payload ?& array['transaction_type','amount','currency','account_id','category_id','description','transaction_at'])
     or exists(select 1 from jsonb_object_keys(p_payload) k where k not in
       ('transaction_type','amount','currency','account_id','category_id','description','transaction_at'))
     or p_payload->>'transaction_type' is distinct from 'expense' then
    raise exception 'invalid_expense_edit_fields' using errcode='22023';
  end if;
  if nullif(btrim(p_payload->>'transaction_at'),'') is null then
    raise exception 'invalid_action_transaction_at' using errcode='22023';
  end if;
  if jsonb_typeof(p_payload->'description') not in ('string','null')
     or length(p_payload->>'description')>500 then
    raise exception 'action_note_too_long_or_missing' using errcode='22023';
  end if;
  v_contract := private.normalize_sanad_agent_action_v1(
    v_row.thread_id,v_row.action_type,p_payload,v_row.id,v_row.attachment_ids);
  v_payload := jsonb_set(v_contract->'payload','{metadata}',v_row.payload->'metadata');
  v_review := v_contract->'review';
  if not isfinite((v_payload->>'transaction_at')::timestamptz) then
    raise exception 'invalid_action_transaction_at' using errcode='22023';
  end if;
  if v_payload is not distinct from v_row.payload and v_review is not distinct from v_row.review then
    return to_jsonb(v_row);
  end if;
  v_fingerprint := md5(v_row.action_type||'|'||v_row.thread_id::text||'|'||(v_payload-'metadata')::text);
  if exists(select 1 from public.sanad_agent_actions a
    where a.user_id=v_uid and a.id<>v_row.id and a.fingerprint=v_fingerprint
      and a.status in ('review','approved','executing')) then
    raise exception 'identical_active_action_already_exists' using errcode='23505';
  end if;
  begin
    update public.sanad_agent_actions
    set payload=v_payload,review=v_review,fingerprint=v_fingerprint,version=version+1,updated_at=now()
    where id=v_row.id and user_id=v_uid and status='review' and version=p_expected_version
    returning * into v_row;
  exception when unique_violation then
    raise exception 'identical_active_action_already_exists' using errcode='23505';
  end;
  if not found then raise exception 'agent_action_concurrent_edit' using errcode='40001'; end if;
  insert into public.sanad_agent_action_events(action_id,user_id,event_type,data)
  values(v_row.id,v_uid,'edited',jsonb_build_object('version',v_row.version,'variant','expense','source','canonical_edit'));
  update public.sanad_work_items
  set title=coalesce(nullif(v_review->>'title',''),'إجراء ينتظر اعتمادك'),
      summary=coalesce(nullif(v_review->>'summary',''),'راجع تفاصيل الإجراء قبل اعتماده.'),updated_at=now()
  where recipient_user_id=v_uid and source_type='sanad_agent_action' and source_id=v_row.id::text
    and dedupe_key='agent_action_review:'||v_row.id::text and status in ('open','in_progress');
  return to_jsonb(v_row);
end;
$$;
revoke all on function public.update_my_sanad_agent_action_draft_v2(uuid,integer,jsonb) from public,anon;
grant execute on function public.update_my_sanad_agent_action_draft_v2(uuid,integer,jsonb) to authenticated;

-- Reject NULL versions before the existing approval/cancellation lifecycle.
create or replace function public.approve_my_sanad_agent_action_v1(
  p_action_id uuid,
  p_expected_version integer
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.sanad_agent_actions%rowtype;
  v_result jsonb;
  v_error text;
begin
  if v_uid is null then raise exception 'authentication_required' using errcode='42501'; end if;
  if p_expected_version is null or p_expected_version<1 then
    raise exception 'valid_expected_version_required' using errcode='22023';
  end if;

  select * into v_row
  from public.sanad_agent_actions
  where id=p_action_id and user_id=v_uid
  for update;

  if not found then raise exception 'agent_action_not_found' using errcode='P0002'; end if;
  if v_row.status='completed' then return to_jsonb(v_row); end if;
  if v_row.status<>'review' then raise exception 'agent_action_not_approvable' using errcode='22023'; end if;
  if v_row.version<>p_expected_version then raise exception 'agent_action_version_conflict' using errcode='40001'; end if;

  update public.sanad_agent_actions
  set status='approved',approved_at=now(),updated_at=now(),version=version+1
  where id=v_row.id
  returning * into v_row;

  insert into public.sanad_agent_action_events(action_id,user_id,event_type,data)
  values(v_row.id,v_uid,'approved',jsonb_build_object('source','ui_explicit','version',v_row.version));

  update public.sanad_agent_actions
  set status='executing',updated_at=now()
  where id=v_row.id;

  insert into public.sanad_agent_action_events(action_id,user_id,event_type,data)
  values(v_row.id,v_uid,'executing','{}'::jsonb);

  begin
    if v_row.action_type='personal_transaction' then
      v_result := public.create_personal_finance_transaction_v1(v_row.payload);
    elsif v_row.action_type='commercial_document_draft' then
      v_result := public.create_business_commercial_draft_v1(v_row.payload);
    else
      raise exception 'unsupported_agent_action_execution';
    end if;

    update public.sanad_agent_actions
    set status='completed',result=v_result,error_code=null,executed_at=now(),updated_at=now(),version=version+1
    where id=v_row.id
    returning * into v_row;

    insert into public.sanad_agent_action_events(action_id,user_id,event_type,data)
    values(v_row.id,v_uid,'completed',jsonb_build_object('result',v_result));
  exception when others then
    get stacked diagnostics v_error=message_text;
    update public.sanad_agent_actions
    set status='failed',error_code=left(coalesce(v_error,'action_execution_failed'),600),updated_at=now(),version=version+1
    where id=v_row.id
    returning * into v_row;

    insert into public.sanad_agent_action_events(action_id,user_id,event_type,data)
    values(v_row.id,v_uid,'failed',jsonb_build_object('error',left(coalesce(v_error,'action_execution_failed'),600)));
  end;

  return to_jsonb(v_row);
end;
$$;
create or replace function public.cancel_my_sanad_agent_action_v1(
  p_action_id uuid,
  p_expected_version integer
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.sanad_agent_actions%rowtype;
begin
  if v_uid is null then raise exception 'authentication_required' using errcode='42501'; end if;
  if p_expected_version is null or p_expected_version<1 then
    raise exception 'valid_expected_version_required' using errcode='22023';
  end if;
  select * into v_row
  from public.sanad_agent_actions
  where id=p_action_id and user_id=v_uid
  for update;
  if not found then raise exception 'agent_action_not_found' using errcode='P0002'; end if;
  if v_row.status='cancelled' then return to_jsonb(v_row); end if;
  if v_row.status<>'review' then raise exception 'agent_action_not_cancellable' using errcode='22023'; end if;
  if v_row.version<>p_expected_version then raise exception 'agent_action_version_conflict' using errcode='40001'; end if;

  update public.sanad_agent_actions
  set status='cancelled',cancelled_at=now(),updated_at=now(),version=version+1
  where id=v_row.id
  returning * into v_row;

  insert into public.sanad_agent_action_events(action_id,user_id,event_type,data)
  values(v_row.id,v_uid,'cancelled',jsonb_build_object('source','ui_explicit'));

  return to_jsonb(v_row);
end;
$$;

commit;

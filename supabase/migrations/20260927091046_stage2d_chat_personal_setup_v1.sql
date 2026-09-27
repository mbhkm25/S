-- Requires pending #413 normalizer and #417 capability migration, in timestamp order.
-- Reuses canonical actions, review cards, explicit versioned approval and domain commands.
begin;
alter table public.sanad_agent_actions drop constraint sanad_agent_actions_action_type_check;
alter table public.sanad_agent_actions add constraint sanad_agent_actions_action_type_check
 check(action_type in ('personal_transaction','commercial_document_draft','personal_account_setup','personal_category_setup'));
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

  if v_action_type not in ('personal_transaction','commercial_document_draft','personal_account_setup','personal_category_setup') then
    raise exception 'agent_action_type_not_allowed' using errcode='22023';
  end if;

  if jsonb_typeof(v_payload) is distinct from 'object' or p_action_id is null then
    raise exception 'invalid_action_payload' using errcode='22023';
  end if;
  if (v_action_type in ('personal_transaction','personal_account_setup','personal_category_setup') and
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

  if v_action_type in ('personal_account_setup','personal_category_setup') then
    if exists(select 1 from jsonb_object_keys(v_payload) k where k not in ('name','currency','kind'))
       or (v_action_type='personal_account_setup' and v_payload ? 'kind')
       or (v_action_type='personal_category_setup' and v_payload ? 'currency') then
      raise exception 'setup_payload_field_not_allowed' using errcode='22023';
    end if;
    if jsonb_typeof(v_payload->'name') is distinct from 'string' then
      raise exception 'setup_name_required' using errcode='22023';
    end if;
    v_description := btrim(regexp_replace(v_payload->>'name','[[:space:]]+',' ','g'));
    if length(v_description)<1 or length(v_description)>(case when v_action_type='personal_account_setup' then 120 else 80 end) then
      raise exception 'invalid_setup_name' using errcode='22023';
    end if;
    if v_action_type='personal_account_setup' then
      v_currency := upper(btrim(coalesce(v_payload->>'currency','')));
      if jsonb_typeof(v_payload->'currency') is distinct from 'string' or v_currency !~ '^[A-Z]{3}$' then
        raise exception 'invalid_action_currency' using errcode='22023';
      end if;
      v_normalized := jsonb_build_object('name',v_description,'currency',v_currency);
      v_review := jsonb_build_object(
        'title','مراجعة إضافة حساب شخصي','summary',v_description,
        'fields',jsonb_build_array(
          jsonb_build_object('label','اسم الحساب','value',v_description),
          jsonb_build_object('label','العملة','value',v_currency),
          jsonb_build_object('label','نوع الحساب','value','حساب أصول شخصي'),
          jsonb_build_object('label','الرصيد الافتتاحي','value','0')),
        'approval_effect','سيُضاف الحساب إلى سند برصيد افتتاحي صفر. لن تُسجّل حركة مالية أو يُنفّذ المصروف. بعد الاعتماد اكتب: تابع المصروف.',
        'writes_to_erp',false);
    else
      v_type := lower(btrim(coalesce(v_payload->>'kind','')));
      if jsonb_typeof(v_payload->'kind') is distinct from 'string' or v_type not in ('income','expense') then
        raise exception 'invalid_setup_category_kind' using errcode='22023';
      end if;
      v_normalized := jsonb_build_object('name',v_description,'kind',v_type);
      v_review := jsonb_build_object(
        'title','مراجعة إضافة تصنيف شخصي','summary',v_description,
        'fields',jsonb_build_array(
          jsonb_build_object('label','اسم التصنيف','value',v_description),
          jsonb_build_object('label','النوع','value',case v_type when 'expense' then 'مصروف' else 'دخل' end)),
        'approval_effect','سيُضاف التصنيف إلى سند فقط. لن تُسجّل حركة مالية. بعد الاعتماد يمكنك متابعة تجهيز المسودة.',
        'writes_to_erp',false);
    end if;
  elsif v_action_type='personal_transaction' then
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

create or replace function private.sanad_agent_action_origin_guard_v1()
returns trigger
language plpgsql security definer set search_path=''
as $guard$
declare
  v_thread public.sanad_agent_threads%rowtype;
begin
  if tg_op = 'UPDATE' then
    if (new.user_id,new.thread_id,new.business_id,new.action_type)
       is distinct from
       (old.user_id,old.thread_id,old.business_id,old.action_type) then
      raise exception 'agent_action_origin_immutable' using errcode='42501';
    end if;
    return new;
  end if;

  select * into v_thread
  from public.sanad_agent_threads
  where id=new.thread_id and user_id=new.user_id and status='active';

  if not found then
    raise exception 'agent_action_thread_invalid' using errcode='42501';
  end if;

  if new.action_type in ('personal_transaction','personal_account_setup','personal_category_setup') then
    if v_thread.project_kind is distinct from 'personal' or
       v_thread.business_id is not null or
       new.business_id is not null then
      raise exception 'agent_action_personal_project_required' using errcode='42501';
    end if;
  elsif new.action_type='commercial_document_draft' then
    if v_thread.project_kind<>'business' or
       v_thread.business_id is null or
       new.business_id is distinct from v_thread.business_id then
      raise exception 'agent_action_business_project_mismatch' using errcode='42501';
    end if;
  else
    raise exception 'agent_action_type_not_allowed' using errcode='22023';
  end if;
  return new;
end;
$guard$;

revoke all on function private.sanad_agent_action_origin_guard_v1()
  from public,anon,authenticated;

-- Private, finite setup dispatcher. No model-supplied metadata, opening balance,
-- account links, parent categories or arbitrary command dispatch can reach it.
create or replace function private.execute_sanad_personal_setup_v1(p_type text,p_payload jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'authentication_required' using errcode='42501'; end if;
  -- Serialize this actor's conversational setup approvals across different threads.
  perform pg_advisory_xact_lock(hashtextextended('sanad_personal_setup:'||v_uid::text,0));
  if p_type='personal_account_setup' then
    if exists(select 1 from public.personal_finance_accounts a where a.user_id=v_uid
      and lower(btrim(regexp_replace(a.name,'[[:space:]]+',' ','g')))=lower(p_payload->>'name')
      and a.currency=p_payload->>'currency') then
      raise exception 'personal_setup_account_already_exists' using errcode='23505';
    end if;
    return public.create_personal_finance_account_v1(jsonb_build_object(
      'name',p_payload->>'name','currency',p_payload->>'currency','account_type','asset','opening_balance',0));
  elsif p_type='personal_category_setup' then
    if exists(select 1 from public.personal_finance_categories c where c.user_id=v_uid
      and lower(btrim(regexp_replace(c.name,'[[:space:]]+',' ','g')))=lower(p_payload->>'name')
      and c.kind=p_payload->>'kind') then
      raise exception 'personal_setup_category_already_exists' using errcode='23505';
    end if;
    return public.create_personal_finance_category_v1(jsonb_build_object('name',p_payload->>'name','kind',p_payload->>'kind'));
  end if;
  raise exception 'unsupported_personal_setup_action' using errcode='22023';
end;
$$;
revoke all on function private.execute_sanad_personal_setup_v1(text,jsonb) from public,anon,authenticated;
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
    if v_row.action_type in ('personal_account_setup','personal_category_setup') then
      -- Re-check active owned personal origin and the exact finite payload at approval.
      perform private.normalize_sanad_agent_action_v1(v_row.thread_id,v_row.action_type,
        v_row.payload,v_row.id,v_row.attachment_ids);
      v_result := private.execute_sanad_personal_setup_v1(v_row.action_type,v_row.payload);
    elsif v_row.action_type='personal_transaction' then
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
create or replace function public.get_my_sanad_action_capabilities_v1(
  p_thread_id uuid
)
returns jsonb
language plpgsql stable security definer set search_path=''
as $function$
declare
 v_uid uuid := auth.uid();
 v_thread public.sanad_agent_threads%rowtype;
 v_common jsonb;
 v_editor regprocedure := to_regprocedure('public.update_my_sanad_agent_action_draft_v2(uuid,integer,jsonb)');
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
 v_common := jsonb_build_object(
   'schema_version',1,
   'source','server_authorized',
   'thread_id',v_thread.id,
   'project_kind',v_thread.project_kind,
   'business_id',v_thread.business_id,
   'create_rpc','create_my_sanad_agent_action_draft_v1',
   'review_rpc','get_my_sanad_agent_action_v1',
   'approve_rpc','approve_my_sanad_agent_action_v1',
   'cancel_rpc','cancel_my_sanad_agent_action_v1',
   'approval_requires_expected_version',true,
   'form_edit_supported',false,
   'erp_write_supported',false
 );
 if v_thread.project_kind='personal' and v_thread.business_id is null then
   return v_common || jsonb_build_object('actions',jsonb_build_array(
     jsonb_build_object('id','personal_account_setup','action_type','personal_account_setup',
       'risk','approval_required','required_fields',jsonb_build_array('name','currency'),
       'optional_fields','[]'::jsonb,'form_edit_supported',false,
       'approval_effect','creates_personal_asset_account_zero_opening_balance'),
     jsonb_build_object('id','personal_category_setup','action_type','personal_category_setup',
       'risk','approval_required','required_fields',jsonb_build_array('name','kind'),
       'supported_variants',jsonb_build_array('income','expense'),
       'optional_fields','[]'::jsonb,'form_edit_supported',false,
       'approval_effect','creates_personal_category_only'),
     jsonb_build_object(
       'id','personal_income','action_type','personal_transaction','variant','income',
       'risk','approval_required',
       'required_fields',jsonb_build_array('transaction_type','amount','currency','account_id'),
       'optional_fields',jsonb_build_array('category_id','description','transaction_at'),
       'account_lookup','personal_owner_active_account_same_currency',
       'approval_effect','creates_personal_finance_transaction'),
     jsonb_build_object(
       'id','personal_expense','action_type','personal_transaction','variant','expense',
       'form_edit_supported',v_editor is not null and has_function_privilege('authenticated',v_editor,'EXECUTE'),
       'edit_rpc','update_my_sanad_agent_action_draft_v2',
       'editable_fields',jsonb_build_array('amount','currency','account_id','category_id','description','transaction_at'),
       'risk','approval_required',
       'required_fields',jsonb_build_array('transaction_type','amount','currency','account_id'),
       'optional_fields',jsonb_build_array('category_id','description','transaction_at'),
       'account_lookup','personal_owner_active_account_same_currency',
       'approval_effect','creates_personal_finance_transaction'),
     jsonb_build_object(
       'id','personal_transfer','action_type','personal_transaction','variant','transfer',
       'risk','approval_required',
       'required_fields',jsonb_build_array('transaction_type','amount','source_account_id','destination_account_id'),
       'optional_fields',jsonb_build_array('description','transaction_at'),
       'account_lookup','personal_owner_active_accounts_same_currency',
       'approval_effect','creates_personal_finance_transaction')
   ));
 elsif v_thread.project_kind='business' and v_thread.business_id is not null
   and private.user_is_business_owner(v_thread.business_id,v_uid) then
   return v_common || jsonb_build_object('actions',jsonb_build_array(
     jsonb_build_object(
       'id','commercial_document','action_type','commercial_document_draft',
       'risk','approval_required',
       'supported_variants',jsonb_build_array(
         'quotation','sales_invoice','purchase_invoice',
         'receipt','payment','expense'),
       'required_fields',jsonb_build_array('business_id','document_type','currency','description_or_lines'),
       'optional_fields',jsonb_build_array(
         'party_id','document_number','document_date','due_date','notes'),
       'party_lookup','same_business_authorized_party',
       'approval_effect','creates_sanad_document_draft_only')
   ));
 end if;
 -- Unclassified, improperly bound, and non-owner business threads cannot
 -- obtain actionable descriptors. The underlying RPCs enforce authority again.
 return v_common || jsonb_build_object('actions','[]'::jsonb);
end;
$function$;
revoke all on function public.get_my_sanad_action_capabilities_v1(uuid)
 from public,anon;
grant execute on function public.get_my_sanad_action_capabilities_v1(uuid)
 to authenticated;
comment on function public.get_my_sanad_action_capabilities_v1(uuid) is
 'Stage 2D.1: conservative server-owned capability descriptions; canonical action RPCs retain all validation, ownership, draft version and execution authority.';

commit;

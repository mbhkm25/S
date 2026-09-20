-- SANAD Agent Action Integration v1
-- Intent -> Draft -> Review -> Explicit approval -> Deterministic command.
-- The model can prepare action drafts only. Domain mutations are reachable only
-- through explicit authenticated approval RPCs. No ERP/Edaa write is introduced.

create table if not exists public.sanad_agent_actions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  thread_id uuid not null references public.sanad_agent_threads(id) on delete cascade,
  business_id uuid null references public.business_profiles(id) on delete cascade,
  action_type text not null check (action_type in ('personal_transaction','commercial_document_draft')),
  status text not null default 'review'
    check (status in ('review','approved','executing','completed','cancelled','failed')),
  payload jsonb not null,
  review jsonb not null,
  attachment_ids uuid[] not null default '{}'::uuid[],
  request_id uuid null,
  tool_call_id text null,
  fingerprint text not null,
  version integer not null default 1 check (version > 0),
  result jsonb null,
  error_code text null,
  approved_at timestamptz null,
  executed_at timestamptz null,
  cancelled_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists sanad_agent_actions_active_fingerprint_uq
  on public.sanad_agent_actions(user_id,fingerprint)
  where status in ('review','approved','executing');

create index if not exists sanad_agent_actions_thread_idx
  on public.sanad_agent_actions(user_id,thread_id,created_at desc);

create index if not exists sanad_agent_actions_status_idx
  on public.sanad_agent_actions(user_id,status,updated_at desc);

create table if not exists public.sanad_agent_action_events (
  id bigserial primary key,
  action_id uuid not null references public.sanad_agent_actions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null check (event_type in ('created','approved','executing','completed','cancelled','failed')),
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists sanad_agent_action_events_action_idx
  on public.sanad_agent_action_events(action_id,created_at,id);

alter table public.sanad_agent_actions enable row level security;
alter table public.sanad_agent_action_events enable row level security;

drop policy if exists sanad_agent_actions_select_own on public.sanad_agent_actions;
create policy sanad_agent_actions_select_own
on public.sanad_agent_actions for select to authenticated
using ((select auth.uid())=user_id);

drop policy if exists sanad_agent_action_events_select_own on public.sanad_agent_action_events;
create policy sanad_agent_action_events_select_own
on public.sanad_agent_action_events for select to authenticated
using ((select auth.uid())=user_id);

revoke all on table public.sanad_agent_actions from public,anon,authenticated;
revoke all on table public.sanad_agent_action_events from public,anon,authenticated;
grant select on table public.sanad_agent_actions to authenticated;
grant select on table public.sanad_agent_action_events to authenticated;
grant select,insert,update,delete on table public.sanad_agent_actions to service_role;
grant select,insert,update,delete on table public.sanad_agent_action_events to service_role;

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
  v_action_id uuid := gen_random_uuid();
  v_fingerprint text;
  v_existing public.sanad_agent_actions%rowtype;
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
  );

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

create or replace function public.get_my_sanad_agent_action_v1(p_action_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
stable
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.sanad_agent_actions%rowtype;
begin
  if v_uid is null then raise exception 'authentication_required' using errcode='42501'; end if;
  select * into v_row from public.sanad_agent_actions where id=p_action_id and user_id=v_uid;
  if not found then raise exception 'agent_action_not_found' using errcode='P0002'; end if;
  return to_jsonb(v_row);
end;
$$;

create or replace function public.list_my_sanad_agent_actions_v1(
  p_thread_id uuid,
  p_status text default null,
  p_limit integer default 50
)
returns jsonb
language plpgsql
security definer
set search_path=''
stable
as $$
declare
  v_uid uuid := auth.uid();
  v_limit integer := greatest(1,least(coalesce(p_limit,50),100));
begin
  if v_uid is null then raise exception 'authentication_required' using errcode='42501'; end if;
  if not exists(select 1 from public.sanad_agent_threads t where t.id=p_thread_id and t.user_id=v_uid) then
    raise exception 'agent_thread_not_found' using errcode='P0002';
  end if;
  return coalesce((
    select jsonb_agg(to_jsonb(a) order by a.created_at desc,a.id)
    from (
      select *
      from public.sanad_agent_actions
      where user_id=v_uid and thread_id=p_thread_id
        and (p_status is null or status=p_status)
      order by created_at desc
      limit v_limit
    ) a
  ),'[]'::jsonb);
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

revoke all on function public.create_my_sanad_agent_action_draft_v1(uuid,text,jsonb,uuid,text,uuid[]) from public,anon;
revoke all on function public.get_my_sanad_agent_action_v1(uuid) from public,anon;
revoke all on function public.list_my_sanad_agent_actions_v1(uuid,text,integer) from public,anon;
revoke all on function public.cancel_my_sanad_agent_action_v1(uuid,integer) from public,anon;
revoke all on function public.approve_my_sanad_agent_action_v1(uuid,integer) from public,anon;

grant execute on function public.create_my_sanad_agent_action_draft_v1(uuid,text,jsonb,uuid,text,uuid[]) to authenticated;
grant execute on function public.get_my_sanad_agent_action_v1(uuid) to authenticated;
grant execute on function public.list_my_sanad_agent_actions_v1(uuid,text,integer) to authenticated;
grant execute on function public.cancel_my_sanad_agent_action_v1(uuid,integer) to authenticated;
grant execute on function public.approve_my_sanad_agent_action_v1(uuid,integer) to authenticated;

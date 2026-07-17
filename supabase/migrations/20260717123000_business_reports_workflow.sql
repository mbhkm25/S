-- Reconciles the production business reports workflow with source control.
-- The migration is intentionally idempotent so it can be applied to restored environments.

alter table public.report_requests
  add column if not exists report_context text not null default 'personal',
  add column if not exists business_id uuid,
  add column if not exists report_title text,
  add column if not exists processing_stage text,
  add column if not exists attempt_count integer not null default 0,
  add column if not exists processing_started_at timestamptz,
  add column if not exists last_attempt_at timestamptz,
  add column if not exists whatsapp_message_id text,
  add column if not exists result_metrics jsonb not null default '{}'::jsonb;

alter table public.report_requests
  drop constraint if exists report_requests_report_context_check,
  add constraint report_requests_report_context_check
    check (report_context in ('personal', 'business'));

alter table public.report_requests
  drop constraint if exists report_requests_status_check,
  add constraint report_requests_status_check
    check (status in ('queued', 'processing', 'ready', 'sent', 'failed', 'cancelled'));

alter table public.report_requests
  drop constraint if exists report_requests_business_id_fkey,
  add constraint report_requests_business_id_fkey
    foreign key (business_id) references public.business_profiles(id) on delete cascade;

create index if not exists idx_report_requests_business_requested_at
  on public.report_requests (business_id, requested_at desc)
  where report_context = 'business';

create index if not exists idx_report_requests_processing_started
  on public.report_requests (processing_started_at)
  where status = 'processing';

create index if not exists idx_report_requests_queue
  on public.report_requests (status, requested_at)
  where status = 'queued';

create or replace function public.create_business_report_request(
  p_business_id uuid,
  p_date_from timestamptz default null,
  p_date_to timestamptz default null,
  p_filters jsonb default '{}'::jsonb,
  p_destination_phone text default null
)
returns table(report_request_id uuid, status text, message text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_owner_phone text;
  v_business_phone text;
  v_destination text;
  v_filters jsonb := coalesce(p_filters, '{}'::jsonb);
  v_currency text;
  v_operation_status text;
  v_team_member_text text;
  v_team_member uuid;
  v_financial_entity text;
  v_title text;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if p_business_id is null then raise exception 'business_id_required'; end if;

  select p.phone, bp.whatsapp, bp.name
    into v_owner_phone, v_business_phone, v_title
  from public.business_profiles bp
  left join public.profiles p on p.id = bp.owner_user_id
  where bp.id = p_business_id
    and (bp.owner_user_id = v_uid or public.is_platform_admin(v_uid));

  if not found then raise exception 'business_owner_required'; end if;
  if p_date_from is not null and p_date_to is not null and p_date_from >= p_date_to then raise exception 'invalid_date_range'; end if;
  if p_date_from is not null and p_date_to is not null and p_date_to - p_date_from > interval '366 days' then raise exception 'date_range_too_large'; end if;
  if octet_length(v_filters::text) > 8192 then raise exception 'filters_too_large'; end if;

  if exists (
    select 1 from jsonb_object_keys(v_filters) k
    where k not in (
      'currency','status','team_member_user_id','financial_entity',
      'include_details','include_team_performance','include_status_distribution',
      'include_currency_distribution','include_entity_distribution'
    )
  ) then raise exception 'unsupported_report_filter'; end if;

  v_currency := upper(nullif(btrim(v_filters->>'currency'), ''));
  if v_currency is not null and v_currency not in ('ALL','YER','SAR','USD') then raise exception 'invalid_currency_filter'; end if;

  v_operation_status := lower(nullif(btrim(v_filters->>'status'), ''));
  if v_operation_status is not null and v_operation_status not in ('all','verified','ready','stored','received','matched','failed') then
    raise exception 'invalid_status_filter';
  end if;

  v_financial_entity := nullif(btrim(v_filters->>'financial_entity'), '');
  if v_financial_entity is not null and length(v_financial_entity) > 120 then raise exception 'invalid_financial_entity_filter'; end if;

  v_team_member_text := nullif(btrim(v_filters->>'team_member_user_id'), '');
  if v_team_member_text is not null then
    begin
      v_team_member := v_team_member_text::uuid;
    exception when invalid_text_representation then
      raise exception 'invalid_team_member_filter';
    end;

    if not exists (
      select 1 from public.business_team_members tm
      where tm.business_id = p_business_id
        and tm.user_id = v_team_member
        and tm.status = 'active'
    ) then raise exception 'team_member_not_in_business'; end if;
  end if;

  v_destination := nullif(regexp_replace(coalesce(p_destination_phone, ''), '[^0-9]', '', 'g'), '');
  if v_destination is null then
    v_destination := nullif(regexp_replace(coalesce(v_owner_phone, v_business_phone, ''), '[^0-9]', '', 'g'), '');
  end if;
  if v_destination is null then raise exception 'missing_destination_phone'; end if;

  if length(v_destination) = 9 then
    v_destination := '967' || v_destination;
  elsif left(v_destination, 5) = '00967' then
    v_destination := substring(v_destination from 3);
  elsif left(v_destination, 4) = '0967' then
    v_destination := substring(v_destination from 2);
  end if;

  if v_destination !~ '^967[0-9]{9}$' then raise exception 'invalid_destination_phone'; end if;

  if exists (
    select 1 from public.report_requests rr
    where rr.requested_by_user_id = v_uid
      and rr.report_context = 'business'
      and rr.business_id = p_business_id
      and rr.status in ('queued','processing')
      and rr.requested_at > now() - interval '90 seconds'
      and rr.date_from is not distinct from p_date_from
      and rr.date_to is not distinct from p_date_to
      and rr.filters = v_filters
  ) then raise exception 'duplicate_report_request'; end if;

  insert into public.report_requests (
    requested_by_user_id, requested_by_phone, report_context, business_id,
    report_title, report_scope, date_from, date_to, filters, delivery_channel,
    destination_phone, status, processing_stage
  ) values (
    v_uid, v_owner_phone, 'business', p_business_id,
    'تقرير عمليات ' || v_title, 'all', p_date_from, p_date_to, v_filters,
    'whatsapp', v_destination, 'queued', 'queued'
  )
  returning id, report_requests.status into report_request_id, status;

  message := 'تم استلام طلب التقرير. سيُجهّز ويُرسل إلى واتساب.';
  return next;
end;
$$;

create or replace function public.claim_report_request(p_report_request_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.report_requests%rowtype;
begin
  with candidate as (
    select rr.id
    from public.report_requests rr
    where rr.status = 'queued'
      and (p_report_request_id is null or rr.id = p_report_request_id)
      and rr.attempt_count < 5
    order by rr.requested_at asc
    for update skip locked
    limit 1
  )
  update public.report_requests rr
  set status = 'processing',
      processing_stage = 'claimed',
      processing_started_at = now(),
      last_attempt_at = now(),
      attempt_count = rr.attempt_count + 1,
      processed_at = now(),
      error_message = null,
      updated_at = now()
  from candidate c
  where rr.id = c.id
  returning rr.* into v_row;

  if not found then return null; end if;
  return to_jsonb(v_row);
end;
$$;

create or replace function public.requeue_stale_report_requests()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  update public.report_requests rr
  set status = case when rr.attempt_count >= 5 then 'failed' else 'queued' end,
      processing_stage = case when rr.attempt_count >= 5 then 'failed' else 'requeued_after_timeout' end,
      error_message = case when rr.attempt_count >= 5 then 'maximum_processing_attempts_reached' else rr.error_message end,
      processing_started_at = null,
      updated_at = now()
  where rr.status = 'processing'
    and rr.processing_started_at < now() - interval '20 minutes';

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.get_report_payload(p_report_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_report public.report_requests%rowtype;
  v_payload jsonb;
  v_currency text;
  v_status text;
  v_team_member uuid;
  v_entity text;
  v_operations jsonb;
  v_business jsonb;
  v_currency_distribution jsonb;
  v_status_distribution jsonb;
  v_entity_distribution jsonb;
  v_team_performance jsonb;
  v_total_count bigint;
  v_returned_count bigint;
begin
  select * into v_report from public.report_requests where id = p_report_request_id;
  if not found then raise exception 'report_request_not_found'; end if;

  v_currency := upper(nullif(btrim(v_report.filters->>'currency'), ''));
  v_status := lower(nullif(btrim(v_report.filters->>'status'), ''));
  v_entity := nullif(btrim(v_report.filters->>'financial_entity'), '');
  begin
    v_team_member := nullif(btrim(v_report.filters->>'team_member_user_id'), '')::uuid;
  exception when invalid_text_representation then
    v_team_member := null;
  end;

  if v_report.report_context = 'personal' then
    with filtered as (
      select distinct on (o.id)
        o.id, o.public_token, l.relation_type, o.summary, o.amount, o.currency,
        o.financial_entity, o.reference_number, o.transaction_type,
        o.transaction_datetime, o.created_at, o.verified_at, o.status, o.ai_status,
        o.verified_by_user_id, vp.full_name as verified_by_name
      from public.operation_user_links l
      join public.operations o on o.id = l.operation_id
      left join public.profiles vp on vp.id = o.verified_by_user_id
      where l.user_id = v_report.requested_by_user_id
        and (
          v_report.report_scope = 'all'
          or (v_report.report_scope = 'sent' and l.relation_type = 'uploader')
          or (v_report.report_scope = 'verified' and l.relation_type = 'verifier')
        )
        and (v_report.date_from is null or o.created_at >= v_report.date_from)
        and (v_report.date_to is null or o.created_at < v_report.date_to)
        and (v_currency is null or v_currency = 'ALL' or upper(coalesce(o.currency,'')) = v_currency)
        and (v_status is null or v_status = 'all' or lower(o.status) = v_status)
        and (v_entity is null or o.financial_entity = v_entity)
      order by o.id, o.created_at desc
    ), numbered as (
      select *, count(*) over() as full_count from filtered order by created_at desc limit 1000
    )
    select coalesce(jsonb_agg(to_jsonb(numbered) - 'full_count' order by created_at desc), '[]'::jsonb),
           coalesce(max(full_count),0), count(*)
      into v_operations, v_total_count, v_returned_count
    from numbered;
    v_business := null;
  else
    select jsonb_build_object('id',bp.id,'name',bp.name,'slug',bp.slug,'governorate',bp.governorate,'city',bp.city)
      into v_business
    from public.business_profiles bp where bp.id = v_report.business_id;

    with filtered as (
      select o.id, o.public_token, o.summary, o.amount, o.currency,
             o.financial_entity, o.reference_number, o.transaction_type,
             o.transaction_datetime, o.created_at, o.verified_at, o.status, o.ai_status,
             bol.linked_by_user_id, linked.full_name as linked_by_name,
             coalesce(bol.verified_by_user_id, o.verified_by_user_id) as verified_by_user_id,
             verifier.full_name as verified_by_name
      from public.business_operation_links bol
      join public.operations o on o.id = bol.operation_id
      left join public.profiles linked on linked.id = bol.linked_by_user_id
      left join public.profiles verifier on verifier.id = coalesce(bol.verified_by_user_id, o.verified_by_user_id)
      where bol.business_id = v_report.business_id
        and bol.status = 'linked'
        and (v_report.date_from is null or o.created_at >= v_report.date_from)
        and (v_report.date_to is null or o.created_at < v_report.date_to)
        and (v_currency is null or v_currency = 'ALL' or upper(coalesce(o.currency,'')) = v_currency)
        and (v_status is null or v_status = 'all' or lower(o.status) = v_status)
        and (v_entity is null or o.financial_entity = v_entity)
        and (v_team_member is null or coalesce(bol.verified_by_user_id, o.verified_by_user_id, bol.linked_by_user_id) = v_team_member)
    ), numbered as (
      select *, count(*) over() as full_count from filtered order by created_at desc limit 1000
    )
    select coalesce(jsonb_agg(to_jsonb(numbered) - 'full_count' order by created_at desc), '[]'::jsonb),
           coalesce(max(full_count),0), count(*)
      into v_operations, v_total_count, v_returned_count
    from numbered;

    with base as (
      select o.currency
      from public.business_operation_links bol join public.operations o on o.id=bol.operation_id
      where bol.business_id=v_report.business_id and bol.status='linked'
        and (v_report.date_from is null or o.created_at >= v_report.date_from)
        and (v_report.date_to is null or o.created_at < v_report.date_to)
        and (v_status is null or v_status='all' or lower(o.status)=v_status)
        and (v_entity is null or o.financial_entity=v_entity)
        and (v_team_member is null or coalesce(bol.verified_by_user_id,o.verified_by_user_id,bol.linked_by_user_id)=v_team_member)
    )
    select coalesce(jsonb_agg(jsonb_build_object('currency',currency,'operations_count',operations_count) order by currency),'[]'::jsonb)
      into v_currency_distribution
    from (select coalesce(nullif(currency,''),'UNKNOWN') currency,count(*) operations_count from base group by 1) d;

    with base as (
      select o.status
      from public.business_operation_links bol join public.operations o on o.id=bol.operation_id
      where bol.business_id=v_report.business_id and bol.status='linked'
        and (v_report.date_from is null or o.created_at >= v_report.date_from)
        and (v_report.date_to is null or o.created_at < v_report.date_to)
        and (v_currency is null or v_currency='ALL' or upper(coalesce(o.currency,''))=v_currency)
        and (v_entity is null or o.financial_entity=v_entity)
        and (v_team_member is null or coalesce(bol.verified_by_user_id,o.verified_by_user_id,bol.linked_by_user_id)=v_team_member)
    )
    select coalesce(jsonb_agg(jsonb_build_object('status',status,'operations_count',operations_count) order by status),'[]'::jsonb)
      into v_status_distribution
    from (select status,count(*) operations_count from base group by status) d;

    with base as (
      select o.financial_entity
      from public.business_operation_links bol join public.operations o on o.id=bol.operation_id
      where bol.business_id=v_report.business_id and bol.status='linked'
        and (v_report.date_from is null or o.created_at >= v_report.date_from)
        and (v_report.date_to is null or o.created_at < v_report.date_to)
        and (v_currency is null or v_currency='ALL' or upper(coalesce(o.currency,''))=v_currency)
        and (v_status is null or v_status='all' or lower(o.status)=v_status)
        and (v_team_member is null or coalesce(bol.verified_by_user_id,o.verified_by_user_id,bol.linked_by_user_id)=v_team_member)
    )
    select coalesce(jsonb_agg(jsonb_build_object('financial_entity',financial_entity,'operations_count',operations_count) order by operations_count desc),'[]'::jsonb)
      into v_entity_distribution
    from (select coalesce(nullif(financial_entity,''),'غير محددة') financial_entity,count(*) operations_count from base group by 1) d;

    with base as (
      select coalesce(bol.verified_by_user_id,o.verified_by_user_id,bol.linked_by_user_id) user_id,
             o.status, o.verified_at, o.created_at
      from public.business_operation_links bol join public.operations o on o.id=bol.operation_id
      where bol.business_id=v_report.business_id and bol.status='linked'
        and (v_report.date_from is null or o.created_at >= v_report.date_from)
        and (v_report.date_to is null or o.created_at < v_report.date_to)
        and (v_currency is null or v_currency='ALL' or upper(coalesce(o.currency,''))=v_currency)
        and (v_status is null or v_status='all' or lower(o.status)=v_status)
        and (v_entity is null or o.financial_entity=v_entity)
    )
    select coalesce(jsonb_agg(jsonb_build_object(
      'user_id',x.user_id,'full_name',p.full_name,'operations_count',x.operations_count,
      'verified_count',x.verified_count,'pending_count',x.pending_count,'last_activity_at',x.last_activity_at
    ) order by x.verified_count desc,x.operations_count desc),'[]'::jsonb)
      into v_team_performance
    from (
      select user_id,count(*) operations_count,
             count(*) filter (where status='verified') verified_count,
             count(*) filter (where status<>'verified') pending_count,
             max(coalesce(verified_at,created_at)) last_activity_at
      from base where user_id is not null group by user_id
    ) x
    left join public.profiles p on p.id=x.user_id;
  end if;

  v_payload := jsonb_build_object(
    'request', to_jsonb(v_report),
    'business', v_business,
    'operations', coalesce(v_operations,'[]'::jsonb),
    'operations_total_count', coalesce(v_total_count,0),
    'operations_returned_count', coalesce(v_returned_count,0),
    'operations_truncated', coalesce(v_total_count,0) > coalesce(v_returned_count,0),
    'currency_distribution', coalesce(v_currency_distribution,'[]'::jsonb),
    'status_distribution', coalesce(v_status_distribution,'[]'::jsonb),
    'entity_distribution', coalesce(v_entity_distribution,'[]'::jsonb),
    'team_performance', coalesce(v_team_performance,'[]'::jsonb)
  );

  return v_payload;
end;
$$;

revoke all on function public.create_business_report_request(uuid,timestamptz,timestamptz,jsonb,text) from public, anon;
grant execute on function public.create_business_report_request(uuid,timestamptz,timestamptz,jsonb,text) to authenticated, service_role;

revoke all on function public.claim_report_request(uuid) from public, anon, authenticated;
revoke all on function public.requeue_stale_report_requests() from public, anon, authenticated;
revoke all on function public.get_report_payload(uuid) from public, anon, authenticated;
grant execute on function public.claim_report_request(uuid) to service_role;
grant execute on function public.requeue_stale_report_requests() to service_role;
grant execute on function public.get_report_payload(uuid) to service_role;

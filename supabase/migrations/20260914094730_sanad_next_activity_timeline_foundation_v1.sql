create table public.business_activity_events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.business_profiles(id) on delete cascade,
  party_id uuid references public.business_parties(id) on delete set null,
  source_kind text not null check (source_kind in ('erp','payment','manual','system')),
  source_instance_id uuid references public.business_erp_source_instances(id) on delete set null,
  raw_event_id uuid references public.business_erp_raw_events(id) on delete restrict,
  operation_id uuid references public.operations(id) on delete set null,
  event_type text not null,
  title text not null,
  summary text,
  amount numeric,
  currency text,
  business_date date,
  occurred_at timestamptz,
  status text not null default 'recorded' check (status in ('recorded','pending_review','confirmed','cancelled','reversed')),
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index business_activity_events_raw_type_idx
  on public.business_activity_events(raw_event_id, event_type)
  where raw_event_id is not null;
create index business_activity_events_business_timeline_idx
  on public.business_activity_events(business_id, coalesce(occurred_at, created_at) desc, id desc);
create index business_activity_events_party_timeline_idx
  on public.business_activity_events(party_id, coalesce(occurred_at, created_at) desc, id desc)
  where party_id is not null;
create index business_activity_events_operation_idx
  on public.business_activity_events(operation_id)
  where operation_id is not null;

create trigger business_activity_events_set_updated_at
before update on public.business_activity_events
for each row execute function public.set_updated_at();

alter table public.business_activity_events enable row level security;

create policy business_activity_events_select_member
on public.business_activity_events for select to authenticated
using (
  private.user_is_business_owner(business_id, (select auth.uid()))
  or private.user_is_active_business_member(business_id, (select auth.uid()))
);

create or replace function public.record_business_activity_from_erp_v1(
  p_raw_event_id uuid,
  p_party_id uuid,
  p_event_type text,
  p_title text,
  p_summary text default null,
  p_amount numeric default null,
  p_currency text default null,
  p_business_date date default null,
  p_occurred_at timestamptz default null,
  p_status text default 'recorded',
  p_data jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_raw public.business_erp_raw_events%rowtype;
  v_event_id uuid;
begin
  if nullif(btrim(p_event_type), '') is null or nullif(btrim(p_title), '') is null then
    raise exception 'invalid_activity_event' using errcode = '22023';
  end if;

  if p_status not in ('recorded','pending_review','confirmed','cancelled','reversed') then
    raise exception 'invalid_activity_status' using errcode = '22023';
  end if;

  select * into v_raw
  from public.business_erp_raw_events
  where id = p_raw_event_id
  limit 1;

  if not found then
    raise exception 'raw_event_not_found' using errcode = '22023';
  end if;

  if p_party_id is not null and not exists (
    select 1 from public.business_parties p
    where p.id = p_party_id and p.business_id = v_raw.business_id
  ) then
    raise exception 'party_business_mismatch' using errcode = '22023';
  end if;

  insert into public.business_activity_events (
    business_id, party_id, source_kind, source_instance_id, raw_event_id,
    event_type, title, summary, amount, currency, business_date, occurred_at, status, data
  ) values (
    v_raw.business_id, p_party_id, 'erp', v_raw.source_instance_id, v_raw.id,
    btrim(p_event_type), btrim(p_title), p_summary, p_amount, nullif(upper(btrim(p_currency)), ''),
    coalesce(p_business_date, v_raw.business_date), p_occurred_at, p_status, coalesce(p_data, '{}'::jsonb)
  )
  on conflict (raw_event_id, event_type) where raw_event_id is not null
  do update set
    party_id = excluded.party_id,
    title = excluded.title,
    summary = excluded.summary,
    amount = excluded.amount,
    currency = excluded.currency,
    business_date = excluded.business_date,
    occurred_at = excluded.occurred_at,
    status = excluded.status,
    data = excluded.data,
    updated_at = now()
  returning id into v_event_id;

  update public.business_erp_raw_events
  set normalization_status = case when p_status = 'pending_review' then 'warning' else 'normalized' end,
      normalized_at = now(),
      normalization_error = null
  where id = p_raw_event_id;

  return v_event_id;
end;
$function$;

revoke all on function public.record_business_activity_from_erp_v1(uuid,uuid,text,text,text,numeric,text,date,timestamptz,text,jsonb) from public;
revoke all on function public.record_business_activity_from_erp_v1(uuid,uuid,text,text,text,numeric,text,date,timestamptz,text,jsonb) from anon;
revoke all on function public.record_business_activity_from_erp_v1(uuid,uuid,text,text,text,numeric,text,date,timestamptz,text,jsonb) from authenticated;
grant execute on function public.record_business_activity_from_erp_v1(uuid,uuid,text,text,text,numeric,text,date,timestamptz,text,jsonb) to service_role;

create or replace function public.get_business_activity_timeline_v1(
  p_business_id uuid,
  p_party_id uuid default null,
  p_limit integer default 50,
  p_before timestamptz default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_items jsonb;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  if not (
    private.user_is_business_owner(p_business_id, v_uid)
    or private.user_is_active_business_member(p_business_id, v_uid)
  ) then
    raise exception 'business_access_denied' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.sort_at desc, x.id desc), '[]'::jsonb)
  into v_items
  from (
    select
      e.id,
      e.party_id,
      p.display_name as party_name,
      e.source_kind,
      e.event_type,
      e.title,
      e.summary,
      e.amount,
      e.currency,
      e.business_date,
      e.occurred_at,
      e.status,
      e.data,
      e.created_at,
      coalesce(e.occurred_at, e.created_at) as sort_at
    from public.business_activity_events e
    left join public.business_parties p on p.id = e.party_id
    where e.business_id = p_business_id
      and (p_party_id is null or e.party_id = p_party_id)
      and (p_before is null or coalesce(e.occurred_at, e.created_at) < p_before)
    order by coalesce(e.occurred_at, e.created_at) desc, e.id desc
    limit greatest(1, least(coalesce(p_limit, 50), 100))
  ) x;

  return jsonb_build_object(
    'items', v_items,
    'contract_version', 1
  );
end;
$function$;

revoke all on function public.get_business_activity_timeline_v1(uuid,uuid,integer,timestamptz) from public;
revoke all on function public.get_business_activity_timeline_v1(uuid,uuid,integer,timestamptz) from anon;
grant execute on function public.get_business_activity_timeline_v1(uuid,uuid,integer,timestamptz) to authenticated;
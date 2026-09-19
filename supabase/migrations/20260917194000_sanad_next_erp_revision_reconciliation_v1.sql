-- SANAD NEXT ERP revision reconciliation v1
-- Preserve immutable ERP revision history while exposing only the latest observed revision in business timelines.

alter table public.business_activity_events
  add column if not exists source_entity_type text,
  add column if not exists source_record_id text,
  add column if not exists source_revision text,
  add column if not exists is_current boolean not null default true,
  add column if not exists superseded_at timestamptz,
  add column if not exists superseded_by_raw_event_id uuid references public.business_erp_raw_events(id) on delete set null;

update public.business_activity_events a
set source_entity_type = r.entity_type,
    source_record_id = r.source_record_id,
    source_revision = r.revision
from public.business_erp_raw_events r
where a.raw_event_id = r.id
  and a.source_kind = 'erp'
  and (
    a.source_entity_type is null
    or a.source_record_id is null
    or a.source_revision is null
  );

-- Recompute the current marker deterministically for any pre-existing ERP activity history.
update public.business_activity_events
set is_current = false,
    superseded_at = coalesce(superseded_at, now())
where source_kind = 'erp'
  and raw_event_id is not null;

with latest as (
  select distinct on (a.source_instance_id, r.entity_type, r.source_record_id, a.event_type)
    a.id
  from public.business_activity_events a
  join public.business_erp_raw_events r on r.id = a.raw_event_id
  where a.source_kind = 'erp'
    and a.source_instance_id is not null
  order by
    a.source_instance_id,
    r.entity_type,
    r.source_record_id,
    a.event_type,
    r.captured_at desc,
    r.received_at desc,
    a.created_at desc,
    a.id desc
)
update public.business_activity_events a
set is_current = true,
    superseded_at = null,
    superseded_by_raw_event_id = null
from latest l
where a.id = l.id;

create index if not exists business_activity_events_erp_revision_history_idx
  on public.business_activity_events(source_instance_id, source_entity_type, source_record_id, created_at desc)
  where source_kind = 'erp' and source_instance_id is not null and source_record_id is not null;

create unique index if not exists business_activity_events_erp_current_idx
  on public.business_activity_events(source_instance_id, source_entity_type, source_record_id, event_type)
  where source_kind = 'erp'
    and is_current = true
    and source_instance_id is not null
    and source_entity_type is not null
    and source_record_id is not null;

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
  v_is_current boolean := true;
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

  -- captured_at is the bridge observation time. It gives a deterministic ordering for
  -- two different revisions of the same ERP record even when the ERP's own EnterTime
  -- remains unchanged after an edit.
  select not exists (
    select 1
    from public.business_erp_raw_events newer
    where newer.source_instance_id = v_raw.source_instance_id
      and newer.entity_type = v_raw.entity_type
      and newer.source_record_id = v_raw.source_record_id
      and newer.id <> v_raw.id
      and (
        newer.captured_at > v_raw.captured_at
        or (newer.captured_at = v_raw.captured_at and newer.received_at > v_raw.received_at)
      )
  ) into v_is_current;

  if v_is_current then
    update public.business_activity_events previous
    set is_current = false,
        superseded_at = now(),
        superseded_by_raw_event_id = v_raw.id,
        updated_at = now()
    where previous.source_kind = 'erp'
      and previous.source_instance_id = v_raw.source_instance_id
      and previous.source_entity_type = v_raw.entity_type
      and previous.source_record_id = v_raw.source_record_id
      and previous.event_type = btrim(p_event_type)
      and previous.is_current = true
      and previous.raw_event_id is distinct from v_raw.id;
  end if;

  insert into public.business_activity_events (
    business_id, party_id, source_kind, source_instance_id, raw_event_id,
    source_entity_type, source_record_id, source_revision, is_current,
    event_type, title, summary, amount, currency, business_date, occurred_at, status, data
  ) values (
    v_raw.business_id, p_party_id, 'erp', v_raw.source_instance_id, v_raw.id,
    v_raw.entity_type, v_raw.source_record_id, v_raw.revision, v_is_current,
    btrim(p_event_type), btrim(p_title), p_summary, p_amount, nullif(upper(btrim(p_currency)), ''),
    coalesce(p_business_date, v_raw.business_date), p_occurred_at, p_status, coalesce(p_data, '{}'::jsonb)
  )
  on conflict (raw_event_id, event_type) where raw_event_id is not null
  do update set
    party_id = excluded.party_id,
    source_entity_type = excluded.source_entity_type,
    source_record_id = excluded.source_record_id,
    source_revision = excluded.source_revision,
    is_current = excluded.is_current,
    superseded_at = case when excluded.is_current then null else public.business_activity_events.superseded_at end,
    superseded_by_raw_event_id = case when excluded.is_current then null else public.business_activity_events.superseded_by_raw_event_id end,
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
security invoker
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_items jsonb;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
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
      e.source_entity_type,
      e.source_record_id,
      e.source_revision,
      coalesce(e.occurred_at, e.created_at) as sort_at
    from public.business_activity_events e
    left join public.business_parties p on p.id = e.party_id
    where e.business_id = p_business_id
      and e.is_current = true
      and (p_party_id is null or e.party_id = p_party_id)
      and (p_before is null or coalesce(e.occurred_at, e.created_at) < p_before)
    order by coalesce(e.occurred_at, e.created_at) desc, e.id desc
    limit greatest(1, least(coalesce(p_limit, 50), 100))
  ) x;

  return jsonb_build_object(
    'items', v_items,
    'contract_version', 2
  );
end;
$function$;

revoke all on function public.get_business_activity_timeline_v1(uuid,uuid,integer,timestamptz) from public;
revoke all on function public.get_business_activity_timeline_v1(uuid,uuid,integer,timestamptz) from anon;
grant execute on function public.get_business_activity_timeline_v1(uuid,uuid,integer,timestamptz) to authenticated;

create or replace function public.get_erp_entity_revision_history_v1(
  p_business_id uuid,
  p_source_instance_id uuid,
  p_entity_type text,
  p_source_record_id text,
  p_limit integer default 25
)
returns jsonb
language plpgsql
stable
security invoker
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

  select coalesce(jsonb_agg(to_jsonb(x) order by x.captured_at desc, x.received_at desc), '[]'::jsonb)
  into v_items
  from (
    select
      r.id as raw_event_id,
      r.event_id,
      r.entity_type,
      r.source_record_id,
      r.revision,
      r.business_date,
      r.source_enter_time,
      r.captured_at,
      r.received_at,
      r.normalization_status,
      r.normalized_at,
      r.normalization_error,
      a.id as activity_event_id,
      a.status as activity_status,
      coalesce(a.is_current, false) as is_current
    from public.business_erp_raw_events r
    left join public.business_activity_events a
      on a.raw_event_id = r.id and a.source_kind = 'erp'
    where r.business_id = p_business_id
      and r.source_instance_id = p_source_instance_id
      and r.entity_type = btrim(p_entity_type)
      and r.source_record_id = btrim(p_source_record_id)
    order by r.captured_at desc, r.received_at desc
    limit greatest(1, least(coalesce(p_limit, 25), 100))
  ) x;

  return jsonb_build_object('items', v_items, 'contract_version', 1);
end;
$function$;

revoke all on function public.get_erp_entity_revision_history_v1(uuid,uuid,text,text,integer) from public;
revoke all on function public.get_erp_entity_revision_history_v1(uuid,uuid,text,text,integer) from anon;
grant execute on function public.get_erp_entity_revision_history_v1(uuid,uuid,text,text,integer) to authenticated;

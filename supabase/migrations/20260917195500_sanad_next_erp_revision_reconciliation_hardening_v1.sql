-- SANAD NEXT ERP revision reconciliation hardening v1
-- Serialize competing revisions for the same ERP record and cover the supersession FK.

create index if not exists business_activity_events_superseded_by_raw_event_idx
  on public.business_activity_events(superseded_by_raw_event_id)
  where superseded_by_raw_event_id is not null;

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
  v_lock_key bigint;
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

  -- Serialize normalization for all revisions of the same logical ERP activity.
  -- This prevents two workers from both observing an empty/current slot before insert.
  v_lock_key := hashtextextended(
    v_raw.source_instance_id::text || '|' ||
    v_raw.entity_type || '|' ||
    v_raw.source_record_id || '|' ||
    btrim(p_event_type),
    0
  );
  perform pg_advisory_xact_lock(v_lock_key);

  -- captured_at is the bridge observation time. It is intentionally preferred over
  -- Edaa EnterTime because an edit may not change the source EnterTime.
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
        or (
          newer.captured_at = v_raw.captured_at
          and newer.received_at = v_raw.received_at
          and newer.id::text > v_raw.id::text
        )
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

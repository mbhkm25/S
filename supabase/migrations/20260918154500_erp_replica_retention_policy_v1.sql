-- SANAD ERP logical replica retention policy v1
-- Policy is disabled by default until live shop snapshot validation succeeds.

create table if not exists public.business_erp_replica_retention_policies (
  business_id uuid primary key references public.business_profiles(id) on delete cascade,
  enabled boolean not null default false,
  retain_completed_snapshots integer not null default 8
    check (retain_completed_snapshots between 2 and 90),
  retain_days integer not null default 90
    check (retain_days between 7 and 3650),
  retain_raw_event_days integer not null default 365
    check (retain_raw_event_days between 30 and 3650),
  updated_by uuid null,
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

alter table public.business_erp_replica_retention_policies enable row level security;

drop policy if exists business_erp_retention_owner_select on public.business_erp_replica_retention_policies;
create policy business_erp_retention_owner_select
on public.business_erp_replica_retention_policies
for select to authenticated
using (private.user_is_business_owner(business_id,(select auth.uid())));

revoke all on table public.business_erp_replica_retention_policies from anon,authenticated;
grant select on table public.business_erp_replica_retention_policies to authenticated;
grant select,insert,update,delete on table public.business_erp_replica_retention_policies to service_role;


create or replace function public.get_business_erp_retention_policy_v1(p_business_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_uid uuid := auth.uid();
  v_policy public.business_erp_replica_retention_policies%rowtype;
begin
  if v_uid is null then raise exception 'authentication_required' using errcode='42501'; end if;
  if not private.user_is_business_owner(p_business_id,v_uid) then
    raise exception 'business_owner_required' using errcode='42501';
  end if;

  select * into v_policy
  from public.business_erp_replica_retention_policies
  where business_id=p_business_id;

  if not found then
    return jsonb_build_object(
      'business_id',p_business_id,
      'enabled',false,
      'retain_completed_snapshots',8,
      'retain_days',90,
      'retain_raw_event_days',365,
      'configured',false,
      'contract_version',1
    );
  end if;

  return jsonb_build_object(
    'business_id',v_policy.business_id,
    'enabled',v_policy.enabled,
    'retain_completed_snapshots',v_policy.retain_completed_snapshots,
    'retain_days',v_policy.retain_days,
    'retain_raw_event_days',v_policy.retain_raw_event_days,
    'configured',true,
    'updated_at',v_policy.updated_at,
    'metadata',v_policy.metadata,
    'contract_version',1
  );
end;
$function$;

revoke all on function public.get_business_erp_retention_policy_v1(uuid) from public,anon;
grant execute on function public.get_business_erp_retention_policy_v1(uuid) to authenticated;


create or replace function public.set_business_erp_retention_policy_v1(
  p_business_id uuid,
  p_enabled boolean,
  p_retain_completed_snapshots integer default 8,
  p_retain_days integer default 90,
  p_retain_raw_event_days integer default 365
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'authentication_required' using errcode='42501'; end if;
  if not private.user_is_business_owner(p_business_id,v_uid) then
    raise exception 'business_owner_required' using errcode='42501';
  end if;
  if coalesce(p_retain_completed_snapshots,0) not between 2 and 90 then
    raise exception 'invalid_snapshot_retention_count' using errcode='22023';
  end if;
  if coalesce(p_retain_days,0) not between 7 and 3650 then
    raise exception 'invalid_snapshot_retention_days' using errcode='22023';
  end if;
  if coalesce(p_retain_raw_event_days,0) not between 30 and 3650 then
    raise exception 'invalid_raw_event_retention_days' using errcode='22023';
  end if;

  insert into public.business_erp_replica_retention_policies(
    business_id,enabled,retain_completed_snapshots,retain_days,retain_raw_event_days,updated_by,updated_at,metadata
  ) values (
    p_business_id,coalesce(p_enabled,false),p_retain_completed_snapshots,p_retain_days,p_retain_raw_event_days,
    v_uid,now(),jsonb_build_object('source','owner_configuration')
  )
  on conflict (business_id) do update set
    enabled=excluded.enabled,
    retain_completed_snapshots=excluded.retain_completed_snapshots,
    retain_days=excluded.retain_days,
    retain_raw_event_days=excluded.retain_raw_event_days,
    updated_by=excluded.updated_by,
    updated_at=excluded.updated_at,
    metadata=public.business_erp_replica_retention_policies.metadata || excluded.metadata;

  return public.get_business_erp_retention_policy_v1(p_business_id);
end;
$function$;

revoke all on function public.set_business_erp_retention_policy_v1(uuid,boolean,integer,integer,integer) from public,anon;
grant execute on function public.set_business_erp_retention_policy_v1(uuid,boolean,integer,integer,integer) to authenticated;


create or replace function public.plan_business_erp_snapshot_prune_v1(p_business_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_uid uuid := auth.uid();
  v_policy public.business_erp_replica_retention_policies%rowtype;
  v_items jsonb;
begin
  if v_uid is null then raise exception 'authentication_required' using errcode='42501'; end if;
  if not private.user_is_business_owner(p_business_id,v_uid) then
    raise exception 'business_owner_required' using errcode='42501';
  end if;

  select * into v_policy
  from public.business_erp_replica_retention_policies
  where business_id=p_business_id;

  if not found then
    return jsonb_build_object(
      'enabled',false,
      'items','[]'::jsonb,
      'reason','policy_not_configured',
      'contract_version',1
    );
  end if;

  with completed as (
    select
      id,
      baseline_public_id,
      completed_at,
      row_number() over(order by completed_at desc,started_at desc,id desc) as recency_rank
    from public.business_erp_baseline_runs
    where business_id=p_business_id
      and baseline_kind='logical_backup'
      and status='completed'
  ),
  candidates as (
    select
      c.baseline_public_id,
      c.completed_at,
      c.recency_rank,
      (select count(*) from public.business_erp_snapshot_rows r where r.snapshot_public_id=c.baseline_public_id) as materialized_row_count
    from completed c
    where c.recency_rank>v_policy.retain_completed_snapshots
      and c.completed_at < now() - make_interval(days=>v_policy.retain_days)
    order by c.completed_at asc
  )
  select coalesce(jsonb_agg(to_jsonb(candidates)),'[]'::jsonb) into v_items from candidates;

  return jsonb_build_object(
    'enabled',v_policy.enabled,
    'retain_completed_snapshots',v_policy.retain_completed_snapshots,
    'retain_days',v_policy.retain_days,
    'retain_raw_event_days',v_policy.retain_raw_event_days,
    'items',v_items,
    'dry_run',true,
    'contract_version',1
  );
end;
$function$;

revoke all on function public.plan_business_erp_snapshot_prune_v1(uuid) from public,anon;
grant execute on function public.plan_business_erp_snapshot_prune_v1(uuid) to authenticated;


create or replace function public.prune_business_erp_snapshots_v1(
  p_business_id uuid,
  p_limit integer default 5
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_policy public.business_erp_replica_retention_policies%rowtype;
  v_limit integer := least(greatest(coalesce(p_limit,5),1),50);
  v_snapshot uuid;
  v_deleted_snapshots integer := 0;
  v_deleted_rows bigint := 0;
  v_rows bigint;
begin
  -- service-only maintenance operation; no authenticated grant below.
  select * into v_policy
  from public.business_erp_replica_retention_policies
  where business_id=p_business_id;

  if not found or not v_policy.enabled then
    return jsonb_build_object(
      'status','disabled',
      'deleted_snapshots',0,
      'deleted_rows',0,
      'contract_version',1
    );
  end if;

  for v_snapshot in
    with completed as (
      select
        baseline_public_id,
        completed_at,
        row_number() over(order by completed_at desc,started_at desc,id desc) as recency_rank
      from public.business_erp_baseline_runs
      where business_id=p_business_id
        and baseline_kind='logical_backup'
        and status='completed'
    )
    select baseline_public_id
    from completed
    where recency_rank>v_policy.retain_completed_snapshots
      and completed_at < now() - make_interval(days=>v_policy.retain_days)
    order by completed_at asc
    limit v_limit
  loop
    delete from public.business_erp_snapshot_rows
    where snapshot_public_id=v_snapshot;
    get diagnostics v_rows = row_count;
    v_deleted_rows := v_deleted_rows + v_rows;

    delete from public.business_erp_raw_events
    where business_id=p_business_id
      and entity_type='erp_logical_snapshot_chunk'
      and integrity->>'baseline_public_id'=v_snapshot::text
      and received_at < now() - make_interval(days=>v_policy.retain_raw_event_days);

    delete from public.business_erp_baseline_runs
    where business_id=p_business_id
      and baseline_public_id=v_snapshot
      and baseline_kind='logical_backup'
      and status='completed';

    v_deleted_snapshots := v_deleted_snapshots + 1;
  end loop;

  return jsonb_build_object(
    'status','completed',
    'deleted_snapshots',v_deleted_snapshots,
    'deleted_rows',v_deleted_rows,
    'contract_version',1
  );
end;
$function$;

revoke all on function public.prune_business_erp_snapshots_v1(uuid,integer) from public,anon,authenticated;
grant execute on function public.prune_business_erp_snapshots_v1(uuid,integer) to service_role;

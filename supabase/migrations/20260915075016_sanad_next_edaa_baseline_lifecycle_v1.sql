create table public.business_erp_baseline_runs (
  id uuid primary key default gen_random_uuid(),
  baseline_public_id uuid not null default gen_random_uuid() unique,
  business_id uuid not null references public.business_profiles(id) on delete cascade,
  location_id uuid references public.business_locations(id) on delete restrict,
  connection_id uuid not null references public.business_accounting_connections(id) on delete cascade,
  source_instance_id uuid not null references public.business_erp_source_instances(id) on delete cascade,
  bridge_device_id uuid not null references public.business_bridge_devices(id) on delete restrict,
  baseline_kind text not null default 'initial' check (baseline_kind in ('initial','reconciliation')),
  adapter_code text not null,
  adapter_version text not null,
  schema_fingerprint text not null,
  status text not null default 'started' check (status in ('started','uploading','completed','failed','incompatible','cancelled')),
  manifest jsonb not null default '{}'::jsonb,
  expected_counts jsonb not null default '{}'::jsonb,
  received_counts jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  completed_at timestamptz,
  error_code text,
  error_detail text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index business_erp_baseline_runs_business_idx
  on public.business_erp_baseline_runs(business_id, started_at desc);
create index business_erp_baseline_runs_connection_idx
  on public.business_erp_baseline_runs(connection_id, started_at desc);
create index business_erp_baseline_runs_source_idx
  on public.business_erp_baseline_runs(source_instance_id, started_at desc);
create index business_erp_baseline_runs_device_idx
  on public.business_erp_baseline_runs(bridge_device_id, started_at desc);
create index business_erp_baseline_runs_status_idx
  on public.business_erp_baseline_runs(status, last_seen_at)
  where status in ('started','uploading');

create trigger business_erp_baseline_runs_set_updated_at
before update on public.business_erp_baseline_runs
for each row execute function public.set_updated_at();

alter table public.business_erp_baseline_runs enable row level security;

create policy business_erp_baseline_runs_deny_authenticated
on public.business_erp_baseline_runs for all to authenticated
using (false) with check (false);

revoke all on table public.business_erp_baseline_runs from anon;
revoke all on table public.business_erp_baseline_runs from authenticated;
grant select, insert, update on table public.business_erp_baseline_runs to service_role;

create or replace function public.start_erp_baseline_v1(
  p_device_public_id uuid,
  p_baseline_public_id uuid,
  p_baseline_kind text,
  p_adapter_code text,
  p_adapter_version text,
  p_schema_fingerprint text,
  p_manifest jsonb,
  p_expected_counts jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_device public.business_bridge_devices%rowtype;
  v_source public.business_erp_source_instances%rowtype;
  v_existing public.business_erp_baseline_runs%rowtype;
  v_run_id uuid;
begin
  if p_device_public_id is null
     or p_baseline_public_id is null
     or nullif(btrim(p_adapter_code), '') is null
     or nullif(btrim(p_adapter_version), '') is null
     or nullif(btrim(p_schema_fingerprint), '') is null then
    raise exception 'invalid_baseline_request' using errcode = '22023';
  end if;

  if coalesce(p_baseline_kind, 'initial') not in ('initial','reconciliation') then
    raise exception 'invalid_baseline_kind' using errcode = '22023';
  end if;

  if jsonb_typeof(coalesce(p_manifest, '{}'::jsonb)) <> 'object'
     or jsonb_typeof(coalesce(p_expected_counts, '{}'::jsonb)) <> 'object' then
    raise exception 'invalid_baseline_manifest' using errcode = '22023';
  end if;

  select d.* into v_device
  from public.business_bridge_devices d
  join public.business_accounting_connections c on c.id = d.connection_id
  where d.device_public_id = p_device_public_id
    and d.status = 'active'
    and c.status in ('pending','connected','error')
  limit 1;

  if not found then
    raise exception 'bridge_device_not_active' using errcode = '42501';
  end if;

  select s.* into v_source
  from public.business_erp_source_instances s
  where s.id = v_device.source_instance_id
  for update;

  if not found or v_source.status not in ('active','changed') then
    raise exception 'erp_source_not_active' using errcode = '42501';
  end if;

  if v_source.schema_fingerprint is not null
     and v_source.schema_fingerprint <> btrim(p_schema_fingerprint) then
    update public.business_erp_source_instances
    set status = 'changed', last_seen_at = now(),
        metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
          'last_observed_schema_fingerprint', btrim(p_schema_fingerprint),
          'schema_changed_at', now()
        )
    where id = v_source.id;

    update public.business_accounting_connections
    set status = 'error', last_error_code = 'schema_fingerprint_mismatch', last_error_at = now()
    where id = v_device.connection_id;

    raise exception 'schema_fingerprint_mismatch' using errcode = '22023';
  end if;

  if v_source.schema_fingerprint is null then
    update public.business_erp_source_instances
    set schema_fingerprint = btrim(p_schema_fingerprint), status = 'active', last_seen_at = now()
    where id = v_source.id;
  else
    update public.business_erp_source_instances
    set last_seen_at = now()
    where id = v_source.id;
  end if;

  select r.* into v_existing
  from public.business_erp_baseline_runs r
  where r.baseline_public_id = p_baseline_public_id
  limit 1;

  if found then
    if v_existing.source_instance_id <> v_device.source_instance_id
       or v_existing.bridge_device_id <> v_device.id
       or v_existing.schema_fingerprint <> btrim(p_schema_fingerprint) then
      raise exception 'baseline_id_conflict' using errcode = '23505';
    end if;

    update public.business_erp_baseline_runs
    set last_seen_at = now()
    where id = v_existing.id;

    return jsonb_build_object(
      'status', v_existing.status,
      'baseline_public_id', v_existing.baseline_public_id,
      'started_at', v_existing.started_at,
      'completed_at', v_existing.completed_at,
      'contract_version', 1
    );
  end if;

  insert into public.business_erp_baseline_runs (
    baseline_public_id, business_id, location_id, connection_id, source_instance_id, bridge_device_id,
    baseline_kind, adapter_code, adapter_version, schema_fingerprint, status,
    manifest, expected_counts
  ) values (
    p_baseline_public_id, v_device.business_id, v_device.location_id, v_device.connection_id,
    v_device.source_instance_id, v_device.id, coalesce(p_baseline_kind, 'initial'),
    btrim(p_adapter_code), btrim(p_adapter_version), btrim(p_schema_fingerprint), 'started',
    coalesce(p_manifest, '{}'::jsonb), coalesce(p_expected_counts, '{}'::jsonb)
  ) returning id into v_run_id;

  update public.business_accounting_connections
  set status = case when status = 'connected' then status else 'pending' end,
      last_heartbeat_at = now(), adapter_version = btrim(p_adapter_version),
      last_error_code = null, last_error_at = null
  where id = v_device.connection_id;

  update public.business_bridge_devices
  set last_heartbeat_at = now(), adapter_version = btrim(p_adapter_version)
  where id = v_device.id;

  return jsonb_build_object(
    'status', 'started',
    'baseline_public_id', p_baseline_public_id,
    'run_id', v_run_id,
    'started_at', now(),
    'contract_version', 1
  );
end;
$function$;

create or replace function public.complete_erp_baseline_v1(
  p_device_public_id uuid,
  p_baseline_public_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_device public.business_bridge_devices%rowtype;
  v_run public.business_erp_baseline_runs%rowtype;
  v_received jsonb := '{}'::jsonb;
  v_key text;
  v_expected integer;
  v_actual integer;
begin
  select d.* into v_device
  from public.business_bridge_devices d
  where d.device_public_id = p_device_public_id
    and d.status = 'active'
  limit 1;

  if not found then
    raise exception 'bridge_device_not_active' using errcode = '42501';
  end if;

  select r.* into v_run
  from public.business_erp_baseline_runs r
  where r.baseline_public_id = p_baseline_public_id
    and r.bridge_device_id = v_device.id
  for update;

  if not found then
    raise exception 'baseline_run_not_found' using errcode = '22023';
  end if;

  if v_run.status = 'completed' then
    return jsonb_build_object(
      'status', 'completed',
      'baseline_public_id', v_run.baseline_public_id,
      'received_counts', v_run.received_counts,
      'completed_at', v_run.completed_at,
      'contract_version', 1
    );
  end if;

  if v_run.status not in ('started','uploading') then
    raise exception 'baseline_run_not_completable' using errcode = '22023';
  end if;

  select coalesce(jsonb_object_agg(x.source_record_id, x.row_count), '{}'::jsonb)
  into v_received
  from (
    select distinct on (e.source_record_id)
      e.source_record_id,
      case
        when coalesce(e.integrity->>'row_count','') ~ '^[0-9]+$'
          then (e.integrity->>'row_count')::integer
        else -1
      end as row_count
    from public.business_erp_raw_events e
    where e.source_instance_id = v_run.source_instance_id
      and e.entity_type = 'erp_master_snapshot'
      and e.integrity->>'baseline_public_id' = p_baseline_public_id::text
      and e.integrity->>'schema_fingerprint' = v_run.schema_fingerprint
    order by e.source_record_id, e.received_at desc
  ) x;

  for v_key in select key from jsonb_each_text(v_run.expected_counts)
  loop
    begin
      v_expected := (v_run.expected_counts->>v_key)::integer;
    exception when others then
      raise exception 'invalid_expected_count:%', v_key using errcode = '22023';
    end;

    if not (v_received ? v_key) then
      raise exception 'baseline_snapshot_missing:%', v_key using errcode = '22023';
    end if;

    v_actual := (v_received->>v_key)::integer;
    if v_actual <> v_expected then
      raise exception 'baseline_snapshot_count_mismatch:%', v_key using errcode = '22023';
    end if;
  end loop;

  update public.business_erp_baseline_runs
  set status = 'completed', received_counts = v_received,
      completed_at = now(), last_seen_at = now(), error_code = null, error_detail = null
  where id = v_run.id;

  update public.business_erp_raw_events
  set normalization_status = 'warning', normalized_at = now(),
      normalization_error = 'baseline_snapshot_mapping_pending'
  where source_instance_id = v_run.source_instance_id
    and entity_type = 'erp_master_snapshot'
    and integrity->>'baseline_public_id' = p_baseline_public_id::text
    and normalization_status = 'pending';

  update public.business_accounting_connections
  set status = 'connected', last_sync_at = now(), last_heartbeat_at = now(),
      last_error_code = null, last_error_at = null
  where id = v_run.connection_id;

  update public.business_erp_source_instances
  set status = 'active', last_seen_at = now()
  where id = v_run.source_instance_id;

  update public.business_bridge_devices
  set last_heartbeat_at = now()
  where id = v_run.bridge_device_id;

  return jsonb_build_object(
    'status', 'completed',
    'baseline_public_id', p_baseline_public_id,
    'received_counts', v_received,
    'completed_at', now(),
    'contract_version', 1
  );
end;
$function$;

create or replace function public.fail_erp_baseline_v1(
  p_device_public_id uuid,
  p_baseline_public_id uuid,
  p_error_code text,
  p_error_detail text default null,
  p_incompatible boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_device public.business_bridge_devices%rowtype;
  v_run public.business_erp_baseline_runs%rowtype;
  v_status text;
begin
  if nullif(btrim(p_error_code), '') is null then
    raise exception 'baseline_error_code_required' using errcode = '22023';
  end if;

  select d.* into v_device
  from public.business_bridge_devices d
  where d.device_public_id = p_device_public_id
  limit 1;

  if not found then
    raise exception 'bridge_device_not_found' using errcode = '42501';
  end if;

  select r.* into v_run
  from public.business_erp_baseline_runs r
  where r.baseline_public_id = p_baseline_public_id
    and r.bridge_device_id = v_device.id
  for update;

  if not found then
    raise exception 'baseline_run_not_found' using errcode = '22023';
  end if;

  if v_run.status = 'completed' then
    return jsonb_build_object('status','completed','baseline_public_id',v_run.baseline_public_id,'contract_version',1);
  end if;

  v_status := case when coalesce(p_incompatible, false) then 'incompatible' else 'failed' end;

  update public.business_erp_baseline_runs
  set status = v_status, last_seen_at = now(), error_code = btrim(p_error_code),
      error_detail = left(coalesce(p_error_detail,''), 1000)
  where id = v_run.id;

  update public.business_accounting_connections
  set status = 'error', last_error_code = btrim(p_error_code), last_error_at = now(), last_heartbeat_at = now()
  where id = v_run.connection_id;

  if coalesce(p_incompatible, false) then
    update public.business_erp_source_instances
    set status = 'incompatible', last_seen_at = now()
    where id = v_run.source_instance_id;
  end if;

  return jsonb_build_object(
    'status', v_status,
    'baseline_public_id', p_baseline_public_id,
    'error_code', btrim(p_error_code),
    'contract_version', 1
  );
end;
$function$;

revoke all on function public.start_erp_baseline_v1(uuid,uuid,text,text,text,text,jsonb,jsonb) from public;
revoke all on function public.start_erp_baseline_v1(uuid,uuid,text,text,text,text,jsonb,jsonb) from anon;
revoke all on function public.start_erp_baseline_v1(uuid,uuid,text,text,text,text,jsonb,jsonb) from authenticated;
grant execute on function public.start_erp_baseline_v1(uuid,uuid,text,text,text,text,jsonb,jsonb) to service_role;

revoke all on function public.complete_erp_baseline_v1(uuid,uuid) from public;
revoke all on function public.complete_erp_baseline_v1(uuid,uuid) from anon;
revoke all on function public.complete_erp_baseline_v1(uuid,uuid) from authenticated;
grant execute on function public.complete_erp_baseline_v1(uuid,uuid) to service_role;

revoke all on function public.fail_erp_baseline_v1(uuid,uuid,text,text,boolean) from public;
revoke all on function public.fail_erp_baseline_v1(uuid,uuid,text,text,boolean) from anon;
revoke all on function public.fail_erp_baseline_v1(uuid,uuid,text,text,boolean) from authenticated;
grant execute on function public.fail_erp_baseline_v1(uuid,uuid,text,text,boolean) to service_role;

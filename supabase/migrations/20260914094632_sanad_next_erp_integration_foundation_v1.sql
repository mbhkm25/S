create table public.business_locations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.business_profiles(id) on delete cascade,
  code text not null default 'main',
  name text not null,
  is_primary boolean not null default false,
  status text not null default 'active' check (status in ('active','inactive','archived')),
  timezone text not null default 'Asia/Aden',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, code)
);

create unique index business_locations_one_primary_idx
  on public.business_locations(business_id)
  where is_primary = true and status = 'active';

create index business_locations_business_idx on public.business_locations(business_id, status);

create trigger business_locations_set_updated_at
before update on public.business_locations
for each row execute function public.set_updated_at();

alter table public.business_locations enable row level security;

create policy business_locations_select_member
on public.business_locations for select to authenticated
using (
  private.user_is_business_owner(business_id, (select auth.uid()))
  or private.user_is_active_business_member(business_id, (select auth.uid()))
);

create policy business_locations_owner_write
on public.business_locations for all to authenticated
using (private.user_is_business_owner(business_id, (select auth.uid())))
with check (private.user_is_business_owner(business_id, (select auth.uid())));

create table public.business_accounting_connections (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.business_profiles(id) on delete cascade,
  location_id uuid references public.business_locations(id) on delete restrict,
  provider_code text not null,
  display_name text not null,
  connection_mode text not null default 'read_only' check (connection_mode in ('read_only')),
  status text not null default 'pending' check (status in ('pending','connected','paused','error','disconnected')),
  adapter_version text,
  event_schema_version integer not null default 1 check (event_schema_version > 0),
  last_sync_at timestamptz,
  last_heartbeat_at timestamptz,
  last_error_code text,
  last_error_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index business_accounting_connections_business_idx
  on public.business_accounting_connections(business_id, status);
create index business_accounting_connections_location_idx
  on public.business_accounting_connections(location_id) where location_id is not null;

create trigger business_accounting_connections_set_updated_at
before update on public.business_accounting_connections
for each row execute function public.set_updated_at();

alter table public.business_accounting_connections enable row level security;

create policy business_accounting_connections_select_member
on public.business_accounting_connections for select to authenticated
using (
  private.user_is_business_owner(business_id, (select auth.uid()))
  or private.user_is_active_business_member(business_id, (select auth.uid()))
);

create policy business_accounting_connections_owner_write
on public.business_accounting_connections for all to authenticated
using (private.user_is_business_owner(business_id, (select auth.uid())))
with check (private.user_is_business_owner(business_id, (select auth.uid())));

create table public.business_erp_source_instances (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.business_profiles(id) on delete cascade,
  location_id uuid references public.business_locations(id) on delete restrict,
  connection_id uuid not null references public.business_accounting_connections(id) on delete cascade,
  source_key text not null,
  source_label text,
  source_version text,
  schema_fingerprint text,
  status text not null default 'active' check (status in ('active','changed','incompatible','retired')),
  discovered_at timestamptz not null default now(),
  last_seen_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (connection_id, source_key)
);

create index business_erp_source_instances_business_idx
  on public.business_erp_source_instances(business_id, status);

create trigger business_erp_source_instances_set_updated_at
before update on public.business_erp_source_instances
for each row execute function public.set_updated_at();

alter table public.business_erp_source_instances enable row level security;

create policy business_erp_source_instances_select_member
on public.business_erp_source_instances for select to authenticated
using (
  private.user_is_business_owner(business_id, (select auth.uid()))
  or private.user_is_active_business_member(business_id, (select auth.uid()))
);

create policy business_erp_source_instances_owner_write
on public.business_erp_source_instances for all to authenticated
using (private.user_is_business_owner(business_id, (select auth.uid())))
with check (private.user_is_business_owner(business_id, (select auth.uid())));

create table public.business_bridge_devices (
  id uuid primary key default gen_random_uuid(),
  device_public_id uuid not null default gen_random_uuid() unique,
  business_id uuid not null references public.business_profiles(id) on delete cascade,
  location_id uuid references public.business_locations(id) on delete restrict,
  connection_id uuid not null references public.business_accounting_connections(id) on delete cascade,
  source_instance_id uuid not null references public.business_erp_source_instances(id) on delete cascade,
  device_label text,
  status text not null default 'pending' check (status in ('pending','active','paused','revoked')),
  bridge_version text,
  adapter_version text,
  last_heartbeat_at timestamptz,
  last_ip_hash text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index business_bridge_devices_business_idx
  on public.business_bridge_devices(business_id, status);
create index business_bridge_devices_connection_idx
  on public.business_bridge_devices(connection_id);
create index business_bridge_devices_source_idx
  on public.business_bridge_devices(source_instance_id);

create trigger business_bridge_devices_set_updated_at
before update on public.business_bridge_devices
for each row execute function public.set_updated_at();

alter table public.business_bridge_devices enable row level security;

create policy business_bridge_devices_select_member
on public.business_bridge_devices for select to authenticated
using (
  private.user_is_business_owner(business_id, (select auth.uid()))
  or private.user_is_active_business_member(business_id, (select auth.uid()))
);

create policy business_bridge_devices_owner_write
on public.business_bridge_devices for all to authenticated
using (private.user_is_business_owner(business_id, (select auth.uid())))
with check (private.user_is_business_owner(business_id, (select auth.uid())));

create table public.business_bridge_device_credentials (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references public.business_bridge_devices(id) on delete cascade,
  secret_hash text not null,
  secret_prefix text not null,
  status text not null default 'active' check (status in ('active','revoked','expired')),
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  last_used_at timestamptz
);

create unique index business_bridge_device_credentials_active_idx
  on public.business_bridge_device_credentials(device_id)
  where status = 'active';

alter table public.business_bridge_device_credentials enable row level security;

create policy business_bridge_device_credentials_deny_authenticated
on public.business_bridge_device_credentials for all to authenticated
using (false) with check (false);

create table public.business_erp_raw_events (
  id uuid primary key default gen_random_uuid(),
  event_id text not null unique,
  business_id uuid not null references public.business_profiles(id) on delete cascade,
  location_id uuid references public.business_locations(id) on delete restrict,
  connection_id uuid not null references public.business_accounting_connections(id) on delete cascade,
  source_instance_id uuid not null references public.business_erp_source_instances(id) on delete cascade,
  bridge_device_id uuid not null references public.business_bridge_devices(id) on delete restrict,
  adapter_code text not null,
  adapter_version text not null,
  event_schema_version integer not null check (event_schema_version > 0),
  entity_type text not null,
  source_record_id text not null,
  revision text not null,
  business_date date,
  source_enter_time timestamptz,
  captured_at timestamptz not null,
  received_at timestamptz not null default now(),
  payload jsonb not null,
  integrity jsonb not null default '{}'::jsonb,
  payload_hash text not null,
  normalization_status text not null default 'pending' check (normalization_status in ('pending','normalized','warning','failed','quarantined')),
  normalized_at timestamptz,
  normalization_error text,
  created_at timestamptz not null default now(),
  unique (source_instance_id, entity_type, source_record_id, revision)
);

create index business_erp_raw_events_business_received_idx
  on public.business_erp_raw_events(business_id, received_at desc);
create index business_erp_raw_events_source_received_idx
  on public.business_erp_raw_events(source_instance_id, received_at desc);
create index business_erp_raw_events_pending_idx
  on public.business_erp_raw_events(received_at)
  where normalization_status = 'pending';

alter table public.business_erp_raw_events enable row level security;

create policy business_erp_raw_events_deny_authenticated
on public.business_erp_raw_events for all to authenticated
using (false) with check (false);

create or replace function public.accept_erp_event_v1(
  p_device_public_id uuid,
  p_event_id text,
  p_adapter_code text,
  p_adapter_version text,
  p_event_schema_version integer,
  p_entity_type text,
  p_source_record_id text,
  p_revision text,
  p_captured_at timestamptz,
  p_business_date date default null,
  p_source_enter_time timestamptz default null,
  p_payload jsonb default '{}'::jsonb,
  p_integrity jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_device public.business_bridge_devices%rowtype;
  v_existing public.business_erp_raw_events%rowtype;
  v_inserted_id uuid;
  v_payload_hash text;
begin
  if nullif(btrim(p_event_id), '') is null
     or nullif(btrim(p_adapter_code), '') is null
     or nullif(btrim(p_adapter_version), '') is null
     or nullif(btrim(p_entity_type), '') is null
     or nullif(btrim(p_source_record_id), '') is null
     or nullif(btrim(p_revision), '') is null then
    raise exception 'invalid_event_envelope' using errcode = '22023';
  end if;

  if p_event_schema_version is null or p_event_schema_version <= 0 then
    raise exception 'invalid_event_schema_version' using errcode = '22023';
  end if;

  select d.* into v_device
  from public.business_bridge_devices d
  join public.business_accounting_connections c on c.id = d.connection_id
  join public.business_erp_source_instances s on s.id = d.source_instance_id
  where d.device_public_id = p_device_public_id
    and d.status = 'active'
    and c.status in ('connected','pending')
    and s.status in ('active','changed')
  limit 1;

  if not found then
    raise exception 'bridge_device_not_active' using errcode = '42501';
  end if;

  v_payload_hash := md5(coalesce(p_payload, '{}'::jsonb)::text);

  insert into public.business_erp_raw_events (
    event_id, business_id, location_id, connection_id, source_instance_id, bridge_device_id,
    adapter_code, adapter_version, event_schema_version, entity_type, source_record_id, revision,
    business_date, source_enter_time, captured_at, payload, integrity, payload_hash
  ) values (
    btrim(p_event_id), v_device.business_id, v_device.location_id, v_device.connection_id,
    v_device.source_instance_id, v_device.id, btrim(p_adapter_code), btrim(p_adapter_version),
    p_event_schema_version, btrim(p_entity_type), btrim(p_source_record_id), btrim(p_revision),
    p_business_date, p_source_enter_time, p_captured_at, coalesce(p_payload, '{}'::jsonb),
    coalesce(p_integrity, '{}'::jsonb), v_payload_hash
  )
  on conflict do nothing
  returning id into v_inserted_id;

  if v_inserted_id is not null then
    update public.business_bridge_devices
    set last_heartbeat_at = now(), adapter_version = btrim(p_adapter_version)
    where id = v_device.id;

    update public.business_accounting_connections
    set last_heartbeat_at = now(), adapter_version = btrim(p_adapter_version)
    where id = v_device.connection_id;

    return jsonb_build_object(
      'status', 'accepted',
      'event_id', btrim(p_event_id),
      'receipt_id', v_inserted_id,
      'received_at', now()
    );
  end if;

  select e.* into v_existing
  from public.business_erp_raw_events e
  where e.event_id = btrim(p_event_id)
     or (
       e.source_instance_id = v_device.source_instance_id
       and e.entity_type = btrim(p_entity_type)
       and e.source_record_id = btrim(p_source_record_id)
       and e.revision = btrim(p_revision)
     )
  order by (e.event_id = btrim(p_event_id)) desc, e.received_at asc
  limit 1;

  if not found then
    raise exception 'idempotency_conflict_without_existing_event' using errcode = '23505';
  end if;

  if v_existing.event_id = btrim(p_event_id)
     and (
       v_existing.source_instance_id <> v_device.source_instance_id
       or v_existing.entity_type <> btrim(p_entity_type)
       or v_existing.source_record_id <> btrim(p_source_record_id)
       or v_existing.revision <> btrim(p_revision)
       or v_existing.payload_hash <> v_payload_hash
     ) then
    raise exception 'event_id_conflict' using errcode = '23505';
  end if;

  return jsonb_build_object(
    'status', case when v_existing.event_id = btrim(p_event_id) then 'already_accepted' else 'duplicate' end,
    'event_id', v_existing.event_id,
    'receipt_id', v_existing.id,
    'received_at', v_existing.received_at
  );
end;
$function$;

revoke all on function public.accept_erp_event_v1(uuid,text,text,text,integer,text,text,text,timestamptz,date,timestamptz,jsonb,jsonb) from public;
revoke all on function public.accept_erp_event_v1(uuid,text,text,text,integer,text,text,text,timestamptz,date,timestamptz,jsonb,jsonb) from anon;
revoke all on function public.accept_erp_event_v1(uuid,text,text,text,integer,text,text,text,timestamptz,date,timestamptz,jsonb,jsonb) from authenticated;
grant execute on function public.accept_erp_event_v1(uuid,text,text,text,integer,text,text,text,timestamptz,date,timestamptz,jsonb,jsonb) to service_role;
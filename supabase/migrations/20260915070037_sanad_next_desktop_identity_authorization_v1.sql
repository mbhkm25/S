alter table public.business_bridge_devices
  add column if not exists authorized_by_user_id uuid references public.profiles(id) on delete set null,
  add column if not exists authorized_at timestamptz,
  add column if not exists authorization_method text;

alter table public.business_bridge_devices
  drop constraint if exists business_bridge_devices_authorization_method_check;

alter table public.business_bridge_devices
  add constraint business_bridge_devices_authorization_method_check
  check (authorization_method is null or authorization_method in ('legacy_pairing','browser_session','oauth_pkce'));

create index if not exists business_bridge_devices_authorized_by_idx
  on public.business_bridge_devices(authorized_by_user_id)
  where authorized_by_user_id is not null;

update public.business_bridge_devices d
set authorized_by_user_id = t.created_by_user_id,
    authorized_at = coalesce(t.consumed_at, d.created_at),
    authorization_method = 'legacy_pairing'
from public.business_bridge_pairing_tokens t
where t.device_id = d.id
  and d.authorized_by_user_id is null;

create table public.business_bridge_authorization_sessions (
  id uuid primary key default gen_random_uuid(),
  session_public_id uuid not null default gen_random_uuid() unique,
  browser_secret_hash text not null unique,
  claim_secret_hash text not null unique,
  device_credential_hash text not null,
  device_credential_prefix text not null,
  device_label text,
  bridge_version text,
  adapter_code text not null,
  adapter_version text,
  source_key text not null,
  source_label text,
  source_version text,
  schema_fingerprint text,
  status text not null default 'pending'
    check (status in ('pending','authorized','denied','consumed','expired','revoked')),
  expires_at timestamptz not null,
  authorized_by_user_id uuid references public.profiles(id) on delete set null,
  business_id uuid references public.business_profiles(id) on delete cascade,
  location_id uuid references public.business_locations(id) on delete set null,
  connection_id uuid references public.business_accounting_connections(id) on delete cascade,
  source_instance_id uuid references public.business_erp_source_instances(id) on delete cascade,
  device_id uuid references public.business_bridge_devices(id) on delete set null,
  authorization_method text not null default 'browser_session'
    check (authorization_method in ('browser_session','oauth_pkce')),
  authorized_at timestamptz,
  denied_at timestamptz,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  check (expires_at > created_at),
  check (length(device_credential_hash) = 64),
  check (length(browser_secret_hash) = 64),
  check (length(claim_secret_hash) = 64),
  check (adapter_code ~ '^[a-z0-9_]{2,32}$')
);

create index business_bridge_authorization_sessions_status_expiry_idx
  on public.business_bridge_authorization_sessions(status, expires_at);
create index business_bridge_authorization_sessions_business_idx
  on public.business_bridge_authorization_sessions(business_id, created_at desc)
  where business_id is not null;
create index business_bridge_authorization_sessions_authorized_by_idx
  on public.business_bridge_authorization_sessions(authorized_by_user_id, created_at desc)
  where authorized_by_user_id is not null;
create index business_bridge_authorization_sessions_device_idx
  on public.business_bridge_authorization_sessions(device_id)
  where device_id is not null;

create trigger business_bridge_authorization_sessions_set_updated_at
before update on public.business_bridge_authorization_sessions
for each row execute function public.set_updated_at();

alter table public.business_bridge_authorization_sessions enable row level security;
revoke all on table public.business_bridge_authorization_sessions from public, anon, authenticated;
grant select, insert, update, delete on table public.business_bridge_authorization_sessions to service_role;

grant select, insert, update, delete on table public.business_bridge_devices to service_role;
grant select, insert, update, delete on table public.business_bridge_device_credentials to service_role;
grant select, insert, update, delete on table public.business_locations to service_role;
grant select, insert, update, delete on table public.business_accounting_connections to service_role;
grant select, insert, update, delete on table public.business_erp_source_instances to service_role;

create or replace function public.update_business_team_member_permissions(
  p_business_id uuid,
  p_member_user_id uuid,
  p_job_title text default null,
  p_permissions jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_member public.business_team_members%rowtype;
  v_previous jsonb;
  v_normalized jsonb;
  v_allowed_keys text[] := array[
    'view_customers','contact_customers','manage_catalog','view_reports','link_operations',
    'manage_accounting_integrations',
    'payments.view','payments.claim','payments.complete','payments.release','payments.reassign','payments.review'
  ];
  v_key text;
begin
  if v_user_id is null then
    raise exception 'not_authenticated';
  end if;

  if not exists (
    select 1 from public.business_profiles
    where id = p_business_id and owner_user_id = v_user_id
  ) then
    raise exception 'business_owner_required';
  end if;

  if jsonb_typeof(coalesce(p_permissions, '{}'::jsonb)) <> 'object' then
    raise exception 'permissions_must_be_object';
  end if;

  for v_key in select jsonb_object_keys(coalesce(p_permissions, '{}'::jsonb)) loop
    if not (v_key = any(v_allowed_keys)) then
      raise exception 'invalid_permission_key:%', v_key;
    end if;
    if jsonb_typeof(p_permissions -> v_key) <> 'boolean' then
      raise exception 'permission_value_must_be_boolean:%', v_key;
    end if;
  end loop;

  select permissions into v_previous
  from public.business_team_members
  where business_id = p_business_id
    and user_id = p_member_user_id
    and status <> 'removed'
  for update;

  if not found then
    raise exception 'team_member_not_found';
  end if;

  v_normalized := jsonb_build_object(
    'view_customers', coalesce((p_permissions ->> 'view_customers')::boolean, false),
    'contact_customers', coalesce((p_permissions ->> 'contact_customers')::boolean, false),
    'manage_catalog', coalesce((p_permissions ->> 'manage_catalog')::boolean, false),
    'view_reports', coalesce((p_permissions ->> 'view_reports')::boolean, false),
    'link_operations', coalesce((p_permissions ->> 'link_operations')::boolean, false),
    'manage_accounting_integrations', coalesce((p_permissions ->> 'manage_accounting_integrations')::boolean, false),
    'payments.view', coalesce((p_permissions ->> 'payments.view')::boolean, false),
    'payments.claim', coalesce((p_permissions ->> 'payments.claim')::boolean, false),
    'payments.complete', coalesce((p_permissions ->> 'payments.complete')::boolean, false),
    'payments.release', coalesce((p_permissions ->> 'payments.release')::boolean, false),
    'payments.reassign', coalesce((p_permissions ->> 'payments.reassign')::boolean, false),
    'payments.review', coalesce((p_permissions ->> 'payments.review')::boolean, false)
  );

  if (v_normalized ->> 'contact_customers')::boolean
     and not (v_normalized ->> 'view_customers')::boolean then
    raise exception 'contact_customers_requires_view_customers';
  end if;

  if (
    (v_normalized ->> 'payments.claim')::boolean
    or (v_normalized ->> 'payments.complete')::boolean
    or (v_normalized ->> 'payments.release')::boolean
    or (v_normalized ->> 'payments.reassign')::boolean
    or (v_normalized ->> 'payments.review')::boolean
  ) and not (v_normalized ->> 'payments.view')::boolean then
    raise exception 'payment_actions_require_payments_view';
  end if;

  update public.business_team_members
  set job_title = nullif(btrim(coalesce(p_job_title, '')), ''),
      label = nullif(btrim(coalesce(p_job_title, '')), ''),
      permissions = v_normalized,
      updated_at = now()
  where business_id = p_business_id
    and user_id = p_member_user_id
    and status <> 'removed'
  returning * into v_member;

  insert into public.business_team_actions (
    business_id, member_user_id, action, performed_by_user_id, metadata
  ) values (
    p_business_id, p_member_user_id, 'permissions_updated', v_user_id,
    jsonb_build_object(
      'job_title', v_member.job_title,
      'previous_permissions', coalesce(v_previous, '{}'::jsonb),
      'permissions', v_member.permissions
    )
  );

  return jsonb_build_object(
    'ok', true,
    'member', to_jsonb(v_member),
    'permissions', v_member.permissions,
    'updated_at', v_member.updated_at
  );
end;
$function$;

create or replace function public.create_business_accounting_connection_v1(
  p_business_id uuid,
  p_provider_code text,
  p_display_name text,
  p_location_name text default 'الفرع الرئيسي'
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_provider_code text;
  v_location_id uuid;
  v_connection public.business_accounting_connections%rowtype;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  if not public.has_business_team_permission(p_business_id, 'manage_accounting_integrations', v_uid) then
    raise exception 'accounting_integration_permission_required' using errcode = '42501';
  end if;

  v_provider_code := lower(btrim(coalesce(p_provider_code, '')));
  if v_provider_code !~ '^[a-z0-9_]{2,32}$' then
    raise exception 'invalid_provider_code' using errcode = '22023';
  end if;

  if nullif(btrim(p_display_name), '') is null then
    raise exception 'display_name_required' using errcode = '22023';
  end if;

  select l.id into v_location_id
  from public.business_locations l
  where l.business_id = p_business_id
    and l.is_primary = true
    and l.status = 'active'
  order by l.created_at asc
  limit 1;

  if v_location_id is null then
    insert into public.business_locations (business_id, code, name, is_primary, status)
    values (
      p_business_id, 'main',
      coalesce(nullif(btrim(p_location_name), ''), 'الفرع الرئيسي'),
      true, 'active'
    )
    on conflict (business_id, code)
    do update set
      name = coalesce(nullif(btrim(p_location_name), ''), public.business_locations.name),
      is_primary = true,
      status = 'active',
      updated_at = now()
    returning id into v_location_id;
  end if;

  select c.* into v_connection
  from public.business_accounting_connections c
  where c.business_id = p_business_id
    and c.location_id = v_location_id
    and c.provider_code = v_provider_code
    and c.status <> 'disconnected'
  order by c.created_at asc
  limit 1;

  if not found then
    insert into public.business_accounting_connections (
      business_id, location_id, provider_code, display_name,
      connection_mode, status, event_schema_version
    ) values (
      p_business_id, v_location_id, v_provider_code, btrim(p_display_name),
      'read_only', 'pending', 1
    ) returning * into v_connection;
  else
    update public.business_accounting_connections
    set display_name = btrim(p_display_name), updated_at = now()
    where id = v_connection.id
    returning * into v_connection;
  end if;

  return jsonb_build_object(
    'business_id', v_connection.business_id,
    'location_id', v_connection.location_id,
    'connection_id', v_connection.id,
    'provider_code', v_connection.provider_code,
    'display_name', v_connection.display_name,
    'connection_mode', v_connection.connection_mode,
    'status', v_connection.status,
    'event_schema_version', v_connection.event_schema_version,
    'contract_version', 2
  );
end;
$function$;

create or replace function public.authorize_bridge_installation_v1(
  p_session_public_id uuid,
  p_browser_secret_hash text,
  p_user_id uuid,
  p_business_id uuid,
  p_location_id uuid default null,
  p_location_name text default 'الفرع الرئيسي'
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_session public.business_bridge_authorization_sessions%rowtype;
  v_location_id uuid;
  v_connection public.business_accounting_connections%rowtype;
  v_source_id uuid;
  v_business_name text;
  v_provider_code text;
  v_display_name text;
begin
  if p_user_id is null or p_business_id is null then
    raise exception 'invalid_authorization_request' using errcode = '22023';
  end if;

  select * into v_session
  from public.business_bridge_authorization_sessions
  where session_public_id = p_session_public_id
    and browser_secret_hash = lower(btrim(p_browser_secret_hash))
  for update;

  if not found then
    raise exception 'authorization_session_invalid' using errcode = '42501';
  end if;

  if v_session.status <> 'pending' then
    raise exception 'authorization_session_not_pending' using errcode = '42501';
  end if;

  if v_session.expires_at <= now() then
    update public.business_bridge_authorization_sessions
    set status = 'expired'
    where id = v_session.id;
    raise exception 'authorization_session_expired' using errcode = '42501';
  end if;

  if not public.has_business_team_permission(p_business_id, 'manage_accounting_integrations', p_user_id) then
    raise exception 'accounting_integration_permission_required' using errcode = '42501';
  end if;

  select b.name into v_business_name
  from public.business_profiles b
  where b.id = p_business_id;

  if v_business_name is null then
    raise exception 'business_not_found' using errcode = '22023';
  end if;

  if p_location_id is not null then
    select l.id into v_location_id
    from public.business_locations l
    where l.id = p_location_id
      and l.business_id = p_business_id
      and l.status = 'active';
    if v_location_id is null then
      raise exception 'business_location_invalid' using errcode = '22023';
    end if;
  else
    select l.id into v_location_id
    from public.business_locations l
    where l.business_id = p_business_id
      and l.is_primary = true
      and l.status = 'active'
    order by l.created_at asc
    limit 1;

    if v_location_id is null then
      insert into public.business_locations (business_id, code, name, is_primary, status)
      values (
        p_business_id, 'main',
        coalesce(nullif(btrim(p_location_name), ''), 'الفرع الرئيسي'),
        true, 'active'
      )
      on conflict (business_id, code)
      do update set
        name = coalesce(nullif(btrim(p_location_name), ''), public.business_locations.name),
        is_primary = true,
        status = 'active',
        updated_at = now()
      returning id into v_location_id;
    end if;
  end if;

  v_provider_code := lower(btrim(v_session.adapter_code));
  v_display_name := case
    when v_provider_code in ('edaa','edaa_v5') then 'إبداع سوفت'
    else v_provider_code
  end;

  select c.* into v_connection
  from public.business_accounting_connections c
  where c.business_id = p_business_id
    and c.location_id = v_location_id
    and c.provider_code = v_provider_code
    and c.status <> 'disconnected'
  order by c.created_at asc
  limit 1;

  if not found then
    insert into public.business_accounting_connections (
      business_id, location_id, provider_code, display_name,
      connection_mode, status, adapter_version, event_schema_version
    ) values (
      p_business_id, v_location_id, v_provider_code, v_display_name,
      'read_only', 'pending', nullif(btrim(v_session.adapter_version), ''), 1
    ) returning * into v_connection;
  else
    update public.business_accounting_connections
    set display_name = v_display_name,
        adapter_version = coalesce(nullif(btrim(v_session.adapter_version), ''), adapter_version),
        updated_at = now()
    where id = v_connection.id
    returning * into v_connection;
  end if;

  insert into public.business_erp_source_instances (
    business_id, location_id, connection_id, source_key, source_label,
    source_version, schema_fingerprint, status, last_seen_at
  ) values (
    p_business_id, v_location_id, v_connection.id, btrim(v_session.source_key),
    nullif(btrim(v_session.source_label), ''), nullif(btrim(v_session.source_version), ''),
    nullif(btrim(v_session.schema_fingerprint), ''), 'active', now()
  )
  on conflict (connection_id, source_key)
  do update set
    source_label = coalesce(excluded.source_label, public.business_erp_source_instances.source_label),
    source_version = coalesce(excluded.source_version, public.business_erp_source_instances.source_version),
    schema_fingerprint = coalesce(excluded.schema_fingerprint, public.business_erp_source_instances.schema_fingerprint),
    status = case when public.business_erp_source_instances.status = 'retired' then 'active' else public.business_erp_source_instances.status end,
    last_seen_at = now(),
    updated_at = now()
  returning id into v_source_id;

  update public.business_bridge_authorization_sessions
  set status = 'authorized',
      authorized_by_user_id = p_user_id,
      business_id = p_business_id,
      location_id = v_location_id,
      connection_id = v_connection.id,
      source_instance_id = v_source_id,
      authorized_at = now()
  where id = v_session.id;

  return jsonb_build_object(
    'status', 'authorized',
    'session_public_id', v_session.session_public_id,
    'business_id', p_business_id,
    'business_name', v_business_name,
    'location_id', v_location_id,
    'connection_id', v_connection.id,
    'source_instance_id', v_source_id,
    'authorized_by_user_id', p_user_id,
    'contract_version', 1
  );
end;
$function$;

revoke all on function public.authorize_bridge_installation_v1(uuid,text,uuid,uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.authorize_bridge_installation_v1(uuid,text,uuid,uuid,uuid,text) to service_role;

create or replace function public.claim_bridge_authorization_session_v1(
  p_session_public_id uuid,
  p_claim_secret_hash text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_session public.business_bridge_authorization_sessions%rowtype;
  v_device_id uuid;
  v_device_public_id uuid;
  v_business_name text;
begin
  select * into v_session
  from public.business_bridge_authorization_sessions
  where session_public_id = p_session_public_id
    and claim_secret_hash = lower(btrim(p_claim_secret_hash))
  for update;

  if not found then
    raise exception 'claim_session_invalid' using errcode = '42501';
  end if;

  if v_session.expires_at <= now() and v_session.status in ('pending','authorized') then
    update public.business_bridge_authorization_sessions
    set status = 'expired'
    where id = v_session.id;
    return jsonb_build_object('status','expired','contract_version',1);
  end if;

  if v_session.status = 'pending' then
    return jsonb_build_object('status','pending','expires_at',v_session.expires_at,'contract_version',1);
  end if;

  if v_session.status in ('denied','expired','revoked') then
    return jsonb_build_object('status',v_session.status,'contract_version',1);
  end if;

  if v_session.status = 'consumed' and v_session.device_id is not null then
    select d.device_public_id into v_device_public_id
    from public.business_bridge_devices d
    where d.id = v_session.device_id;
    select b.name into v_business_name from public.business_profiles b where b.id = v_session.business_id;
    return jsonb_build_object(
      'status','connected',
      'device_public_id',v_device_public_id,
      'business_id',v_session.business_id,
      'business_name',v_business_name,
      'location_id',v_session.location_id,
      'connection_id',v_session.connection_id,
      'source_instance_id',v_session.source_instance_id,
      'contract_version',1
    );
  end if;

  if v_session.status <> 'authorized'
     or v_session.business_id is null
     or v_session.connection_id is null
     or v_session.source_instance_id is null
     or v_session.authorized_by_user_id is null then
    raise exception 'authorization_session_incomplete' using errcode = '22023';
  end if;

  insert into public.business_bridge_devices (
    business_id, location_id, connection_id, source_instance_id,
    device_label, status, bridge_version, adapter_version, last_heartbeat_at,
    authorized_by_user_id, authorized_at, authorization_method
  ) values (
    v_session.business_id, v_session.location_id, v_session.connection_id, v_session.source_instance_id,
    nullif(btrim(v_session.device_label), ''), 'active',
    nullif(btrim(v_session.bridge_version), ''), nullif(btrim(v_session.adapter_version), ''), now(),
    v_session.authorized_by_user_id, v_session.authorized_at, v_session.authorization_method
  ) returning id, device_public_id into v_device_id, v_device_public_id;

  insert into public.business_bridge_device_credentials (
    device_id, secret_hash, secret_prefix, status
  ) values (
    v_device_id, v_session.device_credential_hash, v_session.device_credential_prefix, 'active'
  );

  update public.business_bridge_authorization_sessions
  set status = 'consumed', device_id = v_device_id, consumed_at = now()
  where id = v_session.id;

  update public.business_accounting_connections
  set status = 'connected', last_heartbeat_at = now(), updated_at = now()
  where id = v_session.connection_id;

  select b.name into v_business_name from public.business_profiles b where b.id = v_session.business_id;

  return jsonb_build_object(
    'status','connected',
    'device_public_id',v_device_public_id,
    'business_id',v_session.business_id,
    'business_name',v_business_name,
    'location_id',v_session.location_id,
    'connection_id',v_session.connection_id,
    'source_instance_id',v_session.source_instance_id,
    'contract_version',1
  );
end;
$function$;

revoke all on function public.claim_bridge_authorization_session_v1(uuid,text) from public, anon, authenticated;
grant execute on function public.claim_bridge_authorization_session_v1(uuid,text) to service_role;

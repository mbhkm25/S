create table public.business_bridge_pairing_tokens (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.business_profiles(id) on delete cascade,
  connection_id uuid not null references public.business_accounting_connections(id) on delete cascade,
  source_instance_id uuid not null references public.business_erp_source_instances(id) on delete cascade,
  created_by_user_id uuid not null references public.profiles(id) on delete restrict,
  device_id uuid references public.business_bridge_devices(id) on delete set null,
  token_hash text not null unique,
  token_prefix text not null,
  status text not null default 'pending' check (status in ('pending','consumed','revoked','expired')),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create index business_bridge_pairing_tokens_business_status_idx
  on public.business_bridge_pairing_tokens(business_id, status, expires_at desc);
create index business_bridge_pairing_tokens_connection_idx
  on public.business_bridge_pairing_tokens(connection_id);
create index business_bridge_pairing_tokens_source_idx
  on public.business_bridge_pairing_tokens(source_instance_id);
create index business_bridge_pairing_tokens_created_by_idx
  on public.business_bridge_pairing_tokens(created_by_user_id);
create index business_bridge_pairing_tokens_device_idx
  on public.business_bridge_pairing_tokens(device_id)
  where device_id is not null;

alter table public.business_bridge_pairing_tokens enable row level security;

create policy business_bridge_pairing_tokens_owner_insert
on public.business_bridge_pairing_tokens for insert to authenticated
with check (
  private.user_is_business_owner(business_id, (select auth.uid()))
  and created_by_user_id = (select auth.uid())
);

create or replace function public.create_business_bridge_pairing_v1(
  p_connection_id uuid,
  p_source_key text,
  p_source_label text default null,
  p_source_version text default null,
  p_schema_fingerprint text default null,
  p_expires_minutes integer default 10
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_connection public.business_accounting_connections%rowtype;
  v_source_id uuid;
  v_token text;
  v_token_hash text;
  v_expires_at timestamptz;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  if nullif(btrim(p_source_key), '') is null then
    raise exception 'source_key_required' using errcode = '22023';
  end if;

  if p_expires_minutes is null or p_expires_minutes < 2 or p_expires_minutes > 30 then
    raise exception 'invalid_pairing_expiry' using errcode = '22023';
  end if;

  select c.* into v_connection
  from public.business_accounting_connections c
  where c.id = p_connection_id
  limit 1;

  if not found or not private.user_is_business_owner(v_connection.business_id, v_uid) then
    raise exception 'business_owner_required' using errcode = '42501';
  end if;

  if v_connection.connection_mode <> 'read_only' then
    raise exception 'unsupported_connection_mode' using errcode = '22023';
  end if;

  insert into public.business_erp_source_instances (
    business_id, location_id, connection_id, source_key, source_label,
    source_version, schema_fingerprint, status, last_seen_at
  ) values (
    v_connection.business_id, v_connection.location_id, v_connection.id, btrim(p_source_key),
    nullif(btrim(p_source_label), ''), nullif(btrim(p_source_version), ''),
    nullif(btrim(p_schema_fingerprint), ''), 'active', now()
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

  update public.business_bridge_pairing_tokens
  set status = 'revoked'
  where connection_id = v_connection.id
    and source_instance_id = v_source_id
    and status = 'pending';

  v_token := encode(extensions.gen_random_bytes(24), 'hex');
  v_token_hash := encode(extensions.digest(v_token, 'sha256'), 'hex');
  v_expires_at := now() + make_interval(mins => p_expires_minutes);

  insert into public.business_bridge_pairing_tokens (
    business_id, connection_id, source_instance_id, created_by_user_id,
    token_hash, token_prefix, expires_at
  ) values (
    v_connection.business_id, v_connection.id, v_source_id, v_uid,
    v_token_hash, left(v_token, 8), v_expires_at
  );

  return jsonb_build_object(
    'pairing_token', v_token,
    'expires_at', v_expires_at,
    'connection_id', v_connection.id,
    'source_instance_id', v_source_id,
    'contract_version', 1
  );
end;
$function$;

revoke all on function public.create_business_bridge_pairing_v1(uuid,text,text,text,text,integer) from public;
revoke all on function public.create_business_bridge_pairing_v1(uuid,text,text,text,text,integer) from anon;
grant execute on function public.create_business_bridge_pairing_v1(uuid,text,text,text,text,integer) to authenticated;

create or replace function public.consume_business_bridge_pairing_v1(
  p_pairing_token_hash text,
  p_device_label text,
  p_bridge_version text,
  p_adapter_version text,
  p_credential_hash text,
  p_credential_prefix text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_pairing public.business_bridge_pairing_tokens%rowtype;
  v_device_id uuid;
  v_device_public_id uuid;
begin
  if nullif(btrim(p_pairing_token_hash), '') is null
     or nullif(btrim(p_credential_hash), '') is null
     or nullif(btrim(p_credential_prefix), '') is null then
    raise exception 'invalid_pairing_request' using errcode = '22023';
  end if;

  select t.* into v_pairing
  from public.business_bridge_pairing_tokens t
  where t.token_hash = btrim(p_pairing_token_hash)
  for update;

  if not found then
    raise exception 'pairing_token_invalid' using errcode = '42501';
  end if;

  if v_pairing.status <> 'pending' then
    raise exception 'pairing_token_not_pending' using errcode = '42501';
  end if;

  if v_pairing.expires_at <= now() then
    update public.business_bridge_pairing_tokens
    set status = 'expired'
    where id = v_pairing.id;
    raise exception 'pairing_token_expired' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.business_accounting_connections c
    join public.business_erp_source_instances s on s.connection_id = c.id
    where c.id = v_pairing.connection_id
      and s.id = v_pairing.source_instance_id
      and c.business_id = v_pairing.business_id
      and s.business_id = v_pairing.business_id
      and c.status in ('pending','connected')
      and s.status in ('active','changed')
  ) then
    raise exception 'pairing_source_not_active' using errcode = '42501';
  end if;

  insert into public.business_bridge_devices (
    business_id, location_id, connection_id, source_instance_id,
    device_label, status, bridge_version, adapter_version, last_heartbeat_at
  )
  select
    v_pairing.business_id,
    c.location_id,
    v_pairing.connection_id,
    v_pairing.source_instance_id,
    nullif(btrim(p_device_label), ''),
    'active',
    nullif(btrim(p_bridge_version), ''),
    nullif(btrim(p_adapter_version), ''),
    now()
  from public.business_accounting_connections c
  where c.id = v_pairing.connection_id
  returning id, device_public_id into v_device_id, v_device_public_id;

  insert into public.business_bridge_device_credentials (
    device_id, secret_hash, secret_prefix, status
  ) values (
    v_device_id, btrim(p_credential_hash), btrim(p_credential_prefix), 'active'
  );

  update public.business_bridge_pairing_tokens
  set status = 'consumed', consumed_at = now(), device_id = v_device_id
  where id = v_pairing.id;

  return jsonb_build_object(
    'device_id', v_device_id,
    'device_public_id', v_device_public_id,
    'business_id', v_pairing.business_id,
    'connection_id', v_pairing.connection_id,
    'source_instance_id', v_pairing.source_instance_id,
    'contract_version', 1
  );
end;
$function$;

revoke all on function public.consume_business_bridge_pairing_v1(text,text,text,text,text,text) from public;
revoke all on function public.consume_business_bridge_pairing_v1(text,text,text,text,text,text) from anon;
revoke all on function public.consume_business_bridge_pairing_v1(text,text,text,text,text,text) from authenticated;
grant execute on function public.consume_business_bridge_pairing_v1(text,text,text,text,text,text) to service_role;
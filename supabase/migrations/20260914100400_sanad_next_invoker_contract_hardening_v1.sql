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

  -- Access is enforced by RLS on business_activity_events/business_parties.
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

  if not exists (
    select 1
    from public.business_profiles b
    where b.id = p_business_id
      and b.owner_user_id = v_uid
  ) then
    raise exception 'business_owner_required' using errcode = '42501';
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
    insert into public.business_locations (
      business_id, code, name, is_primary, status
    ) values (
      p_business_id,
      'main',
      coalesce(nullif(btrim(p_location_name), ''), 'الفرع الرئيسي'),
      true,
      'active'
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
    )
    returning * into v_connection;
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
    'contract_version', 1
  );
end;
$function$;

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

  if not found or not exists (
    select 1
    from public.business_profiles b
    where b.id = v_connection.business_id
      and b.owner_user_id = v_uid
  ) then
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

create or replace function public.get_business_accounting_connections_v1(
  p_business_id uuid
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $function$
  select jsonb_build_object(
    'items', coalesce(jsonb_agg(to_jsonb(x) order by x.created_at asc), '[]'::jsonb),
    'contract_version', 1
  )
  from (
    select
      c.id as connection_id,
      c.business_id,
      c.location_id,
      l.name as location_name,
      c.provider_code,
      c.display_name,
      c.connection_mode,
      c.status,
      c.adapter_version,
      c.event_schema_version,
      c.last_sync_at,
      c.last_heartbeat_at,
      c.last_error_code,
      c.last_error_at,
      c.created_at,
      (
        select count(*)::integer
        from public.business_bridge_devices d
        where d.connection_id = c.id and d.status = 'active'
      ) as active_devices
    from public.business_accounting_connections c
    left join public.business_locations l on l.id = c.location_id
    where c.business_id = p_business_id
  ) x;
$function$;
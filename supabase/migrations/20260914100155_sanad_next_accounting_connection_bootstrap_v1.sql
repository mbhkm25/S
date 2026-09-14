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

  if not private.user_is_business_owner(p_business_id, v_uid) then
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

revoke all on function public.create_business_accounting_connection_v1(uuid,text,text,text) from public;
revoke all on function public.create_business_accounting_connection_v1(uuid,text,text,text) from anon;
grant execute on function public.create_business_accounting_connection_v1(uuid,text,text,text) to authenticated;

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
      and (
        private.user_is_business_owner(c.business_id, (select auth.uid()))
        or private.user_is_active_business_member(c.business_id, (select auth.uid()))
      )
  ) x;
$function$;

revoke all on function public.get_business_accounting_connections_v1(uuid) from public;
revoke all on function public.get_business_accounting_connections_v1(uuid) from anon;
grant execute on function public.get_business_accounting_connections_v1(uuid) to authenticated;
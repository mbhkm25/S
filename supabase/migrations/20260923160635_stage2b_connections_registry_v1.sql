-- Stage 2B Data Train D2 / Generic Connections Registry v1
-- Adds a normalized registry without replacing provider-specific canonical tables.

create table if not exists public.sanad_connections (
  id uuid primary key default gen_random_uuid(),
  scope_kind text not null
    check (scope_kind in ('user','business')),
  user_id uuid null references auth.users(id) on delete cascade,
  business_id uuid null references public.business_profiles(id) on delete cascade,
  connection_kind text not null
    check (connection_kind ~ '^[a-z0-9_]{2,40}$'),
  provider_code text not null
    check (provider_code ~ '^[a-z0-9_]{2,64}$'),
  display_name text not null
    check (length(btrim(display_name)) between 1 and 160),
  status text not null default 'authorizing'
    check (status in ('authorizing','connected','degraded','attention_required','disconnected')),
  capabilities jsonb not null default '{}'::jsonb
    check (jsonb_typeof(capabilities)='object'),
  health_status text not null default 'attention_required'
    check (health_status in ('connected','degraded','attention_required','disconnected','authorizing')),
  last_connected_at timestamptz null,
  last_sync_at timestamptz null,
  last_heartbeat_at timestamptz null,
  last_error_code text null,
  last_error_at timestamptz null,
  source_type text null,
  source_id uuid null,
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata)='object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sanad_connections_scope_owner_check check (
    (scope_kind='user' and user_id is not null and business_id is null)
    or
    (scope_kind='business' and business_id is not null and user_id is null)
  ),
  constraint sanad_connections_source_pair_check check (
    (source_type is null and source_id is null)
    or
    (source_type is not null and source_id is not null)
  )
);

create unique index if not exists sanad_connections_source_unique_idx
  on public.sanad_connections(source_type,source_id)
  where source_type is not null and source_id is not null;

create index if not exists sanad_connections_user_status_idx
  on public.sanad_connections(user_id,status,updated_at desc)
  where user_id is not null;

create index if not exists sanad_connections_business_status_idx
  on public.sanad_connections(business_id,status,updated_at desc)
  where business_id is not null;

alter table public.sanad_connections enable row level security;
revoke all on table public.sanad_connections from anon,authenticated;
grant select,insert,update,delete on table public.sanad_connections to service_role;

create or replace function private.normalize_sanad_connection_status_v1(
  p_status text
)
returns text
language sql
immutable
set search_path to ''
as $function$
  select case lower(coalesce(p_status,''))
    when 'connected' then 'connected'
    when 'active' then 'connected'
    when 'paired' then 'connected'
    when 'pending' then 'authorizing'
    when 'authorizing' then 'authorizing'
    when 'degraded' then 'degraded'
    when 'error' then 'attention_required'
    when 'attention_required' then 'attention_required'
    when 'disconnected' then 'disconnected'
    else 'attention_required'
  end;
$function$;

create or replace function private.sync_accounting_connection_to_registry_v1()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_status text;
  v_health text;
begin
  if tg_op='DELETE' then
    update public.sanad_connections
    set status='disconnected',
        health_status='disconnected',
        last_error_code=coalesce(last_error_code,'source_deleted'),
        last_error_at=coalesce(last_error_at,now()),
        metadata=metadata || jsonb_build_object('source_deleted',true),
        updated_at=now()
    where source_type='business_accounting_connection'
      and source_id=old.id;
    return old;
  end if;

  v_status := private.normalize_sanad_connection_status_v1(new.status);
  v_health := case
    when new.last_error_code is not null and v_status='connected' then 'degraded'
    else v_status
  end;

  insert into public.sanad_connections(
    scope_kind,business_id,connection_kind,provider_code,display_name,
    status,capabilities,health_status,last_connected_at,last_sync_at,
    last_heartbeat_at,last_error_code,last_error_at,source_type,source_id,metadata
  ) values (
    'business',
    new.business_id,
    'accounting',
    new.provider_code,
    new.display_name,
    v_status,
    jsonb_build_object(
      'read_entities',true,
      'read_transactions',true,
      'read_documents',true,
      'send_messages',false,
      'receive_messages',false,
      'sync_contacts',false,
      'create_drafts',false,
      'write_back',new.connection_mode <> 'read_only'
    ),
    v_health,
    case when v_status='connected' then coalesce(new.last_heartbeat_at,new.updated_at,new.created_at) else null end,
    new.last_sync_at,
    new.last_heartbeat_at,
    new.last_error_code,
    new.last_error_at,
    'business_accounting_connection',
    new.id,
    jsonb_build_object(
      'connection_mode',new.connection_mode,
      'adapter_version',new.adapter_version,
      'event_schema_version',new.event_schema_version
    )
  )
  on conflict (source_type,source_id) where source_type is not null and source_id is not null
  do update set
    business_id=excluded.business_id,
    provider_code=excluded.provider_code,
    display_name=excluded.display_name,
    status=excluded.status,
    capabilities=excluded.capabilities,
    health_status=excluded.health_status,
    last_connected_at=coalesce(public.sanad_connections.last_connected_at,excluded.last_connected_at),
    last_sync_at=excluded.last_sync_at,
    last_heartbeat_at=excluded.last_heartbeat_at,
    last_error_code=excluded.last_error_code,
    last_error_at=excluded.last_error_at,
    metadata=excluded.metadata,
    updated_at=now();

  return new;
end;
$function$;

revoke all on function private.normalize_sanad_connection_status_v1(text) from public,anon,authenticated;
revoke all on function private.sync_accounting_connection_to_registry_v1() from public,anon,authenticated;

drop trigger if exists sanad_accounting_connection_registry_sync_v1
  on public.business_accounting_connections;
create trigger sanad_accounting_connection_registry_sync_v1
after insert or update or delete on public.business_accounting_connections
for each row
execute function private.sync_accounting_connection_to_registry_v1();

insert into public.sanad_connections(
  scope_kind,business_id,connection_kind,provider_code,display_name,
  status,capabilities,health_status,last_connected_at,last_sync_at,
  last_heartbeat_at,last_error_code,last_error_at,source_type,source_id,metadata
)
select
  'business',
  c.business_id,
  'accounting',
  c.provider_code,
  c.display_name,
  private.normalize_sanad_connection_status_v1(c.status),
  jsonb_build_object(
    'read_entities',true,
    'read_transactions',true,
    'read_documents',true,
    'send_messages',false,
    'receive_messages',false,
    'sync_contacts',false,
    'create_drafts',false,
    'write_back',c.connection_mode <> 'read_only'
  ),
  case
    when c.last_error_code is not null and private.normalize_sanad_connection_status_v1(c.status)='connected'
      then 'degraded'
    else private.normalize_sanad_connection_status_v1(c.status)
  end,
  case when private.normalize_sanad_connection_status_v1(c.status)='connected'
    then coalesce(c.last_heartbeat_at,c.updated_at,c.created_at)
    else null
  end,
  c.last_sync_at,
  c.last_heartbeat_at,
  c.last_error_code,
  c.last_error_at,
  'business_accounting_connection',
  c.id,
  jsonb_build_object(
    'connection_mode',c.connection_mode,
    'adapter_version',c.adapter_version,
    'event_schema_version',c.event_schema_version
  )
from public.business_accounting_connections c
on conflict (source_type,source_id) where source_type is not null and source_id is not null
do update set
  business_id=excluded.business_id,
  provider_code=excluded.provider_code,
  display_name=excluded.display_name,
  status=excluded.status,
  capabilities=excluded.capabilities,
  health_status=excluded.health_status,
  last_connected_at=coalesce(public.sanad_connections.last_connected_at,excluded.last_connected_at),
  last_sync_at=excluded.last_sync_at,
  last_heartbeat_at=excluded.last_heartbeat_at,
  last_error_code=excluded.last_error_code,
  last_error_at=excluded.last_error_at,
  metadata=excluded.metadata,
  updated_at=now();

create or replace function public.list_my_sanad_connections_v1(
  p_business_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'authentication_required' using errcode='42501';
  end if;

  if p_business_id is not null and not (
    private.user_is_business_owner(p_business_id,v_uid)
    or private.user_is_active_business_member(p_business_id,v_uid)
  ) then
    raise exception 'business_access_denied' using errcode='42501';
  end if;

  return jsonb_build_object(
    'items',coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id',c.id,
          'scope_kind',c.scope_kind,
          'user_id',c.user_id,
          'business_id',c.business_id,
          'connection_kind',c.connection_kind,
          'provider_code',c.provider_code,
          'display_name',c.display_name,
          'status',c.status,
          'health_status',c.health_status,
          'capabilities',c.capabilities,
          'last_connected_at',c.last_connected_at,
          'last_sync_at',c.last_sync_at,
          'last_heartbeat_at',c.last_heartbeat_at,
          'last_error_code',c.last_error_code,
          'last_error_at',c.last_error_at,
          'source_type',c.source_type,
          'source_id',c.source_id,
          'metadata',c.metadata,
          'created_at',c.created_at,
          'updated_at',c.updated_at
        )
        order by c.updated_at desc,c.created_at desc
      )
      from public.sanad_connections c
      where (
        c.scope_kind='user'
        and c.user_id=v_uid
        and p_business_id is null
      ) or (
        c.scope_kind='business'
        and (p_business_id is null or c.business_id=p_business_id)
        and (
          private.user_is_business_owner(c.business_id,v_uid)
          or private.user_is_active_business_member(c.business_id,v_uid)
        )
      )
    ),'[]'::jsonb),
    'contract_version',1
  );
end;
$function$;

create or replace function public.get_my_sanad_connection_v1(
  p_connection_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_row public.sanad_connections%rowtype;
begin
  if v_uid is null then
    raise exception 'authentication_required' using errcode='42501';
  end if;

  select * into v_row
  from public.sanad_connections
  where id=p_connection_id;

  if not found or not (
    (v_row.scope_kind='user' and v_row.user_id=v_uid)
    or
    (v_row.scope_kind='business' and (
      private.user_is_business_owner(v_row.business_id,v_uid)
      or private.user_is_active_business_member(v_row.business_id,v_uid)
    ))
  ) then
    raise exception 'connection_not_found' using errcode='P0002';
  end if;

  return jsonb_build_object(
    'connection',to_jsonb(v_row),
    'contract_version',1
  );
end;
$function$;

revoke all on function public.list_my_sanad_connections_v1(uuid) from public,anon;
revoke all on function public.get_my_sanad_connection_v1(uuid) from public,anon;
grant execute on function public.list_my_sanad_connections_v1(uuid) to authenticated;
grant execute on function public.get_my_sanad_connection_v1(uuid) to authenticated;

comment on table public.sanad_connections is
'Normalized external-connection registry. Provider-specific tables remain canonical; no provider secrets belong here.';

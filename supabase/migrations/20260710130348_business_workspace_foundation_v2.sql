-- SANAD Business Workspace Foundation v2
--
-- Review status: PREPARED, NOT APPLIED.
-- Scope:
--   * one default workspace per existing business owner
--   * multiple business profiles per workspace
--   * explicit workspace membership and permissions
--   * backward-compatible business RPC response shapes
--
-- This migration intentionally does not grant existing business team members
-- workspace membership. Business-level membership remains business-scoped.

begin;

do $preflight$
begin
  if to_regclass('public.profiles') is null
    or to_regclass('public.business_profiles') is null
    or to_regclass('public.business_team_members') is null
    or to_regclass('public.business_customers') is null
    or to_regclass('public.business_invitations') is null then
    raise exception 'workspace_foundation_missing_required_business_tables';
  end if;

  if exists (
    select 1
    from public.business_profiles
    where owner_user_id is null
  ) then
    raise exception 'workspace_foundation_business_owner_is_null';
  end if;
end;
$preflight$;

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

create table public.business_workspaces (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.profiles(id) on delete restrict,
  name text not null,
  status text not null default 'active'
    check (status in ('active', 'suspended', 'archived')),
  is_default boolean not null default false,
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint business_workspaces_name_check check (length(trim(name)) between 2 and 120)
);

create unique index business_workspaces_one_default_per_owner_idx
  on public.business_workspaces(owner_user_id)
  where is_default;

create index business_workspaces_owner_status_idx
  on public.business_workspaces(owner_user_id, status);

create table public.business_workspace_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.business_workspaces(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member'
    check (role in ('owner', 'admin', 'member')),
  permissions jsonb not null default '{}'::jsonb
    check (jsonb_typeof(permissions) = 'object'),
  status text not null default 'active'
    check (status in ('active', 'suspended', 'removed')),
  added_by_user_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, user_id)
);

create index business_workspace_members_user_status_idx
  on public.business_workspace_members(user_id, status);

create index business_workspace_members_workspace_status_idx
  on public.business_workspace_members(workspace_id, status);

create or replace function private.set_workspace_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $function$
begin
  new.updated_at := now();
  return new;
end;
$function$;

revoke all on function private.set_workspace_updated_at() from public;

create trigger business_workspaces_set_updated_at
before update on public.business_workspaces
for each row execute function private.set_workspace_updated_at();

create trigger business_workspace_members_set_updated_at
before update on public.business_workspace_members
for each row execute function private.set_workspace_updated_at();

alter table public.business_profiles
  add column workspace_id uuid;

alter table public.business_profiles
  add constraint business_profiles_workspace_id_fkey
  foreign key (workspace_id)
  references public.business_workspaces(id)
  on delete restrict;

insert into public.business_workspaces (
  owner_user_id,
  name,
  is_default,
  metadata
)
select
  bp.owner_user_id,
  coalesce(nullif(trim(min(bp.name)), ''), 'مساحة أعمالي'),
  true,
  jsonb_build_object('source', 'business_workspace_foundation_v2_backfill')
from public.business_profiles bp
group by bp.owner_user_id
on conflict (owner_user_id) where is_default
do nothing;

update public.business_profiles bp
set workspace_id = bw.id
from public.business_workspaces bw
where bw.owner_user_id = bp.owner_user_id
  and bw.is_default = true
  and bp.workspace_id is null;

insert into public.business_workspace_members (
  workspace_id,
  user_id,
  role,
  permissions,
  status,
  added_by_user_id
)
select
  bw.id,
  bw.owner_user_id,
  'owner',
  '{}'::jsonb,
  'active',
  bw.owner_user_id
from public.business_workspaces bw
where bw.is_default = true
on conflict (workspace_id, user_id) do update
set role = 'owner',
    status = 'active',
    updated_at = now();

do $backfill_validation$
begin
  if exists (
    select 1
    from public.business_profiles
    where workspace_id is null
  ) then
    raise exception 'workspace_foundation_backfill_left_unlinked_businesses';
  end if;

  if exists (
    select 1
    from public.business_profiles bp
    left join public.business_workspace_members bwm
      on bwm.workspace_id = bp.workspace_id
     and bwm.user_id = bp.owner_user_id
     and bwm.role = 'owner'
     and bwm.status = 'active'
    where bwm.id is null
  ) then
    raise exception 'workspace_foundation_backfill_missing_owner_membership';
  end if;
end;
$backfill_validation$;

alter table public.business_profiles
  alter column workspace_id set not null;

create index business_profiles_workspace_status_idx
  on public.business_profiles(workspace_id, public_status);

-- Remove every single-column UNIQUE constraint/index on owner_user_id without
-- assuming the historical constraint name.
do $drop_owner_uniqueness$
declare
  v_constraint record;
  v_index record;
  v_owner_attnum smallint;
begin
  select a.attnum::smallint
  into v_owner_attnum
  from pg_attribute a
  where a.attrelid = 'public.business_profiles'::regclass
    and a.attname = 'owner_user_id'
    and not a.attisdropped;

  for v_constraint in
    select con.conname
    from pg_constraint con
    where con.conrelid = 'public.business_profiles'::regclass
      and con.contype = 'u'
      and con.conkey = array[v_owner_attnum]::smallint[]
  loop
    execute format(
      'alter table public.business_profiles drop constraint %I',
      v_constraint.conname
    );
  end loop;

  for v_index in
    select idx.relname as index_name
    from pg_index i
    join pg_class idx on idx.oid = i.indexrelid
    left join pg_constraint con on con.conindid = i.indexrelid
    where i.indrelid = 'public.business_profiles'::regclass
      and i.indisunique
      and i.indnatts = 1
      and i.indkey::text = v_owner_attnum::text
      and con.oid is null
  loop
    execute format('drop index if exists public.%I', v_index.index_name);
  end loop;
end;
$drop_owner_uniqueness$;

create or replace function private.workspace_effective_permissions(
  p_role text,
  p_permissions jsonb default '{}'::jsonb
)
returns jsonb
language sql
immutable
security invoker
set search_path = pg_catalog
as $function$
  select case p_role
    when 'owner' then jsonb_build_object(
      'view_businesses', true,
      'create_business', true,
      'manage_businesses', true,
      'manage_members', true,
      'link_operations', true
    )
    when 'admin' then jsonb_build_object(
      'view_businesses', true,
      'create_business', true,
      'manage_businesses', true,
      'manage_members', true,
      'link_operations', true
    )
    else jsonb_build_object(
      'view_businesses', true,
      'create_business', false,
      'manage_businesses', false,
      'manage_members', false,
      'link_operations', false
    )
  end || coalesce(p_permissions, '{}'::jsonb);
$function$;

create or replace function private.is_business_workspace_member(p_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select exists (
    select 1
    from public.business_workspace_members bwm
    where bwm.workspace_id = p_workspace_id
      and bwm.user_id = (select auth.uid())
      and bwm.status = 'active'
  );
$function$;

create or replace function private.can_manage_business_workspace(p_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select exists (
    select 1
    from public.business_workspace_members bwm
    where bwm.workspace_id = p_workspace_id
      and bwm.user_id = (select auth.uid())
      and bwm.status = 'active'
      and (
        bwm.role in ('owner', 'admin')
        or lower(coalesce(bwm.permissions ->> 'manage_members', 'false')) = 'true'
      )
  );
$function$;

create or replace function private.can_create_business_in_workspace(p_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select exists (
    select 1
    from public.business_workspace_members bwm
    where bwm.workspace_id = p_workspace_id
      and bwm.user_id = (select auth.uid())
      and bwm.status = 'active'
      and (
        bwm.role in ('owner', 'admin')
        or lower(coalesce(bwm.permissions ->> 'create_business', 'false')) = 'true'
      )
  );
$function$;

revoke all on function private.workspace_effective_permissions(text, jsonb) from public;
revoke all on function private.is_business_workspace_member(uuid) from public;
revoke all on function private.can_manage_business_workspace(uuid) from public;
revoke all on function private.can_create_business_in_workspace(uuid) from public;

grant execute on function private.workspace_effective_permissions(text, jsonb)
  to authenticated, service_role;
grant execute on function private.is_business_workspace_member(uuid)
  to authenticated, service_role;
grant execute on function private.can_manage_business_workspace(uuid)
  to authenticated, service_role;
grant execute on function private.can_create_business_in_workspace(uuid)
  to authenticated, service_role;

alter table public.business_workspaces enable row level security;
alter table public.business_workspace_members enable row level security;

create policy business_workspaces_select_member
on public.business_workspaces
for select
to authenticated
using (private.is_business_workspace_member(id));

create policy business_workspace_members_select_member
on public.business_workspace_members
for select
to authenticated
using (private.is_business_workspace_member(workspace_id));

-- Mutations remain RPC-only in this foundation. No direct INSERT, UPDATE, or
-- DELETE policies are intentionally created for workspace tables.
revoke all on table public.business_workspaces from anon, authenticated;
revoke all on table public.business_workspace_members from anon, authenticated;
grant select on table public.business_workspaces to authenticated;
grant select on table public.business_workspace_members to authenticated;
grant all on table public.business_workspaces to service_role;
grant all on table public.business_workspace_members to service_role;

create policy business_profiles_select_workspace_member
on public.business_profiles
for select
to authenticated
using (private.is_business_workspace_member(workspace_id));

drop function if exists public.create_business_profile(
  text,
  text,
  uuid,
  text,
  text,
  text,
  text,
  text
);

create function public.create_business_profile(
  p_name text,
  p_slug text default null::text,
  p_category_id uuid default null::uuid,
  p_governorate text default null::text,
  p_city text default null::text,
  p_whatsapp text default null::text,
  p_description text default null::text,
  p_logo_path text default null::text,
  p_workspace_id uuid default null::uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_user_id uuid := auth.uid();
  v_profile public.profiles%rowtype;
  v_workspace public.business_workspaces%rowtype;
  v_slug text;
  v_business public.business_profiles%rowtype;
begin
  if v_user_id is null then
    raise exception 'not_authenticated';
  end if;

  select *
  into v_profile
  from public.profiles
  where id = v_user_id
    and status = 'active';

  if not found then
    raise exception 'profile_not_found_or_inactive';
  end if;

  if p_name is null or length(trim(p_name)) < 2 then
    raise exception 'business_name_required';
  end if;

  if p_whatsapp is null or p_whatsapp !~ '^967[0-9]{9}$' then
    raise exception 'valid_yemen_whatsapp_required';
  end if;

  if p_category_id is not null and not exists (
    select 1
    from public.business_categories
    where id = p_category_id
      and status = 'active'
  ) then
    raise exception 'invalid_business_category';
  end if;

  if p_workspace_id is not null then
    select *
    into v_workspace
    from public.business_workspaces bw
    where bw.id = p_workspace_id
      and bw.status = 'active'
      and private.can_create_business_in_workspace(bw.id);

    if not found then
      raise exception 'workspace_not_found_or_create_business_forbidden';
    end if;
  else
    select *
    into v_workspace
    from public.business_workspaces bw
    where bw.owner_user_id = v_user_id
      and bw.is_default = true
      and bw.status = 'active'
    order by bw.created_at
    limit 1;

    if not found then
      insert into public.business_workspaces (
        owner_user_id,
        name,
        is_default,
        metadata
      ) values (
        v_user_id,
        coalesce(nullif(trim(v_profile.full_name), ''), 'مساحة أعمالي'),
        true,
        jsonb_build_object('source', 'create_business_profile')
      )
      on conflict (owner_user_id) where is_default
      do update set updated_at = now()
      returning * into v_workspace;

      insert into public.business_workspace_members (
        workspace_id,
        user_id,
        role,
        permissions,
        status,
        added_by_user_id
      ) values (
        v_workspace.id,
        v_user_id,
        'owner',
        '{}'::jsonb,
        'active',
        v_user_id
      )
      on conflict (workspace_id, user_id) do update
      set role = 'owner',
          status = 'active',
          updated_at = now();
    end if;
  end if;

  v_slug := public.sanitize_business_slug(coalesce(p_slug, p_name));
  if length(v_slug) < 3 then
    v_slug := 'business-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 10);
  end if;

  if exists (select 1 from public.business_profiles where slug = v_slug) then
    v_slug := v_slug || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6);
  end if;

  insert into public.business_profiles (
    workspace_id,
    owner_user_id,
    name,
    slug,
    category_id,
    governorate,
    city,
    whatsapp,
    description,
    logo_path,
    public_status,
    verification_status,
    submitted_for_review_at
  ) values (
    v_workspace.id,
    v_workspace.owner_user_id,
    trim(p_name),
    v_slug,
    p_category_id,
    nullif(trim(coalesce(p_governorate, '')), ''),
    nullif(trim(coalesce(p_city, '')), ''),
    trim(p_whatsapp),
    nullif(trim(coalesce(p_description, '')), ''),
    nullif(trim(coalesce(p_logo_path, '')), ''),
    'pending_review',
    'pending_review',
    now()
  )
  returning * into v_business;

  insert into public.business_team_members (
    business_id,
    user_id,
    status,
    label,
    added_by_owner_id,
    metadata
  ) values (
    v_business.id,
    v_workspace.owner_user_id,
    'active',
    'مالك النشاط',
    v_workspace.owner_user_id,
    jsonb_build_object(
      'auto_added_workspace_owner', true,
      'created_by_user_id', v_user_id
    )
  )
  on conflict (business_id, user_id) do nothing;

  return jsonb_build_object(
    'ok', true,
    'business_id', v_business.id,
    'workspace_id', v_workspace.id,
    'business', to_jsonb(v_business)
  );
end;
$function$;

create or replace function public.get_user_business_contexts()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_user_id uuid := auth.uid();
  v_workspaces jsonb;
  v_accessible jsonb;
  v_owned jsonb;
  v_team jsonb;
  v_customers jsonb;
  v_invitations jsonb;
begin
  if v_user_id is null then
    raise exception 'not_authenticated';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'workspace_id', bw.id,
    'workspace_name', bw.name,
    'workspace_status', bw.status,
    'workspace_role', bwm.role,
    'effective_permissions', private.workspace_effective_permissions(bwm.role, bwm.permissions),
    'is_workspace_owner', bwm.role = 'owner',
    'is_default', bw.is_default
  ) order by bw.is_default desc, bw.created_at), '[]'::jsonb)
  into v_workspaces
  from public.business_workspace_members bwm
  join public.business_workspaces bw on bw.id = bwm.workspace_id
  where bwm.user_id = v_user_id
    and bwm.status = 'active'
    and bw.status = 'active';

  select coalesce(jsonb_agg(
    to_jsonb(bp) || jsonb_build_object(
      'business_id', bp.id,
      'business_name', bp.name,
      'business_status', bp.public_status,
      'workspace_name', bw.name,
      'workspace_status', bw.status,
      'workspace_role', bwm.role,
      'effective_permissions', private.workspace_effective_permissions(bwm.role, bwm.permissions),
      'is_workspace_owner', bwm.role = 'owner'
    ) order by bw.is_default desc, bp.created_at desc
  ), '[]'::jsonb)
  into v_accessible
  from public.business_workspace_members bwm
  join public.business_workspaces bw on bw.id = bwm.workspace_id
  join public.business_profiles bp on bp.workspace_id = bw.id
  where bwm.user_id = v_user_id
    and bwm.status = 'active'
    and bw.status = 'active';

  select coalesce(jsonb_agg(
    to_jsonb(bp) || jsonb_build_object(
      'business_id', bp.id,
      'business_name', bp.name,
      'business_status', bp.public_status,
      'workspace_name', bw.name,
      'workspace_status', bw.status,
      'workspace_role', bwm.role,
      'effective_permissions', private.workspace_effective_permissions(bwm.role, bwm.permissions),
      'is_workspace_owner', bwm.role = 'owner'
    ) order by bp.created_at desc
  ), '[]'::jsonb)
  into v_owned
  from public.business_profiles bp
  join public.business_workspaces bw on bw.id = bp.workspace_id
  join public.business_workspace_members bwm
    on bwm.workspace_id = bw.id
   and bwm.user_id = v_user_id
   and bwm.status = 'active'
  where bp.owner_user_id = v_user_id;

  select coalesce(jsonb_agg(team_row), '[]'::jsonb)
  into v_team
  from (
    select jsonb_build_object(
      'membership_id', bwm.id,
      'status', bwm.status,
      'label', bwm.role,
      'workspace_id', bw.id,
      'workspace_name', bw.name,
      'workspace_status', bw.status,
      'workspace_role', bwm.role,
      'effective_permissions', private.workspace_effective_permissions(bwm.role, bwm.permissions),
      'is_workspace_owner', bwm.role = 'owner',
      'business', to_jsonb(bp) || jsonb_build_object(
        'workspace_name', bw.name,
        'workspace_status', bw.status,
        'workspace_role', bwm.role,
        'effective_permissions', private.workspace_effective_permissions(bwm.role, bwm.permissions),
        'is_workspace_owner', bwm.role = 'owner'
      )
    ) as team_row,
    bp.created_at as sort_at
    from public.business_workspace_members bwm
    join public.business_workspaces bw on bw.id = bwm.workspace_id
    join public.business_profiles bp on bp.workspace_id = bw.id
    where bwm.user_id = v_user_id
      and bwm.status = 'active'
      and bw.status = 'active'
      and bp.owner_user_id <> v_user_id

    union all

    select jsonb_build_object(
      'membership_id', btm.id,
      'status', btm.status,
      'label', btm.label,
      'workspace_id', bp.workspace_id,
      'workspace_name', bw.name,
      'workspace_status', bw.status,
      'workspace_role', 'business_member',
      'effective_permissions', jsonb_build_object('view_businesses', true, 'link_operations', true),
      'is_workspace_owner', false,
      'business', to_jsonb(bp) || jsonb_build_object(
        'workspace_name', bw.name,
        'workspace_status', bw.status,
        'workspace_role', 'business_member',
        'effective_permissions', jsonb_build_object('view_businesses', true, 'link_operations', true),
        'is_workspace_owner', false
      )
    ) as team_row,
    btm.created_at as sort_at
    from public.business_team_members btm
    join public.business_profiles bp on bp.id = btm.business_id
    join public.business_workspaces bw on bw.id = bp.workspace_id
    where btm.user_id = v_user_id
      and btm.status = 'active'
      and bp.owner_user_id <> v_user_id
      and not exists (
        select 1
        from public.business_workspace_members existing_membership
        where existing_membership.workspace_id = bp.workspace_id
          and existing_membership.user_id = v_user_id
          and existing_membership.status = 'active'
      )
    order by sort_at desc
  ) team_rows;

  select coalesce(jsonb_agg(jsonb_build_object(
    'customer_id', bc.id,
    'status', bc.status,
    'source', bc.source,
    'business', to_jsonb(bp)
  ) order by bc.created_at desc), '[]'::jsonb)
  into v_customers
  from public.business_customers bc
  join public.business_profiles bp on bp.id = bc.business_id
  where bc.user_id = v_user_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'invitation_id', bi.id,
    'business_id', bi.business_id,
    'business_name', bp.name,
    'invitation_type', bi.invitation_type,
    'status', bi.status,
    'label', bi.label,
    'token', bi.token,
    'created_at', bi.created_at,
    'expires_at', bi.expires_at
  ) order by bi.created_at desc), '[]'::jsonb)
  into v_invitations
  from public.business_invitations bi
  join public.business_profiles bp on bp.id = bi.business_id
  left join public.profiles p on p.id = v_user_id
  where bi.status = 'pending'
    and bi.expires_at > now()
    and (bi.invited_user_id = v_user_id or bi.invited_phone = p.phone);

  return jsonb_build_object(
    'workspaces', v_workspaces,
    'accessible_businesses', v_accessible,
    'owned_businesses', v_owned,
    'team_businesses', v_team,
    'customer_businesses', v_customers,
    'pending_invitations', v_invitations
  );
end;
$function$;

create or replace function public.get_linkable_businesses_for_user()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_user_id uuid := auth.uid();
  v_items jsonb;
begin
  if v_user_id is null then
    raise exception 'not_authenticated';
  end if;

  with permitted_businesses as (
    select
      bp.id as business_id,
      bp.workspace_id,
      bw.status as workspace_status,
      bwm.role as workspace_role,
      private.workspace_effective_permissions(bwm.role, bwm.permissions) as effective_permissions,
      bp.name,
      bp.slug,
      bwm.role as label,
      bp.public_status,
      1 as access_priority
    from public.business_workspace_members bwm
    join public.business_workspaces bw on bw.id = bwm.workspace_id
    join public.business_profiles bp on bp.workspace_id = bw.id
    where bwm.user_id = v_user_id
      and bwm.status = 'active'
      and bw.status = 'active'
      and lower(coalesce(
        private.workspace_effective_permissions(bwm.role, bwm.permissions) ->> 'link_operations',
        'false'
      )) = 'true'

    union all

    select
      bp.id as business_id,
      bp.workspace_id,
      bw.status as workspace_status,
      'business_member'::text as workspace_role,
      jsonb_build_object('link_operations', true) as effective_permissions,
      bp.name,
      bp.slug,
      btm.label,
      bp.public_status,
      2 as access_priority
    from public.business_team_members btm
    join public.business_profiles bp on bp.id = btm.business_id
    join public.business_workspaces bw on bw.id = bp.workspace_id
    where btm.user_id = v_user_id
      and btm.status = 'active'
  ), deduplicated as (
    select distinct on (business_id)
      business_id,
      workspace_id,
      workspace_status,
      workspace_role,
      effective_permissions,
      name,
      slug,
      label,
      public_status
    from permitted_businesses
    order by business_id, access_priority
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'business_id', business_id,
    'workspace_id', workspace_id,
    'workspace_status', workspace_status,
    'workspace_role', workspace_role,
    'effective_permissions', effective_permissions,
    'name', name,
    'slug', slug,
    'label', label,
    'public_status', public_status
  ) order by name), '[]'::jsonb)
  into v_items
  from deduplicated;

  return jsonb_build_object('items', v_items);
end;
$function$;

revoke all on function public.create_business_profile(
  text,
  text,
  uuid,
  text,
  text,
  text,
  text,
  text,
  uuid
) from public, anon;
revoke all on function public.get_user_business_contexts() from public, anon;
revoke all on function public.get_linkable_businesses_for_user() from public, anon;

grant execute on function public.create_business_profile(
  text,
  text,
  uuid,
  text,
  text,
  text,
  text,
  text,
  uuid
) to authenticated, service_role;
grant execute on function public.get_user_business_contexts()
  to authenticated, service_role;
grant execute on function public.get_linkable_businesses_for_user()
  to authenticated, service_role;

do $postflight$
begin
  if exists (
    select 1
    from pg_constraint con
    join pg_attribute a
      on a.attrelid = con.conrelid
     and a.attnum = any(con.conkey)
    where con.conrelid = 'public.business_profiles'::regclass
      and con.contype = 'u'
      and array_length(con.conkey, 1) = 1
      and a.attname = 'owner_user_id'
  ) then
    raise exception 'workspace_foundation_owner_user_id_still_unique';
  end if;

  if exists (
    select 1
    from public.business_profiles bp
    join public.business_workspaces bw on bw.id = bp.workspace_id
    where bp.owner_user_id <> bw.owner_user_id
  ) then
    raise exception 'workspace_foundation_backfill_owner_mismatch';
  end if;
end;
$postflight$;

notify pgrst, 'reload schema';

commit;

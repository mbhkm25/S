create table public.business_parties (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.business_profiles(id) on delete cascade,
  display_name text not null,
  normalized_name text,
  primary_phone text,
  sanad_user_id uuid references public.profiles(id) on delete set null,
  status text not null default 'active' check (status in ('active','merged','archived')),
  source_mode text not null default 'erp' check (source_mode in ('erp','sanad','manual','mixed')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index business_parties_business_sanad_user_idx
  on public.business_parties(business_id, sanad_user_id)
  where sanad_user_id is not null and status = 'active';
create index business_parties_business_name_idx
  on public.business_parties(business_id, normalized_name)
  where status = 'active';

create trigger business_parties_set_updated_at
before update on public.business_parties
for each row execute function public.set_updated_at();

alter table public.business_parties enable row level security;

create policy business_parties_select_member
on public.business_parties for select to authenticated
using (
  private.user_is_business_owner(business_id, (select auth.uid()))
  or private.user_is_active_business_member(business_id, (select auth.uid()))
);

create policy business_parties_owner_write
on public.business_parties for all to authenticated
using (private.user_is_business_owner(business_id, (select auth.uid())))
with check (private.user_is_business_owner(business_id, (select auth.uid())));

create table public.business_party_roles (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.business_profiles(id) on delete cascade,
  party_id uuid not null references public.business_parties(id) on delete cascade,
  role_code text not null check (role_code in ('customer','supplier','contact','other')),
  status text not null default 'active' check (status in ('active','inactive')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (party_id, role_code)
);

create index business_party_roles_business_idx
  on public.business_party_roles(business_id, role_code, status);

create trigger business_party_roles_set_updated_at
before update on public.business_party_roles
for each row execute function public.set_updated_at();

alter table public.business_party_roles enable row level security;

create policy business_party_roles_select_member
on public.business_party_roles for select to authenticated
using (
  private.user_is_business_owner(business_id, (select auth.uid()))
  or private.user_is_active_business_member(business_id, (select auth.uid()))
);

create policy business_party_roles_owner_write
on public.business_party_roles for all to authenticated
using (private.user_is_business_owner(business_id, (select auth.uid())))
with check (private.user_is_business_owner(business_id, (select auth.uid())));

create table public.business_party_source_refs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.business_profiles(id) on delete cascade,
  party_id uuid not null references public.business_parties(id) on delete cascade,
  source_instance_id uuid not null references public.business_erp_source_instances(id) on delete cascade,
  source_entity_type text not null,
  source_record_id text not null,
  source_display_name text,
  confidence numeric(5,4) check (confidence is null or (confidence >= 0 and confidence <= 1)),
  verified_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_instance_id, source_entity_type, source_record_id)
);

create index business_party_source_refs_business_party_idx
  on public.business_party_source_refs(business_id, party_id);

create trigger business_party_source_refs_set_updated_at
before update on public.business_party_source_refs
for each row execute function public.set_updated_at();

alter table public.business_party_source_refs enable row level security;

create policy business_party_source_refs_select_member
on public.business_party_source_refs for select to authenticated
using (
  private.user_is_business_owner(business_id, (select auth.uid()))
  or private.user_is_active_business_member(business_id, (select auth.uid()))
);

create policy business_party_source_refs_owner_write
on public.business_party_source_refs for all to authenticated
using (private.user_is_business_owner(business_id, (select auth.uid())))
with check (private.user_is_business_owner(business_id, (select auth.uid())));

create or replace function public.resolve_business_party_from_source_v1(
  p_source_instance_id uuid,
  p_source_entity_type text,
  p_source_record_id text,
  p_display_name text,
  p_role_code text default 'customer',
  p_source_phone text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_business_id uuid;
  v_party_id uuid;
begin
  if p_role_code not in ('customer','supplier','contact','other') then
    raise exception 'invalid_party_role' using errcode = '22023';
  end if;

  if nullif(btrim(p_source_entity_type), '') is null
     or nullif(btrim(p_source_record_id), '') is null
     or nullif(btrim(p_display_name), '') is null then
    raise exception 'invalid_party_source_reference' using errcode = '22023';
  end if;

  select s.business_id into v_business_id
  from public.business_erp_source_instances s
  where s.id = p_source_instance_id
    and s.status in ('active','changed')
  limit 1;

  if v_business_id is null then
    raise exception 'source_instance_not_active' using errcode = '22023';
  end if;

  select r.party_id into v_party_id
  from public.business_party_source_refs r
  where r.source_instance_id = p_source_instance_id
    and r.source_entity_type = btrim(p_source_entity_type)
    and r.source_record_id = btrim(p_source_record_id)
  limit 1;

  if v_party_id is not null then
    insert into public.business_party_roles (business_id, party_id, role_code)
    values (v_business_id, v_party_id, p_role_code)
    on conflict (party_id, role_code) do update set status = 'active', updated_at = now();
    return v_party_id;
  end if;

  insert into public.business_parties (
    business_id, display_name, normalized_name, primary_phone, source_mode
  ) values (
    v_business_id,
    btrim(p_display_name),
    lower(btrim(p_display_name)),
    nullif(btrim(p_source_phone), ''),
    'erp'
  ) returning id into v_party_id;

  insert into public.business_party_roles (business_id, party_id, role_code)
  values (v_business_id, v_party_id, p_role_code);

  insert into public.business_party_source_refs (
    business_id, party_id, source_instance_id, source_entity_type, source_record_id, source_display_name, confidence
  ) values (
    v_business_id, v_party_id, p_source_instance_id, btrim(p_source_entity_type),
    btrim(p_source_record_id), btrim(p_display_name), 1.0
  );

  return v_party_id;
end;
$function$;

revoke all on function public.resolve_business_party_from_source_v1(uuid,text,text,text,text,text) from public;
revoke all on function public.resolve_business_party_from_source_v1(uuid,text,text,text,text,text) from anon;
revoke all on function public.resolve_business_party_from_source_v1(uuid,text,text,text,text,text) from authenticated;
grant execute on function public.resolve_business_party_from_source_v1(uuid,text,text,text,text,text) to service_role;
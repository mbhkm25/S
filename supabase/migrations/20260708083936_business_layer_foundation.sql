-- SANAD Business Layer Foundation
-- Scope: business profiles, team/customer relationships, invitations, operation links, and RPCs.

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.sanitize_business_slug(input text)
returns text
language sql
immutable
as $$
  select trim(both '-' from regexp_replace(lower(coalesce(input, '')), '[^a-z0-9]+', '-', 'g'));
$$;

-- 1) Categories
create table if not exists public.business_categories (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (length(trim(code)) > 0),
  name_ar text not null check (length(trim(name_ar)) > 0),
  name_en text,
  status text not null default 'active' check (status in ('active', 'disabled')),
  display_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_business_categories_updated_at
before update on public.business_categories
for each row execute function public.set_updated_at();

insert into public.business_categories (code, name_ar, name_en, display_order)
values
  ('supermarket', 'سوبرماركت', 'Supermarket', 10),
  ('honey', 'عسل ومنتجات طبيعية', 'Honey & Natural Products', 20),
  ('restaurant', 'مطعم', 'Restaurant', 30),
  ('exchange', 'صرافة', 'Exchange', 40),
  ('electronics', 'إلكترونيات', 'Electronics', 50),
  ('services', 'خدمات', 'Services', 60),
  ('other', 'أخرى', 'Other', 999)
on conflict (code) do update set
  name_ar = excluded.name_ar,
  name_en = excluded.name_en,
  display_order = excluded.display_order,
  status = 'active';

-- 2) Business profiles
create table if not exists public.business_profiles (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (length(trim(name)) >= 2),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$'),
  category_id uuid references public.business_categories(id) on delete set null,
  governorate text,
  city text,
  whatsapp text not null check (whatsapp ~ '^967[0-9]{9}$'),
  description text,
  logo_path text,
  public_status text not null default 'draft' check (public_status in ('draft', 'pending_review', 'published', 'rejected', 'hidden', 'suspended')),
  verification_status text not null default 'unverified' check (verification_status in ('unverified', 'pending_review', 'verified', 'rejected', 'suspended')),
  review_note text,
  submitted_for_review_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by_user_id uuid references public.profiles(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint one_business_per_owner unique (owner_user_id)
);

create index if not exists idx_business_profiles_public_status on public.business_profiles(public_status);
create index if not exists idx_business_profiles_category on public.business_profiles(category_id);
create index if not exists idx_business_profiles_location on public.business_profiles(governorate, city);

create trigger set_business_profiles_updated_at
before update on public.business_profiles
for each row execute function public.set_updated_at();

-- 3) Team members
create table if not exists public.business_team_members (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.business_profiles(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'active' check (status in ('pending', 'active', 'disabled', 'removed')),
  label text,
  added_by_owner_id uuid references public.profiles(id) on delete set null,
  invitation_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, user_id)
);

create index if not exists idx_business_team_members_user on public.business_team_members(user_id, status);
create index if not exists idx_business_team_members_business on public.business_team_members(business_id, status);

create trigger set_business_team_members_updated_at
before update on public.business_team_members
for each row execute function public.set_updated_at();

-- 4) Customers
create table if not exists public.business_customers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.business_profiles(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'removed', 'blocked')),
  source text not null default 'profile' check (source in ('profile', 'community', 'qr', 'invite', 'manual_request')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, user_id)
);

create index if not exists idx_business_customers_user on public.business_customers(user_id, status);
create index if not exists idx_business_customers_business on public.business_customers(business_id, status);

create trigger set_business_customers_updated_at
before update on public.business_customers
for each row execute function public.set_updated_at();

-- 5) Invitations
create table if not exists public.business_invitations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.business_profiles(id) on delete cascade,
  invited_phone text not null check (invited_phone ~ '^967[0-9]{9}$'),
  invited_user_id uuid references public.profiles(id) on delete set null,
  invitation_type text not null check (invitation_type in ('team_member', 'customer')),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'revoked', 'expired')),
  token text not null unique default encode(gen_random_bytes(24), 'hex'),
  label text,
  created_by_user_id uuid not null references public.profiles(id) on delete cascade,
  accepted_at timestamptz,
  expires_at timestamptz not null default (now() + interval '14 days'),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_business_invitations_phone on public.business_invitations(invited_phone, status);
create index if not exists idx_business_invitations_user on public.business_invitations(invited_user_id, status);
create index if not exists idx_business_invitations_business on public.business_invitations(business_id, status);

create trigger set_business_invitations_updated_at
before update on public.business_invitations
for each row execute function public.set_updated_at();

alter table public.business_team_members
  drop constraint if exists business_team_members_invitation_id_fkey;
alter table public.business_team_members
  add constraint business_team_members_invitation_id_fkey
  foreign key (invitation_id) references public.business_invitations(id) on delete set null;

-- 6) Operation links
create table if not exists public.business_operation_links (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.business_profiles(id) on delete cascade,
  operation_id uuid not null references public.operations(id) on delete cascade,
  linked_by_user_id uuid not null references public.profiles(id) on delete cascade,
  verified_by_user_id uuid references public.profiles(id) on delete set null,
  link_type text not null default 'manual_after_verification' check (link_type in ('manual_after_verification', 'owner_linked', 'admin_linked')),
  status text not null default 'linked' check (status in ('linked', 'unlinked')),
  unlinked_at timestamptz,
  unlinked_by_user_id uuid references public.profiles(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, operation_id)
);

create index if not exists idx_business_operation_links_business on public.business_operation_links(business_id, status, created_at desc);
create index if not exists idx_business_operation_links_operation on public.business_operation_links(operation_id, status);
create index if not exists idx_business_operation_links_linked_by on public.business_operation_links(linked_by_user_id, created_at desc);

create trigger set_business_operation_links_updated_at
before update on public.business_operation_links
for each row execute function public.set_updated_at();

-- RLS
alter table public.business_categories enable row level security;
alter table public.business_profiles enable row level security;
alter table public.business_team_members enable row level security;
alter table public.business_customers enable row level security;
alter table public.business_invitations enable row level security;
alter table public.business_operation_links enable row level security;

drop policy if exists business_categories_select_authenticated on public.business_categories;
create policy business_categories_select_authenticated
on public.business_categories
for select
to authenticated
using (status = 'active');

drop policy if exists business_profiles_select_authenticated_context on public.business_profiles;
create policy business_profiles_select_authenticated_context
on public.business_profiles
for select
to authenticated
using (
  public_status = 'published'
  or owner_user_id = auth.uid()
  or exists (
    select 1 from public.business_team_members tm
    where tm.business_id = business_profiles.id
      and tm.user_id = auth.uid()
      and tm.status = 'active'
  )
  or exists (
    select 1 from public.business_customers bc
    where bc.business_id = business_profiles.id
      and bc.user_id = auth.uid()
      and bc.status = 'active'
  )
);

drop policy if exists business_team_members_select_context on public.business_team_members;
create policy business_team_members_select_context
on public.business_team_members
for select
to authenticated
using (
  user_id = auth.uid()
  or exists (
    select 1 from public.business_profiles bp
    where bp.id = business_team_members.business_id
      and bp.owner_user_id = auth.uid()
  )
);

drop policy if exists business_customers_select_context on public.business_customers;
create policy business_customers_select_context
on public.business_customers
for select
to authenticated
using (
  user_id = auth.uid()
  or exists (
    select 1 from public.business_profiles bp
    where bp.id = business_customers.business_id
      and bp.owner_user_id = auth.uid()
  )
);

drop policy if exists business_invitations_select_context on public.business_invitations;
create policy business_invitations_select_context
on public.business_invitations
for select
to authenticated
using (
  invited_user_id = auth.uid()
  or invited_phone = (select p.phone from public.profiles p where p.id = auth.uid())
  or created_by_user_id = auth.uid()
  or exists (
    select 1 from public.business_profiles bp
    where bp.id = business_invitations.business_id
      and bp.owner_user_id = auth.uid()
  )
);

drop policy if exists business_operation_links_select_context on public.business_operation_links;
create policy business_operation_links_select_context
on public.business_operation_links
for select
to authenticated
using (
  linked_by_user_id = auth.uid()
  or exists (
    select 1 from public.business_profiles bp
    where bp.id = business_operation_links.business_id
      and bp.owner_user_id = auth.uid()
  )
  or exists (
    select 1 from public.business_team_members tm
    where tm.business_id = business_operation_links.business_id
      and tm.user_id = auth.uid()
      and tm.status = 'active'
  )
);

-- Helper functions
create or replace function public.is_platform_admin(user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = user_id
      and p.global_role = 'platform_admin'
      and p.status = 'active'
  );
$$;

create or replace function public.create_business_profile(
  p_name text,
  p_slug text default null,
  p_category_id uuid default null,
  p_governorate text default null,
  p_city text default null,
  p_whatsapp text default null,
  p_description text default null,
  p_logo_path text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_profile public.profiles%rowtype;
  v_slug text;
  v_business public.business_profiles%rowtype;
begin
  if v_user_id is null then
    raise exception 'not_authenticated';
  end if;

  select * into v_profile from public.profiles where id = v_user_id and status = 'active';
  if not found then
    raise exception 'profile_not_found_or_inactive';
  end if;

  if exists (select 1 from public.business_profiles where owner_user_id = v_user_id) then
    raise exception 'business_already_exists_for_user';
  end if;

  if p_name is null or length(trim(p_name)) < 2 then
    raise exception 'business_name_required';
  end if;

  if p_whatsapp is null or p_whatsapp !~ '^967[0-9]{9}$' then
    raise exception 'valid_yemen_whatsapp_required';
  end if;

  if p_category_id is not null and not exists (select 1 from public.business_categories where id = p_category_id and status = 'active') then
    raise exception 'invalid_business_category';
  end if;

  v_slug := public.sanitize_business_slug(coalesce(p_slug, p_name));
  if length(v_slug) < 3 then
    v_slug := 'business-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 10);
  end if;

  if exists (select 1 from public.business_profiles where slug = v_slug) then
    v_slug := v_slug || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6);
  end if;

  insert into public.business_profiles (
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
    v_user_id,
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
    v_user_id,
    'active',
    'مالك النشاط',
    v_user_id,
    jsonb_build_object('auto_added_owner', true)
  )
  on conflict (business_id, user_id) do nothing;

  return jsonb_build_object(
    'ok', true,
    'business', to_jsonb(v_business),
    'message', 'business_submitted_for_review'
  );
end;
$$;

create or replace function public.get_user_business_contexts()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_owned jsonb;
  v_team jsonb;
  v_customers jsonb;
  v_invitations jsonb;
begin
  if v_user_id is null then
    raise exception 'not_authenticated';
  end if;

  select coalesce(jsonb_agg(to_jsonb(bp) order by bp.created_at desc), '[]'::jsonb)
  into v_owned
  from public.business_profiles bp
  where bp.owner_user_id = v_user_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'membership_id', tm.id,
    'status', tm.status,
    'label', tm.label,
    'business', to_jsonb(bp)
  ) order by tm.created_at desc), '[]'::jsonb)
  into v_team
  from public.business_team_members tm
  join public.business_profiles bp on bp.id = tm.business_id
  where tm.user_id = v_user_id;

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
    'owned_businesses', v_owned,
    'team_businesses', v_team,
    'customer_businesses', v_customers,
    'pending_invitations', v_invitations
  );
end;
$$;

create or replace function public.get_public_businesses(
  p_search text default null,
  p_category_id uuid default null,
  p_governorate text default null,
  p_city text default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_items jsonb;
begin
  if v_user_id is null then
    raise exception 'not_authenticated';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', bp.id,
    'name', bp.name,
    'slug', bp.slug,
    'category', case when bc.id is null then null else jsonb_build_object('id', bc.id, 'code', bc.code, 'name_ar', bc.name_ar) end,
    'governorate', bp.governorate,
    'city', bp.city,
    'whatsapp', bp.whatsapp,
    'description', bp.description,
    'logo_path', bp.logo_path,
    'public_status', bp.public_status,
    'created_at', bp.created_at
  ) order by bp.created_at desc), '[]'::jsonb)
  into v_items
  from (
    select *
    from public.business_profiles bp
    where bp.public_status = 'published'
      and (p_category_id is null or bp.category_id = p_category_id)
      and (p_governorate is null or bp.governorate = p_governorate)
      and (p_city is null or bp.city = p_city)
      and (
        p_search is null
        or bp.name ilike '%' || p_search || '%'
        or bp.description ilike '%' || p_search || '%'
      )
    order by bp.created_at desc
    limit greatest(1, least(coalesce(p_limit, 50), 100))
    offset greatest(coalesce(p_offset, 0), 0)
  ) bp
  left join public.business_categories bc on bc.id = bp.category_id;

  return jsonb_build_object('items', v_items, 'limit', p_limit, 'offset', p_offset);
end;
$$;

create or replace function public.get_public_business_profile(p_slug text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_profile jsonb;
begin
  if v_user_id is null then
    raise exception 'not_authenticated';
  end if;

  select jsonb_build_object(
    'id', bp.id,
    'name', bp.name,
    'slug', bp.slug,
    'category', case when bc.id is null then null else jsonb_build_object('id', bc.id, 'code', bc.code, 'name_ar', bc.name_ar) end,
    'governorate', bp.governorate,
    'city', bp.city,
    'whatsapp', bp.whatsapp,
    'description', bp.description,
    'logo_path', bp.logo_path,
    'public_status', bp.public_status,
    'created_at', bp.created_at,
    'is_customer', exists(select 1 from public.business_customers c where c.business_id = bp.id and c.user_id = v_user_id and c.status = 'active')
  )
  into v_profile
  from public.business_profiles bp
  left join public.business_categories bc on bc.id = bp.category_id
  where bp.slug = p_slug
    and (bp.public_status = 'published' or bp.owner_user_id = v_user_id or public.is_platform_admin(v_user_id));

  if v_profile is null then
    raise exception 'business_not_found_or_not_published';
  end if;

  return v_profile;
end;
$$;

create or replace function public.join_business_as_customer(p_business_id uuid, p_source text default 'profile')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_business public.business_profiles%rowtype;
  v_customer public.business_customers%rowtype;
  v_source text := coalesce(p_source, 'profile');
begin
  if v_user_id is null then
    raise exception 'not_authenticated';
  end if;

  if v_source not in ('profile', 'community', 'qr', 'invite', 'manual_request') then
    v_source := 'profile';
  end if;

  select * into v_business from public.business_profiles where id = p_business_id and public_status = 'published';
  if not found then
    raise exception 'business_not_published';
  end if;

  insert into public.business_customers (business_id, user_id, status, source)
  values (p_business_id, v_user_id, 'active', v_source)
  on conflict (business_id, user_id) do update set
    status = 'active',
    source = excluded.source,
    updated_at = now()
  returning * into v_customer;

  return jsonb_build_object('ok', true, 'customer', to_jsonb(v_customer));
end;
$$;

create or replace function public.create_business_team_invitation(
  p_business_id uuid,
  p_invited_phone text,
  p_label text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_business public.business_profiles%rowtype;
  v_invited_user_id uuid;
  v_invitation public.business_invitations%rowtype;
begin
  if v_user_id is null then
    raise exception 'not_authenticated';
  end if;

  select * into v_business from public.business_profiles where id = p_business_id and owner_user_id = v_user_id;
  if not found then
    raise exception 'business_owner_required';
  end if;

  if p_invited_phone is null or p_invited_phone !~ '^967[0-9]{9}$' then
    raise exception 'valid_yemen_phone_required';
  end if;

  select id into v_invited_user_id from public.profiles where phone = p_invited_phone limit 1;

  if v_invited_user_id is not null and exists (
    select 1 from public.business_team_members
    where business_id = p_business_id and user_id = v_invited_user_id and status = 'active'
  ) then
    raise exception 'user_already_team_member';
  end if;

  update public.business_invitations
  set status = 'revoked', updated_at = now()
  where business_id = p_business_id
    and invited_phone = p_invited_phone
    and invitation_type = 'team_member'
    and status = 'pending';

  insert into public.business_invitations (
    business_id,
    invited_phone,
    invited_user_id,
    invitation_type,
    status,
    label,
    created_by_user_id
  ) values (
    p_business_id,
    p_invited_phone,
    v_invited_user_id,
    'team_member',
    'pending',
    nullif(trim(coalesce(p_label, '')), ''),
    v_user_id
  ) returning * into v_invitation;

  return jsonb_build_object('ok', true, 'invitation', to_jsonb(v_invitation));
end;
$$;

create or replace function public.accept_business_invitation(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_profile public.profiles%rowtype;
  v_invitation public.business_invitations%rowtype;
begin
  if v_user_id is null then
    raise exception 'not_authenticated';
  end if;

  select * into v_profile from public.profiles where id = v_user_id and status = 'active';
  if not found then
    raise exception 'profile_not_found_or_inactive';
  end if;

  select * into v_invitation
  from public.business_invitations
  where token = p_token
    and status = 'pending'
    and expires_at > now()
  limit 1;

  if not found then
    raise exception 'invitation_not_found_or_expired';
  end if;

  if v_invitation.invited_user_id is not null and v_invitation.invited_user_id <> v_user_id then
    raise exception 'invitation_for_different_user';
  end if;

  if v_invitation.invited_phone <> v_profile.phone then
    raise exception 'invitation_phone_mismatch';
  end if;

  if v_invitation.invitation_type = 'team_member' then
    insert into public.business_team_members (
      business_id,
      user_id,
      status,
      label,
      added_by_owner_id,
      invitation_id
    ) values (
      v_invitation.business_id,
      v_user_id,
      'active',
      v_invitation.label,
      v_invitation.created_by_user_id,
      v_invitation.id
    )
    on conflict (business_id, user_id) do update set
      status = 'active',
      label = coalesce(excluded.label, public.business_team_members.label),
      invitation_id = excluded.invitation_id,
      updated_at = now();
  elsif v_invitation.invitation_type = 'customer' then
    insert into public.business_customers (business_id, user_id, status, source)
    values (v_invitation.business_id, v_user_id, 'active', 'invite')
    on conflict (business_id, user_id) do update set
      status = 'active',
      source = 'invite',
      updated_at = now();
  end if;

  update public.business_invitations
  set status = 'accepted', accepted_at = now(), invited_user_id = v_user_id, updated_at = now()
  where id = v_invitation.id;

  return jsonb_build_object('ok', true, 'invitation_id', v_invitation.id, 'invitation_type', v_invitation.invitation_type);
end;
$$;

create or replace function public.get_linkable_businesses_for_user()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_items jsonb;
begin
  if v_user_id is null then
    raise exception 'not_authenticated';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'business_id', bp.id,
    'name', bp.name,
    'slug', bp.slug,
    'label', tm.label,
    'public_status', bp.public_status
  ) order by bp.name), '[]'::jsonb)
  into v_items
  from public.business_team_members tm
  join public.business_profiles bp on bp.id = tm.business_id
  where tm.user_id = v_user_id
    and tm.status = 'active';

  return jsonb_build_object('items', v_items);
end;
$$;

create or replace function public.link_operation_to_business(
  p_operation_id uuid,
  p_business_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_operation public.operations%rowtype;
  v_link public.business_operation_links%rowtype;
  v_can_link boolean;
begin
  if v_user_id is null then
    raise exception 'not_authenticated';
  end if;

  select * into v_operation from public.operations where id = p_operation_id;
  if not found then
    raise exception 'operation_not_found';
  end if;

  if not exists (
    select 1 from public.business_team_members tm
    where tm.business_id = p_business_id
      and tm.user_id = v_user_id
      and tm.status = 'active'
  ) then
    raise exception 'active_team_membership_required';
  end if;

  select (
    v_operation.verified_by_user_id = v_user_id
    or exists (
      select 1 from public.operation_user_links oul
      where oul.operation_id = p_operation_id
        and oul.user_id = v_user_id
        and oul.relation_type = 'verifier'
    )
  ) into v_can_link;

  if not coalesce(v_can_link, false) then
    raise exception 'operation_must_be_verified_by_current_user';
  end if;

  insert into public.business_operation_links (
    business_id,
    operation_id,
    linked_by_user_id,
    verified_by_user_id,
    link_type,
    status
  ) values (
    p_business_id,
    p_operation_id,
    v_user_id,
    v_operation.verified_by_user_id,
    'manual_after_verification',
    'linked'
  )
  on conflict (business_id, operation_id) do update set
    status = 'linked',
    linked_by_user_id = excluded.linked_by_user_id,
    verified_by_user_id = excluded.verified_by_user_id,
    unlinked_at = null,
    unlinked_by_user_id = null,
    updated_at = now()
  returning * into v_link;

  return jsonb_build_object('ok', true, 'link', to_jsonb(v_link));
end;
$$;

create or replace function public.unlink_operation_from_business(
  p_link_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_link public.business_operation_links%rowtype;
begin
  if v_user_id is null then
    raise exception 'not_authenticated';
  end if;

  select bol.* into v_link
  from public.business_operation_links bol
  join public.business_profiles bp on bp.id = bol.business_id
  where bol.id = p_link_id
    and bp.owner_user_id = v_user_id;

  if not found then
    raise exception 'business_owner_required_or_link_not_found';
  end if;

  update public.business_operation_links
  set status = 'unlinked', unlinked_at = now(), unlinked_by_user_id = v_user_id, updated_at = now()
  where id = p_link_id
  returning * into v_link;

  return jsonb_build_object('ok', true, 'link', to_jsonb(v_link));
end;
$$;

create or replace function public.get_business_operations(p_business_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_items jsonb;
begin
  if v_user_id is null then
    raise exception 'not_authenticated';
  end if;

  if not exists (
    select 1 from public.business_profiles bp
    where bp.id = p_business_id
      and (bp.owner_user_id = v_user_id or public.is_platform_admin(v_user_id))
  ) then
    raise exception 'business_owner_required';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'link_id', bol.id,
    'business_id', bol.business_id,
    'linked_at', bol.created_at,
    'linked_by', jsonb_build_object('id', linked_by.id, 'full_name', linked_by.full_name, 'phone', linked_by.phone),
    'verified_by', jsonb_build_object('id', verified_by.id, 'full_name', verified_by.full_name, 'phone', verified_by.phone),
    'link_type', bol.link_type,
    'link_status', bol.status,
    'operation', jsonb_build_object(
      'id', op.id,
      'public_token', op.public_token,
      'created_at', op.created_at,
      'status', op.status,
      'ai_status', op.ai_status,
      'summary', op.summary,
      'financial_entity', op.financial_entity,
      'transaction_type', op.transaction_type,
      'amount', op.amount,
      'currency', op.currency,
      'reference_number', op.reference_number,
      'transaction_datetime', op.transaction_datetime
    )
  ) order by bol.created_at desc), '[]'::jsonb)
  into v_items
  from public.business_operation_links bol
  join public.operations op on op.id = bol.operation_id
  left join public.profiles linked_by on linked_by.id = bol.linked_by_user_id
  left join public.profiles verified_by on verified_by.id = bol.verified_by_user_id
  where bol.business_id = p_business_id
    and bol.status = 'linked';

  return jsonb_build_object('items', v_items);
end;
$$;

create or replace function public.platform_admin_review_business(
  p_business_id uuid,
  p_decision text,
  p_review_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_business public.business_profiles%rowtype;
begin
  if v_user_id is null then
    raise exception 'not_authenticated';
  end if;

  if not public.is_platform_admin(v_user_id) then
    raise exception 'platform_admin_required';
  end if;

  if p_decision not in ('published', 'rejected', 'hidden', 'suspended') then
    raise exception 'invalid_review_decision';
  end if;

  update public.business_profiles
  set public_status = p_decision,
      verification_status = case when p_decision = 'published' then 'verified' when p_decision = 'rejected' then 'rejected' else verification_status end,
      review_note = p_review_note,
      reviewed_at = now(),
      reviewed_by_user_id = v_user_id,
      updated_at = now()
  where id = p_business_id
  returning * into v_business;

  if not found then
    raise exception 'business_not_found';
  end if;

  return jsonb_build_object('ok', true, 'business', to_jsonb(v_business));
end;
$$;

-- Function execution grants
grant execute on function public.create_business_profile(text, text, uuid, text, text, text, text, text) to authenticated;
grant execute on function public.get_user_business_contexts() to authenticated;
grant execute on function public.get_public_businesses(text, uuid, text, text, integer, integer) to authenticated;
grant execute on function public.get_public_business_profile(text) to authenticated;
grant execute on function public.join_business_as_customer(uuid, text) to authenticated;
grant execute on function public.create_business_team_invitation(uuid, text, text) to authenticated;
grant execute on function public.accept_business_invitation(text) to authenticated;
grant execute on function public.get_linkable_businesses_for_user() to authenticated;
grant execute on function public.link_operation_to_business(uuid, uuid) to authenticated;
grant execute on function public.unlink_operation_from_business(uuid) to authenticated;
grant execute on function public.get_business_operations(uuid) to authenticated;
grant execute on function public.platform_admin_review_business(uuid, text, text) to authenticated;
;

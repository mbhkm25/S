-- SANAD Business Layer Expansion v2
-- Rich public profile, catalog, inquiries, team actions, and RPCs.

create extension if not exists pgcrypto;

alter table public.business_profiles
  add column if not exists display_tagline text,
  add column if not exists address_text text,
  add column if not exists latitude numeric,
  add column if not exists longitude numeric,
  add column if not exists cover_image_path text,
  add column if not exists profile_image_path text,
  add column if not exists gallery_paths jsonb not null default '[]'::jsonb,
  add column if not exists working_hours jsonb not null default '{}'::jsonb,
  add column if not exists contact_links jsonb not null default '{}'::jsonb,
  add column if not exists profile_sections jsonb not null default '{}'::jsonb;

alter table public.business_profiles drop constraint if exists business_profiles_latitude_range;
alter table public.business_profiles add constraint business_profiles_latitude_range check (latitude is null or (latitude >= -90 and latitude <= 90));
alter table public.business_profiles drop constraint if exists business_profiles_longitude_range;
alter table public.business_profiles add constraint business_profiles_longitude_range check (longitude is null or (longitude >= -180 and longitude <= 180));

create table if not exists public.business_media_assets (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.business_profiles(id) on delete cascade,
  owner_user_id uuid not null references public.profiles(id) on delete cascade,
  asset_type text not null check (asset_type in ('cover', 'profile', 'gallery', 'catalog', 'document')),
  storage_bucket text not null default 'operation-files',
  storage_path text not null,
  mime_type text,
  file_name text,
  file_size bigint check (file_size is null or file_size >= 0),
  alt_text text,
  display_order integer not null default 100,
  status text not null default 'active' check (status in ('active', 'hidden', 'deleted')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, storage_bucket, storage_path)
);

create index if not exists idx_business_media_assets_business on public.business_media_assets(business_id, asset_type, status, display_order);
drop trigger if exists set_business_media_assets_updated_at on public.business_media_assets;
create trigger set_business_media_assets_updated_at before update on public.business_media_assets for each row execute function public.set_updated_at();

create table if not exists public.business_catalog_items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.business_profiles(id) on delete cascade,
  created_by_user_id uuid not null references public.profiles(id) on delete cascade,
  item_type text not null default 'product' check (item_type in ('product', 'service')),
  title text not null check (length(trim(title)) >= 2),
  description text,
  price numeric check (price is null or price >= 0),
  currency text check (currency is null or currency in ('YER', 'SAR', 'USD')),
  image_paths jsonb not null default '[]'::jsonb,
  features jsonb not null default '[]'::jsonb,
  status text not null default 'active' check (status in ('draft', 'active', 'hidden', 'archived')),
  display_order integer not null default 100,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_business_catalog_items_business on public.business_catalog_items(business_id, status, display_order, created_at desc);
drop trigger if exists set_business_catalog_items_updated_at on public.business_catalog_items;
create trigger set_business_catalog_items_updated_at before update on public.business_catalog_items for each row execute function public.set_updated_at();

create table if not exists public.business_inquiries (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.business_profiles(id) on delete cascade,
  customer_user_id uuid not null references public.profiles(id) on delete cascade,
  catalog_item_id uuid references public.business_catalog_items(id) on delete set null,
  inquiry_type text not null default 'general' check (inquiry_type in ('general', 'catalog_item', 'service_request')),
  message text,
  status text not null default 'new' check (status in ('new', 'seen', 'closed', 'spam')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_business_inquiries_business on public.business_inquiries(business_id, status, created_at desc);
create index if not exists idx_business_inquiries_customer on public.business_inquiries(customer_user_id, created_at desc);
drop trigger if exists set_business_inquiries_updated_at on public.business_inquiries;
create trigger set_business_inquiries_updated_at before update on public.business_inquiries for each row execute function public.set_updated_at();

create table if not exists public.business_team_actions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.business_profiles(id) on delete cascade,
  member_user_id uuid not null references public.profiles(id) on delete cascade,
  action text not null check (action in ('invited', 'accepted', 'suspended', 'reactivated', 'removed', 'label_changed')),
  performed_by_user_id uuid not null references public.profiles(id) on delete cascade,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_business_team_actions_business on public.business_team_actions(business_id, created_at desc);
create index if not exists idx_business_team_actions_member on public.business_team_actions(member_user_id, created_at desc);

alter table public.business_media_assets enable row level security;
alter table public.business_catalog_items enable row level security;
alter table public.business_inquiries enable row level security;
alter table public.business_team_actions enable row level security;

drop policy if exists business_media_assets_select_context on public.business_media_assets;
create policy business_media_assets_select_context on public.business_media_assets for select to authenticated using (
  status = 'active' and exists (
    select 1 from public.business_profiles bp
    where bp.id = business_media_assets.business_id
      and (bp.public_status = 'published' or bp.owner_user_id = auth.uid() or exists (
        select 1 from public.business_team_members tm where tm.business_id = bp.id and tm.user_id = auth.uid() and tm.status = 'active'
      ))
  )
);

drop policy if exists business_catalog_items_select_context on public.business_catalog_items;
create policy business_catalog_items_select_context on public.business_catalog_items for select to authenticated using (
  (status = 'active' and exists (select 1 from public.business_profiles bp where bp.id = business_catalog_items.business_id and bp.public_status = 'published'))
  or exists (select 1 from public.business_profiles bp where bp.id = business_catalog_items.business_id and bp.owner_user_id = auth.uid())
);

drop policy if exists business_inquiries_select_context on public.business_inquiries;
create policy business_inquiries_select_context on public.business_inquiries for select to authenticated using (
  customer_user_id = auth.uid() or exists (select 1 from public.business_profiles bp where bp.id = business_inquiries.business_id and bp.owner_user_id = auth.uid())
);

drop policy if exists business_team_actions_select_owner on public.business_team_actions;
create policy business_team_actions_select_owner on public.business_team_actions for select to authenticated using (
  member_user_id = auth.uid() or exists (select 1 from public.business_profiles bp where bp.id = business_team_actions.business_id and bp.owner_user_id = auth.uid())
);

create or replace function public.update_business_profile(
  p_business_id uuid,
  p_name text default null,
  p_slug text default null,
  p_category_id uuid default null,
  p_governorate text default null,
  p_city text default null,
  p_whatsapp text default null,
  p_description text default null,
  p_display_tagline text default null,
  p_address_text text default null,
  p_latitude numeric default null,
  p_longitude numeric default null,
  p_cover_image_path text default null,
  p_profile_image_path text default null,
  p_gallery_paths jsonb default null,
  p_working_hours jsonb default null,
  p_contact_links jsonb default null,
  p_profile_sections jsonb default null,
  p_resubmit_review boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_business public.business_profiles%rowtype;
  v_slug text;
begin
  if v_user_id is null then raise exception 'not_authenticated'; end if;
  select * into v_business from public.business_profiles where id = p_business_id and owner_user_id = v_user_id;
  if not found then raise exception 'business_owner_required'; end if;
  if p_whatsapp is not null and p_whatsapp !~ '^967[0-9]{9}$' then raise exception 'valid_yemen_whatsapp_required'; end if;
  if p_category_id is not null and not exists (select 1 from public.business_categories where id = p_category_id and status = 'active') then raise exception 'invalid_business_category'; end if;
  v_slug := v_business.slug;
  if p_slug is not null and trim(p_slug) <> '' then
    v_slug := public.sanitize_business_slug(p_slug);
    if length(v_slug) < 3 then raise exception 'invalid_business_slug'; end if;
    if exists (select 1 from public.business_profiles where slug = v_slug and id <> p_business_id) then raise exception 'business_slug_already_exists'; end if;
  end if;
  update public.business_profiles set
    name = coalesce(nullif(trim(coalesce(p_name, '')), ''), name),
    slug = v_slug,
    category_id = coalesce(p_category_id, category_id),
    governorate = coalesce(nullif(trim(coalesce(p_governorate, '')), ''), governorate),
    city = coalesce(nullif(trim(coalesce(p_city, '')), ''), city),
    whatsapp = coalesce(nullif(trim(coalesce(p_whatsapp, '')), ''), whatsapp),
    description = coalesce(nullif(trim(coalesce(p_description, '')), ''), description),
    display_tagline = coalesce(nullif(trim(coalesce(p_display_tagline, '')), ''), display_tagline),
    address_text = coalesce(nullif(trim(coalesce(p_address_text, '')), ''), address_text),
    latitude = coalesce(p_latitude, latitude),
    longitude = coalesce(p_longitude, longitude),
    cover_image_path = coalesce(nullif(trim(coalesce(p_cover_image_path, '')), ''), cover_image_path),
    profile_image_path = coalesce(nullif(trim(coalesce(p_profile_image_path, '')), ''), profile_image_path),
    gallery_paths = coalesce(p_gallery_paths, gallery_paths),
    working_hours = coalesce(p_working_hours, working_hours),
    contact_links = coalesce(p_contact_links, contact_links),
    profile_sections = coalesce(p_profile_sections, profile_sections),
    public_status = case when p_resubmit_review then 'pending_review' else public_status end,
    verification_status = case when p_resubmit_review then 'pending_review' else verification_status end,
    submitted_for_review_at = case when p_resubmit_review then now() else submitted_for_review_at end,
    updated_at = now()
  where id = p_business_id returning * into v_business;
  return jsonb_build_object('ok', true, 'business', to_jsonb(v_business));
end;
$$;

create or replace function public.get_business_team(p_business_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_items jsonb;
  v_invitations jsonb;
begin
  if v_user_id is null then raise exception 'not_authenticated'; end if;
  if not exists (select 1 from public.business_profiles where id = p_business_id and owner_user_id = v_user_id) then raise exception 'business_owner_required'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'membership_id', tm.id,
    'business_id', tm.business_id,
    'user_id', tm.user_id,
    'status', tm.status,
    'label', tm.label,
    'created_at', tm.created_at,
    'updated_at', tm.updated_at,
    'profile', jsonb_build_object('id', p.id, 'full_name', p.full_name, 'phone', p.phone, 'status', p.status)
  ) order by tm.created_at asc), '[]'::jsonb) into v_items
  from public.business_team_members tm join public.profiles p on p.id = tm.user_id where tm.business_id = p_business_id;
  select coalesce(jsonb_agg(jsonb_build_object(
    'invitation_id', bi.id,
    'invited_phone', bi.invited_phone,
    'invited_user_id', bi.invited_user_id,
    'status', bi.status,
    'label', bi.label,
    'created_at', bi.created_at,
    'expires_at', bi.expires_at
  ) order by bi.created_at desc), '[]'::jsonb) into v_invitations
  from public.business_invitations bi where bi.business_id = p_business_id and bi.invitation_type = 'team_member' and bi.status = 'pending' and bi.expires_at > now();
  return jsonb_build_object('items', v_items, 'pending_invitations', v_invitations);
end;
$$;

create or replace function public.update_business_team_member_status(p_business_id uuid, p_member_user_id uuid, p_action text, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_status text;
  v_member public.business_team_members%rowtype;
begin
  if v_user_id is null then raise exception 'not_authenticated'; end if;
  if not exists (select 1 from public.business_profiles where id = p_business_id and owner_user_id = v_user_id) then raise exception 'business_owner_required'; end if;
  if p_member_user_id = v_user_id and p_action in ('suspended', 'removed') then raise exception 'owner_membership_cannot_be_disabled'; end if;
  if p_action = 'suspended' then v_status := 'disabled'; elsif p_action = 'reactivated' then v_status := 'active'; elsif p_action = 'removed' then v_status := 'removed'; else raise exception 'invalid_team_action'; end if;
  update public.business_team_members set status = v_status, updated_at = now(), metadata = metadata || jsonb_build_object('last_action', p_action, 'last_reason', p_reason)
  where business_id = p_business_id and user_id = p_member_user_id returning * into v_member;
  if not found then raise exception 'team_member_not_found'; end if;
  insert into public.business_team_actions (business_id, member_user_id, action, performed_by_user_id, reason) values (p_business_id, p_member_user_id, p_action, v_user_id, p_reason);
  return jsonb_build_object('ok', true, 'member', to_jsonb(v_member));
end;
$$;

create or replace function public.upsert_business_catalog_item(
  p_business_id uuid,
  p_item_id uuid default null,
  p_item_type text default 'product',
  p_title text default null,
  p_description text default null,
  p_price numeric default null,
  p_currency text default null,
  p_image_paths jsonb default '[]'::jsonb,
  p_features jsonb default '[]'::jsonb,
  p_status text default 'active',
  p_display_order integer default 100
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_item public.business_catalog_items%rowtype;
begin
  if v_user_id is null then raise exception 'not_authenticated'; end if;
  if not exists (select 1 from public.business_profiles where id = p_business_id and owner_user_id = v_user_id) then raise exception 'business_owner_required'; end if;
  if p_item_type not in ('product', 'service') then raise exception 'invalid_catalog_item_type'; end if;
  if p_status not in ('draft', 'active', 'hidden', 'archived') then raise exception 'invalid_catalog_item_status'; end if;
  if p_currency is not null and p_currency not in ('YER', 'SAR', 'USD') then raise exception 'invalid_currency'; end if;
  if p_title is null or length(trim(p_title)) < 2 then raise exception 'catalog_title_required'; end if;
  if p_item_id is null then
    insert into public.business_catalog_items (business_id, created_by_user_id, item_type, title, description, price, currency, image_paths, features, status, display_order)
    values (p_business_id, v_user_id, p_item_type, trim(p_title), nullif(trim(coalesce(p_description, '')), ''), p_price, p_currency, coalesce(p_image_paths, '[]'::jsonb), coalesce(p_features, '[]'::jsonb), p_status, coalesce(p_display_order, 100)) returning * into v_item;
  else
    update public.business_catalog_items set item_type = p_item_type, title = trim(p_title), description = nullif(trim(coalesce(p_description, '')), ''), price = p_price, currency = p_currency, image_paths = coalesce(p_image_paths, image_paths), features = coalesce(p_features, features), status = p_status, display_order = coalesce(p_display_order, display_order), updated_at = now()
    where id = p_item_id and business_id = p_business_id returning * into v_item;
    if not found then raise exception 'catalog_item_not_found'; end if;
  end if;
  return jsonb_build_object('ok', true, 'item', to_jsonb(v_item));
end;
$$;

create or replace function public.get_business_catalog(p_business_id uuid, p_include_hidden boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_is_owner boolean;
  v_is_public boolean;
  v_items jsonb;
begin
  if v_user_id is null then raise exception 'not_authenticated'; end if;
  select owner_user_id = v_user_id, public_status = 'published' into v_is_owner, v_is_public from public.business_profiles where id = p_business_id;
  if not coalesce(v_is_owner, false) and not coalesce(v_is_public, false) then raise exception 'business_not_found_or_not_published'; end if;
  select coalesce(jsonb_agg(to_jsonb(ci) order by ci.display_order asc, ci.created_at desc), '[]'::jsonb) into v_items
  from public.business_catalog_items ci where ci.business_id = p_business_id and ((v_is_owner and p_include_hidden) or ci.status = 'active');
  return jsonb_build_object('items', v_items);
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
  v_business_id uuid;
  v_catalog jsonb;
begin
  if v_user_id is null then raise exception 'not_authenticated'; end if;
  select jsonb_build_object(
    'id', bp.id,
    'name', bp.name,
    'slug', bp.slug,
    'category', case when bc.id is null then null else jsonb_build_object('id', bc.id, 'code', bc.code, 'name_ar', bc.name_ar) end,
    'governorate', bp.governorate,
    'city', bp.city,
    'whatsapp', bp.whatsapp,
    'description', bp.description,
    'display_tagline', bp.display_tagline,
    'address_text', bp.address_text,
    'latitude', bp.latitude,
    'longitude', bp.longitude,
    'logo_path', bp.logo_path,
    'cover_image_path', bp.cover_image_path,
    'profile_image_path', bp.profile_image_path,
    'gallery_paths', bp.gallery_paths,
    'working_hours', bp.working_hours,
    'contact_links', bp.contact_links,
    'profile_sections', bp.profile_sections,
    'public_status', bp.public_status,
    'created_at', bp.created_at,
    'is_customer', exists(select 1 from public.business_customers c where c.business_id = bp.id and c.user_id = v_user_id and c.status = 'active')
  ), bp.id into v_profile, v_business_id
  from public.business_profiles bp left join public.business_categories bc on bc.id = bp.category_id
  where bp.slug = p_slug and (bp.public_status = 'published' or bp.owner_user_id = v_user_id or public.is_platform_admin(v_user_id));
  if v_profile is null then raise exception 'business_not_found_or_not_published'; end if;
  select public.get_business_catalog(v_business_id, false) into v_catalog;
  return v_profile || jsonb_build_object('catalog', coalesce(v_catalog->'items', '[]'::jsonb));
end;
$$;

grant execute on function public.update_business_profile(uuid, text, text, uuid, text, text, text, text, text, text, numeric, numeric, text, text, jsonb, jsonb, jsonb, jsonb, boolean) to authenticated;
grant execute on function public.get_business_team(uuid) to authenticated;
grant execute on function public.update_business_team_member_status(uuid, uuid, text, text) to authenticated;
grant execute on function public.upsert_business_catalog_item(uuid, uuid, text, text, text, numeric, text, jsonb, jsonb, text, integer) to authenticated;
grant execute on function public.get_business_catalog(uuid, boolean) to authenticated;
;

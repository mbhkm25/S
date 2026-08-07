-- SANAD business public profile modes v1
-- Adds a small, backward-compatible presentation configuration for public business profiles.

alter table public.business_profiles
  add column if not exists profile_mode text not null default 'products',
  add column if not exists primary_action text not null default 'whatsapp',
  add column if not exists primary_action_label text,
  add column if not exists enabled_sections jsonb not null default '["overview","catalog","hours","financial","contact"]'::jsonb,
  add column if not exists featured_item_ids jsonb not null default '[]'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'business_profiles_profile_mode_check'
      and conrelid = 'public.business_profiles'::regclass
  ) then
    alter table public.business_profiles
      add constraint business_profiles_profile_mode_check
      check (profile_mode in ('products','services','appointments','menu','portfolio','custom'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'business_profiles_primary_action_check'
      and conrelid = 'public.business_profiles'::regclass
  ) then
    alter table public.business_profiles
      add constraint business_profiles_primary_action_check
      check (primary_action in ('whatsapp','call','browse','request_service','request_booking','request_quote'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'business_profiles_primary_action_label_length_check'
      and conrelid = 'public.business_profiles'::regclass
  ) then
    alter table public.business_profiles
      add constraint business_profiles_primary_action_label_length_check
      check (primary_action_label is null or length(primary_action_label) <= 60);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'business_profiles_enabled_sections_array_check'
      and conrelid = 'public.business_profiles'::regclass
  ) then
    alter table public.business_profiles
      add constraint business_profiles_enabled_sections_array_check
      check (jsonb_typeof(enabled_sections) = 'array' and jsonb_array_length(enabled_sections) <= 12);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'business_profiles_featured_item_ids_array_check'
      and conrelid = 'public.business_profiles'::regclass
  ) then
    alter table public.business_profiles
      add constraint business_profiles_featured_item_ids_array_check
      check (jsonb_typeof(featured_item_ids) = 'array' and jsonb_array_length(featured_item_ids) <= 3);
  end if;
end $$;

create or replace function public.set_business_public_profile_settings(
  p_business_id uuid,
  p_profile_mode text,
  p_primary_action text,
  p_primary_action_label text default null,
  p_enabled_sections jsonb default null,
  p_featured_item_ids jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_sections jsonb;
  v_featured jsonb;
  v_value text;
  v_featured_id uuid;
  v_business public.business_profiles%rowtype;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  select * into v_business
  from public.business_profiles
  where id = p_business_id
  for update;

  if not found then
    raise exception 'business_not_found';
  end if;

  if v_business.owner_user_id <> v_uid and not public.is_platform_admin(v_uid) then
    raise exception 'business_owner_required';
  end if;

  if p_profile_mode not in ('products','services','appointments','menu','portfolio','custom') then
    raise exception 'invalid_profile_mode';
  end if;

  if p_primary_action not in ('whatsapp','call','browse','request_service','request_booking','request_quote') then
    raise exception 'invalid_primary_action';
  end if;

  if p_primary_action_label is not null and length(trim(p_primary_action_label)) > 60 then
    raise exception 'primary_action_label_too_long';
  end if;

  v_sections := coalesce(p_enabled_sections, v_business.enabled_sections);
  if jsonb_typeof(v_sections) <> 'array' or jsonb_array_length(v_sections) > 12 then
    raise exception 'invalid_enabled_sections';
  end if;

  for v_value in select jsonb_array_elements_text(v_sections)
  loop
    if v_value not in ('overview','catalog','services','appointments','offers','portfolio','hours','financial','contact','about','location') then
      raise exception 'invalid_profile_section';
    end if;
  end loop;

  v_featured := coalesce(p_featured_item_ids, v_business.featured_item_ids);
  if jsonb_typeof(v_featured) <> 'array' or jsonb_array_length(v_featured) > 3 then
    raise exception 'invalid_featured_item_ids';
  end if;

  for v_value in select jsonb_array_elements_text(v_featured)
  loop
    begin
      v_featured_id := v_value::uuid;
    exception when invalid_text_representation then
      raise exception 'invalid_featured_item_id';
    end;

    if not exists (
      select 1
      from public.business_catalog_items ci
      where ci.id = v_featured_id
        and ci.business_id = p_business_id
        and ci.status = 'active'
    ) then
      raise exception 'featured_item_not_available';
    end if;
  end loop;

  update public.business_profiles
  set profile_mode = p_profile_mode,
      primary_action = p_primary_action,
      primary_action_label = nullif(trim(coalesce(p_primary_action_label, '')), ''),
      enabled_sections = v_sections,
      featured_item_ids = v_featured,
      updated_at = now()
  where id = p_business_id
  returning * into v_business;

  return jsonb_build_object('ok', true, 'business', to_jsonb(v_business));
end;
$function$;

revoke all on function public.set_business_public_profile_settings(uuid,text,text,text,jsonb,jsonb) from public;
revoke all on function public.set_business_public_profile_settings(uuid,text,text,text,jsonb,jsonb) from anon;
grant execute on function public.set_business_public_profile_settings(uuid,text,text,text,jsonb,jsonb) to authenticated;
grant execute on function public.set_business_public_profile_settings(uuid,text,text,text,jsonb,jsonb) to service_role;

create or replace function public.get_public_business_profile(p_slug text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_slug text := nullif(trim(coalesce(p_slug,'')), '');
  v_business jsonb;
  v_sections jsonb;
  v_catalog jsonb;
begin
  if v_slug is null or length(v_slug) > 100 then
    raise exception 'invalid_business_slug';
  end if;

  select jsonb_build_object(
    'id', bp.id,
    'name', bp.name,
    'slug', bp.slug,
    'display_tagline', bp.display_tagline,
    'description', bp.description,
    'category_id', bp.category_id,
    'category_name', bc.name_ar,
    'governorate', bp.governorate,
    'city', bp.city,
    'whatsapp', bp.whatsapp,
    'whatsapp_catalog_url', bp.whatsapp_catalog_url,
    'address_text', bp.address_text,
    'latitude', bp.latitude,
    'longitude', bp.longitude,
    'cover_image_path', bp.cover_image_path,
    'horizontal_cover_image_path', bp.horizontal_cover_image_path,
    'profile_image_path', bp.profile_image_path,
    'logo_path', bp.logo_path,
    'gallery_paths', coalesce(bp.gallery_paths, '[]'::jsonb),
    'working_hours', coalesce(bp.working_hours, '{}'::jsonb),
    'contact_links', coalesce(bp.contact_links, '{}'::jsonb),
    'public_status', bp.public_status,
    'verification_status', bp.verification_status,
    'profile_mode', bp.profile_mode,
    'primary_action', bp.primary_action,
    'primary_action_label', bp.primary_action_label,
    'enabled_sections', coalesce(bp.enabled_sections, '[]'::jsonb),
    'featured_item_ids', coalesce(bp.featured_item_ids, '[]'::jsonb),
    'created_at', bp.created_at,
    'updated_at', bp.updated_at
  ), jsonb_build_object(
    'financial_accounts', coalesce(bp.profile_sections->'financial_accounts', '[]'::jsonb),
    'reviews', coalesce(bp.profile_sections->'reviews', '[]'::jsonb)
  ) into v_business, v_sections
  from public.business_profiles bp
  left join public.business_categories bc on bc.id = bp.category_id
  where bp.slug = v_slug
    and bp.public_status = 'published';

  if v_business is null then
    raise exception 'business_not_found_or_not_published';
  end if;

  select coalesce(
    jsonb_agg(to_jsonb(ci) order by ci.is_featured desc, ci.display_order, ci.created_at desc),
    '[]'::jsonb
  ) into v_catalog
  from (
    select *
    from public.business_catalog_items
    where business_id = (v_business->>'id')::uuid
      and status = 'active'
    order by is_featured desc, display_order, created_at desc
    limit 10
  ) ci;

  return v_business || jsonb_build_object(
    'profile_sections', v_sections,
    'catalog_items', v_catalog
  );
end;
$function$;

revoke all on function public.get_public_business_profile(text) from public;
grant execute on function public.get_public_business_profile(text) to anon;
grant execute on function public.get_public_business_profile(text) to authenticated;
grant execute on function public.get_public_business_profile(text) to service_role;

comment on column public.business_profiles.profile_mode is 'Public profile presentation mode: products, services, appointments, menu, portfolio, or custom.';
comment on column public.business_profiles.primary_action is 'Primary visitor action shown on the public profile.';
comment on column public.business_profiles.enabled_sections is 'Ordered public profile section identifiers enabled by the business owner.';
comment on column public.business_profiles.featured_item_ids is 'Up to three active catalog item IDs highlighted on the public profile overview.';

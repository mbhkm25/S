alter table public.business_profiles
  add column if not exists whatsapp_catalog_url text;

comment on column public.business_profiles.whatsapp_catalog_url is
  'Optional WhatsApp Business catalog URL shown on the public business profile. Used instead of SANAD internal catalog in the current MVP.';

comment on table public.business_catalog_items is
  'Reserved for future use. SANAD MVP currently uses whatsapp_catalog_url on business_profiles instead of an internal product catalog.';

comment on table public.business_inquiries is
  'Reserved for future use. SANAD MVP currently routes product/catalog interactions to WhatsApp Business catalog and WhatsApp contact.';

create or replace function public.normalize_whatsapp_catalog_url(p_url text)
returns text
language plpgsql
immutable
as $$
declare
  v text;
begin
  v := nullif(trim(coalesce(p_url, '')), '');
  if v is null then
    return null;
  end if;

  -- Keep validation intentionally permissive because WhatsApp catalog/share links vary by region and product.
  -- Reject only clearly unsafe schemes.
  if v ~* '^(javascript|data|vbscript):' then
    raise exception 'unsafe_catalog_url';
  end if;

  return v;
end;
$$;

create or replace function public.update_business_profile(
  p_business_id uuid,
  p_name text default null,
  p_tagline text default null,
  p_description text default null,
  p_category_id uuid default null,
  p_governorate text default null,
  p_city text default null,
  p_whatsapp text default null,
  p_address_text text default null,
  p_latitude numeric default null,
  p_longitude numeric default null,
  p_cover_image_path text default null,
  p_profile_image_path text default null,
  p_gallery_paths jsonb default null,
  p_working_hours jsonb default null,
  p_contact_links jsonb default null,
  p_profile_sections jsonb default null,
  p_whatsapp_catalog_url text default null,
  p_resubmit_review boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business public.business_profiles%rowtype;
  v_next_public_status text;
  v_next_verification_status text;
begin
  select * into v_business
  from public.business_profiles
  where id = p_business_id
  for update;

  if not found then
    raise exception 'business_not_found';
  end if;

  if v_business.owner_user_id <> auth.uid() then
    raise exception 'not_business_owner';
  end if;

  v_next_public_status := v_business.public_status;
  v_next_verification_status := v_business.verification_status;

  if p_resubmit_review is true then
    v_next_public_status := 'pending_review';
    v_next_verification_status := 'pending_review';
  end if;

  update public.business_profiles
  set
    name = coalesce(nullif(trim(p_name), ''), name),
    display_tagline = case when p_tagline is not null then nullif(trim(p_tagline), '') else display_tagline end,
    description = case when p_description is not null then nullif(trim(p_description), '') else description end,
    category_id = coalesce(p_category_id, category_id),
    governorate = case when p_governorate is not null then nullif(trim(p_governorate), '') else governorate end,
    city = case when p_city is not null then nullif(trim(p_city), '') else city end,
    whatsapp = case when p_whatsapp is not null then nullif(regexp_replace(p_whatsapp, '[^0-9]', '', 'g'), '') else whatsapp end,
    address_text = case when p_address_text is not null then nullif(trim(p_address_text), '') else address_text end,
    -- Keep coordinates columns for future compatibility, but current UI should not send them.
    latitude = coalesce(p_latitude, latitude),
    longitude = coalesce(p_longitude, longitude),
    cover_image_path = case when p_cover_image_path is not null then nullif(trim(p_cover_image_path), '') else cover_image_path end,
    profile_image_path = case when p_profile_image_path is not null then nullif(trim(p_profile_image_path), '') else profile_image_path end,
    gallery_paths = coalesce(p_gallery_paths, gallery_paths),
    working_hours = coalesce(p_working_hours, working_hours),
    contact_links = coalesce(p_contact_links, contact_links),
    profile_sections = coalesce(p_profile_sections, profile_sections),
    whatsapp_catalog_url = case when p_whatsapp_catalog_url is not null then public.normalize_whatsapp_catalog_url(p_whatsapp_catalog_url) else whatsapp_catalog_url end,
    public_status = v_next_public_status,
    verification_status = v_next_verification_status,
    updated_at = now()
  where id = p_business_id
  returning * into v_business;

  return jsonb_build_object(
    'ok', true,
    'business', to_jsonb(v_business)
  );
end;
$$;

create or replace function public.get_public_business_profile(p_slug text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business jsonb;
  v_catalog jsonb;
begin
  select jsonb_build_object(
    'id', bp.id,
    'name', bp.name,
    'slug', bp.slug,
    'display_tagline', bp.display_tagline,
    'description', bp.description,
    'category_id', bp.category_id,
    'category_name', bc.name,
    'governorate', bp.governorate,
    'city', bp.city,
    'whatsapp', bp.whatsapp,
    'whatsapp_catalog_url', bp.whatsapp_catalog_url,
    'address_text', bp.address_text,
    'cover_image_path', bp.cover_image_path,
    'profile_image_path', bp.profile_image_path,
    'gallery_paths', coalesce(bp.gallery_paths, '[]'::jsonb),
    'working_hours', coalesce(bp.working_hours, '{}'::jsonb),
    'contact_links', coalesce(bp.contact_links, '{}'::jsonb),
    'profile_sections', coalesce(bp.profile_sections, '{}'::jsonb),
    'public_status', bp.public_status,
    'verification_status', bp.verification_status,
    'created_at', bp.created_at,
    'updated_at', bp.updated_at
  ) into v_business
  from public.business_profiles bp
  left join public.business_categories bc on bc.id = bp.category_id
  where bp.slug = p_slug
    and bp.public_status = 'published';

  if v_business is null then
    raise exception 'business_not_found_or_not_published';
  end if;

  -- Internal catalog is intentionally not exposed in current MVP.
  v_catalog := '[]'::jsonb;

  return v_business || jsonb_build_object('catalog_items', v_catalog);
end;
$$;;

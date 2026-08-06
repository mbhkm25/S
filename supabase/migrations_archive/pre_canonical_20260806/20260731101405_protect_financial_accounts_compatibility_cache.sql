-- Prevent general profile updates from replacing the normalized financial account cache.

create or replace function public.update_business_profile(
  p_business_id uuid,
  p_name text default null,
  p_slug text default null,
  p_tagline text default null,
  p_display_tagline text default null,
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
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_business public.business_profiles%rowtype;
  v_next_public_status text;
  v_next_verification_status text;
  v_tagline text;
  v_slug text;
  v_whatsapp text;
  v_gallery_item jsonb;
  v_next_profile_sections jsonb;
begin
  if v_user_id is null then
    raise exception 'not_authenticated';
  end if;

  select * into v_business
  from public.business_profiles
  where id = p_business_id
  for update;

  if not found then
    raise exception 'business_not_found';
  end if;
  if v_business.owner_user_id <> v_user_id then
    raise exception 'not_business_owner';
  end if;

  if p_name is not null and (length(trim(p_name)) < 2 or length(trim(p_name)) > 120) then
    raise exception 'invalid_business_name';
  end if;
  if p_description is not null and length(p_description) > 4000 then
    raise exception 'business_description_too_long';
  end if;
  if coalesce(p_tagline, p_display_tagline) is not null and length(trim(coalesce(p_tagline, p_display_tagline))) > 180 then
    raise exception 'business_tagline_too_long';
  end if;
  if p_governorate is not null and length(trim(p_governorate)) > 100 then
    raise exception 'business_governorate_too_long';
  end if;
  if p_city is not null and length(trim(p_city)) > 100 then
    raise exception 'business_city_too_long';
  end if;
  if p_address_text is not null and length(p_address_text) > 1000 then
    raise exception 'business_address_too_long';
  end if;

  if p_category_id is not null and not exists (
    select 1 from public.business_categories where id = p_category_id and status = 'active'
  ) then
    raise exception 'invalid_business_category';
  end if;

  if p_whatsapp is not null then
    v_whatsapp := regexp_replace(p_whatsapp, '[^0-9]', '', 'g');
    if v_whatsapp !~ '^967[0-9]{9}$' then
      raise exception 'valid_yemen_whatsapp_required';
    end if;
  end if;

  if p_latitude is not null and (p_latitude < -90 or p_latitude > 90) then
    raise exception 'invalid_latitude';
  end if;
  if p_longitude is not null and (p_longitude < -180 or p_longitude > 180) then
    raise exception 'invalid_longitude';
  end if;

  v_slug := nullif(trim(coalesce(p_slug, '')), '');
  if v_slug is not null then
    v_slug := public.sanitize_business_slug(v_slug);
    if length(v_slug) < 3 or length(v_slug) > 100 then
      raise exception 'invalid_business_slug';
    end if;
    if exists (
      select 1 from public.business_profiles
      where slug = v_slug and id <> p_business_id
    ) then
      raise exception 'business_slug_already_exists';
    end if;
  end if;

  if p_cover_image_path is not null and trim(p_cover_image_path) <> '' then
    perform private.assert_business_media_path(p_business_id, p_cover_image_path, array['cover'], true);
  end if;
  if p_profile_image_path is not null and trim(p_profile_image_path) <> '' then
    perform private.assert_business_media_path(p_business_id, p_profile_image_path, array['profile'], true);
  end if;

  if p_gallery_paths is not null then
    if jsonb_typeof(p_gallery_paths) <> 'array' then
      raise exception 'gallery_paths_must_be_array';
    end if;
    if jsonb_array_length(p_gallery_paths) > 20 then
      raise exception 'gallery_paths_limit_exceeded';
    end if;
    for v_gallery_item in select value from jsonb_array_elements(p_gallery_paths)
    loop
      if jsonb_typeof(v_gallery_item) <> 'string' then
        raise exception 'gallery_path_must_be_string';
      end if;
      perform private.assert_business_media_path(p_business_id, v_gallery_item #>> '{}', array['gallery'], true);
    end loop;
  end if;

  if p_working_hours is not null and (jsonb_typeof(p_working_hours) <> 'object' or pg_column_size(p_working_hours) > 32768) then
    raise exception 'invalid_working_hours';
  end if;
  if p_contact_links is not null and (jsonb_typeof(p_contact_links) <> 'object' or pg_column_size(p_contact_links) > 32768) then
    raise exception 'invalid_contact_links';
  end if;
  if p_profile_sections is not null and (jsonb_typeof(p_profile_sections) <> 'object' or pg_column_size(p_profile_sections) > 262144) then
    raise exception 'invalid_profile_sections';
  end if;

  -- financial_accounts is a generated compatibility cache owned by the
  -- normalized business financial account tables. General profile updates
  -- may change every other section but cannot replace this cache.
  v_next_profile_sections := case
    when p_profile_sections is null then v_business.profile_sections
    else jsonb_set(
      coalesce(p_profile_sections, '{}'::jsonb) - 'financial_accounts',
      '{financial_accounts}',
      coalesce(v_business.profile_sections->'financial_accounts', '[]'::jsonb),
      true
    )
  end;

  v_next_public_status := v_business.public_status;
  v_next_verification_status := v_business.verification_status;
  v_tagline := coalesce(p_tagline, p_display_tagline);
  if p_resubmit_review is true then
    v_next_public_status := 'pending_review';
    v_next_verification_status := 'pending_review';
  end if;

  update public.business_profiles
  set name = case when p_name is not null then trim(p_name) else name end,
      slug = coalesce(v_slug, slug),
      display_tagline = case when v_tagline is not null then nullif(trim(v_tagline), '') else display_tagline end,
      description = case when p_description is not null then nullif(trim(p_description), '') else description end,
      category_id = coalesce(p_category_id, category_id),
      governorate = case when p_governorate is not null then nullif(trim(p_governorate), '') else governorate end,
      city = case when p_city is not null then nullif(trim(p_city), '') else city end,
      whatsapp = coalesce(v_whatsapp, whatsapp),
      address_text = case when p_address_text is not null then nullif(trim(p_address_text), '') else address_text end,
      latitude = coalesce(p_latitude, latitude),
      longitude = coalesce(p_longitude, longitude),
      cover_image_path = case when p_cover_image_path is not null then nullif(trim(p_cover_image_path), '') else cover_image_path end,
      profile_image_path = case when p_profile_image_path is not null then nullif(trim(p_profile_image_path), '') else profile_image_path end,
      gallery_paths = coalesce(p_gallery_paths, gallery_paths),
      working_hours = coalesce(p_working_hours, working_hours),
      contact_links = coalesce(p_contact_links, contact_links),
      profile_sections = v_next_profile_sections,
      whatsapp_catalog_url = case when p_whatsapp_catalog_url is not null then public.normalize_whatsapp_catalog_url(p_whatsapp_catalog_url) else whatsapp_catalog_url end,
      public_status = v_next_public_status,
      verification_status = v_next_verification_status,
      submitted_for_review_at = case when p_resubmit_review then now() else submitted_for_review_at end,
      updated_at = now()
  where id = p_business_id
  returning * into v_business;

  return jsonb_build_object('ok', true, 'business', to_jsonb(v_business));
end;
$$;

comment on function public.update_business_profile(uuid, text, text, text, text, text, uuid, text, text, text, text, numeric, numeric, text, text, jsonb, jsonb, jsonb, jsonb, text, boolean) is
  'Updates owner-managed profile fields while preserving the canonical financial_accounts compatibility cache.';

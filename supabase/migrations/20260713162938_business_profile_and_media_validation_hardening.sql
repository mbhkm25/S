begin;

create or replace function private.business_media_can_manage(p_object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
    and public.business_media_path_asset_type(p_object_name) in ('cover', 'profile', 'gallery', 'catalog', 'products')
    and exists (
      select 1
      from public.business_profiles bp
      where bp.id = public.business_media_path_business_id(p_object_name)
        and bp.owner_user_id = auth.uid()
    );
$$;

revoke execute on function private.business_media_can_manage(text) from public, anon;
grant execute on function private.business_media_can_manage(text) to authenticated, service_role;

create or replace function private.assert_business_media_path(
  p_business_id uuid,
  p_path text,
  p_allowed_types text[],
  p_require_object boolean default true
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_type text;
begin
  if p_path is null or trim(p_path) = '' then
    raise exception 'business_media_path_required';
  end if;

  if length(p_path) > 1024 then
    raise exception 'business_media_path_too_long';
  end if;

  if public.business_media_path_business_id(p_path) is distinct from p_business_id then
    raise exception 'business_media_path_business_mismatch';
  end if;

  v_type := public.business_media_path_asset_type(p_path);
  if v_type is null or not (v_type = any(p_allowed_types)) then
    raise exception 'business_media_path_asset_type_mismatch';
  end if;

  if p_require_object and not exists (
    select 1
    from storage.objects o
    where o.bucket_id = 'business-media'
      and o.name = p_path
  ) then
    raise exception 'business_media_object_not_found';
  end if;
end;
$$;

revoke execute on function private.assert_business_media_path(uuid, text, text[], boolean) from public, anon, authenticated;
grant execute on function private.assert_business_media_path(uuid, text, text[], boolean) to service_role;

create or replace function public.normalize_whatsapp_catalog_url(p_url text)
returns text
language plpgsql
immutable
set search_path = pg_catalog, public
as $$
declare
  v text;
begin
  v := nullif(trim(coalesce(p_url, '')), '');
  if v is null then
    return null;
  end if;

  if length(v) > 2048 then
    raise exception 'catalog_url_too_long';
  end if;

  if v ~* '^wa\.me/' or v ~* '^([a-z0-9-]+\.)*whatsapp\.com/' then
    v := 'https://' || v;
  end if;

  if v !~* '^https://(wa\.me|([a-z0-9-]+\.)*whatsapp\.com)(/|$)' then
    raise exception 'invalid_whatsapp_catalog_url';
  end if;

  return v;
end;
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
  v_whatsapp text;
  v_business public.business_profiles%rowtype;
begin
  if v_user_id is null then
    raise exception 'not_authenticated';
  end if;

  select * into v_profile
  from public.profiles
  where id = v_user_id and status = 'active';
  if not found then
    raise exception 'profile_not_found_or_inactive';
  end if;

  if exists (select 1 from public.business_profiles where owner_user_id = v_user_id) then
    raise exception 'business_already_exists_for_user';
  end if;

  if p_name is null or length(trim(p_name)) < 2 or length(trim(p_name)) > 120 then
    raise exception 'invalid_business_name';
  end if;

  if p_description is not null and length(p_description) > 4000 then
    raise exception 'business_description_too_long';
  end if;
  if p_governorate is not null and length(trim(p_governorate)) > 100 then
    raise exception 'business_governorate_too_long';
  end if;
  if p_city is not null and length(trim(p_city)) > 100 then
    raise exception 'business_city_too_long';
  end if;

  v_whatsapp := regexp_replace(coalesce(p_whatsapp, ''), '[^0-9]', '', 'g');
  if v_whatsapp !~ '^967[0-9]{9}$' then
    raise exception 'valid_yemen_whatsapp_required';
  end if;

  if p_category_id is not null and not exists (
    select 1 from public.business_categories where id = p_category_id and status = 'active'
  ) then
    raise exception 'invalid_business_category';
  end if;

  v_slug := public.sanitize_business_slug(coalesce(nullif(trim(p_slug), ''), p_name));
  if length(v_slug) < 3 then
    v_slug := 'business-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 10);
  end if;
  if length(v_slug) > 100 then
    v_slug := left(v_slug, 100);
  end if;

  if exists (select 1 from public.business_profiles where slug = v_slug) then
    v_slug := left(v_slug, 93) || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6);
  end if;

  insert into public.business_profiles (
    owner_user_id, name, slug, category_id, governorate, city, whatsapp,
    description, logo_path, public_status, verification_status, submitted_for_review_at
  ) values (
    v_user_id, trim(p_name), v_slug, p_category_id,
    nullif(trim(coalesce(p_governorate, '')), ''),
    nullif(trim(coalesce(p_city, '')), ''),
    v_whatsapp,
    nullif(trim(coalesce(p_description, '')), ''),
    nullif(trim(coalesce(p_logo_path, '')), ''),
    'pending_review', 'pending_review', now()
  ) returning * into v_business;

  insert into public.business_team_members (
    business_id, user_id, status, label, added_by_owner_id, metadata
  ) values (
    v_business.id, v_user_id, 'active', 'مالك النشاط', v_user_id,
    jsonb_build_object('auto_added_owner', true)
  ) on conflict (business_id, user_id) do nothing;

  return jsonb_build_object('ok', true, 'business', to_jsonb(v_business), 'message', 'business_submitted_for_review');
end;
$$;

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
set search_path = public
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
      profile_sections = coalesce(p_profile_sections, profile_sections),
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

create or replace function public.set_business_profile_media(
  p_business_id uuid,
  p_cover_image_path text default null,
  p_profile_image_path text default null,
  p_gallery_paths jsonb default null,
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
  v_gallery_item jsonb;
begin
  if v_user_id is null then
    raise exception 'not_authenticated';
  end if;
  if not exists (
    select 1 from public.business_profiles
    where id = p_business_id and owner_user_id = v_user_id
  ) then
    raise exception 'business_owner_required';
  end if;

  if p_cover_image_path is not null and trim(p_cover_image_path) <> '' then
    perform private.assert_business_media_path(p_business_id, p_cover_image_path, array['cover'], true);
  end if;
  if p_profile_image_path is not null and trim(p_profile_image_path) <> '' then
    perform private.assert_business_media_path(p_business_id, p_profile_image_path, array['profile'], true);
  end if;
  if p_gallery_paths is not null then
    if jsonb_typeof(p_gallery_paths) <> 'array' or jsonb_array_length(p_gallery_paths) > 20 then
      raise exception 'invalid_gallery_paths';
    end if;
    for v_gallery_item in select value from jsonb_array_elements(p_gallery_paths)
    loop
      if jsonb_typeof(v_gallery_item) <> 'string' then
        raise exception 'gallery_path_must_be_string';
      end if;
      perform private.assert_business_media_path(p_business_id, v_gallery_item #>> '{}', array['gallery'], true);
    end loop;
  end if;

  update public.business_profiles
  set cover_image_path = case when p_cover_image_path is not null then nullif(trim(p_cover_image_path), '') else cover_image_path end,
      profile_image_path = case when p_profile_image_path is not null then nullif(trim(p_profile_image_path), '') else profile_image_path end,
      gallery_paths = coalesce(p_gallery_paths, gallery_paths),
      public_status = case when p_resubmit_review then 'pending_review' else public_status end,
      verification_status = case when p_resubmit_review then 'pending_review' else verification_status end,
      submitted_for_review_at = case when p_resubmit_review then now() else submitted_for_review_at end,
      updated_at = now()
  where id = p_business_id
  returning * into v_business;

  return jsonb_build_object('ok', true, 'business', to_jsonb(v_business));
end;
$$;

create or replace function public.register_business_media_asset(
  p_business_id uuid,
  p_asset_type text,
  p_storage_path text,
  p_mime_type text default null,
  p_file_name text default null,
  p_file_size bigint default null,
  p_alt_text text default null,
  p_display_order integer default 100
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_asset public.business_media_assets%rowtype;
  v_object storage.objects%rowtype;
  v_object_mime text;
  v_object_size bigint;
begin
  if v_user_id is null then
    raise exception 'not_authenticated';
  end if;
  if p_asset_type not in ('cover', 'profile', 'gallery', 'catalog', 'products') then
    raise exception 'invalid_asset_type';
  end if;
  if not exists (
    select 1 from public.business_profiles
    where id = p_business_id and owner_user_id = v_user_id
  ) then
    raise exception 'business_owner_required';
  end if;

  perform private.assert_business_media_path(p_business_id, p_storage_path, array[p_asset_type], true);

  select * into v_object
  from storage.objects
  where bucket_id = 'business-media' and name = p_storage_path
  limit 1;

  if v_object.owner_id is distinct from v_user_id::text then
    raise exception 'storage_object_owner_mismatch';
  end if;

  v_object_mime := lower(coalesce(v_object.metadata->>'mimetype', p_mime_type, ''));
  v_object_size := coalesce(nullif(v_object.metadata->>'size','')::bigint, p_file_size);
  if v_object_mime not in ('image/jpeg', 'image/png', 'image/webp') then
    raise exception 'unsupported_business_media_type';
  end if;
  if v_object_size is null or v_object_size <= 0 or v_object_size > 10485760 then
    raise exception 'invalid_business_media_size';
  end if;
  if p_mime_type is not null and lower(p_mime_type) <> v_object_mime then
    raise exception 'business_media_mime_mismatch';
  end if;
  if p_file_size is not null and p_file_size <> v_object_size then
    raise exception 'business_media_size_mismatch';
  end if;
  if p_file_name is not null and length(p_file_name) > 255 then
    raise exception 'business_media_filename_too_long';
  end if;
  if p_alt_text is not null and length(p_alt_text) > 500 then
    raise exception 'business_media_alt_text_too_long';
  end if;

  insert into public.business_media_assets (
    business_id, owner_user_id, asset_type, storage_bucket, storage_path,
    mime_type, file_name, file_size, alt_text, display_order, status
  ) values (
    p_business_id, v_user_id, p_asset_type, 'business-media', p_storage_path,
    v_object_mime, p_file_name, v_object_size, p_alt_text,
    greatest(0, least(coalesce(p_display_order, 100), 10000)), 'active'
  )
  on conflict (business_id, storage_bucket, storage_path) do update set
    asset_type = excluded.asset_type,
    mime_type = excluded.mime_type,
    file_name = excluded.file_name,
    file_size = excluded.file_size,
    alt_text = excluded.alt_text,
    display_order = excluded.display_order,
    status = 'active',
    updated_at = now()
  returning * into v_asset;

  return jsonb_build_object('ok', true, 'asset', to_jsonb(v_asset));
end;
$$;

create or replace function public.get_business_customers(p_business_id uuid)
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
    'id', bc.id,
    'business_id', bc.business_id,
    'user_id', bc.user_id,
    'status', bc.status,
    'source', bc.source,
    'created_at', bc.created_at,
    'updated_at', bc.updated_at,
    'full_name', p.full_name,
    'phone', p.phone
  ) order by bc.created_at desc), '[]'::jsonb)
  into v_items
  from public.business_customers bc
  join public.profiles p on p.id = bc.user_id
  where bc.business_id = p_business_id;

  return jsonb_build_object('items', v_items);
end;
$$;

revoke execute on function public.get_business_customers(uuid) from public, anon;
grant execute on function public.get_business_customers(uuid) to authenticated, service_role;

-- Reapply explicit grants because CREATE OR REPLACE preserves ACLs in most cases,
-- while this keeps the intended surface unambiguous.
revoke execute on function public.create_business_profile(text, text, uuid, text, text, text, text, text) from public, anon;
revoke execute on function public.update_business_profile(uuid, text, text, text, text, text, uuid, text, text, text, text, numeric, numeric, text, text, jsonb, jsonb, jsonb, jsonb, text, boolean) from public, anon;
revoke execute on function public.set_business_profile_media(uuid, text, text, jsonb, boolean) from public, anon;
revoke execute on function public.register_business_media_asset(uuid, text, text, text, text, bigint, text, integer) from public, anon;
grant execute on function public.create_business_profile(text, text, uuid, text, text, text, text, text) to authenticated, service_role;
grant execute on function public.update_business_profile(uuid, text, text, text, text, text, uuid, text, text, text, text, numeric, numeric, text, text, jsonb, jsonb, jsonb, jsonb, text, boolean) to authenticated, service_role;
grant execute on function public.set_business_profile_media(uuid, text, text, jsonb, boolean) to authenticated, service_role;
grant execute on function public.register_business_media_asset(uuid, text, text, text, text, bigint, text, integer) to authenticated, service_role;

notify pgrst, 'reload schema';
commit;;

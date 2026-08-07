drop function if exists public.update_business_profile(uuid,text,text,text,uuid,text,text,text,text,numeric,numeric,text,text,jsonb,jsonb,jsonb,jsonb,text,boolean);
drop function if exists public.update_business_profile(uuid,text,text,uuid,text,text,text,text,text,text,numeric,numeric,text,text,jsonb,jsonb,jsonb,jsonb,boolean);

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
  v_business public.business_profiles%rowtype;
  v_next_public_status text;
  v_next_verification_status text;
  v_tagline text;
  v_slug text;
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
  v_tagline := coalesce(p_tagline, p_display_tagline);
  v_slug := nullif(trim(coalesce(p_slug, '')), '');

  if p_resubmit_review is true then
    v_next_public_status := 'pending_review';
    v_next_verification_status := 'pending_review';
  end if;

  update public.business_profiles
  set
    name = case when p_name is not null then coalesce(nullif(trim(p_name), ''), name) else name end,
    slug = case when v_slug is not null then v_slug else slug end,
    display_tagline = case when v_tagline is not null then nullif(trim(v_tagline), '') else display_tagline end,
    description = case when p_description is not null then nullif(trim(p_description), '') else description end,
    category_id = coalesce(p_category_id, category_id),
    governorate = case when p_governorate is not null then nullif(trim(p_governorate), '') else governorate end,
    city = case when p_city is not null then nullif(trim(p_city), '') else city end,
    whatsapp = case when p_whatsapp is not null then nullif(regexp_replace(p_whatsapp, '[^0-9]', '', 'g'), '') else whatsapp end,
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
    updated_at = now()
  where id = p_business_id
  returning * into v_business;

  return jsonb_build_object(
    'ok', true,
    'business', to_jsonb(v_business)
  );
end;
$$;

grant execute on function public.update_business_profile(
  uuid,text,text,text,text,text,uuid,text,text,text,text,numeric,numeric,text,text,jsonb,jsonb,jsonb,jsonb,text,boolean
) to authenticated;;

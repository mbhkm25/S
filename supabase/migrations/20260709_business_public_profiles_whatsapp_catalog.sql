create or replace function public.get_public_business_profile(p_slug text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
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
    'category_name', bc.name_ar,
    'governorate', bp.governorate,
    'city', bp.city,
    'whatsapp', bp.whatsapp,
    'whatsapp_catalog_url', bp.whatsapp_catalog_url,
    'address_text', bp.address_text,
    'cover_image_path', bp.cover_image_path,
    'profile_image_path', bp.profile_image_path,
    'logo_path', bp.logo_path,
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

  v_catalog := '[]'::jsonb;

  return v_business || jsonb_build_object('catalog_items', v_catalog);
end;
$function$;

create or replace function public.get_public_businesses(
  p_search text default null::text,
  p_category_id uuid default null::uuid,
  p_governorate text default null::text,
  p_city text default null::text,
  p_limit integer default 50,
  p_offset integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
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
    'category_name', bc.name_ar,
    'governorate', bp.governorate,
    'city', bp.city,
    'whatsapp', bp.whatsapp,
    'description', bp.description,
    'logo_path', bp.logo_path,
    'profile_image_path', bp.profile_image_path,
    'logo_url', coalesce(bp.profile_image_path, bp.logo_path),
    'public_status', bp.public_status,
    'verification_status', bp.verification_status,
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
$function$;

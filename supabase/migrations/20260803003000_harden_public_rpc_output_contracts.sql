begin;

create or replace function public.get_app_public_information()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  select jsonb_build_object(
    'support_whatsapp', info.support_whatsapp,
    'support_phone', info.support_phone,
    'support_email', info.support_email,
    'support_website', info.support_website,
    'support_hours_text', info.support_hours_text,
    'support_days_text', info.support_days_text,
    'support_response_time_text', info.support_response_time_text,
    'about_short', info.about_short,
    'about_financial', info.about_financial,
    'about_business', info.about_business,
    'vision_text', info.vision_text,
    'owner_name', info.owner_name,
    'country', info.country,
    'governorate', info.governorate,
    'city', info.city,
    'launch_year', info.launch_year,
    'facebook_url', info.facebook_url,
    'instagram_url', info.instagram_url,
    'x_url', info.x_url,
    'telegram_url', info.telegram_url,
    'whatsapp_channel_url', info.whatsapp_channel_url
  )
  from public.app_public_information info
  where info.singleton = true;
$function$;

create or replace function public.get_public_business_profile(p_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_slug text := nullif(trim(coalesce(p_slug,'')), '');
  v_business jsonb;
  v_sections jsonb;
  v_catalog jsonb;
begin
  if v_slug is null or length(v_slug) > 100 or v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
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

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', ci.id,
    'business_id', ci.business_id,
    'item_type', ci.item_type,
    'title', ci.title,
    'description', ci.description,
    'price', ci.price,
    'currency', ci.currency,
    'image_paths', coalesce(ci.image_paths, '[]'::jsonb),
    'features', coalesce(ci.features, '[]'::jsonb),
    'display_order', ci.display_order,
    'is_featured', ci.is_featured,
    'availability_status', ci.availability_status,
    'contact_action', ci.contact_action
  ) order by ci.is_featured desc, ci.display_order, ci.created_at desc), '[]'::jsonb)
  into v_catalog
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

-- Explicit public RPC allowlist. Never rely on the implicit PUBLIC execute grant.
do $block$
declare
  v_signature regprocedure;
begin
  foreach v_signature in array array[
    'public.get_app_public_information()'::regprocedure,
    'public.get_public_business_directory(text,uuid,text,integer,integer)'::regprocedure,
    'public.get_public_business_profile(text)'::regprocedure,
    'public.get_public_businesses(text,uuid,text,text,integer,integer)'::regprocedure,
    'public.get_public_delivery_providers(text,text,integer)'::regprocedure,
    'public.get_public_landing_information()'::regprocedure,
    'public.get_public_sanad_faq(text,text)'::regprocedure
  ]
  loop
    execute format('revoke execute on function %s from public', v_signature);
    execute format('grant execute on function %s to anon, authenticated, service_role', v_signature);
  end loop;
end
$block$;

comment on function public.get_app_public_information() is
  'Intentional public read API with an explicit output contract; internal columns are never serialized wholesale.';
comment on function public.get_public_business_profile(text) is
  'Intentional public business profile API. Catalog output excludes creator identifiers, metadata, and internal status fields.';

commit;

begin;

create or replace function public.get_public_business_profile(p_slug text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slug text := nullif(trim(coalesce(p_slug, '')), '');
  v_business jsonb;
  v_public_sections jsonb;
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
    'profile_image_path', bp.profile_image_path,
    'logo_path', bp.logo_path,
    'gallery_paths', coalesce(bp.gallery_paths, '[]'::jsonb),
    'working_hours', coalesce(bp.working_hours, '{}'::jsonb),
    'contact_links', coalesce(bp.contact_links, '{}'::jsonb),
    'public_status', bp.public_status,
    'verification_status', bp.verification_status,
    'created_at', bp.created_at,
    'updated_at', bp.updated_at
  ),
  jsonb_build_object(
    'services', coalesce(bp.profile_sections->'services', '[]'::jsonb),
    'financial_accounts', coalesce(bp.profile_sections->'financial_accounts', '[]'::jsonb),
    'reviews', coalesce(bp.profile_sections->'reviews', '[]'::jsonb)
  )
  into v_business, v_public_sections
  from public.business_profiles bp
  left join public.business_categories bc on bc.id = bp.category_id
  where bp.slug = v_slug
    and bp.public_status = 'published';

  if v_business is null then
    raise exception 'business_not_found_or_not_published';
  end if;

  return v_business || jsonb_build_object(
    'profile_sections', v_public_sections,
    'catalog_items', '[]'::jsonb
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
    'business', jsonb_build_object(
      'id', bp.id,
      'name', bp.name,
      'slug', bp.slug,
      'category_id', bp.category_id,
      'governorate', bp.governorate,
      'city', bp.city,
      'whatsapp', bp.whatsapp,
      'description', bp.description,
      'logo_path', bp.logo_path,
      'profile_image_path', bp.profile_image_path,
      'cover_image_path', bp.cover_image_path,
      'public_status', bp.public_status,
      'verification_status', bp.verification_status,
      'whatsapp_catalog_url', bp.whatsapp_catalog_url
    )
  ) order by tm.created_at desc), '[]'::jsonb)
  into v_team
  from public.business_team_members tm
  join public.business_profiles bp on bp.id = tm.business_id
  where tm.user_id = v_user_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'customer_id', bc.id,
    'status', bc.status,
    'source', bc.source,
    'business', jsonb_build_object(
      'id', bp.id,
      'name', bp.name,
      'slug', bp.slug,
      'category_id', bp.category_id,
      'governorate', bp.governorate,
      'city', bp.city,
      'whatsapp', bp.whatsapp,
      'description', bp.description,
      'logo_path', bp.logo_path,
      'profile_image_path', bp.profile_image_path,
      'cover_image_path', bp.cover_image_path,
      'gallery_paths', coalesce(bp.gallery_paths, '[]'::jsonb),
      'working_hours', coalesce(bp.working_hours, '{}'::jsonb),
      'contact_links', coalesce(bp.contact_links, '{}'::jsonb),
      'public_status', bp.public_status,
      'verification_status', bp.verification_status,
      'whatsapp_catalog_url', bp.whatsapp_catalog_url,
      'profile_sections', jsonb_build_object(
        'services', coalesce(bp.profile_sections->'services', '[]'::jsonb),
        'financial_accounts', coalesce(bp.profile_sections->'financial_accounts', '[]'::jsonb),
        'reviews', coalesce(bp.profile_sections->'reviews', '[]'::jsonb)
      )
    )
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

revoke execute on function public.get_public_business_profile(text) from public;
grant execute on function public.get_public_business_profile(text) to anon, authenticated, service_role;
revoke execute on function public.get_user_business_contexts() from public, anon;
grant execute on function public.get_user_business_contexts() to authenticated, service_role;

notify pgrst, 'reload schema';
commit;;

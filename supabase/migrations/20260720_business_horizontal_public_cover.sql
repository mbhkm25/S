alter table public.business_profiles
  add column if not exists horizontal_cover_image_path text;

comment on column public.business_profiles.horizontal_cover_image_path is
  'Horizontal cover displayed at the top edge of the public identity card.';

drop function if exists public.set_business_profile_media(uuid,text,text,jsonb,boolean);

create function public.set_business_profile_media(
  p_business_id uuid,
  p_cover_image_path text default null,
  p_horizontal_cover_image_path text default null,
  p_profile_image_path text default null,
  p_gallery_paths jsonb default null,
  p_resubmit_review boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_business public.business_profiles%rowtype;
begin
  if v_user_id is null then raise exception 'not_authenticated'; end if;
  if not exists (
    select 1 from public.business_profiles
    where id=p_business_id and owner_user_id=v_user_id
  ) then raise exception 'business_owner_required'; end if;

  if p_cover_image_path is not null and trim(p_cover_image_path) <> '' then
    perform private.assert_business_media_path(p_business_id,p_cover_image_path,array['cover'],true);
  end if;
  if p_horizontal_cover_image_path is not null and trim(p_horizontal_cover_image_path) <> '' then
    perform private.assert_business_media_path(p_business_id,p_horizontal_cover_image_path,array['cover'],true);
  end if;
  if p_profile_image_path is not null and trim(p_profile_image_path) <> '' then
    perform private.assert_business_media_path(p_business_id,p_profile_image_path,array['profile'],true);
  end if;

  update public.business_profiles
  set cover_image_path = case when p_cover_image_path is not null then nullif(trim(p_cover_image_path),'') else cover_image_path end,
      horizontal_cover_image_path = case when p_horizontal_cover_image_path is not null then nullif(trim(p_horizontal_cover_image_path),'') else horizontal_cover_image_path end,
      profile_image_path = case when p_profile_image_path is not null then nullif(trim(p_profile_image_path),'') else profile_image_path end,
      gallery_paths = case when p_gallery_paths is not null then p_gallery_paths else gallery_paths end,
      public_status = case when p_resubmit_review then 'pending_review' else public_status end,
      verification_status = case when p_resubmit_review then 'pending_review' else verification_status end,
      submitted_for_review_at = case when p_resubmit_review then now() else submitted_for_review_at end,
      updated_at=now()
  where id=p_business_id
  returning * into v_business;

  return jsonb_build_object('ok',true,'business',to_jsonb(v_business));
end;
$function$;

revoke all on function public.set_business_profile_media(uuid,text,text,text,jsonb,boolean) from public, anon;
grant execute on function public.set_business_profile_media(uuid,text,text,text,jsonb,boolean) to authenticated, service_role;

create or replace function public.get_public_business_profile(p_slug text)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_slug text:=nullif(trim(coalesce(p_slug,'')),'');
  v_business jsonb;
  v_sections jsonb;
  v_catalog jsonb;
begin
  if v_slug is null or length(v_slug)>100 then raise exception 'invalid_business_slug'; end if;
  select jsonb_build_object(
    'id',bp.id,'name',bp.name,'slug',bp.slug,'display_tagline',bp.display_tagline,
    'description',bp.description,'category_id',bp.category_id,'category_name',bc.name_ar,
    'governorate',bp.governorate,'city',bp.city,'whatsapp',bp.whatsapp,
    'whatsapp_catalog_url',bp.whatsapp_catalog_url,'address_text',bp.address_text,
    'latitude',bp.latitude,'longitude',bp.longitude,'cover_image_path',bp.cover_image_path,
    'horizontal_cover_image_path',bp.horizontal_cover_image_path,
    'profile_image_path',bp.profile_image_path,'logo_path',bp.logo_path,
    'gallery_paths',coalesce(bp.gallery_paths,'[]'::jsonb),'working_hours',coalesce(bp.working_hours,'{}'::jsonb),
    'contact_links',coalesce(bp.contact_links,'{}'::jsonb),'public_status',bp.public_status,
    'verification_status',bp.verification_status,'created_at',bp.created_at,'updated_at',bp.updated_at
  ), jsonb_build_object(
    'financial_accounts',coalesce(bp.profile_sections->'financial_accounts','[]'::jsonb),
    'reviews',coalesce(bp.profile_sections->'reviews','[]'::jsonb)
  ) into v_business,v_sections
  from public.business_profiles bp
  left join public.business_categories bc on bc.id=bp.category_id
  where bp.slug=v_slug and bp.public_status='published';

  if v_business is null then raise exception 'business_not_found_or_not_published'; end if;

  select coalesce(jsonb_agg(to_jsonb(ci) order by ci.is_featured desc,ci.display_order,ci.created_at desc),'[]'::jsonb)
  into v_catalog
  from (
    select * from public.business_catalog_items
    where business_id=(v_business->>'id')::uuid and status='active'
    order by is_featured desc,display_order,created_at desc limit 10
  ) ci;

  return v_business||jsonb_build_object('profile_sections',v_sections,'catalog_items',v_catalog);
end;
$function$;

revoke all on function public.get_public_business_profile(text) from public;
grant execute on function public.get_public_business_profile(text) to anon, authenticated, service_role;

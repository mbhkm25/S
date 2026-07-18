alter table public.business_catalog_items
  add column if not exists is_featured boolean not null default false,
  add column if not exists availability_status text not null default 'available',
  add column if not exists contact_action text not null default 'whatsapp';

alter table public.business_catalog_items
  drop constraint if exists business_catalog_items_item_type_check,
  add constraint business_catalog_items_item_type_check
    check (item_type = any (array['product'::text,'service'::text,'digital'::text,'offer'::text,'subscription'::text,'other'::text]));

alter table public.business_catalog_items
  drop constraint if exists business_catalog_items_availability_status_check,
  add constraint business_catalog_items_availability_status_check
    check (availability_status = any (array['available'::text,'on_request'::text,'unavailable'::text]));

alter table public.business_catalog_items
  drop constraint if exists business_catalog_items_contact_action_check,
  add constraint business_catalog_items_contact_action_check
    check (contact_action = any (array['whatsapp'::text,'call'::text,'none'::text]));

create index if not exists business_catalog_items_public_order_idx
  on public.business_catalog_items (business_id, status, is_featured desc, display_order asc, created_at desc);

comment on table public.business_catalog_items is
  'Public SANAD business catalog. The first release exposes up to 10 active items per published business and supports featured ordering.';

comment on column public.business_catalog_items.is_featured is
  'Featured items appear first in the public business profile.';

comment on column public.business_catalog_items.availability_status is
  'Operational availability: available, on_request, or unavailable.';

drop function if exists public.upsert_business_catalog_item(uuid, uuid, text, text, text, numeric, text, jsonb, jsonb, text, integer);

create function public.upsert_business_catalog_item(
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
  p_display_order integer default 100,
  p_is_featured boolean default false,
  p_availability_status text default 'available',
  p_contact_action text default 'whatsapp'
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_item public.business_catalog_items%rowtype;
  v_active_count integer;
begin
  if v_user_id is null then raise exception 'not_authenticated'; end if;
  if not exists (
    select 1 from public.business_profiles
    where id = p_business_id and owner_user_id = v_user_id
  ) then raise exception 'business_owner_required'; end if;

  if p_item_type not in ('product','service','digital','offer','subscription','other') then
    raise exception 'invalid_catalog_item_type';
  end if;
  if p_status not in ('draft','active','hidden','archived') then raise exception 'invalid_catalog_item_status'; end if;
  if p_currency is not null and p_currency not in ('YER','SAR','USD') then raise exception 'invalid_currency'; end if;
  if p_availability_status not in ('available','on_request','unavailable') then raise exception 'invalid_availability_status'; end if;
  if p_contact_action not in ('whatsapp','call','none') then raise exception 'invalid_contact_action'; end if;
  if p_title is null or length(trim(p_title)) < 2 then raise exception 'catalog_title_required'; end if;

  if p_status = 'active' then
    select count(*) into v_active_count
    from public.business_catalog_items
    where business_id = p_business_id
      and status = 'active'
      and (p_item_id is null or id <> p_item_id);
    if v_active_count >= 10 then raise exception 'active_catalog_limit_reached'; end if;
  end if;

  if p_item_id is null then
    insert into public.business_catalog_items (
      business_id, created_by_user_id, item_type, title, description,
      price, currency, image_paths, features, status, display_order,
      is_featured, availability_status, contact_action
    ) values (
      p_business_id, v_user_id, p_item_type, trim(p_title),
      nullif(trim(coalesce(p_description,'')),''), p_price, p_currency,
      coalesce(p_image_paths,'[]'::jsonb), coalesce(p_features,'[]'::jsonb),
      p_status, coalesce(p_display_order,100), coalesce(p_is_featured,false),
      p_availability_status, p_contact_action
    ) returning * into v_item;
  else
    update public.business_catalog_items set
      item_type = p_item_type,
      title = trim(p_title),
      description = nullif(trim(coalesce(p_description,'')),''),
      price = p_price,
      currency = p_currency,
      image_paths = coalesce(p_image_paths,image_paths),
      features = coalesce(p_features,features),
      status = p_status,
      display_order = coalesce(p_display_order,display_order),
      is_featured = coalesce(p_is_featured,false),
      availability_status = p_availability_status,
      contact_action = p_contact_action,
      updated_at = now()
    where id = p_item_id and business_id = p_business_id
    returning * into v_item;
    if not found then raise exception 'catalog_item_not_found'; end if;
  end if;

  return jsonb_build_object('ok',true,'item',to_jsonb(v_item));
end;
$$;

revoke all on function public.upsert_business_catalog_item(uuid, uuid, text, text, text, numeric, text, jsonb, jsonb, text, integer, boolean, text, text) from public;
grant execute on function public.upsert_business_catalog_item(uuid, uuid, text, text, text, numeric, text, jsonb, jsonb, text, integer, boolean, text, text) to authenticated;

create or replace function public.get_business_catalog(
  p_business_id uuid,
  p_include_hidden boolean default false
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_is_owner boolean;
  v_is_public boolean;
  v_items jsonb;
begin
  select owner_user_id = v_user_id, public_status = 'published'
  into v_is_owner, v_is_public
  from public.business_profiles where id = p_business_id;

  if not coalesce(v_is_owner,false) and not coalesce(v_is_public,false) then
    raise exception 'business_not_found_or_not_published';
  end if;

  select coalesce(jsonb_agg(to_jsonb(ci) order by ci.is_featured desc, ci.display_order asc, ci.created_at desc),'[]'::jsonb)
  into v_items
  from public.business_catalog_items ci
  where ci.business_id = p_business_id
    and ((coalesce(v_is_owner,false) and p_include_hidden) or ci.status = 'active');

  return jsonb_build_object('items',v_items);
end;
$$;

create or replace function public.get_public_business_profile(p_slug text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_slug text := nullif(trim(coalesce(p_slug,'')),'');
  v_business jsonb;
  v_public_sections jsonb;
  v_catalog_items jsonb;
begin
  if v_slug is null or length(v_slug) > 100 then raise exception 'invalid_business_slug'; end if;

  select jsonb_build_object(
    'id',bp.id,
    'name',bp.name,
    'slug',bp.slug,
    'display_tagline',bp.display_tagline,
    'description',bp.description,
    'category_id',bp.category_id,
    'category_name',bc.name_ar,
    'governorate',bp.governorate,
    'city',bp.city,
    'whatsapp',bp.whatsapp,
    'whatsapp_catalog_url',bp.whatsapp_catalog_url,
    'address_text',bp.address_text,
    'latitude',bp.latitude,
    'longitude',bp.longitude,
    'cover_image_path',bp.cover_image_path,
    'profile_image_path',bp.profile_image_path,
    'logo_path',bp.logo_path,
    'gallery_paths',coalesce(bp.gallery_paths,'[]'::jsonb),
    'working_hours',coalesce(bp.working_hours,'{}'::jsonb),
    'contact_links',coalesce(bp.contact_links,'{}'::jsonb),
    'public_status',bp.public_status,
    'verification_status',bp.verification_status,
    'created_at',bp.created_at,
    'updated_at',bp.updated_at
  ), jsonb_build_object(
    'services',coalesce(bp.profile_sections->'services','[]'::jsonb),
    'reviews',coalesce(bp.profile_sections->'reviews','[]'::jsonb)
  )
  into v_business,v_public_sections
  from public.business_profiles bp
  left join public.business_categories bc on bc.id = bp.category_id
  where bp.slug = v_slug and bp.public_status = 'published';

  if v_business is null then raise exception 'business_not_found_or_not_published'; end if;

  select coalesce(jsonb_agg(to_jsonb(ci) order by ci.is_featured desc, ci.display_order asc, ci.created_at desc),'[]'::jsonb)
  into v_catalog_items
  from (
    select * from public.business_catalog_items
    where business_id = (v_business->>'id')::uuid
      and status = 'active'
    order by is_featured desc, display_order asc, created_at desc
    limit 10
  ) ci;

  return v_business || jsonb_build_object(
    'profile_sections',v_public_sections,
    'catalog_items',v_catalog_items
  );
end;
$$;

revoke all on function public.get_public_business_profile(text) from public;
grant execute on function public.get_public_business_profile(text) to anon, authenticated;

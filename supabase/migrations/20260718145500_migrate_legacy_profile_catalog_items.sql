-- Migrate legacy products and services stored inside business_profiles.profile_sections
-- into the canonical business_catalog_items table. This migration is idempotent.

with legacy_products as (
  select
    bp.id as business_id,
    bp.owner_user_id as created_by_user_id,
    product as item,
    ordinality as display_order
  from public.business_profiles bp
  cross join lateral jsonb_array_elements(coalesce(bp.profile_sections->'products', '[]'::jsonb))
    with ordinality as p(product, ordinality)
), inserted_products as (
  insert into public.business_catalog_items (
    business_id, created_by_user_id, item_type, title, description,
    price, currency, image_paths, features, status, display_order,
    is_featured, availability_status, contact_action
  )
  select
    lp.business_id,
    lp.created_by_user_id,
    'product',
    trim(coalesce(lp.item->>'name', 'عنصر بدون اسم')),
    nullif(trim(coalesce(lp.item->>'description', '')), ''),
    null,
    null,
    case
      when nullif(trim(coalesce(lp.item->>'image_path', '')), '') is null then '[]'::jsonb
      else jsonb_build_array(lp.item->>'image_path')
    end,
    jsonb_build_array(jsonb_build_object(
      'legacy_id', lp.item->>'id',
      'legacy_price_text', lp.item->>'price',
      'legacy_whatsapp_url', lp.item->>'whatsapp_url'
    )),
    case when coalesce((lp.item->>'active')::boolean, true) then 'active' else 'hidden' end,
    lp.display_order::integer,
    lp.display_order <= 6,
    'available',
    'whatsapp'
  from legacy_products lp
  where nullif(trim(coalesce(lp.item->>'name', '')), '') is not null
    and not exists (
      select 1
      from public.business_catalog_items ci
      where ci.business_id = lp.business_id
        and (
          ci.features @> jsonb_build_array(jsonb_build_object('legacy_id', lp.item->>'id'))
          or (
            ci.title = trim(lp.item->>'name')
            and coalesce(ci.image_paths->>0, '') = coalesce(lp.item->>'image_path', '')
          )
        )
    )
  returning id
), legacy_services as (
  select
    bp.id as business_id,
    bp.owner_user_id as created_by_user_id,
    service as item,
    ordinality as display_order
  from public.business_profiles bp
  cross join lateral jsonb_array_elements(coalesce(bp.profile_sections->'services', '[]'::jsonb))
    with ordinality as s(service, ordinality)
)
insert into public.business_catalog_items (
  business_id, created_by_user_id, item_type, title, description,
  price, currency, image_paths, features, status, display_order,
  is_featured, availability_status, contact_action
)
select
  ls.business_id,
  ls.created_by_user_id,
  'service',
  trim(coalesce(ls.item->>'name', 'خدمة بدون اسم')),
  nullif(trim(coalesce(ls.item->>'description', '')), ''),
  null,
  null,
  case
    when nullif(trim(coalesce(ls.item->>'image_path', '')), '') is null then '[]'::jsonb
    else jsonb_build_array(ls.item->>'image_path')
  end,
  jsonb_build_array(jsonb_build_object(
    'legacy_id', ls.item->>'id',
    'legacy_price_text', ls.item->>'price'
  )),
  case when coalesce((ls.item->>'active')::boolean, true) then 'active' else 'hidden' end,
  (100 + ls.display_order)::integer,
  false,
  'available',
  'whatsapp'
from legacy_services ls
where nullif(trim(coalesce(ls.item->>'name', '')), '') is not null
  and not exists (
    select 1
    from public.business_catalog_items ci
    where ci.business_id = ls.business_id
      and (
        ci.features @> jsonb_build_array(jsonb_build_object('legacy_id', ls.item->>'id'))
        or (
          ci.title = trim(ls.item->>'name')
          and coalesce(ci.image_paths->>0, '') = coalesce(ls.item->>'image_path', '')
        )
      )
  );

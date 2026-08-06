alter table public.business_media_assets
  drop constraint if exists business_media_assets_asset_type_check;

alter table public.business_media_assets
  add constraint business_media_assets_asset_type_check
  check (asset_type in ('cover','profile','gallery','catalog','products','document'));

insert into public.business_media_assets (
  business_id,
  owner_user_id,
  asset_type,
  storage_bucket,
  storage_path,
  mime_type,
  file_name,
  file_size,
  alt_text,
  display_order,
  status,
  metadata
)
select
  bp.id,
  bp.owner_user_id,
  coalesce(public.business_media_path_asset_type(paths.path),'catalog'),
  'business-media',
  paths.path,
  lower(coalesce(o.metadata->>'mimetype','image/jpeg')),
  regexp_replace(paths.path, '^.*/', ''),
  nullif(o.metadata->>'size','')::bigint,
  ci.title,
  paths.ordinality::integer,
  'active',
  jsonb_build_object('backfilled_from','business_catalog_items','catalog_item_id',ci.id)
from public.business_catalog_items ci
join public.business_profiles bp on bp.id=ci.business_id
cross join lateral jsonb_array_elements_text(coalesce(ci.image_paths,'[]'::jsonb)) with ordinality as paths(path, ordinality)
join storage.objects o on o.bucket_id='business-media' and o.name=paths.path
where public.business_media_path_business_id(paths.path)=bp.id
  and public.business_media_path_asset_type(paths.path) in ('catalog','products')
on conflict (business_id, storage_bucket, storage_path) do update set
  asset_type=excluded.asset_type,
  mime_type=excluded.mime_type,
  file_name=excluded.file_name,
  file_size=excluded.file_size,
  alt_text=coalesce(public.business_media_assets.alt_text,excluded.alt_text),
  display_order=excluded.display_order,
  status='active',
  metadata=public.business_media_assets.metadata || excluded.metadata,
  updated_at=now();

-- SANAD Business Media Storage Foundation
-- Creates business-media bucket, storage policies, and media helper RPCs.

create extension if not exists pgcrypto;

-- 1) Private bucket for business media. Access stays inside authenticated SANAD app.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'business-media',
  'business-media',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do update set
  public = false,
  file_size_limit = 10485760,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']::text[];

-- 2) Storage policies for bucket path convention:
--    <business_id>/<asset_type>/<filename>
--    asset_type: cover | profile | gallery | catalog

drop policy if exists business_media_select_authenticated_context on storage.objects;
create policy business_media_select_authenticated_context
on storage.objects
for select
to authenticated
using (
  bucket_id = 'business-media'
  and coalesce(array_length(storage.foldername(name), 1), 0) >= 2
  and exists (
    select 1
    from public.business_profiles bp
    where bp.id = ((storage.foldername(name))[1])::uuid
      and (
        bp.public_status = 'published'
        or bp.owner_user_id = auth.uid()
        or exists (
          select 1
          from public.business_team_members tm
          where tm.business_id = bp.id
            and tm.user_id = auth.uid()
            and tm.status = 'active'
        )
        or exists (
          select 1
          from public.business_customers bc
          where bc.business_id = bp.id
            and bc.user_id = auth.uid()
            and bc.status = 'active'
        )
      )
  )
);

drop policy if exists business_media_insert_owner on storage.objects;
create policy business_media_insert_owner
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'business-media'
  and coalesce(array_length(storage.foldername(name), 1), 0) >= 2
  and (storage.foldername(name))[2] in ('cover', 'profile', 'gallery', 'catalog')
  and exists (
    select 1
    from public.business_profiles bp
    where bp.id = ((storage.foldername(name))[1])::uuid
      and bp.owner_user_id = auth.uid()
  )
);

drop policy if exists business_media_update_owner on storage.objects;
create policy business_media_update_owner
on storage.objects
for update
to authenticated
using (
  bucket_id = 'business-media'
  and coalesce(array_length(storage.foldername(name), 1), 0) >= 2
  and exists (
    select 1
    from public.business_profiles bp
    where bp.id = ((storage.foldername(name))[1])::uuid
      and bp.owner_user_id = auth.uid()
  )
)
with check (
  bucket_id = 'business-media'
  and coalesce(array_length(storage.foldername(name), 1), 0) >= 2
  and (storage.foldername(name))[2] in ('cover', 'profile', 'gallery', 'catalog')
  and exists (
    select 1
    from public.business_profiles bp
    where bp.id = ((storage.foldername(name))[1])::uuid
      and bp.owner_user_id = auth.uid()
  )
);

drop policy if exists business_media_delete_owner on storage.objects;
create policy business_media_delete_owner
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'business-media'
  and coalesce(array_length(storage.foldername(name), 1), 0) >= 2
  and exists (
    select 1
    from public.business_profiles bp
    where bp.id = ((storage.foldername(name))[1])::uuid
      and bp.owner_user_id = auth.uid()
  )
);

-- 3) Normalize business media asset helpers.

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
begin
  if v_user_id is null then
    raise exception 'not_authenticated';
  end if;

  if p_asset_type not in ('cover', 'profile', 'gallery', 'catalog') then
    raise exception 'invalid_asset_type';
  end if;

  if p_storage_path is null or trim(p_storage_path) = '' then
    raise exception 'storage_path_required';
  end if;

  if not exists (
    select 1 from public.business_profiles
    where id = p_business_id and owner_user_id = v_user_id
  ) then
    raise exception 'business_owner_required';
  end if;

  if split_part(p_storage_path, '/', 1) <> p_business_id::text then
    raise exception 'storage_path_must_start_with_business_id';
  end if;

  if split_part(p_storage_path, '/', 2) <> p_asset_type then
    raise exception 'storage_path_asset_type_mismatch';
  end if;

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
    status
  ) values (
    p_business_id,
    v_user_id,
    p_asset_type,
    'business-media',
    p_storage_path,
    p_mime_type,
    p_file_name,
    p_file_size,
    p_alt_text,
    coalesce(p_display_order, 100),
    'active'
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

  if p_cover_image_path is not null and split_part(p_cover_image_path, '/', 1) <> p_business_id::text then
    raise exception 'cover_path_must_start_with_business_id';
  end if;

  if p_profile_image_path is not null and split_part(p_profile_image_path, '/', 1) <> p_business_id::text then
    raise exception 'profile_path_must_start_with_business_id';
  end if;

  update public.business_profiles
  set cover_image_path = coalesce(nullif(trim(coalesce(p_cover_image_path, '')), ''), cover_image_path),
      profile_image_path = coalesce(nullif(trim(coalesce(p_profile_image_path, '')), ''), profile_image_path),
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

-- 4) Remove GPS dependency from update RPC behavior while keeping DB fields for future.
--    The UI should stop asking for latitude/longitude. RPC remains compatible.

-- 5) Extend business action grants.
grant execute on function public.register_business_media_asset(uuid, text, text, text, text, bigint, text, integer) to authenticated;
grant execute on function public.set_business_profile_media(uuid, text, text, jsonb, boolean) to authenticated;
;

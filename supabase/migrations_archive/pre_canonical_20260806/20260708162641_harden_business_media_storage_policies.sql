create or replace function public.safe_uuid(p_value text)
returns uuid
language plpgsql
immutable
as $$
begin
  if p_value is null then
    return null;
  end if;

  if p_value ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return p_value::uuid;
  end if;

  return null;
end;
$$;

create or replace function public.business_media_path_business_id(p_object_name text)
returns uuid
language sql
immutable
as $$
  select case
    -- Correct path: <business_id>/<asset_type>/<filename>
    when coalesce(array_length(storage.foldername(p_object_name), 1), 0) >= 2
      and public.safe_uuid((storage.foldername(p_object_name))[1]) is not null
    then public.safe_uuid((storage.foldername(p_object_name))[1])

    -- Defensive legacy/wrong path: business-media/<business_id>/<asset_type>/<filename>
    when coalesce(array_length(storage.foldername(p_object_name), 1), 0) >= 3
      and (storage.foldername(p_object_name))[1] = 'business-media'
      and public.safe_uuid((storage.foldername(p_object_name))[2]) is not null
    then public.safe_uuid((storage.foldername(p_object_name))[2])

    else null
  end;
$$;

create or replace function public.business_media_path_asset_type(p_object_name text)
returns text
language sql
immutable
as $$
  select case
    -- Correct path: <business_id>/<asset_type>/<filename>
    when coalesce(array_length(storage.foldername(p_object_name), 1), 0) >= 2
      and public.safe_uuid((storage.foldername(p_object_name))[1]) is not null
    then (storage.foldername(p_object_name))[2]

    -- Defensive legacy/wrong path: business-media/<business_id>/<asset_type>/<filename>
    when coalesce(array_length(storage.foldername(p_object_name), 1), 0) >= 3
      and (storage.foldername(p_object_name))[1] = 'business-media'
      and public.safe_uuid((storage.foldername(p_object_name))[2]) is not null
    then (storage.foldername(p_object_name))[3]

    else null
  end;
$$;

drop policy if exists business_media_insert_owner on storage.objects;
drop policy if exists business_media_select_authenticated_context on storage.objects;
drop policy if exists business_media_update_owner on storage.objects;
drop policy if exists business_media_delete_owner on storage.objects;

create policy business_media_insert_owner
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'business-media'
  and public.business_media_path_business_id(name) is not null
  and public.business_media_path_asset_type(name) in ('cover', 'profile', 'gallery')
  and exists (
    select 1
    from public.business_profiles bp
    where bp.id = public.business_media_path_business_id(name)
      and bp.owner_user_id = auth.uid()
  )
);

create policy business_media_select_authenticated_context
on storage.objects
for select
to authenticated
using (
  bucket_id = 'business-media'
  and public.business_media_path_business_id(name) is not null
  and public.business_media_path_asset_type(name) in ('cover', 'profile', 'gallery')
  and exists (
    select 1
    from public.business_profiles bp
    where bp.id = public.business_media_path_business_id(name)
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

create policy business_media_update_owner
on storage.objects
for update
to authenticated
using (
  bucket_id = 'business-media'
  and public.business_media_path_business_id(name) is not null
  and public.business_media_path_asset_type(name) in ('cover', 'profile', 'gallery')
  and exists (
    select 1
    from public.business_profiles bp
    where bp.id = public.business_media_path_business_id(name)
      and bp.owner_user_id = auth.uid()
  )
)
with check (
  bucket_id = 'business-media'
  and public.business_media_path_business_id(name) is not null
  and public.business_media_path_asset_type(name) in ('cover', 'profile', 'gallery')
  and exists (
    select 1
    from public.business_profiles bp
    where bp.id = public.business_media_path_business_id(name)
      and bp.owner_user_id = auth.uid()
  )
);

create policy business_media_delete_owner
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'business-media'
  and public.business_media_path_business_id(name) is not null
  and public.business_media_path_asset_type(name) in ('cover', 'profile', 'gallery')
  and exists (
    select 1
    from public.business_profiles bp
    where bp.id = public.business_media_path_business_id(name)
      and bp.owner_user_id = auth.uid()
  )
);

-- Ensure bucket remains constrained to the MVP media types only.
update storage.buckets
set
  public = false,
  file_size_limit = 10485760,
  allowed_mime_types = array['image/jpeg','image/png','image/webp']
where id = 'business-media';;

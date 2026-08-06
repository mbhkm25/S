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
  and coalesce(array_length(storage.foldername(name), 1), 0) >= 2
  and (storage.foldername(name))[2] in ('cover', 'profile', 'gallery', 'catalog')
  and exists (
    select 1
    from public.business_profiles bp
    where bp.id = ((storage.foldername(name))[1])::uuid
      and bp.owner_user_id = auth.uid()
  )
);

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
);;

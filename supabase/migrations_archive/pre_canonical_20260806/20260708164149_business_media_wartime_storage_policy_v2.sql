drop policy if exists business_media_insert_owner on storage.objects;
drop policy if exists business_media_select_authenticated_context on storage.objects;
drop policy if exists business_media_update_owner on storage.objects;
drop policy if exists business_media_delete_owner on storage.objects;
drop policy if exists business_media_authenticated_insert on storage.objects;
drop policy if exists business_media_authenticated_select on storage.objects;
drop policy if exists business_media_authenticated_update on storage.objects;
drop policy if exists business_media_authenticated_delete on storage.objects;

update storage.buckets
set
  public = false,
  file_size_limit = 10485760,
  allowed_mime_types = array['image/jpeg','image/png','image/webp']
where id = 'business-media';

create policy business_media_authenticated_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'business-media'
);

create policy business_media_authenticated_select
on storage.objects
for select
to authenticated
using (
  bucket_id = 'business-media'
);

create policy business_media_authenticated_update
on storage.objects
for update
to authenticated
using (
  bucket_id = 'business-media'
)
with check (
  bucket_id = 'business-media'
);

create policy business_media_authenticated_delete
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'business-media'
);;

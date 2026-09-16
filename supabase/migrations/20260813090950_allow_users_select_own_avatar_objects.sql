drop policy if exists "Users can read their own avatar object" on storage.objects;
create policy "Users can read their own avatar object"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'user-avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- Supabase Storage upload may need SELECT access to return metadata for a newly
-- inserted object. Keep avatar metadata scoped to the authenticated user's own
-- folder while the bucket itself remains public for image delivery.

drop policy if exists "Users can read their own avatar object" on storage.objects;
create policy "Users can read their own avatar object"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'user-avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

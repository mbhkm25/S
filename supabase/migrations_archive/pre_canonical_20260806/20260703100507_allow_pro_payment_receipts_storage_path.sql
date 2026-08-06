begin;

drop policy if exists "storage_insert_pro_payment_receipts" on storage.objects;
create policy "storage_insert_pro_payment_receipts"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'operation-files'
  and (storage.foldername(name))[1] = 'pro-payment-receipts'
  and (storage.foldername(name))[2] = auth.uid()::text
);

drop policy if exists "storage_select_pro_payment_receipts" on storage.objects;
create policy "storage_select_pro_payment_receipts"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'operation-files'
  and (storage.foldername(name))[1] = 'pro-payment-receipts'
  and (storage.foldername(name))[2] = auth.uid()::text
);

commit;;

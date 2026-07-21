create or replace function public.is_current_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select public.is_platform_admin(auth.uid());
$function$;

revoke all on function public.is_current_platform_admin() from public, anon;
grant execute on function public.is_current_platform_admin() to authenticated;

drop policy if exists platform_admin_select_pro_payment_receipts on storage.objects;

create policy platform_admin_select_pro_payment_receipts
on storage.objects
for select
to authenticated
using (
  bucket_id = 'operation-files'
  and (storage.foldername(name))[1] = 'pro-payment-receipts'
  and public.is_current_platform_admin()
);

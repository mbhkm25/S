begin;

revoke execute on function public.sanad_profiles_before_write() from public, anon, authenticated;
revoke execute on function public.sanad_user_financial_accounts_before_write() from public, anon, authenticated;
revoke execute on function public.sanad_payment_requests_before_write() from public, anon, authenticated;
revoke execute on function public.set_updated_at() from public, anon, authenticated;
revoke execute on function public.normalize_operation_local_datetime_to_aden() from public, anon, authenticated;
revoke execute on function public.sync_operation_received_at() from public, anon, authenticated;

grant execute on function public.sanad_profiles_before_write() to service_role;
grant execute on function public.sanad_user_financial_accounts_before_write() to service_role;
grant execute on function public.sanad_payment_requests_before_write() to service_role;
grant execute on function public.set_updated_at() to service_role;
grant execute on function public.normalize_operation_local_datetime_to_aden() to service_role;
grant execute on function public.sync_operation_received_at() to service_role;

comment on function public.set_updated_at() is
  'Trigger-only timestamp helper. Direct Data API execution is intentionally denied.';

commit;

-- Production security hardening: reduce unnecessary EXECUTE surface on mutating RPCs.
-- This migration does not alter function bodies or application data.

revoke execute on function public.admin_set_pro_payment_transfer_reference(uuid, text, jsonb, numeric, text) from public;
revoke execute on function public.admin_set_pro_payment_transfer_reference(uuid, text, jsonb, numeric, text) from anon;
revoke execute on function public.admin_set_pro_payment_transfer_reference(uuid, text, jsonb, numeric, text) from authenticated;
grant execute on function public.admin_set_pro_payment_transfer_reference(uuid, text, jsonb, numeric, text) to service_role;

revoke execute on function public.create_pro_payment_request(uuid, text, text, text, text, text, bigint, text) from public;
revoke execute on function public.create_pro_payment_request(uuid, text, text, text, text, text, bigint, text) from anon;
grant execute on function public.create_pro_payment_request(uuid, text, text, text, text, text, bigint, text) to authenticated;
grant execute on function public.create_pro_payment_request(uuid, text, text, text, text, text, bigint, text) to service_role;

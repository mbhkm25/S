revoke all on function public.log_operation_file_access_event(uuid, uuid, text, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.log_operation_file_access_event(uuid, uuid, text, text, text, jsonb)
  to service_role;

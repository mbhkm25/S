create or replace function public.log_operation_file_access_event(
  p_operation_id uuid,
  p_user_id uuid,
  p_purpose text,
  p_outcome text,
  p_error_code text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_id uuid;
begin
  insert into public.operation_file_access_events(
    operation_id,
    user_id,
    purpose,
    outcome,
    error_code,
    metadata
  ) values (
    p_operation_id,
    p_user_id,
    p_purpose,
    p_outcome,
    p_error_code,
    coalesce(p_metadata, '{}'::jsonb)
  ) returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.log_operation_file_access_event(uuid, uuid, text, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.log_operation_file_access_event(uuid, uuid, text, text, text, jsonb)
  to service_role;

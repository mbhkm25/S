begin;

alter table public.sanad_assistant_support_tickets enable row level security;
alter table public.sanad_assistant_tool_executions enable row level security;
alter table public.sanad_assistant_print_materials enable row level security;
alter table public.sanad_assistant_releases enable row level security;

revoke all on table public.sanad_assistant_support_tickets from public, anon, authenticated;
revoke all on table public.sanad_assistant_tool_executions from public, anon, authenticated;
revoke all on table public.sanad_assistant_print_materials from public, anon, authenticated;
revoke all on table public.sanad_assistant_releases from public, anon, authenticated;

grant select, insert, update, delete on table public.sanad_assistant_support_tickets to service_role;
grant select, insert, update, delete on table public.sanad_assistant_tool_executions to service_role;
grant select, insert, update, delete on table public.sanad_assistant_print_materials to service_role;
grant select, insert, update, delete on table public.sanad_assistant_releases to service_role;

revoke execute on function public.assistant_create_support_ticket(uuid, uuid, text, text, text, text, jsonb) from public, anon, authenticated;
revoke execute on function public.assistant_get_platform_metrics(uuid, text, timestamptz, timestamptz) from public, anon, authenticated;
revoke execute on function public.assistant_get_print_materials(uuid, text) from public, anon, authenticated;
revoke execute on function public.start_sanad_assistant_tool_execution(uuid, uuid, text, jsonb) from public, anon, authenticated;
revoke execute on function public.finish_sanad_assistant_tool_execution(bigint, text, jsonb, text, text, integer) from public, anon, authenticated;
revoke execute on function public.register_sanad_assistant_release(text, text, text, uuid, text, jsonb) from public, anon, authenticated;
revoke execute on function public.promote_sanad_assistant_release(text, text) from public, anon, authenticated;

grant execute on function public.assistant_create_support_ticket(uuid, uuid, text, text, text, text, jsonb) to service_role;
grant execute on function public.assistant_get_platform_metrics(uuid, text, timestamptz, timestamptz) to service_role;
grant execute on function public.assistant_get_print_materials(uuid, text) to service_role;
grant execute on function public.start_sanad_assistant_tool_execution(uuid, uuid, text, jsonb) to service_role;
grant execute on function public.finish_sanad_assistant_tool_execution(bigint, text, jsonb, text, text, integer) to service_role;
grant execute on function public.register_sanad_assistant_release(text, text, text, uuid, text, jsonb) to service_role;
grant execute on function public.promote_sanad_assistant_release(text, text) to service_role;

comment on table public.sanad_assistant_support_tickets is 'RPC-only assistant support workflow. Direct anon/authenticated access is denied.';
comment on table public.sanad_assistant_tool_executions is 'Service-only audit log for assistant tool executions. Direct client access is denied.';
comment on table public.sanad_assistant_print_materials is 'Service-managed catalog of assistant print materials. Client access must go through assistant RPCs.';
comment on table public.sanad_assistant_releases is 'Service-managed assistant release registry. Direct client access is denied.';

commit;

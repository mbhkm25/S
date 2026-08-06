-- SANAD assistant v15 deployment hardening
-- Production state was applied through Supabase before this migration was committed.
-- This file makes the security and performance changes reproducible.

begin;

-- Internal assistant RPCs must only be callable by service_role.
revoke all on function public.assistant_create_support_ticket(uuid, uuid, text, text, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.assistant_get_operation_status(uuid, text) from public, anon, authenticated;
revoke all on function public.assistant_get_print_materials(uuid, text) from public, anon, authenticated;
revoke all on function public.get_sanad_assistant_context_snapshot(uuid, uuid) from public, anon, authenticated;
revoke all on function public.select_sanad_assistant_media(uuid, text, text, text, text[], integer, boolean) from public, anon, authenticated;
revoke all on function public.register_sanad_assistant_media_delivery(uuid, uuid, uuid, text, text, text, text, text, text, integer, jsonb) from public, anon, authenticated;
revoke all on function public.evaluate_sanad_assistant_canary(text, integer) from public, anon, authenticated;
revoke all on function public.promote_sanad_assistant_release(text, text) from public, anon, authenticated;

grant execute on function public.assistant_create_support_ticket(uuid, uuid, text, text, text, text, jsonb) to service_role;
grant execute on function public.assistant_get_operation_status(uuid, text) to service_role;
grant execute on function public.assistant_get_print_materials(uuid, text) to service_role;
grant execute on function public.get_sanad_assistant_context_snapshot(uuid, uuid) to service_role;
grant execute on function public.select_sanad_assistant_media(uuid, text, text, text, text[], integer, boolean) to service_role;
grant execute on function public.register_sanad_assistant_media_delivery(uuid, uuid, uuid, text, text, text, text, text, text, integer, jsonb) to service_role;
grant execute on function public.evaluate_sanad_assistant_canary(text, integer) to service_role;
grant execute on function public.promote_sanad_assistant_release(text, text) to service_role;

-- Cover the assistant foreign keys used during queue processing and shadow evaluation.
create index if not exists sanad_assistant_conversations_linked_user_idx
  on public.sanad_assistant_conversations(linked_user_id);
create index if not exists sanad_assistant_messages_contact_idx
  on public.sanad_assistant_messages(contact_id);
create index if not exists sanad_assistant_messages_reply_to_idx
  on public.sanad_assistant_messages(reply_to_message_id);
create index if not exists sanad_assistant_media_deliveries_message_idx
  on public.sanad_assistant_media_deliveries(assistant_message_id);
create index if not exists sanad_assistant_eval_results_case_idx
  on public.sanad_assistant_eval_results(case_id);
create index if not exists sanad_assistant_releases_eval_run_idx
  on public.sanad_assistant_releases(eval_run_id);

-- Keep the intent-family helper deterministic and safe.
alter function public.sanad_assistant_intent_family(text) set search_path = '';

commit;

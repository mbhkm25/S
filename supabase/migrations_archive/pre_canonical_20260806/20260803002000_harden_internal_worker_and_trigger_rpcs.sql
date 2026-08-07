begin;

-- Trigger functions execute through their database triggers and must not be exposed as RPCs.
revoke execute on function public.notify_business_review_status_change() from public, anon, authenticated;
grant execute on function public.notify_business_review_status_change() to service_role;

-- Assistant queue functions are invoked by service workers or pg_cron, never by clients.
revoke execute on function public.claim_due_sanad_assistant_message() from public, anon, authenticated;
grant execute on function public.claim_due_sanad_assistant_message() to service_role;

revoke execute on function public.recover_stale_sanad_assistant_messages() from public, anon, authenticated;
grant execute on function public.recover_stale_sanad_assistant_messages() to service_role;

-- Runtime-token readers expose secrets and are strictly service-only.
revoke execute on function public.get_assistant_retry_dispatch_token() from public, anon, authenticated;
grant execute on function public.get_assistant_retry_dispatch_token() to service_role;

revoke execute on function public.get_whatsapp_onboarding_worker_token() from public, anon, authenticated;
grant execute on function public.get_whatsapp_onboarding_worker_token() to service_role;

-- Assistant state transitions and media health updates are worker operations.
revoke execute on function public.transition_sanad_assistant_conversation(uuid, text, text, text, text, text, integer, jsonb) from public, anon, authenticated;
grant execute on function public.transition_sanad_assistant_conversation(uuid, text, text, text, text, text, integer, jsonb) to service_role;

revoke execute on function public.expire_sanad_assistant_conversation_flow(uuid) from public, anon, authenticated;
grant execute on function public.expire_sanad_assistant_conversation_flow(uuid) to service_role;

revoke execute on function public.mark_sanad_assistant_media_health(uuid, text, integer, text) from public, anon, authenticated;
grant execute on function public.mark_sanad_assistant_media_health(uuid, text, integer, text) to service_role;

-- Called internally by register_whatsapp_inbound, which is already service-only.
revoke execute on function public.reconcile_pending_phone_from_whatsapp(text, text, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.reconcile_pending_phone_from_whatsapp(text, text, text, text, timestamptz) to service_role;

comment on function public.claim_due_sanad_assistant_message() is
  'Service worker queue claim. Direct anon/authenticated RPC access is denied.';
comment on function public.recover_stale_sanad_assistant_messages() is
  'Internal assistant lease recovery. Invoked by pg_cron and service workers; client RPC access is denied.';
comment on function public.reconcile_pending_phone_from_whatsapp(text, text, text, text, timestamptz) is
  'Internal WhatsApp identity reconciliation called through the service-only inbound registration path.';

commit;

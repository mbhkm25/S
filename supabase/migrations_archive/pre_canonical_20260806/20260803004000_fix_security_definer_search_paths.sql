begin;

alter function public.can_user_access_operation_file(uuid, uuid) set search_path = '';
alter function public.create_business_profile(text, text, uuid, text, text, text, text, text) set search_path = '';
alter function public.create_report_delivery_artifacts(uuid, integer) set search_path = '';
alter function public.enforce_sanad_operation_datetime() set search_path = '';
alter function public.get_interactive_report_by_token(text) set search_path = '';
alter function public.get_sanad_assistant_context_snapshot(uuid, uuid) set search_path = '';
alter function public.get_sanad_assistant_media_health_queue(integer) set search_path = '';
alter function public.is_sanad_assistant_tool_allowed(text, text) set search_path = '';
alter function public.log_operation_file_access_event(uuid, uuid, text, text, text, jsonb) set search_path = '';
alter function public.lookup_sanad_assistant_intent_alias(text) set search_path = '';
alter function public.register_sanad_assistant_media_delivery(uuid, uuid, uuid, text, text, text, text, text, text, integer, jsonb) set search_path = '';
alter function public.select_sanad_assistant_media(uuid, text, text, text, text[], integer, boolean) set search_path = '';
alter function public.sync_operation_temporal_fields() set search_path = '';
alter function public.update_sanad_assistant_media_health(uuid, boolean, integer, text, text) set search_path = '';

commit;

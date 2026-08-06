create or replace function public.claim_operation_sender_guidance(
  p_operation_id uuid,
  p_guidance_type text,
  p_recipient_phone text,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language sql
security definer
set search_path to ''
as $function$
  select private.claim_operation_sender_guidance(
    p_operation_id,
    p_guidance_type,
    p_recipient_phone,
    p_metadata
  );
$function$;

create or replace function public.complete_operation_sender_guidance(
  p_delivery_id uuid,
  p_status text,
  p_meta_message_id text default null,
  p_error text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language sql
security definer
set search_path to ''
as $function$
  select private.complete_operation_sender_guidance(
    p_delivery_id,
    p_status,
    p_meta_message_id,
    p_error,
    p_metadata
  );
$function$;

revoke all on function public.claim_operation_sender_guidance(uuid,text,text,jsonb) from public, anon, authenticated;
revoke all on function public.complete_operation_sender_guidance(uuid,text,text,text,jsonb) from public, anon, authenticated;
grant execute on function public.claim_operation_sender_guidance(uuid,text,text,jsonb) to service_role;
grant execute on function public.complete_operation_sender_guidance(uuid,text,text,text,jsonb) to service_role;

-- Keep report generation state independent from WhatsApp delivery state.
-- A ready PDF/interactive report must remain ready even if Meta later rejects delivery
-- (for example error 131047 outside the free-form messaging window).

create or replace function public.apply_report_whatsapp_delivery_status(
  p_message_id text,
  p_status text,
  p_event_at timestamptz default now(),
  p_error_code text default null,
  p_error_message text default null
)
returns boolean
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_status text := lower(trim(coalesce(p_status, ''));
  v_updated integer;
begin
  if p_message_id is null or trim(p_message_id) = '' then return false; end if;
  if v_status not in ('sent','delivered','read','failed','deleted','warning') then v_status := 'unknown'; end if;

  update public.report_requests rr
  set delivery_status = v_status,
      last_delivery_event_at = coalesce(p_event_at, now()),
      accepted_at = case when v_status = 'sent' then coalesce(rr.accepted_at, p_event_at, now()) else rr.accepted_at end,
      delivered_at = case when v_status = 'delivered' then coalesce(rr.delivered_at, p_event_at, now()) else rr.delivered_at end,
      read_at = case when v_status = 'read' then coalesce(rr.read_at, p_event_at, now()) else rr.read_at end,
      failed_at = case when v_status = 'failed' and not (rr.pdf_status = 'ready' or rr.interactive_status = 'ready') then coalesce(p_event_at, now()) else rr.failed_at end,
      delivery_error_code = case when v_status = 'failed' then p_error_code else rr.delivery_error_code end,
      delivery_error_message = case when v_status = 'failed' then left(p_error_message, 1000) else rr.delivery_error_message end,
      processing_stage = case
        when v_status = 'delivered' then 'whatsapp_delivered'
        when v_status = 'read' then 'whatsapp_read'
        when v_status = 'failed' then 'whatsapp_delivery_failed'
        when v_status = 'sent' then 'accepted_by_whatsapp'
        else rr.processing_stage
      end,
      status = case
        when v_status = 'failed' and (rr.pdf_status = 'ready' or rr.interactive_status = 'ready') then 'ready'
        when v_status = 'failed' then 'failed'
        else rr.status
      end,
      error_message = case
        when v_status = 'failed' and (rr.pdf_status = 'ready' or rr.interactive_status = 'ready') then null
        when v_status = 'failed' then coalesce(left(p_error_message, 1000), 'whatsapp_delivery_failed')
        else rr.error_message
      end,
      updated_at = now()
  where rr.whatsapp_message_id = p_message_id;

  get diagnostics v_updated = row_count;
  return v_updated > 0;
end;
$function$;

comment on function public.apply_report_whatsapp_delivery_status(text,text,timestamptz,text,text)
is 'Tracks WhatsApp delivery independently; keeps generated reports ready when delivery alone fails.';

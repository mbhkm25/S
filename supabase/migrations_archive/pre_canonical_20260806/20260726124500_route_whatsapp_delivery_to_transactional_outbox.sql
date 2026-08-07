begin;

create or replace function public.apply_whatsapp_campaign_delivery_status(
  p_message_id text,
  p_status text,
  p_event_at timestamptz default now(),
  p_error_code text default null,
  p_error_message text default null
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_recipient public.sanad_whatsapp_campaign_recipients%rowtype;
  v_status text := lower(trim(coalesce(p_status,'')));
  v_transactional_matched boolean := false;
begin
  if v_status not in ('sent','delivered','read','failed') then
    raise exception 'invalid_delivery_status';
  end if;

  select * into v_recipient
  from public.sanad_whatsapp_campaign_recipients
  where external_message_id=p_message_id
  for update;

  if found then
    update public.sanad_whatsapp_campaign_recipients
    set status=case
          when status='read' then 'read'
          when status='delivered' and v_status='sent' then 'delivered'
          else v_status end,
        sent_at=case when v_status='sent' then coalesce(sent_at,p_event_at) else sent_at end,
        delivered_at=case when v_status='delivered' then coalesce(delivered_at,p_event_at) else delivered_at end,
        read_at=case when v_status='read' then coalesce(read_at,p_event_at) else read_at end,
        failed_at=case when v_status='failed' then coalesce(failed_at,p_event_at) else failed_at end,
        last_error=case when v_status='failed' then concat_ws(': ',nullif(p_error_code,''),nullif(p_error_message,'')) else last_error end,
        updated_at=now()
    where id=v_recipient.id;
    perform public.refresh_whatsapp_campaign_counts(v_recipient.campaign_id);
  end if;

  v_transactional_matched := public.apply_transactional_whatsapp_delivery_status(
    p_message_id,
    v_status,
    p_event_at,
    concat_ws(': ',nullif(p_error_code,''),nullif(p_error_message,''))
  );

  return jsonb_build_object(
    'matched',found or v_transactional_matched,
    'campaign_matched',found,
    'transactional_matched',v_transactional_matched,
    'recipient_id',case when found then v_recipient.id else null end,
    'campaign_id',case when found then v_recipient.campaign_id else null end,
    'status',v_status
  );
end;
$$;

commit;

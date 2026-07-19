alter table public.sanad_whatsapp_contacts drop constraint if exists sanad_whatsapp_contacts_onboarding_status_check;
alter table public.sanad_whatsapp_contacts add constraint sanad_whatsapp_contacts_onboarding_status_check check (onboarding_status in ('not_sent','queued','sending','sent','failed','install_page_visited','registration_started','registered'));

create or replace function public.claim_whatsapp_welcome_batch(p_limit integer default 10)
returns jsonb language plpgsql security definer set search_path to '' as $function$
declare v_limit integer := greatest(1, least(coalesce(p_limit, 10), 25)); v_items jsonb;
begin
  with candidates as (
    select id from public.sanad_whatsapp_contacts
    where onboarding_status = 'queued' and welcome_message_sent_at is null and transactional_status = 'active'
    order by first_operation_at nulls last, created_at
    for update skip locked limit v_limit
  ), claimed as (
    update public.sanad_whatsapp_contacts c
    set onboarding_status = 'sending', welcome_last_error = null, updated_at = now()
    from candidates q where c.id = q.id
    returning c.id, c.phone_normalized, c.wa_id, c.display_name, c.welcome_message_version
  )
  select coalesce(jsonb_agg(jsonb_build_object('contact_id', id,'phone', phone_normalized,'wa_id', wa_id,'display_name', display_name,'version', welcome_message_version)), '[]'::jsonb)
  into v_items from claimed;
  return jsonb_build_object('items', v_items, 'count', jsonb_array_length(v_items));
end;
$function$;

create or replace function public.release_stale_whatsapp_welcome_claims(p_older_than interval default interval '10 minutes')
returns integer language plpgsql security definer set search_path to '' as $function$
declare v_count integer;
begin
  update public.sanad_whatsapp_contacts
  set onboarding_status = 'queued', welcome_last_error = coalesce(welcome_last_error, 'stale_sending_claim_released'), updated_at = now()
  where onboarding_status = 'sending' and updated_at < now() - greatest(coalesce(p_older_than, interval '10 minutes'), interval '1 minute');
  get diagnostics v_count = row_count;
  return v_count;
end;
$function$;

revoke all on function public.claim_whatsapp_welcome_batch(integer) from public, anon, authenticated;
revoke all on function public.release_stale_whatsapp_welcome_claims(interval) from public, anon, authenticated;
grant execute on function public.claim_whatsapp_welcome_batch(integer) to service_role;
grant execute on function public.release_stale_whatsapp_welcome_claims(interval) to service_role;

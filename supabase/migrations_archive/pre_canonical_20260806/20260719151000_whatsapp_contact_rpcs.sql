create or replace function public.register_whatsapp_inbound(
  p_phone text,
  p_wa_id text,
  p_display_name text,
  p_message_id text,
  p_message_type text,
  p_supported boolean,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_phone text := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
  v_contact public.sanad_whatsapp_contacts%rowtype;
  v_contact_inserted boolean := false;
  v_event_inserted boolean := false;
  v_rows integer := 0;
  v_event_type text := case when coalesce(p_supported, false) then 'supported_message_received' else 'unsupported_message_received' end;
begin
  if v_phone !~ '^967[0-9]{9}$' then raise exception 'invalid_yemen_phone'; end if;

  insert into public.sanad_whatsapp_contacts (phone_normalized, wa_id, display_name, metadata)
  values (v_phone, nullif(trim(p_wa_id), ''), nullif(trim(p_display_name), ''), coalesce(p_metadata, '{}'::jsonb))
  on conflict (phone_normalized) do nothing
  returning * into v_contact;

  if found then
    v_contact_inserted := true;
  else
    select * into v_contact from public.sanad_whatsapp_contacts where phone_normalized = v_phone for update;
  end if;

  insert into public.sanad_whatsapp_contact_events (contact_id, event_type, external_message_id, metadata)
  values (
    v_contact.id,
    v_event_type,
    nullif(trim(p_message_id), ''),
    jsonb_build_object('message_type', nullif(trim(p_message_type), ''), 'supported', coalesce(p_supported, false)) || coalesce(p_metadata, '{}'::jsonb)
  )
  on conflict (event_type, external_message_id) where external_message_id is not null do nothing;

  get diagnostics v_rows = row_count;
  v_event_inserted := v_rows > 0;

  if v_event_inserted then
    update public.sanad_whatsapp_contacts
    set wa_id = coalesce(nullif(trim(p_wa_id), ''), wa_id),
        display_name = coalesce(nullif(trim(p_display_name), ''), display_name),
        last_seen_at = now(),
        messages_count = messages_count + 1,
        supported_messages_count = supported_messages_count + case when coalesce(p_supported, false) then 1 else 0 end,
        metadata = metadata || coalesce(p_metadata, '{}'::jsonb),
        updated_at = now()
    where id = v_contact.id returning * into v_contact;
  end if;

  return jsonb_build_object(
    'contact_id', v_contact.id,
    'phone_normalized', v_contact.phone_normalized,
    'is_first_contact', v_contact_inserted,
    'is_duplicate_message', not v_event_inserted,
    'registration_status', v_contact.registration_status,
    'onboarding_status', v_contact.onboarding_status
  );
end;
$function$;

create or replace function public.record_whatsapp_operation(
  p_phone text,
  p_message_id text,
  p_operation_id uuid,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_phone text := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
  v_contact public.sanad_whatsapp_contacts%rowtype;
  v_rows integer := 0;
  v_event_inserted boolean := false;
  v_now timestamptz := now();
begin
  select * into v_contact from public.sanad_whatsapp_contacts where phone_normalized = v_phone for update;
  if not found then raise exception 'whatsapp_contact_not_found'; end if;

  insert into public.sanad_whatsapp_contact_events (contact_id, event_type, external_message_id, operation_id, metadata)
  values (v_contact.id, 'operation_created', nullif(trim(p_message_id), ''), p_operation_id, coalesce(p_metadata, '{}'::jsonb))
  on conflict (event_type, external_message_id) where external_message_id is not null do nothing;

  get diagnostics v_rows = row_count;
  v_event_inserted := v_rows > 0;

  if v_event_inserted then
    update public.sanad_whatsapp_contacts
    set operations_count = operations_count + 1,
        first_operation_at = coalesce(first_operation_at, v_now),
        last_operation_at = v_now,
        updated_at = v_now
    where id = v_contact.id returning * into v_contact;
  end if;

  return jsonb_build_object(
    'contact_id', v_contact.id,
    'operation_count', v_contact.operations_count,
    'is_duplicate_operation_event', not v_event_inserted,
    'should_send_welcome', v_event_inserted and v_contact.operations_count = 1 and v_contact.welcome_message_sent_at is null and v_contact.transactional_status = 'active',
    'welcome_message_version', v_contact.welcome_message_version,
    'onboarding_status', v_contact.onboarding_status
  );
end;
$function$;

create or replace function public.mark_whatsapp_welcome_result(
  p_contact_id uuid,
  p_status text,
  p_message_id text default null,
  p_error text default null,
  p_version integer default 1,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_contact public.sanad_whatsapp_contacts%rowtype;
  v_status text := lower(coalesce(p_status, ''));
  v_event_type text;
begin
  if v_status not in ('queued','sent','failed') then raise exception 'invalid_welcome_status'; end if;

  update public.sanad_whatsapp_contacts
  set onboarding_status = v_status,
      welcome_message_sent_at = case when v_status = 'sent' then coalesce(welcome_message_sent_at, now()) else welcome_message_sent_at end,
      welcome_message_id = case when v_status = 'sent' then coalesce(nullif(trim(p_message_id), ''), welcome_message_id) else welcome_message_id end,
      welcome_last_error = case when v_status = 'failed' then nullif(trim(p_error), '') else null end,
      welcome_message_version = greatest(coalesce(p_version, 1), 1),
      updated_at = now()
  where id = p_contact_id returning * into v_contact;
  if not found then raise exception 'whatsapp_contact_not_found'; end if;

  v_event_type := case v_status when 'queued' then 'welcome_queued' when 'sent' then 'welcome_sent' else 'welcome_failed' end;
  insert into public.sanad_whatsapp_contact_events (contact_id, event_type, external_message_id, metadata)
  values (v_contact.id, v_event_type, nullif(trim(p_message_id), ''), jsonb_build_object('error', nullif(trim(p_error), ''), 'version', greatest(coalesce(p_version, 1), 1)) || coalesce(p_metadata, '{}'::jsonb))
  on conflict (event_type, external_message_id) where external_message_id is not null do nothing;

  return jsonb_build_object('contact_id', v_contact.id, 'onboarding_status', v_contact.onboarding_status, 'welcome_message_sent_at', v_contact.welcome_message_sent_at, 'welcome_message_id', v_contact.welcome_message_id);
end;
$function$;

revoke all on function public.register_whatsapp_inbound(text,text,text,text,text,boolean,jsonb) from public, anon, authenticated;
revoke all on function public.record_whatsapp_operation(text,text,uuid,jsonb) from public, anon, authenticated;
revoke all on function public.mark_whatsapp_welcome_result(uuid,text,text,text,integer,jsonb) from public, anon, authenticated;
grant execute on function public.register_whatsapp_inbound(text,text,text,text,text,boolean,jsonb) to service_role;
grant execute on function public.record_whatsapp_operation(text,text,uuid,jsonb) to service_role;
grant execute on function public.mark_whatsapp_welcome_result(uuid,text,text,text,integer,jsonb) to service_role;

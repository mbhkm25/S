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
set search_path = ''
as $function$
declare
  v_phone text := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
  v_contact public.sanad_whatsapp_contacts%rowtype;
  v_contact_inserted boolean := false;
  v_event_inserted boolean := false;
  v_rows integer := 0;
  v_event_type text := case when coalesce(p_supported, false) then 'supported_message_received' else 'unsupported_message_received' end;
  v_linked_user_id uuid;
begin
  if v_phone !~ '^967[0-9]{9}$' then
    raise exception 'invalid_yemen_phone';
  end if;

  select p.id
  into v_linked_user_id
  from public.profiles p
  where regexp_replace(coalesce(p.phone, ''), '[^0-9]', '', 'g') = v_phone
  order by p.updated_at desc nulls last, p.created_at desc nulls last
  limit 1;

  insert into public.sanad_whatsapp_contacts (
    phone_normalized,
    wa_id,
    display_name,
    linked_user_id,
    registration_status,
    metadata
  )
  values (
    v_phone,
    nullif(trim(p_wa_id), ''),
    nullif(trim(p_display_name), ''),
    v_linked_user_id,
    case when v_linked_user_id is not null then 'registered' else 'whatsapp_only' end,
    coalesce(p_metadata, '{}'::jsonb)
  )
  on conflict (phone_normalized) do nothing
  returning * into v_contact;

  if found then
    v_contact_inserted := true;
  else
    select *
    into v_contact
    from public.sanad_whatsapp_contacts
    where phone_normalized = v_phone
    for update;
  end if;

  insert into public.sanad_whatsapp_contact_events (
    contact_id,
    event_type,
    external_message_id,
    metadata
  )
  values (
    v_contact.id,
    v_event_type,
    nullif(trim(p_message_id), ''),
    jsonb_build_object(
      'message_type', nullif(trim(p_message_type), ''),
      'supported', coalesce(p_supported, false)
    ) || coalesce(p_metadata, '{}'::jsonb)
  )
  on conflict (event_type, external_message_id)
    where external_message_id is not null
  do nothing;

  get diagnostics v_rows = row_count;
  v_event_inserted := v_rows > 0;

  update public.sanad_whatsapp_contacts
  set wa_id = coalesce(nullif(trim(p_wa_id), ''), wa_id),
      display_name = coalesce(nullif(trim(p_display_name), ''), display_name),
      linked_user_id = coalesce(linked_user_id, v_linked_user_id),
      registration_status = case
        when coalesce(linked_user_id, v_linked_user_id) is not null then 'registered'
        else registration_status
      end,
      last_seen_at = case when v_event_inserted then now() else last_seen_at end,
      messages_count = messages_count + case when v_event_inserted then 1 else 0 end,
      supported_messages_count = supported_messages_count + case when v_event_inserted and coalesce(p_supported, false) then 1 else 0 end,
      metadata = metadata || coalesce(p_metadata, '{}'::jsonb),
      updated_at = now()
  where id = v_contact.id
  returning * into v_contact;

  return jsonb_build_object(
    'contact_id', v_contact.id,
    'phone_normalized', v_contact.phone_normalized,
    'is_first_contact', v_contact_inserted,
    'is_duplicate_message', not v_event_inserted,
    'registration_status', v_contact.registration_status,
    'onboarding_status', v_contact.onboarding_status,
    'linked_user_id', v_contact.linked_user_id
  );
end;
$function$;

update public.sanad_whatsapp_contacts c
set linked_user_id = p.id,
    registration_status = 'registered',
    updated_at = now()
from public.profiles p
where c.linked_user_id is null
  and regexp_replace(coalesce(p.phone, ''), '[^0-9]', '', 'g') = c.phone_normalized;

revoke all on function public.register_whatsapp_inbound(text, text, text, text, text, boolean, jsonb) from public, anon, authenticated;
grant execute on function public.register_whatsapp_inbound(text, text, text, text, text, boolean, jsonb) to service_role;

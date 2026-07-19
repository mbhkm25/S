create or replace function private.capture_whatsapp_operation_contact()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_message_id text;
  v_registered jsonb;
  v_recorded jsonb;
  v_contact_id uuid;
begin
  if coalesce(new.source, '') <> 'whatsapp' then
    return new;
  end if;

  if new.submitted_by_phone is null or regexp_replace(new.submitted_by_phone, '[^0-9]', '', 'g') !~ '^967[0-9]{9}$' then
    return new;
  end if;

  v_message_id := nullif(trim(coalesce(new.storage_metadata->>'meta_message_id', new.client_upload_metadata->>'message_id', '')), '');

  v_registered := public.register_whatsapp_inbound(
    new.submitted_by_phone,
    coalesce(new.storage_metadata->>'whatsapp_from', new.submitted_by_phone),
    new.submitted_by_name,
    v_message_id,
    coalesce(new.storage_metadata->>'whatsapp_message_type', 'operation'),
    true,
    jsonb_build_object(
      'captured_by', 'operations_trigger',
      'operation_id', new.id,
      'public_token', new.public_token
    )
  );

  v_recorded := public.record_whatsapp_operation(
    new.submitted_by_phone,
    v_message_id,
    new.id,
    jsonb_build_object(
      'captured_by', 'operations_trigger',
      'public_token', new.public_token,
      'status', new.status,
      'ai_status', new.ai_status
    )
  );

  if coalesce((v_recorded->>'should_send_welcome')::boolean, false) then
    v_contact_id := (v_recorded->>'contact_id')::uuid;
    perform public.mark_whatsapp_welcome_result(
      v_contact_id,
      'queued',
      null,
      null,
      coalesce((v_recorded->>'welcome_message_version')::integer, 1),
      jsonb_build_object(
        'queued_by', 'operations_trigger',
        'operation_id', new.id,
        'public_token', new.public_token
      )
    );
  end if;

  return new;
exception
  when others then
    raise warning 'capture_whatsapp_operation_contact_failed operation_id=% error=%', new.id, sqlerrm;
    return new;
end;
$function$;

drop trigger if exists trg_capture_whatsapp_operation_contact on public.operations;
create trigger trg_capture_whatsapp_operation_contact
after insert on public.operations
for each row
when (new.source = 'whatsapp')
execute function private.capture_whatsapp_operation_contact();

revoke all on function private.capture_whatsapp_operation_contact() from public, anon, authenticated;
grant execute on function private.capture_whatsapp_operation_contact() to service_role;

comment on function private.capture_whatsapp_operation_contact() is
  'Non-blocking operations trigger that records WhatsApp contacts and queues first-success onboarding without failing intake.';

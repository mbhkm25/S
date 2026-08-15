-- Reconcile Meta WhatsApp delivery receipts with phone-verification claims.
--
-- The WhatsApp intake webhook already forwards every Meta status callback to
-- public.apply_transactional_whatsapp_delivery_status().  Extend that central
-- RPC so phone-verification messages receive the same sent/delivered/read/failed
-- telemetry without duplicating webhook logic.

create or replace function public.apply_phone_verification_whatsapp_delivery_status(
  p_message_id text,
  p_status text,
  p_event_at timestamptz default now(),
  p_error text default null
)
returns boolean
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_status text := lower(trim(coalesce(p_status, '')));
  v_claim public.phone_verification_claims%rowtype;
  v_event_type text;
begin
  if nullif(trim(coalesce(p_message_id, '')), '') is null then
    return false;
  end if;

  if v_status not in ('sent','delivered','read','failed') then
    return false;
  end if;

  select * into v_claim
  from public.phone_verification_claims
  where whatsapp_message_id = p_message_id
  order by created_at desc
  limit 1
  for update;

  if not found then
    return false;
  end if;

  v_event_type := 'whatsapp_' || v_status;

  -- Delivery/read receipts are telemetry only. Keep the claim actionable as
  -- "sent" so a later signed WhatsApp button can still complete verification.
  if v_status in ('sent','delivered','read') then
    update public.phone_verification_claims
    set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
          'whatsapp_delivery_status', v_status,
          'whatsapp_delivery_status_at', coalesce(p_event_at, now())
        ),
        updated_at = now()
    where id = v_claim.id;
  else
    -- A Meta failure is actionable immediately; do not wait for claim expiry.
    -- Preserve terminal states if a delayed callback arrives.
    if v_claim.status in ('sent','sending') then
      update public.phone_verification_claims
      set status = 'failed',
          claimed_at = null,
          last_error = left(
            coalesce(nullif(trim(p_error), ''), 'whatsapp_delivery_failed'),
            1000
          ),
          metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
            'whatsapp_delivery_status', 'failed',
            'whatsapp_delivery_status_at', coalesce(p_event_at, now())
          ),
          updated_at = now()
      where id = v_claim.id;

      update public.profiles
      set phone_verification_status = 'pending',
          phone_verification_updated_at = now(),
          updated_at = now()
      where id = v_claim.user_id
        and phone is null
        and pending_phone = v_claim.phone_normalized;

      -- Retry while this claim is still live and under the existing attempt cap.
      if v_claim.expires_at > now() and v_claim.delivery_attempts < 3 then
        perform private.dispatch_phone_verification_delivery();
      end if;
    end if;
  end if;

  if not exists (
    select 1
    from public.phone_verification_events e
    where e.claim_id = v_claim.id
      and e.event_type = v_event_type
      and e.external_message_id = p_message_id
      and e.metadata->>'delivery_status' = v_status
  ) then
    insert into public.phone_verification_events(
      claim_id,
      user_id,
      event_type,
      external_message_id,
      metadata,
      occurred_at
    ) values (
      v_claim.id,
      v_claim.user_id,
      v_event_type,
      p_message_id,
      jsonb_build_object(
        'delivery_status', v_status,
        'error', nullif(trim(coalesce(p_error, '')), '')
      ),
      coalesce(p_event_at, now())
    );
  end if;

  return true;
end;
$function$;

revoke all on function public.apply_phone_verification_whatsapp_delivery_status(
  text,
  text,
  timestamptz,
  text
) from public, anon, authenticated;
grant execute on function public.apply_phone_verification_whatsapp_delivery_status(
  text,
  text,
  timestamptz,
  text
) to service_role;

create or replace function public.apply_transactional_whatsapp_delivery_status(
  p_message_id text,
  p_status text,
  p_event_at timestamptz default now(),
  p_error text default null
)
returns boolean
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_status text := lower(trim(coalesce(p_status,'')));
  v_count integer;
  v_phone_handled boolean := false;
begin
  update public.sanad_transactional_message_outbox
  set delivery_status = case
        when v_status in ('sent','delivered','read','failed') then v_status
        else delivery_status
      end,
      delivered_at = case
        when v_status = 'delivered' then coalesce(delivered_at, p_event_at, now())
        else delivered_at
      end,
      read_at = case
        when v_status = 'read' then coalesce(read_at, p_event_at, now())
        else read_at
      end,
      failed_at = case
        when v_status = 'failed' then coalesce(failed_at, p_event_at, now())
        else failed_at
      end,
      last_error = case
        when v_status = 'failed' then left(coalesce(p_error, last_error), 1000)
        else last_error
      end,
      updated_at = now()
  where external_message_id = p_message_id;

  get diagnostics v_count = row_count;

  -- The intake webhook already calls this RPC for every Meta status callback.
  -- Reuse that path to reconcile phone-verification delivery receipts too.
  v_phone_handled := public.apply_phone_verification_whatsapp_delivery_status(
    p_message_id,
    v_status,
    p_event_at,
    p_error
  );

  return v_count > 0 or v_phone_handled;
end;
$function$;

revoke all on function public.apply_transactional_whatsapp_delivery_status(
  text,
  text,
  timestamptz,
  text
) from public, anon, authenticated;
grant execute on function public.apply_transactional_whatsapp_delivery_status(
  text,
  text,
  timestamptz,
  text
) to service_role;

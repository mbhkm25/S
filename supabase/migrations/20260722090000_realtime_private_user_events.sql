-- Activate production-safe Realtime Broadcast for SANAD.
-- Uses private per-user/admin channels rather than exposing public tables through
-- Postgres Changes. Payloads intentionally contain identifiers and state only.

create policy "sanad users receive own private broadcasts"
on realtime.messages
for select
to authenticated
using (
  realtime.messages.extension = 'broadcast'
  and (
    (select realtime.topic()) = ('user:' || (select auth.uid())::text)
    or (
      (select realtime.topic()) = 'admin:platform'
      and public.is_platform_admin((select auth.uid()))
    )
  )
);

create or replace function private.broadcast_sanad_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  perform realtime.send(
    jsonb_build_object(
      'id', new.id,
      'notification_type', new.notification_type,
      'category', new.category,
      'severity', new.severity,
      'title', new.title,
      'action_type', new.action_type,
      'business_id', new.business_id,
      'operation_id', new.operation_id,
      'created_at', new.created_at
    ),
    'notification.created',
    'user:' || new.recipient_user_id::text,
    true
  );

  return new;
end;
$function$;

revoke all on function private.broadcast_sanad_notification() from public, anon, authenticated;

create trigger trg_notifications_realtime_broadcast
after insert on public.notifications
for each row
execute function private.broadcast_sanad_notification();

create or replace function private.broadcast_sanad_payment_request()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_event text;
begin
  if tg_op = 'INSERT' then
    v_event := 'payment.created';
  elsif old.status is distinct from new.status
     or old.subscription_id is distinct from new.subscription_id
     or old.failure_reason is distinct from new.failure_reason then
    v_event := 'payment.updated';
  else
    return new;
  end if;

  perform realtime.send(
    jsonb_build_object(
      'id', new.id,
      'status', new.status,
      'subscription_id', new.subscription_id,
      'updated_at', new.updated_at
    ),
    v_event,
    'user:' || new.user_id::text,
    true
  );

  perform realtime.send(
    jsonb_build_object(
      'id', new.id,
      'status', new.status,
      'created_at', new.created_at,
      'updated_at', new.updated_at
    ),
    v_event,
    'admin:platform',
    true
  );

  return new;
end;
$function$;

revoke all on function private.broadcast_sanad_payment_request() from public, anon, authenticated;

create trigger trg_pro_payment_requests_realtime_broadcast
after insert or update on public.pro_payment_requests
for each row
execute function private.broadcast_sanad_payment_request();

create or replace function private.broadcast_sanad_subscription()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if tg_op = 'UPDATE'
     and old.status is not distinct from new.status
     and old.plan_code is not distinct from new.plan_code
     and old.current_period_start is not distinct from new.current_period_start
     and old.current_period_end is not distinct from new.current_period_end then
    return new;
  end if;

  perform realtime.send(
    jsonb_build_object(
      'id', new.id,
      'plan_code', new.plan_code,
      'status', new.status,
      'current_period_start', new.current_period_start,
      'current_period_end', new.current_period_end,
      'updated_at', new.updated_at
    ),
    case when tg_op = 'INSERT' then 'subscription.created' else 'subscription.updated' end,
    'user:' || new.user_id::text,
    true
  );

  return new;
end;
$function$;

revoke all on function private.broadcast_sanad_subscription() from public, anon, authenticated;

create trigger trg_user_subscriptions_realtime_broadcast
after insert or update on public.user_subscriptions
for each row
execute function private.broadcast_sanad_subscription();

comment on function private.broadcast_sanad_notification() is
  'Broadcasts a minimal notification event to the recipient private Realtime channel.';

comment on function private.broadcast_sanad_payment_request() is
  'Broadcasts payment lifecycle state to the owner and platform-admin private Realtime channels.';

comment on function private.broadcast_sanad_subscription() is
  'Broadcasts subscription entitlement changes to the owner private Realtime channel.';

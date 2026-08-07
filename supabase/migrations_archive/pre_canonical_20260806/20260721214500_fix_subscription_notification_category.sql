create or replace function public.sanad_pro_payment_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_type text;
  v_title text;
  v_body text;
  v_severity text := 'info';
begin
  if tg_op = 'INSERT' then
    v_type := 'pro_payment_submitted';
    v_title := 'تم استلام طلب سند Pro';
    v_body := 'طلبك قيد التحقق، وستظهر النتيجة في إدارة الاشتراك.';
  elsif new.status is distinct from old.status and new.status in ('approved', 'auto_approved') then
    v_type := 'pro_payment_approved';
    v_title := 'تم تفعيل سند Pro';
    v_body := 'تمت الموافقة على طلبك وتفعيل اشتراك سند Pro. راجع تفاصيل المدة من إدارة الاشتراك.';
    v_severity := 'success';
  elsif new.status is distinct from old.status and new.status = 'rejected' then
    v_type := 'pro_payment_rejected';
    v_title := 'تعذر اعتماد طلب سند Pro';
    v_body := 'سبب الرفض: ' || coalesce(nullif(trim(new.failure_reason), ''), 'تعذر التحقق من بيانات التحويل.');
    v_severity := 'warning';
  else
    return new;
  end if;

  insert into public.notifications(
    recipient_user_id, notification_type, category, severity, title, body,
    action_type, action_payload, source_event_type, source_event_id, dedupe_key, data
  ) values (
    new.user_id, v_type, 'subscription', v_severity, v_title, v_body,
    'profile', jsonb_build_object('section', 'subscription'),
    'pro_payment_request', new.id::text, v_type || ':' || new.id::text,
    jsonb_build_object(
      'payment_request_id', new.id,
      'status', new.status,
      'reason', new.failure_reason,
      'subscription_id', new.subscription_id
    )
  ) on conflict (recipient_user_id, dedupe_key) do nothing;

  return new;
end;
$function$;

create or replace function public.process_sanad_subscription_lifecycle()
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  insert into public.notifications(
    recipient_user_id, notification_type, category, severity, title, body,
    action_type, action_payload, source_event_type, source_event_id, dedupe_key, data
  )
  select
    s.user_id, 'subscription_expiring', 'subscription', 'warning',
    'اشتراك سند Pro يقترب من الانتهاء',
    'تبقى أقل من ثلاثة أيام على انتهاء الاشتراك.',
    'profile', jsonb_build_object('section', 'subscription'),
    'user_subscription', s.id::text, 'subscription_expiring:' || s.id::text,
    jsonb_build_object('subscription_id', s.id, 'ends_at', s.current_period_end)
  from public.user_subscriptions s
  where s.status = 'active'
    and s.current_period_end > now()
    and s.current_period_end <= now() + interval '3 days'
  on conflict (recipient_user_id, dedupe_key) do nothing;

  update public.user_subscriptions
  set status = 'expired', updated_at = now()
  where status = 'active' and current_period_end <= now();

  update public.user_subscriptions
  set status = 'active', updated_at = now()
  where status = 'scheduled'
    and current_period_start <= now()
    and current_period_end > now();

  insert into public.notifications(
    recipient_user_id, notification_type, category, severity, title, body,
    action_type, action_payload, source_event_type, source_event_id, dedupe_key, data
  )
  select
    s.user_id, 'subscription_expired', 'subscription', 'warning',
    'انتهى اشتراك سند Pro',
    'يمكنك التجديد من إدارة الاشتراك.',
    'profile', jsonb_build_object('section', 'subscription'),
    'user_subscription', s.id::text, 'subscription_expired:' || s.id::text,
    jsonb_build_object('subscription_id', s.id, 'ended_at', s.current_period_end)
  from public.user_subscriptions s
  where s.status = 'expired' and s.current_period_end <= now()
  on conflict (recipient_user_id, dedupe_key) do nothing;

  update public.pro_payment_requests
  set status = 'pending_review', failure_reason = 'processing_timeout', updated_at = now()
  where status = 'processing' and updated_at < now() - interval '15 minutes';
end;
$function$;

revoke all on function public.sanad_pro_payment_notification() from public, anon, authenticated;

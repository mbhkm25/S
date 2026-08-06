create or replace function public.is_current_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select public.is_platform_admin(auth.uid());
$function$;

revoke all on function public.is_current_platform_admin() from public, anon;
grant execute on function public.is_current_platform_admin() to authenticated;

create policy platform_admin_select_pro_payment_receipts
on storage.objects
for select
to authenticated
using (
  bucket_id = 'operation-files'
  and (storage.foldername(name))[1] = 'pro-payment-receipts'
  and public.is_current_platform_admin()
);

create or replace function public.platform_admin_get_payment_request_details(
  p_payment_request_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_result jsonb;
begin
  if not public.is_platform_admin(auth.uid()) then
    raise exception 'platform_admin_required' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'request', jsonb_build_object(
      'id', r.id,
      'user_id', r.user_id,
      'user_full_name', p.full_name,
      'user_phone', p.phone,
      'user_governorate', p.governorate,
      'plan_code', r.plan_code,
      'expected_amount', r.expected_amount,
      'expected_currency', r.expected_currency,
      'months', r.months,
      'payment_network', r.payment_network,
      'transfer_reference', r.transfer_reference,
      'receipt_bucket', r.receipt_bucket,
      'receipt_path', r.receipt_path,
      'receipt_mime_type', r.receipt_mime_type,
      'receipt_file_name', r.receipt_file_name,
      'receipt_file_size', r.receipt_file_size,
      'status', r.status,
      'ai_extracted_json', r.ai_extracted_json,
      'ai_confidence', r.ai_confidence,
      'verification_checks', r.verification_checks,
      'failure_reason', r.failure_reason,
      'approved_at', r.approved_at,
      'approved_by', r.approved_by,
      'subscription_id', r.subscription_id,
      'metadata', r.metadata,
      'created_at', r.created_at,
      'updated_at', r.updated_at
    ),
    'expected_receiver', jsonb_build_object(
      'financial_entity', a.financial_entity,
      'account_number', a.account_number,
      'account_holder_name', a.account_holder_name,
      'currency', a.currency
    ),
    'subscription', case when s.id is null then null else jsonb_build_object(
      'id', s.id,
      'status', s.status,
      'current_period_start', s.current_period_start,
      'current_period_end', s.current_period_end,
      'activated_by', s.activated_by
    ) end
  ) into v_result
  from public.pro_payment_requests r
  left join public.profiles p on p.id = r.user_id
  left join public.sanad_payment_accounts a on a.id = r.payment_account_id
  left join public.user_subscriptions s on s.id = r.subscription_id
  where r.id = p_payment_request_id;

  if v_result is null then
    raise exception 'payment_request_not_found';
  end if;

  return v_result;
end;
$function$;

create or replace function public.platform_admin_review_payment_request(
  p_payment_request_id uuid,
  p_decision text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_before public.pro_payment_requests%rowtype;
  v_after public.pro_payment_requests%rowtype;
  v_result jsonb;
begin
  if not public.is_platform_admin(auth.uid()) then
    raise exception 'platform_admin_required' using errcode = '42501';
  end if;
  if p_decision not in ('approve', 'reject') then
    raise exception 'invalid_payment_review_decision';
  end if;
  if length(trim(coalesce(p_reason, ''))) < 5 then
    raise exception 'admin_reason_required';
  end if;

  select * into v_before
  from public.pro_payment_requests
  where id = p_payment_request_id
  for update;

  if not found then
    raise exception 'payment_request_not_found';
  end if;
  if v_before.status in ('approved', 'auto_approved', 'rejected', 'cancelled') then
    raise exception 'payment_request_already_finalized';
  end if;

  if p_decision = 'approve' then
    v_result := public.admin_approve_pro_payment_request(
      p_payment_request_id,
      'platform_admin',
      v_before.ai_extracted_json,
      v_before.ai_confidence,
      v_before.verification_checks,
      trim(p_reason)
    );
    if not coalesce((v_result->>'ok')::boolean, false) then
      raise exception 'payment_approval_failed: %', coalesce(v_result->>'reason', 'unknown');
    end if;
  else
    v_result := public.admin_mark_pro_payment_request_review(
      p_payment_request_id,
      'rejected',
      v_before.ai_extracted_json,
      v_before.ai_confidence,
      v_before.verification_checks,
      trim(p_reason)
    );
    if not coalesce((v_result->>'ok')::boolean, false) then
      raise exception 'payment_rejection_failed: %', coalesce(v_result->>'reason', 'unknown');
    end if;
  end if;

  select * into v_after
  from public.pro_payment_requests
  where id = p_payment_request_id;

  insert into public.platform_admin_audit_log
    (actor_user_id, action, target_type, target_id, reason, before_data, after_data)
  values (
    auth.uid(),
    case when p_decision = 'approve' then 'pro_payment_approved' else 'pro_payment_rejected' end,
    'pro_payment_request',
    p_payment_request_id::text,
    trim(p_reason),
    jsonb_build_object('status', v_before.status, 'subscription_id', v_before.subscription_id),
    jsonb_build_object('status', v_after.status, 'subscription_id', v_after.subscription_id,
      'approved_at', v_after.approved_at, 'failure_reason', v_after.failure_reason)
  );

  return jsonb_build_object(
    'ok', true,
    'decision', p_decision,
    'request', jsonb_build_object(
      'id', v_after.id,
      'status', v_after.status,
      'subscription_id', v_after.subscription_id,
      'approved_at', v_after.approved_at,
      'failure_reason', v_after.failure_reason
    ),
    'result', v_result
  );
end;
$function$;

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

revoke all on function public.platform_admin_get_payment_request_details(uuid) from public, anon;
revoke all on function public.platform_admin_review_payment_request(uuid, text, text) from public, anon;
revoke all on function public.sanad_pro_payment_notification() from public, anon, authenticated;

grant execute on function public.platform_admin_get_payment_request_details(uuid) to authenticated;
grant execute on function public.platform_admin_review_payment_request(uuid, text, text) to authenticated;

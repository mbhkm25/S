begin;

update public.sanad_transactional_message_rules
set
  template_name = case event_type
    when 'report_requested' then 'sanad_report_requested_ar'
    when 'report_ready' then 'sanad_report_ready_ar'
    when 'report_failed' then 'sanad_report_failed_ar'
    when 'pro_payment_submitted' then 'sanad_pro_payment_submitted_ar'
    when 'pro_payment_approved' then 'sanad_pro_payment_approved_ar'
    when 'pro_payment_rejected' then 'sanad_pro_payment_rejected_ar'
    when 'subscription_expiring' then 'sanad_subscription_expiring_ar'
    when 'subscription_expired' then 'sanad_subscription_expired_ar'
    else template_name
  end,
  template_language = 'ar',
  enabled = false,
  updated_at = now()
where event_type in (
  'report_requested',
  'report_ready',
  'report_failed',
  'pro_payment_submitted',
  'pro_payment_approved',
  'pro_payment_rejected',
  'subscription_expiring',
  'subscription_expired'
);

-- Production safety invariant: template binding must never activate delivery rules.
do $$
begin
  if exists (
    select 1
    from public.sanad_transactional_message_rules
    where event_type in (
      'report_requested',
      'report_ready',
      'report_failed',
      'pro_payment_submitted',
      'pro_payment_approved',
      'pro_payment_rejected',
      'subscription_expiring',
      'subscription_expired'
    )
    and enabled = true
  ) then
    raise exception 'transactional_template_binding_must_remain_disabled';
  end if;
end;
$$;

commit;

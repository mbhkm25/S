-- Surface multi-beneficiary payment context in the platform admin snapshot.

create or replace function public.platform_admin_get_console_snapshot(p_limit integer default 50)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 100);
begin
  if not public.is_platform_admin(auth.uid()) then
    raise exception 'platform_admin_required' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'generated_at', now(),
    'stats', jsonb_build_object(
      'users', (select count(*) from public.profiles),
      'active_users', (select count(*) from public.profiles where status = 'active'),
      'operations', (select count(*) from public.operations),
      'operations_today', (select count(*) from public.operations where created_at >= date_trunc('day', now())),
      'pending_businesses', (
        select count(*) from public.business_profiles
        where public_status in ('draft', 'pending_review')
      ),
      'active_subscriptions', (
        select count(*) from public.user_subscriptions
        where status = 'active' and (current_period_end is null or current_period_end > now())
      ),
      'pending_payments', (
        select count(*) from public.pro_payment_requests
        where status in ('submitted', 'processing', 'pending_review')
      ),
      'possible_fraud', (select count(*) from public.operations where possible_fraud)
    ),
    'users', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.created_at desc)
      from (
        select p.id, p.full_name, p.phone, p.status, p.global_role, p.governorate,
          p.created_at, u.email, u.last_sign_in_at
        from public.profiles p
        left join auth.users u on u.id = p.id
        order by p.created_at desc
        limit v_limit
      ) x
    ), '[]'::jsonb),
    'operations', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.created_at desc)
      from (
        select o.id, o.public_token, o.source, o.status, o.ai_status, o.ai_error,
          o.financial_entity, o.transaction_type, o.amount, o.currency,
          o.sanad_risk_level, o.sanad_review_status, o.possible_fraud,
          o.submitted_by_name, o.submitted_by_phone, o.created_at, o.verified_at
        from public.operations o
        order by o.created_at desc
        limit v_limit
      ) x
    ), '[]'::jsonb),
    'businesses', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.created_at desc)
      from (
        select b.id, b.name, b.slug, b.governorate, b.city, b.whatsapp,
          b.public_status, b.verification_status, b.review_note,
          b.submitted_for_review_at, b.reviewed_at, b.created_at, b.owner_user_id,
          p.full_name as owner_name, p.phone as owner_phone
        from public.business_profiles b
        left join public.profiles p on p.id = b.owner_user_id
        order by b.created_at desc
        limit v_limit
      ) x
    ), '[]'::jsonb),
    'subscriptions', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.created_at desc)
      from (
        select s.id, s.user_id, p.full_name, p.phone, s.plan_code, s.status,
          s.current_period_start, s.current_period_end, s.activated_by, s.created_at
        from public.user_subscriptions s
        left join public.profiles p on p.id = s.user_id
        order by s.created_at desc
        limit v_limit
      ) x
    ), '[]'::jsonb),
    'payment_requests', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.created_at desc)
      from (
        select r.id, r.user_id, p.full_name, p.phone, r.plan_code,
          r.expected_amount, r.expected_currency, r.months, r.payment_network,
          r.transfer_reference, r.status, r.ai_confidence, r.failure_reason,
          r.approved_at, r.approved_by, r.created_at, r.purchase_scope,
          r.business_id, business.name as business_name,
          r.beneficiary_count, r.unit_amount
        from public.pro_payment_requests r
        left join public.profiles p on p.id = r.user_id
        left join public.business_profiles business on business.id = r.business_id
        order by r.created_at desc
        limit v_limit
      ) x
    ), '[]'::jsonb),
    'plans', coalesce((
      select jsonb_agg(to_jsonb(plan) order by plan.monthly_price_yer)
      from public.subscription_plans plan
    ), '[]'::jsonb),
    'public_information', (
      select to_jsonb(info)
      from public.app_public_information info
      where info.singleton = true
    ),
    'audit_log', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.created_at desc)
      from (
        select audit.id, audit.action, audit.target_type, audit.target_id,
          audit.reason, audit.created_at, profile.full_name as actor_name
        from public.platform_admin_audit_log audit
        left join public.profiles profile on profile.id = audit.actor_user_id
        order by audit.created_at desc
        limit v_limit
      ) x
    ), '[]'::jsonb)
  );
end;
$function$;

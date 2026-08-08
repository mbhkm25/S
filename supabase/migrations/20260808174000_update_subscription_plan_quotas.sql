-- SANAD launch pricing/quota update.
-- Free: 100 lifetime operations, one-time allowance, no monthly renewal.
-- Pro: 1000 operations per 30-day subscription period for 2,900 YER.

update public.subscription_plans
set monthly_access_limit = 100,
    description = '100 عملية تحقق تأسيسية لمرة واحدة طوال عمر الحساب.',
    updated_at = now()
where code = 'free';

update public.subscription_plans
set monthly_access_limit = 1000,
    monthly_price_yer = 2900,
    billing_duration_days = 30,
    updated_at = now()
where code = 'sanad_pro';

-- Existing active/scheduled Pro subscriptions carry an immutable purchase snapshot
-- plus an entitlement snapshot in user_subscriptions.metadata. Upgrade only the
-- entitlement snapshot so current subscribers receive the new 1000-operation limit
-- immediately without rewriting historical purchase-item records.
update public.user_subscriptions
set metadata = jsonb_set(coalesce(metadata, '{}'::jsonb), '{access_limit}', '1000'::jsonb, true),
    updated_at = now()
where plan_code = 'sanad_pro'
  and status in ('active', 'scheduled')
  and current_period_end > now();

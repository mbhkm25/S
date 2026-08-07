update public.subscription_plans
set
  monthly_access_limit = 30,
  description = '30 عملية وصول مجانية شهريًا.',
  updated_at = now()
where code = 'free';;

begin;

create or replace function public.get_public_landing_information()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'support', coalesce((select to_jsonb(i) - 'singleton' - 'updated_at'
      from public.app_public_information i where i.singleton = true), '{}'::jsonb),
    'pro_plan', coalesce((select jsonb_build_object(
      'code', p.code,
      'name', p.display_name,
      'description', p.description,
      'price', p.monthly_price_yer,
      'currency', p.currency_code,
      'duration_days', p.billing_duration_days,
      'access_limit', p.monthly_access_limit,
      'features', p.features
    ) from public.subscription_plans p where p.code = 'sanad_pro' and p.is_active = true), '{}'::jsonb)
  );
$$;

revoke all on function public.get_public_landing_information() from public;
grant execute on function public.get_public_landing_information() to anon, authenticated, service_role;

notify pgrst, 'reload schema';
commit;

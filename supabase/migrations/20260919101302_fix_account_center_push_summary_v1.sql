create or replace function public.get_my_push_subscription_summary_v1()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'authentication_required';
  end if;

  return jsonb_build_object(
    'active_push',
      (select count(*) from public.push_subscriptions d
       where d.user_id = v_user and d.is_active = true),
    'last_seen_at',
      (select max(d.last_seen_at) from public.push_subscriptions d
       where d.user_id = v_user and d.is_active = true)
  );
end;
$function$;

revoke all on function public.get_my_push_subscription_summary_v1() from public;
revoke all on function public.get_my_push_subscription_summary_v1() from anon;
grant execute on function public.get_my_push_subscription_summary_v1() to authenticated;

create or replace function public.get_my_account_center_v1()
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $function$
declare
  v_user uuid := auth.uid();
  v_result jsonb;
begin
  if v_user is null then raise exception 'authentication_required'; end if;

  select jsonb_build_object(
    'profile',coalesce((select jsonb_build_object('id',p.id,'full_name',p.full_name,'phone',p.phone,'avatar_path',p.avatar_path,'status',p.status,'governorate',p.governorate,'profile_completed_at',p.profile_completed_at,'phone_verification_status',p.phone_verification_status,'phone_verified_at',p.phone_verified_at) from public.profiles p where p.id=v_user),'{}'::jsonb),
    'subscription',coalesce((select jsonb_build_object('plan_code',s.plan_code,'status',s.status,'current_period_start',s.current_period_start,'current_period_end',s.current_period_end) from public.user_subscriptions s where s.user_id=v_user order by s.created_at desc limit 1),'{}'::jsonb),
    'notifications',jsonb_build_object('unread',(select count(*) from public.notifications n where n.recipient_user_id=v_user and n.read_at is null and n.archived_at is null),'total_active',(select count(*) from public.notifications n where n.recipient_user_id=v_user and n.archived_at is null)),
    'devices',public.get_my_push_subscription_summary_v1(),
    'businesses',coalesce((select jsonb_agg(jsonb_build_object('id',b.id,'name',b.name,'slug',b.slug,'public_status',b.public_status,'verification_status',b.verification_status) order by b.created_at) from public.business_profiles b where b.owner_user_id=v_user),'[]'::jsonb),
    'finance',jsonb_build_object('active_accounts',(select count(*) from public.personal_finance_accounts a where a.user_id=v_user and a.status='active'),'active_budgets',(select count(*) from public.personal_finance_budgets b where b.user_id=v_user and b.status='active'),'active_goals',(select count(*) from public.personal_finance_goals g where g.user_id=v_user and g.status='active'),'open_obligations',(select count(*) from public.personal_finance_obligations o where o.user_id=v_user and o.status in ('open','partial'))),
    'financial_preferences',coalesce((select to_jsonb(fp)-'user_id' from public.user_financial_preferences fp where fp.user_id=v_user),jsonb_build_object('default_currency','YER','secondary_currency','SAR','locale','ar-YE','timezone','Asia/Aden','week_starts_on',6,'budget_alert_percent',80,'due_reminder_days',3,'ai_financial_insights_enabled',true)),
    'generated_at',now()
  ) into v_result;

  return v_result;
end;
$function$;

revoke all on function public.get_my_account_center_v1() from public;
revoke all on function public.get_my_account_center_v1() from anon;
grant execute on function public.get_my_account_center_v1() to authenticated;

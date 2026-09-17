create table if not exists public.ai_financial_context_access_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  scope_kind text not null check (scope_kind in ('personal','business')),
  business_id uuid references public.business_profiles(id) on delete set null,
  period_from date not null,
  period_to date not null,
  result_contract_version integer not null default 2,
  purpose text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (period_to >= period_from),
  check ((scope_kind='personal' and business_id is null) or scope_kind='business')
);
create index if not exists idx_ai_financial_context_access_user_created
  on public.ai_financial_context_access_log(user_id,created_at desc);
create index if not exists idx_ai_financial_context_access_business_created
  on public.ai_financial_context_access_log(business_id,created_at desc)
  where business_id is not null;

alter table public.ai_financial_context_access_log enable row level security;
drop policy if exists ai_financial_context_access_log_select_own on public.ai_financial_context_access_log;
create policy ai_financial_context_access_log_select_own on public.ai_financial_context_access_log
  for select using ((select auth.uid())=user_id);
grant select on public.ai_financial_context_access_log to authenticated;

create or replace function public.get_ai_financial_context_v2(
  p_scope_kind text default 'personal',
  p_business_id uuid default null,
  p_from date default (current_date-30),
  p_to date default current_date,
  p_limit integer default 50,
  p_purpose text default 'assistant_query'
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_user uuid:=auth.uid();
  v_context jsonb;
  v_log_id uuid;
  v_scope text:=lower(btrim(coalesce(p_scope_kind,'personal')));
begin
  if v_user is null then raise exception 'authentication_required'; end if;
  if v_scope not in ('personal','business') then raise exception 'invalid_scope_kind'; end if;
  if p_to<p_from then raise exception 'invalid_date_range'; end if;
  if v_scope='personal' then p_business_id:=null; end if;
  if v_scope='business' and p_business_id is null then raise exception 'business_id_required'; end if;
  if v_scope='business' and not (
    private.user_is_business_owner(p_business_id,v_user)
    or private.user_is_active_business_member(p_business_id,v_user)
  ) then raise exception 'business_access_denied'; end if;

  v_context:=public.get_ai_financial_context_v1(v_scope,p_business_id,p_from,p_to,p_limit);

  insert into public.ai_financial_context_access_log(
    user_id,scope_kind,business_id,period_from,period_to,result_contract_version,purpose,metadata
  ) values (
    v_user,v_scope,p_business_id,p_from,p_to,2,left(nullif(btrim(coalesce(p_purpose,'')),''),120),
    jsonb_build_object('limit',greatest(1,least(coalesce(p_limit,50),200)))
  ) returning id into v_log_id;

  return jsonb_build_object(
    'contract_version',2,
    'access_log_id',v_log_id,
    'context',v_context
  );
end;
$function$;

revoke all on function public.get_ai_financial_context_v1(text,uuid,date,date,integer) from authenticated;
revoke all on function public.get_ai_financial_context_v2(text,uuid,date,date,integer,text) from public;
revoke all on function public.get_ai_financial_context_v2(text,uuid,date,date,integer,text) from anon;
grant execute on function public.get_ai_financial_context_v2(text,uuid,date,date,integer,text) to authenticated;

create or replace function public.get_my_account_center_v1()
returns jsonb
language plpgsql
security invoker
set search_path=public,pg_temp
as $function$
declare
  v_user uuid:=auth.uid();
  v_result jsonb;
begin
  if v_user is null then raise exception 'authentication_required'; end if;
  select jsonb_build_object(
    'profile',coalesce((select jsonb_build_object('id',p.id,'full_name',p.full_name,'phone',p.phone,'avatar_path',p.avatar_path,'status',p.status,'governorate',p.governorate,'profile_completed_at',p.profile_completed_at,'phone_verification_status',p.phone_verification_status,'phone_verified_at',p.phone_verified_at) from public.profiles p where p.id=v_user),'{}'::jsonb),
    'subscription',coalesce((select jsonb_build_object('plan_code',s.plan_code,'status',s.status,'current_period_start',s.current_period_start,'current_period_end',s.current_period_end) from public.user_subscriptions s where s.user_id=v_user order by s.created_at desc limit 1),'{}'::jsonb),
    'notifications',jsonb_build_object('unread',(select count(*) from public.notifications n where n.recipient_user_id=v_user and n.read_at is null and n.archived_at is null),'total_active',(select count(*) from public.notifications n where n.recipient_user_id=v_user and n.archived_at is null)),
    'devices',jsonb_build_object('active_push',(select count(*) from public.push_subscriptions d where d.user_id=v_user and d.is_active=true),'last_seen_at',(select max(d.last_seen_at) from public.push_subscriptions d where d.user_id=v_user and d.is_active=true)),
    'businesses',coalesce((select jsonb_agg(jsonb_build_object('id',b.id,'name',b.name,'slug',b.slug,'public_status',b.public_status,'verification_status',b.verification_status) order by b.created_at) from public.business_profiles b where b.owner_user_id=v_user),'[]'::jsonb),
    'finance',jsonb_build_object('active_accounts',(select count(*) from public.personal_finance_accounts a where a.user_id=v_user and a.status='active'),'active_budgets',(select count(*) from public.personal_finance_budgets b where b.user_id=v_user and b.status='active'),'active_goals',(select count(*) from public.personal_finance_goals g where g.user_id=v_user and g.status='active'),'open_obligations',(select count(*) from public.personal_finance_obligations o where o.user_id=v_user and o.status in ('open','partial'))),
    'financial_preferences',coalesce((select to_jsonb(fp)-'user_id' from public.user_financial_preferences fp where fp.user_id=v_user),jsonb_build_object('default_currency','YER','secondary_currency','SAR','locale','ar-YE','timezone','Asia/Aden','week_starts_on',6,'budget_alert_percent',80,'due_reminder_days',3,'ai_financial_insights_enabled',true)),
    'generated_at',now()
  ) into v_result;
  return v_result;
end;
$function$;

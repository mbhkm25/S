create table if not exists public.platform_admin_audit_log (
  id bigint generated always as identity primary key,
  actor_user_id uuid not null references public.profiles(id),
  action text not null,
  target_type text not null,
  target_id text,
  reason text,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now()
);

create index if not exists platform_admin_audit_log_created_at_idx
  on public.platform_admin_audit_log (created_at desc);

create index if not exists platform_admin_audit_log_actor_idx
  on public.platform_admin_audit_log (actor_user_id, created_at desc);

alter table public.platform_admin_audit_log enable row level security;
revoke all on table public.platform_admin_audit_log from public, anon, authenticated;
revoke all on sequence public.platform_admin_audit_log_id_seq from public, anon, authenticated;

create or replace function public.get_my_platform_admin_access()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  select jsonb_build_object(
    'allowed', public.is_platform_admin(auth.uid()),
    'role', coalesce((select p.global_role from public.profiles p where p.id = auth.uid()), 'user'),
    'status', coalesce((select p.status from public.profiles p where p.id = auth.uid()), 'missing')
  );
$function$;

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
      'pending_businesses', (select count(*) from public.business_profiles where public_status in ('draft', 'pending_review')),
      'active_subscriptions', (select count(*) from public.user_subscriptions where status = 'active' and (current_period_end is null or current_period_end > now())),
      'pending_payments', (select count(*) from public.pro_payment_requests where status in ('pending', 'processing', 'under_review')),
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
               b.submitted_for_review_at, b.reviewed_at, b.created_at,
               b.owner_user_id, p.full_name as owner_name, p.phone as owner_phone
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
               s.current_period_start, s.current_period_end, s.activated_by,
               s.created_at
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
               r.expected_amount, r.expected_currency, r.months,
               r.payment_network, r.transfer_reference, r.status,
               r.ai_confidence, r.failure_reason, r.approved_at,
               r.approved_by, r.created_at
        from public.pro_payment_requests r
        left join public.profiles p on p.id = r.user_id
        order by r.created_at desc
        limit v_limit
      ) x
    ), '[]'::jsonb),
    'plans', coalesce((
      select jsonb_agg(to_jsonb(p) order by p.monthly_price_yer)
      from public.subscription_plans p
    ), '[]'::jsonb),
    'public_information', (select to_jsonb(i) from public.app_public_information i where i.singleton = true),
    'audit_log', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.created_at desc)
      from (
        select a.id, a.action, a.target_type, a.target_id, a.reason,
               a.created_at, p.full_name as actor_name
        from public.platform_admin_audit_log a
        left join public.profiles p on p.id = a.actor_user_id
        order by a.created_at desc
        limit v_limit
      ) x
    ), '[]'::jsonb)
  );
end;
$function$;

create or replace function public.platform_admin_set_user_status(
  p_user_id uuid,
  p_status text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_before public.profiles%rowtype;
  v_after public.profiles%rowtype;
begin
  if not public.is_platform_admin(auth.uid()) then
    raise exception 'platform_admin_required' using errcode = '42501';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'cannot_change_own_status';
  end if;
  if p_status not in ('active', 'pending', 'disabled') then
    raise exception 'invalid_profile_status';
  end if;
  if length(trim(coalesce(p_reason, ''))) < 5 then
    raise exception 'admin_reason_required';
  end if;

  select * into v_before from public.profiles where id = p_user_id for update;
  if not found then raise exception 'profile_not_found'; end if;
  if v_before.global_role = 'platform_admin' then
    raise exception 'cannot_change_admin_status';
  end if;

  update public.profiles
  set status = p_status, updated_at = now()
  where id = p_user_id
  returning * into v_after;

  insert into public.platform_admin_audit_log
    (actor_user_id, action, target_type, target_id, reason, before_data, after_data)
  values
    (auth.uid(), 'user_status_changed', 'profile', p_user_id::text, trim(p_reason),
     jsonb_build_object('status', v_before.status), jsonb_build_object('status', v_after.status));

  return jsonb_build_object('ok', true, 'user_id', p_user_id, 'status', v_after.status);
end;
$function$;

create or replace function public.platform_admin_update_plan(
  p_code text,
  p_display_name text,
  p_description text,
  p_price_yer integer,
  p_access_limit integer,
  p_duration_days integer,
  p_currency_code text,
  p_features jsonb,
  p_permissions jsonb,
  p_is_active boolean,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_before public.subscription_plans%rowtype;
  v_after public.subscription_plans%rowtype;
begin
  if not public.is_platform_admin(auth.uid()) then
    raise exception 'platform_admin_required' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_reason, ''))) < 5 then raise exception 'admin_reason_required'; end if;
  if length(trim(coalesce(p_display_name, ''))) < 2 then raise exception 'invalid_plan_name'; end if;
  if p_price_yer < 0 or p_access_limit < 1 or p_duration_days < 1 then raise exception 'invalid_plan_values'; end if;
  if jsonb_typeof(p_features) <> 'array' then raise exception 'features_must_be_array'; end if;
  if jsonb_typeof(p_permissions) <> 'object' then raise exception 'permissions_must_be_object'; end if;

  select * into v_before from public.subscription_plans where code = p_code for update;
  if not found then raise exception 'plan_not_found'; end if;

  update public.subscription_plans
  set display_name = trim(p_display_name), description = nullif(trim(p_description), ''),
      monthly_price_yer = p_price_yer, monthly_access_limit = p_access_limit,
      billing_duration_days = p_duration_days, currency_code = upper(trim(p_currency_code)),
      features = p_features, permissions = p_permissions, is_active = p_is_active,
      updated_at = now()
  where code = p_code
  returning * into v_after;

  insert into public.platform_admin_audit_log
    (actor_user_id, action, target_type, target_id, reason, before_data, after_data)
  values
    (auth.uid(), 'subscription_plan_updated', 'subscription_plan', p_code, trim(p_reason),
     to_jsonb(v_before), to_jsonb(v_after));

  return jsonb_build_object('ok', true, 'plan', to_jsonb(v_after));
end;
$function$;

create or replace function public.platform_admin_update_public_information(
  p_payload jsonb,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_before public.app_public_information%rowtype;
  v_after public.app_public_information%rowtype;
begin
  if not public.is_platform_admin(auth.uid()) then
    raise exception 'platform_admin_required' using errcode = '42501';
  end if;
  if jsonb_typeof(p_payload) <> 'object' then raise exception 'invalid_payload'; end if;
  if length(trim(coalesce(p_reason, ''))) < 5 then raise exception 'admin_reason_required'; end if;

  select * into v_before from public.app_public_information where singleton = true for update;
  if not found then raise exception 'public_information_not_found'; end if;

  update public.app_public_information
  set support_whatsapp = coalesce(nullif(trim(p_payload->>'support_whatsapp'), ''), support_whatsapp),
      support_phone = coalesce(nullif(trim(p_payload->>'support_phone'), ''), support_phone),
      support_email = coalesce(nullif(trim(p_payload->>'support_email'), ''), support_email),
      support_website = coalesce(nullif(trim(p_payload->>'support_website'), ''), support_website),
      support_hours_text = coalesce(nullif(trim(p_payload->>'support_hours_text'), ''), support_hours_text),
      support_days_text = coalesce(nullif(trim(p_payload->>'support_days_text'), ''), support_days_text),
      support_response_time_text = coalesce(nullif(trim(p_payload->>'support_response_time_text'), ''), support_response_time_text),
      updated_at = now()
  where singleton = true
  returning * into v_after;

  insert into public.platform_admin_audit_log
    (actor_user_id, action, target_type, target_id, reason, before_data, after_data)
  values
    (auth.uid(), 'public_information_updated', 'app_public_information', 'singleton', trim(p_reason),
     to_jsonb(v_before), to_jsonb(v_after));

  return jsonb_build_object('ok', true, 'public_information', to_jsonb(v_after));
end;
$function$;

create or replace function public.platform_admin_set_business_review(
  p_business_id uuid,
  p_decision text,
  p_review_note text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_before public.business_profiles%rowtype;
  v_after public.business_profiles%rowtype;
begin
  if not public.is_platform_admin(auth.uid()) then
    raise exception 'platform_admin_required' using errcode = '42501';
  end if;
  if p_decision not in ('published', 'rejected', 'hidden', 'suspended') then raise exception 'invalid_review_decision'; end if;
  if length(trim(coalesce(p_reason, ''))) < 5 then raise exception 'admin_reason_required'; end if;

  select * into v_before from public.business_profiles where id = p_business_id for update;
  if not found then raise exception 'business_not_found'; end if;

  update public.business_profiles
  set public_status = p_decision,
      verification_status = case
        when p_decision = 'published' then 'verified'
        when p_decision = 'rejected' then 'rejected'
        else verification_status
      end,
      review_note = nullif(trim(p_review_note), ''), reviewed_at = now(),
      reviewed_by_user_id = auth.uid(), updated_at = now()
  where id = p_business_id
  returning * into v_after;

  insert into public.platform_admin_audit_log
    (actor_user_id, action, target_type, target_id, reason, before_data, after_data)
  values
    (auth.uid(), 'business_reviewed', 'business_profile', p_business_id::text, trim(p_reason),
     jsonb_build_object('public_status', v_before.public_status, 'verification_status', v_before.verification_status),
     jsonb_build_object('public_status', v_after.public_status, 'verification_status', v_after.verification_status));

  return jsonb_build_object('ok', true, 'business', to_jsonb(v_after));
end;
$function$;

revoke all on function public.get_my_platform_admin_access() from public, anon;
revoke all on function public.platform_admin_get_console_snapshot(integer) from public, anon;
revoke all on function public.platform_admin_set_user_status(uuid, text, text) from public, anon;
revoke all on function public.platform_admin_update_plan(text, text, text, integer, integer, integer, text, jsonb, jsonb, boolean, text) from public, anon;
revoke all on function public.platform_admin_update_public_information(jsonb, text) from public, anon;
revoke all on function public.platform_admin_set_business_review(uuid, text, text, text) from public, anon;

grant execute on function public.get_my_platform_admin_access() to authenticated;
grant execute on function public.platform_admin_get_console_snapshot(integer) to authenticated;
grant execute on function public.platform_admin_set_user_status(uuid, text, text) to authenticated;
grant execute on function public.platform_admin_update_plan(text, text, text, integer, integer, integer, text, jsonb, jsonb, boolean, text) to authenticated;
grant execute on function public.platform_admin_update_public_information(jsonb, text) to authenticated;
grant execute on function public.platform_admin_set_business_review(uuid, text, text, text) to authenticated;

begin;

alter table public.subscription_plans
  add column if not exists billing_duration_days integer not null default 30,
  add column if not exists currency_code text not null default 'YER',
  add column if not exists features jsonb not null default '[]'::jsonb,
  add column if not exists permissions jsonb not null default '{}'::jsonb;

alter table public.subscription_plans
  drop constraint if exists subscription_plans_billing_duration_days_check;
alter table public.subscription_plans
  add constraint subscription_plans_billing_duration_days_check
  check (billing_duration_days between 1 and 3660);

update public.subscription_plans
set
  billing_duration_days = 30,
  currency_code = 'YER',
  features = case code
    when 'sanad_pro' then jsonb_build_array(
      'الوصول إلى تفاصيل العمليات والتحقق منها',
      'شهادات التحقق المالي الرقمية',
      'إحصاءات الاستخدام وإدارة الاشتراك'
    )
    else jsonb_build_array('رصيد تأسيسي للتحقق من العمليات')
  end,
  permissions = case code
    when 'sanad_pro' then jsonb_build_object('operation_verification', true, 'verification_certificates', true, 'analytics', true)
    else jsonb_build_object('operation_verification', true, 'one_time_allowance', true)
  end,
  metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
    'quota_policy', case when code = 'free' then 'lifetime_once' else 'subscription_period' end,
    'unused_quota_rolls_over', false
  )
where code in ('free', 'sanad_pro');

alter table public.user_subscriptions
  drop constraint if exists user_subscriptions_status_check;
alter table public.user_subscriptions
  add constraint user_subscriptions_status_check
  check (status in ('scheduled','active','expired','cancelled'));

create or replace function public.get_sanad_pro_payment_options()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan public.subscription_plans%rowtype;
  v_accounts jsonb;
begin
  select * into v_plan
  from public.subscription_plans
  where code = 'sanad_pro' and is_active = true
  limit 1;

  if v_plan.code is null then
    return jsonb_build_object('ok', false, 'reason', 'plan_unavailable');
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', id, 'financial_entity', financial_entity,
    'account_number', account_number, 'account_holder_name', account_holder_name,
    'currency', currency, 'instructions', instructions, 'display_order', display_order
  ) order by display_order), '[]'::jsonb)
  into v_accounts
  from public.sanad_payment_accounts
  where status = 'active' and upper(currency) = upper(v_plan.currency_code);

  return jsonb_build_object(
    'ok', true,
    'plan', jsonb_build_object(
      'code', v_plan.code, 'name', v_plan.display_name,
      'description', v_plan.description,
      'price', v_plan.monthly_price_yer,
      'currency', v_plan.currency_code,
      'duration_days', v_plan.billing_duration_days,
      'access_limit', v_plan.monthly_access_limit,
      'features', v_plan.features,
      'permissions', v_plan.permissions,
      'metadata', v_plan.metadata
    ),
    'payment_accounts', v_accounts
  );
end;
$$;

create or replace function public.create_pro_payment_request(
  p_payment_account_id uuid,
  p_transfer_reference text default null,
  p_receipt_bucket text default null,
  p_receipt_path text default null,
  p_receipt_mime_type text default null,
  p_receipt_file_name text default null,
  p_receipt_file_size bigint default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_account public.sanad_payment_accounts%rowtype;
  v_plan public.subscription_plans%rowtype;
  v_request public.pro_payment_requests%rowtype;
begin
  if v_user_id is null then raise exception 'not_authenticated'; end if;
  if not public.sanad_user_has_basic_profile(v_user_id) then
    return jsonb_build_object('ok', false, 'reason', 'profile_incomplete');
  end if;

  select * into v_plan from public.subscription_plans
  where code = 'sanad_pro' and is_active = true limit 1;
  if v_plan.code is null then return jsonb_build_object('ok', false, 'reason', 'plan_unavailable'); end if;

  select * into v_account from public.sanad_payment_accounts
  where id = p_payment_account_id and status = 'active'
    and upper(currency) = upper(v_plan.currency_code) limit 1;
  if v_account.id is null then return jsonb_build_object('ok', false, 'reason', 'invalid_payment_account'); end if;

  if p_receipt_bucket is distinct from 'operation-files'
     or p_receipt_path is null
     or p_receipt_path !~ ('^pro-payment-receipts/' || v_user_id::text || '/[^/]+$') then
    return jsonb_build_object('ok', false, 'reason', 'invalid_receipt_path');
  end if;

  insert into public.pro_payment_requests(
    user_id, plan_code, payment_account_id, expected_amount, expected_currency,
    months, payment_network, transfer_reference, receipt_bucket, receipt_path,
    receipt_mime_type, receipt_file_name, receipt_file_size, status, metadata
  ) values (
    v_user_id, v_plan.code, v_account.id, v_plan.monthly_price_yer,
    v_plan.currency_code, 1, v_account.financial_entity,
    nullif(trim(coalesce(p_transfer_reference,'')), ''), p_receipt_bucket, p_receipt_path,
    p_receipt_mime_type, p_receipt_file_name, p_receipt_file_size, 'submitted',
    jsonb_build_object(
      'created_by','pwa', 'duration_days',v_plan.billing_duration_days,
      'access_limit',v_plan.monthly_access_limit, 'features',v_plan.features,
      'permissions',v_plan.permissions
    )
  ) returning * into v_request;

  return jsonb_build_object(
    'ok',true, 'payment_request_id',v_request.id, 'status',v_request.status,
    'expected_amount',v_request.expected_amount, 'expected_currency',v_request.expected_currency,
    'duration_days',(v_request.metadata->>'duration_days')::integer,
    'access_limit',(v_request.metadata->>'access_limit')::integer
  );
end;
$$;

create or replace function public.claim_my_pro_payment_verification(p_payment_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_status text;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select status into v_status from public.pro_payment_requests
  where id=p_payment_request_id and user_id=auth.uid() for update;
  if v_status is null then return jsonb_build_object('ok',false,'reason','payment_request_not_found'); end if;
  if v_status in ('approved','auto_approved','rejected','cancelled') then
    return jsonb_build_object('ok',true,'process',false,'status',v_status);
  end if;
  if v_status='processing' then return jsonb_build_object('ok',true,'process',false,'status',v_status); end if;
  update public.pro_payment_requests set status='processing',updated_at=now()
  where id=p_payment_request_id;
  return jsonb_build_object('ok',true,'process',true,'status','processing');
end;
$$;

create or replace function public.admin_mark_pro_payment_request_review(
  p_payment_request_id uuid, p_status text,
  p_ai_extracted_json jsonb default '{}'::jsonb, p_ai_confidence numeric default null,
  p_verification_checks jsonb default '{}'::jsonb, p_failure_reason text default null
)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_current text;
begin
  if current_user not in ('service_role','postgres') then raise exception 'forbidden'; end if;
  if p_status not in ('processing','pending_review','rejected','failed','cancelled') then raise exception 'invalid_status'; end if;
  select status into v_current from public.pro_payment_requests where id=p_payment_request_id for update;
  if v_current is null then return jsonb_build_object('ok',false,'reason','payment_request_not_found'); end if;
  if v_current in ('approved','auto_approved','rejected','cancelled') then
    return jsonb_build_object('ok',true,'ignored',true,'status',v_current);
  end if;
  update public.pro_payment_requests set status=p_status,
    ai_extracted_json=coalesce(p_ai_extracted_json,ai_extracted_json),
    ai_confidence=coalesce(p_ai_confidence,ai_confidence),
    verification_checks=coalesce(p_verification_checks,verification_checks),
    failure_reason=p_failure_reason,updated_at=now()
  where id=p_payment_request_id;
  return jsonb_build_object('ok',true,'payment_request_id',p_payment_request_id,'status',p_status);
end;
$$;

create or replace function public.admin_approve_pro_payment_request(
  p_payment_request_id uuid, p_approval_source text default 'auto',
  p_ai_extracted_json jsonb default '{}'::jsonb, p_ai_confidence numeric default null,
  p_verification_checks jsonb default '{}'::jsonb, p_note text default null
)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_request public.pro_payment_requests%rowtype;
  v_sub public.user_subscriptions%rowtype;
  v_start timestamptz; v_end timestamptz; v_days integer;
begin
  if current_user not in ('service_role','postgres') then raise exception 'forbidden'; end if;
  select * into v_request from public.pro_payment_requests where id=p_payment_request_id for update;
  if v_request.id is null then return jsonb_build_object('ok',false,'reason','payment_request_not_found'); end if;
  if v_request.status in ('approved','auto_approved') and v_request.subscription_id is not null then
    return jsonb_build_object('ok',true,'already_approved',true,'subscription_id',v_request.subscription_id);
  end if;
  if v_request.status in ('rejected','cancelled') then return jsonb_build_object('ok',false,'reason','terminal_status'); end if;

  v_days := greatest(coalesce((v_request.metadata->>'duration_days')::integer,30),1);
  select greatest(now(),coalesce(max(current_period_end),now())) into v_start
  from public.user_subscriptions
  where user_id=v_request.user_id and status in ('active','scheduled') and current_period_end>now();
  v_end := v_start + make_interval(days=>v_days);

  insert into public.user_subscriptions(user_id,plan_code,status,current_period_start,current_period_end,activated_by,metadata)
  values(v_request.user_id,v_request.plan_code,case when v_start>now()+interval '5 seconds' then 'scheduled' else 'active' end,
    v_start,v_end,coalesce(p_approval_source,'auto'),
    jsonb_build_object('payment_request_id',v_request.id,'duration_days',v_days,
      'access_limit',coalesce((v_request.metadata->>'access_limit')::integer,1000),'note',p_note))
  returning * into v_sub;

  update public.pro_payment_requests set
    status=case when coalesce(p_approval_source,'auto')='auto' then 'auto_approved' else 'approved' end,
    ai_extracted_json=coalesce(p_ai_extracted_json,'{}'::jsonb),ai_confidence=p_ai_confidence,
    verification_checks=coalesce(p_verification_checks,'{}'::jsonb),approved_at=now(),
    approved_by=coalesce(p_approval_source,'auto'),subscription_id=v_sub.id,failure_reason=null,updated_at=now()
  where id=v_request.id;
  return jsonb_build_object('ok',true,'subscription_id',v_sub.id,'status',v_sub.status,
    'current_period_start',v_start,'current_period_end',v_end);
end;
$$;

create or replace function public.get_my_subscription_center()
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid(); v_plan jsonb; v_subs jsonb; v_requests jsonb; v_usage jsonb;
begin
  if v_user is null then raise exception 'not_authenticated'; end if;
  update public.user_subscriptions set status='expired',updated_at=now()
    where user_id=v_user and status='active' and current_period_end<=now();
  update public.user_subscriptions set status='active',updated_at=now()
    where user_id=v_user and status='scheduled' and current_period_start<=now() and current_period_end>now();
  select public.get_my_operation_access_usage() into v_usage;
  select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'plan_code',s.plan_code,'plan_name',p.display_name,
    'status',s.status,'starts_at',s.current_period_start,'ends_at',s.current_period_end,
    'duration_days',coalesce((s.metadata->>'duration_days')::integer,p.billing_duration_days),
    'access_limit',coalesce((s.metadata->>'access_limit')::integer,p.monthly_access_limit)) order by s.current_period_start desc),'[]'::jsonb)
    into v_subs from public.user_subscriptions s join public.subscription_plans p on p.code=s.plan_code where s.user_id=v_user;
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'status',status,'amount',expected_amount,'currency',expected_currency,
    'created_at',created_at,'approved_at',approved_at,'failure_reason',failure_reason) order by created_at desc),'[]'::jsonb)
    into v_requests from public.pro_payment_requests where user_id=v_user;
  select jsonb_build_object('code',code,'name',display_name,'price',monthly_price_yer,'currency',currency_code,
    'duration_days',billing_duration_days,'access_limit',monthly_access_limit,'features',features,'permissions',permissions)
    into v_plan from public.subscription_plans where code='sanad_pro';
  return jsonb_build_object('usage',v_usage,'pro_plan',v_plan,'subscriptions',v_subs,'payment_requests',v_requests);
end;
$$;

create or replace function public.get_my_operation_access_usage()
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_user uuid:=auth.uid(); v_sub record; v_plan public.subscription_plans%rowtype;
  v_used integer:=0; v_limit integer:=0; v_start timestamptz; v_end timestamptz;
  v_is_pro boolean:=false;
begin
  if v_user is null then raise exception 'not_authenticated'; end if;
  select s.id,s.plan_code,s.current_period_start,s.current_period_end,s.metadata
    into v_sub from public.user_subscriptions s
    where s.user_id=v_user and s.status in ('active','scheduled')
      and s.current_period_start<=now() and s.current_period_end>now()
    order by s.current_period_start desc limit 1;
  if v_sub.id is not null then
    select * into v_plan from public.subscription_plans where code=v_sub.plan_code and is_active=true;
    v_is_pro:=true; v_start:=v_sub.current_period_start; v_end:=v_sub.current_period_end;
    v_limit:=coalesce((v_sub.metadata->>'access_limit')::integer,v_plan.monthly_access_limit);
    select count(*) into v_used from public.operation_access_logs
      where user_id=v_user and created_at>=v_start and created_at<v_end;
  else
    select * into v_plan from public.subscription_plans where code='free' limit 1;
    v_limit:=v_plan.monthly_access_limit;
    select count(*) into v_used from public.operation_access_logs where user_id=v_user;
  end if;
  return jsonb_build_object(
    'authenticated',true,'basic_profile_complete',public.sanad_user_has_basic_profile(v_user),
    'used',v_used,'limit',v_limit,'remaining',greatest(v_limit-v_used,0),
    'requires_subscription',(not v_is_pro and v_used>=v_limit),
    'period_start',v_start,'period_end',v_end,
    'quota_policy',case when v_is_pro then 'subscription_period' else 'lifetime_once' end,
    'plan',jsonb_build_object('code',v_plan.code,'name',v_plan.display_name,'is_pro',v_is_pro,
      'price',v_plan.monthly_price_yer,'currency',v_plan.currency_code,
      'duration_days',v_plan.billing_duration_days,'access_limit',v_limit,
      'features',v_plan.features,'permissions',v_plan.permissions)
  );
end;
$$;

alter function public.open_operation_access(uuid,text) rename to sanad_open_operation_access_legacy;

create or replace function public.open_operation_access(p_public_token uuid,p_source text default 'link')
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_user uuid:=auth.uid(); v_operation uuid; v_existing boolean:=false;
  v_usage jsonb; v_result jsonb;
begin
  if v_user is null then return jsonb_build_object('allowed',false,'reason','not_authenticated','requires_auth',true); end if;
  select id into v_operation from public.operations where public_token=p_public_token limit 1;
  if v_operation is not null then
    select exists(select 1 from public.operation_access_logs where user_id=v_user and operation_id=v_operation)
      into v_existing;
  end if;
  v_usage:=public.get_my_operation_access_usage();
  if not v_existing and coalesce((v_usage->>'remaining')::integer,0)<=0 then
    return jsonb_build_object('allowed',false,'reason','access_limit_reached','requires_subscription',true,'usage',v_usage);
  end if;
  v_result:=public.sanad_open_operation_access_legacy(p_public_token,p_source);
  return jsonb_set(v_result,'{usage}',public.get_my_operation_access_usage(),true);
end;
$$;

grant execute on function public.claim_my_pro_payment_verification(uuid) to authenticated;
grant execute on function public.get_my_subscription_center() to authenticated;
grant execute on function public.get_my_operation_access_usage() to authenticated;
grant execute on function public.open_operation_access(uuid,text) to authenticated;
revoke all on function public.sanad_open_operation_access_legacy(uuid,text) from public,anon,authenticated;
grant execute on function public.sanad_open_operation_access_legacy(uuid,text) to service_role;
revoke all on function public.claim_my_pro_payment_verification(uuid) from public,anon;
revoke all on function public.get_my_subscription_center() from public,anon;
revoke all on function public.admin_mark_pro_payment_request_review(uuid,text,jsonb,numeric,jsonb,text) from public,anon,authenticated;
revoke all on function public.admin_approve_pro_payment_request(uuid,text,jsonb,numeric,jsonb,text) from public,anon,authenticated;
grant execute on function public.admin_mark_pro_payment_request_review(uuid,text,jsonb,numeric,jsonb,text) to service_role;
grant execute on function public.admin_approve_pro_payment_request(uuid,text,jsonb,numeric,jsonb,text) to service_role;

notify pgrst,'reload schema';
commit;

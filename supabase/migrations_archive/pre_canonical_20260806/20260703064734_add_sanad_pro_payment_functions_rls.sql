begin;

create or replace function public.sanad_payment_requests_before_write()
returns trigger
language plpgsql
as $$
begin
  new.transfer_reference := nullif(trim(coalesce(new.transfer_reference, '')), '');
  new.expected_currency := upper(nullif(trim(coalesce(new.expected_currency, 'YER')), ''));
  new.payment_network := nullif(trim(coalesce(new.payment_network, 'local_transfer')), '');
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_pro_payment_requests_before_write on public.pro_payment_requests;
create trigger trg_pro_payment_requests_before_write
before insert or update on public.pro_payment_requests
for each row
execute function public.sanad_payment_requests_before_write();

drop trigger if exists trg_sanad_payment_accounts_updated_at on public.sanad_payment_accounts;
create trigger trg_sanad_payment_accounts_updated_at
before update on public.sanad_payment_accounts
for each row
execute function public.set_updated_at();

create or replace function public.get_sanad_pro_payment_options()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan record;
  v_accounts jsonb;
begin
  select code, display_name, monthly_price_yer, monthly_access_limit
  into v_plan
  from public.subscription_plans
  where code = 'sanad_pro' and is_active = true
  limit 1;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', id,
    'financial_entity', financial_entity,
    'account_number', account_number,
    'account_holder_name', account_holder_name,
    'currency', currency,
    'instructions', instructions,
    'display_order', display_order
  ) order by display_order), '[]'::jsonb)
  into v_accounts
  from public.sanad_payment_accounts
  where status = 'active';

  return jsonb_build_object(
    'plan', jsonb_build_object(
      'code', coalesce(v_plan.code, 'sanad_pro'),
      'name', coalesce(v_plan.display_name, 'سند Pro'),
      'monthly_price_yer', coalesce(v_plan.monthly_price_yer, 3500),
      'monthly_access_limit', coalesce(v_plan.monthly_access_limit, 1000),
      'months', 1
    ),
    'payment_accounts', v_accounts
  );
end;
$$;

create or replace function public.create_pro_payment_request(
  p_payment_account_id uuid,
  p_transfer_reference text,
  p_receipt_bucket text default null,
  p_receipt_path text default null,
  p_receipt_mime_type text default null,
  p_receipt_file_name text default null,
  p_receipt_file_size bigint default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_account record;
  v_request public.pro_payment_requests;
  v_ref text;
begin
  if v_user_id is null then
    raise exception 'not_authenticated';
  end if;

  if not public.sanad_user_has_basic_profile(v_user_id) then
    return jsonb_build_object('ok', false, 'reason', 'profile_incomplete');
  end if;

  v_ref := nullif(trim(coalesce(p_transfer_reference, '')), '');
  if v_ref is null then
    return jsonb_build_object('ok', false, 'reason', 'missing_transfer_reference');
  end if;

  select * into v_account
  from public.sanad_payment_accounts
  where id = p_payment_account_id and status = 'active'
  limit 1;

  if v_account.id is null then
    return jsonb_build_object('ok', false, 'reason', 'invalid_payment_account');
  end if;

  insert into public.pro_payment_requests (
    user_id,
    plan_code,
    payment_account_id,
    expected_amount,
    expected_currency,
    months,
    payment_network,
    transfer_reference,
    receipt_bucket,
    receipt_path,
    receipt_mime_type,
    receipt_file_name,
    receipt_file_size,
    status,
    metadata
  ) values (
    v_user_id,
    'sanad_pro',
    v_account.id,
    3500,
    'YER',
    1,
    v_account.financial_entity,
    v_ref,
    p_receipt_bucket,
    p_receipt_path,
    p_receipt_mime_type,
    p_receipt_file_name,
    p_receipt_file_size,
    'submitted',
    jsonb_build_object('created_by', 'pwa')
  )
  returning * into v_request;

  return jsonb_build_object(
    'ok', true,
    'payment_request_id', v_request.id,
    'status', v_request.status,
    'expected_amount', v_request.expected_amount,
    'expected_currency', v_request.expected_currency,
    'transfer_reference', v_request.transfer_reference
  );
exception
  when unique_violation then
    return jsonb_build_object('ok', false, 'reason', 'duplicate_transfer_reference');
end;
$$;

create or replace function public.admin_approve_pro_payment_request(
  p_payment_request_id uuid,
  p_approval_source text default 'auto',
  p_ai_extracted_json jsonb default '{}'::jsonb,
  p_ai_confidence numeric default null,
  p_verification_checks jsonb default '{}'::jsonb,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.pro_payment_requests;
  v_sub public.user_subscriptions;
begin
  if auth.role() <> 'service_role' then
    raise exception 'forbidden';
  end if;

  select * into v_request
  from public.pro_payment_requests
  where id = p_payment_request_id
  for update;

  if v_request.id is null then
    return jsonb_build_object('ok', false, 'reason', 'payment_request_not_found');
  end if;

  if v_request.status in ('approved', 'auto_approved') and v_request.subscription_id is not null then
    return jsonb_build_object('ok', true, 'already_approved', true, 'subscription_id', v_request.subscription_id);
  end if;

  update public.user_subscriptions
  set status = 'expired', updated_at = now()
  where user_id = v_request.user_id and status = 'active';

  insert into public.user_subscriptions (
    user_id,
    plan_code,
    status,
    current_period_start,
    current_period_end,
    activated_by,
    metadata
  ) values (
    v_request.user_id,
    'sanad_pro',
    'active',
    now(),
    now() + make_interval(months => greatest(coalesce(v_request.months, 1), 1)),
    coalesce(p_approval_source, 'auto'),
    jsonb_build_object('payment_request_id', v_request.id, 'transfer_reference', v_request.transfer_reference, 'note', p_note)
  ) returning * into v_sub;

  update public.pro_payment_requests
  set
    status = case when coalesce(p_approval_source, 'auto') = 'auto' then 'auto_approved' else 'approved' end,
    ai_extracted_json = coalesce(p_ai_extracted_json, '{}'::jsonb),
    ai_confidence = p_ai_confidence,
    verification_checks = coalesce(p_verification_checks, '{}'::jsonb),
    approved_at = now(),
    approved_by = coalesce(p_approval_source, 'auto'),
    subscription_id = v_sub.id,
    failure_reason = null,
    updated_at = now()
  where id = v_request.id;

  return jsonb_build_object(
    'ok', true,
    'payment_request_id', v_request.id,
    'subscription_id', v_sub.id,
    'current_period_end', v_sub.current_period_end
  );
end;
$$;

commit;;

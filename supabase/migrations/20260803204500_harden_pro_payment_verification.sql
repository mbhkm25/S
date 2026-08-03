begin;

alter table public.pro_payment_requests
  add column if not exists receipt_sha256 text,
  add column if not exists payment_fingerprint text,
  add column if not exists review_notified_at timestamptz,
  add column if not exists review_notification_reason text;

alter table public.pro_payment_requests
  drop constraint if exists pro_payment_requests_receipt_sha256_format;

alter table public.pro_payment_requests
  add constraint pro_payment_requests_receipt_sha256_format
  check (receipt_sha256 is null or receipt_sha256 ~ '^[a-f0-9]{64}$');

create index if not exists idx_pro_payment_requests_receipt_sha256
  on public.pro_payment_requests (receipt_sha256)
  where receipt_sha256 is not null;

create index if not exists idx_pro_payment_requests_payment_fingerprint
  on public.pro_payment_requests (payment_fingerprint)
  where payment_fingerprint is not null;

update public.sanad_payment_accounts
set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'verification_entity', 'Haseb',
      'verification_holder', 'Bahakem for Honey',
      'verification_entity_aliases', jsonb_build_array('Haseb', 'حاسب', 'الكريمي حاسب'),
      'verification_holder_aliases', jsonb_build_array('Bahakem for Honey', 'باحكم للعسل')
    ),
    updated_at = now()
where account_number = '825121';

drop function if exists public.create_pro_payment_request(
  uuid, text, text, text, text, text, bigint
);

create or replace function public.create_pro_payment_request(
  p_payment_account_id uuid,
  p_transfer_reference text default null,
  p_receipt_bucket text default null,
  p_receipt_path text default null,
  p_receipt_mime_type text default null,
  p_receipt_file_name text default null,
  p_receipt_file_size bigint default null,
  p_receipt_sha256 text default null
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
  v_hash text := lower(nullif(trim(coalesce(p_receipt_sha256, '')), ''));
  v_duplicate record;
begin
  if v_user_id is null then raise exception 'not_authenticated'; end if;

  if not public.sanad_user_has_basic_profile(v_user_id) then
    return jsonb_build_object('ok', false, 'reason', 'profile_incomplete');
  end if;

  if v_hash is null or v_hash !~ '^[a-f0-9]{64}$' then
    return jsonb_build_object('ok', false, 'reason', 'invalid_receipt_fingerprint');
  end if;

  select id, user_id, status
    into v_duplicate
  from public.pro_payment_requests
  where receipt_sha256 = v_hash
    and status <> 'cancelled'
  order by created_at desc
  limit 1;

  if v_duplicate.id is not null then
    return jsonb_build_object(
      'ok', false,
      'reason', 'duplicate_receipt',
      'duplicate_scope', case when v_duplicate.user_id = v_user_id then 'same_user' else 'another_user' end
    );
  end if;

  select * into v_plan
  from public.subscription_plans
  where code = 'sanad_pro' and is_active = true
  limit 1 for share;

  if v_plan.code is null then
    return jsonb_build_object('ok', false, 'reason', 'plan_unavailable');
  end if;

  select * into v_account
  from public.sanad_payment_accounts
  where id = p_payment_account_id
    and status = 'active'
    and upper(currency) = upper(v_plan.currency_code)
  limit 1;

  if v_account.id is null then
    return jsonb_build_object('ok', false, 'reason', 'invalid_payment_account');
  end if;

  if p_receipt_bucket is distinct from 'operation-files'
     or p_receipt_path is null
     or p_receipt_path !~ ('^pro-payment-receipts/' || v_user_id::text || '/[^/]+$') then
    return jsonb_build_object('ok', false, 'reason', 'invalid_receipt_path');
  end if;

  insert into public.pro_payment_requests(
    user_id, plan_code, payment_account_id, expected_amount, expected_currency,
    months, payment_network, transfer_reference, receipt_bucket, receipt_path,
    receipt_mime_type, receipt_file_name, receipt_file_size, receipt_sha256,
    status, metadata, purchase_scope, beneficiary_count, unit_amount
  ) values (
    v_user_id, v_plan.code, v_account.id, v_plan.monthly_price_yer,
    v_plan.currency_code, 1, v_account.financial_entity,
    nullif(trim(coalesce(p_transfer_reference, '')), ''), p_receipt_bucket, p_receipt_path,
    p_receipt_mime_type, p_receipt_file_name, p_receipt_file_size, v_hash,
    'submitted',
    jsonb_build_object(
      'created_by', 'pwa',
      'duration_days', v_plan.billing_duration_days,
      'access_limit', v_plan.monthly_access_limit,
      'features', v_plan.features,
      'permissions', v_plan.permissions,
      'beneficiary_count', 1,
      'unit_amount', v_plan.monthly_price_yer,
      'confirmed_payment_account_id', v_account.id,
      'confirmed_payment_account_number', v_account.account_number,
      'confirmed_payment_entity', v_account.financial_entity,
      'receipt_sha256_source', 'client_webcrypto'
    ),
    'self', 1, v_plan.monthly_price_yer
  ) returning * into v_request;

  insert into public.pro_payment_request_items(
    payment_request_id, beneficiary_user_id, plan_code, unit_amount, currency_code,
    duration_days, access_limit, features, permissions, metadata
  ) values (
    v_request.id, v_user_id, v_plan.code, v_plan.monthly_price_yer, v_plan.currency_code,
    v_plan.billing_duration_days, v_plan.monthly_access_limit,
    v_plan.features, v_plan.permissions, jsonb_build_object('self_purchase', true)
  );

  return jsonb_build_object(
    'ok', true,
    'payment_request_id', v_request.id,
    'status', v_request.status,
    'purchase_scope', v_request.purchase_scope,
    'beneficiary_count', 1,
    'unit_amount', v_plan.monthly_price_yer,
    'expected_amount', v_request.expected_amount,
    'expected_currency', v_request.expected_currency,
    'duration_days', v_plan.billing_duration_days,
    'access_limit', v_plan.monthly_access_limit,
    'confirmed_payment_account_id', v_account.id,
    'confirmed_payment_account_number', v_account.account_number,
    'confirmed_payment_entity', v_account.financial_entity
  );
end;
$$;

grant execute on function public.create_pro_payment_request(uuid,text,text,text,text,text,bigint,text)
  to authenticated, service_role;

create or replace function public.admin_set_pro_payment_transfer_reference(
  p_payment_request_id uuid,
  p_transfer_reference text,
  p_ai_extracted_json jsonb default '{}'::jsonb,
  p_ai_confidence numeric default null,
  p_payment_fingerprint text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ref text;
  v_fingerprint text := lower(nullif(trim(coalesce(p_payment_fingerprint, '')), ''));
  v_duplicate record;
begin
  if auth.role() <> 'service_role' then raise exception 'forbidden'; end if;

  v_ref := nullif(regexp_replace(lower(trim(coalesce(p_transfer_reference, ''))), '\s+', '', 'g'), '');
  if v_ref is null then
    return jsonb_build_object('ok', false, 'reason', 'missing_transfer_reference');
  end if;

  select id, user_id
    into v_duplicate
  from public.pro_payment_requests
  where id <> p_payment_request_id
    and status <> 'cancelled'
    and (
      lower(regexp_replace(coalesce(transfer_reference, ''), '\s+', '', 'g')) = v_ref
      or (v_fingerprint is not null and payment_fingerprint = v_fingerprint)
    )
  limit 1;

  if v_duplicate.id is not null then
    return jsonb_build_object(
      'ok', false,
      'reason', 'duplicate_payment_evidence',
      'duplicate_request_id', v_duplicate.id
    );
  end if;

  update public.pro_payment_requests
  set transfer_reference = upper(v_ref),
      payment_fingerprint = v_fingerprint,
      ai_extracted_json = coalesce(p_ai_extracted_json, ai_extracted_json),
      ai_confidence = coalesce(p_ai_confidence, ai_confidence),
      metadata = metadata || jsonb_build_object(
        'transfer_reference_source', 'ai_extracted',
        'duplicate_checks_completed', true
      ),
      updated_at = now()
  where id = p_payment_request_id;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'payment_request_not_found');
  end if;

  return jsonb_build_object(
    'ok', true,
    'payment_request_id', p_payment_request_id,
    'transfer_reference', upper(v_ref),
    'payment_fingerprint', v_fingerprint
  );
end;
$$;

grant execute on function public.admin_set_pro_payment_transfer_reference(uuid,text,jsonb,numeric,text)
  to service_role;

create or replace function public.admin_get_pro_payment_request_payload(p_payment_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request record;
  v_items jsonb;
begin
  if auth.role() <> 'service_role' then raise exception 'forbidden'; end if;

  select request.*, profile.full_name as user_full_name, profile.phone as user_phone,
    profile.governorate as user_governorate,
    coalesce(account.metadata->>'verification_entity', account.financial_entity) as expected_financial_entity,
    account.account_number as expected_account_number,
    coalesce(account.metadata->>'verification_holder', account.account_holder_name) as expected_account_holder_name,
    account.currency as expected_account_currency,
    account.metadata as expected_account_metadata,
    business.name as business_name
  into v_request
  from public.pro_payment_requests request
  left join public.profiles profile on profile.id = request.user_id
  left join public.sanad_payment_accounts account on account.id = request.payment_account_id
  left join public.business_profiles business on business.id = request.business_id
  where request.id = p_payment_request_id
  limit 1;

  if v_request.id is null then
    return jsonb_build_object('ok', false, 'reason', 'payment_request_not_found');
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', item.id,
    'beneficiary_user_id', item.beneficiary_user_id,
    'full_name', profile.full_name,
    'phone', profile.phone,
    'plan_code', item.plan_code,
    'unit_amount', item.unit_amount,
    'currency_code', item.currency_code,
    'duration_days', item.duration_days,
    'access_limit', item.access_limit,
    'status', item.status,
    'subscription_id', item.subscription_id
  ) order by item.created_at), '[]'::jsonb)
  into v_items
  from public.pro_payment_request_items item
  join public.profiles profile on profile.id = item.beneficiary_user_id
  where item.payment_request_id = p_payment_request_id;

  return jsonb_build_object(
    'ok', true,
    'payment_request', jsonb_build_object(
      'id', v_request.id,
      'user_id', v_request.user_id,
      'user_full_name', v_request.user_full_name,
      'user_phone', v_request.user_phone,
      'user_governorate', v_request.user_governorate,
      'plan_code', v_request.plan_code,
      'expected_amount', v_request.expected_amount,
      'expected_currency', v_request.expected_currency,
      'months', v_request.months,
      'payment_network', v_request.payment_network,
      'transfer_reference', v_request.transfer_reference,
      'receipt_bucket', v_request.receipt_bucket,
      'receipt_path', v_request.receipt_path,
      'receipt_mime_type', v_request.receipt_mime_type,
      'receipt_file_name', v_request.receipt_file_name,
      'receipt_file_size', v_request.receipt_file_size,
      'receipt_sha256', v_request.receipt_sha256,
      'status', v_request.status,
      'created_at', v_request.created_at,
      'purchase_scope', v_request.purchase_scope,
      'business_id', v_request.business_id,
      'business_name', v_request.business_name,
      'beneficiary_count', v_request.beneficiary_count,
      'unit_amount', v_request.unit_amount
    ),
    'beneficiaries', v_items,
    'expected_receiver', jsonb_build_object(
      'financial_entity', v_request.expected_financial_entity,
      'account_number', v_request.expected_account_number,
      'account_holder_name', v_request.expected_account_holder_name,
      'currency', v_request.expected_account_currency,
      'metadata', v_request.expected_account_metadata
    )
  );
end;
$$;

grant execute on function public.admin_get_pro_payment_request_payload(uuid) to service_role;

commit;

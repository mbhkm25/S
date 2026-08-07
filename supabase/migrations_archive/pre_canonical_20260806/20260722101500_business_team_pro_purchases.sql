-- Business team activity and multi-beneficiary SANAD Pro purchases.
-- The database is authoritative for plan price, duration, limits, and permissions.

alter table public.pro_payment_requests
  add column if not exists purchase_scope text not null default 'self',
  add column if not exists business_id uuid references public.business_profiles(id) on delete set null,
  add column if not exists beneficiary_count integer not null default 1,
  add column if not exists unit_amount numeric;

update public.pro_payment_requests
set unit_amount = expected_amount
where unit_amount is null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'pro_payment_requests_purchase_scope_check'
      and conrelid = 'public.pro_payment_requests'::regclass
  ) then
    alter table public.pro_payment_requests
      add constraint pro_payment_requests_purchase_scope_check
      check (purchase_scope in ('self', 'business_team'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'pro_payment_requests_beneficiary_count_check'
      and conrelid = 'public.pro_payment_requests'::regclass
  ) then
    alter table public.pro_payment_requests
      add constraint pro_payment_requests_beneficiary_count_check
      check (beneficiary_count between 1 and 50);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'pro_payment_requests_unit_amount_check'
      and conrelid = 'public.pro_payment_requests'::regclass
  ) then
    alter table public.pro_payment_requests
      add constraint pro_payment_requests_unit_amount_check
      check (unit_amount is null or unit_amount >= 0);
  end if;
end;
$$;

create index if not exists idx_pro_payment_requests_business_created
  on public.pro_payment_requests (business_id, created_at desc)
  where business_id is not null;

create table if not exists public.pro_payment_request_items (
  id uuid primary key default gen_random_uuid(),
  payment_request_id uuid not null references public.pro_payment_requests(id) on delete cascade,
  beneficiary_user_id uuid not null references public.profiles(id) on delete restrict,
  business_id uuid references public.business_profiles(id) on delete set null,
  plan_code text not null references public.subscription_plans(code),
  unit_amount numeric not null check (unit_amount >= 0),
  currency_code text not null,
  duration_days integer not null check (duration_days between 1 and 3660),
  access_limit integer not null check (access_limit > 0),
  features jsonb not null default '[]'::jsonb check (jsonb_typeof(features) = 'array'),
  permissions jsonb not null default '{}'::jsonb check (jsonb_typeof(permissions) = 'object'),
  status text not null default 'pending'
    check (status in ('pending', 'active', 'scheduled', 'failed', 'cancelled')),
  subscription_id uuid references public.user_subscriptions(id) on delete set null,
  failure_reason text,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (payment_request_id, beneficiary_user_id)
);

create index if not exists idx_pro_payment_request_items_beneficiary
  on public.pro_payment_request_items (beneficiary_user_id, created_at desc);
create index if not exists idx_pro_payment_request_items_business
  on public.pro_payment_request_items (business_id, created_at desc)
  where business_id is not null;
create index if not exists idx_pro_payment_request_items_subscription
  on public.pro_payment_request_items (subscription_id)
  where subscription_id is not null;

alter table public.pro_payment_request_items enable row level security;
revoke all on table public.pro_payment_request_items from public, anon, authenticated;

drop policy if exists pro_payment_request_items_select_participant
  on public.pro_payment_request_items;
create policy pro_payment_request_items_select_participant
  on public.pro_payment_request_items
  for select
  to authenticated
  using (
    beneficiary_user_id = (select auth.uid())
    or exists (
      select 1
      from public.pro_payment_requests request
      where request.id = pro_payment_request_items.payment_request_id
        and request.user_id = (select auth.uid())
    )
    or public.is_platform_admin((select auth.uid()))
  );

grant select on table public.pro_payment_request_items to authenticated;

create or replace function public.get_business_team_member_operations(
  p_business_id uuid,
  p_member_user_id uuid,
  p_activity_type text default 'all',
  p_limit integer default 30,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_limit integer := greatest(1, least(coalesce(p_limit, 30), 100));
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_items jsonb;
  v_member jsonb;
  v_linked_count integer;
  v_verified_count integer;
  v_last_activity timestamptz;
begin
  if v_user_id is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if p_activity_type not in ('all', 'linked', 'verified') then raise exception 'invalid_activity_type'; end if;

  if not exists (
    select 1 from public.business_profiles business
    where business.id = p_business_id
      and (business.owner_user_id = v_user_id or public.is_platform_admin(v_user_id))
  ) then
    raise exception 'business_owner_required' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'membership_id', member.id,
    'user_id', member.user_id,
    'status', member.status,
    'job_title', coalesce(member.job_title, member.label),
    'full_name', profile.full_name,
    'phone', profile.phone,
    'joined_at', member.created_at
  ) into v_member
  from public.business_team_members member
  join public.profiles profile on profile.id = member.user_id
  where member.business_id = p_business_id
    and member.user_id = p_member_user_id
    and member.status <> 'removed';

  if v_member is null then raise exception 'team_member_not_found'; end if;

  select
    count(*) filter (where link.linked_by_user_id = p_member_user_id)::integer,
    count(*) filter (where link.verified_by_user_id = p_member_user_id)::integer,
    max(link.created_at) filter (
      where link.linked_by_user_id = p_member_user_id
         or link.verified_by_user_id = p_member_user_id
    )
  into v_linked_count, v_verified_count, v_last_activity
  from public.business_operation_links link
  where link.business_id = p_business_id
    and link.status = 'linked';

  select coalesce(jsonb_agg(jsonb_build_object(
    'link_id', item.link_id,
    'activity_type', item.activity_type,
    'linked_at', item.linked_at,
    'linked_by_user_id', item.linked_by_user_id,
    'verified_by_user_id', item.verified_by_user_id,
    'operation', jsonb_build_object(
      'id', item.operation_id,
      'public_token', item.public_token,
      'created_at', item.operation_created_at,
      'status', item.operation_status,
      'ai_status', item.ai_status,
      'summary', item.summary,
      'financial_entity', item.financial_entity,
      'transaction_type', item.transaction_type,
      'amount', item.amount,
      'currency', item.currency,
      'reference_number', item.reference_number,
      'transaction_datetime', item.transaction_datetime
    )
  ) order by item.linked_at desc), '[]'::jsonb)
  into v_items
  from (
    select
      link.id as link_id,
      case
        when link.linked_by_user_id = p_member_user_id
         and link.verified_by_user_id = p_member_user_id then 'linked_and_verified'
        when link.linked_by_user_id = p_member_user_id then 'linked'
        else 'verified'
      end as activity_type,
      link.created_at as linked_at,
      link.linked_by_user_id,
      link.verified_by_user_id,
      operation.id as operation_id,
      operation.public_token,
      operation.created_at as operation_created_at,
      operation.status as operation_status,
      operation.ai_status,
      operation.summary,
      operation.financial_entity,
      operation.transaction_type,
      operation.amount,
      operation.currency,
      operation.reference_number,
      operation.transaction_datetime
    from public.business_operation_links link
    join public.operations operation on operation.id = link.operation_id
    where link.business_id = p_business_id
      and link.status = 'linked'
      and (
        (p_activity_type = 'all' and (
          link.linked_by_user_id = p_member_user_id
          or link.verified_by_user_id = p_member_user_id
        ))
        or (p_activity_type = 'linked' and link.linked_by_user_id = p_member_user_id)
        or (p_activity_type = 'verified' and link.verified_by_user_id = p_member_user_id)
      )
    order by link.created_at desc
    limit v_limit offset v_offset
  ) item;

  return jsonb_build_object(
    'member', v_member,
    'summary', jsonb_build_object(
      'linked_count', coalesce(v_linked_count, 0),
      'verified_count', coalesce(v_verified_count, 0),
      'last_activity_at', v_last_activity
    ),
    'items', v_items,
    'limit', v_limit,
    'offset', v_offset
  );
end;
$function$;

create or replace function public.get_business_team_pro_purchase_options(p_business_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_plan public.subscription_plans%rowtype;
  v_business public.business_profiles%rowtype;
  v_members jsonb;
  v_accounts jsonb;
begin
  if v_user_id is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  select * into v_business from public.business_profiles
  where id = p_business_id and owner_user_id = v_user_id;
  if not found then raise exception 'business_owner_required' using errcode = '42501'; end if;

  select * into v_plan from public.subscription_plans
  where code = 'sanad_pro' and is_active = true limit 1;
  if not found then return jsonb_build_object('ok', false, 'reason', 'plan_unavailable'); end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'user_id', member.user_id,
    'membership_id', member.id,
    'full_name', profile.full_name,
    'phone', profile.phone,
    'job_title', coalesce(member.job_title, member.label),
    'membership_status', member.status,
    'subscription', case when subscription.id is null then null else jsonb_build_object(
      'id', subscription.id,
      'status', subscription.status,
      'current_period_start', subscription.current_period_start,
      'current_period_end', subscription.current_period_end
    ) end
  ) order by member.created_at), '[]'::jsonb)
  into v_members
  from public.business_team_members member
  join public.profiles profile on profile.id = member.user_id and profile.status = 'active'
  left join lateral (
    select sub.* from public.user_subscriptions sub
    where sub.user_id = member.user_id
      and sub.plan_code = v_plan.code
      and sub.status in ('active', 'scheduled')
      and sub.current_period_end > now()
    order by sub.current_period_end desc limit 1
  ) subscription on true
  where member.business_id = p_business_id and member.status = 'active';

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', account.id,
    'financial_entity', account.financial_entity,
    'account_number', account.account_number,
    'account_holder_name', account.account_holder_name,
    'currency', account.currency,
    'instructions', account.instructions,
    'display_order', account.display_order
  ) order by account.display_order, account.created_at), '[]'::jsonb)
  into v_accounts
  from public.sanad_payment_accounts account
  where account.status = 'active'
    and upper(account.currency) = upper(v_plan.currency_code);

  return jsonb_build_object(
    'ok', true,
    'business', jsonb_build_object('id', v_business.id, 'name', v_business.name),
    'plan', jsonb_build_object(
      'code', v_plan.code,
      'display_name', v_plan.display_name,
      'description', v_plan.description,
      'unit_amount', v_plan.monthly_price_yer,
      'currency', v_plan.currency_code,
      'duration_days', v_plan.billing_duration_days,
      'access_limit', v_plan.monthly_access_limit,
      'features', v_plan.features,
      'permissions', v_plan.permissions
    ),
    'members', v_members,
    'payment_accounts', v_accounts,
    'max_beneficiaries', 50
  );
end;
$function$;

create or replace function public.create_team_pro_payment_request(
  p_business_id uuid,
  p_beneficiary_user_ids uuid[],
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
as $function$
declare
  v_user_id uuid := auth.uid();
  v_business public.business_profiles%rowtype;
  v_account public.sanad_payment_accounts%rowtype;
  v_plan public.subscription_plans%rowtype;
  v_request public.pro_payment_requests%rowtype;
  v_beneficiaries uuid[];
  v_count integer;
begin
  if v_user_id is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if not public.sanad_user_has_basic_profile(v_user_id) then
    return jsonb_build_object('ok', false, 'reason', 'profile_incomplete');
  end if;

  select * into v_business from public.business_profiles
  where id = p_business_id and owner_user_id = v_user_id;
  if not found then raise exception 'business_owner_required' using errcode = '42501'; end if;

  select coalesce(array_agg(distinct beneficiary), '{}'::uuid[])
  into v_beneficiaries
  from unnest(coalesce(p_beneficiary_user_ids, '{}'::uuid[])) beneficiary
  where beneficiary is not null;
  v_count := cardinality(v_beneficiaries);
  if v_count < 1 or v_count > 50 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_beneficiary_count');
  end if;

  if (select count(*) from public.business_team_members member
      join public.profiles profile on profile.id = member.user_id and profile.status = 'active'
      where member.business_id = p_business_id
        and member.status = 'active'
        and member.user_id = any(v_beneficiaries)) <> v_count then
    return jsonb_build_object('ok', false, 'reason', 'invalid_or_inactive_team_member');
  end if;

  select * into v_plan from public.subscription_plans
  where code = 'sanad_pro' and is_active = true limit 1 for share;
  if not found then return jsonb_build_object('ok', false, 'reason', 'plan_unavailable'); end if;

  select * into v_account from public.sanad_payment_accounts
  where id = p_payment_account_id and status = 'active'
    and upper(currency) = upper(v_plan.currency_code) limit 1;
  if not found then return jsonb_build_object('ok', false, 'reason', 'invalid_payment_account'); end if;

  if p_receipt_bucket is distinct from 'operation-files'
     or p_receipt_path is null
     or p_receipt_path !~ ('^pro-payment-receipts/' || v_user_id::text || '/[^/]+$') then
    return jsonb_build_object('ok', false, 'reason', 'invalid_receipt_path');
  end if;

  insert into public.pro_payment_requests(
    user_id, plan_code, payment_account_id, expected_amount, expected_currency,
    months, payment_network, transfer_reference, receipt_bucket, receipt_path,
    receipt_mime_type, receipt_file_name, receipt_file_size, status, metadata,
    purchase_scope, business_id, beneficiary_count, unit_amount
  ) values (
    v_user_id, v_plan.code, v_account.id, v_plan.monthly_price_yer * v_count,
    v_plan.currency_code, 1, v_account.financial_entity,
    nullif(trim(coalesce(p_transfer_reference, '')), ''), p_receipt_bucket, p_receipt_path,
    p_receipt_mime_type, p_receipt_file_name, p_receipt_file_size, 'submitted',
    jsonb_build_object(
      'created_by', 'business_team', 'duration_days', v_plan.billing_duration_days,
      'access_limit', v_plan.monthly_access_limit, 'features', v_plan.features,
      'permissions', v_plan.permissions, 'beneficiary_count', v_count,
      'unit_amount', v_plan.monthly_price_yer, 'business_name', v_business.name
    ),
    'business_team', p_business_id, v_count, v_plan.monthly_price_yer
  ) returning * into v_request;

  insert into public.pro_payment_request_items(
    payment_request_id, beneficiary_user_id, business_id, plan_code, unit_amount,
    currency_code, duration_days, access_limit, features, permissions, metadata
  )
  select v_request.id, beneficiary, p_business_id, v_plan.code, v_plan.monthly_price_yer,
    v_plan.currency_code, v_plan.billing_duration_days, v_plan.monthly_access_limit,
    v_plan.features, v_plan.permissions,
    jsonb_build_object('purchased_by_user_id', v_user_id, 'business_name', v_business.name)
  from unnest(v_beneficiaries) beneficiary;

  return jsonb_build_object(
    'ok', true,
    'payment_request_id', v_request.id,
    'status', v_request.status,
    'purchase_scope', v_request.purchase_scope,
    'business_id', p_business_id,
    'beneficiary_count', v_count,
    'unit_amount', v_plan.monthly_price_yer,
    'expected_amount', v_request.expected_amount,
    'expected_currency', v_request.expected_currency,
    'duration_days', v_plan.billing_duration_days,
    'access_limit', v_plan.monthly_access_limit
  );
end;
$function$;

-- Keep the individual flow on the same canonical item model.
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
as $function$
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
  where code = 'sanad_pro' and is_active = true limit 1 for share;
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
    receipt_mime_type, receipt_file_name, receipt_file_size, status, metadata,
    purchase_scope, beneficiary_count, unit_amount
  ) values (
    v_user_id, v_plan.code, v_account.id, v_plan.monthly_price_yer,
    v_plan.currency_code, 1, v_account.financial_entity,
    nullif(trim(coalesce(p_transfer_reference, '')), ''), p_receipt_bucket, p_receipt_path,
    p_receipt_mime_type, p_receipt_file_name, p_receipt_file_size, 'submitted',
    jsonb_build_object(
      'created_by', 'pwa', 'duration_days', v_plan.billing_duration_days,
      'access_limit', v_plan.monthly_access_limit, 'features', v_plan.features,
      'permissions', v_plan.permissions, 'beneficiary_count', 1,
      'unit_amount', v_plan.monthly_price_yer
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
    'ok', true, 'payment_request_id', v_request.id, 'status', v_request.status,
    'purchase_scope', v_request.purchase_scope, 'beneficiary_count', 1,
    'unit_amount', v_plan.monthly_price_yer,
    'expected_amount', v_request.expected_amount,
    'expected_currency', v_request.expected_currency,
    'duration_days', v_plan.billing_duration_days,
    'access_limit', v_plan.monthly_access_limit
  );
end;
$function$;

create or replace function public.admin_get_pro_payment_request_payload(p_payment_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_request record;
  v_items jsonb;
begin
  if auth.role() <> 'service_role' then raise exception 'forbidden'; end if;

  select request.*, profile.full_name as user_full_name, profile.phone as user_phone,
    profile.governorate as user_governorate,
    account.financial_entity as expected_financial_entity,
    account.account_number as expected_account_number,
    account.account_holder_name as expected_account_holder_name,
    account.currency as expected_account_currency,
    business.name as business_name
  into v_request
  from public.pro_payment_requests request
  left join public.profiles profile on profile.id = request.user_id
  left join public.sanad_payment_accounts account on account.id = request.payment_account_id
  left join public.business_profiles business on business.id = request.business_id
  where request.id = p_payment_request_id limit 1;

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
      'currency', v_request.expected_account_currency
    )
  );
end;
$function$;

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
set search_path = ''
as $function$
declare
  v_request public.pro_payment_requests%rowtype;
  v_item public.pro_payment_request_items%rowtype;
  v_subscription public.user_subscriptions%rowtype;
  v_start timestamptz;
  v_end timestamptz;
  v_first_subscription_id uuid;
  v_results jsonb := '[]'::jsonb;
  v_item_count integer;
  v_items_total numeric;
begin
  if current_user not in ('service_role', 'postgres') then raise exception 'forbidden'; end if;
  select * into v_request from public.pro_payment_requests
  where id = p_payment_request_id for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'payment_request_not_found'); end if;
  if v_request.status in ('approved', 'auto_approved') then
    return jsonb_build_object('ok', true, 'already_approved', true,
      'subscription_id', v_request.subscription_id);
  end if;
  if v_request.status in ('rejected', 'cancelled') then
    return jsonb_build_object('ok', false, 'reason', 'terminal_status');
  end if;
  if v_request.expected_amount is null or v_request.expected_amount <= 0 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_expected_amount');
  end if;

  select count(*) into v_item_count
  from public.pro_payment_request_items item
  where item.payment_request_id = v_request.id;

  -- Backward compatibility for requests created before itemization.
  if v_item_count = 0 then
    insert into public.pro_payment_request_items(
      payment_request_id, beneficiary_user_id, business_id, plan_code, unit_amount,
      currency_code, duration_days, access_limit, features, permissions, metadata
    ) values (
      v_request.id, v_request.user_id, v_request.business_id, v_request.plan_code,
      v_request.expected_amount, v_request.expected_currency,
      greatest(coalesce((v_request.metadata->>'duration_days')::integer, 30), 1),
      greatest(coalesce((v_request.metadata->>'access_limit')::integer, 1), 1),
      case when jsonb_typeof(v_request.metadata->'features') = 'array'
        then v_request.metadata->'features' else '[]'::jsonb end,
      case when jsonb_typeof(v_request.metadata->'permissions') = 'object'
        then v_request.metadata->'permissions' else '{}'::jsonb end,
      jsonb_build_object('legacy_request', true)
    );
  end if;

  select count(*), coalesce(sum(item.unit_amount), 0)
  into v_item_count, v_items_total
  from public.pro_payment_request_items item
  where item.payment_request_id = v_request.id;

  if v_item_count <> v_request.beneficiary_count
     or v_items_total <> v_request.expected_amount then
    return jsonb_build_object(
      'ok', false,
      'reason', 'commercial_snapshot_mismatch',
      'expected_beneficiary_count', v_request.beneficiary_count,
      'actual_beneficiary_count', v_item_count,
      'expected_amount', v_request.expected_amount,
      'items_total', v_items_total
    );
  end if;

  if v_request.purchase_scope = 'business_team' and exists (
    select 1
    from public.pro_payment_request_items item
    where item.payment_request_id = v_request.id
      and not exists (
        select 1 from public.business_team_members member
        join public.profiles profile on profile.id = member.user_id and profile.status = 'active'
        where member.business_id = v_request.business_id
          and member.user_id = item.beneficiary_user_id
          and member.status = 'active'
      )
  ) then
    return jsonb_build_object('ok', false, 'reason', 'beneficiary_no_longer_eligible');
  end if;

  for v_item in
    select * from public.pro_payment_request_items
    where payment_request_id = v_request.id
    order by created_at, id
    for update
  loop
    if v_item.subscription_id is not null and v_item.status in ('active', 'scheduled') then
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'beneficiary_user_id', v_item.beneficiary_user_id,
        'subscription_id', v_item.subscription_id,
        'status', v_item.status,
        'already_activated', true
      ));
      continue;
    end if;

    select greatest(now(), coalesce(max(current_period_end), now())) into v_start
    from public.user_subscriptions
    where user_id = v_item.beneficiary_user_id
      and status in ('active', 'scheduled')
      and current_period_end > now();
    v_end := v_start + make_interval(days => v_item.duration_days);

    insert into public.user_subscriptions(
      user_id, plan_code, status, current_period_start, current_period_end,
      activated_by, metadata
    ) values (
      v_item.beneficiary_user_id, v_item.plan_code,
      case when v_start > now() + interval '5 seconds' then 'scheduled' else 'active' end,
      v_start, v_end, coalesce(p_approval_source, 'auto'),
      jsonb_build_object(
        'payment_request_id', v_request.id,
        'payment_request_item_id', v_item.id,
        'purchased_by_user_id', v_request.user_id,
        'business_id', v_item.business_id,
        'duration_days', v_item.duration_days,
        'access_limit', v_item.access_limit,
        'features', v_item.features,
        'permissions', v_item.permissions,
        'unit_amount', v_item.unit_amount,
        'currency_code', v_item.currency_code,
        'note', p_note
      )
    ) returning * into v_subscription;

    update public.pro_payment_request_items
    set subscription_id = v_subscription.id,
        status = v_subscription.status,
        failure_reason = null,
        updated_at = now()
    where id = v_item.id;

    v_first_subscription_id := coalesce(v_first_subscription_id, v_subscription.id);
    v_results := v_results || jsonb_build_array(jsonb_build_object(
      'beneficiary_user_id', v_item.beneficiary_user_id,
      'subscription_id', v_subscription.id,
      'status', v_subscription.status,
      'current_period_start', v_start,
      'current_period_end', v_end
    ));

    if v_item.beneficiary_user_id <> v_request.user_id then
      insert into public.notifications(
        recipient_user_id, actor_user_id, notification_type, category, severity,
        title, body, action_type, action_payload, business_id,
        source_event_type, source_event_id, dedupe_key, data
      ) values (
        v_item.beneficiary_user_id, v_request.user_id,
        'pro_payment_approved', 'subscription', 'success',
        'تم تفعيل سند Pro لك',
        'قام مدير النشاط بتفعيل اشتراك سند Pro لحسابك.',
        'subscription', jsonb_build_object('subscription_id', v_subscription.id),
        v_item.business_id, 'business_team_pro_activated', v_item.id::text,
        'business_team_pro_activated:' || v_item.id::text,
        jsonb_build_object(
          'payment_request_id', v_request.id,
          'subscription_id', v_subscription.id,
          'purchased_by_user_id', v_request.user_id
        )
      ) on conflict (recipient_user_id, dedupe_key) do nothing;
    end if;
  end loop;

  update public.pro_payment_requests set
    status = case when coalesce(p_approval_source, 'auto') = 'auto'
      then 'auto_approved' else 'approved' end,
    ai_extracted_json = coalesce(p_ai_extracted_json, '{}'::jsonb),
    ai_confidence = p_ai_confidence,
    verification_checks = coalesce(p_verification_checks, '{}'::jsonb),
    approved_at = now(),
    approved_by = coalesce(p_approval_source, 'auto'),
    subscription_id = coalesce(v_first_subscription_id, v_request.subscription_id),
    failure_reason = null,
    updated_at = now()
  where id = v_request.id;

  return jsonb_build_object(
    'ok', true,
    'subscription_id', coalesce(v_first_subscription_id, v_request.subscription_id),
    'subscriptions', v_results,
    'beneficiary_count', jsonb_array_length(v_results)
  );
end;
$function$;

create or replace function public.platform_admin_get_payment_request_details(p_payment_request_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_result jsonb;
  v_items jsonb;
begin
  if not public.is_platform_admin(auth.uid()) then
    raise exception 'platform_admin_required' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', item.id,
    'beneficiary_user_id', item.beneficiary_user_id,
    'full_name', profile.full_name,
    'phone', profile.phone,
    'business_id', item.business_id,
    'plan_code', item.plan_code,
    'unit_amount', item.unit_amount,
    'currency_code', item.currency_code,
    'duration_days', item.duration_days,
    'access_limit', item.access_limit,
    'status', item.status,
    'subscription_id', item.subscription_id,
    'subscription', case when subscription.id is null then null else jsonb_build_object(
      'id', subscription.id,
      'status', subscription.status,
      'current_period_start', subscription.current_period_start,
      'current_period_end', subscription.current_period_end,
      'activated_by', subscription.activated_by
    ) end
  ) order by item.created_at), '[]'::jsonb)
  into v_items
  from public.pro_payment_request_items item
  join public.profiles profile on profile.id = item.beneficiary_user_id
  left join public.user_subscriptions subscription on subscription.id = item.subscription_id
  where item.payment_request_id = p_payment_request_id;

  select jsonb_build_object(
    'request', jsonb_build_object(
      'id', request.id,
      'user_id', request.user_id,
      'user_full_name', profile.full_name,
      'user_phone', profile.phone,
      'user_governorate', profile.governorate,
      'plan_code', request.plan_code,
      'expected_amount', request.expected_amount,
      'expected_currency', request.expected_currency,
      'months', request.months,
      'payment_network', request.payment_network,
      'transfer_reference', request.transfer_reference,
      'receipt_bucket', request.receipt_bucket,
      'receipt_path', request.receipt_path,
      'receipt_mime_type', request.receipt_mime_type,
      'receipt_file_name', request.receipt_file_name,
      'receipt_file_size', request.receipt_file_size,
      'status', request.status,
      'ai_extracted_json', request.ai_extracted_json,
      'ai_confidence', request.ai_confidence,
      'verification_checks', request.verification_checks,
      'failure_reason', request.failure_reason,
      'approved_at', request.approved_at,
      'approved_by', request.approved_by,
      'subscription_id', request.subscription_id,
      'metadata', request.metadata,
      'created_at', request.created_at,
      'updated_at', request.updated_at,
      'purchase_scope', request.purchase_scope,
      'business_id', request.business_id,
      'business_name', business.name,
      'beneficiary_count', request.beneficiary_count,
      'unit_amount', request.unit_amount
    ),
    'expected_receiver', jsonb_build_object(
      'financial_entity', account.financial_entity,
      'account_number', account.account_number,
      'account_holder_name', account.account_holder_name,
      'currency', account.currency
    ),
    'subscription', case when subscription.id is null then null else jsonb_build_object(
      'id', subscription.id,
      'status', subscription.status,
      'current_period_start', subscription.current_period_start,
      'current_period_end', subscription.current_period_end,
      'activated_by', subscription.activated_by
    ) end,
    'beneficiaries', v_items
  ) into v_result
  from public.pro_payment_requests request
  left join public.profiles profile on profile.id = request.user_id
  left join public.sanad_payment_accounts account on account.id = request.payment_account_id
  left join public.user_subscriptions subscription on subscription.id = request.subscription_id
  left join public.business_profiles business on business.id = request.business_id
  where request.id = p_payment_request_id;

  if v_result is null then raise exception 'payment_request_not_found'; end if;
  return v_result;
end;
$function$;

-- Extend team cards with current/scheduled Pro state without exposing subscription rows directly.
create or replace function public.get_business_team(p_business_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_items jsonb;
  v_invitations jsonb;
begin
  if v_user_id is null then raise exception 'not_authenticated'; end if;
  if not exists (
    select 1 from public.business_profiles
    where id = p_business_id and owner_user_id = v_user_id
  ) then raise exception 'business_owner_required'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'membership_id', member.id,
    'business_id', member.business_id,
    'user_id', member.user_id,
    'membership_role', member.membership_role,
    'role', member.membership_role,
    'job_title', member.job_title,
    'label', coalesce(member.job_title, member.label),
    'permissions', member.permissions,
    'status', member.status,
    'created_at', member.created_at,
    'updated_at', member.updated_at,
    'profile', jsonb_build_object(
      'id', profile.id,
      'full_name', profile.full_name,
      'phone', profile.phone,
      'status', profile.status
    ),
    'pro_subscription', case when subscription.id is null then null else jsonb_build_object(
      'id', subscription.id,
      'status', subscription.status,
      'current_period_start', subscription.current_period_start,
      'current_period_end', subscription.current_period_end
    ) end,
    'activity', jsonb_build_object(
      'linked_count', coalesce(activity.linked_count, 0),
      'verified_count', coalesce(activity.verified_count, 0),
      'last_activity_at', activity.last_activity_at
    )
  ) order by member.created_at), '[]'::jsonb)
  into v_items
  from public.business_team_members member
  join public.profiles profile on profile.id = member.user_id
  left join lateral (
    select sub.* from public.user_subscriptions sub
    where sub.user_id = member.user_id
      and sub.plan_code = 'sanad_pro'
      and sub.status in ('active', 'scheduled')
      and sub.current_period_end > now()
    order by sub.current_period_end desc limit 1
  ) subscription on true
  left join lateral (
    select
      count(*) filter (where link.linked_by_user_id = member.user_id)::integer as linked_count,
      count(*) filter (where link.verified_by_user_id = member.user_id)::integer as verified_count,
      max(link.created_at) filter (
        where link.linked_by_user_id = member.user_id
           or link.verified_by_user_id = member.user_id
      ) as last_activity_at
    from public.business_operation_links link
    where link.business_id = p_business_id and link.status = 'linked'
  ) activity on true
  where member.business_id = p_business_id and member.status <> 'removed';

  select coalesce(jsonb_agg(jsonb_build_object(
    'invitation_id', invitation.id,
    'id', invitation.id,
    'business_id', invitation.business_id,
    'invited_phone', invitation.invited_phone,
    'invited_user_id', invitation.invited_user_id,
    'membership_role', coalesce(invitation.membership_role, 'employee'),
    'role', coalesce(invitation.membership_role, 'employee'),
    'job_title', coalesce(invitation.job_title, invitation.label),
    'label', coalesce(invitation.job_title, invitation.label),
    'requested_permissions', invitation.requested_permissions,
    'status', invitation.status,
    'created_at', invitation.created_at,
    'expires_at', invitation.expires_at
  ) order by invitation.created_at desc), '[]'::jsonb)
  into v_invitations
  from public.business_invitations invitation
  where invitation.business_id = p_business_id
    and invitation.invitation_type = 'team_member'
    and invitation.status = 'pending'
    and invitation.expires_at > now();

  return jsonb_build_object('items', v_items, 'pending_invitations', v_invitations);
end;
$function$;

revoke all on function public.get_business_team_member_operations(uuid, uuid, text, integer, integer) from public, anon;
revoke all on function public.get_business_team_pro_purchase_options(uuid) from public, anon;
revoke all on function public.create_team_pro_payment_request(uuid, uuid[], uuid, text, text, text, text, text, bigint) from public, anon;
revoke all on function public.create_pro_payment_request(uuid, text, text, text, text, text, bigint) from public, anon;
revoke all on function public.admin_get_pro_payment_request_payload(uuid) from public, anon, authenticated;
revoke all on function public.admin_approve_pro_payment_request(uuid, text, jsonb, numeric, jsonb, text) from public, anon, authenticated;
revoke all on function public.platform_admin_get_payment_request_details(uuid) from public, anon;
revoke all on function public.get_business_team(uuid) from public, anon;

grant execute on function public.get_business_team_member_operations(uuid, uuid, text, integer, integer) to authenticated;
grant execute on function public.get_business_team_pro_purchase_options(uuid) to authenticated;
grant execute on function public.create_team_pro_payment_request(uuid, uuid[], uuid, text, text, text, text, text, bigint) to authenticated;
grant execute on function public.create_pro_payment_request(uuid, text, text, text, text, text, bigint) to authenticated;
grant execute on function public.admin_get_pro_payment_request_payload(uuid) to service_role;
grant execute on function public.admin_approve_pro_payment_request(uuid, text, jsonb, numeric, jsonb, text) to service_role;
grant execute on function public.platform_admin_get_payment_request_details(uuid) to authenticated;
grant execute on function public.get_business_team(uuid) to authenticated;

comment on table public.pro_payment_request_items is
  'Immutable commercial snapshots and activation state for each SANAD Pro beneficiary.';
comment on function public.create_team_pro_payment_request(uuid, uuid[], uuid, text, text, text, text, text, bigint) is
  'Creates one owner-paid request for one or more active business team members using database plan pricing.';
comment on function public.get_business_team_member_operations(uuid, uuid, text, integer, integer) is
  'Owner-only paginated activity for a specific business team member.';

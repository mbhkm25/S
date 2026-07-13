begin;

create or replace function public.admin_mark_pro_payment_request_review(
  p_payment_request_id uuid,
  p_status text,
  p_ai_extracted_json jsonb default '{}'::jsonb,
  p_ai_confidence numeric default null,
  p_verification_checks jsonb default '{}'::jsonb,
  p_failure_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'forbidden';
  end if;

  if p_status not in ('processing','pending_review','rejected','failed','cancelled') then
    raise exception 'invalid_status';
  end if;

  update public.pro_payment_requests
  set
    status = p_status,
    ai_extracted_json = coalesce(p_ai_extracted_json, ai_extracted_json),
    ai_confidence = coalesce(p_ai_confidence, ai_confidence),
    verification_checks = coalesce(p_verification_checks, verification_checks),
    failure_reason = p_failure_reason,
    updated_at = now()
  where id = p_payment_request_id;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'payment_request_not_found');
  end if;

  return jsonb_build_object('ok', true, 'payment_request_id', p_payment_request_id, 'status', p_status);
end;
$$;

create or replace function public.admin_get_pro_payment_request_payload(
  p_payment_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request record;
begin
  if auth.role() <> 'service_role' then
    raise exception 'forbidden';
  end if;

  select
    r.*,
    p.full_name as user_full_name,
    p.phone as user_phone,
    p.governorate as user_governorate,
    a.financial_entity as expected_financial_entity,
    a.account_number as expected_account_number,
    a.account_holder_name as expected_account_holder_name,
    a.currency as expected_account_currency
  into v_request
  from public.pro_payment_requests r
  left join public.profiles p on p.id = r.user_id
  left join public.sanad_payment_accounts a on a.id = r.payment_account_id
  where r.id = p_payment_request_id
  limit 1;

  if v_request.id is null then
    return jsonb_build_object('ok', false, 'reason', 'payment_request_not_found');
  end if;

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
      'created_at', v_request.created_at
    ),
    'expected_receiver', jsonb_build_object(
      'financial_entity', v_request.expected_financial_entity,
      'account_number', v_request.expected_account_number,
      'account_holder_name', v_request.expected_account_holder_name,
      'currency', v_request.expected_account_currency
    )
  );
end;
$$;

alter table public.sanad_payment_accounts enable row level security;
alter table public.pro_payment_requests enable row level security;

drop policy if exists "sanad_payment_accounts_select_active" on public.sanad_payment_accounts;
create policy "sanad_payment_accounts_select_active"
on public.sanad_payment_accounts
for select
to authenticated
using (status = 'active');

drop policy if exists "pro_payment_requests_select_own" on public.pro_payment_requests;
create policy "pro_payment_requests_select_own"
on public.pro_payment_requests
for select
to authenticated
using (user_id = auth.uid());

grant select on public.sanad_payment_accounts to authenticated;
grant select on public.pro_payment_requests to authenticated;
grant execute on function public.get_sanad_pro_payment_options() to authenticated;
grant execute on function public.create_pro_payment_request(uuid, text, text, text, text, text, bigint) to authenticated;

revoke all on function public.admin_approve_pro_payment_request(uuid, text, jsonb, numeric, jsonb, text) from public, anon, authenticated;
revoke all on function public.admin_mark_pro_payment_request_review(uuid, text, jsonb, numeric, jsonb, text) from public, anon, authenticated;
revoke all on function public.admin_get_pro_payment_request_payload(uuid) from public, anon, authenticated;

grant execute on function public.admin_approve_pro_payment_request(uuid, text, jsonb, numeric, jsonb, text) to service_role;
grant execute on function public.admin_mark_pro_payment_request_review(uuid, text, jsonb, numeric, jsonb, text) to service_role;
grant execute on function public.admin_get_pro_payment_request_payload(uuid) to service_role;

notify pgrst, 'reload schema';

commit;;

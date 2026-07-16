-- SANAD Verify v3 production database hardening
--
-- This migration records and reproduces the security, integrity, Storage,
-- RLS, privilege, and index changes applied to production on 2026-07-16.
-- It is intentionally idempotent where PostgreSQL permits.

-- ---------------------------------------------------------------------------
-- 1. Harden SECURITY DEFINER functions against search_path hijacking.
-- ---------------------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as fn
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind = 'f'
      and p.prosecdef
  loop
    execute format('alter function %s set search_path = ''''', r.fn);
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- 2. RPC least privilege.
-- ---------------------------------------------------------------------------
revoke execute on function public.create_pro_payment_request(uuid,text,text,text,text,text,bigint) from public, anon;
revoke execute on function public.get_my_operation_access_usage() from public, anon;
revoke execute on function public.get_my_profile_completion() from public, anon;
revoke execute on function public.upsert_my_basic_profile(text,text,text) from public, anon;

grant execute on function public.create_pro_payment_request(uuid,text,text,text,text,text,bigint) to authenticated, service_role;
grant execute on function public.get_my_operation_access_usage() to authenticated, service_role;
grant execute on function public.get_my_profile_completion() to authenticated, service_role;
grant execute on function public.upsert_my_basic_profile(text,text,text) to authenticated, service_role;

revoke execute on function public.sanad_get_active_subscription(uuid) from public, anon, authenticated;
revoke execute on function public.sanad_user_has_basic_profile(uuid) from public, anon, authenticated;
revoke execute on function public.is_platform_admin(uuid) from public, anon, authenticated;
grant execute on function public.sanad_get_active_subscription(uuid) to service_role;
grant execute on function public.sanad_user_has_basic_profile(uuid) to service_role;
grant execute on function public.is_platform_admin(uuid) to service_role;

revoke execute on function public.get_verification_notification_payload(uuid,uuid) from public, anon, authenticated;
grant execute on function public.get_verification_notification_payload(uuid,uuid) to service_role;

revoke execute on function public.get_operation_by_token(uuid) from public, anon, authenticated;
revoke execute on function public.get_operation_review_by_token(uuid) from public, anon, authenticated;
grant execute on function public.get_operation_by_token(uuid) to service_role;
grant execute on function public.get_operation_review_by_token(uuid) to service_role;

revoke execute on function public.open_operation_access(uuid,text) from anon, public;
revoke execute on function public.preview_operation_access(uuid) from anon, public;
revoke execute on function public.log_operation_opened(uuid,text) from anon, public;
revoke execute on function public.get_sanad_pro_payment_options() from anon, public;

grant execute on function public.open_operation_access(uuid,text) to authenticated, service_role;
grant execute on function public.preview_operation_access(uuid) to authenticated, service_role;
grant execute on function public.log_operation_opened(uuid,text) to authenticated, service_role;
grant execute on function public.get_sanad_pro_payment_options() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. RLS auth lookup optimization.
-- ---------------------------------------------------------------------------
alter policy operation_access_logs_select_own on public.operation_access_logs
  using (user_id = (select auth.uid()));

alter policy pro_payment_requests_select_own on public.pro_payment_requests
  using (user_id = (select auth.uid()));

alter policy profiles_select_own on public.profiles
  using (id = (select auth.uid()));

alter policy profiles_insert_own on public.profiles
  with check (id = (select auth.uid()));

alter policy profiles_update_own on public.profiles
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

alter policy user_financial_accounts_select_own on public.user_financial_accounts
  using (user_id = (select auth.uid()));

alter policy user_financial_accounts_insert_own on public.user_financial_accounts
  with check (user_id = (select auth.uid()));

alter policy user_financial_accounts_update_own on public.user_financial_accounts
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

alter policy user_financial_accounts_delete_own on public.user_financial_accounts
  using (user_id = (select auth.uid()));

alter policy user_subscriptions_select_own on public.user_subscriptions
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- 4. Missing foreign-key indexes.
-- ---------------------------------------------------------------------------
create index if not exists idx_notifications_actor_user_id
  on public.notifications(actor_user_id);

create index if not exists idx_pro_payment_requests_plan_code
  on public.pro_payment_requests(plan_code);

create index if not exists idx_pro_payment_requests_subscription_id
  on public.pro_payment_requests(subscription_id);

create index if not exists idx_push_delivery_reservations_subscription_id
  on public.push_delivery_reservations(subscription_id);

create index if not exists idx_user_subscriptions_plan_code
  on public.user_subscriptions(plan_code);

-- ---------------------------------------------------------------------------
-- 5. Data API table least privilege.
-- ---------------------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in
    select format('%I.%I', schemaname, tablename) as fqtn
    from pg_tables
    where schemaname = 'public'
  loop
    execute format('revoke all privileges on table %s from anon, authenticated', r.fqtn);
  end loop;
end
$$;

grant select on table public.business_categories to anon;

grant select, insert, update on table public.profiles to authenticated;
grant select, insert on table public.operations to authenticated;
grant select on table public.operation_user_links to authenticated;
grant select on table public.operation_events to authenticated;
grant select, insert on table public.report_requests to authenticated;
grant select, insert, update, delete on table public.user_financial_accounts to authenticated;
grant select on table public.subscription_plans to authenticated;
grant select on table public.user_subscriptions to authenticated;
grant select on table public.operation_access_logs to authenticated;
grant select on table public.sanad_payment_accounts to authenticated;
grant select on table public.pro_payment_requests to authenticated;
grant select on table public.business_categories to authenticated;
grant select on table public.business_profiles to authenticated;
grant select on table public.business_team_members to authenticated;
grant select on table public.business_customers to authenticated;
grant select on table public.business_invitations to authenticated;
grant select on table public.business_operation_links to authenticated;
grant select on table public.business_media_assets to authenticated;
grant select on table public.business_catalog_items to authenticated;
grant select on table public.business_inquiries to authenticated;
grant select on table public.business_team_actions to authenticated;
grant select on table public.notifications to authenticated;

revoke all privileges on table public.ai_prompts from anon, authenticated;
revoke all privileges on table public.push_subscriptions from anon, authenticated;
revoke all privileges on table public.push_outbox from anon, authenticated;
revoke all privileges on table public.push_delivery_attempts from anon, authenticated;
revoke all privileges on table public.push_delivery_reservations from anon, authenticated;

alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke execute on functions from public, anon, authenticated;
alter default privileges for role postgres in schema public revoke usage, select on sequences from anon, authenticated;

-- Explicit backend-only deny policies provide defense in depth.
drop policy if exists push_subscriptions_backend_only on public.push_subscriptions;
create policy push_subscriptions_backend_only
on public.push_subscriptions
for all
to anon, authenticated
using (false)
with check (false);

drop policy if exists push_outbox_backend_only on public.push_outbox;
create policy push_outbox_backend_only
on public.push_outbox
for all
to anon, authenticated
using (false)
with check (false);

drop policy if exists push_delivery_attempts_backend_only on public.push_delivery_attempts;
create policy push_delivery_attempts_backend_only
on public.push_delivery_attempts
for all
to anon, authenticated
using (false)
with check (false);

drop policy if exists push_delivery_reservations_backend_only on public.push_delivery_reservations;
create policy push_delivery_reservations_backend_only
on public.push_delivery_reservations
for all
to anon, authenticated
using (false)
with check (false);

-- ---------------------------------------------------------------------------
-- 6. Profile phone integrity.
-- ---------------------------------------------------------------------------
alter table public.profiles drop constraint if exists profiles_phone_yemen_format_chk;
alter table public.profiles drop constraint if exists profiles_phone_e164_format_chk;

update public.profiles
set phone = public.sanad_normalize_yemen_phone(phone)
where phone is not null
  and phone is distinct from public.sanad_normalize_yemen_phone(phone);

alter table public.profiles add constraint profiles_phone_e164_format_chk
  check (phone is null or phone ~ '^[1-9][0-9]{7,14}$');

-- ---------------------------------------------------------------------------
-- 7. Storage policy and bucket hardening.
-- ---------------------------------------------------------------------------
alter policy storage_insert_pro_payment_receipts on storage.objects
  with check (
    bucket_id = 'operation-files'
    and (storage.foldername(name))[1] = 'pro-payment-receipts'
    and (storage.foldername(name))[2] = (select auth.uid())::text
  );

alter policy storage_select_pro_payment_receipts on storage.objects
  using (
    bucket_id = 'operation-files'
    and (storage.foldername(name))[1] = 'pro-payment-receipts'
    and (storage.foldername(name))[2] = (select auth.uid())::text
  );

update storage.buckets
set file_size_limit = 2097152,
    allowed_mime_types = array[
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/svg+xml'
    ]::text[],
    updated_at = now()
where id = 'LOGO';

-- Complete the authorization boundary for the new unified financial scope.
-- Authenticated clients must not require USAGE on schema private.

drop policy if exists financial_exchange_rates_select_scope on public.financial_exchange_rates;
create policy financial_exchange_rates_select_scope on public.financial_exchange_rates
  for select using (
    (scope_kind='personal' and user_id=(select auth.uid()))
    or (scope_kind='business' and public.can_access_business_financial_v1(business_id))
  );

drop policy if exists financial_exchange_rates_insert_scope on public.financial_exchange_rates;
create policy financial_exchange_rates_insert_scope on public.financial_exchange_rates
  for insert with check (
    (scope_kind='personal' and user_id=(select auth.uid()))
    or (scope_kind='business' and public.is_business_owner_v1(business_id))
  );

drop policy if exists financial_exchange_rates_update_scope on public.financial_exchange_rates;
create policy financial_exchange_rates_update_scope on public.financial_exchange_rates
  for update using (
    (scope_kind='personal' and user_id=(select auth.uid()))
    or (scope_kind='business' and public.is_business_owner_v1(business_id))
  ) with check (
    (scope_kind='personal' and user_id=(select auth.uid()))
    or (scope_kind='business' and public.is_business_owner_v1(business_id))
  );

drop policy if exists financial_exchange_rates_delete_scope on public.financial_exchange_rates;
create policy financial_exchange_rates_delete_scope on public.financial_exchange_rates
  for delete using (
    (scope_kind='personal' and user_id=(select auth.uid()))
    or (scope_kind='business' and public.is_business_owner_v1(business_id))
  );

drop policy if exists financial_attachments_select_scope on public.financial_attachments;
create policy financial_attachments_select_scope on public.financial_attachments
  for select using (
    (scope_kind='personal' and user_id=(select auth.uid()))
    or (scope_kind='business' and public.can_access_business_financial_v1(business_id))
  );

drop policy if exists financial_attachments_insert_scope on public.financial_attachments;
create policy financial_attachments_insert_scope on public.financial_attachments
  for insert with check (
    (scope_kind='personal' and user_id=(select auth.uid()))
    or (scope_kind='business' and public.is_business_owner_v1(business_id))
  );

drop policy if exists financial_attachments_delete_scope on public.financial_attachments;
create policy financial_attachments_delete_scope on public.financial_attachments
  for delete using (
    (scope_kind='personal' and user_id=(select auth.uid()))
    or (scope_kind='business' and public.is_business_owner_v1(business_id))
  );
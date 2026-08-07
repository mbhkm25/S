grant select, insert, update on table public.business_community_interest to authenticated;

drop policy if exists business_community_interest_own_select
  on public.business_community_interest;
create policy business_community_interest_own_select
  on public.business_community_interest
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists business_community_interest_own_insert
  on public.business_community_interest;
create policy business_community_interest_own_insert
  on public.business_community_interest
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists business_community_interest_own_update
  on public.business_community_interest;
create policy business_community_interest_own_update
  on public.business_community_interest
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

alter function public.get_business_community_context() security invoker;

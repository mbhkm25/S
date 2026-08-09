-- Remove circular RLS dependencies between business_profiles, business_team_members,
-- and business_customers. Security-definer helpers perform narrow membership checks
-- without re-entering the caller's table policies.

create or replace function private.user_is_business_owner(p_business_id uuid,p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select exists(
    select 1 from public.business_profiles bp
    where bp.id=p_business_id and bp.owner_user_id=p_user_id
  );
$function$;

create or replace function private.user_is_active_business_member(p_business_id uuid,p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select exists(
    select 1 from public.business_team_members tm
    where tm.business_id=p_business_id and tm.user_id=p_user_id and tm.status='active'
  );
$function$;

create or replace function private.user_is_active_business_customer(p_business_id uuid,p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select exists(
    select 1 from public.business_customers bc
    where bc.business_id=p_business_id and bc.user_id=p_user_id and bc.status='active'
  );
$function$;

revoke all on function private.user_is_business_owner(uuid,uuid) from public,anon;
revoke all on function private.user_is_active_business_member(uuid,uuid) from public,anon;
revoke all on function private.user_is_active_business_customer(uuid,uuid) from public,anon;
grant execute on function private.user_is_business_owner(uuid,uuid) to authenticated;
grant execute on function private.user_is_active_business_member(uuid,uuid) to authenticated;
grant execute on function private.user_is_active_business_customer(uuid,uuid) to authenticated;

drop policy if exists business_team_members_select_context on public.business_team_members;
create policy business_team_members_select_context
on public.business_team_members
for select
to authenticated
using (
  user_id=(select auth.uid())
  or private.user_is_business_owner(business_id,(select auth.uid()))
);

drop policy if exists business_customers_select_context on public.business_customers;
create policy business_customers_select_context
on public.business_customers
for select
to authenticated
using (
  user_id=(select auth.uid())
  or private.user_is_business_owner(business_id,(select auth.uid()))
);

drop policy if exists business_profiles_select_authenticated_context on public.business_profiles;
create policy business_profiles_select_authenticated_context
on public.business_profiles
for select
to authenticated
using (
  public_status='published'
  or owner_user_id=(select auth.uid())
  or private.user_is_active_business_member(id,(select auth.uid()))
  or private.user_is_active_business_customer(id,(select auth.uid()))
);

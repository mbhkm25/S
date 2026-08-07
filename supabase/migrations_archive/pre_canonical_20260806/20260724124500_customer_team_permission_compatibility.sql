-- Align the customer relationship foundation with the existing team permission editor.
-- Existing UI permissions use snake_case keys. Customer RPC authorization uses
-- namespaced keys. This compatibility layer accepts both without weakening owner
-- or platform-admin controls.

create or replace function public.can_access_business_customers(
  p_business_id uuid,
  p_required_permission text default 'customers.view'
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.business_profiles bp
    where bp.id = p_business_id
      and bp.owner_user_id = auth.uid()
  )
  or exists (
    select 1
    from public.business_team_members tm
    where tm.business_id = p_business_id
      and tm.user_id = auth.uid()
      and tm.status = 'active'
      and (
        tm.membership_role in ('owner','manager')
        or coalesce((tm.permissions ->> p_required_permission)::boolean, false)
        or (
          p_required_permission = 'customers.view'
          and coalesce((tm.permissions ->> 'view_customers')::boolean, false)
        )
        or (
          p_required_permission = 'customers.contact'
          and coalesce((tm.permissions ->> 'contact_customers')::boolean, false)
        )
        or (
          p_required_permission = 'customers.manage'
          and coalesce((tm.permissions ->> 'view_customers')::boolean, false)
          and coalesce((tm.permissions ->> 'contact_customers')::boolean, false)
        )
        or coalesce((tm.permissions ->> 'customers.manage')::boolean, false)
      )
  )
  or public.is_platform_admin(auth.uid());
$$;

revoke all on function public.can_access_business_customers(uuid,text) from public;
grant execute on function public.can_access_business_customers(uuid,text) to authenticated;

comment on function public.can_access_business_customers(uuid,text) is
  'Checks customer-module access for owners, managers, platform admins, namespaced permissions, and legacy team permission keys.';

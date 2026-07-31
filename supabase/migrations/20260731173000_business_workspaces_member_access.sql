-- SANAD business workspaces discovery for owners and active team members.
-- This contract exposes membership metadata and payment-inbox permissions without
-- granting any permission that the user does not already hold.

create or replace function public.get_my_business_workspaces()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_items jsonb;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'business_id', bp.id,
        'business_name', bp.name,
        'slug', bp.slug,
        'is_owner', bp.owner_user_id = auth.uid(),
        'membership_status', case when bp.owner_user_id = auth.uid() then 'active' else member.status end,
        'membership_role', case when bp.owner_user_id = auth.uid() then 'owner' else member.membership_role end,
        'job_title', case when bp.owner_user_id = auth.uid() then 'مالك النشاط' else member.job_title end,
        'permissions', jsonb_build_object(
          'view', private.has_business_payment_permission(bp.id, 'view', auth.uid()),
          'claim', private.has_business_payment_permission(bp.id, 'claim', auth.uid()),
          'complete', private.has_business_payment_permission(bp.id, 'complete', auth.uid()),
          'release', private.has_business_payment_permission(bp.id, 'release', auth.uid()),
          'reassign', private.has_business_payment_permission(bp.id, 'reassign', auth.uid()),
          'review', private.has_business_payment_permission(bp.id, 'review', auth.uid())
        ),
        'counts', jsonb_build_object(
          'new', case when private.has_business_payment_permission(bp.id, 'view', auth.uid()) then
            (select count(*) from public.business_payment_inbox i where i.business_id = bp.id and i.status = 'new')
          else 0 end,
          'mine', case when private.has_business_payment_permission(bp.id, 'view', auth.uid()) then
            (select count(*) from public.business_payment_inbox i where i.business_id = bp.id and i.status = 'claimed' and i.claimed_by_user_id = auth.uid() and i.claim_expires_at > now())
          else 0 end,
          'review_required', case when private.has_business_payment_permission(bp.id, 'view', auth.uid()) then
            (select count(*) from public.business_payment_inbox i where i.business_id = bp.id and i.status = 'review_required')
          else 0 end,
          'completed_today', case when private.has_business_payment_permission(bp.id, 'view', auth.uid()) then
            (select count(*) from public.business_payment_inbox i where i.business_id = bp.id and i.status = 'completed' and i.completed_at >= date_trunc('day', now()))
          else 0 end
        )
      )
      order by bp.name
    ),
    '[]'::jsonb
  ) into v_items
  from public.business_profiles bp
  left join lateral (
    select m.status, m.membership_role, m.job_title, m.permissions
    from public.business_team_members m
    where m.business_id = bp.id
      and m.user_id = auth.uid()
      and m.status = 'active'
    order by m.updated_at desc, m.id desc
    limit 1
  ) member on true
  where bp.owner_user_id = auth.uid()
     or member.status = 'active';

  return jsonb_build_object('items', v_items);
end;
$$;

revoke all on function public.get_my_business_workspaces() from public;
revoke all on function public.get_my_business_workspaces() from anon;
grant execute on function public.get_my_business_workspaces() to authenticated;

comment on function public.get_my_business_workspaces()
is 'Returns owned businesses and active team memberships with existing payment-inbox permissions and safe counts. Does not grant new permissions.';

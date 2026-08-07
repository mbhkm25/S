begin;

create index if not exists idx_business_catalog_items_created_by_user
  on public.business_catalog_items(created_by_user_id);
create index if not exists idx_business_inquiries_catalog_item
  on public.business_inquiries(catalog_item_id);
create index if not exists idx_business_invitations_created_by_user
  on public.business_invitations(created_by_user_id);
create index if not exists idx_business_media_assets_owner_user
  on public.business_media_assets(owner_user_id);
create index if not exists idx_business_operation_links_unlinked_by_user
  on public.business_operation_links(unlinked_by_user_id);
create index if not exists idx_business_operation_links_verified_by_user
  on public.business_operation_links(verified_by_user_id);
create index if not exists idx_business_profiles_reviewed_by_user
  on public.business_profiles(reviewed_by_user_id);
create index if not exists idx_business_team_actions_performed_by_user
  on public.business_team_actions(performed_by_user_id);
create index if not exists idx_business_team_members_added_by_owner
  on public.business_team_members(added_by_owner_id);
create index if not exists idx_business_team_members_invitation
  on public.business_team_members(invitation_id);

drop policy if exists business_profiles_select_authenticated_context on public.business_profiles;
create policy business_profiles_select_authenticated_context
on public.business_profiles
for select
to authenticated
using (
  public_status = 'published'
  or owner_user_id = (select auth.uid())
  or exists (
    select 1 from public.business_team_members tm
    where tm.business_id = business_profiles.id
      and tm.user_id = (select auth.uid())
      and tm.status = 'active'
  )
  or exists (
    select 1 from public.business_customers bc
    where bc.business_id = business_profiles.id
      and bc.user_id = (select auth.uid())
      and bc.status = 'active'
  )
);

drop policy if exists business_team_members_select_context on public.business_team_members;
create policy business_team_members_select_context
on public.business_team_members
for select
to authenticated
using (
  user_id = (select auth.uid())
  or exists (
    select 1 from public.business_profiles bp
    where bp.id = business_team_members.business_id
      and bp.owner_user_id = (select auth.uid())
  )
);

drop policy if exists business_customers_select_context on public.business_customers;
create policy business_customers_select_context
on public.business_customers
for select
to authenticated
using (
  user_id = (select auth.uid())
  or exists (
    select 1 from public.business_profiles bp
    where bp.id = business_customers.business_id
      and bp.owner_user_id = (select auth.uid())
  )
);

drop policy if exists business_invitations_select_context on public.business_invitations;
create policy business_invitations_select_context
on public.business_invitations
for select
to authenticated
using (
  invited_user_id = (select auth.uid())
  or invited_phone = (
    select p.phone from public.profiles p where p.id = (select auth.uid())
  )
  or created_by_user_id = (select auth.uid())
  or exists (
    select 1 from public.business_profiles bp
    where bp.id = business_invitations.business_id
      and bp.owner_user_id = (select auth.uid())
  )
);

drop policy if exists business_operation_links_select_context on public.business_operation_links;
create policy business_operation_links_select_context
on public.business_operation_links
for select
to authenticated
using (
  linked_by_user_id = (select auth.uid())
  or exists (
    select 1 from public.business_profiles bp
    where bp.id = business_operation_links.business_id
      and bp.owner_user_id = (select auth.uid())
  )
  or exists (
    select 1 from public.business_team_members tm
    where tm.business_id = business_operation_links.business_id
      and tm.user_id = (select auth.uid())
      and tm.status = 'active'
  )
);

drop policy if exists business_media_assets_select_context on public.business_media_assets;
create policy business_media_assets_select_context
on public.business_media_assets
for select
to authenticated
using (
  status = 'active'
  and exists (
    select 1 from public.business_profiles bp
    where bp.id = business_media_assets.business_id
      and (
        bp.public_status = 'published'
        or bp.owner_user_id = (select auth.uid())
        or exists (
          select 1 from public.business_team_members tm
          where tm.business_id = bp.id
            and tm.user_id = (select auth.uid())
            and tm.status = 'active'
        )
      )
  )
);

drop policy if exists business_catalog_items_select_context on public.business_catalog_items;
create policy business_catalog_items_select_context
on public.business_catalog_items
for select
to authenticated
using (
  (
    status = 'active'
    and exists (
      select 1 from public.business_profiles bp
      where bp.id = business_catalog_items.business_id
        and bp.public_status = 'published'
    )
  )
  or exists (
    select 1 from public.business_profiles bp
    where bp.id = business_catalog_items.business_id
      and bp.owner_user_id = (select auth.uid())
  )
);

drop policy if exists business_inquiries_select_context on public.business_inquiries;
create policy business_inquiries_select_context
on public.business_inquiries
for select
to authenticated
using (
  customer_user_id = (select auth.uid())
  or exists (
    select 1 from public.business_profiles bp
    where bp.id = business_inquiries.business_id
      and bp.owner_user_id = (select auth.uid())
  )
);

drop policy if exists business_team_actions_select_owner on public.business_team_actions;
create policy business_team_actions_select_owner
on public.business_team_actions
for select
to authenticated
using (
  member_user_id = (select auth.uid())
  or exists (
    select 1 from public.business_profiles bp
    where bp.id = business_team_actions.business_id
      and bp.owner_user_id = (select auth.uid())
  )
);

commit;;

# Workspace Foundation v2 — Review Gate

Status: prepared on `experimental`; not applied to Supabase.

## Product contract

- SANAD keeps one production Supabase project: `sanad_verify_v3`.
- A workspace is an internal authorization boundary, not a separate product.
- One workspace can contain multiple business profiles.
- A user can belong to multiple workspaces.
- Existing business team membership stays business-scoped and does not silently
  become workspace membership.
- Existing customers never receive workspace access.

## Migration contents

The migration `20260710130348_business_workspace_foundation_v2.sql`:

1. Creates `business_workspaces` and `business_workspace_members`.
2. Adds `business_profiles.workspace_id`.
3. Backfills one default workspace per existing business owner.
4. Backfills exactly one active owner membership for each default workspace.
5. Makes `workspace_id` required only after validating the backfill.
6. Finds and removes the real single-column unique constraint/index on
   `business_profiles.owner_user_id` without assuming its name.
7. Keeps existing business team members business-scoped.
8. Replaces the three workspace-sensitive RPCs while preserving the response
   keys used by the current frontend.
9. Revokes anonymous execution on the replaced authenticated RPCs.
10. Creates non-recursive RLS helpers in the non-exposed `private` schema.

## Compatibility decisions

- `create_business_profile` keeps all existing parameters and adds optional
  `p_workspace_id` at the end.
- Existing calls that omit `p_workspace_id` use the owner's default workspace.
- `get_user_business_contexts` keeps `owned_businesses`, `team_businesses`,
  `customer_businesses`, and `pending_invitations`, and adds `workspaces` and
  `accessible_businesses`.
- `get_linkable_businesses_for_user` keeps legacy business-team access while
  preferring explicit workspace permissions.
- No catalog schema or UI is included in this migration.

## Mandatory checks before approval

Run read-only queries on production immediately before applying:

```sql
select count(*) as businesses from public.business_profiles;

select owner_user_id, count(*)
from public.business_profiles
group by owner_user_id
order by count(*) desc;

select conname, pg_get_constraintdef(oid)
from pg_constraint
where conrelid = 'public.business_profiles'::regclass
order by conname;
```

After applying, verify:

```sql
select
  (select count(*) from public.business_profiles) as businesses,
  (select count(*) from public.business_workspaces) as workspaces,
  (select count(*) from public.business_workspace_members where role = 'owner') as owners,
  (select count(*) from public.business_profiles where workspace_id is null) as unlinked_businesses;

select owner_user_id, count(*)
from public.business_profiles
group by owner_user_id
having count(*) > 1;
```

Expected for the current production data:

- Existing business count remains unchanged.
- One existing owner produces one default workspace.
- `unlinked_businesses = 0`.
- No customer or existing business team member is inserted into
  `business_workspace_members` automatically.

## Explicitly deferred

- Applying the migration to production.
- Active-business selection in the frontend.
- Workspace member invitation/management UI.
- Internal catalog categories, items, images, and cart.
- Android and financial-operation pipeline changes.

# SANAD — Development Expansion Readiness Baseline

Date: 2026-09-14

## Purpose

This document freezes the technical baseline before the next broad development phase. It is intentionally non-destructive: production data and production schema are not changed by this preparation step.

## Sources of truth

- Repository: `mbhkm25/S`
- Production branch: `main`
- Integration branch: `develop`
- Production Supabase project: `sanad_verify_v3`
- Production Supabase project ref: `hudbzlgclghlhazlduas`
- Production API origin: `https://api.sanadflow.com`
- Development Supabase branch: `develop`
- Development Supabase branch id: `0938065d-0030-485e-922a-383095860d2f`
- Development Supabase project ref: `abedoqbtqdaflkdpyxgy`
- Development Supabase API URL: `https://abedoqbtqdaflkdpyxgy.supabase.co`

## Repository baseline

- `main` baseline commit at preparation time: `4510cc13c5452de06e223ce6b444f76c4c3b660a`
- `main` is protected by repository rules requiring pull requests and the status checks:
  - `Application and PWA`
  - `Supabase migrations and Edge Functions`
- A long-lived `develop` integration branch has been created from the production baseline.
- `quality-gate.yml` now runs on pushes to both `main` and `develop`, and on pull requests.

## Required development flow

1. Do not develop broad features directly on `main`.
2. Branch from `develop` using a focused branch name, e.g. `feat/<capability>` or `fix/<problem>`.
3. Keep database changes in `supabase/migrations` and Edge Function changes in `supabase/functions`.
4. Every feature branch must pass TypeScript, route checks, build checks, migration layout checks, migration-history tests, and Deno checks for critical Edge Functions.
5. Apply schema-changing migrations to the Supabase `develop` branch first, never directly to production during feature development.
6. Merge feature branches into GitHub `develop` first.
7. Promote `develop` to `main` only through a pull request after integration testing.
8. Production deployment remains sourced from `main` only.

## Supabase production baseline

- PostgreSQL: 17
- Region: `eu-central-1`
- Project state at preparation time: active/healthy.
- RLS is enabled across the core exposed tables inspected during preparation.
- Production migration history currently ends with `20260815184635_sanad_ops_watch_hourly`.

## Supabase development branch

The development database branch has been created and is healthy.

- Name: `develop`
- Branch id: `0938065d-0030-485e-922a-383095860d2f`
- Project ref: `abedoqbtqdaflkdpyxgy`
- API URL: `https://abedoqbtqdaflkdpyxgy.supabase.co`
- Parent project ref: `hudbzlgclghlhazlduas`
- Production data copied: **no** (`with_data=false`)
- Branch state after creation: `FUNCTIONS_DEPLOYED` / `ACTIVE_HEALTHY`
- Confirmed branch cost at creation time: `$0.01344/hour` while the branch exists.

The branch inherited the production Supabase migration history, including the production-side migration identity `20260815184635_sanad_ops_watch_hourly`.

Use this branch as the default database target for new schema, RLS, RPC, trigger, and Edge Function development. Do not hardcode its ref into production runtime code.

## Migration-history warning

A migration identity discrepancy was observed during baseline inspection:

- Production and the newly created development branch report `20260815184635_sanad_ops_watch_hourly`.
- The repository currently contains `20260815184500_sanad_ops_watch_hourly.sql`.

Do **not** renumber, delete, or replay either side casually. Before the first schema-changing feature in the new phase, run the repository migration audit against the development branch and reconcile the history deliberately. Treat production schema as authoritative until reconciliation is complete.

## Security baseline / debt register

Supabase security advisor results need classification rather than blind remediation:

- Many RLS-enabled tables have no direct RLS policy. Several are intentionally RPC-only/service-only tables, so this is not automatically a defect.
- The advisor reports public/authenticated access to a substantial number of `SECURITY DEFINER` functions. Each must be classified as one of:
  1. intentionally public/authenticated with explicit internal authorization checks;
  2. authenticated-only but missing sufficient ownership/role validation;
  3. service/admin-only and therefore requiring EXECUTE revocation or relocation to a private schema.

No mass permission changes should be made in production without this classification because these functions form part of the live application API.

Supabase security-linter references:

- https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy
- https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable
- https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable

## Performance baseline / debt register

The performance advisor currently reports:

- 43 foreign keys without covering indexes.
- 1 RLS policy using an auth function without an init-plan-friendly `(select auth.<function>())` form.
- A large set of unused indexes. These are observations, **not** deletion candidates by default; usage history, traffic paths, and release age must be reviewed first.
- Auth DB connection allocation is configured as an absolute number rather than a percentage.

Performance-linter references:

- https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys
- https://supabase.com/docs/guides/database/database-linter?lint=0003_auth_rls_initplan
- https://supabase.com/docs/guides/deployment/going-into-prod

## Database-development rule for the expansion phase

Production must not be used as the experimentation environment for broad schema work.

The GitHub integration branch and Supabase database branch are now paired conceptually:

- GitHub: `develop`
- Supabase: `develop` (`abedoqbtqdaflkdpyxgy`)

For every schema-changing feature:

1. author the SQL as a migration in the feature branch;
2. apply it to Supabase `develop`;
3. verify behavior, RLS, RPC authorization, indexes, and advisors there;
4. merge the feature branch into GitHub `develop` after CI passes;
5. promote to production only after integration acceptance and migration-history reconciliation.

## First-phase gates before feature work

- [x] GitHub `develop` integration branch created from production baseline.
- [x] CI quality gate runs on `develop`.
- [x] Production Supabase project identified and inspected.
- [x] Security and performance advisor baselines captured.
- [x] Supabase `develop` branch created and verified healthy.
- [x] Supabase `develop` inherited the current production migration history.
- [ ] Production/repository migration-history discrepancy reconciled.
- [ ] `SECURITY DEFINER` RPC inventory classified by intended audience and authorization model.
- [ ] Priority foreign-key indexes selected based on actual query paths, not advisor count alone.

## Change-control policy

For this phase, every change should be reversible or additive by default. Destructive DDL, large data rewrites, auth-model changes, RLS changes, storage-policy changes, and `SECURITY DEFINER` changes require explicit review and verification before production promotion.

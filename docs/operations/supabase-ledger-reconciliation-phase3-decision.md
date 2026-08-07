# Phase 3 reconciliation decision gate

## Current decision

**NO-GO for production mutation. GO for final reviewed preparation and isolated CLI simulation.**

PR #176 merged the canonical repository cutover into `main` at `e0d87f052f47e8bb592baeeb739e4ae2effe53bb`. The canonical baseline is now the active repository migration and the historical migrations are archived. The final PR #176 validation passed both application/PWA and Supabase checks.

The production migration ledger has not been mutated. Its last approved read-only fingerprint remains 311 rows with the pinned aggregate in the Phase 3 manifest. Repository readiness does not authorize production history repair.

## Completed repository gates

- canonical baseline activated under `supabase/migrations`;
- historical migration source archived outside the active chain;
- canonical payload hash and size pinned;
- isolated canonical replay completed;
- final repository validation completed after synchronization with `main`;
- deterministic read-only production-ledger preflight committed.

## What this preparation authorizes

- refresh of the before/after manifests;
- deterministic generation of candidate `supabase migration repair` commands;
- isolated simulation of the exact repair sequence;
- review and proof of the rollback path;
- capture of backup, restore, reviewer, and maintenance-window evidence.

## What this preparation does not authorize

- `supabase migration repair` against production;
- direct writes to `supabase_migrations.schema_migrations`;
- production DDL or application-data writes;
- production `db push`;
- Edge Function deployment;
- merge or deployment of PR #170.

## Promotion criteria

The decision becomes **GO for production ledger reconciliation** only when all of the following are recorded against one frozen commit and one Supabase CLI version:

1. a current restore-grade production backup identifier and timestamp;
2. a verified restore path and independently reviewed restoration procedure;
3. two independent approvals of the exact before-state, expected-after state, command manifest, and rollback manifest;
4. an approved maintenance window;
5. database/migration deployments paused;
6. isolated simulation of the exact `migration repair` sequence from the approved 311-row ledger state;
7. proof of the rollback procedure in the isolated simulation;
8. immediate read-only production preflight equality;
9. frozen reviewed repository SHA, CLI version, project ref, commands, and expected outputs.

Any missing item keeps the decision at **NO-GO**.

## PR #170 gate

PR #170 remains a draft and must not be merged merely because its earlier CI was green. After successful ledger reconciliation and post-checks, it must be refreshed onto the reconciled `main`, replayed in a fresh isolated Supabase environment, rerun through required CI, have `META_APP_SECRET` verified, pass a real signed Meta media webhook test, and receive release approval before merge.

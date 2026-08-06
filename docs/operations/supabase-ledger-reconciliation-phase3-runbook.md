# Supabase migration-ledger reconciliation — Phase 3 runbook

- Project: `hudbzlgclghlhazlduas`
- Repository: `mbhkm25/S`
- Baseline version: `20260806150947`
- Status: preparation only; production mutation disabled
- Depends on: ADR-002 and merged PR #173

## Purpose

Replace the non-replayable historical migration source with the replay-verified canonical baseline without changing the production application schema or business data. This is a history-maintenance operation, not a schema deployment.

## Current verified production state

The read-only preflight on 2026-08-06 returned:

| Field | Expected value |
| --- | --- |
| Migration rows | 311 |
| First version | `20260702130842` |
| Last version | `20260806063921` |
| Statement bytes | `1764166` |
| Ledger manifest SHA-256 | `60285fa75234648a39cf3de5f139c18e61440d04876048c28f54f0eef30d6903` |

Any difference is an immediate abort. The preflight is implemented in `scripts/preflight-supabase-ledger-reconciliation.sql`.

## Target repository model

The approved cutover branch must eventually contain:

1. The canonical baseline assembled as one active migration:
   `supabase/migrations/20260806150947_canonical_schema_baseline.sql`.
2. Historical migration files moved unchanged to a non-active archive directory.
3. Only migrations newer than the canonical baseline remaining active after it.
4. CI changed from “expected drift failure” to strict alignment.
5. A fresh empty-database replay proving the active migration chain recreates the verified schema.

This preparation PR does not perform those moves because activation and ledger mutation must be reviewed as one atomic change set.

## Required approvals and evidence

Execution is prohibited until all items are complete:

- [ ] A current database backup exists.
- [ ] The restore path has been tested or independently verified.
- [ ] Two independent reviewers approve the exact manifest and cutover diff.
- [ ] A maintenance window is approved.
- [ ] Database deployments are paused.
- [ ] The active baseline migration has replayed successfully in an empty isolated Supabase environment.
- [ ] Schema fingerprints match the validation evidence committed by PR #173.
- [ ] The read-only preflight is rerun immediately before mutation and returns `matches_approved_manifest = true`.

## Cutover sequence

### A. Repository preparation

1. Assemble the two committed baseline parts byte-for-byte.
2. Verify the assembled SHA-256 against the committed validation evidence.
3. Move the old active migration files to an archive without altering their bytes.
4. Activate the canonical baseline under `supabase/migrations`.
5. Preserve only genuinely post-baseline migrations after it.
6. Run the migration integrity gate and empty-project replay.
7. Freeze the reviewed commit SHA.

### B. Production preflight

1. Confirm the production project reference.
2. Confirm no deployment or migration job is active.
3. Capture backup evidence and restore instructions.
4. Run `scripts/preflight-supabase-ledger-reconciliation.sql` in read-only mode.
5. Compare the returned count, bounds, byte count, and aggregate hash with the manifest.
6. Reconfirm the production schema fingerprint is unchanged from Phase 2 evidence.

### C. History maintenance

Use the current Supabase CLI discovered through `supabase migration repair --help`; do not rely on remembered flags. The reviewed command manifest must:

1. Mark every legacy production ledger version as reverted.
2. Mark `20260806150947` as applied from the activated canonical baseline file.
3. Avoid `db push` during the mutation itself.
4. Stop immediately on the first unexpected result.

Direct ad-hoc SQL writes to `supabase_migrations.schema_migrations` are prohibited unless the reviewed CLI path is proven unavailable and a replacement procedure receives separate approval.

### D. Immediate post-checks

1. `supabase migration list` shows the canonical baseline aligned locally and remotely.
2. `supabase db push --dry-run` reports no historical migration pending.
3. The migration integrity gate exits successfully.
4. The scoped schema fingerprint is unchanged.
5. Critical RPC, trigger, RLS, Storage, and application smoke tests pass.
6. Counts and hashes for application rows and original-document metadata remain unchanged.

## Abort and rollback

Abort before mutation if any required evidence is absent or any preflight value differs.

If mutation starts and a post-check fails:

1. Keep deployments paused.
2. Preserve command output and the failed ledger snapshot.
3. Restore the ledger using the reviewed before-manifest or the verified backup procedure.
4. Re-run schema and application smoke tests.
5. Do not proceed to PR #170 until the incident is reviewed.

## Explicit non-goals

This runbook does not authorize:

- production schema changes;
- application-row changes;
- Edge Function deployment;
- merging or deploying PR #170;
- bypassing migration integrity CI;
- using `db push` as an exploratory command against production.

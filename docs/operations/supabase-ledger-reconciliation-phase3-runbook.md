# Supabase migration-ledger reconciliation — Phase 3 runbook

- Project: `hudbzlgclghlhazlduas`
- Repository: `mbhkm25/S`
- Canonical baseline version: `20260806150947`
- Repository cutover: merged via PR #176 at `e0d87f052f47e8bb592baeeb739e4ae2effe53bb`
- Status: final preparation only; production mutation disabled

## Purpose

Reconcile the remote Supabase migration-history ledger with the replay-verified canonical repository baseline without changing the production application schema or business data. This is history maintenance, not schema deployment.

## Repository state after PR #176

The repository cutover is complete:

1. `supabase/migrations/20260806150947_canonical_schema_baseline.sql` is the active canonical migration.
2. Historical migrations are archived under `supabase/migrations_archive/pre_canonical_20260806`.
3. The canonical payload is pinned at 1,375,100 bytes and SHA-256 `8d66799f37b3177644efe9ab2a5a70e3499f26c102f59b65c674fc96c8d69dcc`.
4. The canonical migration was replayed in an isolated Supabase environment and reproduced the approved scoped schema.
5. Final PR #176 validation run `31170860119` passed both `Application and PWA` and `Supabase migrations and Edge Functions`.

None of those repository operations changed production migration history.

## Approved production before-state

The last read-only preflight returned:

| Field | Expected value |
| --- | --- |
| Migration rows | 311 |
| First version | `20260702130842` |
| Last version | `20260806063921` |
| Statement bytes | `1764166` |
| Ledger manifest SHA-256 | `60285fa75234648a39cf3de5f139c18e61440d04876048c28f54f0eef30d6903` |

The immediate preflight must be rerun before production mutation. Any difference is an automatic abort.

## Expected after-state

The structural target is defined in `docs/operations/supabase-ledger-reconciliation-phase3-expected-after.json`:

- canonical version `20260806150947` is the sole historical baseline represented remotely;
- zero legacy pre-canonical versions remain in the remote ledger;
- local and remote migration timestamps align;
- `supabase db push --dry-run` reports no historical migration work;
- production schema fingerprint is unchanged;
- application/business rows and original-document metadata are unchanged.

The exact remote migration-row payload fingerprint is intentionally not frozen yet. It must be captured and proven during an isolated simulation using the exact Supabase CLI version selected for the maintenance window.

## Required production controls

Execution is prohibited until every item is complete:

- [ ] Current restore-grade backup created and identifier/timestamp recorded.
- [ ] Restore path tested or independently verified.
- [ ] Reviewer 1 approves the exact evidence and command set.
- [ ] Reviewer 2 independently approves the exact evidence and command set.
- [ ] Maintenance window approved.
- [ ] Database/migration deployments paused.
- [ ] Exact Supabase CLI version frozen.
- [ ] Candidate repair sequence simulated against an isolated copy of the approved ledger state.
- [ ] Rollback procedure proven in that isolated simulation.
- [ ] Exact command manifest and expected outputs frozen.
- [ ] Immediate production preflight returns equality.

## Phase A — deterministic preparation

1. Pin the repository SHA and production project ref.
2. Validate the committed 311-row history evidence.
3. Generate the candidate command set from `docs/operations/supabase-production-migration-history-2026-08-06.json` using `scripts/build-supabase-ledger-reconciliation-command-manifest.mjs`.
4. Record `supabase --version` and `supabase migration repair --help` output for review.
5. Confirm the CLI semantics: `reverted` removes migration-history records and `applied` inserts migration-history records without running migration SQL.
6. Do not execute generated commands against production during this phase.

## Phase B — isolated CLI repair simulation

The simulation must begin from an isolated database whose migration-history table reproduces the approved 311-row before-state.

1. Verify the isolated before-state matches the approved count, bounds, byte count, and aggregate fingerprint.
2. Run the exact candidate legacy-version `--status reverted` command using the frozen CLI version.
3. Stop and capture evidence if the command partially succeeds, fails, or produces unexpected output.
4. Mark canonical version `20260806150947` as `--status applied` only after the legacy step succeeds.
5. Run `supabase migration list` and the expected-after verification query.
6. Run `supabase db push --dry-run`; it must show no historical migration pending.
7. Reconfirm schema fingerprint and protected data counts are unchanged.
8. Exercise the rollback procedure and prove it restores the approved before-state.
9. Repeat the forward repair once more after rollback to prove repeatability.
10. Commit the exact CLI version, commands, outputs, after-state evidence, and rollback evidence before production can become GO.

No assumption of transaction-level atomicity is allowed unless the selected CLI version and simulation prove it.

## Phase C — production preflight

During the approved maintenance window, before any mutation:

1. Confirm project ref `hudbzlgclghlhazlduas`.
2. Confirm no database deployment or migration job is active.
3. Record backup evidence and restore instructions.
4. Run `scripts/preflight-supabase-ledger-reconciliation.sql` read-only.
5. Require `matches_approved_manifest = true`.
6. Capture the scoped schema fingerprint and protected data counts/hashes used by the reviewed manifest.
7. Reconfirm the exact repository SHA, CLI version, command manifest, and two approvals.

Any mismatch or missing evidence is an immediate abort.

## Phase D — production history maintenance

Only after a separate explicit production execution approval:

1. Keep deployments paused.
2. Execute only the frozen, simulation-proven `supabase migration repair` commands.
3. Do not run production DDL.
4. Do not run `supabase db push` as an applying command.
5. Do not deploy Edge Functions.
6. Stop on the first output that differs from the reviewed expected output.

Direct ad-hoc SQL writes to `supabase_migrations.schema_migrations` remain prohibited unless the reviewed CLI path is proven unavailable and a replacement procedure receives separate approval.

## Phase E — immediate post-checks

Before deployments resume:

1. Expected-after ledger verification passes.
2. `supabase migration list` aligns local and remote timestamps.
3. `supabase db push --dry-run` reports no historical migration pending.
4. Migration integrity checks pass.
5. Scoped schema fingerprint equals the pre-mutation fingerprint.
6. Critical RPC, trigger, RLS, Storage, and application smoke tests pass.
7. Protected application-row and original-document metadata counts/hashes equal their pre-mutation values.
8. All command output and evidence are archived.

## Abort and rollback

Abort before mutation if any gate is incomplete or the immediate preflight differs from the approved before-state.

If production mutation has started and any post-check fails:

1. Keep deployments paused.
2. Preserve command output and capture the failed ledger state read-only.
3. Follow `docs/operations/supabase-ledger-reconciliation-phase3-rollback-manifest.md` exactly.
4. The restore-grade backup is the authoritative recovery path unless a ledger-only rollback was proven byte-for-byte/equivalent in isolated simulation and separately approved.
5. Re-run ledger, schema, and application smoke checks after recovery.
6. Do not proceed to PR #170 until the incident is reviewed and the production state is re-approved.

## PR #170 release sequence

PR #170 is downstream of this reconciliation. After production ledger reconciliation succeeds:

1. refresh/rebase PR #170 onto reconciled `main`;
2. replay its new migrations in a fresh isolated Supabase environment;
3. rerun all required CI on the refreshed head;
4. configure and verify `META_APP_SECRET`;
5. pass a real signed Meta media webhook end-to-end test;
6. receive release approval;
7. merge PR #170 into `main`;
8. deploy only from the merged `main` commit.

## Explicit non-goals

This runbook does not itself authorize production mutation, production schema changes, application-row changes, Edge Function deployment, merging PR #170, bypassing CI, or using `db push` as an exploratory/applying production command.

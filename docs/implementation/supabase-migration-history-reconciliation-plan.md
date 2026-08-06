# Supabase migration history reconciliation plan

- Owner: SANAD engineering
- Date: 2026-08-06
- Status: Phase 1 implemented locally; production unchanged
- Depends on: ADR-002
- Blocks: database deployment of PR #170

## Goal

Restore a single, replayable, reviewable migration history in GitHub without changing production schema or migration metadata until the proposed state has been independently verified.

## Phase status

| Phase | Scope | Status | Exit criterion |
| --- | --- | --- | --- |
| 1. Evidence and guardrail | Read-only snapshot, auditor, tests, CI gate | In progress | Draft PR green; gate demonstrably fails closed |
| 2. Canonical baseline | Authorized schema-only extraction and normalized baseline | Blocked | Empty isolated replay matches production schema |
| 3. Ledger reconciliation | Reviewed history manifest and maintenance window | Blocked | Backup, dual approval, exact post-checks |
| 4. Pipeline revalidation | Rebase PR #170 and run migration/load/failure tests | Blocked | Fresh branch tests and production-safe release decision |

## Phase 1 checklist

- [x] Capture production migration metadata read-only.
- [x] Exclude SQL bodies, application rows, and secrets from the snapshot.
- [x] Hash every production statement fragment with SHA-256.
- [x] Build an offline comparison tool.
- [x] Reject invalid versions, duplicate versions, changed historical SQL, and ambiguous pending files.
- [x] Add unit coverage for aligned, mismatched, renamed, duplicated-name, and unsafe-snapshot cases.
- [x] Add CI evidence artifacts and an explicit expected failure code for current drift.
- [ ] Obtain independent PR review and green CI.
- [ ] Record the PR and CI result in the central Notion execution log.

## Phase 2 procedure

1. Confirm a fresh approval for any paid Supabase branch.
2. Use an authorized, non-logged credential context to capture the current schema only; do not export table rows or secrets.
3. Define the schema scope and managed exclusions explicitly. Include functions, triggers, policies, grants, types, extensions, storage metadata required by the app, cron definitions, and RPC signatures.
4. Review the generated SQL for environment-specific ownership, URLs, tokens, security-definer search paths, and unsupported extension state.
5. Add a deterministic baseline and a manifest mapping every preserved post-baseline migration.
6. Replay from empty into an isolated project.
7. Compare normalized schema fingerprints, database tests, security advisors, Edge Function contracts, and required seed-independent behavior against production.
8. Delete the paid branch immediately after evidence collection and record its lifetime.

## Phase 3 change controls

Production history maintenance is a separate operation and is not part of Phase 1 or Phase 2.

Required before execution:

- verified backup and restore path;
- exact version-by-version mutation manifest with expected before/after hashes;
- two reviewers and an approved maintenance window;
- paused database deployments;
- read-only preflight repeated immediately before the change;
- abort on any unexpected version, hash, schema fingerprint, active deployment, or backup failure.

Post-change checks:

- production migration ledger matches the committed canonical manifest;
- deploy gate returns `0`;
- schema fingerprint is unchanged by history-only operations;
- critical RPCs, triggers, RLS policies, storage access, and Edge Function database calls pass smoke tests;
- no application row or original document metadata changed.

## Rollback model

Phase 1 is code-only and can be reverted by reverting its commit. Phase 2 changes only an isolated project. Phase 3 requires a database backup because migration-ledger mutations cannot be treated as safely reversible from memory. If a post-check fails, stop deployment, preserve evidence, restore the ledger from the approved manifest or restore the verified backup according to the reviewed runbook.

## Acceptance criteria

- A new developer can create an empty isolated Supabase project and replay the committed baseline and later migrations without manual SQL.
- The resulting scoped schema is equivalent to production under a deterministic comparison.
- `npm run gate:migrations` passes on the reconciled branch and fails for fixture mismatches.
- No production database change exists outside a tracked, reviewed migration or the explicitly approved one-time history-maintenance manifest.
- PR #170 is rebased only after these criteria pass and is then retested end to end.

## Current blockers

- The current ledger is not an empty-database baseline.
- Only 3 of 311 production entries have an exact local version/name/content match.
- Phase 2 needs authorized schema-only access and, if a paid branch is used, fresh cost approval.
- Phase 3 needs a separate production mutation approval; none has been granted.

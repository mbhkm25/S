# Phase 3 execution checklist

## Repository preparation

- [x] PR #173 merged and production ledger audited read-only.
- [x] Expected before-state aggregate pinned.
- [x] Read-only preflight committed.
- [x] Abort conditions documented.
- [x] Canonical baseline activated via PR #176.
- [x] Historical migrations archived outside the active chain.
- [x] Canonical migration replayed in an isolated Supabase environment.
- [x] Canonical payload size/hash pinned.
- [x] Final PR #176 validation passed after synchronization with `main`.
- [x] Expected-after structural target documented.
- [x] Candidate command-manifest generator documented.
- [x] Rollback policy hardened so unproven ledger-only recovery cannot replace backup recovery.

## Isolated repair simulation

- [ ] Freeze exact Supabase CLI version.
- [ ] Capture `supabase migration repair --help` for that version.
- [ ] Generate exact candidate commands from the committed 311-row production-history evidence.
- [ ] Reproduce the approved 311-row ledger state in an isolated database.
- [ ] Verify isolated before-state equality.
- [ ] Run exact legacy `--status reverted` candidate command.
- [ ] Mark canonical version `20260806150947` applied.
- [ ] Verify expected-after ledger structure.
- [ ] Verify `supabase migration list` alignment.
- [ ] Verify `supabase db push --dry-run` has no historical work.
- [ ] Verify schema fingerprint is unchanged.
- [ ] Verify protected application/original-document data checks are unchanged.
- [ ] Prove rollback restores the approved before-state.
- [ ] Repeat forward repair after rollback.
- [ ] Freeze exact commands, outputs, after-state evidence, and rollback evidence.

## Production safeguards

- [ ] Restore-grade backup completed; identifier and timestamp recorded.
- [ ] Restore path independently verified.
- [ ] Reviewer 1 approval recorded.
- [ ] Reviewer 2 approval recorded.
- [ ] Maintenance window approved.
- [ ] Database/migration deployments paused.
- [ ] Exact repository SHA and CLI version frozen.
- [ ] Immediate read-only preflight returns equality.
- [ ] Pre-mutation schema fingerprint captured.
- [ ] Pre-mutation protected data counts/hashes captured.
- [ ] Separate explicit production execution approval received.

## Production reconciliation verification

- [ ] Legacy ledger versions reverted only through the reviewed CLI command set.
- [ ] Canonical baseline version marked applied.
- [ ] Expected-after verification passes.
- [ ] Local and remote migration lists align.
- [ ] `db push --dry-run` reports no historical work.
- [ ] Schema fingerprint unchanged.
- [ ] Critical RPCs and triggers pass.
- [ ] RLS and Storage smoke tests pass.
- [ ] Application and original-document data checks pass.
- [ ] Evidence archived.
- [ ] Deployments resumed only after every post-check passes.

## PR #170 release gates

- [ ] Production ledger reconciliation completed successfully.
- [ ] PR #170 refreshed/rebased onto reconciled `main`.
- [ ] PR #170 new migrations replayed in a fresh isolated environment.
- [ ] Required CI rerun on the refreshed PR #170 head.
- [ ] `META_APP_SECRET` configured and verified.
- [ ] Real signed Meta media webhook end-to-end test passes.
- [ ] Release approval recorded.
- [ ] PR #170 changed from draft to ready only after all release gates above are satisfied.
- [ ] PR #170 merged to `main`.
- [ ] Deployment performed only from the merged `main` commit.

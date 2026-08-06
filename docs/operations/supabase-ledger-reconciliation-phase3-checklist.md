# Phase 3 execution checklist

## Preparation

- [x] PR #173 merged into `main`.
- [x] Production ledger rechecked read-only.
- [x] Expected before-state aggregate pinned.
- [x] Read-only preflight committed.
- [x] Abort conditions documented.
- [x] Rollback model documented.
- [ ] Canonical baseline activated in a review branch.
- [ ] Historical migrations archived byte-for-byte.
- [ ] Active chain replayed from empty.
- [ ] Integrity gate changed to strict pass.

## Production safeguards

- [ ] Backup completed and timestamp recorded.
- [ ] Restore path independently verified.
- [ ] Reviewer 1 approval recorded.
- [ ] Reviewer 2 approval recorded.
- [ ] Maintenance window approved.
- [ ] Database deployments paused.
- [ ] Exact command manifest frozen.
- [ ] Immediate preflight returns equality.

## Cutover verification

- [ ] Legacy ledger versions reverted through reviewed Supabase CLI commands.
- [ ] Canonical baseline version marked applied.
- [ ] Local and remote migration lists align.
- [ ] `db push --dry-run` reports no historical work.
- [ ] Schema fingerprint unchanged.
- [ ] Critical RPCs and triggers pass.
- [ ] RLS and Storage smoke tests pass.
- [ ] Application and original-document data checks pass.
- [ ] Deployments resumed only after all checks pass.

## Pipeline follow-up

- [ ] Rebase PR #170 on the reconciled `main`.
- [ ] Replay its new migrations in a fresh isolated environment.
- [ ] Configure and verify `META_APP_SECRET`.
- [ ] Run a real signed Meta media webhook test.
- [ ] Merge and deploy only from `main` after release approval.

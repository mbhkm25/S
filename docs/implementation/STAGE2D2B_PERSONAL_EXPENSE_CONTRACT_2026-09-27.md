# Stage 2D.2-B — canonical personal expense revision, backend gate

Baseline: `d4dc1b4aa9b44bd58bffa333e447d7b3f8687671`; tracker #412.
Status: implementation candidate, not merged or installed. This is the first backend slice of 2D.2-B, not full voice/form convergence.

## Source and release reconciliation

- Read the complete 2026-09-27 handoff and its seven named architecture/execution references; current main includes accepted #410 at `7b7368140fbd5c1bdef43a08cb0181c63ccee0b4`.
- #410 final head `4f2b09c176f7153083532ff4fea101067512bcd2`: all six recorded Actions workflows successful, independently retrieved.
- Connected `sanad_verify_v3` (`hudbzlgclghlhazlduas`) ACTIVE_HEALTHY. Read-only ledger query confirms `20260926214052`, `20260926214745`, `20260926222117`.
- Live create/approve/cancel function bodies exactly match the original canonical migration. Actual action/event/work-item constraints and origin/event/work-item-broadcast triggers were inspected.
- Latest guarded Web deployment run **36262108025** succeeded on **`c14414a9dc24873ee5d8c4dcaede710fd67e22d3`**, before #410. No later Web workflow run appears in the workflow-specific latest-run response. Thus **2D.2-A is source-merged and DB-applied, but not released through this guarded Web workflow**. Direct live served bytes and owner-authenticated smoke are not asserted.
- Prepare the old UI release independently. Do not fold this pending backend candidate into that release. No Web, Edge, database or financial mutation was performed during this audit.

## Implementation

`private.normalize_sanad_agent_action_v1` extracts the existing complete normalized-payload and review builder. It has no persistence or execution side effects, uses `auth.uid()`, revalidates the original active owned thread and attachments, and has no anonymous/authenticated EXECUTE grant. Existing create and the new edit RPC share it; commercial/income/transfer semantics remain in this one builder.

`update_my_sanad_agent_action_draft_v2(action_id, expected_version, payload)` initially accepts **personal expense only**. It requires the complete seven-field editable payload: transaction_type, amount, currency, account_id, category_id, description, transaction_at. Optional values must be explicit null. Extra keys, origin/metadata/attachment injection and variant changes are rejected. Date must be present and finite. Existing amount/account/currency/category authorization runs again. Caller-provided review is never accepted.

The original action is locked before checking review status/version. Canonical ID, actor, thread, business, metadata, attachments and status remain unchanged. A real normalized-payload or full-review change increments version, replaces the server review, recomputes the existing fingerprint and emits one content-free edited event. No-op save does not increment. Both pre-check and the existing unique active fingerprint index reject collision without cancel/recreate. Existing pending work item is refreshed in place; actual existing event projection produces `agent.action.edited`.

Create uses `ON CONFLICT ... DO NOTHING` and returns the concurrent winning active draft instead of surfacing a duplicate insert error. Existing fingerprint semantics are retained; adding attachments to a logically identical draft is not introduced here.

Live audit found that original approve/cancel comparison with NULL expected version could skip the version check. Both RPCs now reject NULL/nonpositive expected versions before the existing lifecycle. Their deterministic financial execution bodies are unchanged. Tests never invoke a real executor.

## Verification

`npm run test:draft-contract` executes actual SQL migrations in isolated PGlite PostgreSQL. Dependency tables are synthetic and deliberately narrow; real canonical action DDL, unique index, RLS, origin guard, Work Item/domain-event DDL and projection function are loaded from repository migrations. A synthetic executor tripwire proves zero executor calls during editing and rejected approvals.

Cases cover same ID/version, normalized amount/currency/account/date/full review, unchanged metadata/attachments, no-op, stale version, NULL/zero approval and cancellation, foreign actor/account/category, wrong currency, invalid/NaN/infinite/nonpositive/oversized amount, invalid/missing/infinite date, oversized description, forbidden keys, expense→income, personal→business, unsupported commercial edit, non-review states, archived thread, revoked attachment, collision, create idempotency, one pending task and content-free audit/domain event. Original income/transfer and all six commercial variant payloads/reviews are compared against the extracted builder.

`.github/workflows/stage2d-draft-contract.yml` adds disposable **PostgreSQL 17** service tests with separate real sessions: concurrent identical create, stale concurrent edits of one row, and two different IDs racing toward one fingerprint. This mode accepts only a fixed loopback disposable test database, never a Supabase URL. Its final-SHA CI result must be recorded before install.

Local verification: TypeScript PASS; route suite PASS through `node --import tsx` (the environment prevents the tsx CLI IPC socket); production build PASS; bundle budget PASS, Agent Workspace **110.01 KB / 120 KB**. No application UI changes in this backend slice; no visual acceptance or production runtime claim.

## Install and continuation gate

1. Review final candidate SQL and exact-head CI, including multi-session PostgreSQL tests.
2. Obtain owner approval for backend installation/merge and the **separate** already-accepted 2D.2-A Web release. Never blindly `db push` or reapply the three existing 2D migrations.
3. Apply only this reviewed migration through supported migration API; inspect actual ledger version and reconcile filename before merge, following the established handoff procedure. Re-read function definitions, privileges and advisor findings. Do not create or approve real financial test actions.
4. Next isolated UI slice consumes the verified contract and adds the personal-expense editor inside the existing lazy action card, with pinned-version conflicts and authorized entity selectors. Provide owner local worktree preview before UI merge. Descriptor `form_edit_supported=false` intentionally remains unchanged until this UI contract is verified; commercial and voice editing are not claimed implemented.

Rollback requires explicit review: disable new update RPC access, restore previous create/approve/cancel definitions while retaining NULL-version guards, then remove helper only after its callers are restored. Preserve action rows, new versions, audit events and work items. Prefer a forward fix; never rewrite edited financial drafts to old values automatically.

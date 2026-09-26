# Stage 2D.0 — Actual Action/Draft contract audit and origin guard

**Checkpoint:** 2026-09-27. **State:** First additive security/compatibility candidate, NOT DEPLOYED until review and exact-head CI.  
**Canonical plan:** `docs/roadmaps/SANAD_EXECUTION_PROGRAM_V4_2026-09-25.md` → 2D Unified Action + Draft Intelligence.  
**Accepted transition:** Owner reported the Stage 2C.5 production features working correctly, with remaining appearance-only observations deliberately postponed. This is acceptance of the scoped UX, not evidence that all cross-business denial or recovery scenarios have been exercised.

## 1. What is already real (verified against current production schema/function definitions)

- `public.sanad_agent_actions` **is** the existing canonical persisted action: `id`, `user_id`, `thread_id`, nullable `business_id`, `action_type`, `status`, typed normalized `payload`, server-calculated `review`, `fingerprint`, monotonically updated `version`, result and audit timestamps.
- `sanad_agent_action_events` persists created/approved/executing/completed/failed/cancelled events. Existing create already uses a normalized-payload fingerprint and reuses active identical review/approved/executing rows. Retain this behavior and separately test concurrency in the next implementation slice.
- `create_my_sanad_agent_action_draft_v1` resolves user-owned active thread and typed underlying entities. Current accepted actions: `personal_transaction` (income/expense/same-currency transfer), `commercial_document_draft` (approved result creates **a SANAD document DRAFT**, never writes to Edaa).
- `get_my_sanad_agent_action_v1`, `list_my_sanad_agent_actions_v1` and existing approval/cancellation RPCs already exist. `approve_my_sanad_agent_action_v1` uses `p_expected_version` and locked owner row. Reuse, don't replace with a second registry/execution engine.
- Current direct table grants allow authenticated SELECT under enabled RLS, but do **not** grant authenticated direct INSERT or UPDATE of action rows; owner-facing creation/approval are authenticated RPC-only; anonymous CREATE RPC execution is denied. This guard closes the **separate origin classification** gap, not a raw-table grant vulnerability.
- Repository offline migration-integrity CI currently **passes by proving its deployment gate fails closed** against historical drift. A green CI check therefore does **not** grant permission to blind-push this new migration. Its actual installation needs a reviewed migration-history alignment and explicit DB rollout gate.
- Existing 2C.5 `sanadSpecialistComposerCatalog.ts` prepares an ordinary reviewable conversation prompt. It is not yet the server-governed editable, versioned form, entity picker or execution authorization.
- At this checkpoint production has 11 business, 3 personal and 1 legacy unclassified thread. The existing counted agent action is one commercial draft associated with a business-classified thread. These are a point-in-time audit sample, not a general guarantee of project-isolation enforcement.

## 2. Confirmed gap and this package's correction

The deployed `create_my_sanad_agent_action_draft_v1` checks current ownership/thread activity and verifies the business matches **when the thread already has a business ID**, but does **not** independently require the thread to be of type `personal` for a personal action or `business` for a commercial draft. For a `null`-business thread, it is possible for callers to attempt a commercial draft even if the conversation is personal/legacy; the current business-owner check still applies but the source context is wrong.

This package adds a **DB-level, additive BEFORE INSERT/UPDATE guard**, not just front-end hide rules. It protects every existing creator path through one canonical origin check:
- New personal actions require server-classified `project_kind='personal'`, null thread business and null persisted action business.
- New commercial actions require server-classified `project_kind='business'` and exact persisted source business ID equality with that verified thread's business.
- Any new action requires a currently active user-owned source thread. Future updates cannot silently reassign `user_id`, `thread_id`, `business_id` or `action_type`.
- The existing canonical draft payload, revision, ownership, review card, explicit approval/deterministic executor and event projection are unchanged. No ERP write capability or new execution RPC is introduced.

Migration: `20260926214052_stage2d_action_origin_scope_guard_v1.sql`. Regression: `scripts/check-stage2d-action-origin.mjs`.

**Rollback:** For a migration-specific incident, investigate and preserve audit rows; after explicit authorized rollback approval, drop only trigger `sanad_agent_action_origin_guard_v1` and its private helper function. Do not delete/alter canonical drafts, weaken existing ownership RPCs, or roll back unrelated 2C migrations. Keep all approved data intact.

## 3. Next Stage 2D slices and evidence

**2D.1 — Canonical capability/field contracts:** produce a versioned server-approved descriptor that maps these two *currently supported* action types to entity resolution contracts. UI catalogs can consume this descriptor after authorization, rather than maintaining another independent declaration. Any unimplemented feature must remain labeled guided/read-only.

**2D.2 — Same draft, two entrypoints:** versioned `update_my_sanad_agent_action_draft_v2` with expected version; server-side re-normalization and source validation, full review regeneration and stale-review invalidation. Voice/text/form must converge on the **same** `action_id`. Do not add client-side duplicate draft tables.

**2D.3 — Entity picker + form parity:** first safe personal expense draft, canonical authorized account/category lookup, Arabic normalized search, no guessed IDs, explicit null/amount/date/currency. Reuse the existing current owner/permission RPCs. Expand to commercial type only after source/business/party-resolution negative cases pass.

**2D.V — Tests before merge/rollout:** S1 cross-project denied draft, S2 cross-business immutable original, S3 restricted viewer denied, ambiguous same-name parties, stale expected version rejected, repeat submit single persisted action, no automatic ERP posting, user-verified preview at 125/150 and safe mobile. Separate DB migration and backend deployment review before production writes.

**No dependency on store PC:** Bridge host upgrade and the on-demand ERP refresh button's field test remain separately deferred.

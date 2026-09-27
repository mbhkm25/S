# Stage 2D.2-A — Canonical same-draft revision: optional text only

**Status:** backend note-edit migration applied to production under verified ledger version `20260926222117`; read-only verification confirmed the exact RPC and its owner-locked/version-aware/work-projection source, anonymous EXECUTE denied and authenticated EXECUTE allowed. **Web UI remains PR #410 DRAFT**, not merged or deployed; owner preview and true role/concurrency runtime fixtures remain open. This is the FIRST controlled same-ID edit slice, not the whole 2D.2 amount/account/party editor.

## Actual baseline

SANAD already persists typed personal transactions and commercial SANAD-only document drafts in `sanad_agent_actions` with immutable actor/thread/project/business enforced by 2D.0, authoritative action descriptor by 2D.1, expected-version approval, fingerprint dedupe and existing execution audit. Its historical action card “تعديل” CANCELS the current draft and starts a new chat request, so the full form-edit claim must not be made yet.

## Included vertical slice

One new permissioned RPC `update_my_sanad_agent_action_note_v1(action_id,expected_version,note)` operates **on the exact existing action_id**:
- locks owner action row; only status `review`, exact positive version, active user-owned original thread and correct project/business + owner authorization may proceed;
- permits only optional **description** of existing personal income/expense/transfer, or optional **notes** of existing business document draft. A 500-character input limit is enforced on the server. Blank string clears the optional field as JSON null;
- retains existing source financial amounts, currency, source/destination accounts, category, party, commercial line items, attachments, metadata, original ID and review approval consequences;
- recalculates the same canonical fingerprint excluding metadata; blocks collision with another active identical draft; on an actual change increments the original version, updates the original payload and the affected review summary/field, and appends an `edited` event without logging the note content; the existing Stage 2B event projector emits `agent.action.edited`, and the existing pending work-item summary is refreshed in place rather than adding a duplicate approval task;
- stale expected-version conflicts and unauthorized/approved/completed/cancelled edits fail; previously rendered approval cards necessarily carry stale versions and cannot silently authorize edits.

Existing approval/cancel RPCs and deterministic execution are unchanged; ERP remains READ-ONLY. The separate **“تعديل بقية البيانات”** path remains the legacy cancel/recreate flow until a fully authorized versioned update contract is built for amounts/entity identifiers in the next slice. The initial new UI is a compact inline edit area, not a second persisted draft or extra workflow.

## Required gates and limitations

Source CI must pass the full standard check:routes/lint/build plus the 2D.2 invariants, no new ERP write, and immutable project origin protection. Deploy the exact additive reviewed SQL under a controlled production migration, then rename its committed file to the *actual* assigned live Supabase migration version before merging (historical deploy-gate intentionally fails closed). User should exercise a disposable **unapproved** draft with a non-sensitive note: old review version → edit original same action → new version and updated review → old approve version fails → new approval **not required for test**. Do not approve or execute a real financial action merely to test editing. Test mobile and 125/150% desktop; correct any layout defects on the same branch.

**Not yet implemented:** editing amount/date/currency/account/party/line items; voice edit of the same draft; true bidirectional form/agent state synchronization; universal capability registry replacement; anything involving shop-PC Bridge. These belong to follow-on 2D.2-B/2D.3 after the server can re-run the original complete canonical normalization for editable financial fields.

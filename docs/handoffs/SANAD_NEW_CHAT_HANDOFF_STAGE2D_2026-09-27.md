# SANAD — NEW CHAT EXECUTION HANDOFF
**Date:** 2026-09-27 (Yemen, UTC+3)  
**Purpose:** Reconstruct source-verified context and immediately resume the next implementation slice without repeating visual polish or prematurely claiming production rollout.  
**Approval:** Owner explicitly accepted the Stage 2D.2-A local preview and requested this continuity handoff to begin a new conversation.

## 1. Read this first: source-of-truth order

The **current GitHub main** of `mbhkm25/S` is the live source baseline for new branches. Read these repository documents in sequence; do not treat historical proposals as a more recent source of implementation truth.

1. `docs/roadmaps/SANAD_EXECUTION_PROGRAM_V4_2026-09-25.md` — owner-approved multi-train architecture and priorities; Stage 2D is current, then 2E/2F etc.
2. **This file:** `docs/handoffs/SANAD_NEW_CHAT_HANDOFF_STAGE2D_2026-09-27.md` — current executed-versus-pending checkpoints and mandatory next action.
3. `docs/implementation/STAGE2D_ACTION_DRAFT_ACTUAL_CONTRACT_AUDIT_2026-09-27.md` — actual persisted-draft contract and completed 2D.0 origin protection.
4. `docs/implementation/STAGE2D_SERVER_CAPABILITY_DESCRIPTOR_2026-09-27.md` — real read-only scoped backend capability registry and completed 2D.1.
5. `docs/implementation/STAGE2D2_SAME_DRAFT_NOTE_EDIT_2026-09-27.md` — owner-accepted 2D.2-A same-ID note edit; explicit limits and test gate.
6. `docs/implementation/STAGE2C_VALIDATION_AND_STAGE2D_HANDOFF_2026-09-26.md` and `docs/implementation/STAGE2C_PROJECTS_COMPOSER_EXECUTION_CHECKLIST_2026-09-25.md` — previous train and still-open negative/integration checks.
7. `docs/architecture/SANAD_SPECIALIZED_AGENTS_CONTEXTUAL_INTELLIGENCE_V1_2026-09-26.md` — one main conversational orchestrator, restricted internal specialists, existing deterministic insight engine; no independent multi-agent financial authorities.
8. For any execution-sensitive change inspect actual TypeScript, SQL and the **connected production schema** before touching it. An older doc's future-tense statements are not an implementation status.

Project knowledge: owner previously established reference Library documents `SANAD.md`, `ABU_SANAD.md`, `SKILL.md`. Review their latest accessible versions when relevant; do not claim the GitHub handoff itself edits Library files. If a prior document is not accessible, retrieve it rather than guessing.

## 2. Product architecture and non-negotiable constraints

SANAD is an Arabic RTL intelligent personal-finance and business platform, not merely a chatbot. Main workspaces: **سند** (conversation/intelligence), **المالي**, **الأعمال**, **مركز العمل** (personal operating manager, drafts/approval/attention). Context-aware + launcher in conversation, entity inspector, verified provenance/freshness and responsive single-scroll composer are already established.

Source repo: `mbhkm25/S`; Web production: `https://app.sanadflow.com`; backend: connected Supabase project ref `hudbzlgclghlhazlduas` (the current operational project; confirm through connector when operating). Web: React/Vite; Supabase SQL/RPC, Edge agent `sanad-ai-agent-v1`; Edaa Soft integration uses **READ-ONLY** Windows Bridge located on the **shop computer**, not the owner's personal laptop.

Canonical execution sequence: user intent → server-verified project/actor/entity → **single canonical persisted draft** → versioned review → **explicit UI approval** → deterministic SANAD command → audit and result. Model cannot approve, execute, write to Edaa or autonomously add other parties' information. Financial numbers must preserve currency, source and freshness, and avoid pretending a SANAD commercial draft was posted to Edaa.

Design: low-card-density calm operational intelligence, light-first; branded lime→green→mint→aqua, deep ink and cool neutrals; restrained Arabic typography and clear controls. Enforce 120 KB **SANAD Agent Workspace** JS bundle budget in production rather than raising it. Recent action-card addition initially pushed the workspace to 122.56 KB; fixed by **lazy-loading `SanadAgentActionCard` in `SanadAgentResponseBlocks.tsx`**, with Suspense. Preserve this split.

Working discipline: isolated, short-lived branches; exact final-SHA six or more relevant GitHub CI checks; owner local **isolated worktree preview before UI merge**; owner permission for merge; distinct guarded Web/Edge release; owner-authenticated production smoke. Do not install or test shop Bridge on the personal laptop, do not treat debug Android build as signed production release. Visual polish beyond obvious correctness is deferred by owner; build new components accurately on first pass.

## 3. Confirmed completed milestones and exact commits

| Slice | Actual status | Implementation source and production proof |
|---|---|---|
| 2C.5 scoped Smart Composer + customer statement initial bounded-agent hardening | Owner confirmed all core production functions work; visual enhancements deliberately postponed | PR #404 merged to main `00fe3fe1a2368dcd292bfed283f989623dc45ed4`; owner locally confirmed + icon alignment; Supabase agent Edge v8 ACTIVE (JWT verified); Web rollout was separately triggered via PR #405. Do not equate acceptance with completion of every cross-role negative fixture. |
| 2C.V documentation / follow-on gates | Documented but formal full S1–S12 fixtures remain separately open | PR #406 merged `e0a09738a567afba3681eeb325c656ef9c193626`. |
| 2D.0 canonical draft project/actor/business immutable origin guard | **Merged; actual backend installed** | PR #407 merged `839641ae184333fe3b3e709b412ed4af0277b8a9`; applied migration **`20260926214052_stage2d_action_origin_scope_guard_v1`**; live trigger verified enabled; six exact-head checks PASS. |
| 2D.1 source-verified read-only capability descriptor | **Merged; actual backend installed** | Initial stale-base PR #408 superseded/closed; canonical PR #409 merged `49feb2b668d5cc9cab9d90c4b9111a78c7b4a01d`; migration **`20260926214745_stage2d_server_capability_descriptor_v1`**; live RPC verified: authenticated execute, anonymous denied; seven exact-head checks PASS. UI not yet switched to this descriptor. |
| 2D.2-A same-action versioned **optional text-only** edit | **Owner accepted local preview; PR #410 MERGED; backend installed. Web release NOT independently confirmed** | Final candidate `4f2b09c176f7153083532ff4fea101067512bcd2`: six exact-head CI PASS. PR #410 merged `7b7368140fbd5c1bdef43a08cb0181c63ccee0b4`; applied migration **`20260926222117_stage2d_same_action_note_edit_v1`**. Live read-only verification: exact RPC present, `FOR UPDATE` and expected-version checks, existing pending-work summary refresh, origin trigger enabled, anonymous execute denied; no financial test action created or approved. |

**Very important distinction:** owner approved the *2D.2-A preview and code merge*, not an assertion that merged React UI already appears at `app.sanadflow.com`. GitHub `main` commits alone do not trigger Web deployment; current workflow `.github/workflows/deploy-production.yml` deploys on `workflow_dispatch` or a push changing `.github/production-recovery-trigger`. Confirm an independent guarded Web production release and owner production smoke before marking 2D.2-A fully rolled out. Never blindly run `supabase db push` given historical migration-history deploy-gate fail-closed; these three 2D migrations already have verified real Supabase ledger versions and must not be reapplied.

## 4. Exact 2D implementation you must reuse

- SQL canonical persisted action and audit: `supabase/migrations/20260920121815_sanad_agent_actions_v1.sql`. Table `public.sanad_agent_actions` holds authoritative `id`, user/thread/business IDs, action_type/status, typed payload, review JSON, attachments, fingerprint, version, result; `public.sanad_agent_action_events` records lifecycle and now `edited`. Do not duplicate it.
- Canonical existing RPCs: `create_my_sanad_agent_action_draft_v1`, `get_my_sanad_agent_action_v1`, `list_my_sanad_agent_actions_v1`, `approve_my_sanad_agent_action_v1(p_action_id,p_expected_version)`, `cancel_my_sanad_agent_action_v1`. Review status and exact expected version required; the approved `commercial_document_draft` creates **only a SANAD commercial Draft**.
- Stage 2D.0: `supabase/migrations/20260926214052_stage2d_action_origin_scope_guard_v1.sql`; enforces source thread ACTIVE, owned, personal/business type matches draft, exact commercial business ID, immutable origin for inserts/updates.
- Stage 2D.1: `supabase/migrations/20260926214745_stage2d_server_capability_descriptor_v1.sql`; `get_my_sanad_action_capabilities_v1(thread_id)` returns only allowed existing personal and owner-business variants, expected-version approval and **`form_edit_supported=false`**, **`erp_write_supported=false`**. This static descriptor is server-authorized but currently not wired into frontend action catalog.
- Stage 2D.2-A: `supabase/migrations/20260926222117_stage2d_same_action_note_edit_v1.sql`; `update_my_sanad_agent_action_note_v1(action_id,expected_version,note)` only changes personal `description` or commercial `notes`, <=500 chars; same ID, row-lock/owner/project/status/version rechecks, recomputes fingerprint, updates corresponding server review text, increments version only on real change, writes note-content-free `edited` event and refreshes **existing** open work item (no duplicate approval task). Existing Stage 2B event projection emits `agent.action.edited`. No amount, account, party, date, line, attachment or ERP modifications.
- UI: `src/features/assistant/assistantActionApi.ts` typed RPC client; `SanadAgentActionCard.tsx` new inline note editor; when unsaved edits exist its approve/cancel controls are disabled; action card lazy-loaded via `SanadAgentResponseBlocks.tsx`. For *other* fields the legacy “تعديل بقية البيانات” still cancels/recreates and is **NOT** 2D.2 full convergence.
- Tests: `scripts/check-stage2d-action-origin.mjs`, `scripts/check-stage2d-capability-descriptor.mjs`, `scripts/check-stage2d-same-action-note-edit.mjs`, all wired in `package.json` `check:routes`. Follow actual source tests, TypeScript lint/build and production bundle budget, not prose-only assurances.

## 5. First actions in the next chat — do not broaden scope

**A. Reconcile release evidence:** fetch latest main SHA and verify merge #410, six exact-head PR checks, live applied SQL migration ledger and current production Web release workflow. If no confirmed guarded Web deployment exists for merged 2D.2-A, prepare a **separate** minimal release PR/trigger and production gate, then verify owner live smoke (no blind auto-approve). Distinguish source/code acceptance from formal production rollout.

**B. Implement Stage 2D.2-B plan and vertical slice in its OWN fresh branch, not by reopening #410.** Owner wants the **same canonical draft** when editing amounts, dates and resolved financial entities from conversation/voice/form. This requires centralized re-normalization of complete payload and **full server-generated review** from existing v1 create logic, expected_version locking, entity permission/currency constraints, duplicate-active fingerprint collision handling, immutable origin, attachment binding and old-review approval invalidation. DO NOT duplicate all v1 normalization blindly or offer edit of financial fields before its server contract and negative fixtures are proven. Recommended first slice: personal expense full normalized edit; then commercial party/document/lines after independent authorization tests.

**C. Required technical discovery before coding:** read the **complete** existing create/approve/cancel RPC definitions and all later migrations replacing them in live production, current personal account/category authorization and financial transaction payload shapes, Stage 2D.1 descriptor, React draft-review card and voice composer. Inspect actual constraints/triggers on work-items and action events. Design how existing IDs remain stable across chat/form changes; no unapproved human financial mutations for testing.

**D. Tests and gates:** stale version conflict (second tab), two active drafts collision/idempotency, foreign actor, personal↔business attempted mutation, business A↔B, restricted viewer, invalid account/currency/party, attachments unchanged, failed approval must not auto-execute, old review cannot approve edited action, projection one task per action, responsive 360/390/768 and desktop 125/150%, required exact-head CI and bundle budget.

**Separate/backlog:** 2E Today attention and notifications; 2F exact ERP historical fidelity #384 plus deferred shop-PC read-only Bridge field upgrade; 2G project knowledge; 2I extended guided forms/search. Do not let visual polish or Bridge access block 2D feature work.

## 6. Operator checklist for GitHub/Supabase and laptop

Start **only from fetched current `main`**, open an issue/brief per slice, work on a fresh scoped feature branch and use GitHub connector on same repo. Review exact PR head SHA and all required Actions jobs on FINAL commit. Use connected production Supabase **read-only checks first** and apply only independently reviewed additive migrations via supported migration API; API assigns actual ledger version, then align repo migration filename (avoid two aliases); verify real deployed RPC/permissions and never fabricate runtime tests. Separate backend install from guarded Web release, signed Android publication and personal shop-PC operations.

The owner's personal laptop can preview an isolated clean worktree under `C:\\SANAD-...-PREVIEW`; original repo was `C:\\sanad-v3` in earlier working examples. For a new UI preview supply a **copyable PowerShell block** that verifies pinned SHA, refuses overwrite of dirty worktrees, copies the existing `.env.local` only if present, runs `npm ci`, `npm run check:routes`, lint, build and `vite preview --host=127.0.0.1 --port=3000 --strictPort`. Local preview may connect to production via owner's env; NEVER request approval/execute as a smoke test on real records. Ask owner for visual/functional acceptance before UI merge if new code changes appear.

## 7. User communication and continuation contract

Work in Arabic, direct and evidence-based. Owner explicitly instructed: **build the basic architecture/components first, fix operationally harmful defects and simple misalignments as you go, postpone wide-scale aesthetic polish**, but ensure professionalism/consistent typography/layout/RTL/organization from first implementation. At each checkpoint distinguish SOURCE MERGED, DATABASE APPLIED, WEB DEPLOYED, OWNER SMOKE and FULL TRAIN CLOSED. Never claim unsupported milestones. Owner wants implementation, not another long abstract roadmap. Start by checking release truth and executing the next bounded 2D.2-B development slice with a clear update.

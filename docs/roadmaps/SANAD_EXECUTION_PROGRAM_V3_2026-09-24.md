# SANAD — Execution Program v3 (reconciled, 2026-09-25)

> **HISTORICAL REFERENCE (as of the v4 proposal):** This v3 program remains preserved for evidence and release-history context. The updated project-organized, conversation-first design and current next-stage planning are proposed in [SANAD execution program v4](SANAD_EXECUTION_PROGRAM_V4_2026-09-25.md), accompanied by [2C execution checklist](../implementation/STAGE2C_PROJECTS_COMPOSER_EXECUTION_CHECKLIST_2026-09-25.md) and [Projects/Composer architecture ADR](../architecture/SANAD_PROJECTS_SMART_COMPOSER_V1_2026-09-25.md). **Treat v4 as canonical only after its docs PR is approved and merged**; until then, this v3 and live GitHub/Supabase state remain the present reference. Do not replay old schema proposals or infer that future v4 capabilities are deployed.

**Status:** Current planning contract, docs-only; this roadmap is not a release authorization. Source of truth for execution is current verified GitHub `main` / live Supabase / approved runtime evidence; Library `SANAD.md` is the accumulated decision summary. Related: tracker #374, R4 #380, D-ARCH #376, reconciled matrix `docs/architecture/DARCH_RECONCILIATION_2026-09-25.md`. The original PR #377 proposal was written before shipped R3/R4 and is superseded by this version.

## Product philosophy and permanent invariants

One **Conversation-Centric Operating Layer**; one global sidebar with capabilities rather than four siloed products. All personal/financial/business truth comes from permissioned canonical source systems. SANAD can plan/draft/interpret, but may perform mutations only through **Intent → Entity Resolution → Draft → Review → Explicit Approval → Deterministic Command → Audit → Result**. Never write back to Edaa via the SANAD Bridge: replication **read-only toward Edaa**. Source/provenance/freshness, recipient permissions, accurate currency, structured results and accessible Arabic responsive design are release requirements.

## Current release-state gate

- **R3 Web/PWA:** owner live smoke, merged #378 and guarded deploy #82 confirmed. Prior release rollback checkpoint `7a90c6e3aef92054014da70ba49d97d7aa0f4d48`.
- **R4:** local preview accepted and merged PR #381 at `344934f9246d3514ebef973bed59bf4bbab445cf`. Web/PWA release-trigger PR #382 uses guarded workflow #83; **do not assume success solely because trigger merged**. R4's shared Edge presentation source for `sanad-ai-agent-v1` changed; **Web/PWA deployment does not deploy the function**. Compare full live vs repo Edge dependency bundle, preserve deployed backup, test and independently verify new version before calling copied-statement formatting live. No signed Android updater in this train. Close #380 only after successful Web/Edge postflight and authenticated owner Production smoke.
- **D-ARCH:** legacy PR #366 was based on a pre-D1/D2/D3/R1 schema; old M1–M4 proposals already shipped and may not be replayed. Merge current evidence-only docs and supersede old #366; the reconciliation matrix separates verified features from unfinished future contracts. Do not migrate new schemas under this documentation-only gate.
- Independent evidence debt: retrieve public `/version.json` and signed Android updater manifest/hash separately; do not equate build tests or APK-path HTTP 200 with signed deployment.

## Release trains and acceptance criteria

| Train | Deliverable | Dependencies and non-negotiable checks |
| --- | --- | --- |
| **2C — Context + Entity** | Canonical typed Context Pack (`workspace, view, entity_type, entity_id, business_id, period, filters`), authorized EntityLink, inspector/preview/full view, typed Snapshot/Record/Report/Draft/Approval/Execution/Warning blocks with provenance/freshness and intentional conversation references. | D-ARCH reconciled, current multi-business/participant semantics; never make UI context an access token or create duplicate account truth. |
| **2D — Action + Intelligence** | Shared typed Action Registry for user UI / NL / quick actions, Yemeni terminology, entity resolution, versioned command schemas and deterministic audited approval/execution. | 2C Context Pack; preserve deployed two action types and compatibility aliases; permission/negative/idempotency tests; never silently post finance/ERP. |
| **2E — Operations + Notifications** | Full Today briefing, work/approvals/tasks/automations grounded in existing D3 event envelope and recipient-scoped Work Items; bilateral commercial notification and dedupe/replay. | 2D approval truth; work projections cannot replace source financial state; preserve existing push/WhatsApp channel and consent controls. |
| **2F — Connections + Bridge** | Connections ownership/capability/health UX; chat-assisted safe Bridge pairing/diagnostics/reconnect; evidence-based historical Edaa COGS/profit *read* contract; feasibility study for WhatsApp integration. | D2 connection registry and credentials boundary; field soak and verified historical method. CostPrice alone is **not historical invoice COGS**. Phone contacts/calls remain separate consent study. |
| **2G — Knowledge + Collaboration** | Shared conversation controls, two-client continuity, scoped user/business approved fact store, provenance and correction/forget semantics, derived USER.md/BUSINESS.md, Yemen glossary. | R1 participant permissions and role-aware negative tests; existing product knowledge and personal memory remain separate from financial truth. |
| **2H — Business Network + Reconciliation** | Parties/customers ↔ business statements/invoices/claims, uploaded statement matching and discrepancy review, agreement/contracts and scoped audit. | 2D actions, 2E notifications, 2F provenance/tenant policies; no unreviewed cross-business joins. |
| **2I — Guided Input + Search + Ecosystem** | Compact in-chat invoice/purchase/receipt/payment/journal/report forms, permissioned autocomplete, universal Ctrl/Cmd+K search, library artifacts and typed extensions. | Typed Context/Action/Approval and business relationship contract. Global conversation search requires actual backend pagination, not only local recent threads. |

**Deferred scoped 2B conversation backlog:** rename/pin/delete with confirmation, guarded sharing/participant UX, history continuity and backend global search as separate small issues and PRs. **Future only, documentation:** SANAD wallet / regulated payments and marketplaces pending regulatory, security and provider review. Keep Android signed release hardening at major release gates; do not block every desktop PR on physical Android but require safe-area and build CI.

## Engineering lifecycle per train

1. Reconcile actual Production GitHub, migrations/RPCs/RLS/Edge and this roadmap with Library `SANAD.md`; update **working delta log**, not all three canonical knowledge files after every chat.
2. Issue + acceptance/permissions/non-goals/rollback. Create one short-lived branch from *then-current* main; no long-lived precreated future train branches.
3. Small PR(s), schema changes isolated from UX and backed by D-ARCH permission review/ADR. Use same-final-SHA Production/Operation/Admin/Android CI as applicable, regression and bundle budgets.
4. Local preview via an isolated sibling worktree from `C:\sanad-v3` (candidate SHA visible) on desktop and mobile-safe; owner personally reviews behavior, screen captures and negative cases.
5. Explicit owner acceptance → merge only reviewed PR(s). **Separately** trigger guarded production publication, verify actual release SHA, server/HTTP postflight, separately authorized backend/Edge release when relevant, authenticated owner live smoke and rollback readiness.
6. Mark issue closed, advance roadmap stage, merge reviewed docs. Batch knowledge-file deltas into `SANAD.md`, `ABU_SANAD.md`, `SKILL.md` **only at approved checkpoint or work completion**; keep version history and reduce redundant writes.
7. Do not begin the next implementation train until prior train's required runtime gates pass. D-ARCH docs-only review may proceed in parallel.

## Historical branches policy

The old inventory reported 393 branches *at its checkpoint*, **not 393 unmerged changes**. Squash-merges make ahead/behind counts misleading. Tag deployed Web, signed Android and Bridge field refs, then compare live main trees, PR statuses, migration versions, and any secret-sensitive field dependencies before classifying branches. **Never bulk-merge PR #366, legacy R2 branches, obsolete preview branches or diverged Bridge refs**. Close obsolete PRs as superseded with links to an evidence-based replacement; deletion requires separate review, not merely a closed PR.

## Open evidence/dependency handoff

- R4 source/Edge verification is separate from the frontend. Financial precision improvement retains digits **available after JSON→JS parsing**, not guaranteed arbitrary original ERP decimals; any exact-as-text PostgreSQL numeric contract is a new additive schema change with independent tests.
- Current Today payment-inbox Work Item metadata may not include party/amount/currency; display distinct authorized source ID and missing-data state rather than fabricate names; enrich only via independently approved scoped read model.
- Before 2C, consult the D-ARCH matrix and explicitly document any still-missing Entity Context authorization/read contracts.

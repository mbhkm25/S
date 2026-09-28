# SANAD v4 — Legacy Capability Repositioning & One Operational Core
**Date:** 2026-09-26
**Decision status:** Owner-confirmed **product/engineering principle**; this document specifies an implementation **audit gate**, not a claim that every old capability has already migrated.
**Documentation status:** Proposed GitHub docs-only change until its PR is reviewed/merged. Do not change Production from a documentation PR.
**Parent:** [Stage 2C #386](https://github.com/mbhkm25/S/issues/386) · [Program v4](../roadmaps/SANAD_EXECUTION_PROGRAM_V4_2026-09-25.md) · [Stage 2C checklist](../implementation/STAGE2C_PROJECTS_COMPOSER_EXECUTION_CHECKLIST_2026-09-25.md) · [D-ARCH reconciliation](DARCH_RECONCILIATION_2026-09-25.md).
**Repository reference when drafted:** `main` `8b9ec1f118332865e141f9110aed4e6e5ce80ddd`. Recheck live `main`, actual Supabase privileges/Edge runtime, and deployment before any subsequent code or schema changes.

## 1. Why this decision exists

SANAD began as a product emphasizing incoming financial notifications, their documentation, verification, reports and associated operations. Its approved direction has changed: **SANAD is an intelligent financial and commercial operating environment in which authorized people, businesses, customers and their interactions live, with conversation as the primary interaction surface** and retained, purposeful interfaces for project administration, connection setup, security and settings. It also operates above existing accounting systems via permissioned data integrations.

The owner explicitly requires that **existing SANAD capabilities be inventoried and repositioned before new construction**. The transition is not an invitation to discard the prior system or rebuild its functions in another frontend. New capability development starts only after comparing actual legacy assets with the v4 target, including source data, APIs, grants, drafts, worker/event pipelines, frontend views, failure paths and audit trails.

> **One business operation → one canonical operational contract; many authorized entry points.**
>
> A personal expense opened from conversation, a contextual guided mini-form or Personal Manager's established interface must converge on the **same eligible domain handler**, project binding, canonical data/draft and approval/audit semantics. This rule also applies to commercial documents, payment intake, statements, notifications, reports and connections. The existence of multiple UI entry points must **never** create multiple authoritative financial records or inconsistent permissions.

The principle is **reuse first, not reuse blindly**. A legacy screen/service is reused only after its effective behavior, provenance, permissions, technical debt and compatibility have been audited against the new project-based contracts. Retire a duplicated presentation when parity is demonstrated; do not remove the operational capability simply because it originated in the older product.

## 2. Product placement and source of truth

The **single global sidebar** has exactly **الرئيسية / المدير الشخصي / الأعمال**. The **الرئيسية** canvas starts with **مساحاتك** and then **ما يحتاج انتباهك**; do not repeat «الرئيسية» as a large main-canvas heading. New conversation and history are **inside an explicitly selected project**, never an unscoped global chat. Global account/profile/security/**إدارة مساعد سند** remain in the sidebar's bottom utility menu. Notifications belong opposite «مساحة الذكاء والتشغيل» in the header; source-linked approval/task handling is surfaced through «ما يحتاج انتباهك». The former global «المزيد» is retired; do not reintroduce it from older roadmap screenshots.

- **المدير الشخصي:** presently personal finance and permitted future personal management. Personal conversations, tools, sources and an actual **personal-scoped** library. A former generic capability belongs here only if its underlying source and authorization are personal.
- **الأعمال:** choose an authorized business first. This project's conversations, source references, tools, **إدارة النشاط**, business-specific library, and destinations for **الاتصالات / الأتمتة / وارد المدفوعات**. Existing account-wide connection or inbox pages may remain linked provisionally but MUST say if they are **not actually filtered by the selected business**.
- **الرئيسية / ما يحتاج انتباهك:** a recipient-authorized cross-project projection (tasks, approvals, alerts and follow-ups). On action, resolve and revalidate the original project's canonical source; do not write a second financial truth.
- **Chat + Smart Composer:** the primary, project-scoped way to query, draft, inspect and act. Embedded cards, source-aware typed outputs and mini-forms are **views into existing or deliberately approved domain contracts**, not alternative accounting backends.
- **Customers/other participants:** visibility follows reviewed business/customer/team/participant and per-document grants. Merely being a customer, having a project link, or mentioning a business in text does not grant team or private-thread access.

The source of truth for posted financial records stays in its authorized financial/ERP source. Assistant memory and project documents are reference context; Work Items and notifications are projections; creating a commercial **document draft is not posting a transaction into Edaa**. Keep existing Edaa Bridge **read-only toward Edaa**. Any future ERP writer is a separate authorized integration train.

## 3. Read-only reuse inventory: initial evidence, not a migration verdict

The following are **repository or previously reconciled contract leads** at the drafting checkpoint. A file name proves source presence, **not** that its associated UI, RPC, recipient filter, full scope or live deployment is safe. Inspect implementations and Production behavior in the pre-2C.4 audit; record final decisions in the capability register in §4.

| Existing capability family | Inspect existing source/contract first | Proposed v4 placement/reuse question | Verification before deciding |
| --- | --- | --- | --- |
| Payment notification receipt / verification / inbox | `src/components/business/PaymentInbox.tsx`, `src/lib/paymentInboxApi.ts`, `src/features/local-first/notificationIntake.ts`; deployed payment source and Work Items | **Business → وارد المدفوعات** plus permissioned «ما يحتاج انتباهك» source-linked references and contextual assistant read/review | Is the existing inbox account-wide or business-filtered? Source ID, original notification evidence, recipient role, validation/reconciliation and explicit approval before financial mutation. Do not invent missing party/amount fields. |
| Notifications, alerts, follow-ups, approval/task attention | `src/features/notifications/`, `src/components/notifications/`, `src/features/shell/sanadWorkItemPresentation.ts`; D-ARCH `sanad_domain_events`, `sanad_work_items`, existing notifications | **Header indicator** and **الرئيسية → ما يحتاج انتباهك**; original action opens its source project, not a shadow record | Trace event→projection→recipient→deep link→source revalidation; dedupe, role revocation, mobile notification and idempotence. |
| Personal financial actions / account pages | `src/features/financial/FinancialActionRoute.tsx`, `src/features/financial/FinancialMasterDataActions.tsx`, `src/features/financial/api/` and current personal finance RPCs | **المدير الشخصي** tools and future **Smart Composer** views of the *same authorized operation* | Existing personal entry/authorization, currency precision, approval version, audit, account/category autocomplete and no business fallthrough. |
| Business administration, operational documents, customers and team | `src/components/business/BusinessManageV3.tsx`, `BusinessOperations.tsx`, `BusinessCustomers.tsx`, `BusinessTeam.tsx`, `src/features/shell/BusinessCapabilityRoute.tsx`; D1 member/customer relationships | **الأعمال** project and its management/tools; selectively surface authorized customer/invoice records as EntityLinks in chat | Team member vs customer vs owner distinctions; invoice/document **draft ≠ ledger posting**, existing UI parity and project/business binding. |
| Reports, statements, exported/interactive reports | `src/components/Reports.tsx`, `src/components/business/BusinessErpCustomerStatement.tsx`, `src/components/business/reports/`, `src/features/reports/PublicInteractiveReport.tsx`; current report/ERP read contracts | **2C.4 typed results, Report/Record cards, source-aware expanded canvas**. Reuse existing statement/report data and verified rendering/export where appropriate | Can existing read contract safely return an authorized real record with source/freshness, decimal/date fidelity and no cross-business exposure? Public report sharing needs a separate token/scope check. |
| ERP cloud read, sync, bridge and diagnostics | `src/components/business/BusinessErpCloudReplica.tsx`, `BusinessAccountingSystem.tsx`, `src/bridge-authorize.tsx`, existing Bridge/Edge functions; D2 connection contracts | **Business → المصادر / الاتصالات**, contextual read-only answer and 2F chat-assisted diagnostics | Actual per-business access, snapshot recency, consent, raw financial precision, connection secrets; **never** extend read-only Bridge to writes as part of visual repositioning. |
| Existing assistant messages, response blocks, actions, voice and attachments | `src/features/assistant/SanadAgentWorkspace.tsx`, `SanadAgentResponseBlocks.tsx`, `SanadAgentActionCard.tsx`, `assistantActionApi.ts`, `SanadAttachmentComposer.tsx`, `SanadVoiceDictationButton.tsx`; D-ARCH existing action/check contracts | Adapt current assistant to **2C.4 Context Pack + inspector + typed responses**, then **2C.5 scoped composer launcher**, ultimately 2D canonical action/draft engine | Inspect real source thread project, authorization for every entity and action, existing action type support, explicit approval/version handling and accurate status text. Avoid rewriting mature voice/attachment flows merely to add context. |
| Knowledge, prior uploaded files, memory and retrieval | `src/components/admin/KnowledgeAdminSection.tsx`, `src/lib/knowledgeAdminApi.ts`, `src/features/settings/SanadAssistantManagementPanel.tsx`; D-ARCH `sanad_knowledge_*`, agent memories | **Per-project Sources/Library** and global **Settings → إدارة مساعد سند**; 2G provides actual scoped indexing and collaboration | Existing indexing is **not proof** of project-private libraries: design file membership, source ownership, revocation, citation and delete semantics before exposing real cross-project documents. |
| Customer/business relationship services, public commerce and delivery channels | `src/components/business/CustomerBusinessRelationshipManager.tsx`, `BusinessCommunityV2.tsx`, `PublicCatalogOrderExperience.tsx`, `BusinessWhatsAppCatalog.tsx`; existing relationship/push/WhatsApp services | Preserve separate appropriate customer/business experiences; integrate authorized cross-party tasks and contextual references through **2E/2H/2F** rather than transplanting every screen into chat | Contractually defined consent, actor relationship, recipient data minimization, document visibility and independent message delivery/retry. Never assume existing WhatsApp code proves new integration feasibility. |

**Explicit unfinished work:** final 2C project-file library still needs true scoped content/indexing; 2E #385 permissioned Work Item metadata enrichment; 2F #384 source decimal precision/historical COGS; 2D general typed Action Registry; 2H agreements/reconciliation. File presence does not close any of these.

## 4. Mandatory capability register and disposition

Before implementing any 2C.4/2C.5 module (and again at entry to 2D–2I), publish a dated **read-only capability ledger** for the affected domain, referencing actual code and live contracts:

| Field | Required record |
| --- | --- |
| Capability ID / user job | What the user can *actually* accomplish today vs the new approved expectation. |
| Legacy evidence | Current screen/component, API/RPC/Edge/worker, real live-deploy status and existing tests; mark unknowns. |
| Operational owner | Canonical database/source record, action handler, audit/event/presentation pipeline; identify any duplicates. |
| Scope/authorization | Actor types, personal vs business vs cross-party access, project and thread/file permission checks, denial/revocation path. |
| Desired entry points | Project chat; contextual composer; original tool/admin route; Today; customer-facing channel if independently authorized. |
| Disposition | **REUSE** unchanged; **ADAPT** via typed context/render/presentation wrapper; **REFACTOR** a demonstrably duplicated contract with migration; **BUILD** only a verified functional gap; **DEFER/RETIRE** only with evidence and compatibility plan. |
| Gaps and risk | Unsupported functionality, security/financial provenance, performance/mobile/a11y, unavailable live metadata and irreversible migrations. |
| Acceptance and rollback | Contract + negative tests, before/after parity, owner local preview, same-final-SHA CI, separate releases, authenticated Production verification. |

The order is **Inventory → Trace source/permissions → Choose placement → Choose REUSE/ADAPT/REFACTOR/BUILD/DEFER → Define one canonical handler → Implement thin adapters where possible → Regression+parity test → Owner approval/release**. Do not confuse moving a navigation link with implementing project-scoped data.

## 5. One operational path across interfaces

```text
Authorized user in an explicit Personal or Business project
  ├── conversational text / voice
  ├── contextual Smart Composer mini-form
  ├── existing Financial/Business operational form or management UI
  ├── source-aware result / inspector
  └── original-project action from Today or allowed external channel
                 ↓
       typed project + actor + entity/context resolution
                 ↓
       server-side capability and current permission checks
                 ↓
       SAME canonical read or SINGLE draft ID/version
                 ↓
       accurate typed response, explicit review if mutation
                 ↓
       explicit authenticated approval where required
                 ↓
       supported deterministic audited execution / notification projection
```

Separate interface state and presentation are allowed; **separate authoritative financial workflows for the same operation are not**. If an old function already resolves a document or customer correctly, reuse its authorized read contract through a typed response adapter rather than implement another customer or statement query. If old input/action code lacks project binding, do not merely hide the old URL: first establish the server-side contract and safe transition plan.

## 6. Changes to the Stage 2C execution order

**2C Package 1 release status at this documentation checkpoint:** Web/PWA source and release completed through #391, #392, #393, #395, #396. The owner reported previously tested production functions passing; the final Personal-vs-Business empty-chat prompt fix from #395 was subsequently released in Web/PWA #396. **A fresh owner authenticated check of that final fix must not be assumed from CI alone**. Signed Android v110 predates #395, so the last scoped-prompt patch is **not** independently verified in that installed native bundle. No new native release is authorized by this document.

**Required new first step of Package 2 (2C.4):** inventory/reconcile existing **statement, report, payment-intake, existing typed response and project security** code under §4 before building Context Pack/EntityLink. Select **one real authorized read-only business or personal record** that the current app already provides. Define typed Context Pack as a projection (not another ledger); expose that same record through a vetted response adapter and authorized inspector with provenance. Demonstrate source parity, forbidden cross-project access and graceful unavailable data. Retain the legacy route until feature parity is accepted.

**2C.5 Smart Composer:** first reuse existing available action descriptors, financial/business forms and action/draft contracts wherever suitable. Inventory which operations are truly supported and which are draft-only vs read-only. Implement an authorized project-scoped launcher and **one** safe guided vertical slice. The proposed full two-way same-draft editing protocol remains **2D** unless current runtime proof establishes otherwise.

The owner reviews **capability-repositioning decisions before feature implementation** and examines the *actual* SANAD app in an isolated local worktree, not a standalone HTML prototype. Use fresh scoped PRs, baseline and permission tests, exact-final-SHA CI, explicit owner acceptance, then separately gated Production DB/Edge/Web/Android release and authenticated smoke. Keep the existing personal/business operational pages until their replacement is demonstrably safe.

## 7. Documentation, conflicts and current source precedence

1. **Live authorized runtime + current GitHub `main`** establish *what is deployed*. This doc records owner-approved product/engineering policy and initial inventory leads; older v4 screenshots/IA sections suggesting global «محادثة جديدة» or «المزيد» are historic and superseded by Package 1's approved runtime navigation.
2. The v4 program and D-ARCH remain the formal roadmap and reconciled architectural baseline; this addendum **clarifies delivery order and reuse**, not the phase names or permission model. Do not silently rebaseline seven later trains.
3. The single [working knowledge delta log](../implementation/SANAD_KNOWLEDGE_DELTA_WORKING.md) collects the corresponding proposed `SANAD.md` update; **do not rewrite the three owner Library originals** from this docs-only task.
4. Track remaining evidence as VERIFIED_RUNTIME / OWNER_APPROVED_DIRECTION / PLAN / PROPOSED / UNKNOWN. A repository path or CI PASS must never be promoted to «Production functional parity verified» without actual source/permission and user-facing checks.

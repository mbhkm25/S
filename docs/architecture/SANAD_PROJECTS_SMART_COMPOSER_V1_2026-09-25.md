# SANAD Projects + Contextual Smart Composer — Product/Architecture Baseline v1

**Date:** 2026-09-25  
**Status:** **Owner-approved product/architecture planning baseline**, docs-only PR #387 merged as `de3c42dbdf5728ec18227b661a4f75e5039580fa`. Detailed technical interfaces, legacy classification, security audit, visual prototypes and every implementation/migration remain separate 2C.0 gates.  
**Parent:** Stage 2C issue #386; execution roadmap v4 `docs/roadmaps/SANAD_EXECUTION_PROGRAM_V4_2026-09-25.md`.  
**Evidence:** D-ARCH production-vs-proposal reconciliation, R4 source and owner-attested R4 live Web/PWA smoke; do not treat these docs as proof of a new feature.

## 1. Product decision and explicit boundaries

SANAD is a **project-organized, conversation-first interactive operating layer** between authorized users, their personal finance/business domain data and connected traditional ERPs. The conversational workspace is the **primary operational UI**. Interactive records, forms, tables, drafts, source inspectors, reviews, charts and expanded work surfaces render *within this workspace*, not as a second full-function parallel Finance/Business UI. Retain dedicated native pages for **administration, account/security, connection setup, project/business management and platform configuration**; retain current legacy routes until feature parity and safe migration acceptance.

**Projects are organizational containers analogous to ChatGPT Projects.** A project groups multiple conversations, optional project-specific instructions, governed files/sources, available tools, work references and management controls. A project is **not** one huge forced persistent thread; users may have a default ongoing chat and create/pin additional topic/team chats. A conversation is an interaction/history container, not the canonical financial ledger or permission authority. An operation/draft/record is independently addressable across authorized chats inside its project.

Do not mistake project groupings for new authorization boundaries, permission grants, ledgers, independent account databases, or a mandate to create a physical `projects` table in 2C. Personal and business projection should use **existing verified identity/relationship contracts**, unless a separate gap audit justifies an additive model.

## 2. Project contract (2C design; approval/implementation separate)

Proposed UI-facing read model (illustrative schema, not a claim that these fields exist today):

```ts
type SanadProjectContext =
  | { kind: 'personal'; key: 'personal:<user-id>'; ownerUserId: string }
  | { kind: 'business'; key: 'business:<business-id>'; businessId: string }
  // 'system/help' support domain may be added later as a segregated non-financial workspace.

type ProjectView = {
  context: SanadProjectContext;
  displayName: string;
  viewerRole: string;               // descriptive only
  availableCapabilities: string[];  // discovery only, not an auth token
  conversations: { listingRoute: string; newRoute: string };
  sourceSummary?: { available: number; indexed: number; stale: number };
  adminRoute?: string;              // authorized existing business management route
};
```

- **Personal Manager / المدير الشخصي:** one default personal project per authenticated user, presently personal finance; future nonfinancial tools may join it. Never expose private personal finance to business-team members.
- **Businesses / الأعمال:** one business project per *authorized* business (owner, member, relevant relationship at the exact effective privilege level). Select business, inspect active identity, enter its chats, sources, functions or **existing** `إدارة النشاط التجاري` route.
- **Project overview:** compact recent/important work, conversations, sources, available actions and management entry; not a duplicate KPI-heavy dashboard or replacement accounting source.
- **Sources:** distinguish project instructions/uploaded reference files (contextual, dated and citable) from live approved ERP/financial read contracts (canonical monetary truth, source/freshness indicated). Attachments and full scoped retrieval/knowledge moderation incrementally in 2G; 2C may implement safe source navigation only for existing permissioned sources. Do not silently treat old attachments as indexed project documents.
- **Visibility:** being an authorized business member does *not* automatically grant every conversation, source file or stored assistant memory in that business. Preserve participant-specific thread authorization and a separate scoped source access policy. Shared files and conversations require explicit grant semantics. System/diagnostics chats, if added, may not gain business financial write scope.
- **Thread association:** retain existing `sanad_agent_threads.business_id` and `sanad_agent_thread_participants`. Existing null-business threads may be personal, system-related or legacy unclassified; **do not auto-assign all to personal**, do not delete/duplicate messages. Propose typed `project_context` metadata/read contract with an explicit migration classification policy tested against actual legacy rows. Immutable financial origin after a draft/action exists; moving chat between projects cannot retroactively reassign records or leak historical files. Recreate explicit selected *reference* in destination after authorization if needed.

## 3. Two-level context and hard authorization

`Project Context`: selected personal/business workspace and visible tool catalog. `Conversation Context`: owning project, participants, known active topic and non-authoritative history. `Request/Action Context`: canonical project scope, target financial/business source, typed entities/IDs, action/schema version, authenticated actor, authorized intent and draft ID.

Typed Context Pack for 2C:

```ts
type ContextPack = {
  projectKind: 'personal' | 'business';
  businessId: string | null;
  threadId: string | null;
  view: string;
  entity?: { type: string; id: string };
  period?: { from: string; to: string };
  filters?: Record<string, unknown>;
  origin: 'conversation' | 'guided_form' | 'entity_action' | 'today';
};
```

The Context Pack is UI/request state and **not a capability token**. Every sensitive read and every deterministic write independently rechecks server-authoritative actor/tenant/entity permissions. A commercial chat receiving `سجل مصروفًا شخصيًا` must request a clear move/switch to Personal Manager **before** creating any financial draft. Likewise switching active sidebar project may not reinterpret an already-open commercial draft; the draft itself binds immutable source, project/business and currency. Ambiguous business ID/entity/currency prompts for clarification, never best-guess mutation.

## 4. Navigation IA and project conversations

Global first-level sidebar, deliberately short:
1. **محادثة جديدة** — distinct action with identical icon container geometry, context-inheriting inside current project; if launched without an active project, ask for project.
2. **المحادثات** — all authorized projects / scoped project filters and history; pinned group and local search with truthful limits.
3. **اليوم** — cross-project recipient-authorized tasks, approvals, alerts and follow-ups; opening an item restores its canonical project and linked draft/record.
4. **المدير الشخصي** — personal project chat + its permitted tools.
5. **الأعمال** — authorized business project picker; selected project chat, sources and business administration.
6. **المزيد** — flat, non-nested secondary navigation to library, connections and other available functions; do not bury core navigation.

**Header/footer:** consistently sized Lucide icons and shared 40–44px container / minimum 44px touch target where appropriate; no visually oversized New icon. Footer is a separate aligned utility dock: notifications, active project/context selector (text when expanded; accessible label when collapsed), account/avatar. Move **الذاكرة وضبط المساعد** into global **الإعدادات → إدارة مساعد سند**, preserving existing settings/memory API and permissions; no duplicate inline second sidebar. Single global sidebar as already shipped, with timeline as the primary scroll owner and composer fixed **inside** workspace.

Inside each project: multiple chats + New, pinned, recent, archived and scoped search; no compulsory proliferation of chats per invoice. Pin is **per authenticated user and per project**, and can be personal preference even for shared threads. Server must retrieve pinned threads independently of current 50-recent-thread RPC; implement pagination/queries when scoped retrieval needs it. Do not infer that a current local search of 50 threads is global history search. Optional topic/work bookmark is distinct from pinning a whole chat; phase separately if needed. Accessible keyboard/context menu: pin/unpin, rename, archive (owner only where required), delete/share only after explicit authorization and confirmation contracts.

## 5. Smart Composer as the primary creation/control surface

One composer component, preserving free text, Arabic and mixed-language voice input, attachments and single-chat scroll geometry. An affordance **＋ إجراء / إضافة** opens a compact **searchable, project-scoped** action palette populated from safe action descriptors and effective authenticated permissions:

| Business project | Personal Manager | Type |
|---|---|---|
| فاتورة مبيعات / مشتريات | تسجيل مصروف / إيراد | Draft + review only until authorized handler exists |
| سند قبض / سند صرف | تحويل بين الحسابات / إيداع / استلام حوالة | Capability-gated; hide/disable future unsupported writes |
| كشف حساب / اليومية | كشف حساب / تقارير | Authorized read/query |
| عمل جديد / استكمال مسودة | تنبيه / مهمة / استكمال مسودة | Scoped action or Work Item |

**Not all rows are implemented today.** The palette must reflect actual available handlers; future items cannot look executable before backend authorization/execution support exists. A user may also describe the same supported request with natural language or voice; interaction source is not a separate ledger/action implementation.

Selecting a guided action renders a **typed interactive mini form attached to the active chat**. Example personal expense: account, category, amount, ISO currency, date; note, payee, optional linked item, source reference, attachment. A desktop two-row / up-to-five-fields layout is a compact *example*, not a fixed ten-field contract; auto layout responds to actual fields, Arabic length, 360–430px screens and keyboard. Larger invoices/tables expand into a full usable work canvas within the conversation workspace, not a tiny overlay with nested scrolling.

**Autocomplete** debounces and queries an authorized backend lookup scoped to the *project/action* and actor, ranking prefix + normalized Arabic spellings and IDs; never uses name alone as an entity identity, never leaks cross-business contacts. Keyboard `Tab` moves field-to-field; arrow/Enter selects a candidate; Escape closes the candidate list without discarding the draft; voice can fill/edit the **same typed draft**. Preserve explicit null, negative, decimals, per-currency formats and original raw source values; do not invent default account, currency or exchange rate.

## 6. Single canonical draft + presentation protocol (2C prototype, 2D execution)

One draft ID, authoritative version/revision, canonical `project/business/account` binding and typed action schema for **natural language, voice, composer guided mini-form, interactive card, reopened prior draft and Today approval**. The forms are different views of the **same draft**, not separate submission pipelines. The assistant must never rewrite approved revision silently or execute unregistered tools.

```text
User input (chat/voice/form/entity/Today)
  -> server resolve authorized project + entity + capability
  -> create/update versioned draft
  -> shared interactive view/edit
  -> server validation + reviewed immutable snapshot/version
  -> explicit authenticated owner/delegate approval
  -> deterministic approved handler (ONLY IF CONNECTOR CAPABILITY EXISTS)
  -> audited execution / reconciliation / returned canonical record
```

The currently deployed system allows `personal_transaction` and `commercial_document_draft`. Preserve these deployed semantics and their existing permission RPCs. A successful commercial **document draft** is **not posted into Edaa**. A future ERP write must go through a separate **outbound command connector** with vendor-supported API/transaction semantics, explicit separate authorization, idempotency key, timeout/unknown-status reconciliation, audit, rollback/compensation study and independent security/field rollout. **The deployed SANAD Bridge stays read-only toward Edaa.**

Example consistency contract: enter a customer + product in chat → open guided sales form → change quantity using keyboard → tell assistant `غيّر الكمية` → original draft ID/revision updates in both views → review exact revision → approval rejects any intervening revision change. Refresh/reopen recovers exactly the pending draft; never auto-post or duplicate after network retry.

## 7. Rich outputs, entity continuity, Today and long-chat lifecycle

Use a **typed renderer**, not unrestricted model-supplied HTML. Allow Snapshot, Record, Report, Draft, Approval, Execution Result and Warning with explicit provenance, source timestamp and action-state truth. Customer/invoice links open a scoped inspector/expanded view. Large statements/tables may take the primary canvas temporarily while chat remains accessible; no second parallel business operating application is required to use them.

A chat can be short or long; summaries/indexed topic references are aids to retrieval, **never** authoritative account balances or approvals. Project knowledge, per-chat memory, entity records and operational Work Items are distinct. Today aggregates recipient-scoped pointers across projects, then rechecks the canonical source on action. Unavailable party/amount metadata remains unavailable until the separate reviewed #385 contract; exact raw ERP numeric-text precision awaits #384.

## 8. Implementation/verification decisions still gated

**Owner-accepted direction, implementation not yet approved:** Projects resembling ChatGPT Projects; multiple chats; sources/tools/business administration per project; conversational primary UI; contextual quick-input forms; management/settings distinct; one canonical financial action pipeline.

**Open design choices for 2C.0 ADR review:** whether project source instruction objects need an immediate additive table vs existing knowledge model; how to classify legacy null-business chats without guessing; exact per-user per-project pin persistence and server query design; target first supported low-risk guided form; context selector transition and project home when there are zero businesses; handling shared-project conversation privacy. Test with real old thread schema and production permissions before any migration.

**Non-goals for 2C:** broad ERP write implementation; duplicating all current Finance/Business screens into rich chat; mandatory full 2I action library; unrestricted assistant HTML/actions; moving existing financial records across businesses by changing thread metadata; universal organization-wide memory; schema replay of old D1/D2/D3/R1.

**Required acceptance walkthroughs:** personal expense requested in commercial chat cannot create commercial expense; user switching from Business A to B cannot act on A's open draft without explicit revalidation; team viewer cannot see owner's personal chats/project files; pin an old authorized thread outside latest 50 and restore it on another device; begin draft in chat and edit/reopen in form with same ID/version; voice request and keyboard edit converge; RTL invoice with many lines remains usable on mobile and desktop zoom; Today opens original project review with version checks; unavailable connector capability displays honest unsupported state.

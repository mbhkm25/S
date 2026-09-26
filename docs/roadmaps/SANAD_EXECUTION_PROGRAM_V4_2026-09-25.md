# SANAD — General Execution Program v4: Projects + Conversation-First Interactive Operation

**Date:** 2026-09-25  
**Status:** **OWNER-APPROVED CURRENT GENERAL EXECUTION ROADMAP**; docs-only PR #387 merged on 2026-09-25 at `de3c42dbdf5728ec18227b661a4f75e5039580fa`. Supersedes v3 execution priorities while preserving v3 and D-ARCH as historical evidence. **This document is a plan, not an implementation authorization or an assertion that future features ship today.**  
**Central tracker:** #374; immediate Stage 2C issue #386. Architecture baseline: `docs/architecture/SANAD_PROJECTS_SMART_COMPOSER_V1_2026-09-25.md`; concrete 2C checklist: `docs/implementation/STAGE2C_PROJECTS_COMPOSER_EXECUTION_CHECKLIST_2026-09-25.md`; reconciliation source: `docs/architecture/DARCH_RECONCILIATION_2026-09-25.md`. Canonical knowledge in the owner's Library: `SANAD.md`, deliberately updated in **batches at accepted checkpoints**, not for every documentation commit.

## 2026-09-26 owner amendment — reuse-first positioning and current navigation

**Approved product/engineering principle:** The transition from payment notification/verification app to SANAD as an intelligent financial and commercial operating layer must **reuse and reposition audited prior capabilities before rebuilding them**. One canonical authorized handler/data/draft/approval/audit contract powers all relevant entry points (project chat, guided composer, legacy admin/tools, Today and separately authorized customer channels). Initial source-to-surface leads and the mandatory REUSE / ADAPT / REFACTOR / BUILD / DEFER evidence ledger are documented in [SANAD v4 Capability Repositioning](../architecture/SANAD_V4_CAPABILITY_REPOSITIONING_2026-09-26.md).

**Current approved navigation supersedes the older IA table below:** exactly **الرئيسية / المدير الشخصي / الأعمال** in the one global sidebar; personal/business conversations live **inside** selected projects, notifications in the sidebar header, global account/assistant settings in the footer, no global new-chat/chat list/**المزيد**. `الرئيسية` starts in the canvas at `مساحاتك` and then `ما يحتاج انتباهك`. Connections, automation and payment inbox live under **الأعمال**, with honest indications where existing account-level legacy endpoints are **not yet business-filtered**. Each project has a library **UI**, but actual scoped file indexing is a separate 2G authorization-dependent deliverable. Retain this older IA table as historical v4 planning context, **not** executable 2026-09-26 navigation instructions.

**Execution checkpoint:** Source #391/#392, Web release #393, signed Android v110 #394, project-specific starter prompts #395 and Web release #396 were completed per GitHub history; source+release implementation status is subject to fresh live verification. Do not infer Android v110 contains Web-only #395 or that final Web prompt relevance was owner-smoked without new evidence. Full 2C.4/2C.5 are **not delivered** merely because Package 1 shipped. The first Package 2 gate is a **read-only capability+permission inventory and a reused existing real read contract** before building new Context/Entity UI.

## 0. Verified checkpoint and migration from v3

- **R3:** single global sidebar shipped and owner-smoked. Previous verified Web/PWA rollback reference: `7a90c6e3aef92054014da70ba49d97d7aa0f4d48`.
- **R4:** PR #381 merged `344934f9246d3514ebef973bed59bf4bbab445cf`; guarded Web/PWA release #83 SUCCESS published `81c15fbda312d34bb3c1da937595efea15246b78`; independently deployed/verified `sanad-ai-agent-v1` Edge **v7** JWT-protected and file-matched; owner explicitly confirmed Production acceptance checks PASSED on 2026-09-25; issue #380 closed. Owner smoke is attested, not captured authenticated telemetry.
- **D-ARCH:** reconciled schema/migrations/privileges/relationship semantics docs-only PR #383 merged, issue #376 closed. Do **not** replay pre-D1/D2/D3/R1 obsolete migrations or bulk merge old branches #366/#377.
- **Separate known debts:** full exact-as-text ERP numerical fidelity + verified historical invoice-time COGS **#384** (2F); permissioned Today payment Work Item party/amount enrichment **#385** (2E); signed Android updater publication and direct public `/version.json` bytes are independent evidence/gates, **not** proven by R4 Web CI.
- **Planning baseline `main`:** `1fa3ee218e3955cece949f7875a3049456aaf299` when this docs proposal branch was created; recheck before any future feature branch and again before deployment. No new code/schema/Edge release in this v4 rebaseline.

## 1. Revised product philosophy and experience

**Product:** SANAD is a **project-organized, conversation-first interactive operating layer** bridging authorized customers/businesses, personal finance and existing read-only accounting-system integrations. Users organize work in **Projects / المساحات** analogous to ChatGPT Projects: each project can contain multiple conversations, a new-conversation action, pinned chats, instructions, permissioned reference sources, available tools, operational references and its management entry. The chat is the **principal operational surface**, enhanced with embedded rich cards, structured reports, interactive data tables, contextual mini-forms, and expanded full work canvases *inside the same conversational workspace*. Dedicated standalone pages remain only where direct native administration, settings, security and connection/project management are appropriate; keep legacy Finance/Business views working until verified replacement parity.

**Project types on first rollout:** one `المدير الشخصي` default project per user (currently personal finance; nonfinancial tools later), and a business project for **each business the authenticated actor is actually authorized to access**. Project listing is a navigation/data projection over shipped D1 relationship and R1 participant contracts; it is **not a new data security grant**. Future optional other project types require their own evidence and approval, not arbitrary global personal/business dataset mixing. Both personal and business projects may have multiple discussions (including optional ongoing general thread); no compulsory one-forever-thread and no chat-per-invoice requirement.

**Operational data rules:** one canonical typed Action/Draft interface for prompt, voice, contextual composer and rich form; server validates source project, actor, entity IDs and approval version. Imported instructions/files are contextual reference; the permitted live account ledger and ERP read contract are the source of balances/transactions. A project member does not inherit access to every private team conversation, private personal file or assistant memory. Project migration does not reassign an approved draft or previously posted record.

### Primary IA

| Main nav | Expected first interaction | Feature boundary |
| --- | --- | --- |
| **محادثة جديدة** | Contextual action inside current project; project picker if unscoped | Not a separate massive menu section |
| **المحادثات** | Authorized project-scoped chat directory, pinned/recent/archived, search with explicit scope | Many chats inside one project, pins per-user |
| **اليوم** | Attention stream: recipient-authorized tasks/approvals/follow-ups across projects | Revalidates original source on action; not a duplicate ledger |
| **المدير الشخصي** | Personal project conversation + financial functions, future personal tools | Account settings remain global |
| **الأعمال** | Pick authorized business project; project conversation, sources and `إدارة النشاط التجاري` | Retain separate business management interface |
| **المزيد** | Flat secondary available capabilities (library, connections, etc.) | No nested grouping or duplicate Settings routes |

Global bottom dock: consistent notification, active project selector/label and account/avatar; memory/assistant preferences move to **الإعدادات → إدارة مساعد سند**. Single sidebar scroll ownership; composer remains inside workspace. All icons and interactive hit targets geometrically consistent. The user-supplied sidebar screenshot is a UX input, not a claim that any pictured future change has been implemented.

### Smart Composer

The composer offers writing, voice and attachments as today, plus a **project-aware search/quick-action launcher** (`إجراء / إضافة`). Its catalog is sourced from actual **enabled + authorized** capability contracts, not arbitrary LLM suggestions. In a business project it can expose *supported* sales/purchase draft, receipts/payments and read-only statements/daybook; in Personal Manager it exposes *supported* expenses, transfers, deposits, receipt of remittance, reminders and reports. **Unavailable future actions are hidden or accurately labeled, never rendered as already-executable.**

Choosing an action opens a **typed guided mini-form** attached to the chat. Example expense desktop layout up to two rows/five fields (account, category, amount/currency/date and optional note/payee/reference/attachment) reflows on mobile. Arabic-aware authorized account/client autocomplete must return stable IDs; keyboard Tab + arrow/Enter + Escape and touch semantics matter more than visual novelty. Longer invoices/tables expand into a primary work canvas **within the conversation**, not a second fully duplicated commercial application. Chat, voice and form modifications must converge on the **same authoritative versioned draft** once supported by 2D.

**Release truth:** current Bridge reads Edaa only. SANAD may create its own commercial **draft** now, not silently post to Edaa. Any future ERP-write integration is separate audited outbound connector research/implementation with explicit platform approval, vendor contract, idempotency/reconciliation, source-of-truth mapping, rollback and field security proof. Do not weaken existing read-only Bridge policy by implementing Smart Composer.

## 2. Coherent release trains (preserve v3 IDs and dependencies)

| Train | Updated user-visible outcome | Scope gates / prerequisites |
| --- | --- | --- |
| **2C — Projects, Context + Conversational UX Foundation** | Project containers as above, multi-chat/pins, shorter unified sidebar, per-project context and authorized EntityLinks, typed interactive response renderer, Smart Composer catalog and one safe guided prototype | Owner sign-off on ADR, D-ARCH actual RLS/RPC audit, additive-only migration if genuinely required; **no broad action registry/ERP writes** |
| **2D — Unified Action + Draft Intelligence** | Shared server-validated typed capability/action registry for NL/voice/form/UI; entity resolution, single persisted versioned drafts, direct editing, review, explicit approval, deterministic audited execution | 2C source/project context; preserve current personal transaction and commercial document *draft* semantics; no automatic ERP posting |
| **2E — Today / Operations + Notifications** | Consolidated recipient-scoped tasks/approvals/alerts/automations and return-to-original-project action; bilateral customer/business event routing and replay/idempotency | Existing D3 source events/Work Items, 2D source/version check; #385 permissioned metadata enrichment; no second financial truth |
| **2F — Connections + Read-Only ERP Bridge** | Project-scoped connection registry/diagnostics, chat-assisted Bridge setup/repair/health, authenticated financial provenance; investigate exact source decimal transport and historical cost method; WhatsApp feasibility | Existing D2 registry and secure token boundary, Edaa **read-only**; #384; future **ERP-write adapter is a separate post-feasibility authorization/gate** |
| **2G — Project Knowledge + Collaboration** | Project file sources/instructions/indexing/citations, permission-scoped user/business facts, glossary and derived MD profiles, private/shared team chats, per-user project knowledge controls | Existing platform knowledge and R1 member/access semantics; permission revocation/privacy/forget/correction; never replace live ledger with recalled memory |
| **2H — Business Relationship Network + Reconciliation** | Business↔customer/supplier governed relationships, document/claim sharing, uploaded statement matching/exceptions/agreements and source-scoped audit surfaced conversationally | 2D approvals + 2E bilateral routing + 2F ERP provenance + independently reviewed tenancy contract |
| **2I — Full Guided Form Library + Search/Ecosystem** | Production-grade compact invoice/purchase/receipt/payment/journal/report forms and expandable chat canvases, authorized autocomplete, project-wide/full-history search, universal Ctrl/Cmd+K, library/typed plugin capabilities | 2C renderer/composer and 2D action registry demonstrated; paginate/search entire backend data, not just 50 chats; verify scale, mobile/keyboard and support |

This is a **change of frontend delivery strategy**, not permission to drop domain APIs, canonical accounting data, admin pages or contracts. Maintain existing Business/Financial operational routes during transition as a compatibility surface, then remove/redirect only by separate user-accepted parity gates.

## 3. Immediate 2C release train — five slices, one acceptance train

Read the full per-slice checklist in `docs/implementation/STAGE2C_PROJECTS_COMPOSER_EXECUTION_CHECKLIST_2026-09-25.md`. Do **not** pre-create branches for 2D–2I.

| Step | Focus | Evidence before proceeding |
| --- | --- | --- |
| **2C.0 Design Gate** | Approve detailed project/composer ADR, visual user journeys, scope migration & security matrix; no runtime change | Owner review of docs/prototype, known gaps marked proposed |
| **2C.1 Project/Context Contract** | Virtual personal/business projection, actor/participant permissions, immutable origin for financial drafts, explicit cross-project switch, legacy thread migration | Cross-tenant/role negative tests + no legacy data loss |
| **2C.2 Navigation/Project UX** | Project entry, one short global sidebar, Today grouping, assistant settings relocation, unified icon and footer dock | Desktop/mobile/RTL/accessibility and legacy-route parity |
| **2C.3 Conversation Organization** | Multiple chats inside each project, per-user pinned/recent/archive/search/pagination, shared visibility constraints | Pinned thread older than 50 loads; two devices, revoked participant |
| **2C.4 Interactive Entity/Results** | Authorized EntityLinks, inspector, typed source/freshness cards, expand-in-chat full canvas | Real permitted read-only statement/record + small and large responsive cases |
| **2C.5 Smart Composer Foundation** | Contextual searchable action launcher, schema-driven mini-form and scoped Arabic autocomplete, voice/text intact; **one non-posting or current-safe vertical slice** | Correct project binding, keyboard/mobile and truthful unsupported capability state |
| **2C.V Train acceptance** | Security/synthetic regression + same-SHA CI; owner review and stage release | Explicit owner preview/merge approval, independent Web/Edge gate when needed, owner live smoke |

A single 2C.V integrates **multiple small PRs**, not one monolithic frontend+schema+visual bundle. Any additive DB/RLS change receives its own migration/rollback PR. **Do not assume completing 2C prototype means general two-way draft sync exists; that is 2D.**

## 4. Executable invariants and hard negative cases

- Business chat receiving personal financial request → explicit Personal Manager transfer/clarification; no business draft or account mutation.
- Switching Business A → B leaves A's existing draft bound to A and cannot approve it from B without verified original context and actor permission.
- Shared business membership ≠ permission to read all shared/private chats or attached files; revoke access correctly.
- Users may pin project threads older than latest 50; pins per user, visible on authorized second device; backend pagination not local-only search.
- Same supported action via typed input and guided form → **one** persisted draft and revision sequence, with stale-review rejection before execution; never infer financial posting from draft creation.
- Source amount/date/currency correct; SAR and YER remain separate unless explicit sourced dated FX; null/unavailable cannot become 0.
- Project documents/instructions cannot override live ERP financial truth; memory summaries cannot become authoritative balances.
- Direct new ERP write cannot be implemented by opening the existing read-only Bridge; require independent outbound adapter and security signoff.
- Long invoices and large reports use interactive expanded canvas; one primary timeline scroll, composer owned by workspace, RTL/mobile safe areas and keyboard access.

## 5. Release, branch, data and knowledge management

- Canonical product work: open issue → latest verified main → short-lived scoped branch → baseline/regression tests → precise unit/permission/visual changes → same-final-SHA Production/Operation/Admin/Android CI as applicable → isolated user local preview → **owner explicit merge authorization** → separate guarded Production rollout and postflight → owner authenticated smoke → close issue/train. Do not auto-merge a docs design proposal as feature implementation approval.
- Branch inventory remains historical (~393 names at old checkpoint, not 393 unmerged features); never bulk-merge stale old docs/Bridge/preview branches or delete without reviewed identity/dependencies.
- D-ARCH verified existence of multi-business/participant/connection/domain-event/work foundations. Remaining registry/facts/glossary/agreements/reconciliation require new small audited additive contracts; no pre-D1/D2/D3 replay.
- Stage 2C starts with design and read-only audit, not a disruptive data or frontend rewrite. Personal/Business classic routes remain reachable until corresponding chat interactive functionality reaches user-accepted parity.
- Three Library knowledge documents: **read without editing each conversation**, append changes into a working delta log, de-duplicate/resolve conflicts and batch updates to relevant originals only when a release gate or explicitly approved work checkpoint closes. Docs-first roadmap update should not itself rewrite Library `SANAD.md`, `ABU_SANAD.md` or `SKILL.md`.
- Feature flags, safe deployment and rollback for each train; Android physical/signed hardening at major checkpoints only (field test build is not signed release). Production user data should never be modified solely to make a smoke-test demo.

## 6. Explicitly deferred or still open

1. Precise initial `Project Sources` persistence and indexing model (reuse existing platform knowledge where justified vs new scoped model), and complete team-visibility semantics: decide in 2C.0/2G with read-only current-state evidence; avoid prematurely promising full project file indexing in 2C.
2. Exact legacy null-`business_id` thread classification and default-chat creation policy: design and user-accepted migration plan, never silently reclassify.
3. Action catalog support varies by available server handler and project; not every listed future receipt, purchase, remittance or journal is already supported. Label prototype/unsupported states honestly.
4. Cross-source linked transactions, fully verified historical Edaa COGS and new ERP writes remain separate domain work. Wallet/regulated money movement and marketplaces remain **documentation only** pending legal/provider/security review.

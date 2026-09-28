# Stage 2C — Project Workspace, Context, Navigation and Composer Foundation: Execution Checklist

**Prepared:** 2026-09-25. **Status:** **Owner-approved execution plan, documentation only**; docs PR #387 merged as `de3c42dbdf5728ec18227b661a4f75e5039580fa`. 2C.0 runtime/permission audit and responsive prototype remain outstanding; no feature implementation is approved by this plan alone.  
**Parent issue:** #386; blueprint: `docs/architecture/SANAD_PROJECTS_SMART_COMPOSER_V1_2026-09-25.md`; v4 roadmap: `docs/roadmaps/SANAD_EXECUTION_PROGRAM_V4_2026-09-25.md`.  
**Start baseline:** R4 owner-reported Production smoke complete; Web/PWA #83 published `81c15fbda312d34bb3c1da937595efea15246b78`; Edge `sanad-ai-agent-v1` v7 ACTIVE/verified; D-ARCH #376 complete; docs-current main at first planning checkpoint `1fa3ee218e3955cece949f7875a3049456aaf299`. No 2C feature code or DB change authorized by writing this checklist.

## Gate 0 — Reconcile and approve architecture, **no feature implementation**

- [x] Verify main, latest R4 release #83 and Edge v7 independently; user has reported R4 production tests successful; R4 issue #380 closed with owner-attested caveat.
- [x] Read Production-backed D-ARCH matrix; reject obsolete pre-D1/D2/D3/R1 migrations or stale sidebar designs.
- [x] Draft blueprint for ChatGPT-Projects-like groups, multiple chats, project sources/tools/business management, conversation-first UI and Smart Composer.
- [x] Owner explicitly approved **the detailed Project/Conversation/Composer planning ADR and execution breakdown**; docs PR #387 passed exact-head checks and was merged. **This does not complete 2C.0**: still resolve open technical choices through a read-only schema/authorization audit and review representative responsive prototypes before coding.
- [ ] Read-only verify the existing live frontend navigation/thread RPCs, shared participant roles/grants, existing project-independent file/knowledge model, active personal/business account access and prior unscoped conversations; publish a data-compatibility decision with negative test fixture matrix.
- [ ] Prepare representative desktop (1280/1366/1440/1920, 125/150% zoom) and mobile (360/390/430 keyboard open/safe area) prototypes, including empty projects, loading/error, Arabic/English numeric input, long activity lists and no-double-scroll. Review before implementing layout.

**Gate output:** owner-approved ADR + user journey prototype + migration/security/rollback checklist; all tagged as plan rather than shipped functionality.

## 2C.1 — Typed Project/Scope Read Contract

1. [ ] Design virtual **personal:<user>** context and **business:<business_id>** projects over actual D1 identities and member/customer relations; avoid physical project-table duplication unless an approved audited gap justifies it.
2. [ ] Define typed `ProjectView`, Context Pack, current project selector and project-scoped capability metadata; client context never grants backend permissions.
3. [ ] Audit current threads' `business_id` vs null and old metadata; determine safe *opt-in/explicit* classification for legacy null threads that could be personal or system. Ensure no loss of old chats, messages, attachments or read state.
4. [ ] Preserve immutable approved-draft origin project/business even when sidebar context changes; cross-project requests route to explicit switch/clarification and optionally a new authorized thread. Separate project visibility from per-thread/file member visibility.
5. [ ] Targeted server contract/permission tests: user A/B, business A/B, owner/member/viewer, anonymous, removed participant, no-business account, shared thread, stale IDs; verify no cross-tenant project source summary.
6. [ ] Create **separate security-reviewed migration PR only if actually required** (RLS, indexes, app/API compatibility, additive/backfill/rollback). No D1/D2/D3 schema replay.

**Done:** truthful project list and scope/permission contract under both ownership and membership, legacy chats preserved, CI and privileged negative tests documented. No visual navigation yet.

## 2C.2 — Single Sidebar / Projects Navigation

1. [ ] Replace current excess nav grouping with **محادثة جديدة، المحادثات، اليوم، المدير الشخصي، الأعمال، المزيد**. New is an action; the others are nav destinations. Flat **المزيد** contains only secondary available capabilities, not nested groups.
2. [ ] **المدير الشخصي** opens personal project (present personal finance; label future nonfinancial capabilities accurately). **الأعمال** displays user's authorized businesses; project opens chats/sources/tool entry and *existing* `إدارة النشاط التجاري` admin route. Support no-business empty state.
3. [ ] Place **المهام والموافقات** under **اليوم** while keeping permissioned canonical source/action reads and deep links; don't fabricate a single new financial ledger.
4. [ ] Move existing **الذاكرة وضبط المساعد** content (not only its links) to **الإعدادات العامة → إدارة مساعد سند** preserving preference loading/saving/rollback and memory controls. No second sidebar overlay or duplicated preferences.
5. [ ] Use unified icon glyph size/stroke and identical icon box geometry, even for New; active/focus/hover semantics and titles accessible in collapsed mode.
6. [ ] Stable bottom utility dock: notification button, **clearly named project/context switcher**, profile/avatar; align common geometry and expose labels/keyboard/mobile focus. Keep active business visible without ambiguous icon-only display when expanded.
7. [ ] Preserve shipped R3 Shell viewport, conversation scroll/composer ownership, lazy route splitting and redirects to old current routes until parity proven. Avoid broad unsupervised color/typography redesign.

**Done:** both expanded/collapsed desktop and mobile drawer can navigate all available current features, screen-reader focus paths work, and no route or preference regression.

## 2C.3 — Project Conversations, Pinned Chats and Retrieval

1. [ ] Each project shows **multiple threads**, New, pinned, recent, archive and project-scoped search; optional recurring general chat is a convenience, not mandatory.
2. [ ] Pin/unpin is a **per-user, per-project preference**, including shared threads; pin in one user's account does not reorder another's.
3. [ ] Choose a safe server persistence contract (additive separate preference or equivalent; not global mutable thread `is_pinned`). Enforce per-participant access and revoke visibility when role changes.
4. [ ] Query pinned threads **independently of existing 50-item recent list**; implement backend pagination and stable order with scalable indexes. If full-text message search is deferred to 2I, label 2C search clearly as thread-title/summary scope.
5. [ ] Preserve exact archive and owner-only mutations, thread select/new behavior, shared read marker, signed-in multi-device continuity and no implicit copying of private chat across business projects.
6. [ ] Test long existing histories (>50), 0 pinned, many pinned, renamed/archived pinned, deleted/revoked shared pin, offline/fetch error, Android keyboard.
7. [ ] Distinguish **pin whole conversation** from **bookmark operational record/topic**; first-class topic/work bookmark may be scheduled separately after EntityLink foundation.

**Done:** project-specific pinned/recent navigation survives reload/two devices and honors RLS/role constraints under old data.

## Mandatory owner amendment — 2026-09-26: capability repositioning audit BEFORE Package 2

**Applies to both 2C.4 and 2C.5.** Read [Capability Repositioning and One Operational Core](../architecture/SANAD_V4_CAPABILITY_REPOSITIONING_2026-09-26.md) first. The older unchecked checklist items for Package 1 and the former global «اليوم/المزيد» menu are **historical planning wording**, not a claim that Package 1 is unimplemented or an instruction to restore removed navigation. Source PRs #391/#392/#395 and guarded Web releases #393/#396 changed that UI; final authorized Web prompt smoke and native patch parity remain evidence-specific.

Complete this **read-only gate** on the current live code/permission contracts before new 2C.4 feature implementation:

- [ ] Inventory prior SANAD payment verification/inbox, personal/business finance, approved drafts, report/statement renderer, notification/Work Item, knowledge, ERP/Bridge and relationship functions **as candidates**; do not treat a matching filename as deployed proof.
- [ ] For each capability relevant to Package 2, record: current frontend/Edge/RPC, actual permitted actor and personal/business/project scope, canonical record, provenance/freshness, legacy input/output, approval/audit/idempotence, target chat/inspector/form/Today/tool entry points, migration and fallback.
- [ ] Classify each affected capability **REUSE / ADAPT / REFACTOR / BUILD / DEFER** with a written evidence-based explanation and owner review. Favor reusing an existing secure customer-statement or report *read contract* for the 2C.4 first real interactive card.
- [ ] Demonstrate that moving business-related legacy features into project navigation does **not** falsely imply their underlying APIs have a business filter. Preserve the original route until permission and feature parity are proved.
- [ ] Trace all access paths for Personal-vs-Business A/B and team/customer/private thread/file roles. A form/chat/old tool may use different UI components but may **not** create a second authoritative financial/approval path for the same operation.
- [ ] Define one real low-risk 2C.4 read-only end-to-end slice and one supported 2C.5 guided input slice from capabilities actually authorized today; record why reuse is or is not safe.
- [ ] Log decisions, negative tests, current vs intended behavior, owner preview and rollback on scoped issues/PRs. Keep live runtime truth, approved direction, proposed adapters and unknowns distinct.

**Done:** owner-reviewed capability ledger, a demonstrably reusable canonical source/authorization path, no duplicate financial truth, explicit unsupported/uncertain capabilities, and approved scoped implementation plan. Do **not** begin new schema migrations or a second report/accounting implementation just because the new chat UI needs data.

## 2C.4 — Typed Entity + Interactive Output Foundation

1. [ ] Establish canonical typed `EntityLink` resolving authorized business/party/customer/invoice/transaction/document/Work Item by stable ID, visible label and source timestamp; do not reveal forbidden details in link previews.
2. [ ] Typed renderer for Snapshot/Record/Report/Draft/Approval/Execution/Warning with source, sync freshness and accurate `draft created ≠ posted` semantics; plain chat remains intact for normal responses.
3. [ ] Build one interaction shell for compact chat card ↔ responsive expanded **work canvas inside conversation**; not a parallel accounting route. Inspector desktop panel/mobile safe bottom sheet or route; canonical data read on open.
4. [ ] For long tabular reports choose expanded canvas with accessible scroll, search/pagination/export only after read contract is verified; never embed vast ERP replicas in chat model context.
5. [ ] No model-provided arbitrary HTML/code component or trust of optimistic success; renderer takes server-validated structured schema. Validate missing/unavailable/negative financial values and mixed currencies.
6. [ ] Regression tests for RTL/bidi amount/date, empty permission denial, stale source, high table density, keyboard and route restoration.

**Done:** at least one permitted live read-only record/report is navigable from chat to scoped inspector and back; no duplicate source-of-truth.

## 2C.5 — Contextual Smart Composer Shell + **limited prototype**

1. [ ] One Composer for text/voice/attachments + visible **إجراء / إضافة** launcher. Project kind, exact selected project and effective capabilities determine search/palette grouping; hide or label unavailable future actions rather than falsely displaying executable operations.
2. [ ] Define versioned **action descriptor/form schema**, field IDs, types, requirements, visibility, per-currency precision, entity lookup contracts, safe default policy, and layout metadata independent of visual component names. 2C may consume existing safe handlers only; 2D builds full backend shared registry.
3. [ ] Demonstrate **one supported thin vertical slice** using current permitted personal transaction *draft*, or choose an existing non-posting read-only statement as a fallback if operational testing would affect Production; use sandbox/test rows, never mutate live user finances for preview.
4. [ ] Desktop compact example can fit up to 2x5 fields for expense; narrow/mobile recomposes without clipping. Debounced authorized Arabic-prefix autocomplete returns canonical IDs within current project; keyboard Tab, arrow/Enter, Escape, screen readers and voice dictation work.
5. [ ] Opening form from a recognized chat request and from launcher must yield **the same authoritative draft ID + revision** when supported by existing contract; where not supported yet, demonstrate a read-only/prototype state and explicitly hand off missing synchronization to 2D rather than a second shadow draft.
6. [ ] Never mutate an approved draft silently; no unsupported `سند قبض/صرف` or Edaa sales/purchases posts implied by menu; ensure project switch blocks wrong-scope submission and cleans stale suggestions.
7. [ ] Preserve composer sticky **within** workspace, timeline one primary scroll, attachments preview, mobile viewport keyboard avoidance and responsive animation/reduced motion.

**Done:** owner can trigger a known-safe guided operation, use Arabic autocomplete and keyboard, see truthful draft/unsupported state and switch back to text/voice without duplicate operation or wrong project.

## 2C.V — Formal integration/owner release gate

- [ ] Close all blocking permission and lost-draft defects; demonstrate all scenarios below with screenshots/test fixtures and reproducible exact candidate SHA.
- [ ] Same-final-SHA Production/Operation/Admin/Android field-build checks where applicable; lint/typecheck, route, bundle budget, semantics and accessibility tests. **Android build ≠ signed updater publish**.
- [ ] Independent personal-laptop worktree local Web preview; desktop-first/mobile-safe matrix, cross-device history and no double-scroll; QA approval for implemented 2C scope only.
- [ ] Owner **explicitly approves implementation**, then merge scoped PRs and independently trigger guarded Web/PWA release; Edge/database deployments, if required, receive separate plan/version/rollback; preserve prior verified rollback refs.
- [ ] Owner-authenticated production smoke; update issue/roadmap. Batch changes to canonical `SANAD.md` only at approved checkpoint, and `ABU_SANAD.md`/`SKILL.md` only when their own relevant facts/rules changed.

## Acceptance scenarios — mandatory evidence

| ID | Scenario | Pass condition |
| --- | --- | --- |
| S1 | Open a commercial chat and request a personal expense | Explicit personal-project switch/clarification **before** any draft; no business ledger write |
| S2 | Switch from Business A to B during unfinished draft | Original draft retains business A; B cannot approve it by sidebar switch; user can return explicitly |
| S3 | Business viewer tries to open owner's private chat or attachment | Server denies and nav neither leaks metadata nor exposes the record |
| S4 | Pin a permissible old thread outside latest 50 | Persists in current project list and on second device; only pinning user's preference changes |
| S5 | Same supported task enters via launcher and natural-language composer | Shared canonical draft identity or explicit 2D-gated prototype limitation; no duplicate submissions |
| S6 | User changes form field after a review snapshot | Review becomes stale/reissued; previously approved version cannot execute changed payload |
| S7 | Arabic account/customer lookup matches several similar names | User explicitly selects canonical scoped ID; no cross-business suggestions or guess execution |
| S8 | Large report/invoice in phone and 150% desktop zoom | Expandable work canvas usable, screen-reader/keyboard operations, composer and content not obscured |
| S9 | Today aggregates personal and commercial pending work | Every item shows source project; opening/approval preserves canonical original identity |
| S10 | Request an unsupported Edaa write from business project | Explicit capability-unavailable / guided future indicator; Edaa Bridge stays read-only |
| S11 | Network loss/retry while form is open | Persisted draft restores exactly or explains unsaved state; idempotent retry never creates duplicate posting |
| S12 | Project-specific file/instruction conflicts with live ledger data | Assistant labels document as reference and uses authorized live source for balances/invoice truth |

## Ownership and release scope

2C delivers **project/context/read/navigation + presentation/composer foundation**. 2D delivers **server-governed universal typed actions and full conversational/form draft synchronization**. 2E delivers fully projected Today workflows; #385 handles optional permissioned enrichment. 2F handles read-only ERP/cost fidelity #384 and adapter capabilities; future ERP-write connector is a **distinct later authorized program**, not part of existing read-only Bridge. 2G provides project-source upload/indexing and scoped durable knowledge/collaboration; 2H handles business relationships and reconciliation; 2I scales out all guided invoice/purchase/receipt/payment forms and global search. This ordering prevents a giant 2C refactor disguised as UI work.

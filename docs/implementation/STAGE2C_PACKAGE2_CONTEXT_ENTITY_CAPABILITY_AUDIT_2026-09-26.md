# Stage 2C Package 2 — Read-only capability audit and 2C.4 implementation evidence
**Date:** 2026-09-26
**Status:** Implementation candidate; **NOT merged, NOT released, NOT owner-accepted**.
**Parent:** #386. Owner-approved direction: legacy capability repositioning, documentation candidate PR #397 (still separate/draft at start).
**Base:** `main 8b9ec1f118332865e141f9110aed4e6e5ce80ddd`. Scope: first 2C.4 read-only ERP statement vertical slice, Context Pack + vetted EntityLink route. No DB, Edge, public report-sharing or ERP writes.

## 1. Evidence labels

- **SOURCE_VERIFIED:** named React/TS implementation and existing tests read at the base SHA.
- **PRODUCTION_CATALOG_VERIFIED:** PostgreSQL catalog and current function definitions read from active `sanad_verify_v3`; **not a session-based penetration test**.
- **NOT_VERIFIED:** live user-role negative fixture, post-preview runtime fidelity, full production Web SHA and signed Android freshness.

Never promote a source file to deployed capability, a catalog permission to safe end-to-end authorization, or a new UI candidate to owner-approved release.

## 2. Mandatory capability register — 2C.4 affected domains

| Capability | Existing owner/evidence | Existing live grant and source | Disposition in Package 2 | Remaining gate |
| --- | --- | --- | --- | --- |
| ERP customer candidate search | `BusinessErpCustomerStatement.tsx` → `businessAccountingApi.ts`; `get_business_erp_customer_candidates_v1` | Production `SECURITY DEFINER`, `auth.uid()`, business owner/active member check; `authenticated EXECUTE` true, `anon` false | **REUSE** current read and stable `business_id + account_id`; no new search backend | Session-based owner/member/revoked/nonmember negative fixtures before Production |
| ERP customer statement | Same component/API; `get_business_erp_customer_statement_v1` | Production function checks `auth.uid()`, owner/active member, `business_id`, `account_id`, dates, most recent completed logical snapshot | **ADAPT** existing read into assistant inspector; no duplicate ledger/query | Cross-business authorized fixture, baseline parity, large statement performance |
| Assistant structured results | `agentFoundation.ts`, `SanadAgentResponseBlocks.tsx`, `SanadAgentWorkspace.tsx` | Current server result already contains customer statement cards and typed ERP customer entity hints; server-verified thread detail obtained via `get_my_sanad_agent_thread_v2` | **ADAPT** compact card/EntityLink with typed local Context Pack target; lazy inspector | Validate persisted/historic card shape, stale thread switch and mobile keyboard |
| ERP document detail/list | `businessAccountingApi.ts`, `get_business_erp_documents_v1`, `get_business_erp_document_detail_v1` | Production functions owner/active member recheck; authenticated EXECUTE true, anon false; document-kind and numeric ID parameters | **REUSE in second isolated 2C.4 UI slice:** document inspector opens from verified same-project document list/entity link; RPC reauthorizes every open. Old ERP documents route retained. | Role/session denied fixtures and customer-statement #399 parity release blocker remain |
| Assistant action review | `SanadAgentActionCard.tsx`, `assistantActionApi.ts`; `get_my_sanad_agent_action_v1`, `approve_my_sanad_agent_action_v1` | Production personal action read checks user ownership; approval has expected-version parameter | **REUSE UNCHANGED**; no action mutation in 2C.4 | Full common typed registry + two-way form sync belongs to 2D |
| Payment inbox | `PaymentInbox.tsx`, `paymentInboxApi.ts`; `get_business_payment_inbox_v3` → v2 | v2 authorizes with `private.has_business_payment_permission('view')`; supervisor-only list modes; **v2 read can expire stale claims as a side effect** | **DEFER** new inspector, preserve existing view; do not describe current call as side-effect-free | Role/session fixtures and bounded read projection before chat inspector |
| Work Items / notification attention | `sanadWorkItemPresentation.ts`, `notificationApi.ts`, `get_my_sanad_today_v1` | Today filters by recipient and optional authorized business; Work Item details may lack party/amount | **REUSE** existing Today/source deep links; **DEFER** details enrichment to #385 / 2E | Source revalidation, recipient and revocation tests |
| Old ERP statement UI source precision | `BusinessErpCustomerStatement.tsx` originally `Number(value \|\| 0)` + maximum 2dp | Same canonical statement RPC; present numbers may already have been rounded by JSON→JS upstream | **ADAPT** old display to existing `formatSanadSourceAmount` so null≠0 and received digits aren't further rounded | Full exact numeric-text transport remains #384, NOT claimed solved |
| Global/public reports | `Reports.tsx`, `BusinessReports.tsx`, `PublicInteractiveReport.tsx` | Distinct report creation/delivery and token-based public link | **DEFER** generic token and interactive report unification | Separate token scope/expiry/share review; no reuse of public report security for private inspector |
| Project knowledge / library | Existing knowledge/admin components and source tables | General knowledge infrastructure does not establish project-private file access | **DEFER** to 2G | Explicit indexing, tenancy and revocation design |

## 3. Actual implementation contract (first thin slice)

`get_my_sanad_agent_thread_v2` resolves an authorized conversation scope. The UI passes a verified business/thread pair to `sanadEntityContext.ts`; it rejects absent context, mismatched entity business, unsafe/ambiguous ERP account ID and malformed/date-inverted filters. This **is not server authorization**: on open the lazy inspector calls existing `businessAccountingApi.getBusinessErpCustomerStatement`, which invokes `get_business_erp_customer_statement_v1`. The RPC independently checks current owner/member access. No service-role query and no new database view.

Statement card remains embedded in conversation and old legacy route remains reachable. Expanded inline work region reads the current authorized snapshot, presents per-currency totals, source snapshot ID and *separately labeled* client read time. The latter **is not sync freshness**. A responsive horizontal table renders at most 25 rows initially with progressive reveal; underlying existing RPC still returns the full statement — server-side pagination/precision is not asserted or simulated.

The inspector handles no snapshot, permission/read failure, ambiguous customer/account identity warning and no values. No model-provided HTML or href can replace the trusted statement RPC in this path. Display-only Context Pack does not persist or grant access. No source posting, new draft or approval from the inspector.

## 4. Typed result compatibility adapter

The 2C.4 first slice includes `sanadInteractiveResultKinds.ts` as a **presentation-only** mapping across all seven approved families, without changing the deployed model/Edge response schema. `metric/replica_status → Snapshot`; `customer_statement/document_list/payment_inbox_list → Report`; existing entity references → Record; `action_review` in review/approved/executing → Approval, completed commercial document **draft** → Draft, completed personal transaction → Execution Result, failed/cancelled action and explicit warning → Warning. The authoritative `SanadAgentActionCard` status interpretation remains unchanged, so these classifications are not proof of posting or a new general Action Registry. Each rendered block receives a `data-sanad-result-kind` attribute for QA and later visual consolidation; the legacy card contract remains compatible.

## 5. Permission/quality regression and release gates

Automated `scripts/check-stage2c-context-entity.ts`: valid authorized target, missing/changed business scope, mismatched entity business, invalid/noninteger IDs, invalid/reversed date ranges; exact received decimal formatting/null and static canonical RPC path assertions. It is wired into existing `check:routes`. CI pass is **not** live role test.

Before owner preview or release, validate with authorized disposable sessions on isolated/synthetic data where possible:
1. Business A owner and currently active member load the SAME ERP account from legacy route and inspector; compare snapshot ID, per-currency totals and all movements. No cross-currency sum.
2. Business B user/removed A member opens an old A link: no read; no cached A name/amount on denial. Business A member lacking payment inbox privileges must not gain inbox access through this feature.
3. Personal and legacy-unclassified conversations show no statement inspector; malformed and cross-business entity IDs never open one.
4. Refresh historical response; switch between business A and B while inspector loads; stale async response must not attach under B. Test network errors/no snapshot.
5. Desktop 1280/1366/1440/1920 and zoom 125/150, RTL with mixed currency/date/English strings, mobile 360/390/430 and keyboard, long report >25 rows. Preserve one conversation timeline scroll owner and sticky workspace composer.
6. Verify old statement route and old action review/card semantics remain unchanged beyond formatting fix.

Separate owner preview in worktree at `C:\\SANAD-DEV` and sibling preview; **explicit owner acceptance before merge**; production publish requires independent gated Web run and authenticated owner postflight. No Android claim follows Web release. No Production migration/Edge change authorized for this slice.

## 6. Owner preview: accounting parity gate — BLOCKED

**Owner-provided screenshot and 2026-09-26 read-only production forensics; issue #399.** For account number `122017` (ERP ledger account ID `169`), the owner's Edaa report at ~11:17 Yemen time displays **SAR 2,770**; SANAD's latest completed cloud logical snapshot produces **SAR 3,020**. Delta **SAR 250**. Historical SANAD conversation shows multiple overlapping reports and raw timezone-less ERP timestamps (`2026-06-06T00:00:00.000`) as malformed source dates.

Read-only catalog and rows from current logical backup `ae123a49-c089-4664-9f09-d812e6a5442f` (completed `2026-09-26 05:33:12Z`, ~08:33 Yemen) localize the unmatched SAR 250 to invoice **1221**, ledger entry ID **2238**, customer detail ID **10829**. Edaa screenshot lists invoice **1219**, but no **1221**. Snapshot also contains invoice 1219 on a **different** ledger entry ID **2236**, customer detail ID **10819**; both have customer debit 250 and distinct source invoice headers. `tblSellInvoice` entries for both have `Deleted=false`. Matching dates and amounts **do not** license deduplication, cancellation or exclusion. Report filters, effective source changes since the cloud snapshot, Edaa's own report selection semantics, or a genuine business adjustment remain unverified hypotheses.

**Containment in this branch:** visually collapse redundant narrative when structured statements exist; display one primary report per account while preserving alternate date windows behind disclosure; remove redundant same-account customer chip; display explicit cloud-vs-live unverified warning in card and inspector; format timezone-less Edaa civil dates without assigning a timezone; leave both source entries and all amounts intact. The old statement route receives the same date display fix.

**Release block:** until Edaa's exact report filter/status for 1221 and refreshed same-time snapshot are verified, this is a financial truth mismatch. Do not merge #398, deploy it to Web/Android, or mark result as source-parity verified merely from passing CI. Obtain the Edaa statement export and the original invoice 1221 status, then add an authenticated source-parity fixture or versioned read projection if required. Bridge remains read-only to Edaa. No production DB or ERP modifications authorized here.

## 7. Second thin vertical slice — source ERP documents (2026-09-26)

Owner accepted the visual CTA changes and authorized continuing Stage 2C.4. `SanadErpDocumentInspector.tsx` adds a lazy **read-only** inspector for sale/purchase source documents from existing `getBusinessErpDocumentDetail` → `get_business_erp_document_detail_v1` (no new financial backend). Both the document-list rows and standalone typed `erp_document` references open only after `resolveSanadErpDocumentTarget` verifies server-resolved thread + project business + positive safe integer ID + sale/purchase kind + matching source business ID. A model-provided `href` cannot launch an ERP document in this interaction. The RPC remains the real authorization gate and rechecks current membership on every call. No action/draft is created.

The inspector checks that the returned document ID/kind match its requested identity, displays source snapshot ID, raw decimal string fields using `formatSanadSourceAmount`, ERP civil-date parser, source line table and explicit *not yet reconciled with live Edaa* language. It does **not** sum lines or guess discounts, taxes or final invoice net; no false zero, no writes. Original standalone ERP documents view and action APIs remain intact. Negative and static source-fidelity checks added to `check-stage2c-context-entity.ts`.

**Gate:** this addition does NOT resolve #399 (SAR 250 statement discrepancy), exact precision in older number-bearing RPC results #384, session-based denied-role tests, or owner UI preview. PR #398 stays DRAFT and UNMERGED pending all gates.

## 8. Visual refinement and updated #399 causal evidence

Owner preview **accepted the mint/aqua customer-statement CTAs and the actual document-detail read-path**, but documented three visual defects in the document flow: (1) full model-generated invoice table duplicates the structured list, (2) ISO ERP civil timestamps were rendered incorrectly in list rows, (3) selecting a document appended a second large card below the list, with small table type and excessive warning emphasis. The following changes address the UI defects **without new data queries or finance calculations**:

- For `document_list` (like the existing customer-statement response), preserve the model narrative under optional disclosure and default to the structured output.
- Format date fields via `formatSanadErpLedgerDate` (timezone-less ERP calendar date), and show a compact list with number, party, human-readable date, currency, source line value and truthful shown/total count.
- Opening a document swaps **only the originating list** with an in-conversation detail work surface; provide an explicit return. Preserve canonical business/thread permissions; no second page scroll, no duplicated inspector per list.
- Detail header surfaces party, document number, date, currency, payment method and snapshot ID in a clear hierarchy; improve line-table legibility and keep horizontal scrolling confined to the table itself; collapse long source-risk language under a visible provenance summary. No posted-invoice net or numeric guesses.

**#399 new evidence, 2026-09-26:** owner recalls personally deleting a SAR 250 invoice for the same customer at approximately 10:00 Yemen time. Read-only production query still reports the latest completed backup `ae123a49-c089-4664-9f09-d812e6a5442f` completed **08:33 Yemen**, with invoice **1221** in that older copy marked `Deleted=false`. This time ordering makes a stale completed cloud snapshot after deletion a strong **hypothesis** for cloud SAR 3,020 vs the owner's later live Edaa report SAR 2,770. The exact deleted invoice number, refreshed snapshot semantics and same-filter/account/currency parity remain unverified. Never alter historic snapshot, subtract 250 heuristically or close #399 before a later completed snapshot + matching Edaa report check. The Bridge continues READ-ONLY toward Edaa.

## 9. Open constraints to take into next 2C.4 PR(s)

- Extend Entity Inspector to ERP documents, native operations and own-authorized Work Item after each real source/RPC permission mapping; do not make generic frontend reads.
- Seven unified typed visual families can adapt existing cards incrementally; a full shared Action Registry and canonical two-way draft lifecycle are 2D.
- Upstream 64-bit/ERP raw textual precision #384 and old public report sharing/WhatsApp token boundaries are independent security and data-quality gates.
- Current local inspector is an inline conversation work region. An independent desktop side panel/mobile sheet should be considered **only after owner runtime layout acceptance**, to avoid adding another scroll owner and overlay regressions.

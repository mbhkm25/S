# SANAD Four-Section Delivery Roadmap

> **Historical / superseded delivery model as of 2026-09-22.** The active roadmap is `docs/roadmaps/sanad-conversation-operating-layer-roadmap-v2.md`. Checked items remain useful implementation history; do not use the four-section structure as the target product IA.

Scope: سند المالي، سند التجاري، حسابي، وSANAD AI. This roadmap intentionally excludes the Windows ERP Bridge validation that requires the shop machine.

## Delivery principles

- Reuse the existing personal-finance ledger and SANAD business/party models; do not create competing accounting engines.
- Keep multi-currency explicit. Never silently convert YER/SAR/USD without a recorded exchange rate.
- Prefer immutable/posted financial records with explicit reversal or settlement semantics over destructive edits.
- Personal data is user-scoped; business data is business-scoped with owner/member authorization.
- AI starts read-only. Any future mutation path must use Draft -> Review -> Approve and an auditable command contract.
- Production rollout happens only after develop migration validation, RLS review, CI, and UI/API integration tests.

## P0 — Shared financial core

- [x] Personal counterparties (`personal_finance_parties`).
- [x] Link personal transactions to counterparties and due dates.
- [x] Shared personal/business exchange-rate history (`financial_exchange_rates`).
- [x] Shared financial attachment references (`financial_attachments`).
- [x] RLS policies for new shared financial data.
- [x] Covering indexes for new foreign keys.
- [x] Personal obligation settlement command linked to canonical posted transactions.
- [ ] Atomic personal party create/update RPCs.
- [ ] Currency conversion command that requires an explicit recorded source rate and provenance.
- [ ] Unified activity-event projection for personal financial events.

## P0 — سند المالي

- [x] Existing double-entry personal-finance accounts, transactions, postings and reversals retained as canonical ledger.
- [x] Budgets.
- [x] Savings/financial goals.
- [x] Payables/receivables obligations and party linkage.
- [x] Recurring-finance rule model.
- [x] Personal finance dashboard RPC (`get_my_finance_dashboard_v1`).
- [x] Account-balance RPC based on canonical postings (`get_my_finance_balances_v1`).
- [x] Budget consumption projection including category descendants (`get_my_budget_progress_v1`).
- [x] Obligation settlement relation and guarded settlement command.
- [ ] Reversal command for obligation settlements.
- [ ] Recurring rule scheduler/materializer.
- [ ] Monthly cash-flow report and category trend report.
- [ ] UI: financial home, accounts, transactions, budgets, obligations, goals, exchange rates.

## P0 — سند التجاري

- [x] Reuse existing `business_parties` and business catalog.
- [x] Extend catalog with SKU and unit name.
- [x] Commercial documents: quotation, sales invoice, purchase invoice, receipt, payment, expense.
- [x] Commercial document lines.
- [x] Business party ledger entries.
- [x] Party statement read RPC (`get_business_party_statement_v1`).
- [x] Atomic document draft command with server-side line calculations.
- [x] Atomic post command that recalculates totals server-side and creates party-ledger impact once.
- [x] Posted-document and posted-line immutability guards.
- [x] Partial payment/settlement relation between receipt/payment documents and invoices.
- [x] Commercial dashboard: sales, purchases, receipts, payments, expenses, receivables, payables, overdue count.
- [ ] Settlement reversal semantics.
- [ ] Cancellation/reversal semantics for posted documents and ledger effects.
- [ ] Document numbering policies per business/type.
- [ ] PDF invoice/receipt renderer and WhatsApp share contract.
- [ ] UI: parties, documents, products/services, statements, overdue, dashboard.

## P0 — حسابي

- [x] Unified account-center read contract (`get_my_account_center_v1`).
- [x] Profile summary.
- [x] Subscription summary.
- [x] Unread/active notification summary.
- [x] Active push-device summary.
- [x] Owned business summary.
- [x] Personal finance status summary.
- [x] Financial preference model and upsert RPC.
- [x] Account-center financial preferences projection.
- [ ] Device/session management UI and revocation flows.
- [ ] Broader privacy/preferences center.
- [ ] Unified attachment/file-center UI.
- [ ] Account activity/security timeline.

## P0 — SANAD AI

- [x] Read-only financial context foundation.
- [x] Personal scope: dashboard, recent transactions, obligations, goals.
- [x] Business scope: document totals, overdue documents, current activity.
- [x] Audited context RPC (`get_ai_financial_context_v2`) with per-request access log.
- [x] Direct authenticated access to unaudited v1 context revoked.
- [ ] Intent layer for finance/business/account queries.
- [ ] Grounded answer formatter that always reports currency and period.
- [ ] Semantic lookup for transaction/document/party names.
- [ ] Daily/weekly financial brief generation.
- [ ] Guardrails preventing write tools until explicit Draft -> Approve flow exists.
- [ ] Audit future AI action proposals and approvals.

## P1 — Financial intelligence

- [ ] Budget alerts and overspend thresholds.
- [ ] Recurring expense/subscription detection.
- [ ] Cash-balance forecast by currency.
- [ ] Savings-goal pace and required monthly contribution.
- [ ] Due-soon and overdue reminders.
- [ ] Personal category auto-suggestion with user correction memory.
- [ ] Business collection prioritization and aged receivables.
- [ ] Business purchase/vendor aged payables.
- [ ] Commercial document PDF/WhatsApp workflows.

## P2 — Advanced operations

- [ ] Lightweight inventory for businesses without ERP.
- [ ] Multi-branch commercial dimensions.
- [ ] Shared/family finance with explicit permissions.
- [ ] AI draft creation of transactions/documents, never direct posting.
- [ ] AI anomaly detection and duplicate/incorrect-entry warnings.
- [ ] Autonomous reminder agents with user-configured limits.

## Current implementation boundary

This roadmap is now partly historical and partly active. Do not treat the old `feat/unified-financial-core-v1` branch as the current implementation source.

As of 2026-09-19:
- the four-domain navigation model is active in the repository;
- ERP Cloud/UI read surfaces and customer statement/sales/purchases contracts have been released;
- the verified Bridge field implementation and periodic logical snapshot support were consolidated into `main`;
- current implementation work must start from live `main` and actual Production Supabase state.

Remaining unchecked roadmap items are product backlog, not evidence that checked items are necessarily deployed in every surface. Verify current production state before execution.

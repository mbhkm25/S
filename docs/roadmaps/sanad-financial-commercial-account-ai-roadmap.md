# SANAD Four-Section Delivery Roadmap

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
- [ ] Atomic command RPCs for personal party creation/update and transaction settlement.
- [ ] Currency conversion helper that requires explicit source rate and records provenance.
- [ ] Unified activity event projection for personal financial events.

## P0 — سند المالي

- [x] Existing double-entry personal-finance accounts, transactions, postings and reversals retained as canonical ledger.
- [x] Budgets.
- [x] Savings/financial goals.
- [x] Payables/receivables obligations and party linkage.
- [x] Recurring-finance rule model.
- [x] Personal finance dashboard RPC (`get_my_finance_dashboard_v1`).
- [ ] Account-balance RPC based on canonical postings.
- [ ] Budget consumption projection by category/currency.
- [ ] Obligation settlement command with audit/reversal safety.
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
- [ ] Atomic document draft command.
- [ ] Atomic post command that calculates totals server-side and creates ledger impact once.
- [ ] Partial payment/settlement relation between receipt/payment documents and invoices.
- [ ] Cancellation/reversal semantics for posted documents.
- [ ] Document numbering policies per business/type.
- [ ] PDF invoice/receipt renderer and WhatsApp share contract.
- [ ] Business dashboard: sales, collections, payables/receivables, overdue amounts.
- [ ] UI: parties, documents, products/services, statements, overdue, dashboard.

## P0 — حسابي

- [x] Unified account-center read contract (`get_my_account_center_v1`).
- [x] Profile summary.
- [x] Subscription summary.
- [x] Unread/active notification summary.
- [x] Active push-device summary.
- [x] Owned business summary.
- [x] Personal finance status summary.
- [ ] Device/session management UI and revocation flows.
- [ ] Privacy/preferences center.
- [ ] Financial default currency and locale preferences.
- [ ] Unified attachment/file center.
- [ ] Account activity/security timeline.

## P0 — SANAD AI

- [x] Read-only financial context RPC (`get_ai_financial_context_v1`).
- [x] Personal scope: dashboard, recent transactions, obligations, goals.
- [x] Business scope: document totals, overdue documents, current activity.
- [ ] Intent layer for finance/business/account queries.
- [ ] Grounded answer formatter that always reports currency and period.
- [ ] Semantic lookup for transaction/document/party names.
- [ ] Daily/weekly financial brief generation.
- [ ] Guardrails preventing write tools until explicit Draft -> Approve flow exists.
- [ ] Audit every AI data retrieval and future action proposal.

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

All changes in this roadmap are being developed on `feat/unified-financial-core-v1` and tested against the Supabase `develop` branch. They are not production changes yet. The branch starts from the current Bridge integration branch so database migration history stays aligned; it should be reviewed/merged only after its parent Bridge branch is resolved.

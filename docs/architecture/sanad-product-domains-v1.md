# SANAD Product Domain Architecture v1

> **Superseded navigation model.** The active product architecture is `docs/architecture/sanad-conversation-operating-layer-v2.md`. Keep this file as a reference for canonical Financial/Commercial/Account/AI ownership boundaries; do not use its four-peer-section navigation as the target UI model.

Status: Superseded for user-facing navigation and product composition as of 2026-09-22. Internal domain ownership rules remain active where they protect canonical financial/business truth.

## Product domains

SANAD is organized around four user-facing domains plus shared platform capabilities:

1. **SANAD Financial** — personal accounts, income, expenses, transfers, budgets, goals, obligations, counterparties, attachments and personal financial read models.
2. **SANAD Commercial** — business parties, commercial documents, invoice/receipt/payment workflows, settlements, statements, receivables/payables and business dashboards.
3. **My Account** — identity, subscription, notifications, devices, financial preferences, owned businesses and account-level controls.
4. **SANAD AI** — audited read-only financial/business context, analysis and explanation. Write actions remain out of scope until an explicit Draft → Approve execution contract exists.

Shared capabilities include authentication, business identity, notifications, storage, audit/event history, currencies/exchange rates, ERP integration and the Windows Bridge.

## Core architectural rule

User-facing domains may share platform primitives, but must not duplicate financial truth. Personal and business transactions must have canonical records and deterministic read models. AI must consume those read models rather than become a second financial ledger.

## Boundaries

### SANAD Financial
Owns:
- `personal_finance_accounts`
- `personal_finance_transactions`
- `personal_finance_postings`
- `personal_finance_categories`
- `personal_finance_parties`
- `personal_finance_budgets`
- `personal_finance_goals`
- `personal_finance_obligations`
- personal recurring rules and obligation settlements

Rules:
- balanced postings are the source of account balances;
- user actions go through validated RPC command contracts where financial invariants matter;
- posted transactions are not edited in place; corrections use reversal/replacement workflows.

### SANAD Commercial
Owns:
- business parties and party ledger
- commercial documents and lines
- commercial settlements
- commercial dashboards/statements

Rules:
- documents start as Draft and are posted explicitly;
- posting is idempotent;
- posted financial fields and lines are immutable;
- settlement cannot exceed invoice outstanding or payment availability.

### My Account
Owns user-level composition, not financial truth. It aggregates profile, plan, devices, notifications, businesses and financial preferences from canonical sources.

### SANAD AI
Owns no ledger data. It receives a scoped context contract and records access through `ai_financial_context_access_log`.

Current policy:
- read-only;
- every financial context request is auditable;
- business access follows the same authorization boundary as business UI/RPCs;
- future writes must be Draft → Review/Approve → Execute, never silent direct mutation.

## Shared authorization principle

Authenticated clients must not receive broad `USAGE` on the `private` schema. Public-domain RPCs and RLS policies use narrow public authorization gateways. Security-definer functions must use explicit `search_path` and the minimum privileges needed.

## Integration with ERP / Bridge

ERP synchronization is a shared platform capability, not part of SANAD Commercial's canonical command layer. ERP events are accepted into raw/revision-aware integration storage and normalized into business read models. Manual commercial documents and ERP-sourced observations must retain provenance so reconciliation can distinguish them.

## Delivery rule

New work should be documented and delivered by domain. A change that spans domains must identify:
- owner domain;
- dependent domains;
- canonical data source;
- RPC/API contract;
- authorization model;
- idempotency/reversal behavior;
- test evidence;
- production rollout state.


## Navigation and information architecture v2

The four domains are also the primary navigation model. There is no separate user-facing “مساحات سند” layer and no duplicate domain switcher inside each workspace.

The persistent bottom navigation uses these user-facing labels:

- **مساعد سند** → SANAD AI.
- **سند المالي** → SANAD Financial.
- **سند للأعمال** → SANAD Commercial.
- **حسابي** → My Account.

Placement follows ownership rather than historical screen location:

- SANAD Financial contains capture/QR financial intake, personal operation history, accounts, categories, parties, budgets, goals, obligations and personal financial controls.
- SANAD for Business contains owned-business management, commercial documents and settlements, customers, team/roles, catalog, working hours, reports, complaints, ERP/accounting-system integration and business activity.
- My Account contains personal identity, security/sign-in, notifications, subscription, devices and account-level support/settings. It must not become a second entry point for business operations or personal ledger management.
- SANAD Assistant is the AI entry point and consumes authorized read models from Financial and Business without owning canonical financial truth.

Legacy routes remain supported while capabilities are moved to their owning domain. The navigation shell should expose one clear route to each capability, avoiding duplicated cards across Account, Financial and Business.

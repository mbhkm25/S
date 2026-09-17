# SANAD Product Domain Architecture v1

Status: Active design baseline for the 2026 SANAD product model.

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

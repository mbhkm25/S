# SANAD v2 — Slice 01: Financial Vertical

Status: implementation candidate on `feat/sanad-shell-v2-wireup`

## Goal

Deliver the first real vertical slice of the four-domain SANAD architecture by making **المالي** a durable product domain backed by a dedicated personal-finance ledger, while preserving the existing `operations` model as payment evidence / verification truth.

## Domain boundary

```text
SANAD operation evidence
        │ optional link
        ▼
personal finance transaction
        │
        ▼
double-entry postings
```

An `operations` row is never silently converted into an accounting transaction. Linking is explicit and additive.

## Database contracts

Applied to Supabase development branch only:

- `20260916184709_personal_finance_core_v1`
- `20260916184901_personal_finance_core_v1_performance`
- `20260916185208_personal_finance_contracts_v1`
- `20260916190528_personal_finance_integrity_hardening_v1`

Production is intentionally unchanged.

### Tables

- `personal_finance_accounts`
- `personal_finance_categories`
- `personal_finance_transactions`
- `personal_finance_postings`
- `personal_finance_operation_links`

### Integrity rules

- all records are user-owned and protected by RLS
- posting ownership is constrained with composite foreign keys
- posted transactions are fully immutable and cannot be deleted
- each posted transaction must have at least two postings
- debits and credits must balance per currency
- a posting currency must match its account currency
- system account roles are constrained to the correct account type, cannot link to an external user financial account, and must remain active
- transfers across currencies are rejected until an explicit FX workflow exists
- opening balances are recorded through a system-managed equity counter-account rather than writing a mutable balance field
- links to SANAD operations do not mutate the evidence row

### Application RPCs

Read contracts:

- `get_my_financial_home_v1()`
- `get_my_financial_accounts_v1()`
- `get_my_financial_categories_v1()`
- `get_my_financial_activity_v1(p_limit)`

Write contracts:

- `create_personal_finance_account_v1(command)`
- `create_personal_finance_category_v1(command)`
- `create_personal_finance_transaction_v1(command)`
- `link_operation_to_personal_finance_v1(command)`

All application RPCs are `SECURITY INVOKER`. Public/anon execution is revoked and authenticated execution is explicit.

## Frontend

New v2 shell/domain implementation:

- `src/app-shell/SanadV2Root.tsx`
- `src/domains/financial/personalFinanceApi.ts`
- `src/domains/financial/FinancialHome.tsx`
- `src/domains/financial/FinancialAccountsPage.tsx`
- `src/domains/financial/PersonalAccountingPage.tsx`
- `src/domains/business/businessWorkspaceApi.ts`
- `src/domains/business/BusinessHome.tsx`
- `src/domains/account/AccountHome.tsx`
- `src/domains/ai/AiHome.tsx`

The v2 root is enabled only when `VITE_SANAD_APP_SHELL_V2=true`. Otherwise SANAD keeps the existing application entry path unchanged.

The accounting composer exposes the same category contract used by the backend, so categories can be created and immediately selected without leaving the transaction workflow.

## Durable routes in this slice

- `/financial`
- `/financial/accounts`
- `/financial/accounting`
- `/financial/operations`
- `/financial/add`
- `/financial/verify`
- `/financial/reports`
- `/business`
- `/ai`
- `/account`

Legacy/public/utility routes continue through the existing application router. When a legacy screen is hosted under the v2 shell, the old `#bottom_nav` is hidden and the four-domain navigation remains authoritative. Profile and notifications are intentionally hosted inside the v2 account domain rather than escaping to the old bottom navigation.

## Business domain boundary

The business landing uses the existing `get_my_business_workspaces()` contract. Selecting a workspace records its active `business_id` through the existing management-context helper before entering the established business management surface. No business ownership or team semantics are duplicated in the v2 layer.

## AI boundary

The AI tab establishes the app-native domain and its safety model, but this slice deliberately does **not** treat the existing WhatsApp assistant webhook as an app-chat API. App-native conversation transport/tool contracts will be implemented separately after authorization, memory, and write-tool approval semantics are defined.

## Performance verification

Immediately after the core migration, Supabase advisor reported six new unindexed-FK findings for the personal-finance model. `personal_finance_core_v1_performance` adds the required covering indexes. A second advisor pass confirmed those six findings are gone; the remaining findings belong to pre-existing tables outside this slice.

## Product-semantic review fixes

Before merge, the slice was reviewed beyond compile/build success:

- notifications were moved back under the Account-domain shell so the four-domain navigation does not disappear unexpectedly
- the financial home no longer implies that clicking an unlinked-operation notice performs accounting linkage; it opens the evidence list and explains that ledger entry is a separate decision
- category creation is available inside the ledger composer, avoiding an API-only dead end
- posted ledger rows were hardened from partial field immutability to full immutability

## Release rule

This slice may merge to `develop` only after all applicable configured checks for the exact head commit pass, including application/PWA, Android artifacts, Windows Bridge, Supabase migration/function validation, migration-history integrity, and baseline-layout validation. It must not be promoted to production as part of this implementation PR.

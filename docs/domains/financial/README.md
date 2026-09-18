# SANAD Financial Domain

Status: active development on `feat/unified-financial-core-v1`; Supabase contracts validated on `develop` only.

## Product boundary

SANAD Financial owns the user's personal financial model: accounts, income, expenses, transfers, categories, counterparties, budgets, goals, obligations and financial read models. It must not depend on a business workspace to function.

## Frontend entrypoints

- `/financial` — personal financial overview.
- `/financial/actions` — master data plus income/expense, budget, obligation and goal actions.
- `src/features/financial/api/financialApi.ts` — current client gateway. New UI code should call this module instead of embedding RPC names.
- `src/features/financial/api/financialTypes.ts` — current client contracts.

## Primary database objects

- `personal_finance_accounts`
- `personal_finance_categories`
- `personal_finance_parties`
- `personal_finance_transactions`
- `personal_finance_postings`
- `personal_finance_budgets`
- `personal_finance_goals`
- `personal_finance_obligations`
- `personal_finance_obligation_settlements`
- `personal_finance_recurring_rules`

## Command contracts

- `create_personal_finance_account_v1`
- `create_personal_finance_category_v1`
- `create_personal_finance_party_v1`
- `create_personal_finance_transaction_v1`
- `create_personal_finance_budget_v1`
- `create_personal_finance_obligation_v1`
- `create_personal_finance_goal_v1`
- `settle_personal_finance_obligation_v1`
- `reverse_personal_finance_transaction_v1`

## Invariants

- accounting postings are produced by database contracts, not React;
- users only see and mutate their own personal-finance rows through RLS/validated RPCs;
- posted transactions are not edited in place; reversal is a separate workflow;
- currency mismatch is rejected rather than silently converted;
- cross-currency transfer requires an explicit exchange workflow.

## Release rule

Changes are not production-ready merely because the UI builds. The migration history gate, route/API contract gate, authenticated rollback fixtures and Production quality gate must all pass before promotion.

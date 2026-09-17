# SANAD v2 — Financial Foundation Closure

Status: **closed on `develop`** on 2026-09-17.

Develop closure commit: `c61f95def502b5ab5a89e57352df250ff7053e03`

Production status: **not promoted**. `main` and Supabase production remain unchanged by this closure.

## Scope closed

This closure covers the first SANAD v2 financial foundation slices:

1. **Financial foundation / personal accounting core**
   - personal finance accounts
   - categories
   - double-entry transaction/posting model
   - opening balances
   - income, expense, transfer
   - financial home and activity contracts
   - financial UI surfaces inside SANAD v2 shell

2. **Reviewed SANAD operation → personal ledger intake**
   - SANAD operation remains immutable evidence
   - explicit user review before accounting interpretation
   - income / expense / same-currency transfer outcomes
   - atomic accounting transaction + provenance link
   - duplicate source intake prevention
   - amount/currency validation and override reason

3. **Audited correction by reversal**
   - posted accounting entries remain immutable
   - corrections create exact inverse adjustment entries
   - one canonical reversal per original
   - reversal-of-reversal rejected
   - mandatory correction reason
   - immutable audit relationship
   - archived-account historical reversal support
   - transaction details and original↔reversal UI navigation

## Trust boundaries preserved

- `operations` is evidence/documentation, not the personal accounting ledger.
- A ledger posting never mutates the source SANAD operation.
- AI suggestions do not post accounting entries automatically.
- Posted ledger history is never edited in place.
- Corrections are additive and auditable.
- Cross-currency transfers are not inferred implicitly.
- User authorization remains row-scoped through RLS and authenticated SECURITY INVOKER contracts for the new personal-finance surface.

## Verification completed

### GitHub

- Slice 02 merged through PR #270.
- Slice 03 merged through PR #271.
- Exact feature-head CI passed before both merges.
- Push CI after Slice 03 merge passed on `c61f95def502b5ab5a89e57352df250ff7053e03`.
- Application/PWA, Windows Bridge, Supabase migration/Edge Function checks all passed.

### Supabase Development

The development branch is `ACTIVE_HEALTHY` / `FUNCTIONS_DEPLOYED`.

The personal-finance migration sequence is present through:

- `20260916184709_personal_finance_core_v1`
- `20260916184901_personal_finance_core_v1_performance`
- `20260916185208_personal_finance_contracts_v1`
- `20260916190528_personal_finance_integrity_hardening_v1`
- `20260916191851_personal_finance_privilege_hardening_v1`
- `20260916192001_personal_finance_operation_intake_v2`
- `20260916192556_personal_finance_operation_intake_hardening_v2`
- `20260917070114_personal_finance_reversal_audit_v1`
- `20260917071124_personal_finance_reversal_relation_hardening_v2`
- `20260917071352_personal_finance_reversal_internal_privileges_v3`

Transactional verification covered:

- two-user isolation
- anon execution denial
- income/expense/transfer posting
- source operation intake
- currency mismatch rejection
- duplicate intake rejection
- amount override reason enforcement
- reversal balance restoration
- duplicate reversal rejection
- reversal-of-reversal rejection
- posted-entry immutability
- archived-account reversal
- direct-table reversal bypass hardening
- rollback residue = zero

### Advisors

Final development advisor state at closure:

- unindexed foreign keys: **43** — unchanged project baseline; no personal-finance reversal regression
- auth RLS initplan: **1** — pre-existing and outside personal finance
- platform-wide SECURITY DEFINER warnings remain pre-existing debt outside this closure
- low-traffic development unused-index notices are not used as a basis for removing integrity indexes

## What is intentionally not closed here

This document does **not** mark the following as production-ready or complete:

- promotion of SANAD v2 to `main`
- Supabase production migration
- production rollout of personal finance
- advanced budgets, liabilities/debts, recurring expenses, goals, or forecasting
- app-native AI financial actions
- SANAD Business full workspace redesign
- ERP baseline synchronization on a real merchant PC

## Next phase

The next execution phase is **real-device Edaa Soft / إبداع سوفت discovery and bridge validation** on the Windows computer that hosts the merchant's live accounting system.

The next phase begins read-only and must not write to Edaa:

1. identify the installed Edaa application/version;
2. verify registry/config discovery;
3. identify SQL Server instance and active database identity;
4. validate adapter/schema compatibility;
5. prove SELECT-only access;
6. only then run controlled baseline extraction for currencies, units, products, customers, and transactions.

The business identity remains:

`SANAD user → SANAD business → business location → accounting connection → ERP source instance → bridge device`.

The desktop Bridge is authorized by the signed-in SANAD user during setup, then uses an independent device credential for background synchronization.

## Release boundary

This closure is a **development milestone**, not a production release.

No production database migration, production Edge Function deployment, or production UI activation is authorized by this document.

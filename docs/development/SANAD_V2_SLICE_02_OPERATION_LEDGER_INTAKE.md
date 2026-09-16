# SANAD v2 — Slice 02: Reviewed Operation → Personal Ledger Intake

Status: implementation candidate on `feat/personal-finance-operation-linking-v2`

## Goal

Connect SANAD payment evidence to the personal-finance ledger without collapsing the two domains into one record or silently turning an analyzed payment notice into accounting truth.

The user must review the evidence, choose the accounting meaning, select the affected account or accounts, and explicitly confirm the entry.

## Trust boundary

```text
SANAD operation (evidence)
        │
        │ explicit user review
        ▼
accounting interpretation
income / expense / transfer
        │
        │ atomic command
        ▼
personal-finance transaction + balanced postings
        │
        └── source link ──► SANAD operation
```

The source `operations` row is never mutated by this intake flow.

A link records provenance. It does not make SANAD claim that a bank independently confirmed the transaction.

## Development-only database changes

Applied to Supabase `develop` only; production is unchanged:

- `20260916191851_personal_finance_privilege_hardening_v1`
- `20260916192001_personal_finance_operation_intake_v2`
- `20260916192556_personal_finance_operation_intake_hardening_v2`

### Least-privilege table grants

For the five personal-finance tables:

- `anon`: no table privileges
- `authenticated`: `SELECT`, `INSERT`, `UPDATE`, `DELETE`
- `authenticated`: no `TRUNCATE`, `REFERENCES`, or `TRIGGER`
- `service_role`: no direct table grants are introduced by this slice

RLS remains the row-level authorization boundary.

### Canonical source-link uniqueness

`personal_finance_operation_links_one_source_per_operation_uidx` enforces at most one canonical `source` link for the same `(operation_id, user_id)`.

This makes repeated intake idempotent at the data-model boundary instead of relying only on UI state.

## Application contracts

### `get_my_linkable_financial_operations_v1(p_limit, p_include_linked)`

`SECURITY INVOKER`.

Returns only operations submitted by the authenticated user and exposes the evidence needed for review:

- operation id and public token
- evidence amount and currency
- transaction / creation date
- source, operation status, AI status
- financial entity and code
- sender and receiver
- transaction direction and confidence
- source-link state
- a non-binding accounting suggestion derived from direction

Suggestions:

- `incoming` → `income`
- `outgoing` → `expense`
- `internal` → `transfer`
- unknown / unresolved → no suggestion

The suggestion is never auto-posted.

### `create_personal_finance_from_operation_v1(command)`

`SECURITY INVOKER`.

Performs the accounting write and the canonical source link in one database transaction.

Supported explicit outcomes:

- income
- expense
- transfer between two same-currency personal accounts

Rules:

- operation must belong to the authenticated submitter
- operation must not already have a canonical source link for that user
- selected account(s) must belong to the authenticated user and be active non-system accounts
- known evidence currency must match the selected accounting currency
- transfers require distinct source/destination accounts of the same currency
- implicit cross-currency transfer is rejected
- amount must be positive and within the finance amount limit
- if accounting amount differs from evidence amount, `override_reason` is mandatory
- evidence snapshot and override metadata are written to the finance transaction/link metadata
- the original operation row is not updated

### Financial home contract

`get_my_financial_home_v1()` is now contract version 2.

`unlinked_operations_count` means operations owned by the user that do not yet have a canonical `source` link to the personal ledger.

## Frontend

### New route

`/financial/import`

### New surface

`src/domains/financial/FinancialOperationIntakePage.tsx`

The page:

- loads linkable operations, finance accounts, and categories in parallel
- states the evidence / ledger distinction before any action
- displays evidence amount, currency, direction, entity, sender, receiver and date
- allows opening the original SANAD operation
- opens an explicit review sheet before accounting creation
- lets the user choose income, expense, or transfer
- treats the backend suggestion as a suggestion only
- filters accounts by known evidence currency
- supports same-currency account-to-account transfer
- pre-fills the evidence amount when available
- requires a written reason when the accounting amount is intentionally changed
- supports category/date/description input
- removes a successfully posted operation from the pending intake list
- confirms that the original SANAD evidence remains unchanged

### Financial home

When unlinked evidence exists, the financial home now routes to `/financial/import` and describes all supported reviewed outcomes: income, expense, or transfer.

## Authorization verification

Transactional two-user isolation test completed on Supabase `develop` with full rollback:

- user B could not read user A's finance account
- user B's account RPC did not expose user A's account
- user B could not update user A's account
- user B could not insert a finance account owned by user A
- `anon` cannot execute the personal-finance read/write RPC surface
- rollback residue check returned zero temporary users/accounts

New/changed intake functions were also verified directly:

- `SECURITY INVOKER` (`prosecdef = false`)
- `anon EXECUTE = false`
- `authenticated EXECUTE = true`

## Integration smoke tests

All smoke tests ran inside SQL transactions and ended in `ROLLBACK`.

### Expense intake

Verified:

- an outgoing operation appears in the linkable queue
- the suggestion is `expense`
- home unlinked count increments before intake
- explicit intake creates a balanced personal-finance transaction and source link atomically
- the operation disappears from the default intake queue after posting
- home unlinked count clears
- duplicate intake is rejected
- no test data remains after rollback

### Transfer + override hardening

Verified:

- an internal operation suggests `transfer`
- transfer intake posts against two distinct same-currency accounts
- resulting balances reflect the debit/credit transfer correctly
- an accounting amount different from evidence is rejected without `override_reason`
- the same override succeeds when a reason is supplied
- response marks `amount_overridden = true`
- no completed operation remains in the linkable queue
- no test users, profiles, operations, or finance accounts remain after rollback

## Performance verification

After all Slice 02 DDL:

- unindexed foreign-key advisor findings remain at the existing baseline of **43**
- no personal-finance table appears in the unindexed-FK findings
- the pre-existing `auth_rls_initplan` finding remains **1** and is unrelated to this slice
- unused-index notices are expected on the low-traffic development branch and are not a basis for removing finance integrity/index coverage

## Security advisor context

The current development project still reports pre-existing platform-wide advisory findings outside this slice, including public/authenticated `SECURITY DEFINER` surfaces. Slice 02 does not add to that class: its application contracts are `SECURITY INVOKER` and have explicit grants.

No bulk revocation or unrelated security migration is part of this feature branch.

## Release rule

This slice can merge to `develop` only when the exact final head commit passes all applicable GitHub Actions gates.

It must not be promoted to `main`, production Supabase, or production deployment as part of this PR.

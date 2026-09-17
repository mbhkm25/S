# SANAD v2 — Slice 03: Audited Personal-Finance Reversal

Status: implementation candidate on `feat/personal-finance-reversal-audit-v3`.

## Goal

Correct posted personal-finance mistakes without editing or deleting accounting history.

SANAD keeps a posted transaction immutable. A correction creates a second posted transaction that exactly reverses the original postings and records an explicit audit relationship between the two records.

```text
posted transaction
      │
      │ explicit user correction + reason
      ▼
reversal transaction (adjustment)
      │
      ├── exact inverse postings
      └── immutable audit relationship ──► original transaction
```

This slice does not reinterpret or mutate the original SANAD operation evidence linked to the accounting entry.

## Development-only database migration

Applied to Supabase `develop` only:

- `20260917070114_personal_finance_reversal_audit_v1`

Production Supabase and `main` are unchanged.

## Data model

### `personal_finance_transaction_reversals`

Stores one canonical reversal for one original transaction per user:

- `original_transaction_id`
- `reversal_transaction_id`
- `user_id`
- mandatory correction `reason`
- `created_at`

Integrity rules:

- original and reversal must be different transactions
- one original can have at most one reversal
- one reversal transaction can belong to at most one original
- both foreign keys include `user_id`
- authenticated users may only `SELECT` and `INSERT` their own rows
- no authenticated `UPDATE` or `DELETE`
- `anon` has no table privileges

## Reversal contract

### `reverse_personal_finance_transaction_v1(command)`

`SECURITY INVOKER` and authenticated-only.

The command requires:

- `transaction_id`
- a correction reason between 5 and 500 characters

The database contract:

1. locks the original posted transaction for the authenticated user;
2. rejects missing/non-posted transactions;
3. rejects duplicate reversal;
4. rejects reversing a reversal transaction;
5. creates a new `adjustment` transaction;
6. copies every original posting and flips `debit` ↔ `credit`;
7. preserves amount, currency, exchange rate and account identity;
8. posts the reversal using the normal finance posting invariants;
9. records the immutable original/reversal relationship.

The original transaction remains posted and unchanged.

### Archived accounts

A normal new finance transaction still requires an active account.

For audit correctness only, the posting guard permits an archived account when all of the following are true:

- the new transaction explicitly declares `metadata.reversal_of`;
- that referenced original belongs to the same user;
- the original actually contains a posting for the same account and currency.

This allows an old transaction to be reversed after the user archives an account without reopening that account for ordinary posting.

## Reversal integrity guard

`personal_finance_reversal_guard_v1` verifies before the relationship is accepted:

- both original and reversal are posted;
- reversal type is `adjustment`;
- amount and currency match the original;
- reversal metadata points to the original transaction;
- a reversal cannot itself be reversed;
- the complete posting multiset is the exact inverse of the original using bidirectional `EXCEPT ALL` comparison.

## Read contract and UI

### `get_my_financial_transaction_v1(transaction_id)`

Returns only a transaction owned by the authenticated user and includes:

- transaction header and category
- all debit/credit postings with account name/type/status
- linked SANAD operation evidence using the natural operation-link key
- reversal relationship when this is the original
- original relationship when this is the reversal

### Financial activity

`get_my_financial_activity_v1` is contract version 2 and now exposes:

- `is_reversed`
- `reversed_by_transaction_id`
- `is_reversal`
- `reverses_transaction_id`
- `reversal_reason`

### Financial home

`get_my_financial_home_v1` is contract version 3.

For monthly income/expense totals, an original transaction that has been reversed is excluded from the economic summary. The reversal adjustment itself is not counted as income/expense. Account balances net naturally because the reversal posts the exact inverse entries.

### Frontend route

`/financial/transaction/:transactionId`

The details surface shows:

- transaction amount/type/date/source/category
- debit and credit accounts
- archived-account indicator where relevant
- linked SANAD operation evidence with a link to the original operation
- original ↔ reversal relationship
- an explicit explanation that posted records are not edited
- a reversal action only when the transaction is posted, not already reversed and not itself a reversal
- mandatory correction reason before reversal creation

The personal-accounting activity list now opens this audited detail route.

## Transactional verification

A two-user end-to-end test ran on Supabase `develop` inside one transaction and ended with `ROLLBACK`.

Verified sequence:

1. user A created a SAR asset account;
2. user A posted a SAR 100 expense;
3. account balance became `-100.000000`;
4. the account was archived;
5. reversal succeeded against the archived historical account;
6. account balance returned to `0.000000`;
7. monthly SAR expense returned to `0`;
8. original detail exposed its reversal transaction;
9. original retained its two postings;
10. duplicate reversal was rejected;
11. reversal-of-reversal was rejected;
12. mutation of the posted original was rejected as immutable;
13. user B received no detail for user A's transaction;
14. user B could not reverse user A's transaction;
15. rollback left no test finance data.

## Privilege verification

New application RPCs:

- `get_my_financial_transaction_v1(uuid)`
- `reverse_personal_finance_transaction_v1(jsonb)`

Both were verified as:

- `SECURITY INVOKER`
- `anon EXECUTE = false`
- `authenticated EXECUTE = true`

The reversal table was verified as:

- `anon SELECT/INSERT = false`
- `authenticated SELECT/INSERT = true`
- `authenticated UPDATE/DELETE = false`

## Advisor verification

After Slice 03 DDL:

- unindexed foreign-key findings remain at the existing baseline of **43**;
- `personal_finance_transaction_reversals` does not appear in the unindexed-FK finding set;
- the existing `auth_rls_initplan` finding remains **1** and is unrelated to personal finance;
- the new reversal audit index is currently reported as unused on the low-traffic development branch, which is expected and is not a reason to remove integrity/read-path coverage.

Platform-wide SECURITY DEFINER advisories outside personal finance remain pre-existing. Slice 03 adds no SECURITY DEFINER application contract.

## Edaa Soft / إبداع سوفت operational note

The developer/user is currently working from the Windows computer that has the live إبداع سوفت installation.

The repository already contains an ERP-neutral Windows Bridge with an Edaa adapter, read-only discovery and baseline-sync work. Real-device validation is deliberately kept separate from this personal-finance slice.

After this slice is merged to `develop`, the next safe desktop step is discovery-only on the actual PC:

- identify the installed Edaa/إبداع سوفت instance and version;
- validate the bridge's configuration discovery path;
- identify SQL Server/database identity and database file reference without exposing credentials;
- prove read-only access before any baseline extraction or synchronization.

The repository's `Edaa Soft` naming must not be assumed to be identical to the user's installed product solely from naming; the adapter mapping must be confirmed by actual read-only discovery on that machine.

## Release rule

Merge this slice to `develop` only after the exact final feature-head commit passes all applicable GitHub Actions checks and the PR diff is reviewed.

Do not promote this slice to `main`, production Supabase, or production deployment as part of this work.
# SANAD Account Domain

Status: active development on `feat/unified-financial-core-v1`; current account-center data contract is validated on Supabase `develop` only.

## Product boundary

My Account is the user's cross-product account center. It composes identity/profile state, subscription state, notifications, registered devices, owned businesses and a compact personal-finance status without taking ownership of those underlying domain tables.

## Frontend entrypoint

- `/account-center`

## Primary contract

- `get_my_account_center_v1`

## Composition rules

- Account Center is an aggregation surface, not a second source of truth.
- Domain-specific writes remain in their owning domain.
- Owned businesses exposed here are the business contexts used by SANAD Commercial.
- Financial counts are summaries only; personal transaction execution stays in SANAD Financial.

## Release rule

Any new data added to Account Center should come from a stable owner-domain contract and must not create circular dependencies between Financial, Commercial, Account and AI.

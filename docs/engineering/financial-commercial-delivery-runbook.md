# Financial / Commercial Delivery Runbook

This runbook governs delivery of the SANAD Financial, Commercial, My Account and SANAD AI workstream.

## Environments

- GitHub development branch: `feat/unified-financial-core-v1`
- PR: #277 (Draft)
- Supabase validation environment: `develop`
- Production: no deployment from this workstream until explicit promotion approval.

## Required sequence for each capability

1. Define the business invariant and owner domain.
2. Add/alter database contract in a timestamped migration.
3. Apply the migration to Supabase `develop` only.
4. Verify RLS and execute grants under an `authenticated` role, not only as postgres/service role.
5. Run rollback fixtures for financial invariants and negative cases.
6. Implement UI against the RPC/read-model contract; avoid duplicating accounting rules in React.
7. Run TypeScript/Vite quality gates and migration-history checks.
8. Update documentation and PR scope/results.
9. Only after all checks pass: prepare production promotion separately.

## Command/query safety

### Personal finance
Financial commands should use existing validated RPCs such as:
- `create_personal_finance_account_v1`
- `create_personal_finance_category_v1`
- `create_personal_finance_transaction_v1`
- `reverse_personal_finance_transaction_v1`
- `settle_personal_finance_obligation_v1`

UI must not manually synthesize accounting postings.

### Commercial
Use:
- `create_business_commercial_draft_v1`
- `post_business_commercial_document_v1`
- `settle_business_commercial_document_v1`

A document is Draft until posting. Posting is an explicit action and must be idempotent.

### SANAD AI
Use only the audited gateway `get_ai_financial_context_v2`. The v1 context function is internal and must not be exposed to authenticated clients.

## Validation matrix

Before production promotion, evidence must cover at least:

- personal income, expense and transfer;
- account-currency mismatch rejection;
- budget progress including child categories;
- payable and receivable obligation settlement;
- commercial draft creation;
- posting + repost idempotency;
- posted-line immutability;
- partial settlement;
- oversettlement rejection;
- party statement and dashboard totals;
- authenticated business access denial for unrelated users;
- AI personal context audit;
- AI business context access denial and successful owner/member access;
- zero persistent fixture rows after rollback tests.

## Documentation discipline

Every material phase must update at least one of:
- `docs/roadmaps/` for delivery status;
- `docs/architecture/` for durable design decisions;
- `docs/engineering/` for operational/test procedure;
- `docs/repository/` for repository-structure decisions.

PR descriptions should state environment status explicitly: developed, validated, deployed or intentionally not deployed.

## Current checkpoint

Completed:
- domain schema and read models;
- commercial command/settlement layer;
- authorization hardening;
- audited AI context;
- initial four-workspace UI;
- authenticated rollback fixture for commercial + AI business context.

Next:
- action UI for personal transactions/budgets/obligations;
- action UI for commercial drafts/posting/settlement;
- UI-level empty/error/success states;
- frontend quality validation;
- repository structure review after functional completion.

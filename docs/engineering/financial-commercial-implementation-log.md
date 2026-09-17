# Financial / Commercial / Account / AI Implementation Log

This file is the execution ledger for the 2026 four-domain SANAD workstream. It records what changed, where it was validated and what remains intentionally unpromoted.

## 2026-09-17 — Domain baseline

Implemented:
- unified personal finance parties, exchange rates and attachment references;
- budgets, goals, obligations and recurring rules;
- personal balances/budget/dashboard read models;
- business commercial documents, lines, party ledger, posting and settlements;
- business dashboard and party statement;
- account-center composition RPC;
- audited SANAD AI financial context;
- authorization/RLS hardening that removes authenticated dependency on broad `private` schema access.

Validation:
- Supabase `develop` only;
- authenticated rollback fixture passed for commercial Draft → Post → idempotent repost → partial settlement → oversettlement rejection → posted-line immutability;
- AI business context returned through v2 with an audit id;
- fixture transaction rolled back.

Production state: not promoted.

## 2026-09-17 — Initial workspaces

Implemented routes:
- `/financial`
- `/commercial`
- `/account-center`
- `/sanad-ai`

Implementation notes:
- workspace launcher appears only for authenticated users on the home surface;
- SANAD AI remains read-only;
- commercial workspace requires an owned business context.

## 2026-09-17 — Action contracts and UI

Backend:
- added `create_personal_finance_budget_v1`;
- added `create_personal_finance_obligation_v1`;
- added `create_personal_finance_goal_v1`;
- retained canonical transaction execution through `create_personal_finance_transaction_v1`;
- retained commercial Draft/Post/Settlement contracts.

Frontend:
- added `/financial/actions` with income, expense, budget, obligation and goal workflows;
- added `/commercial/actions` with explicit Draft → Post and settlement workflows;
- action routes are entered through a workspace-level primary action button;
- React UI does not generate accounting postings directly.

Validation:
- the three new personal command RPCs were executed under simulated `authenticated` role in Supabase `develop`;
- budget, obligation and goal creation succeeded;
- the fixture transaction was rolled back and no test rows were retained;
- Supabase migration-history integrity and canonical baseline layout passed for the action-route commit;
- frontend Production quality gate was pending at the time of this log entry and remains a release blocker until completed successfully.

Production state: not promoted.

## Repository organization decision

Added:
- `docs/architecture/sanad-product-domains-v1.md`
- `docs/engineering/financial-commercial-delivery-runbook.md`
- `docs/repository/repository-reorganization-v1.md`

Decision:
- do not perform a broad repository move while functional work is active;
- new work should follow domain ownership immediately;
- a staged repository reorganization follows functional and CI completion;
- applied Supabase migration history will never be rewritten during reorganization.

## Next execution queue

1. Wait for / inspect latest frontend quality gate; fix any TypeScript/build issues before expanding scope.
2. Add negative authenticated fixtures for the new personal commands.
3. Add first-class empty/success/error UX and better commercial settlement compatibility filtering.
4. Add domain-level frontend API wrappers/types so UI components stop calling raw RPC names directly.
5. Add route/contract tests for the four workspaces.
6. Review Supabase security/performance advisors after DDL changes.
7. Update this log and PR #277 with final evidence.
8. Only after functional completion: start repository reorganization as separate structural PRs.

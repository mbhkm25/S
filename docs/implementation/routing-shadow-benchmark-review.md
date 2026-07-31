# Routing Shadow Benchmark Review Center

## Status

Implemented on Supabase production and branch:

`feature/routing-shadow-benchmark-review`

This is phase 3 of the SANAD business-payment routing roadmap. It creates the human-review and measurement layer required before any real routing can be considered.

The system remains shadow-only. A benchmark review cannot create a business-operation link, notify a business, assign a cashier, or enable routing.

## Product rule

Routing precision is the primary launch metric. Coverage is secondary.

A false abstention delays automation; a false positive sends a financial operation to the wrong business. Therefore the release gate requires very high precision and maintains a hard technical block even when numerical thresholds are met.

## Data model

### `operation_routing_benchmark_cases`

One review case is created automatically for every routing-shadow run.

The case contains:

- the shadow run and operation;
- cohort: `legacy_baseline` or `contract_v2_live`;
- queue status;
- review priority;
- a 30-minute administrative claim;
- review and exclusion timestamps.

Priority favors contract-v2 cases and risky outcomes such as errors, high/probable matches, ambiguity, and low-confidence matches.

### `operation_routing_benchmark_reviews`

Reviews are revisioned and audit-preserving. Only one current revision exists per case; previous revisions are superseded rather than deleted.

The review records separate judgments for:

- whether the document is a reviewable financial notice;
- financial-entity classification;
- document template;
- transaction direction;
- selected operation in a multi-operation screenshot;
- account and identifier roles;
- final routing verdict.

Routing verdicts are:

- `correct_match`;
- `wrong_match`;
- `correct_abstention`;
- `missed_match`;
- `ambiguous_case`;
- `unreviewable`.

Optional corrections can identify the authoritative entity, template, direction, operation position, business, and financial account. Analysis and routing snapshots are frozen into every revision so later code or data changes cannot rewrite the historical benchmark judgment.

### `routing_benchmark_policy`

The policy is not client-editable. Version `benchmark-gate-v1` requires:

- at least 100 reviewed contract-v2 cases;
- at least 20 reviews for every entity/template segment used for release;
- routing precision of at least 99.5%;
- routing recall of at least 90%;
- false-positive rate no greater than 0.5%;
- unreviewable rate no greater than 5%.

`activation_hard_block` remains true. The overview RPC always returns `activation_allowed=false` in this phase.

## Administrative contracts

All access requires an authenticated active platform administrator.

Available RPCs:

- `platform_admin_get_routing_benchmark_overview`
- `platform_admin_claim_routing_benchmark_case`
- `platform_admin_release_routing_benchmark_case`
- `platform_admin_get_routing_benchmark_case`
- `platform_admin_search_routing_benchmark_accounts`
- `platform_admin_review_routing_benchmark_case`

The underlying tables have RLS enabled and no `anon` or `authenticated` table grants. Client access is exclusively through guarded `SECURITY DEFINER` RPCs.

Every saved judgment creates a `platform_admin_audit_log` entry.

## Semantic review guard

A database trigger prevents contradictory benchmark truth labels:

- `correct_match` requires the shadow engine to have returned an account;
- `wrong_match` requires a different corrected account;
- `correct_abstention` requires no shadow account and an abstention status;
- `missed_match` requires no shadow account plus a corrected account;
- `ambiguous_case` requires actual competing candidates;
- corrected account, business, and entity must be mutually consistent.

This guard protects benchmark integrity even if a future UI or client submits an invalid combination.

## Standalone administration page

The review center is published as:

`/routing-benchmark.html`

It is a no-index, same-origin administrative page that uses the current SANAD Supabase session. The page itself is public static content, but all data and mutations remain protected by platform-admin RPC authorization.

The page provides:

- a visible hard-block release gate;
- global precision, recall, false-positive, and review metrics;
- filters by status, cohort, entity, and template;
- a priority review queue;
- direct opening of the actual operation notice in a separate tab;
- extracted-field and routing-candidate comparison;
- structured analysis and routing verdicts;
- authoritative corrections and account search;
- error-code labeling;
- breakdown metrics by entity and template.

The page has no activation control and no call capable of creating a business-operation link.

## Historical queue

The 114 existing routing-shadow runs were seeded as `legacy_baseline` cases. They can be used to inspect historic behavior, but they do not count as contract-v2 release evidence.

New prompt-v5/contract-v2 shadow runs are automatically queued as `contract_v2_live`.

## Validation

Production transaction tests were executed and fully rolled back. They verified:

1. platform-admin-only overview, claim, detail, account-search, release, and review contracts;
2. visible hard-block and `activation_allowed=false`;
3. revisioned review creation and audit logging;
4. absence of direct authenticated table access;
5. absence of business-operation links;
6. rejection of a contradictory `wrong_match` correction to the same shadow account;
7. successful valid judgment after the rejected attempt;
8. rollback of all test reviews and case changes.

Reusable test:

`supabase/tests/routing_shadow_benchmark_review.sql`

A dedicated GitHub Actions workflow runs JavaScript syntax checks, asset checks, and a shadow-only boundary assertion for the standalone page.

## Applied migrations

- `20260731110911_routing_shadow_benchmark_review_foundation.sql`
- `20260731111326_routing_benchmark_review_search_and_release.sql`
- `20260731112104_harden_routing_benchmark_review_semantics.sql`
- `20260731113046_routing_benchmark_cover_remaining_foreign_keys.sql`

The Supabase performance advisor was run after DDL. The two new uncovered foreign keys reported for corrected entity and superseding review references were indexed in the final migration.

## Next release step

After deployment, review real redacted notices in `contract_v2_live`. Do not interpret the historical 20 probable matches as routing approval.

A future phase may add formal two-reviewer adjudication and controlled canary routing, but only after the benchmark gate has been populated and independently reviewed. No canary activation is included here.

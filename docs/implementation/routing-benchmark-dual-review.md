# Routing Benchmark Dual Review and Adjudication

## Status

Implemented on Supabase production and branch:

`feature/routing-benchmark-dual-review`

This is phase 4 of the SANAD business-payment routing roadmap. It replaces single-person Benchmark truth labels with two independent judgments and independent adjudication when the judgments disagree.

The system remains measurement-only. It cannot create a business-operation link, notify a business, assign a cashier, or enable real routing.

## Why dual review

A routing false positive can expose a financial operation to the wrong business. A single human judgment is therefore not sufficient evidence for launch.

The Benchmark now applies these rules:

1. A primary reviewer records the first judgment.
2. A different reviewer records a blind secondary judgment.
3. Matching decisions are finalized automatically as `consensus`.
4. Different decisions move to `awaiting_adjudication` and are not counted in metrics.
5. A third independent adjudicator sees both votes and records the final truth as `adjudicated`.

The same person cannot occupy two roles for the same case, even if their global reviewer role permits both reviewing and adjudication.

## Review stages

`operation_routing_benchmark_cases.review_stage` is one of:

- `awaiting_primary`
- `awaiting_secondary`
- `awaiting_adjudication`
- `finalized`

A final Benchmark review is created only when the case reaches `finalized`.

Existing reviewed cases from the previous phase are preserved with `resolution_method=single`. New cases enter `awaiting_primary`.

## Reviewer registry

`routing_benchmark_reviewers` grants narrowly scoped Benchmark access without granting platform-admin access.

Roles:

- `reviewer`: primary and secondary judgments.
- `adjudicator`: disagreement resolution only.
- `both`: may perform either type in different cases, but independence is still enforced per case.

Only a platform administrator can appoint, change, or deactivate reviewers. Every change is written to `platform_admin_audit_log`.

The table has RLS enabled and no direct `anon` or `authenticated` grants.

## Independent votes

`operation_routing_benchmark_votes` stores the two independent judgments. Each vote contains:

- all analysis verdicts;
- routing verdict;
- authoritative corrections;
- error codes and notes;
- immutable analysis and routing snapshots;
- a normalized decision payload and hash;
- reviewer identity and vote order.

Database constraints allow only one primary and one secondary vote and prohibit the same reviewer from voting twice on the same case.

The existing semantic validation trigger is reused, so contradictory truth labels remain impossible at the database boundary.

## Blind secondary review

When a case is in `awaiting_secondary`:

- the primary vote is not returned by the case-detail RPC;
- the primary reviewer cannot claim or submit the secondary vote;
- the secondary reviewer judges only the notice, extracted fields, and shadow-routing output.

The primary vote becomes visible only when the case needs adjudication or after finalization.

## Consensus and adjudication

The decision hash compares all launch-relevant truth fields:

- document, entity, template, direction, selected operation, and identifier-role verdicts;
- routing verdict;
- corrected entity, template, direction, operation position, and account.

Error codes and free-text notes do not create a disagreement by themselves.

If hashes match, `private.finalize_routing_benchmark_case` creates a final review with:

- `resolution_method=consensus`;
- both source vote IDs;
- no adjudicator.

If hashes differ, the case stores `disagreement_fields` and waits for an independent adjudicator. The adjudicator's final review uses:

- `resolution_method=adjudicated`;
- both source vote IDs;
- `adjudicator_user_id`.

Unresolved disagreements are excluded from precision, recall, and false-positive metrics.

## Access contracts

Reviewer access:

- `get_my_routing_benchmark_access`
- `platform_admin_get_routing_benchmark_overview`
- `platform_admin_claim_routing_benchmark_case`
- `platform_admin_release_routing_benchmark_case`
- `platform_admin_get_routing_benchmark_case`
- `platform_admin_search_routing_benchmark_accounts`
- `platform_admin_review_routing_benchmark_case`

Platform-admin reviewer management:

- `platform_admin_search_routing_benchmark_reviewer_candidates`
- `platform_admin_set_routing_benchmark_reviewer`

Underlying tables remain inaccessible directly to authenticated clients.

## Administration interface

`/routing-benchmark.html` now provides:

- reviewer and adjudicator capacity indicators;
- platform-admin reviewer assignment without global-admin promotion;
- queue stages for primary, secondary, adjudication, and finalized cases;
- explicit blind-review messaging;
- eligibility-aware case actions;
- side-by-side vote comparison for adjudicators;
- disagreement-field labels;
- final truth with consensus/adjudication provenance.

The page loads:

- `/routing-benchmark.css`
- `/routing-benchmark-v2.css`
- `/routing-benchmark-v2.js`

The previous JavaScript file remains unused as a rollback reference in this phase.

## Release gate

The overview contract always returns:

`activation_allowed=false`

It also reports reviewer-capacity and adjudicator-capacity requirements. Numerical Benchmark thresholds do not remove the hard block.

No activation control, canary routing, business notification, cashier assignment, or operation link is included.

## Validation

A production transaction test was executed and rolled back completely. It verified:

1. primary vote transition to `awaiting_secondary`;
2. rejection of the same person as secondary reviewer;
3. blind secondary detail response;
4. automatic consensus finalization for identical decisions;
5. disagreement transition without a final review;
6. rejection of a participating reviewer as adjudicator;
7. visibility of both votes to an independent adjudicator;
8. adjudicated finalization;
9. no change to `business_operation_links`;
10. `activation_allowed=false` throughout.

Reusable test:

`supabase/tests/routing_benchmark_dual_review.sql`

## Applied migrations

- `20260731115803_routing_benchmark_dual_review_foundation.sql`
- `20260731120205_routing_benchmark_dual_review_read_contracts.sql`
- `20260731120511_routing_benchmark_dual_review_transition_fix.sql`
- `20260731120758_routing_benchmark_dual_review_cover_foreign_keys.sql`

The Supabase performance advisor reported three uncovered foreign keys introduced by this phase. The final migration adds covering indexes for the vote operation, vote shadow run, and reviewer appointer references.

## Operational prerequisite

Before reviewing real `contract_v2_live` cases, appoint enough people to preserve independence:

- at least two active reviewers;
- at least one adjudicator who did not participate in the two votes for a disputed case.

In practice, three distinct people are required to resolve a disagreement independently.

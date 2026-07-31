# Operation Analysis Contract and Routing Shadow v2

## Status

Implemented on Supabase production and documented on branch:

`feature/operation-analysis-routing-shadow-v2`

This package is phase 2 of the SANAD real-time business payment inbox roadmap.

It expands financial-document extraction into an operational contract and evaluates business-account routing in **shadow mode only**. It does not create a business-operation link, notify a business, assign a cashier, or alter the user-visible operation destination.

## Why this phase exists

The original extractor already returned sender and receiver fields, but most of those values lived only inside `operations.structured_data`. They were not independently normalized, indexed, versioned, or measurable by field.

A routing engine cannot safely treat every visible number as an account number. In particular, a transaction-list screenshot may contain:

- a document/header account;
- a sender account;
- a receiver account;
- a credited account;
- a debited account;
- a merchant or Haseb point;
- a reference number;
- several operations in the same image.

Phase 2 separates these roles before any automatic routing is considered.

## Active extraction prompt

The active database prompt remains under the existing key:

`sanad_operation_extraction_v1`

Its active version is now `5`.

The key was preserved to avoid changing the production Edge Function configuration. The version identifies the new contract.

### Kuraimi Haseb classification

The prompt contains an explicit rule:

- a purple screenshot with a balance/account card and transaction list, plus Haseb, Haseb Payment, Payment Hub, or حاسب evidence, is classified as `الكريمي حاسب`;
- purple color alone is not enough;
- a visible merchant/Haseb/POS point is extracted into `merchant_point` only when the number is explicit;
- the account displayed in the header card is `document_account`, not automatically the transaction reference or credited account.

## Analysis contract v2

New operational columns on `operations` include:

- `analysis_contract_version`;
- `analysis_prompt_version`;
- `analysis_completed_at`;
- `financial_entity_code`;
- `document_template` and its confidence;
- `transaction_direction` and its confidence;
- sender and receiver names;
- sender and receiver identifiers and identifier types;
- `document_account`;
- `credited_account`;
- `debited_account`;
- `merchant_point`;
- multiple-operation presence and selected position;
- `field_confidences`;
- `field_evidence`.

### Allowed document templates

- `single_receipt`
- `transaction_list`
- `account_history`
- `wallet_receipt`
- `transfer_receipt`
- `statement`
- `unknown`

### Transaction direction

Direction is relative to the owner of the document or `document_account`:

- `incoming`: funds arrived to the document owner;
- `outgoing`: funds left the document owner;
- `internal`: movement between accounts belonging to the document owner;
- `unknown`: the visible document does not resolve direction safely.

### Identifier types

- `account_number`
- `wallet_number`
- `financial_line`
- `merchant_point`
- `terminal_number`
- `phone_number`
- `iban`
- `other`
- `unknown`

## Database-owned projection

The production Edge Function still writes the complete Gemini result under:

`raw_ai_json.extracted`

A protected `BEFORE` trigger projects prompt-v5 output into the explicit operation columns. This preserves the stable Edge Function execution path while making the database contract authoritative.

The projection layer:

- activates for prompt version 5 or an explicit v2 payload;
- validates enumerations;
- converts Arabic and Persian digits;
- strips unsafe identifier characters;
- bounds confidence values between 0 and 1;
- allows only known confidence/evidence keys;
- limits evidence text length;
- merges the sanitized v2 contract into `structured_data` for existing operation-detail consumers.

Old prompt results remain contract version 1 and are not silently reclassified as v2.

## Routing shadow engine

The service-role-only function is:

`evaluate_operation_financial_routing_shadow(uuid)`

It compares normalized extracted identifiers against active, routing-enabled business financial identifiers belonging to the same canonical financial entity.

### Candidate source priority

The current exact-match sources are:

1. `merchant_point`;
2. `credited_account`;
3. `receiver_account`;
4. `document_account`;
5. `debited_account` when direction is outgoing;
6. `sender_account` when direction is outgoing.

Currency consistency, identifier-type consistency, field confidence, and identifier verification status affect the score. The engine does not use fuzzy name matching as a primary route.

### Shadow outcomes

- `skipped`
- `insufficient_data`
- `no_match`
- `ambiguous`
- `low_confidence_match`
- `probable_match`
- `high_confidence_match`
- `error`

Every evaluation writes an immutable row to:

`operation_routing_shadow_runs`

The run contains candidate accounts, evidence, score, strategy, and reason codes.

## Security isolation

Shadow candidate business IDs and financial-account IDs are not stored on `operations`.

This is deliberate because authenticated users have row-scoped access to operation records. Keeping shadow candidates in operation columns could reveal an internal routing hypothesis through direct API reads.

The final design therefore:

- stores all shadow results only in `operation_routing_shadow_runs`;
- enables RLS on the shadow table;
- grants no table access to `anon` or `authenticated`;
- grants select/insert only to `service_role`;
- revokes shadow-evaluation execution from `anon` and `authenticated`;
- creates no `business_operation_links` row;
- exposes no `routing_shadow_*` columns on `operations`.

All new foreign keys have covering indexes.

## Historical shadow baseline

The migration evaluated the 114 existing completed operations using the fields available in their legacy extraction results.

Baseline outcomes:

| Outcome | Count |
|---|---:|
| probable match | 20 |
| high-confidence match | 0 |
| no match | 31 |
| insufficient data | 59 |
| skipped | 4 |
| error | 0 |

These values are a baseline only. Legacy operations did not contain the full prompt-v5 role and evidence contract, so the 20 probable matches are not approval evidence for automatic routing.

No shadow evaluation created a business-operation link.

## Validation

A transaction-based integration test was executed against production and fully rolled back.

It verified that:

1. prompt version 5 activates contract version 2;
2. template and direction are projected;
3. Arabic financial-role fields are sanitized and normalized;
4. field confidence and evidence objects are retained safely;
5. the matching engine identifies the expected enabled financial account;
6. the result is written only to the internal shadow-run table;
7. no business-operation link is created;
8. no shadow result columns exist on `operations`;
9. all test changes disappear after rollback.

Reusable test:

`supabase/tests/operation_analysis_contract_v2_shadow.sql`

## Applied migrations

- `20260731103813_operation_analysis_routing_shadow_v2.sql`
- `20260731103911_fix_operation_routing_shadow_uuid_aggregation.sql`
- `20260731104749_operation_analysis_contract_v2_trigger_and_prompt.sql`
- `20260731105256_isolate_operation_routing_shadow_results.sql`

The intermediate UUID aggregation defect was contained by the migration's per-operation exception handling, fixed immediately in the following migration, and left in the documented history rather than hidden.

## Release gate before real routing

Automatic routing remains prohibited until a real-notice benchmark demonstrates acceptable precision.

The next gate should use redacted real notices and record, per provider and template:

- correct financial-entity classification;
- correct selected operation in multi-operation screenshots;
- correct document/credited/debited/merchant-point roles;
- exact identifier match precision;
- false-positive routing rate;
- ambiguous-candidate rate;
- extraction and shadow-evaluation latency;
- human reviewer agreement.

The primary go-live metric is routing precision, not coverage. A system that abstains is preferable to one that confidently sends a payment to the wrong business.

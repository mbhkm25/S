# SANAD Operational Shadow Engine — Round 1

## Scope

This report records the first controlled shadow-analysis round for the operational-only financial extractor. The shadow worker does not update production operations, create payment-inbox records, match business accounts, or send WhatsApp messages.

## Configuration

- Engine: `operational-shadow-v8`
- Model: `gemini-3.5-flash-lite`
- Thinking: `minimal`
- Maximum output tokens: `1024`
- Prompt: `sanad_operation_extraction_operational_v2_shadow`
- Prompt state: inactive
- Storage: `operation_analysis_shadow_runs`

## Measurement semantics

### Comparable agreement

Agreement with production fields only when the production field is present and not `unknown`. Missing production fields are not counted as candidate errors. This is an agreement metric, not verified ground-truth accuracy.

### Shadow coverage

The proportion of operational fields populated by the candidate engine. Coverage does not prove that a populated value is correct.

### Routing eligibility

A deterministic quality gate marks a shadow result as `eligible` or `review_required`. The decision is evaluation-only and never performs real routing.

## Corpus coverage

The first round included representative PDF, JPEG, and WebP documents from:

- Al-Amqi Mobile
- Al-Busairi Mobile
- Al-Kuraimi SAR
- Al-Kuraimi YER
- Bin Dowal Pay
- Bin Dowal Exchange
- B Cash Wallet

The corpus included deposit, withdrawal, transfer, and payment documents, with account-number, phone-number, and merchant-point identifiers.

## Observed latency

Most Gemini calls completed between approximately `1.1s` and `2.2s`. One Al-Kuraimi SAR image consistently required approximately `5.0s`, so latency must be evaluated by template and with P95/P99 measurements rather than a single global median.

## Stable successes

- Al-Amqi PDF deposit reached full comparable agreement and full operational coverage.
- Bin Dowal Pay reached full comparable agreement and full coverage, correctly preserving the beneficiary mobile number as `phone_number`.
- Bin Dowal Exchange WebP reached full comparable agreement and full coverage after deterministic entity/type normalization.
- B Cash payment reached full comparable agreement and full coverage after Yemen-local-time normalization.
- The routing quality gate marked a complete Bin Dowal Pay result as eligible.

## Cases requiring template-specific work

### Al-Amqi WebP deposit

The model consistently selected a different receiver name/account from the production result across repeated runs, while reporting high confidence. General prompt expansion is therefore not an appropriate remedy. This template requires a template-specific role/account validation or a targeted visual recovery path.

### Al-Kuraimi YER image

The model consistently failed to resolve the financial entity and beneficiary routing identifier. The model often raised review warnings itself. The deterministic quality gate correctly blocks routing. This case requires a local template/entity router or a targeted recovery pass.

### Al-Busairi image

Operational fields were stable, but date formatting varied between `YYYY-MM-DD` and `YYYY/MM/DD`. Deterministic date normalization resolves this. The document did not expose a usable receiver routing identifier, so routing remains blocked despite high agreement on the available fields.

## Quality-gate rules

A result is blocked from routing when any of the following applies:

- Financial entity is unresolved or mapped to `other`.
- The model explicitly requests review.
- Overall or primary-identifier confidence is below threshold.
- Receiver identifier or its semantic type is missing.
- Identifier type is not routable, such as national ID, passport, card number, `other`, or `unknown_identifier`.
- The selected receiver identifier matches a sender/debited-party identifier after deterministic normalization.

## Current decision

The engine is suitable for continued production shadow evaluation only. It is not approved as the production source of truth and is not connected to automatic operation routing.

## Next gates

1. Implement template-specific validation/recovery for Al-Amqi WebP deposits.
2. Implement deterministic entity/template routing for Al-Kuraimi YER images.
3. Expand the labelled corpus and establish field-level ground truth independent of the existing production output.
4. Measure sequential cold/warm P50, P95, and P99 latency by template.
5. Integrate background shadow triggering behind a disabled-by-default feature flag only after the above gates pass.

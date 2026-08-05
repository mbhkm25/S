# SANAD Fast Financial Engine — Isolated Benchmark Protocol

## Purpose

Evaluate whether the local template-aware financial analyzer provides a material latency improvement over the existing Gemini path without changing production behavior.

## Isolation rules

- Gemini remains the only production source of operation analysis.
- The experimental engine must not update `operations` or any production analysis fields.
- The experiment must not send WhatsApp messages, create QR responses, consume subscriptions, or mutate business routing.
- Raw financial documents remain in a private benchmark corpus and must never be committed to GitHub.
- Recorded Gemini baselines and local candidate outputs are stored as benchmark artifacts only.

## Execution model

Each benchmark case contains:

- a private artifact reference or extracted text;
- a manually reviewed expected extraction;
- a recorded Gemini output and duration;
- a local engine output and measured duration.

The runner executes baseline and candidate independently and scores both against the same expected result.

## Critical fields

The decision gate treats these as critical:

- financial entity;
- template code;
- transaction type and direction;
- amount and currency;
- document and transfer references;
- transaction datetime;
- all typed identifiers, including financial accounts, cards, passports, phones, wallets, and merchant points.

## Default decision gate

The candidate remains experimental unless all conditions pass:

- at least 30 comparable cases;
- critical-field accuracy of at least 99%;
- no critical accuracy regression against the baseline;
- at least 50% relative P95 latency improvement;
- at least 3 seconds absolute P95 latency improvement.

A result such as 15 seconds versus 12 seconds is rejected as marginal even when accuracy is equal. A result such as 15 seconds versus 1–2 seconds may become eligible for a separate shadow-review decision.

## Decision statuses

- `insufficient_data`: corpus is too small.
- `reject`: latency or accuracy gates failed; keep Gemini unchanged.
- `eligible_for_shadow_review`: benchmark gates passed, but no production integration is authorized.

## Current implementation

The isolated runner is located under:

`services/sanad-fast-analyzer/src/benchmark`

It includes:

- benchmark contracts;
- deterministic field scoring;
- P50/P95 summaries;
- recorded Gemini baseline adapter;
- local fast-engine adapter;
- automatic decision policy;
- tests proving that marginal gains are rejected.

No production deployment, migration, or runtime integration is included.

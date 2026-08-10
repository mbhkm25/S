# SANAD Local Extraction Engine

This service is the continuation of the earlier **SANAD Fast Financial Analyzer** work. It is not a second competing implementation.

The existing code already provides deterministic financial parsing, template definitions, PDF text-layer extraction, benchmark infrastructure, and shadow-quality utilities. The Local Extraction Engine builds on that foundation by adding a stable orchestration layer and a pluggable local OCR boundary so SANAD can progressively reduce paid AI usage without changing the production operation contract.

## Current objective

Resolve as many known Yemeni financial notices as possible using local computation:

`document -> native text/OCR -> template detection -> deterministic rules -> semantic validation -> SANAD extraction result`

Gemini remains the fallback for unknown, ambiguous, low-confidence, or unsupported documents until local quality gates are proven on a representative corpus.

## Safety boundary

This branch is experimental and must not become the production source of truth yet.

- no direct writes to `operations`
- no replacement of the current production analyzer
- no raw customer financial documents committed to Git
- local results must expose confidence and fallback recommendation
- promotion requires benchmark and shadow evidence

## Existing foundation

Already present before this branch:

- native PDF text extraction
- Al-Amqi deterministic deposit/withdrawal parsers
- template registry for Al-Amqi, Al-Kuraimi Haseb, Bin Dowal, and Bin Dowal Pay families
- routing-match helpers
- benchmark contracts, runner, scoring, and Gemini comparison support
- shadow comparison, quality gate, recovery policy, and account matching utilities

## Added by Local Extraction Engine v0.1

- canonical `LocalExtractionDocument` and `LocalExtractionResult` contracts
- pluggable `OcrProvider` interface
- one orchestration entry point: `analyzeLocalDocument(...)`
- native PDF fast path before OCR
- OCR-to-rules composition for raster documents
- explicit confidence acceptance gate
- explicit Gemini/deep-analysis fallback recommendation
- per-stage timings and diagnostics

The OCR provider is deliberately not hardwired to one runtime. PaddleOCR/PP-OCR is the first candidate to benchmark, but the engine contract allows us to replace it without rewriting the parser and routing layers.

## Goal

Produce the operational core of a known financial notice within a P95 latency budget of 5 seconds while materially reducing paid Gemini calls.

## Design principles

1. Download each media object once.
2. Prefer a native PDF text layer before OCR.
3. Detect the document family before extracting fields.
4. Extract only the operational core on the critical path.
5. Keep semantically different identifiers separate.
6. Require deterministic validation before accepting a local result.
7. Route low-confidence or unknown documents to deep verification.
8. Never store raw customer financial documents in the Git repository.
9. Keep OCR/runtime dependencies behind provider interfaces.
10. Preserve one SANAD extraction contract regardless of which engine produced it.

## Operational core

- financial entity
- template code and version
- amount and currency
- transaction direction and type
- document reference
- transfer/remittance reference when distinct
- sender and receiver names
- financial account identifiers
- phone/wallet identifiers
- merchant point when applicable
- transaction date and time
- per-field confidence and evidence source

## Initial template families

- Kuraimi Haseb transaction card
- Kuraimi Haseb balance transaction list
- Al-Amqi Mobile deposit notice
- Bin Dowal account transfer voucher
- Bin Dowal credit notice
- Bin Dowal Pay transfer notice

The first registry is in `templates/registry.v1.json`. Its regions are provisional calibration hints, not production truth. Raw examples remain in a restricted benchmark corpus outside GitHub.

## Execution order

1. Consolidate the previous fast-analyzer work behind the Local Extraction Engine contract. **Started.**
2. Add a local OCR provider and benchmark it on real raster notices.
3. Expand deterministic parsers beyond the existing Al-Amqi family.
4. Build a representative private corpus and field-level scoring report.
5. Run local extraction in shadow mode beside the current Gemini result.
6. Measure local-resolution rate, field accuracy, P95 latency, CPU/RAM, and Gemini fallback rate.
7. Promote only template families that pass accuracy and latency gates.
8. Add production routing gradually; never cut over all traffic at once.

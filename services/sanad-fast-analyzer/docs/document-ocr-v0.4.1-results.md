# SANAD Document OCR v0.4.1 — aggregate validation

Validated on 2026-08-11 against the isolated private `pilot-01` corpus. This document intentionally contains aggregate metrics only; no raw documents, names, account identifiers, or extracted private values are included.

## Architecture

- Native-text PDF fast path using `pdftotext -layout`; native PDFs bypass raster OCR.
- Primary image/PDF-raster OCR: Tesseract `ara+eng`, PSM 6.
- Secondary enhanced pass: grayscale + autocontrast + sharpen/upscale + PSM 11, triggered only by low OCR confidence or weak total evidence score.
- Logical-line merge with deduplication.
- Structured `field_candidates` emitted for amount, currency, reference, date, identifier and entity hints, with source-line provenance and confidence score.
- `evidence` summary and `refinement_recommended` are emitted for downstream routing.
- Secure server bridge remains Ed25519-authenticated; production operation routing is unchanged.

## Private corpus benchmark — run 31530673469

- Cases: 10
- HTTP success: 10/10
- OCR failures: 0
- Zero-text results: 0
- Deterministic parser match: 10/10
- Deterministic critical completeness: 7/10
- Mean OCR latency: 1053.3 ms
- P50 OCR latency: 727.8 ms
- P95 OCR latency: 2104.0 ms
- Native PDF examples completed in roughly 24–41 ms in the isolated benchmark.
- Mean Gemini text semantic latency: 1175.1 ms
- Mean OCR + Gemini text pipeline: approximately 2228 ms
- P95 OCR + Gemini text pipeline: 3372.0 ms
- Mean Gemini text cost: $0.00087373 per case
- Runtime memory observed: about 53.25 MiB / 768 MiB container limit

## Grounded-evidence benchmark on deployed service

Privacy-safe evidence benchmark on the 10 deployed corpus cases:

- Amount candidate present: 9/10
- Currency candidate present: 9/10
- Reference candidate present: 9/10
- Date candidate present: 9/10
- Identifier candidate present: 6/10
- Entity hint present: 8/10
- Native-text PDF path: 2/10
- Adaptive second OCR pass: 2/10
- `refinement_recommended`: 2/10
- Evidence score distribution: five cases scored 6/6; two 5/6; two 4/6; one 2/6.
- Deployed evidence benchmark mean OCR latency: 1073.5 ms.

## Comparison with the immediately preceding v0.4.0 experiment

The aggressive v0.4.0 trigger ran a second OCR pass whenever any critical anchor was absent. It did not improve deterministic critical completeness beyond 7/10 and increased mean OCR latency to about 1406 ms. v0.4.1 therefore retained the richer grounded candidate extraction while restoring selective refinement. This reduced mean OCR latency back to about 1.05 s while materially increasing grounded candidate coverage.

## Release status

Commit `0d5702d1662bebf291a15cbda4fa7b32d024c669` was deployed successfully by `Deploy SANAD Local Extraction V2` run `31530673493`; build, activation, runtime verification and public TLS bridge verification completed successfully. The OCR layer remains isolated from production result routing pending downstream V2.2 candidate-aware evidence-gate validation.

# SANAD Local Extraction Engine v0.2 — Architecture

## Core invariant

Every local path must either produce a canonical `CoreFinancialExtraction` that passes deterministic quality gates or explicitly fall back. The engine must never trade financial correctness for local-resolution rate.

## Processing graph

```text
Document
  |
  +-- PDF with usable text layer --------------------------+
  |                                                        |
  |                                                        v
  +-- Raster / scanned PDF -> OCR sidecar -> OCR blocks -> Parser Registry
                                                           |
                                                           v
                                                    Semantic Guards
                                                           |
                                                           v
                                               Critical Field Validation
                                                           |
                                                    +------+------+
                                                    |             |
                                                   pass          fail
                                                    |             |
                                                    v             v
                                                local result   fallback
```

## Component boundaries

### 1. Input boundary

Accepts bytes plus MIME type and operation metadata. It does not fetch customer documents itself. This keeps storage/auth concerns out of the extraction core and makes benchmarking deterministic.

### 2. Native PDF path

Native text is attempted before OCR because it is faster, cheaper, and generally preserves exact identifiers better than raster recognition. Native text still must pass the same parser registry and semantic guards.

### 3. OCR provider boundary

The Deno engine does not import PaddleOCR directly. `OcrProvider` is a stable interface. The first runtime is an isolated localhost PaddleOCR CPU service, but another runtime can be benchmarked or substituted later without changing extraction orchestration.

### 4. Parser registry

Each financial family parser is isolated and returns a candidate plus evidence/confidence. Parsers do not mutate shared state. Competing near-equal matches across different financial entities are considered ambiguous and fall back.

### 5. Semantic validation

Template-specific invariants protect against financially dangerous substitutions, such as confusing card numbers, account numbers, merchant points, references, sender identifiers, and receiver identifiers.

### 6. Acceptance gate

A high OCR score is never sufficient by itself. Acceptance combines parser confidence, extraction review flags, critical fields, and template-specific guards. Unknown or incomplete documents are not guessed.

### 7. Fallback contract

Fallback is a first-class result, not an exception. The caller receives a stable reason such as:

- `ocr_provider_not_configured`
- `no_supported_template_matched_after_ocr`
- `local_critical_fields_incomplete`
- `local_confidence_below_acceptance_gate`
- `local_ocr_or_rules_failed`

This allows production routing to invoke Gemini only where it adds value.

## Performance strategy

The fast path is intentionally minimal:

- model kept warm in memory
- one OCR model instance per worker/container
- CPU static inference and MKLDNN when supported
- no orientation/unwarping on every request
- bounded concurrency to avoid memory thrashing
- native PDF text before OCR
- deterministic parsing after OCR, not an additional LLM

Recovery passes should be selective. If benchmark evidence shows a rotated/cropped class failing, the engine can add a second-pass preprocessing policy only for that class.

## Scaling strategy

Start with one CPU OCR container and controlled concurrency. Scale only after measuring target-server throughput and memory. Multiple OCR replicas can later sit behind a localhost/internal load balancer while the Deno extraction contract stays unchanged.

## Production integration stages

1. offline/private benchmark only
2. server shadow mode with no effect on customer result
3. template-level eligibility registry
4. low-percentage local-primary routing with Gemini fallback
5. gradual expansion by template family after observed quality gates remain healthy

There is no all-at-once cutover.

## Observability requirements before production routing

Per extraction record:

- engine version
- OCR provider/version
- parser name/version
- template code/version
- source path (`pdf_text` / `ocr` / `rules`)
- total, OCR, PDF-text, and rules latency
- local confidence
- fallback flag/reason
- critical-field completeness

Aggregate monitoring:

- local-resolution rate
- fallback rate by entity/template
- critical-field disagreement versus production Gemini during shadow
- P50/P95/P99 latency
- OCR error rate
- container memory/CPU and queue pressure

## Security/privacy

- OCR endpoint binds to localhost by default
- optional bearer token remains available for internal network deployment
- request files are temporary and deleted after inference
- raw financial samples are prohibited from Git
- benchmark corpus remains private and outside repository history

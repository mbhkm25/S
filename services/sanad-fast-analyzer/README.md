# SANAD Local Extraction Engine

This service evolves the earlier **SANAD Fast Financial Analyzer** into a robust local extraction engine. Existing parsers and benchmark assets are reused only where they remain useful; the orchestration, OCR boundary, confidence gates, and deployment shape are intentionally redesigned for accuracy, speed, and safe fallback.

## Objective

Resolve as many Yemeni financial notices as possible using local computation:

`document -> native PDF text / local OCR -> deterministic parser registry -> semantic validation -> SANAD extraction contract -> confidence gate`

If the local engine cannot prove a result is safe enough, it explicitly recommends the current Gemini/deep-analysis path. Production Gemini remains untouched until benchmark and shadow evidence justify gradual routing.

## Safety boundary

- no direct writes to `operations`
- no replacement of the current production analyzer
- no raw customer financial documents committed to Git
- local results expose confidence, diagnostics, timings, and fallback recommendation
- unknown and ambiguous templates fail closed
- promotion requires private-corpus benchmark and shadow evidence

## Runtime architecture

### Local extraction core

The TypeScript/Deno core performs:

1. native PDF text-layer extraction when available
2. parser-registry execution
3. deterministic semantic validation
4. critical-field validation
5. confidence gating
6. explicit fallback decision

The same parser registry is used after native PDF extraction and after OCR, so all document types converge on one SANAD result contract.

### Local OCR sidecar

`ocr-runtime/` is a CPU-first FastAPI service backed by PaddleOCR. OCR is intentionally isolated from the Deno core behind `OcrProvider`, which lets SANAD benchmark or replace the OCR runtime without rewriting parsing and routing logic.

The default runtime is optimized for the common fast path:

- Arabic PP-OCRv5
- CPU inference
- one warm model per container
- explicit `paddle_dynamic` inference after the static/oneDNN path failed the startup inference canary on the target Linux runtime
- orientation/unwarping recovery features disabled on the first pass
- bounded request size and concurrency
- localhost-only Docker binding by default
- optional bearer token
- readiness and liveness probes
- startup readiness requires a real OCR inference canary, not model construction alone

If real corpus results show rotation or distortion materially affects accuracy, those expensive recovery passes should be activated selectively rather than paid on every operation.

## Local run

From this directory:

```bash
docker compose -f docker-compose.local.yml up -d --build
curl --fail http://127.0.0.1:8091/health/ready
```

The OCR container is not exposed publicly by the provided compose file.

## Private end-to-end benchmark

Raw customer documents stay outside Git. A private manifest points to local artifacts and ground truth. With the OCR sidecar running:

```bash
deno task benchmark:local /absolute/path/to/private-local-manifest.json
```

Optional runtime configuration:

- `SANAD_LOCAL_OCR_URL`
- `SANAD_OCR_TOKEN`
- `SANAD_LOCAL_OCR_TIMEOUT_MS`

The report compares the local engine against a recorded Gemini baseline and measures field accuracy, critical-field accuracy, review/fallback behavior, and latency. The current production-data distribution shows the first meaningful corpus should prioritize Kuraimi Haseb images, Al-Amqi PDF/JPEG/WebP, Bin Dowal images, then Al-Busaery/Bin Dowal Pay, while deliberately retaining unknown documents as negative fallback cases. See `docs/benchmark-corpus-plan.md`.

## Acceptance philosophy

Local extraction is not accepted merely because OCR returned readable text. A result must pass all relevant deterministic guards and contain the critical transaction fields required by SANAD. The current global acceptance gate defaults to 0.98 and individual template parsers may impose stricter rules.

Critical local auto-accept fields currently include:

- financial entity
- amount
- currency
- document or transfer reference

Routing identifiers and party fields are still scored and validated by each parser; templates that require them must enforce them before promotion.

## Existing useful foundation

- native PDF text extraction
- Al-Amqi deterministic deposit/withdrawal parsers
- template registry covering Al-Amqi, Al-Kuraimi Haseb, Bin Dowal, and Bin Dowal Pay families
- routing-match helpers
- benchmark runner/scoring and recorded Gemini baseline support
- shadow comparison, quality gate, recovery policy, and account matching utilities

## Local Extraction v0.2 additions

- canonical `LocalExtractionDocument` / `LocalExtractionResult`
- pluggable `OcrProvider`
- CPU PaddleOCR sidecar and Docker runtime
- robust HTTP OCR provider with timeout and response-contract validation
- generic deterministic parser registry
- ambiguity guard between competing parsers
- one orchestration entry point: `analyzeLocalDocument(...)`
- native PDF-first fast path
- OCR-to-parser path for raster documents
- critical-field and confidence gates
- per-stage timings and diagnostics
- private end-to-end benchmark runner
- required CI checks for Deno core, Python syntax, and Docker Compose validity

## Performance targets

Targets are gates, not claims of current measured performance:

- local parser/RULE overhead: sub-100 ms where text already exists
- OCR + parsing P95: <= 5 seconds on the target CPU server
- critical-field accuracy: >= 99% before production auto-accept for a template family
- unknown/ambiguous documents: 100% fallback, never guessed
- paid Gemini fallback rate: progressively reduced only when quality evidence supports it

## Next execution order

1. Build a stratified private corpus from completed SANAD operations.
2. Run PP-OCRv5 on real raster notices and record OCR/field accuracy and latency.
3. Inspect OCR failure modes before adding speculative parsing rules.
4. Expand deterministic parsers by actual template frequency and economic impact.
5. Add selective image preprocessing/recovery only where benchmark evidence requires it.
6. Run the engine in shadow mode beside production Gemini.
7. Measure local-resolution rate, critical accuracy, P50/P95 latency, CPU/RAM, and fallback rate.
8. Promote template families individually through gradual routing; never cut over all traffic at once.

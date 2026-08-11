# SANAD Candidate-Grounded V2.2.1 — validation

Validated on 2026-08-11 against the isolated private `pilot-01` corpus. This document intentionally contains aggregate metrics only and does not include raw private documents or extracted personal/financial values.

## What changed

- `sanad-ocr-gemini-lab-v2` now consumes Document/OCR `field_candidates`, `evidence`, `refinement_recommended`, and `document_mode`.
- Gemini text semantics receives compact deterministic candidate values rather than full candidate source lines.
- A fail-closed grounding gate compares semantic entity, amount, currency, reference, and date against deterministic document evidence.
- Arabic Presentation Forms are normalized with NFKC for deterministic recovery of entity/currency/amount/reference/date/identifier candidates.
- Low OCR confidence may only be compensated when all four critical candidate groups (entity, amount, currency, reference) are present and fully grounded with strong semantic confidence.
- Candidate mismatch or weak document evidence recommends Vision fallback rather than accepting an ungrounded value.
- Production operation routing remains unchanged; this validation is isolated.

## Private benchmark

GitHub Actions run `31531651886`, rerun job `93914432710`, commit `68a771664f4123d49cb67a598c7a7e7ff00d503d`.

- Cases: 10
- OCR HTTP success: 10/10
- Gemini text success: 10/10
- Zero-text results: 0
- Deterministic parser matches: 10/10
- Candidate fully grounded for all four critical fields: 7/10
- Mean critical candidate-grounding ratio: 0.975
- Candidate-gate Vision fallback recommendation: 3/10
  - 2 weak-document/refinement cases
  - 1 reference-candidate mismatch case
- Mean OCR latency: about 1055.7 ms
- P50 OCR latency: about 712.7 ms
- P95 OCR latency: about 2086.3 ms
- P95 Gemini text latency: about 1420 ms
- P95 OCR + Gemini pipeline: about 3489.3 ms
- Mean Gemini text cost: $0.0008632 per case
- Total Gemini text cost for 10 cases: $0.008632
- Runtime memory observed: about 52.83 MiB / 768 MiB

## Ground-truth validation

Using the latest attempt for each benchmark case in `ocr_gemini_lab_accuracy_v`:

- Exact critical extraction: 8/10.
- The eight exact cases matched entity, amount, currency, reference and date.
- Two cases remained non-exact and both were fail-closed for review/fallback:
  - one poor/noisy OCR case with wrong/missing critical evidence;
  - one conflicting receipt-reference case where the candidate gate detected the reference disagreement instead of silently accepting it.
- No known non-exact case in this latest attempt was automatically accepted as a safe critical extraction.

## Cost comparison

The first candidate-grounded V2.2 attempt sent full candidate lines to Gemini and averaged about $0.00115517 per case. V2.2.1 sends compact candidate values and averaged $0.0008632, a reduction of roughly 25% while preserving the fail-closed evidence gate.

## Interpretation

On this small private corpus, seven of ten documents have enough deterministic evidence to ground all four critical fields without a Vision escalation for critical extraction. Three of ten remain correctly routed toward fallback because the document layer cannot safely prove the result. Routing-party completeness is intentionally stricter and is evaluated separately from the critical-field Vision fallback decision.

## Release status

The candidate-aware semantic lab is active as an isolated Supabase Edge Function version 12. The GitHub workflow was updated on the feature branch to carry Document/OCR evidence into the semantic stage and record candidate-grounding/fallback metrics. No production analyzer or production operation routing was switched to V2.2.1 in this validation.
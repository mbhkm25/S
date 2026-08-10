# SANAD Local Extraction — Private Corpus Plan

The benchmark corpus must represent actual SANAD traffic and remain private. Raw customer files must never be committed to Git.

## Current observed traffic priorities

The first benchmark should prioritize the most frequent document families and formats currently present in SANAD operations:

1. Al-Kuraimi Haseb — JPEG first, then WebP
2. Al-Amqi Mobile — PDF, JPEG, and WebP
3. Bin Dowal Exchange — JPEG, then WebP
4. Al-Busaery Mobile — JPEG
5. Bin Dowal Pay — JPEG
6. unknown / other documents as mandatory negative cases

## Sampling rules

Build a stratified corpus rather than taking only recent or easy examples.

- include verified operations preferentially where available
- include successful AI-completed operations for broader coverage
- include each important MIME type
- include both known templates and documents currently labelled `unknown`
- include low-quality, rotated, cropped, photographed-screen, and compressed examples when present
- include duplicate-looking layouts with different semantic directions so parsers cannot overfit visual shape alone
- include negative documents that must always fall back

## Initial corpus size

Target 120–200 cases for the first meaningful benchmark. A smaller 30–50 case smoke corpus may be used for rapid iteration, but it is not sufficient for production promotion.

Suggested first allocation:

- 40–50 Kuraimi Haseb image notices
- 40–50 Al-Amqi notices split across PDF/JPEG/WebP
- 20–30 Bin Dowal notices
- 10–15 Al-Busaery / Bin Dowal Pay / other supported candidates
- 15–25 unknown or intentionally unsupported negatives

Where the database does not yet contain enough distinct cases, use all available cases and mark the benchmark as coverage-limited.

## Ground truth

Each case should contain only a local artifact reference plus a reviewed SANAD extraction contract. Ground truth must not be assumed correct merely because Gemini produced it. Prefer in order:

1. user-verified / operationally confirmed fields
2. deterministic fields independently visible in the source document
3. manually reviewed recorded production extraction

Critical fields for promotion:

- financial entity / entity code
- amount
- currency
- transaction direction/type where the template requires it
- document reference and/or transfer reference
- primary sender/receiver routing identifier required by the template
- transaction date/time when visibly present

## Promotion gates

A template family cannot become an automatic local production path unless it passes all of the following on a representative corpus:

- critical-field accuracy >= 99%
- no known false-positive financial entity routing in the evaluated corpus
- no known amount/currency substitution errors in the evaluated corpus
- unknown/ambiguous examples fall back instead of being guessed
- P95 total local latency <= 5 seconds on the target server CPU
- memory and concurrency remain within the allocated container budget

Higher-volume families should receive larger benchmark samples before promotion.

## Performance measurements

Record separately:

- native PDF text extraction latency
- OCR latency
- deterministic parser latency
- total local latency
- OCR confidence
- SANAD extraction confidence
- fallback reason
- local-resolution rate
- peak/steady memory during load tests
- throughput under controlled concurrency

Do not optimize only average latency. P95/P99 behavior and failure containment matter for cashier-facing workflows.

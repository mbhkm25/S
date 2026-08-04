# Operation Details Runtime v2

## Purpose

Operation Details is a critical runtime, not a passive report page. It must load the financial facts quickly, keep document rendering independent from the main payload, and mutate workflow state only through explicit commands.

## Architecture decisions

### ADR-ODR-001 — One read contract

The UI reads one stable, side-effect-free RPC: `get_operation_details_runtime(uuid)`.

The contract returns:

- core financial facts;
- extracted transaction time and SANAD receipt time;
- preview state and dimensions;
- inbox/business context;
- permissions and current assignee;
- verification and audit summary.

The RPC must not write access logs, consume quota, claim an inbox row, or call any volatile opening function.

### ADR-ODR-002 — Explicit commands only

Opening details, switching tabs, previewing, zooming, downloading, or opening the original document are read-only. Workflow state changes only through central commands such as `claim_business_payment_v2`, `complete_operation_workflow`, review commands, release commands, and personal verification.

### ADR-ODR-003 — Preview is asynchronous and non-blocking

The page shell and financial facts must render without waiting for WebP. The preview pipeline is independently cached and versioned. The original file remains available when preview generation is pending or failed.

### ADR-ODR-004 — Source-aware preview policy

- Image source: preserve the original visual bounds and aspect ratio, downscale only when needed, and encode to WebP without adding frame, padding, background, or crop.
- PDF source: render page one, detect the white page inside the PDF viewer, then detect meaningful content inside the upper portion of that page, crop both viewer background and document whitespace, and encode the result to WebP.
- PDF fallback: when content detection cannot produce a safe crop, use the upper 70% of page one.

### ADR-ODR-005 — Safe activation

The new runtime may replace the legacy details DOM only after its core contract has loaded and passed payload validation. Failure leaves the stable legacy UI visible; it must never expose an empty replacement page.

## Performance budget

- Core contract p50: <= 500 ms.
- Core contract p95: <= 1500 ms.
- First meaningful render: <= 1000 ms under normal mobile conditions.
- Preview is not on the critical path.
- One core RPC per initial open; no fan-out for primary facts.

## Preview pipeline

Current pipeline version: `content-crop-v3`.

1. Claim one idempotent job.
2. Download or sign the original source.
3. Branch by MIME type.
4. For images, preserve visual bounds and encode directly.
5. For PDFs, render page one to PNG, detect page bounds, detect content bounds, crop, then encode the crop to WebP.
6. Record exact width, height, byte size, source hash, pipeline version, page bounds, and crop metadata.
7. Upload under an immutable versioned path.
8. Complete the job atomically.
9. Retry transient failures with bounded attempts; every claimed job must finish as `completed`, `pending`, or `failed`, never remain stuck in `processing`.

## UI information architecture

### Header context

- operational status;
- SANAD receipt time;
- close/back action.

### Summary card

- financial entity;
- amount and currency;
- receiver;
- account;
- reference;
- transaction time from original notice;
- receipt delay indicator.

### Tabs

- Operation: facts, matching state and workflow action.
- Document: responsive preview and original-file access.
- Record: verification, assignment and audit timeline.

### Sticky action bar

Actions depend on inbox state and permissions. A read-only open never changes status.

## Acceptance criteria

1. Opening an inbox item does not change its status, row version, assignee, completion actor, or update timestamp.
2. Core facts render even if preview is pending or failed.
3. The two times are clearly separated and labeled.
4. Image previews have no artificial margins.
5. PDF previews focus on document content, not the full empty page or viewer background.
6. Preview dimensions are real, not hard-coded.
7. The new runtime never hides the legacy page before successful validation.
8. Completing or claiming from details updates the same inbox record used elsewhere.
9. The UI supports image, PDF, missing preview, slow preview and failed preview.
10. All changes are documented in SANAD OS before completion.

## Validation evidence — 2026-08-04

### Live PDF

- Source: real 220 SAR PDF operation.
- Render canvas: 1600 x 2200.
- Detected white page: 585 x 553.
- Final content crop: 579 x 349.
- Final WebP: 19,588 bytes.
- Job: completed on first attempt with `content-crop-v3`.

### Live image

- Source JPEG: 1080 x 398.
- Output WebP: 1080 x 398.
- Crop mode: `preserve-bounds`.
- No padding, background, frame, or crop added.
- Job: completed on first attempt.

### Read-only workflow checks

The runtime contract was executed against live `claimed`, `review_required`, and `completed` inbox rows. In every case:

- status remained unchanged;
- row version remained unchanged;
- assignee remained unchanged;
- completion actor remained unchanged;
- `updated_at` remained unchanged;
- the contract returned `read_only=true` and the correct inbox state.

There were no live `new` rows at validation time; no production row was fabricated or mutated solely to create one.

### CI

The latest branch commit passed:

- Production quality gate;
- Operation identity details and reports quality;
- Android APK build.

## Test matrix

- PDF with content in upper third — passed with live PDF.
- Image landscape — passed with live JPEG.
- Claimed by current user — passed read-only contract validation.
- Review required — passed read-only contract validation.
- Completed — passed read-only contract validation.
- New inbox item — not available in live data at validation time; covered by the same status-neutral read contract and retained in post-deploy observation.
- Contract denied or malformed — safe activation keeps the legacy DOM visible because replacement occurs only after validated runtime state is set.
- Preview pending or failed — original-file access remains independent and the preview poll terminates with a non-blocking failure state.

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

- Image source: normalize orientation and encode to WebP without adding canvas, frame, padding, or background.
- PDF source: render the first page, detect meaningful content bounds, crop white margins with a small safety margin, and encode the crop to WebP.
- PDF fallback: when content detection cannot produce a safe crop, use the upper 70% of page one with a small margin.

### ADR-ODR-005 — Safe activation

The new runtime may replace the legacy details DOM only after its core contract has loaded and passed payload validation. Failure leaves the stable legacy UI visible and records a client diagnostic; it must never expose an empty replacement page.

## Performance budget

- Core contract p50: <= 500 ms.
- Core contract p95: <= 1500 ms.
- First meaningful render: <= 1000 ms under normal mobile conditions.
- Preview is not on the critical path.
- One core RPC per initial open; no fan-out for primary facts.

## Preview pipeline

1. Claim one idempotent job.
2. Sign original source for a short period.
3. Branch by MIME type.
4. Produce a WebP asset using pipeline version `content-crop-v2`.
5. Record exact width, height, byte size, source hash and crop metadata.
6. Upload under an immutable versioned path.
7. Complete the job atomically.
8. Retry transient failures with bounded attempts and visible terminal failure.

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

1. Opening a `new` item leaves it `new`.
2. Core facts render even if preview is pending or failed.
3. The two times are clearly separated and labeled.
4. Image previews have no artificial margins.
5. PDF previews focus on document content, not the full empty page.
6. Preview dimensions are real, not hard-coded.
7. The new runtime never hides the legacy page before successful validation.
8. Completing or claiming from details updates the same inbox record used elsewhere.
9. The UI supports image, PDF, missing preview, slow preview and failed preview.
10. All changes are documented in SANAD OS before completion.

## Test matrix

- PDF with content in upper third.
- PDF with content in upper two-thirds.
- Image portrait.
- Image landscape.
- New inbox item.
- Claimed by current user.
- Claimed by another user.
- Review required.
- Completed.
- Personal/unlinked operation.
- Preview pending.
- Preview failed.
- Contract denied.
- Contract malformed.
- Slow network.

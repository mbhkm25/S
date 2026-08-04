# Operation Details v3 — execution contract

## Scope

This work hardens the critical operation-details runtime across four coupled areas:

1. PDF/image preview production.
2. Financial extraction reliability and speed.
3. Compact operation facts presentation.
4. Central currency presentation.

No component is considered complete in isolation. The release gate requires the reference documents, extraction states, UI states, CI, and live validation to pass together.

## Reference fixture: 600.pdf

The user-supplied reference is a one-page A4 portrait PDF. At a 1240 × 1754 raster size, meaningful content occupies approximately x=13..1226 and y=13..563. The financial notice therefore uses almost the full page width and roughly the upper third of the page.

Ground truth:

- amount: 600
- currency: SAR
- financial entity family: Alomqy / Alomqy Mobile
- transaction type: deposit
- receiver name: محمد عبدالله عمر باحكم
- receiver account: 254073867
- reference number: 8-226242876
- transaction date: 2026-05-14
- transaction time: 20:04

The parser must not confuse passport 9747668, sender account 254129454, or card 08010076816 with the selected receiver account.

## Preview Pipeline v4

Pipeline version: `content-crop-v4`.

### PDF policy

- Process page one only in this release.
- Render at high pixel density.
- Isolate the white PDF page from viewer/background pixels.
- Search the upper 42% first and extend to 55% only while connected content continues.
- Classify the layout as `upper_full_width_receipt`, `upper_centered_receipt`, `near_full_page_receipt`, or `unknown_layout`.
- For `upper_full_width_receipt`, retain at least 94% of page width.
- Union text, logos, borders, tables, and footer rows instead of selecting one largest component.
- Add proportional safety padding.
- Reject crops with unsafe edge contact.
- Use a conservative full-width upper-page fallback when confidence is low.

### Image policy

- Preserve the original image bounds and aspect ratio.
- Do not add padding, frame, background, or a larger canvas.
- Resize only when required for the maximum preview width.

### Metadata

Persist layout class, crop mode, confidence, page dimensions, crop dimensions, output dimensions, and edge-safety result.

### Current deployment

`sanad-operation-preview-worker` v13 is active with `content-crop-v4`. A one-time runner created for controlled validation was returned immediately to JWT-protected HTTP 410 status. Visual acceptance against 600, 220 and image fixtures remains open.

## Extraction Pipeline v3

Pipeline version: `operation-extraction-v3`.

### Required behavior

- Gemini structured schema remains mandatory.
- JSON syntax failure must not immediately become a terminal empty operation.
- Parse flow: direct JSON → bounded safe repair → syntax-only retry → full retry/escalation when required.
- Validate finish reason and candidate completeness.
- Preserve previous valid data when a later attempt fails.
- Record attempt, model, duration, repair mode, and escalation reason.
- Core-field disagreement or low confidence produces `review_required`, not silent guessing.
- Failed extraction is represented explicitly in the UI.

### Model routing

- Fast structured model for normal known templates.
- Stronger model only for malformed output, unknown templates, conflicting identifiers, multiple operations, or low confidence.
- Model choice must be justified by benchmark results, not naming alone.

### Compatibility rule

Extraction v3 must be integrated incrementally into the canonical analyzer. It may not remove `operation_pipeline_spans`, fast-routing extraction, strict schemas, idempotent locking, existing persistence, or routing triggers. The initial rewrite that violated this rule was reverted through a normal corrective commit; the latency quality gate returned to green.

### Benchmark contract

`extraction-v3.ts` now contains an executable benchmark contract for `600.pdf`, including all seven required facts, bounded JSON repair, completeness assessment, escalation reasons, deterministic identifier rules, and primary/escalation reconciliation. It is not yet wired into the production analyzer; integration remains gated by CI and the live benchmark.

## Operation details UI

### Compact facts card

The v3 card implementation is now on the branch. It uses a compact entity/amount header, a two-column facts grid, smaller vertical spacing, and no scattered placeholder dashes for missing secondary values.

Priority order:

1. Amount and currency.
2. Financial entity.
3. Receiver.
4. Receiver account.
5. Reference.
6. Transaction time.
7. SANAD receipt time and delay.

### Analysis states

- running/retrying: show that analysis is in progress and keep the document available.
- failed: explain that the document is saved but financial facts are not yet approved.
- completed: show extracted facts.
- while analysis is incomplete, the runtime refreshes read-only data every 3.5 seconds.
- operational actions are disabled until extracted facts are ready.

Opening details, previewing, zooming, or opening the original remains read-only.

## Currency registry

A central registry owns code, Arabic name, English name, symbol asset/fallback, minor units, and accessibility label. ISO codes remain canonical data values.

- SAR currently references the official SVG endpoint published by the Saudi Central Bank and uses `ر.س` as text fallback.
- The official asset still needs to be copied into the application bundle before the PR is review-ready so currency rendering does not depend on an external network request.
- YER, USD, AED and OMR have centralized names and symbols.
- Unknown values never default to USD.

## Acceptance gates

- The 600 PDF preview contains the full logo, reference, amount, account lines, and footer without the large blank lower page.
- The 600 operation extracts all ground-truth fields without manual correction.
- A malformed Gemini JSON fixture is repaired or retried automatically.
- Image previews preserve original bounds.
- The compact card is shorter and structurally denser than v2.
- Failed analysis never appears as a normal completed operation with blank facts.
- Detail reads do not mutate inbox status, row version, assignment, or completion fields.
- CI, Android build, SQL tests, worker tests, and Notion documentation are complete before review-ready status.

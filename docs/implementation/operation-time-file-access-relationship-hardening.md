# Operation, file-access, and relationship hardening

## Objective

Deliver one controlled change set covering transaction date/time correctness, secure and durable original-file access, and a single coherent entry point for customer–business relationship management.

## Current-state audit

### Already implemented

- Gemini prompt version 2 prefers a date explicitly labeled with `التاريخ` / `تاريخ` / `Date` when multiple dates are present.
- Date-only notices include `transaction_time_present=false` and must not invent a time.
- `sanad-file-access` exists in production, requires JWT at the Edge gateway, and generates a fresh five-minute signed URL for each open/download request.
- `MyBusinessRelationshipsOverview` already exposes a dedicated `إدارة` action for every active customer relationship.
- The relationship manager already supports in-app, WhatsApp service, and WhatsApp marketing preferences, disabling communications, and confirmed unlinking.

### Partial or unsafe

- `operations.transaction_datetime` is still a `timestamptz`; date-only values can be rendered as an invented local time unless every consumer checks metadata.
- Explicit transaction date/time fields were absent before this branch.
- Existing operation RPCs and UI consumers still need auditing and migration to the new temporal contract.
- `sanad-file-access` generates fresh URLs correctly, but authorization currently relies on JWT plus knowledge of `public_token`; it must verify that the authenticated user has legitimate operation access.
- Original-file open/download callers must be checked for cached signed URLs and unified on one fresh-access helper.
- The public business profile still exposed customer-specific relationship management before this branch.

## Execution checklist

### A. Transaction temporal model

- [x] Add `transaction_date`.
- [x] Add nullable `transaction_time`.
- [x] Add `transaction_time_present` with consistency constraint.
- [x] Add `transaction_date_source` with controlled values.
- [x] Add `transaction_timezone` only for explicit times.
- [x] Conservatively backfill existing operations.
- [x] Install a canonical trigger that synchronizes new fields from normalized AI metadata and never invents a time.
- [ ] Update analyzer source to write the explicit columns directly in addition to the database safety trigger.
- [ ] Update operation-returning RPCs to expose the explicit temporal fields.
- [ ] Update frontend types and the shared date/time formatter.
- [ ] Replace direct `transaction_datetime` rendering in operation details, cards, activity, business views, and reports.
- [ ] Mark the seven-minute time check `not_applicable` when no explicit time exists.
- [ ] Add regression tests for date-only, explicit-time, duplicate-date-format, labeled-date conflict, and missing-date notices.

### B. Original document access

- [x] Confirm production uses a five-minute signed URL generated on demand by `sanad-file-access`.
- [ ] Inspect every frontend caller for stale URL caching.
- [ ] Add authenticated operation-access authorization inside `sanad-file-access`.
- [ ] Use one frontend helper for `open` and `download` and request a new URL on every action.
- [ ] Add loading, retry, and actionable error states.
- [ ] Add image/PDF inline preview where supported without persisting a signed URL.
- [ ] Test access immediately, after URL expiry, after token expiry, and for an unauthorized authenticated user.

### C. Customer–business relationship management

- [x] Remove relationship management from the public business profile.
- [x] Preserve the sole entry point under Account → My business relationships → Manage.
- [ ] Verify RPC/RLS authorization for reading and mutating only the current user's relationship.
- [ ] Verify each preference maps to the correct database field.
- [ ] Improve save-state feedback and dirty-state handling.
- [ ] Keep communication disablement separate from unlinking.
- [ ] Verify privacy copy against actual RLS/RPC exposure.
- [ ] Complete mobile-first visual QA of the relationship page.

### D. Quality and release

- [ ] TypeScript check.
- [ ] Production PWA build.
- [ ] Android asset build where required.
- [ ] SQL migration and function-contract checks.
- [ ] Edge Function authorization smoke tests.
- [ ] Pull request review before merging to `main`.
- [ ] Production deployment only from merged `main`.

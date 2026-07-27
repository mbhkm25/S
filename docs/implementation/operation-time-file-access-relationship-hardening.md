# Operation, file-access, and relationship hardening

## Objective

Deliver one controlled change set covering transaction date/time correctness, secure and durable original-file access, and a single coherent entry point for customer–business relationship management.

## Current-state audit

### Implemented in this branch

- Added explicit operation temporal fields: `transaction_date`, `transaction_time`, `transaction_time_present`, `transaction_date_source`, and `transaction_timezone`.
- Conservatively backfilled old operations without treating midnight as proof of a visible transaction time.
- Installed a database synchronization trigger that never invents a time for date-only notices.
- Removed customer-specific relationship management from the public business profile.
- Preserved Account → My business relationships → Manage as the only customer relationship-management entry point.
- Added a service-only operation-file authorization contract.
- Updated `sanad-file-access` to authenticate the bearer token and verify legitimate user access before issuing a signed URL.
- Deployed `sanad-file-access` v18 with `verify_jwt=true`.
- Added a closed audit-event table and service-only audit writer for original-file access.

### Verified existing behavior

- Gemini prompt version 2 prefers a date explicitly labeled with `التاريخ` / `تاريخ` / `Date` when multiple dates are present.
- Date-only notices include `transaction_time_present=false` and must not invent a time.
- `sanad-file-access` generates a fresh five-minute signed URL for each open/download request.
- `MyBusinessRelationshipsOverview` exposes a dedicated `إدارة` action for every active customer relationship.
- The relationship manager supports in-app, WhatsApp service, and WhatsApp marketing preferences, disabling communications, and confirmed unlinking.
- Relationship RPCs derive the customer identity from `auth.uid()` and scope read/write operations to that user's row.
- Business-side relationship mutation requires `customers.manage` authorization.

### Remaining integration work

- Existing operation RPCs and UI consumers still need auditing and migration to the new temporal contract.
- Original-file frontend callers must be unified on one fresh-access helper and checked for stale URL caching.
- Analyzer source should write explicit temporal columns directly in addition to the database safety trigger.

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
- [x] Add authenticated operation-access authorization inside `sanad-file-access`.
- [x] Restrict the authorization RPC to `service_role`.
- [x] Verify an entitled user is allowed and an unrelated random user is denied.
- [x] Deploy the hardened Edge Function as `sanad-file-access` v18.
- [x] Add closed audit storage and a service-only audit writer.
- [ ] Inspect every frontend caller for stale URL caching.
- [ ] Use one frontend helper for `open` and `download` and request a new URL on every action.
- [ ] Add loading, retry, and actionable error states.
- [ ] Add image/PDF inline preview where supported without persisting a signed URL.
- [ ] Test access immediately, after URL expiry, after token expiry, and through a real unauthorized authenticated session.

### C. Customer–business relationship management

- [x] Remove relationship management from the public business profile.
- [x] Preserve the sole entry point under Account → My business relationships → Manage.
- [x] Verify RPC authorization scopes customer read/write operations to `auth.uid()`.
- [x] Verify each UI preference maps to the matching database field.
- [x] Keep communication disablement separate from unlinking.
- [x] Verify business-side mutations require `customers.manage`.
- [x] Verify privacy copy against the current RPC payload and relationship scope.
- [ ] Improve save-state feedback and dirty-state handling.
- [ ] Complete mobile-first visual QA of the relationship page.

### D. Quality and release

- [x] SQL migration and function-contract checks.
- [x] Database authorization positive/negative test.
- [x] Edge Function deployment verification (`ACTIVE`, v18, JWT enabled).
- [ ] TypeScript check.
- [ ] Production PWA build.
- [ ] Android asset build where required.
- [ ] Edge Function live-session smoke tests.
- [ ] Pull request review before merging to `main`.
- [ ] Production deployment only from merged `main`.

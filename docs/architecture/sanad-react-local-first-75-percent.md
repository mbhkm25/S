# SANAD React Local-first — 75% implementation milestone

Date: 2026-08-12
Branch: `feature/sanad-react-local-first`
PR: #247

## Scope completed

This milestone covers Phases 0 through 8 of the 12-phase delivery sequence in ADR-002.

### Phase 0 — Baseline & Safety
- Existing Cloud runtime remains the default.
- Local/hybrid runtime is not exposed to product UI yet.
- Production routing and canonical Supabase pipeline are unchanged.

### Phase 1 — Domain & Repository Abstraction
- `OperationRepository` boundary introduced.
- Cloud implementation isolated behind `CloudOperationRepository`.
- Runtime selection fails closed for unfinished modes.

### Phase 2 — Local DB + Durable File Store
- Local operation/file/event/sync stores implemented in IndexedDB.
- Original file + local operation + first event are committed atomically.
- SHA-256 identity is persisted for file integrity and deduplication groundwork.

### Phase 3 — Unified Local Intake
- Local intake creates a stable `localId` independent from Cloud identity.
- Original document is persisted before enrichment/network processing.

### Phase 4 — Offline Queue + Sync Contract
- Durable sync jobs, idempotency key, retry state, exponential backoff and reconnect drain exist.
- Local identity is linked to Cloud identity after promotion.
- Server-side canonical idempotency remains a required merge/production gate; client metadata alone is not treated as a sufficient concurrency guarantee.

### Phase 5 — OCR Benchmark & Adapter
- Replaceable Android OCR adapter contract exists.
- Benchmark measures latency, OCR confidence, required-text recall and digit recall.
- No OCR engine has been selected without corpus evidence.

### Phase 6 — Candidate & Evidence Engine
- Conservative candidate extraction implemented.
- Labeled amounts/references are preferred over unlabeled numeric noise.
- Entity codes align with the current Cloud semantic contract (`alomqi`, `bin_dowal`, `al_busairi`, `kuraimi_haseb`, `unknown`).
- Evidence grounding checks amount, currency, references, datetime, merchant point and party identifiers.
- Values absent from OCR/candidates cannot pass automatic grounding.

### Phase 7 — Gemini Text Semantic Integration
- React Local-first now integrates with the existing authenticated Supabase function `sanad-local-text-analysis`.
- Request contains OCR text + OCR confidence + deterministic hints only; the original image/blob is not sent by this semantic path.
- Local policy and connectivity gate whether semantic analysis is allowed.
- The returned structured result is re-grounded locally before acceptance.

### Phase 8 — Human Review + Provenance
- Human review patching is explicit and has precedence over automated values.
- Human revisions are persisted as analysis revisions/events with reviewer id, review time, changed fields and optional note.
- Human correction does not falsify model confidence; provenance remains separate.
- A human-reviewed record still requires critical fields to be complete.

## Safety invariants at 75%

1. No automatic image upload is introduced by low OCR confidence.
2. No financial digit may be silently repaired or invented.
3. Human corrections outrank automated analysis and retain provenance.
4. Cloud remains canonical after sync.
5. PR stays Draft; nothing in this milestone is deployed to production from the feature branch.

## Remaining phases

### Phase 9 — React UI integration
Make existing SANAD screens local-aware: Local/Queued/Syncing/Review/Synced states, without rebuilding the product UI.

### Phase 10 — Background processing
Use Android WorkManager / lifecycle-safe scheduling for retry and queue draining with battery/network constraints.

### Phase 11 — Notification capture / Floating SANAD
Add Android NotificationListenerService and overlay only after local intake/sync/UI behavior is stable, and route captured financial notifications through the same unified Local-first pipeline.

## Production gates still open

- Real-device offline/restart/reconnect acceptance tests.
- Server-side canonical idempotency under concurrent/repeated promotion attempts.
- OCR engine selection from the private Yemeni corpus benchmark.
- UI migration regression tests.
- WorkManager background recovery tests.
- Notification-listener privacy/permission UX and Android-version compatibility tests.

# ADR-002 — SANAD React Local-first / Offline

Status: Accepted — 2026-08-12

## Decision

SANAD remains one product: the existing React + TypeScript + Capacitor Android application. The separate Flutter SANAD Local product path is superseded. Offline/local capabilities are implemented inside the main application through a Local Runtime, repository abstraction, durable local storage, a sync engine, and Android/Kotlin services where native execution is materially better.

The Flutter Local implementation and the older local-extraction branch remain references for contracts, fixtures, lifecycle ideas, OCR experiments, and benchmarks. Their Dart/Flutter implementation is not copied by default.

## Non-negotiable invariants

1. The original financial document is the source of truth and must be persisted before enrichment when using the local-first intake path.
2. Local processing must not duplicate or bypass the canonical cloud operation pipeline.
3. Cloud idempotency, canonical finalization, routing single-writer rules, queues, and transactional outbox remain server responsibilities.
4. A local operation has its own stable `local_id`; `cloud_operation_id` is attached only after canonical promotion/sync.
5. Human corrections outrank automated analyses and retain provenance.
6. Local and cloud analyses are revisions/evidence, not mutually destructive overwrites.
7. No image is uploaded from the offline/local analysis path solely because OCR confidence is low unless an explicit user/product policy authorizes cloud promotion.
8. No Flutter/Dart code is copied if a React/TypeScript/Kotlin-native implementation is cleaner, faster, smaller, or safer.

## Target architecture

```text
React UI
  -> Application domain / repositories
       -> Local Runtime
            -> durable local DB
            -> durable local files
            -> OCR adapter
            -> deterministic candidate/evidence engine
            -> offline/sync queue
       -> Cloud Runtime
            -> canonical Supabase pipeline
            -> cloud analysis/routing/notifications
  -> Capacitor
       -> Android/Kotlin native services
```

## Local analysis strategy

The local analysis contract follows the strongest ideas proven by the latest SANAD cloud OCR/text-analysis work, without importing its server implementation blindly:

1. OCR is an independent document-reading stage and returns raw text, confidence, timings, and optional structured text evidence.
2. Deterministic candidate extraction derives amounts, currencies, references, dates, routing identifiers, and financial-entity hints from OCR evidence.
3. A semantic text model may consume OCR text plus deterministic candidates when connectivity and policy permit.
4. A grounding/evidence gate rejects or flags critical values that cannot be supported by OCR text/candidates.
5. Digits must never be invented or silently repaired.
6. Low-quality local OCR produces review-required / deferred-cloud states, not silent image upload.
7. The OCR implementation is replaceable behind an adapter. PaddleOCR/PP-OCR, Tesseract, and viable Android alternatives must be benchmarked on the private Yemeni SANAD corpus before selection.

## Proposed local data model

- `local_operations`
- `local_operation_files`
- `local_analysis_runs`
- `local_operation_events`
- `local_sync_queue`
- `local_sync_attempts`
- `local_entity_registry`
- `local_settings`

This is a new design. The Flutter SQLite schema is reference material only.

## Unified intake

```text
Camera / File / Share Intent / future Notification Listener
  -> normalize input
  -> persist original locally
  -> create local operation
  -> enqueue local processing
  -> OCR
  -> deterministic candidates + evidence gate
  -> local result / human review
  -> durable sync when connectivity is available
  -> canonical cloud promotion/finalization
```

## Repository boundary

UI code that must support offline operation should not directly own Supabase persistence semantics. The target API is a domain/repository boundary such as:

```ts
operationRepository.create(...)
operationRepository.get(...)
operationRepository.list(...)
operationRepository.sync(...)
```

The repository coordinates local and cloud runtimes while keeping existing connected flows compatible during migration.

## Delivery sequence

0. Baseline and regression gates for current Camera/File/Share/QR/operation/analysis/report/push flows.
1. Domain and repository abstraction with no user-visible behavior change.
2. Local DB + durable file store.
3. Unified local intake.
4. Offline queue, idempotency, retry, recovery, and canonical sync contract.
5. OCR adapter benchmark on real devices and private corpus.
6. Deterministic candidate/evidence engine in TypeScript.
7. Gemini text-semantic integration where policy allows.
8. Human-review provenance.
9. Existing React UI becomes local-aware.
10. WorkManager/background sync.
11. Notification Listener / floating SANAD after foundation is stable.

## Superseded paths

- `feature/sanad-local-mvp` / PR #246 — closed, reference only.
- `feature/sanad-local-extraction-engine` / PR #238 — closed, reference/benchmark material only.
- `feature/sanad-fast-financial-engine` — historical branch; its PR #169 was merged to `main`.
- Active implementation branch: `feature/sanad-react-local-first`.

## Merge gate

Do not merge the local-first implementation to `main` until the affected TypeScript/build checks are green and real Android tests demonstrate document durability, restart/reconnect recovery, no duplicate cloud operation creation, and acceptable local OCR performance on representative Yemeni notices.

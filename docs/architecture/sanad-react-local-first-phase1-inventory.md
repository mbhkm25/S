# SANAD React Local-first — Phase 1 operation boundary inventory

Date: 2026-08-12
Branch: `feature/sanad-react-local-first`

## Goal

Introduce a single operation repository boundary without changing current production behavior. Cloud remains the only enabled runtime until durable local storage, recovery, and sync idempotency are verified.

## Direct operation-data hotspots identified

The initial code audit found direct Supabase operation access in these user-facing paths:

- `src/components/Upload.tsx`
  - uploads the original file to `operation-files`;
  - inserts the `operations` row directly;
  - triggers `sanad-v3-app-trigger-analysis`;
  - probes `open_operation_access` before opening details.
- `src/components/ShareIntake.tsx`
  - creates operation records from Android/app share intake.
- `src/components/MyOperations.tsx`
  - reads the user's operation list directly.
- `src/components/Home.tsx`
  - reads recent operation data for the home screen.
- operation detail/runtime and business payment inbox components contain operation reads/actions that must be classified separately as canonical cloud actions versus offline-capable repository reads.

## Boundary introduced

New TypeScript modules:

- `src/features/local-first/contracts.ts`
- `src/features/local-first/operationRepository.ts`
- `src/features/local-first/cloudOperationRepository.ts`
- `src/features/local-first/operationRepositoryRuntime.ts`

The repository contract now owns the future distinction between `cloud`, `local`, and `hybrid` modes.

## Safety decisions

1. Runtime mode is hard-wired to `cloud` during Phase 1.
2. Selecting `local` or `hybrid` before implementation fails closed instead of silently uploading to Cloud.
3. The Cloud repository preserves current semantics: original-file upload, canonical `operations` row creation, analysis trigger, and access readiness probe.
4. SHA-256 of the prepared file is computed at the repository boundary and added to client metadata as groundwork for local identity and sync idempotency.
5. No production database migration, Edge Function change, or deployment is part of this phase.

## Migration sequence

1. Wire `Upload.tsx` to the repository while preserving exact existing UI states and error copy.
2. Wire `ShareIntake.tsx` to the same create contract.
3. Add read methods for recent/list/detail views and migrate `MyOperations.tsx` and `Home.tsx`.
4. Classify operation-detail mutations: keep canonical server actions behind cloud command methods; do not pretend they are offline-safe.
5. Add Local DB/file implementation only after the Cloud-backed migration is regression-clean.

## Exit gate for Phase 1

- TypeScript check passes.
- Web build passes.
- Android build passes.
- Upload and Share flows produce the same canonical Cloud operation as before.
- No production routing, analysis, QR, report, push, or business inbox behavior changes.

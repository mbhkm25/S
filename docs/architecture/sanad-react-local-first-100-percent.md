# SANAD React Local-first — 100% implementation milestone

Date: 2026-08-12
Branch: `feature/sanad-react-local-first`
PR: #247

## Meaning of 100%

This milestone means all planned architecture/implementation phases in ADR-002 (0–11) now have an implemented code path. It does **not** mean the branch is approved for production rollout. The PR remains Draft until real-device acceptance, OCR-provider benchmarking, privacy/permission UX validation, and destructive recovery scenarios are exercised on representative Android devices.

## Implemented phases

0. Baseline/regression gates for the existing React + Capacitor product.
1. Operation repository/domain boundary.
2. Durable local operation/file/event/sync storage.
3. Unified local intake.
4. Offline queue, retry, recovery contract, and cloud promotion.
5. Replaceable OCR adapter + benchmark framework.
6. Deterministic financial candidates + evidence/grounding engine.
7. Gemini text-semantic escalation using OCR text/candidates, with local grounding after the response.
8. Human-review provenance and revision semantics.
9. Local-aware React runtime UI: offline state, durable local file intake, queued/syncing/synced/review feedback, and Android Local settings surface.
10. Android WorkManager recovery sentinel + foreground/resume queue draining without bypassing the React repository/idempotency contract.
11. Opt-in Android NotificationListener + per-package allow-list + privacy-preserving app discovery + optional floating SANAD overlay + notification-to-local-operation intake.

## Cloud sync idempotency

Local retries now carry a stable `sync_idempotency_key`. Production has a partial unique index on `operations.client_upload_metadata->>'sync_idempotency_key'`. The Cloud repository first reuses an already-committed canonical operation and also handles a unique-race (`23505`) by removing the losing orphan upload and reusing the winner.

Invariant: a retry/reconnect race must not create a second canonical Cloud operation for the same local operation.

## Android privacy model

Notification monitoring is fail-closed:

- Notification Listener access requires explicit Android permission from the user.
- The monitored-package set is empty by default.
- Before a package is selected, SANAD stores only package/app-label/last-seen discovery metadata; it does not retain notification title/text/bigText.
- Notification content is captured only for packages explicitly selected by the user.
- Floating overlay requires a separate Android overlay permission.
- Low-confidence/ambiguous local analysis does not silently upload an image solely to improve OCR.

## Recovery model

The durable local payload remains owned by the React Local-first store. Android WorkManager therefore does not independently upload or mutate operations. It records a durable recovery signal when connectivity is available. On foreground/resume, the React runtime consumes that signal and drains the canonical sync queue.

This preserves one sync contract and avoids competing Android/React writers.

## Quality gates at the milestone head

Milestone head before this document: `c70857538eed6bebc4aa83a50dab07f94096cae2`.

Green on that head:

- SANAD Local-first quality #46
- Production quality gate #1440
- Build SANAD Android APK #402
- Supabase migration history integrity #84
- Supabase baseline cutover layout #62

The server-side local-sync idempotency migration was also applied successfully to production after confirming no duplicate existing sync keys.

## Production acceptance gates still required

Do not convert PR #247 from Draft or merge it solely because the implementation milestone is 100%. Before rollout, verify on real Android hardware:

1. Offline capture/save -> force-stop app -> restart -> original document remains available.
2. Offline queue -> reconnect -> exactly one Cloud operation is created.
3. Repeated/concurrent retry -> no duplicate Cloud operation and no orphan Storage object.
4. Notification permission disabled -> zero captured notification content.
5. Permission enabled but package unselected -> discovery metadata only, zero notification content.
6. Selected financial app -> notification is captured, local candidate is created, and floating SANAD appears only when overlay permission is granted.
7. Floating SANAD -> opens the correct pending local notification flow.
8. Human corrections survive restart/sync and are not overwritten by later automated revisions.
9. OCR provider benchmark on the private Yemeni corpus and representative devices before enabling image OCR as a production default.
10. APK size, startup latency, battery/background behavior, and memory regression measurements.

## Rollout position

Architecture implementation: **100%**.
Production acceptance: **pending real-device UAT/benchmark**.
Production rollout: **not authorized yet**.

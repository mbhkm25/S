# Instant Intake & Event-Driven Pipeline — implementation plan

- Branch: `agent/instant-intake-event-pipeline`
- Architecture: [ADR-001](../architecture/ADR-001-instant-intake-event-driven-pipeline.md)
- Production audit: [2026-08-06 current-state audit](./operation-pipeline-current-state-audit-2026-08-06.md)
- Status: In progress; no production phase declared complete

## Local implementation snapshot — 2026-08-06

All six delivery phases now have tracked branch implementations, but their exit gates remain open until database-branch, CI, real-path, and production-metric evidence exists:

| Phase | Branch implementation | Remaining proof |
| --- | --- | --- |
| 0 — Audit/release controls | ADR, live audit, validation-only PR workflows, one guarded `main` deployment workflow; four one-off workflows removed | PR review and hosted CI |
| 1 — Instant Intake | Durable journal, deterministic storage path, transactional finalization, message-ID uniqueness, batched QR completion/telemetry, QR/link compatibility | Hosted CI and signed real Meta media/QR path |
| 2 — Analysis dispatch | One queue, canonical states, bounded retries, stale recovery, leased immediate dispatch and drain chaining | Hosted CI and authenticated worker invocation with branch-only test credentials |
| 3 — Preview | Canonical queue, claim-token fencing, immediate dispatch, read-only access endpoint | Image/PDF failure measurements; no lane split until evidence |
| 4 — Routing/inbox | One completion trigger, quality gate, exact-first coordinator, one-operation inbox uniqueness | Routing parity fixtures with representative business configuration |
| 5 — Notifications | One outbox/worker, phone and user recipients, delivery webhook, service-window enforcement | Meta retry/permanent-error tests and approved-template verification |
| 6 — Observability/load | Queue/stage P50/P95/P99, error/retry/fallback/depth/age/throughput/suppression, SQL and load harnesses | Branch SQL/load artifacts recorded; production sample remains required |

## Delivery principles

- Preserve the original document before any enrichment.
- One durable execution source per function.
- Database invariants, leases, and idempotency replace process-local assumptions.
- Immediate dispatch optimizes latency; the durable queue and recovery path provide correctness.
- Pull requests validate; only `main` deploys production.
- Every phase records tests and production measurements in GitHub and Notion before completion.

## Phase 0 — provenance, audit, and release controls

### Work

- Commit the production audit, ADR, and this plan.
- Convert production Edge Function workflows to PR validation plus guarded deployment from `main`.
- Add a migration/source parity check for the pipeline's required functions, triggers, and queue contracts.
- Record known live-only function and migration-history drift; reconcile through idempotent tracked migrations rather than editing migration history in place.

### Exit gate

- No pipeline workflow deploys from a pull request or feature branch.
- CI checks every touched Edge Function and SQL contract.
- The tracked reconciliation migration is safe on the current production schema and on a clean test database.

## Phase 1 — Instant Intake and transactional finalization

### Schema

- Add durable WhatsApp intake journal with unique source message key, `pipeline_run_id`, stage, lease, bounded attempts, webhook envelope, storage result, operation result, and terminal error.
- Add explicit `pipeline_run_id` linkage to operations without changing existing public-token or original-file behavior.
- Add service RPCs to claim/reclaim an intake and to finalize operation, uploader link, canonical events, analysis job, and preview job in one transaction.
- Make storage path deterministic from the message key and MIME extension.

### Edge Function

- Verify signature before claiming the intake.
- Fail closed by default when `META_APP_SECRET` is absent; production deploy
  must prove the secret exists and reject an unsigned smoke request.
- Claim idempotency before Meta media lookup/download.
- Let the operation trigger and onboarding queue exclusively own supported-media
  contact capture/onboarding; Intake must not duplicate either path.
- Remove `ANALYZE_URL`, `TRIGGER_ANALYSIS`, `triggerAnalysis`, the analysis promise, and post-analysis guidance from intake.
- Process the bounded intake path directly and return after QR/link delivery; do not use `waitUntil` as the workflow guarantee.
- Persist enough state before external work that a timeout or worker termination is recoverable.
- After Meta acceptance, use one completion RPC for the journal checkpoint, QR
  event, and successful-path span batch. Telemetry failures must be isolated
  from the completion checkpoint.
- Preserve the current URL/QR payload and public-token contract.

### Tests

- Same message ID sequentially and concurrently: one journal, object path, operation, analysis job, and preview job.
- Failure after upload and before finalization: reclaim finalizes the existing object.
- Finalization RPC rollback: no partial operation event/link/job state.
- QR failure: original operation and public link remain available.
- Unsigned webhook: `403`, no journal claim, no queue work, and no Meta call.
- Successful completion: one QR event and five intake spans from one RPC; a
  duplicate completion cannot create another event.
- Verified operations and all original file fields remain unchanged by later analysis.

### Performance gate

- Supported-media intake excluding analysis: P95 <= 12s and P99 <= 18s on the agreed real-path sample.
- Transactional finalization: P95 <= 750ms.
- Original-document loss: 0.
- Duplicate operation/job creation: 0.

## Phase 2 — Immediate dispatch and canonical analysis queue

### Work

- Reconcile and harden `operation_analysis_jobs` under tracked migration history.
- Add dispatch leases and a generic immediate-dispatch request function.
- Dispatch only when due work exists; coalesce concurrent signals.
- Preserve bounded exponential backoff with jitter, fencing worker ID, lease expiry, stale recovery, and dead-letter state.
- Re-dispatch while due depth remains after a claimed batch.
- Reduce analysis cron to recovery/backstop semantics.
- Route app and WhatsApp creation through the same enqueue contract.

### Tests

- Immediate signal reaches worker once under concurrent enqueue pressure.
- Simulated lost `pg_net` signal is recovered by cron.
- Worker termination after claim is recovered after lease expiry.
- Primary failure retries within limit; exhausted work dead-letters.
- Primary is the only direct caller of the legacy fallback.

### Performance gate

- Analysis queue wait P95 <= 3s when immediate dispatch is healthy.
- Empty-queue worker HTTP calls reduced by at least 95% from the audit baseline.
- Queue metrics report P50/P95/P99 wait and execution separately.

## Phase 3 — Preview pipeline

### Work

- Migrate preview states to the canonical queue lifecycle without losing completed preview metadata.
- Preserve enqueue/start/complete timestamps, leases, worker fencing, retry class, and error code.
- Remove synchronous worker waiting from preview access; return availability and retry hints only.
- Add immediate leased dispatch and cron recovery.
- Keep one worker initially, with measured MIME labels and capacity controls.

### Split decision gate

Split image and PDF lanes only if production measurements show either:

- material head-of-line blocking that breaches preview SLOs; or
- materially different execution/error behavior requiring independent concurrency or dependencies.

The current snapshot does not meet this evidence threshold.

## Phase 4 — post-analysis quality gate, routing, and payment inbox

### Work

- Enqueue one post-analysis job after persisted analysis completion.
- Add one coordinator that evaluates exact identifiers first and broader routing second without downloading or re-analyzing the file.
- Retire competing automatic routing triggers after parity/replay tests.
- Enforce one automatic payment-inbox projection per operation and retain idempotent event/notification creation.
- Keep manual verification and the `verified` state as explicit audited business actions.

### Tests

- Replayed analysis completion creates at most one routing job and one inbox item.
- Exact and broader routing disagreement follows documented precedence.
- Concurrent routing cannot project the same operation to two businesses.
- Missing/ambiguous identifiers create no automatic inbox row and do not affect original access.

## Phase 5 — unified transactional notifications

### Work

- Evolve the existing outbox to support user and normalized-phone recipients, interactive/template payloads, canonical queue state, lease/retry/dead-letter, and `pipeline_run_id`.
- Move sender unmatched/analysis-failed guidance out of intake.
- Consolidate business-review and other transactional triggers into one enqueue function.
- Run one internally authenticated worker with immediate dispatch and cron recovery.
- Record delivery state before optional telemetry and make Meta delivery webhooks idempotent.

### Tests

- A sent message cannot be retried because an event write failed.
- Concurrent notification events create one outbox row per idempotency key.
- Invalid Meta payload dead-letters after bounded attempts with a stable error code.
- Service-window and template rules are enforced without dropping the operation or original link.

## Phase 6 — observability, load, and failure validation

### Work

- Add admin/operations metrics for depth, oldest due age, throughput, P50/P95/P99 wait and execution, errors, retries, fallback, dead letters, duplicate suppression, and lease recovery.
- Add deterministic load and failure harnesses that contain no financial samples or secrets.
- Record release SHA and engine/pipeline versions in spans.

### Required scenarios

1. Concurrent duplicate webhook burst.
2. Meta lookup/download timeout and retry.
3. Storage succeeds while database finalization temporarily fails.
4. Immediate dispatch signal is lost.
5. Analysis worker crashes after claim.
6. Primary analyzer fails and legacy fallback succeeds/fails.
7. Preview dependency times out for image and PDF.
8. Routing is ambiguous or produces competing candidates.
9. Outbox worker receives a retryable and a permanent Meta error.
10. QR delivery fails while the original link remains usable.

## Merge and production sequence

1. Run static checks, Deno checks/tests, SQL tests, migration replay, application type-check/build, and load/failure tests on the branch.
2. Publish the branch and open a focused PR with migration order, rollback boundary, and measured evidence.
3. Require CI success and review; do not deploy from the PR.
4. Squash merge to `main`.
5. Apply tracked migrations and deploy Edge Functions from the exact `main` SHA.
6. Run a real supported WhatsApp path and verify original access, one operation/job chain, QR/link behavior, and downstream recovery.
7. Read production metrics and logs; only then update the phase to complete in Notion.

## Rollback boundaries

- Additive schema and compatibility RPCs ship before callers.
- Old triggers remain disabled only after the new coordinator is healthy; rollback re-enables the prior trigger set without deleting queue history.
- Immediate dispatch can be disabled independently while cron backstop remains.
- Primary fallback remains centrally available during rollout.
- No rollback deletes original objects, operations, public tokens, events, jobs, inbox history, or outbox history.

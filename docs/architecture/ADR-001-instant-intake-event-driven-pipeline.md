# ADR-001: Instant Intake & Event-Driven Operation Pipeline

- Status: Accepted for staged implementation
- Date: 2026-08-06
- Production baseline: `main@b4af81e6370357fd4798dd6f747767f072bf8888`
- Supabase project: `hudbzlgclghlhazlduas`
- Implementation branch: `agent/instant-intake-event-pipeline`

## Context

SANAD's primary contract is to receive the original financial notification, preserve it, and make it available through the public link and QR code. The original document is the source of truth. Analysis, preview generation, routing, payment inbox projection, and notifications are operational aids; none may block preservation or access to the original, and none represents bank verification.

The production audit found that the current pipeline does not have one coherent execution path:

- WhatsApp intake calls `sanad-v3-analyze-operation` directly and waits for it together with QR delivery inside a background `waitUntil` task.
- The new `operational-primary-v1` engine is reached through `operation_analysis_jobs`, but only the app analysis gateway enqueues those jobs. There is no production trigger from `operations` to that queue, and the live queue contained zero rows at the audit snapshot.
- Operation insert, uploader link, and operation events are separate HTTP writes rather than one database transaction.
- WhatsApp idempotency is a read-before-write lookup on `storage_metadata.meta_message_id`; no unique constraint enforces it.
- Preview work is trigger-enqueued, cron-dispatched every minute, and may also be kicked synchronously by the preview access endpoint.
- Exact-identifier routing and routing-shadow rollout are both automatic inbox writers.
- Sender guidance is sent directly by intake after analysis, while other messages use an inactive transactional outbox. A post-send event constraint failure caused successfully submitted guidance to be recorded as failed.
- Several deployment workflows deploy production Edge Functions from pull requests or a feature branch rather than exclusively from `main`.

These findings require an architectural boundary, not a URL substitution or a faster cron interval.

## Decision

### 1. Preserve first; enrich later

The intake path may fail only before the original is durably stored. Once storage and operation finalization succeed, analysis, preview, routing, inbox, and notification failures must be isolated and recoverable.

`verified`, `file_bucket`, `file_path`, `public_token`, original metadata, and all original-document access behavior remain backward compatible. Analysis functions may enrich an operation but may not replace or invalidate the original document.

### 2. Durable WhatsApp intake journal and database-enforced idempotency

A durable intake journal will reserve `WhatsApp message_id` before media lookup. The journal uses a unique source key and records `pipeline_run_id`, the signed webhook envelope, lease state, attempt count, stage, and terminal result.

Storage paths become deterministic from the source message key. Concurrent delivery of the same webhook must produce one journal row, one operation, one analysis job, and one preview job. A stale reservation is reclaimable by lease; an already finalized reservation returns the existing operation without creating new work.

Meta signature verification is fail-closed by default and precedes the journal
claim. Production deployment is blocked unless `META_APP_SECRET` exists and an
unsigned smoke request is rejected. Supported-media intake performs no contact
or onboarding side effect before the claim; the existing operation trigger and
durable onboarding queue are the single owner of that work.

### 3. One transactional operation-finalization RPC

A security-definer service RPC will atomically create or resolve:

- the operation with all original-document fields;
- uploader relationship;
- canonical `operation.created` and `file_uploaded` events;
- one analysis job;
- one preview job when the MIME type is supported;
- the intake journal's finalized state and `pipeline_run_id` linkage.

Storage and PostgreSQL cannot share one physical transaction. The durable journal therefore bridges them: claim, deterministic upload, and transactional finalization. A database failure after upload leaves a recoverable journal and an intact object rather than a lost document.

After Meta accepts the QR, Intake makes one completion RPC. The RPC commits the
journal checkpoint and, in exception-isolated subtransactions, records the QR
event and the successful-path span batch. Optional telemetry cannot roll back
Meta acceptance, and Intake does not wait on separate post-QR telemetry calls.

### 4. Durable queues are the guarantee; immediate dispatch is only a signal

Analysis, preview, post-analysis routing, and notification work are represented by durable rows. Enqueue requests an immediate worker dispatch through `pg_net` after transaction commit.

Each queue has a short database dispatch lease so concurrent enqueues coalesce into one signal. Dispatch occurs only when due work exists. A worker that exhausts its batch and sees more due work requests the next dispatch. `pg_cron` remains a low-frequency recovery/backstop path and stale-lease sweeper, not the primary execution source.

Because `pg_net`'s request queue is not itself the durable business queue, losing a network signal cannot lose work.

### 5. Canonical queue lifecycle

All operational queues expose the same lifecycle:

`queued -> processing -> completed`

Recoverable errors transition to `retry_scheduled` with bounded exponential backoff and jitter. A non-recoverable error transitions to `failed`; exhausted retryable work transitions to `dead_letter`. Processing claims use `FOR UPDATE SKIP LOCKED`, a fencing worker ID or claim token, and an expiring lease. Stale jobs are recovered only after lease expiry, and a stale claimant cannot commit after ownership has moved.

Attempt counts are finite. Manual retries create an audited transition and do not erase prior attempt history.

### 6. The primary analyzer is the only analysis entrypoint

WhatsApp intake will not call any analyzer. All channels enqueue the same analysis queue. `sanad-operation-analysis-worker` invokes `sanad-operation-analysis-primary`; the primary function is the only component allowed to invoke the legacy analyzer as a technical fallback.

Fallback is recorded explicitly with engine, reason, duration, and rate. Routing consumes the persisted analysis result and never downloads or analyzes the original again.

### 7. One post-analysis coordinator and one automatic inbox projection

`analysis.completed` enqueues a post-analysis quality-gate job. One coordinator owns the ordered routing policy:

1. validate the persisted analysis contract and original-document invariants;
2. evaluate exact typed identifiers first;
3. evaluate the broader routing strategy only when the exact route does not produce a unique eligible target;
4. project at most one business payment inbox item;
5. enqueue the appropriate sender/business notifications.

Existing automatic routing triggers will be retired after compatibility tests. A database uniqueness invariant on the operation projection prevents two businesses from receiving automatic inbox rows for the same operation. Manual verification remains an explicit audited workflow, not a competing automatic writer.

### 8. One transactional outbox and one worker for subsequent messages

The existing transactional outbox will be evolved into the canonical subsequent-message queue. It will support both user-backed recipients and an explicitly normalized service-window phone recipient, template and interactive payload kinds, canonical queue states, lease recovery, bounded retries, dead-lettering, and `pipeline_run_id`.

QR/link delivery remains part of intake because it is the product's immediate acknowledgement. All post-analysis guidance and business follow-up messages use the outbox. QR completion and outbox delivery state are committed before or independently from non-critical telemetry so a telemetry constraint cannot turn a sent message into a retryable duplicate.

The worker accepts only the internal worker credential/service role for automatic dispatch. Platform-admin authentication remains for inspection and audited manual retry, not worker execution.

### 9. Preview stays one measured queue initially

The current dataset does not justify separate image and PDF workers: historical jobs do not preserve claim/completion timing, PDF had no terminal failures in the snapshot, and JPEG accounted for the observed terminal failures. The first change is to add immutable queue-wait and execution timing, MIME labels, leases, and canonical states.

The preview access endpoint is read-only with respect to queue execution: it returns current availability and retry hints and never invokes or waits for the worker. Image and PDF lanes will be split only when production measurements show material head-of-line blocking or materially different capacity/error behavior.

### 10. End-to-end observability

One `pipeline_run_id` is persisted on the intake journal, operation, events, jobs, outbox records, and spans. Queue wait (`started_at - enqueued_at`) and execution time (`completed_at - started_at`) are distinct.

Operational metrics include P50/P95/P99, error rate, retry rate, fallback rate, queue depth, oldest due job age, throughput, duplicate suppression, lease recovery, and dead-letter count. Webhook claims, outbox dedupe keys, and dispatch leases keep explicit suppression counters. Metrics are grouped by pipeline, queue, MIME/engine, source channel, and release SHA where applicable.

### 11. Production deploys only from `main`

Pull requests validate and test. They do not deploy production Edge Functions or apply production migrations. Production deployment workflows check out a full commit that is an ancestor of current `main`, deploy tracked migrations/functions, and verify the deployed source and schema afterward.

## Consequences

### Positive

- The original document is preserved independently of every enrichment layer.
- WhatsApp and app uploads use one analyzer path and one fallback owner.
- Duplicate webhooks and concurrent dispatches are database-safe.
- Queue latency and worker execution become separately diagnosable.
- Cron traffic drops from unconditional worker calls to recovery-only checks.
- Routing and notifications gain explicit ownership and replay semantics.

### Costs and trade-offs

- Intake requires a durable journal because storage and PostgreSQL are not one transaction.
- Queue schema and notification compatibility require staged migrations rather than a flag-only rollout.
- Existing routing triggers cannot be removed until replay and parity tests pass.
- Immediate QR delivery still depends on Meta availability; failure is recorded and retryable without affecting the original document.
- QR delivery cannot be made transactionally atomic with the database. If Meta accepts the message but the intake completion checkpoint fails, a retry may deliver a duplicate QR acknowledgement. The journal makes this window observable and bounded, but it does not claim external exactly-once delivery. The stored original, operation, token, and public link remain authoritative and idempotent.

## Rejected alternatives

- Repointing `ANALYZE_URL` while keeping direct analysis in intake.
- Treating `waitUntil` as the durable workflow mechanism.
- Increasing cron frequency or worker batch size without queue measurements.
- Running two analyzer, preview, routing, inbox, or notification writers for redundancy.
- Unlimited retries.
- Applying untracked production DDL or leaving feature-branch deployment workflows in `main`.

## Validation gates

No phase is complete until its tests and production measurements are recorded. In particular:

- concurrent replay of one WhatsApp message creates exactly one original object, operation, analysis job, and preview job;
- forced analyzer, preview, routing, notification, and dispatch-signal failures do not remove or block the original link;
- worker crash and lease expiry recover without double completion;
- loss of an immediate `pg_net` signal is recovered by the cron backstop;
- a real supported WhatsApp document preserves its original fields and link/QR contract;
- P50/P95/P99 and error/retry/fallback/duplicate metrics are read after deployment from `main` before declaring success.

# Operation Analysis Queue

## Purpose

The operation analysis queue protects SANAD from traffic bursts by separating request intake from Gemini-backed analysis. An upload is acknowledged after the operation is persisted and queued; analysis is performed by a controlled background worker.

## Architecture

1. `sanad-v3-app-trigger-analysis` validates the authenticated caller and operation access.
2. The gateway calls `enqueue_operation_analysis` with the service role.
3. `private.operation_analysis_jobs` stores one active job per operation.
4. `pg_cron` calls `private.dispatch_operation_analysis_jobs()` once per minute.
5. The dispatcher invokes `sanad-operation-analysis-worker` through `pg_net` with a dedicated worker token.
6. The worker claims up to five jobs atomically with `FOR UPDATE SKIP LOCKED`.
7. Claimed jobs call the canonical `sanad-v3-analyze-operation` function.
8. Jobs end in `completed`, `retry_scheduled`, `failed`, or `dead_letter`.

## Job states

- `queued`: ready for first processing.
- `processing`: leased to a worker.
- `retry_scheduled`: transient failure, waiting for `available_at`.
- `completed`: operation analysis completed successfully.
- `failed`: permanent failure.
- `dead_letter`: retryable failure exhausted the configured attempts.
- `cancelled`: administratively cancelled.

## Reliability controls

- Atomic claim with `FOR UPDATE SKIP LOCKED`.
- Unique partial index preventing duplicate active jobs per operation.
- Worker leases and automatic stale-job recovery.
- Three attempts by default.
- Backoff: approximately 20 seconds, 2 minutes, then 10 minutes, with jitter.
- Retryable HTTP statuses: 408, 409, 425, 429, and selected 5xx responses.
- Worker authentication through `private.sanad_worker_tokens`.
- Queue functions are executable only by `service_role`.
- Queue table is in the private schema with RLS and no client grants.

## Concurrency

The first production setting is five jobs per dispatcher invocation. This is intentionally conservative and should be increased only after measuring Gemini rate limits, operation latency, error rate, database load, and queue age.

## Health RPC

`get_operation_analysis_queue_health()` returns:

- queued
- retry scheduled
- processing
- failed
- dead letter
- completed in the last 24 hours
- age of the oldest waiting job

## Operational acceptance criteria

A burst test is successful when every submitted operation is durably recorded, no active job is duplicated, interrupted jobs recover automatically, retries are bounded, failures remain observable, and the application remains responsive while analysis continues.

## Production deployment

- Migration: `20260805131100_add_operation_analysis_queue.sql`
- Worker: `sanad-operation-analysis-worker`
- Gateway: `sanad-v3-app-trigger-analysis`
- Cron job: `sanad-operation-analysis-dispatch`

# Operation pipeline validation record

- Branch: `agent/instant-intake-event-pipeline`
- Baseline: `main@b4af81e6370357fd4798dd6f747767f072bf8888`
- Supabase branch: `instant-intake-event-pipeline-20260806`
  (`hvvrzznizqndviwnaivd`)
- Status: local static and isolated-branch database/function gates passed; hosted
  CI, a signed real Meta/media path, pull-request review, exact-main deploy, and
  production measurement are not complete. Production deployment is also
  blocked until the correct Meta App Secret is configured.

## Verified local results — 2026-08-06

- PostgreSQL 17 grammar parsing passed for the five new pipeline migrations,
  the existing same-day operational-shadow migration, and five SQL contract /
  integration files: 11 files and 387 statements total.
- YAML parsing passed for every remaining GitHub workflow.
- Deno formatting passed for the touched Edge Functions.
- Deterministic intake unit tests passed: 3 passed, 0 failed.
- Application TypeScript check and production build passed.
- Route contract checks passed: 19 application routes and 17 email action entrypoints.
- The load harness passes Node syntax validation and `git diff --check` passes.
- Static invariants confirm that WhatsApp intake contains no legacy analyzer,
  `waitUntil`, direct onboarding invocation, or per-span telemetry RPC; preview
  access contains no preview-worker invocation, and only the primary analyzer
  references the legacy analyzer URL.
- A static privilege audit found and corrected a missing revoke on the transactional delivery-status RPC; all new public/private security-definer functions now have an explicit privilege boundary.

The complete local `deno check` set was blocked when the runtime could not fetch
`@types/qrcode` from the npm registry. It remains a required hosted-CI gate.
This is an environment limitation, not a passing local result. Independently,
Supabase built and activated the exact source bundle of all seven changed Edge
Functions on the development branch.

## Verified isolated-branch results — 2026-08-06

- The billed development branch was created only after explicit approval of
  `$0.01344/hour`. It contains no production data and pipeline dispatch remains
  disabled.
- Supabase's automatic migration replay reported `MIGRATIONS_FAILED` before any
  new pipeline migration ran. The confirmed cause is historical migration drift:
  the repository starts after tables such as `profiles` and
  `subscription_plans` already existed in production, so it cannot reconstruct
  a fresh database from GitHub alone. The branch Postgres service remained
  healthy. A tracked, test-only 18-table contract baseline was used to test this
  change; it is explicitly forbidden from production deployment.
- All five pipeline migrations applied successfully after that contract baseline.
- Contract, instant-intake integration, routing/outbox integration, and
  failure/recovery integration tests passed. Every integration fixture ran with
  dispatch disabled and ended with `ROLLBACK`.
- The intake integration proves one completion RPC atomically marks Meta QR
  acceptance, creates exactly one `qr_created` event, and upserts five measured
  intake spans. Event/span failures are isolated inside the RPC and cannot roll
  back the accepted completion checkpoint.
- The failure suite verified bounded retry, jitter scheduling, lease expiry,
  stale-job recovery, exhaustion to dead letter, preview failure isolation,
  ambiguous routing with no inbox projection, outbox lease recovery, and
  WhatsApp service-window expiry.
- The routing/outbox suite verified exact-first routing, one idempotent inbox
  projection with score `1.0`, replay suppression, one routing job, outbox
  claim/sent/delivered/read transitions, retry scheduling, pipeline health, and
  rejection of a non-admin caller to the security-definer health RPC.
- A concurrent duplicate-claim burst delivered 82 requests before the connector
  itself saturated: one intake journal row won, `duplicate_claim_count=81`, and
  no duplicate operation was created. The deliberately expired lease recovered,
  the second owner finalized the intake, and cardinality remained exactly one
  operation, one analysis job, and one preview job. A later 20-request terminal
  replay burst increased suppression to `101` with the same cardinality.
- Connector wall time is not recorded as database latency because the connector
  serialized/rate-limited the burst. The valid in-Postgres transactional
  finalization benchmark over 100 synthetic operations was P50 `2.826 ms`, P95
  `3.739 ms`, P99 `6.127 ms`, average `3.041 ms`, and max `14.871 ms`. These are
  isolated-branch database numbers, not production intake numbers.
- Seven changed Edge Functions were deployed to the development branch. Every
  deployed file matched the local source exactly and every deployment was
  `ACTIVE`. WhatsApp intake v5 matched all three tracked files exactly and a
  safe unsigned request returned fail-closed `403` with
  `mode=not_configured`, rather than booting or touching a queue. Safe no-token
  smoke requests returned the intended `401` from all
  four workers and from both JWT-protected application endpoints; no queue item
  was claimed and no Meta call was made.
- That smoke test exposed two startup faults: the analysis and transactional
  workers previously required business credentials before authenticating the
  request. Credentials are now resolved only after authentication and durable
  claim ownership. Missing deployment configuration becomes a bounded retry for
  owned work instead of a runtime-wide boot failure.
- Production has an enabled `trg_capture_whatsapp_operation_contact` trigger
  and immediate/cron onboarding dispatch. Supported-media intake therefore no
  longer performs pre-claim contact registration or directly invokes the
  onboarding function; the operation trigger is the single owner and the
  message-id claim is the first database side effect.
- The QR success path no longer waits on separate event and telemetry HTTP
  writes. It performs one completion RPC after Meta acceptance; that RPC owns
  completion, QR event recording, and the successful-path span batch.

## Defects found by semantic execution and fixed in the tracked source

1. The intake finalizer passed an integer literal to a `smallint` analysis-job
   parameter.
2. The analysis claim RPC had ambiguous PL/pgSQL output-variable references.
3. A fresh preview queue lacked its worker-token seed.
4. Exact routing wrote score `100` into a production contract constrained to
   `0..1`; the canonical exact score is now `1.0`.
5. The test contract was missing the production partial uniqueness invariant for
   one active analysis job per operation.
6. Shared-branch queue fixtures could steal an integration claim; tests now
   transactionally defer pre-existing work and assert claim ownership explicitly.
7. Two Edge workers crashed at module load when downstream credentials were
   absent; credential resolution is now lazy and failure is recoverable.
8. Supported-media intake duplicated production contact/onboarding work before
   idempotency and after QR delivery; those direct paths were removed in favor
   of the existing operation trigger and durable onboarding queue.
9. Intake waited for multiple non-critical span/event requests after durable
   finalization and Meta acceptance; successful completion, QR event, and five
   spans now use one exception-isolated RPC.
10. Intake resolved unrelated Meta/assistant credentials at module load, so an
    unsigned request could fail with `500` before signature enforcement. Those
    credentials are now resolved only at their use sites; the branch smoke test
    proves an unsigned webhook receives `403`.

## Confirmed production release blocker

- Read-only production evidence shows Meta webhook signatures are not currently
  verified: 34 recent WhatsApp operations recorded
  `storage_metadata.meta_signature_mode=not_configured`; 34 older records were
  `not_recorded`. This is confirmed runtime evidence, not an inference from
  source.
- New intake defaults `REQUIRE_META_SIGNATURE` to true and therefore fails
  closed when `META_APP_SECRET` is absent. The guarded production workflow
  refuses deployment unless that secret name exists, sets the requirement
  explicitly, and verifies an unsigned POST returns `403`.
- The correct Meta App Secret must be configured by an authorized operator and
  a signed webhook must pass before production deployment. No credential was
  copied, inferred, or changed during branch testing.

## Security and performance advisors

- Production read-only catalog checks confirmed RLS is enabled on the relevant
  public operation, inbox, financial-account, outbox, rule, and telemetry tables.
  The branch advisor's `rls_disabled_in_public` errors are artifacts of the
  intentionally minimal test-only baseline, which does not copy production
  policies or grants.
- New private queues have RLS enabled, no client policies, and explicit revokes;
  the advisor reports this deliberate deny-by-default shape as informational.
- The pipeline-health security-definer RPC remains executable by authenticated
  users only so a platform administrator can use it, but its internal
  `is_platform_admin(auth.uid())` gate was tested to reject a non-admin with
  SQLSTATE `42501`.
- Newly added `pipeline_run_id` indexes are reported as unused on the fresh
  branch. They are required for cross-stage incident tracing and cannot be judged
  from a zero-traffic branch. No batch-size or index removal decision was made
  from this signal.

## Semantic database gate

Grammar validation does not prove table-column compatibility, trigger behavior,
RPC execution, privilege behavior, or concurrency. The SQL tests and load
harness therefore must run on an isolated Supabase branch before a commit is
presented as merge-ready. This branch was created after explicit confirmation of
its `$0.01344/hour` cost.

That isolated gate has now run and passed against the contract baseline. It does
not waive the migration-history repair, hosted-CI, real Meta/media, or production
gates.

## Test layers

1. Static architecture assertions reject direct legacy analysis and `waitUntil` in WhatsApp intake.
2. TypeScript and production build validate application compatibility.
3. Deno checks and unit tests validate Edge Function contracts.
4. PostgreSQL grammar parsing validates every new migration and SQL test.
5. `operation_pipeline_contract_baseline.sql` reconstructs only the existing
   relations needed for an ephemeral semantic CI database. It is not a product
   migration and must never be applied to production.
6. `instant_event_pipeline.sql` validates schema, privileges, triggers, uniqueness, cron backstops, and observability contracts.
7. `instant_event_pipeline_integration.sql` runs rolled-back service-role fixtures with dispatch disabled. It validates finalization replay, original fields, one analysis job, one preview job, canonical events, stale recovery, retry, dispatch-lease suppression, and outbox deduplication.
8. `operation_pipeline_routing_outbox_integration.sql` validates the quality gate,
   exact-first routing, one inbox writer, outbox lifecycle, delivery webhooks,
   retry, observability, and admin-only health access.
9. `operation_pipeline_failure_recovery_integration.sql` injects worker death,
   exhaustion, ambiguity, and service-window expiry across every background
   queue.
10. `operation-pipeline-db-load.mjs` sends a concurrent duplicate claim burst to an isolated Supabase branch, finalizes the winner, checks completed replay, injects a retryable failure, and prints P50/P95/P99 plus duplicate suppression.
11. Preview completion/failure RPCs require the current `claim_token`; the integration fixture rotates the token and proves that a stale worker receives `not_owned`.
12. Claiming work releases only the short dispatch-signal lease so `worker_drain` can continue immediately; job ownership remains separately fenced.

## Safety controls

- The load harness unconditionally refuses the production project reference;
  it has no environment-variable bypass.
- Integration SQL disables pipeline HTTP dispatch inside a transaction and rolls back all fixtures.
- No financial document sample, API key, access token, phone belonging to a user, or production row is embedded in a test.
- A Supabase development branch is required for semantic migration replay and concurrency testing.
- Production deploy remains manual, protected by the GitHub `production` environment, and checks out current `main` explicitly.

## Required branch commands

```bash
supabase db push --dry-run
supabase db push
supabase test db supabase/tests/instant_event_pipeline.sql
supabase test db supabase/tests/instant_event_pipeline_integration.sql
supabase test db supabase/tests/operation_pipeline_routing_outbox_integration.sql
supabase test db supabase/tests/operation_pipeline_failure_recovery_integration.sql
SUPABASE_URL=https://BRANCH_REF.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=... \
PIPELINE_TEST_CONCURRENCY=100 \
npm run test:pipeline:load
```

The exact branch command may vary with the available CLI authentication mode. Secrets must be passed through environment variables and never committed.

## Failure matrix

| Scenario | Expected durable result | Evidence required |
|---|---|---|
| Concurrent duplicate webhook | One claim winner, one operation, one analysis job, one preview job | Load JSON and SQL cardinality checks |
| Meta lookup timeout | Intake moves to `retry_scheduled`; no operation before original storage | Function log and journal row |
| Storage succeeds, finalization fails | Stored checkpoint reused; one later operation | Journal stage and object-path equality |
| Immediate signal lost | Due job remains; cron backstop dispatches it | Queue/cron timestamps |
| Worker dies after claim | Lease expiry moves job to retry or dead letter within budget | Attempt and lease history |
| Analyzer primary fails | Bounded retry or centrally recorded legacy fallback | Engine/fallback metadata |
| Preview dependency times out | Original link remains available; preview retries independently | Link check and preview job state |
| Ambiguous routing | No automatic inbox projection | Routing result and inbox count |
| Meta returns retryable/permanent error | Retry with jitter or terminal failure; never unlimited | Outbox attempts/error code |
| QR delivery fails | Operation/public token/original remain; intake retries only QR stage | Original-field query and intake stage |
| Meta accepts QR, completion checkpoint fails | Retry may send a duplicate QR; journal exposes the bounded uncertainty window while the original and link remain single and authoritative | Meta response, journal stage, operation/object cardinality |

## Release gates

- Supported-media intake excluding analysis: P95 <= 12 seconds, P99 <= 18 seconds.
- Transactional finalization: P95 <= 750 ms.
- Analysis queue wait: P95 <= 3 seconds under healthy immediate dispatch.
- Original-document loss: zero.
- Duplicate operations/jobs/inbox/outbox records: zero.
- Production metrics read after exact-main deployment: P50/P95/P99, error, retry, fallback, depth, oldest age, throughput, duplicate suppression.

No phase is marked complete from local checks alone.

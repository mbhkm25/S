# Edaa Cloud Replica + SANAD Agent ERP Incident Closure — 2026-09-20

Status: **Closed in Production**

This record captures the end-to-end field diagnosis and closure of the Edaa Cloud Replica / SANAD Agent ERP incident observed on the authorized shop workstation.

## Scope

Verified runtime path:

`Edaa Soft local SQL Server → SANAD Bridge (read-only) → Supabase logical replica → semantic ERP RPCs → SANAD Agent`

This incident was not a single bug. It exposed four independent correctness gaps that only became visible when the real workstation, Bridge durable state, cloud replica, and live Agent tool traces were examined together.

## Field workstation facts

Observed from the real Edaa workstation on 2026-09-20:

- Windows Task Scheduler task: `SANAD Bridge Agent`
- task action: Windows PowerShell running:
  - `C:\SANAD-DEV\bridge\windows\run-agent-cycle.ps1`
- local Bridge state:
  - `C:\ProgramData\SANAD\Bridge\bridge.db`
- runtime log:
  - `C:\ProgramData\SANAD\Bridge\logs\agent-cycle.log`
- SQL Server service:
  - `MSSQLSERVER` = Running
- active SQL process:
  - `sqlservr.exe`
- Edaa source label:
  - `20-06-2026  10.20.55 am`
- Edaa source key:
  - `edaa_v5:38d56e1f75be58480332e2ff1543cadb6eccb23c`
- logical snapshot cadence:
  - default `360` minutes
  - minimum `60` minutes
- Bridge mode remained **READ-ONLY toward Edaa**
- local sale reconciliation at the checkpoint:
  - watermark = `1350`
  - current max = `1350`
  - pending sale outbox = `0`

The Edaa manifest reported Microsoft SQL Server 2000 / 8.00.2039.

## Cloud snapshot facts

Previous completed logical snapshot:

`ae84cf09-0a3d-4656-abf6-2924c9e59d29`

Affected snapshot during the incident:

`2feea1cd-e061-4c74-be84-b9a1480800d9`

Final verified state of the affected snapshot:

- status: `completed`
- chunks: `234 / 234`
- discovered user tables: `142 / 142`
- materialized rows: `20,526`
- completed_at: `2026-09-20T06:36:04.835675Z`

Representative final source counts:

- `tblAccounts = 197`
- `tblCustomersInfo = 149`
- `tblSellInvoice = 1307`
- `tblSellInvoiceDetailes = 2360`
- `tblBuyInvoice = 103`
- `tblEntries = 2258`
- `tblEntriesDetails = 4594`
- `tblClassEntries = 1451`
- `tblClassEntriesDetailes = 5124`
- `tblUsersSessions = 310`

## Failure 1 — Agent ERP reads failed after customer resolution

The live Agent correctly resolved a real customer through:

`get_business_erp_customer_candidates_v1`

but then customer statement and replica-status reads failed inside:

`get_ai_erp_read_context_v1`

with:

`permission denied for table ai_financial_context_access_log`

### Root cause

The RLS policy was already correct and required:

`user_id = auth.uid()`

However, role `authenticated` did not have table-level `INSERT` privilege.

### Fix

Grant only the required privilege:

`GRANT INSERT ON public.ai_financial_context_access_log TO authenticated`

No broad table write access was added and the existing RLS boundary remained authoritative.

Tracked in:

`supabase/migrations/20260920015000_fix_ai_financial_access_log_insert_grant.sql`

## Failure 2 — replica status masked a valid completed snapshot

`get_business_erp_snapshot_status_v1` selected only the newest run.

If the newest run was still `uploading`, the contract returned `available=false` even when an earlier completed snapshot remained fully usable.

### Fix

The contract now separates:

- **readable truth** = latest completed logical snapshot
- **current activity** = optional `current_sync`

This prevents an in-progress refresh from making a valid completed replica appear unavailable.

After closure:

- `available=true`
- `status=completed`
- latest readable snapshot = `2feea1cd-e061-4c74-be84-b9a1480800d9`
- `current_sync=null`

## Failure 3 — logical snapshot idempotency collided across snapshot runs

The original raw-event uniqueness rule was effectively:

`source_instance_id + entity_type + source_record_id + revision`

That works for normal operational events, but not for periodic logical snapshots.

An unchanged logical snapshot chunk naturally reuses:

- the same `source_record_id`
- the same content hash / `revision`

across later snapshot runs.

### Observed symptom

Local SQLite reported:

- affected snapshot:
  - `234` chunks
  - all `234` locally marked `sent`

Cloud inspection initially showed only **one** raw event for the new snapshot.

That proved the local ACK state and cloud snapshot identity had diverged.

### Exact mechanism

For unchanged chunks, `accept_erp_event_v1` hit the existing unique key and returned a duplicate ACK referencing the prior snapshot event.

The Bridge interpreted HTTP 200 as successful delivery and marked the new snapshot chunk as sent locally.

The new baseline therefore lacked those chunks, and completion failed with:

`baseline_snapshot_missing`

### Fix

Split idempotency rules:

1. non-snapshot ERP events retain the original source/revision uniqueness behavior;
2. `erp_logical_snapshot_chunk` uniqueness additionally includes:
   - `integrity.baseline_public_id`

Tracked in:

`supabase/migrations/20260920021000_fix_logical_snapshot_idempotency_v1.sql`

This allows an unchanged table chunk to legitimately exist in multiple distinct snapshots.

## Failure 4 — false successful ACK after snapshot apply failure

The deployed ingest path could accept the raw event, then fail:

`apply_erp_logical_snapshot_chunk_v1`

but still return an overall HTTP success to the Bridge.

That behavior is unsafe for durable delivery because the sender may persist a successful local ACK even though the required cloud-side materialization failed.

### Fix

`sanad-erp-ingest-v1` now returns a failed HTTP response when logical snapshot application fails.

The Production function was deployed during the incident as:

- function: `sanad-erp-ingest-v1`
- deployed version: `4`

Tracked source:

`supabase/functions/sanad-erp-ingest-v1/index.ts`

## Safe field recovery

The existing `bridge.db` was preserved.

Before recovery:

- the scheduled task was paused;
- a backup of `bridge.db` and WAL/SHM files was taken;
- only the affected snapshot outbox was modified.

Exactly `234` rows for snapshot:

`2feea1cd-e061-4c74-be84-b9a1480800d9`

were moved from local `sent` back to `pending`.

The recovery explicitly did **not**:

- delete `bridge.db`;
- change Bridge identity;
- modify Edaa;
- rebuild Edaa records;
- reset unrelated operational outbox data.

## Durable retry behavior observed in the field

During replay, the workstation experienced intermittent transport errors and timeout exit codes.

Examples observed:

- Bridge exit `1` with:
  - `An error occurred while sending the request.`
- Bridge snapshot exit `5` with:
  - `Logical snapshot timed out; durable local state was preserved for retry.`

Despite those interruptions, successive scheduled cycles continued to make progress.

Observed cloud event counts increased through checkpoints such as:

- 37
- 52
- 74
- 172
- 204
- 234

This demonstrated that the durable outbox/retry design recovered safely without data loss.

A future resilience improvement may add more explicit HTTP retry/backoff inside the Bridge process, but this is not required to consider the incident closed.

## Agent verification on real Production data

Golden Eval was useful for tool-routing and behavioral quality, but it did not detect these Production contract/runtime failures because it runs against synthetic fixtures.

Live verification was therefore performed with the actual business authorization path.

Verified behavior:

- customer candidate resolution works;
- a resolved real ERP account can be passed to `erp_get_customer_statement`;
- the statement returns real semantic ledger data from the completed Cloud Replica;
- a validation sample for resolved `account_id=165` returned closing balance `3667.62 SAR`;
- `erp_get_replica_status` points to the new completed snapshot;
- the user then re-tested SANAD Agent and confirmed that the returned results were correct.

## Release / repository trail

Relevant pull requests:

- PR #326 — **Fix live ERP AI reads for completed snapshots**
- PR #327 — **Fix logical snapshot idempotency and false ACKs**

Both passed required Supabase checks and Production quality gate before merge.

Key tracked files:

- `supabase/migrations/20260920015000_fix_ai_financial_access_log_insert_grant.sql`
- `supabase/migrations/20260920021000_fix_logical_snapshot_idempotency_v1.sql`
- `supabase/functions/sanad-erp-ingest-v1/index.ts`

## Permanent operating rules

1. Edaa integration remains read-only toward Edaa.
2. A periodic snapshot must include snapshot identity in idempotency semantics.
3. Local `sent` is not enough evidence unless the ACK belongs to the same snapshot identity.
4. Never invalidate a completed readable replica merely because a newer sync is in progress.
5. Required cloud normalization/materialization failures must propagate as delivery failures.
6. Do not delete durable Bridge state as the first recovery action.
7. Back up `bridge.db` before any manual recovery.
8. Scope any manual outbox reset to one known snapshot.
9. AI ERP access must use semantic read contracts, never raw ERP rows.
10. Golden Eval must be complemented by live authenticated ERP contract tests and Production tool traces.

## Definition of Done for this incident

- [x] customer statement works from SANAD Agent
- [x] replica status works
- [x] latest snapshot is completed
- [x] 142 tables received
- [x] 20,526 rows materialized
- [x] 234 chunks acknowledged
- [x] audit-log privilege fixed with least privilege
- [x] completed-snapshot read semantics fixed
- [x] logical-snapshot idempotency fixed
- [x] false ACK behavior fixed
- [x] runtime verified under the real business authorization path
- [x] field user confirmed correct results
- [x] changes reconciled back into GitHub
- [ ] optional future hardening: explicit in-process HTTP retry/backoff tuning

# SANAD Bridge — immediate logical cloud refresh alongside periodic agent

**Status:** isolated implementation candidate (NOT deployed to shop workstation).  
**Scope:** reuse the existing authenticated, READ-ONLY Edaa Bridge agent; do not create a second importer or touch Edaa tables.  
**Primary incident:** customer account 122017 / deleted invoice #1221, SAR 250, issue #399. The latest independently inspected completed cloud snapshot was ~08:33 Yemen (2026-09-26) and the owner deleted #1221 in live Edaa at approximately 10:00.

## Operational contract

| Mode | Initiator | Pipeline | Full logical snapshot |
| --- | --- | --- | --- |
| Scheduled (existing) | Windows task `SANAD Bridge Agent`, minute cadence and logon | heartbeat → sale reconciliation → durable cloud sender → logical snapshot due-check | Defaults to every **360 min**, minimum interval **60 min** |
| Immediate (new) | Local operator on the AUTHORIZED Edaa shop workstation invokes `request-logical-snapshot-now.ps1` | **The exact same** `--agent-cycle` pipeline, protected by the existing Global/Local mutex | Explicit `--force-logical-snapshot` bypasses ONLY the full-snapshot due-time condition |

Manual and scheduled cycles never intentionally run concurrently; they use `BridgeAgentCycleCommand` single-instance mutex. A busy result (exit code 28) is retried **at most twice** with a 45-second delay by default; no manual cycle is started if the other execution remains busy. The forced snapshot resumes any in-progress durable local run, or starts a new one only when the prior run is complete. Existing authorization, source/schema fingerprint validation, 30-minute cloud upload timeout, durable chunk outbox and server acknowledgments remain authoritative. The Bridge must remain READ-ONLY toward Edaa, and the manual mode must NOT modify Task Scheduler configuration or the snapshot interval.

### First immediate execution on the actual shop workstation

For the currently installed Bridge executable built from code containing `--force-logical-snapshot`, the following **already-supported** command works without any code deployment and uses the existing mutex:

```powershell
& 'C:\SANAD-DEV\bridge\windows\Sanad.Bridge\bin\Debug\net48\Sanad.Bridge.exe' --agent-cycle --force-logical-snapshot
```

Run only on the authorized Edaa workstation under the interactive Windows user permitted to read Edaa. Do not run on the separate preview PC/laptop. Do not use the standalone `--logical-snapshot` entrypoint for this operation, as the agent-cycle entrypoint has the shared single-instance mutex.

When the candidate branch has been separately delivered to the shop PC, the wrapper is:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File 'C:\SANAD-DEV\bridge\windows\request-logical-snapshot-now.ps1'
```

It uses `run-agent-cycle.ps1 -ForceLogicalSnapshot`, writes to the same agent UTF-8 log under `%ProgramData%\SANAD\Bridge\logs\agent-cycle.log`, and treats existing exit code `24` (no new sales in local reconciliation) as an **eligible** success only after the operator verifies that the last-cycle log also reports successful snapshot acknowledgment.

**Avoid using `git reset --hard` on the active shop repository** just to obtain this wrapper. The direct existing binary command above is sufficient for the immediate issue. Integrate the wrapper into `main` only after code review and CI.

### Distinguish request, running, completed, fresh, matched

A successful command return is NOT itself financial parity. Inspect the final log and then verify that cloud `business_erp_baseline_runs` has a **new completed** `logical_backup` with completion after the deletion and the most recent snapshot's data handling for invoice #1221. Only then request the same customer account, dates, branch/filter and SAR statement through the existing authorization-checked read contract and compare it with the live Edaa report. The deletion should NOT be forced by a client heuristic or by editing the previous immutable source snapshot.

## Product action to implement independently (NOT in this Windows-only PR)

A visible **"تحديث النسخة الآن"** action in SANAD's business connection/replica-health surface must not attempt to run Windows code through a browser or unauthenticated endpoint. Secure architecture for a separate bounded integration PR:

1. Authenticated authorized business-owner/operator initiates a **durable, auditable** command with unique request ID, source/device identity, a short-lived execution window, rate limit, and explicit command type `erp_logical_snapshot_refresh`; surface last successful sync and distinguish requested/running/uploading/completed/failed/busy/offline.
2. The already authorized on-prem Bridge **polls** its own device-scoped pending commands using existing device proof, claims the work idempotently, and executes the same protected `--agent-cycle --force-logical-snapshot` route. Do not add cloud-executable shell or arbitrary arguments, bypass authorization, or change Edaa read-only contract.
3. Use an atomic job state transition and version/lease so retry, minute-level task and operator click are coalesced. The backend should report actual completed cloud snapshot ID and completed time **only from validated ingest materialization**, not from the click itself or the machine heartbeat.
4. Enforce owner/operator permissions, device binding, online/offline acknowledgement, inactivity expiry, bounded full-refresh cooldown and explicit audit. Never expose device identity material in the browser.
5. Separate developer unit/negative-role tests, actual Windows runtime tests, owner preview, backend migration and production release authorization. A browser action without the device polling and acknowledgment would be a misleading fake.

This remote workflow remains a separate design/implementation gate. The Windows script in this PR **does not claim** to deliver a remotely clickable action in the running SANAD web UI.

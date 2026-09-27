# SANAD Bridge — deterministic shop-computer upgrade and reconciliation
**Owner checkpoint:** 2026-09-27. **Target machine:** the authorized shop Windows computer running Edaa Soft; not a personal laptop.  
**Security:** Edaa connection remains READ-ONLY; existing ProgramData identity, SQLite WAL state, outbox and logs are PRESERVED. No arbitrary cloud commands are executed.

## 1. Root cause proven from the owner's Stage 1 transcript and actual main source

The owner built a clean **NET48 Release** in an isolated worktree at SHA `d4dc1b4aa9b44bd58bffa333e447d7b3f8687671`: file product version included that SHA, hash `D8CECB7E4B6E3AFF60AADED05F704CF408D7DB2E67E6290675D6A9A4FBCAF5EB`. The old repo `C:\SANAD-DEV` remained at `1704d5a4464ff9116a25510bf99e0f1d824913eb`, and its Debug binary reported product version pinned to substantially older `316bc48f33da84573cc7656a30debcfd25c2389d` with hash `391A09E3532E1E2BD9FCDBCF2AE92693C1527E7BB36868D710AD8211141C9DAA`. A successful isolated build **does not modify** the installed task or any old Debug executable.

Current main's **old scheduled runner default** used `C:\SANAD-DEV\bridge\windows\Sanad.Bridge\bin\Debug\net48\Sanad.Bridge.exe`. Therefore merely checking out or building the new Release does not put it into scheduled service. Owner's `Get-ScheduledTask` showed **State=Running**, **LastResult=267009**, last/next run one minute apart. `267009 = 0x41301 = SCHED_S_TASK_RUNNING` is a scheduler informational running indication, **not a proven agent error**. A full task action/runner path check is still required locally; do not mistake an inferred default for a verified installed task action.

The two source changes to deploy are specifically `5f6051c` (owner on-demand READ-ONLY logical snapshot within the existing periodic agent) and `afb1e9b` (heartbeats outside mutex must not claim owner remote requests). Their backend auth/claim/replay and UI checks were already merged earlier; no API/schema migration or Edaa write is necessary just to upgrade this machine.

## 2. Fix implemented in source

- The installed agent runner `bridge/windows/run-agent-cycle.ps1` now defaults to its **sibling `app\Sanad.Bridge.exe`**. The stable live runner is located at `%ProgramData%\SANAD\Bridge\runtime\active\run-agent-cycle.ps1` with a complete copied Release output in sibling `app`. This removes accidental coupling to the old repository Debug build.
- The existing one-time `request-logical-snapshot-now.ps1` now uses this same active runtime/runner by default. It keeps the existing shared Bridge mutex and does not alter the periodic schedule.
- New `bridge/windows/install-shop-upgrade.ps1` requires full approved Git SHA and **exact SHA match to a clean isolated worktree**. It restores/rebuilds Release first; verifies `ProductVersion` includes that SHA and SHA256 output integrity; compares existing Scheduler principal to current signed-in account, refuses unexpected/custom/disabled tasks and requires elevation with the same original identity. Preflight does **not stop the task**.
- After explicit `-Confirm` authorization, it exports the original task XML into an admin-private backup, disables and gracefully stops the old task, waits up to 330 seconds for every running `Sanad.Bridge.exe` to exit, and **refuses to force-kill any process**. When quiescent, it copies **all** Release dependencies to a versioned location and then a stable active runtime, tightens ACLs, checks binary SHA256 and `--agent-health` using the **current same Windows/DPAPI user** (code `29` is allowed pending-outbox warning), then runs the existing, reviewed hidden VBScript Scheduler installer with the stable active runner. It verifies Task Scheduler actually references both installed script paths and retains the previous principal. Logon+minute triggers and `IgnoreNew` are inherited from existing installer. The installer corrects another confirmed mismatch: the previous **5-minute Task Scheduler hard timeout** was shorter than the logical snapshot's **30-minute cloud timeout**. The reviewed installer now uses a bounded **45-minute** task timeout without changing its 1-minute trigger or IgnoreNew policy. This avoids terminating a legitimate long owner refresh before cloud ACK, but a stuck run still has a finite ceiling.
- If any post-quiescence step fails, script attempts to restore the active runtime backup (if any), imports **the original task XML** and restarts the original old task. Original checked-out Git repo and its Debug binary stay untouched throughout. Original `identity.dat`, `bridge.db`, `bridge.db-wal`, `bridge.db-shm` and logs are never copied/deleted/overwritten.
- Code/parser tests: `scripts/check-bridge-shop-upgrade.mjs` and dedicated `.github/workflows/bridge-shop-upgrade-quality.yml` execute static contract checks, native Windows PowerShell 5.1 parsing and a Windows NET48 Release build. All required existing production/operation gates must pass on the **final candidate SHA** before the shop is modified.

## 3. Operator runbook — no more repetitive audits

**Only after the final upgrade PR has passed exact-head required CI and the owner has approved installation**, pin the full PR candidate SHA rather than hardcoding `d4dc1b4` from the prior isolated build. Run this on the authorized shop PC:

```powershell
$Repo = 'C:\SANAD-DEV'
$Stage = 'C:\SANAD-BRIDGE-UPGRADE-V2'
$Branch = 'bridge/shop-upgrade-reconcile-and-safe-installer-20260927'
$SHA = '<EXACT_40_CHARACTER_APPROVED_SHA>'
$OldHash = '391A09E3532E1E2BD9FCDBCF2AE92693C1527E7BB36868D710AD8211141C9DAA'
if (Test-Path -LiteralPath $Stage) { throw 'Staging V2 already exists; refuse overwrite.' }
git -C $Repo fetch origin "+refs/heads/${Branch}:refs/remotes/origin/${Branch}"
if ($LASTEXITCODE -ne 0) { throw 'fetch failed' }
$Actual = (git -C $Repo rev-parse "refs/remotes/origin/$Branch").Trim()
if ($Actual -ne $SHA) { throw "Remote branch moved: $Actual" }
git -C $Repo worktree add --detach $Stage $SHA
if ($LASTEXITCODE -ne 0) { throw 'worktree add failed' }
# Use PowerShell as administrator under the SAME current Windows shop account.
& "$Stage\bridge\windows\install-shop-upgrade.ps1" -Stage $Stage -ExpectedSha $SHA -ExpectedOldHash $OldHash -WhatIf
# -WhatIf builds/verifies pinned output without stopping the service; inspect results.
& "$Stage\bridge\windows\install-shop-upgrade.ps1" -Stage $Stage -ExpectedSha $SHA -ExpectedOldHash $OldHash -Confirm
```

This does **not** reset or pull the old working tree, wipe local changes or delete the previous Stage 1 snapshot. New `runtime\active` is an installed application copy, not a Git worktree, and application state stays in the original ProgramData root. `-WhatIf` must complete before `-Confirm`.

`-ExpectedOldHash` is the exact old Debug EXE SHA256 recorded by the owner in Stage 1. The installer now parses the EXISTING TASK's runner to locate the executable it actually runs and compares that file's live hash to the recorded baseline. If the task references a different executable/hash, **do not bypass this check**; investigate that precise discrepancy rather than reinstalling against a guessed path. This read-only reconciliation is done before disabling the task.

If the installer safely aborts while another cycle still runs, do NOT kill it or repeatedly rerun: save the bounded error and latest task state and analyze that specific obstruction. Do not manually replace files while the process is active.

## 4. Mandatory post-install functional reconciliation (not implied by build)

1. Verify `runtime\active\app\Sanad.Bridge.exe` SHA256 matches staged Release hash and actual `ProductVersion` includes approved commit; check scheduled `wscript.exe` action references **active installed** runner/VBS (not `C:\SANAD-DEV` Debug), correct same Windows principal, every-minute + logon trigger and `IgnoreNew` instance policy.
2. Verify `--agent-health` exit 0 or 29 (if outbox pending), and review *sanitized* `%ProgramData%\SANAD\Bridge\logs\agent-cycle.log` for fresh heartbeat, local scan, sender and logical snapshot cycle. `SCHED_S_TASK_RUNNING` alone is not a failure.
3. Trigger a **single** authenticated owner remote refresh from SANAD Web (not by executing a cloud-supplied command); wait for local heartbeat's `poll_remote_refresh_v1` claimed ID → existing mutex-protected one-time forced logical snapshot → cloud acknowledged `completed` snapshot. Verify new snapshot freshness, source, currency and target customer statement against Edaa (READ-ONLY). If the request is `requested` or `claimed` without a completed snapshot, inspect exact request state, cycle logs and cloud error; do not fake PASS.
4. Verify heartbeat-only diagnostics **never** claim owner refresh requests; Cloud source checks and RLS still apply. Do not expose identity, tokens, connection strings or unsanitized source rows to public reports.
5. If the runtime installation fails, preserve the generated admin-private `runtime\backups\<timestamp>\scheduled-task-before.xml` and `result.json` for recovery. Never run a second installer with mismatched staged SHA or erase the old repo.

**Caveats:** PowerShell -WhatIf validates the new build, source pin and task eligibility only; no update is installed. The script emits `INSTALLED_PENDING_CLOUD_FIELD_SMOKE`, not a completed cloud acceptance declaration. A signed Android release or unrelated Stage 2D UI merge is not part of this shop-PC Bridge gate.

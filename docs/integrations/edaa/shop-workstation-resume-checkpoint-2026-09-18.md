# ERP shop-workstation resume checkpoint — 2026-09-18

> **Historical checkpoint.** The deferred field gates recorded below were resumed on 2026-09-19. The first full logical snapshot, cloud materialization verification, real customer-statement comparison and production-agent activation all succeeded. Use this file as audit history, not as the current operational instruction. Current operating guidance is in `docs/operations/SANAD_MOHAMMED_BAHKUM_OPERATING_PLAYBOOK.md`.

## Purpose

Freeze the exact point where development split into:

1. **Home-safe / cloud-repo work** that can continue without access to the shop computer.
2. **Shop-workstation validation** that must wait for physical access to the authorized Edaa machine.

No shop-only step should be simulated from another machine.

## Proven shop state before pause

Authorized production Bridge workstation:
- stable scheduled task every 1 minute;
- hidden PowerShell execution;
- last observed task result: 0;
- missed runs: 0;
- Arabic UTF-8 log rendering fixed;
- heartbeat / reconciliation / sender steady-state all healthy;
- Edaa remains read-only.

Authorized Edaa source:
- database: `20-06-2026  10.20.55 am`
- source key: `edaa_v5:38d56e1f75be58480332e2ff1543cadb6eccb23c`
- core schema fingerprint: `d864049692ad62dce14040ecf11194c336cdcbb55f45cf4ba9d10a070843b889`
- full schema fingerprint: `82518a5ad3b41230d6d517a61c8d8a1e904ceb6c4c8041b61512ee4307727aab`
- 142 user tables;
- 20,520 observed rows.

Relationship audit evidence:
- 1307/1307 sales have valid AccountID joins.
- 1307/1307 sales have valid EntryID joins and matching party-account entry details.
- 203/203 receipt detail parent/account joins valid.
- 155/155 spending detail parent/account joins valid.
- 4592/4592 entry details resolve to parent entries and accounts.
- 407/408 simple ties resolve to entries/accounts; one legacy exception remains for later inspection.

Customer identity audit:
- 143 distinct sale customer names.
- 140 names match customer master.
- 131 sale names resolve to one AccountID.
- 12 sale names map to multiple AccountIDs.
- 128 customer-master records have unique sale-account evidence.
- 9 customer-master records have no sale-name evidence.

Source sign evidence:
- sale party entries: 1307/1307 negative;
- sales returns: 3/3 positive;
- receipt party entries: all positive;
- spending party entries: all negative;
- simple tie from-account: all negative;
- simple tie to-account: all positive.

Read-model convention:
- negative Edaa source Amount = debit;
- positive Edaa source Amount = credit;
- currencies remain separated.

## Current branches / PRs

Stable Bridge field branch:
`feat/sanad-bridge-local-agent-v01`

ERP replica/read-model branch:
`feat/erp-cloud-replica-v1`

PR:
`#282 feat(erp): periodic full logical cloud replica for Edaa`

Customer statement tracking:
`#283 ERP semantic read model: detailed customer statement v1`

PR #282 remains Draft until live snapshot validation on the shop workstation succeeds.

## Home-safe work allowed now

- migration/code review;
- UI work;
- governed RPC design;
- semantic read models that use already-proven relationships;
- retention/backup metadata design;
- tests with synthetic fixtures;
- documentation;
- CI hardening;
- product information architecture;
- assistant/read-model integration contracts.

## Explicitly deferred until return to shop computer

Do **not** perform these from another machine:

1. Run first real `--logical-snapshot` against Edaa.
2. Measure real snapshot chunk count / payload size / elapsed time.
3. Verify every one of the 142 tables completes with expected row counts.
4. Verify cloud materialization row counts against source counts.
5. Verify `last_sync_at` after successful snapshot ingest.
6. Query a real customer statement from the copied snapshot and compare to Edaa.
7. Inspect the single unmatched legacy sale-detail relation (2359/2360) and the single simple-tie exception (407/408) using controlled source evidence.
8. Validate subsequent periodic snapshot after source changes.
9. Decide whether the 360-minute cadence is operationally acceptable.
10. Perform any physical SQL Server backup / restore research that requires the live Edaa/SQL Server machine.

## Resume procedure at shop

Use the isolated worktree, not `C:\SANAD-DEV`:

```powershell
cd C:\SANAD-ERP-DISCOVERY
git fetch origin refs/heads/feat/erp-cloud-replica-v1:refs/remotes/origin/feat/erp-cloud-replica-v1
git reset --hard origin/feat/erp-cloud-replica-v1
dotnet restore .\bridge\windows\Sanad.Bridge\Sanad.Bridge.csproj
dotnet build .\bridge\windows\Sanad.Bridge\Sanad.Bridge.csproj -c Debug --no-restore
$Exe = "C:\SANAD-ERP-DISCOVERY\bridge\windows\Sanad.Bridge\bin\Debug\net48\Sanad.Bridge.exe"
```

Before any real snapshot run:
- confirm scheduled production Bridge still healthy;
- confirm branch head / CI;
- run `--agent-health` on stable production executable;
- keep `C:\SANAD-DEV` untouched.

Then perform a supervised first logical snapshot from the isolated worktree only.

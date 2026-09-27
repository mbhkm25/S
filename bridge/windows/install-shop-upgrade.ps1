<#
.SYNOPSIS
  Install a SHA-pinned, already restored/buildable SANAD Bridge release on
  the authorized Edaa shop computer without editing Edaa or local Bridge data.
.DESCRIPTION
  Reconciles a Git isolated staging worktree against its actual Release EXE,
  backs up the existing task and deployed application, gracefully quiesces the
  one-minute task, installs complete NET48 Release dependencies to a stable
  ProgramData runtime, checks local read-only Bridge health, registers the
  existing safe hidden launcher and verifies its paths.
  Never copies, deletes or resets identity.dat, bridge.db, *.db-wal or logs.
  Strict fail-closed preflight before touching the scheduled task.
  A task in state Running and result 267009 (0x41301) is NOT by itself a failure.
.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File .\bridge\windows\install-shop-upgrade.ps1 -Stage C:\SANAD-BRIDGE-UPGRADE-V2 -ExpectedSha <full 40 char SHA>
#>
[CmdletBinding(SupportsShouldProcess=$true, ConfirmImpact='High')]
param(
  [Parameter(Mandatory=$true)][string]$Stage,
  [Parameter(Mandatory=$true)][ValidatePattern('^[0-9a-f]{40}$')][string]$ExpectedSha,
  [string]$TaskName='SANAD Bridge Agent',
  [string]$RuntimeRoot=(Join-Path $env:ProgramData 'SANAD\Bridge\runtime')
)
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
$stopped=$false
$backedUp=$false
$oldTaskXml=$null
$priorDisabled=$false
$backupActive=$null
$active=Join-Path $RuntimeRoot 'active'
$release=Join-Path $RuntimeRoot "releases\$ExpectedSha"
$backup=Join-Path $RuntimeRoot ('backups\'+(Get-Date -Format 'yyyyMMdd-HHmmss'))
$stamp=(Get-Date).ToString('o')

function Assert-Exit([string]$Activity) {
  if ($LASTEXITCODE -ne 0) { throw "$Activity failed: exit $LASTEXITCODE" }
}
function Wait-BridgeStopped {
  $limit=(Get-Date).AddSeconds(330)
  do {
    $running=@(Get-CimInstance Win32_Process -Filter "Name='Sanad.Bridge.exe'" -ErrorAction Stop)
    if ($running.Count -eq 0) { return }
    Start-Sleep -Seconds 3
  } while ((Get-Date) -lt $limit)
  throw 'Bridge process still exists after 330 seconds. Do not force-kill or replace loaded binaries. Examine Task Scheduler and local agent log.'
}

# PRE-FLIGHT: perform all source and build checks BEFORE touching the live task.
if (-not $env:ProgramData) { throw 'ProgramData unavailable' }
if (-not (Get-Command git -ErrorAction SilentlyContinue)) { throw 'git unavailable' }
if (-not (Get-Command dotnet -ErrorAction SilentlyContinue)) { throw 'dotnet unavailable' }
if (-not (Test-Path -LiteralPath $Stage -PathType Container)) { throw 'Staging worktree missing' }
$stageSha=(& git -C $Stage rev-parse HEAD).Trim()
Assert-Exit 'git rev-parse'
if ($stageSha -cne $ExpectedSha) { throw "Staging SHA mismatch: $stageSha" }
$dirty=@(& git -C $Stage status --porcelain --untracked-files=no)
Assert-Exit 'git tracked status'
if ($dirty.Count -gt 0) { throw 'Staging worktree has tracked edits: installation refused' }
$project=Join-Path $Stage 'bridge\windows\Sanad.Bridge\Sanad.Bridge.csproj'
$runner=Join-Path $Stage 'bridge\windows\run-agent-cycle.ps1'
$launcher=Join-Path $Stage 'bridge\windows\run-agent-cycle-hidden.vbs'
foreach ($path in @($project,$runner,$launcher)) {
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "Missing staging file: $path" }
}
$runnerContent=Get-Content -LiteralPath $runner -Raw
if ($runnerContent -notmatch '\$PSScriptRoot' -or $runnerContent -notmatch 'app\\Sanad.Bridge.exe') {
  throw 'Staged runner is not the revised stable app-relative runner. Checkout the vetted upgrade PR first.'
}
if (-not (Get-Command Export-ScheduledTask -ErrorAction SilentlyContinue)) {
  throw 'Task Scheduler cmdlets unavailable'
}
$oldTask=Get-ScheduledTask -TaskName $TaskName -ErrorAction Stop
if ($oldTask.TaskPath -ne '\') { throw 'Only the known root scheduled task is eligible for this upgrade' }
if (@($oldTask.Actions).Count -ne 1 -or $oldTask.Actions[0].Execute -notmatch '(?i)wscript\.exe$' -or
    $oldTask.Actions[0].Arguments -notmatch 'run-agent-cycle-hidden\.vbs') {
  throw 'Current scheduled task has unexpected launcher. Manual migration review required.'
}
$oldUser=$oldTask.Principal.UserId
$nowUser=[Security.Principal.WindowsIdentity]::GetCurrent()
try { $taskSid=(New-Object Security.Principal.NTAccount($oldUser)).Translate([Security.Principal.SecurityIdentifier]).Value }
catch { throw 'Cannot verify old task account; do not change task principal' }
if ($taskSid -ne $nowUser.User.Value) { throw 'Current account is not the existing scheduled-task principal' }
$priorDisabled=($oldTask.State -eq 'Disabled')
if ($priorDisabled) { throw 'Old task is disabled. Do not silently re-enable it.' }
$principal=New-Object Security.Principal.WindowsPrincipal($nowUser)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw 'Launch PowerShell as administrator under the SAME existing interactive shop account'
}
Write-Host "Pinned source: $ExpectedSha" -ForegroundColor Cyan
Write-Host 'Building complete Bridge Release before touching the running task...'
& dotnet restore $project
Assert-Exit 'dotnet restore'
& dotnet build $project --configuration Release --no-restore
Assert-Exit 'dotnet Release build'
$builtDirty=@(& git -C $Stage status --porcelain --untracked-files=no)
Assert-Exit 'post-build git tracked status'
if ($builtDirty.Count -gt 0) { throw 'Build changed tracked staging files; re-review before install' }
$bin=Join-Path $Stage 'bridge\windows\Sanad.Bridge\bin\Release\net48'
$exe=Join-Path $bin 'Sanad.Bridge.exe'
if (-not (Test-Path -LiteralPath $exe)) { throw 'Release EXE missing' }
$version=(Get-Item -LiteralPath $exe).VersionInfo.ProductVersion
if ($version -notlike "*$ExpectedSha*") {
  throw "Release ProductVersion does not contain pinned SHA ($version). Stop: stale output or wrong project."
}
$hash=(Get-FileHash -LiteralPath $exe -Algorithm SHA256).Hash
$links=@(Get-ChildItem -LiteralPath $bin -Recurse -Force -Attributes ReparsePoint -ErrorAction SilentlyContinue)
if ($links.Count -gt 0) { throw 'Unexpected symlinks in Release output' }
Write-Host "Release verified: $version; SHA256=$hash" -ForegroundColor Green
Write-Host "Current scheduler state: $($oldTask.State). LastResult 267009/0x41301 means TASK RUNNING, not an error."
if (-not $PSCmdlet.ShouldProcess($TaskName,"Back up task, gracefully stop, install SHA-pinned Bridge, register and start task")) {
  Write-Host 'Preflight/build complete. No service or task changes performed.'
  return
}

# Keep immutable versioned staging artifacts and a recoverable task definition.
try {
  New-Item -ItemType Directory -Path $release,$backup -Force | Out-Null
  & icacls.exe $backup /inheritance:r /grant:r '*S-1-5-18:(OI)(CI)F' '*S-1-5-32-544:(OI)(CI)F' | Out-Null
  Assert-Exit 'Secure private task backup'
  # No Bridge state, identity or log is included in these runtime-only backups.
  $oldTaskXml=Join-Path $backup 'scheduled-task-before.xml'
  Export-ScheduledTask -TaskName $TaskName | Set-Content -LiteralPath $oldTaskXml -Encoding Unicode
  if (Test-Path -LiteralPath $active) {
    $backupActive=Join-Path $backup 'previous-active'
    Copy-Item -LiteralPath $active -Destination $backupActive -Recurse -Force
  }
  $oldAction=[pscustomobject]@{
    task=$TaskName; runAs=$oldUser; previousExecute=$oldTask.Actions[0].Execute
    previousArguments=$oldTask.Actions[0].Arguments; oldTaskState="$($oldTask.State)"
    previousLastResult=(($oldTask | Get-ScheduledTaskInfo).LastTaskResult)
    stagingSha=$ExpectedSha; oldBinaryHash=$null; newBinaryHash=$hash; startedAt=$stamp
  }
  $oldAction | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $backup 'upgrade-manifest.json') -Encoding UTF8

  # Disable first so a new minute trigger cannot race the quiescence window.
  $stopped=$true # Rollback must run even if Disable-ScheduledTask fails midway.
  Disable-ScheduledTask -TaskName $TaskName | Out-Null
  Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
  Wait-BridgeStopped

  $versionApp=Join-Path $release 'app'
  New-Item -ItemType Directory -Path $versionApp -Force | Out-Null
  Copy-Item -Path (Join-Path $bin '*') -Destination $versionApp -Recurse -Force
  Copy-Item -LiteralPath $runner,$launcher -Destination $release -Force
  $versionHash=(Get-FileHash -LiteralPath (Join-Path $versionApp 'Sanad.Bridge.exe') -Algorithm SHA256).Hash
  if ($versionHash -cne $hash) { throw 'Versioned runtime hash mismatch' }

  # Existing active version is backed up, task is disabled, and no Bridge process runs.
  if (Test-Path -LiteralPath $active) { Remove-Item -LiteralPath $active -Recurse -Force }
  New-Item -ItemType Directory -Path $active -Force | Out-Null
  Copy-Item -Path (Join-Path $release '*') -Destination $active -Recurse -Force
  $installed=Join-Path $active 'app\Sanad.Bridge.exe'
  if ((Get-FileHash -LiteralPath $installed -Algorithm SHA256).Hash -cne $hash) {
    throw 'Installed EXE hash mismatch'
  }
  # Inheritance may permit modification by ordinary users under ProgramData;
  # runtime code must be writable only by admins/SYSTEM.
  & icacls.exe $RuntimeRoot /inheritance:r /grant:r '*S-1-5-18:(OI)(CI)F' '*S-1-5-32-544:(OI)(CI)F' '*S-1-5-32-545:(OI)(CI)RX' /T /C | Out-Null
  Assert-Exit 'Lock down runtime folder ACL'
  & icacls.exe $backup /inheritance:r /grant:r '*S-1-5-18:(OI)(CI)F' '*S-1-5-32-544:(OI)(CI)F' /T /C | Out-Null
  Assert-Exit 'Restore admin-only ACL on private scheduler backups'

  # Local health reads Edaa and the existing local state. Pending outbox code
  # 29 is an advisory: pending sales may need scheduled cloud delivery.
  & $installed --agent-health
  $healthCode=$LASTEXITCODE
  if ($healthCode -notin @(0,29)) { throw "New Bridge local health failed before scheduler registration (exit $healthCode)" }

  $installedRunner=Join-Path $active 'run-agent-cycle.ps1'
  $installedLauncher=Join-Path $active 'run-agent-cycle-hidden.vbs'
  & (Join-Path $Stage 'bridge\windows\install-scheduled-agent.ps1') -TaskName $TaskName -RunnerPath $installedRunner -LauncherPath $installedLauncher
  if (-not $?) { throw 'Scheduled agent installation failed' }
  $actual=Get-ScheduledTask -TaskName $TaskName
  if ($actual.Actions.Count -ne 1 -or $actual.Actions[0].Arguments -notlike "*$installedRunner*" -or
      $actual.Actions[0].Arguments -notlike "*$installedLauncher*") {
    throw 'New scheduled task does not reference verified installed runtime'
  }
  $newSid=(New-Object Security.Principal.NTAccount($actual.Principal.UserId)).Translate([Security.Principal.SecurityIdentifier]).Value
  if ($newSid -ne $nowUser.User.Value) { throw 'New scheduled task principal changed unexpectedly' }
  $result=[pscustomobject]@{
    state='INSTALLED_PENDING_CLOUD_FIELD_SMOKE'; installedSha=$ExpectedSha
    fileProductVersion=$version; installedHash=$hash
    taskName=$TaskName; taskRunAs=$actual.Principal.UserId
    taskState="$($actual.State)"; localHealthExit=$healthCode
    taskBackup=$oldTaskXml; previousAppBackup=$backupActive
    manualForcedRefresh=(Join-Path $Stage 'bridge\windows\request-logical-snapshot-now.ps1')
    installedExe=$installed; installedRunner=$installedRunner
  }
  $result | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $backup 'result.json') -Encoding UTF8
  $result | Format-List
  Write-Host 'INSTALL SUCCESS. Cloud heartbeat, remote owner refresh and acknowledged logical snapshot remain separate closure checks.' -ForegroundColor Green
}
catch {
  Write-Warning "Upgrade failed: $($_.Exception.Message)"
  if ($stopped) {
    try {
      Disable-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue | Out-Null
      Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
      Wait-BridgeStopped
      if (Test-Path -LiteralPath $active) { Remove-Item -LiteralPath $active -Recurse -Force }
      if ($backupActive -and (Test-Path -LiteralPath $backupActive)) {
        Copy-Item -LiteralPath $backupActive -Destination $active -Recurse -Force
      }
      if ($oldTaskXml -and (Test-Path -LiteralPath $oldTaskXml)) {
        Register-ScheduledTask -TaskName $TaskName -Xml (Get-Content -LiteralPath $oldTaskXml -Raw) -Force | Out-Null
        Start-ScheduledTask -TaskName $TaskName
        Write-Warning 'Original scheduled task definition restored and restarted; old checkout was never modified.'
      }
    } catch {
      Write-Error "AUTOMATIC ROLLBACK FAILED; original task XML is saved at $oldTaskXml. $($_.Exception.Message)"
    }
  }
  throw
}

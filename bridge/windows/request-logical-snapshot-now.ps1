<#
.SYNOPSIS
  Run a one-time, full READ-ONLY Edaa logical snapshot immediately through the
  existing SANAD Bridge single-instance agent pipeline.
.DESCRIPTION
  Complements rather than replaces the installed "SANAD Bridge Agent" task:
  its one-minute cycle and six-hour snapshot cadence are left untouched.
  Uses the *same* authorized local Bridge executable and the agent's mutex;
  no cloud server can remotely execute commands on this workstation.
  Execute on the workstation that hosts the authorized Edaa installation.
#>
[CmdletBinding()]
param(
  [string]$BridgeExe = 'C:\SANAD-DEV\bridge\windows\Sanad.Bridge\bin\Debug\net48\Sanad.Bridge.exe',
  [string]$RunnerPath = (Join-Path $PSScriptRoot 'run-agent-cycle.ps1'),
  [string]$ScheduledTaskName = 'SANAD Bridge Agent',
  [int]$BusyRetries = 2,
  [int]$BusyRetryDelaySeconds = 45
)

$ErrorActionPreference = 'Stop'

if ($BusyRetries -lt 0 -or $BusyRetries -gt 3) { throw 'BusyRetries must be 0..3' }
if ($BusyRetryDelaySeconds -lt 10 -or $BusyRetryDelaySeconds -gt 120) {
  throw 'BusyRetryDelaySeconds must be 10..120'
}

if (-not (Test-Path -LiteralPath $RunnerPath -PathType Leaf)) {
  throw "SANAD Bridge runner missing: $RunnerPath"
}
if (-not (Test-Path -LiteralPath $BridgeExe -PathType Leaf)) {
  throw "SANAD Bridge executable missing: $BridgeExe. Build/verify the existing authorized Bridge on its Edaa workstation first."
}

$task = Get-ScheduledTask -TaskName $ScheduledTaskName -ErrorAction SilentlyContinue
if (-not $task) {
  Write-Warning "The periodic task '$ScheduledTaskName' was not found. The manual refresh can still run, but investigate the periodic agent separately."
} else {
  Write-Host "Existing periodic task: $ScheduledTaskName ($($task.State)). Its schedule will NOT change."
}

Write-Host 'SANAD: immediate READ-ONLY Edaa cloud refresh requested.'
Write-Host 'This runs heartbeat, reconciliation scan, durable cloud sender and forced logical snapshot.'
Write-Host 'Existing agent lock prevents overlapping runs; another cycle may require a short retry.'
Write-Host 'A completed local process is not by itself proof of cloud financial report parity.'

for ($attempt = 0; $attempt -le $BusyRetries; $attempt++) {
  # Do NOT bypass BridgeAgentCycleCommand's existing Global/Local mutex.
  # Invoke the shared runner, which also preserves the standard UTF-8 log.
  & $RunnerPath -BridgeExe $BridgeExe -ForceLogicalSnapshot
  $exitCode = $LASTEXITCODE
  if ($null -eq $exitCode) { $exitCode = 1 }

  if ($exitCode -eq 28 -and $attempt -lt $BusyRetries) {
    Write-Warning "Another Bridge agent cycle is running. Retrying in $BusyRetryDelaySeconds seconds."
    Start-Sleep -Seconds $BusyRetryDelaySeconds
    continue
  }

  # An existing local reconciliation may use 24 for no new sales even when
  # cloud delivery + snapshot have succeeded. Verify cloud completion below.
  $log = Join-Path $env:ProgramData 'SANAD\Bridge\logs\agent-cycle.log'
  if ($exitCode -eq 0 -or $exitCode -eq 24) {
    Write-Host 'Bridge cycle exited. Confirm the LAST cycle includes "Logical ERP snapshot completed and acknowledged by SANAD" or cloud already-complete reconciliation.'
    Write-Host "Agent log: $log"
    Write-Host 'Then verify Supabase has a newly completed logical snapshot AFTER the Edaa source change before trusting refreshed balances.'
    exit 0
  }
  if ($exitCode -eq 28) {
    Write-Warning 'No concurrent refresh was started: another scheduled/manual Bridge cycle still holds the mutex.'
  } else {
    Write-Warning "Bridge returned exit code $exitCode. Inspect the agent log; source data was not modified."
  }
  Write-Host "Agent log: $log"
  exit $exitCode
}

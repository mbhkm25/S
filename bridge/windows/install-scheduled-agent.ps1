param(
  [string]$TaskName = "SANAD Bridge Agent",
  [string]$RunnerPath = "C:\SANAD-DEV\bridge\windows\run-agent-cycle.ps1"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $RunnerPath)) {
  throw "Runner script not found: $RunnerPath"
}

$UserId = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$PowerShell = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
$Arguments = '-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "' + $RunnerPath + '"'

$Action = New-ScheduledTaskAction -Execute $PowerShell -Argument $Arguments

# Task Scheduler rejects TimeSpan::MaxValue because it serializes to an out-of-range
# ISO-8601 duration (P99999999D...). Use a bounded long-lived duration instead.
$RepetitionDuration = New-TimeSpan -Days 3650
$MinuteTrigger = New-ScheduledTaskTrigger `
  -Once `
  -At (Get-Date).AddMinutes(1) `
  -RepetitionInterval (New-TimeSpan -Minutes 1) `
  -RepetitionDuration $RepetitionDuration

$LogonTrigger = New-ScheduledTaskTrigger -AtLogOn -User $UserId

$Settings = New-ScheduledTaskSettingsSet `
  -MultipleInstances IgnoreNew `
  -StartWhenAvailable `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 5) `
  -RestartCount 3 `
  -RestartInterval (New-TimeSpan -Minutes 1)

$Principal = New-ScheduledTaskPrincipal `
  -UserId $UserId `
  -LogonType Interactive `
  -RunLevel Limited

$Task = New-ScheduledTask `
  -Action $Action `
  -Trigger @($MinuteTrigger, $LogonTrigger) `
  -Settings $Settings `
  -Principal $Principal `
  -Description "SANAD Edaa Bridge: heartbeat, read-only reconciliation, durable cloud delivery."

Register-ScheduledTask -TaskName $TaskName -InputObject $Task -Force | Out-Null
Start-ScheduledTask -TaskName $TaskName

Write-Host "Installed scheduled task: $TaskName" -ForegroundColor Green
Write-Host "Run-as user          : $UserId"
Write-Host "Interval             : every 1 minute + at logon"
Write-Host "Repetition duration  : 3650 days"
Write-Host "Runner               : $RunnerPath"
Write-Host "Log                  : $env:ProgramData\SANAD\Bridge\logs\agent-cycle.log"

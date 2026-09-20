param(
  [string]$TaskName = "SANAD Bridge Agent",
  [string]$RunnerPath = "C:\SANAD-DEV\bridge\windows\run-agent-cycle.ps1",
  [string]$LauncherPath = "C:\SANAD-DEV\bridge\windows\run-agent-cycle-hidden.vbs"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $RunnerPath)) {
  throw "Runner script not found: $RunnerPath"
}
if (-not (Test-Path $LauncherPath)) {
  throw "Hidden launcher not found: $LauncherPath"
}

$UserId = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$WScript = "$env:SystemRoot\System32\wscript.exe"
$Arguments = '//B //NoLogo "' + $LauncherPath + '" "' + $RunnerPath + '"'

$Action = New-ScheduledTaskAction -Execute $WScript -Argument $Arguments

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
Write-Host "Launcher             : $LauncherPath"
Write-Host "Runner               : $RunnerPath"
Write-Host "Window mode          : no-console (wscript)"
Write-Host "Log                  : $env:ProgramData\SANAD\Bridge\logs\agent-cycle.log"

param([string]$BridgeExe = "C:\\SANAD-DEV\\bridge\\windows\\Sanad.Bridge\\bin\\Debug\\net48\\Sanad.Bridge.exe")

$ErrorActionPreference = "Stop"

$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = $Utf8NoBom
$OutputEncoding = $Utf8NoBom
try { & "$env:SystemRoot\System32\chcp.com" 65001 | Out-Null } catch { }

$Base = Join-Path $env:ProgramData "SANAD\\Bridge"
$LogDir = Join-Path $Base "logs"
$Log = Join-Path $LogDir "agent-cycle.log"
$MaxBytes = 5MB
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

if (Test-Path $Log) {
  if ((Get-Item $Log).Length -ge $MaxBytes) {
    $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
    Move-Item $Log (Join-Path $LogDir ("agent-cycle-" + $stamp + ".log")) -Force
  }
}

"[" + (Get-Date).ToString("o") + "] START agent-cycle" | Out-File $Log -Append -Encoding utf8
if (-not (Test-Path $BridgeExe)) {
  "[" + (Get-Date).ToString("o") + "] ERROR bridge executable not found: " + $BridgeExe | Out-File $Log -Append -Encoding utf8
  exit 90
}

& $BridgeExe --agent-cycle *>> $Log
$code = $LASTEXITCODE
"[" + (Get-Date).ToString("o") + "] END exit=" + $code | Out-File $Log -Append -Encoding utf8
exit $code

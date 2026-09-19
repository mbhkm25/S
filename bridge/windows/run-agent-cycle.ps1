param([string]$BridgeExe = "C:\SANAD-DEV\bridge\windows\Sanad.Bridge\bin\Debug\net48\Sanad.Bridge.exe")

$ErrorActionPreference = "Stop"

$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)
$Utf8Bom = New-Object System.Text.UTF8Encoding($true)
[Console]::OutputEncoding = $Utf8NoBom
$OutputEncoding = $Utf8NoBom

$Base = Join-Path $env:ProgramData "SANAD\Bridge"
$LogDir = Join-Path $Base "logs"
$Log = Join-Path $LogDir "agent-cycle.log"
$MaxBytes = 5MB
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

# Windows PowerShell 5.1 auto-detects UTF-8 reliably when the file starts with a BOM.
# Keep subsequent appends BOM-free so only one BOM exists at the beginning of the log.
if (-not (Test-Path $Log)) {
  [System.IO.File]::WriteAllText($Log, "", $Utf8Bom)
}

if (Test-Path $Log) {
  if ((Get-Item $Log).Length -ge $MaxBytes) {
    $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
    Move-Item $Log (Join-Path $LogDir ("agent-cycle-" + $stamp + ".log")) -Force
  }
}

function Add-Utf8LogLine([string]$Text) {
  [System.IO.File]::AppendAllText($Log, $Text + [Environment]::NewLine, $Utf8NoBom)
}

Add-Utf8LogLine ("[" + (Get-Date).ToString("o") + "] START agent-cycle")

if (-not (Test-Path $BridgeExe)) {
  Add-Utf8LogLine ("[" + (Get-Date).ToString("o") + "] ERROR bridge executable not found: " + $BridgeExe)
  exit 90
}

$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName = $BridgeExe
$psi.Arguments = "--agent-cycle"
$psi.UseShellExecute = $false
$psi.CreateNoWindow = $true
$psi.RedirectStandardOutput = $true
$psi.RedirectStandardError = $true
$psi.StandardOutputEncoding = $Utf8NoBom
$psi.StandardErrorEncoding = $Utf8NoBom

$process = New-Object System.Diagnostics.Process
$process.StartInfo = $psi

if (-not $process.Start()) {
  Add-Utf8LogLine ("[" + (Get-Date).ToString("o") + "] ERROR failed to start Bridge process")
  exit 91
}

$stdoutTask = $process.StandardOutput.ReadToEndAsync()
$stderrTask = $process.StandardError.ReadToEndAsync()
$process.WaitForExit()

$stdout = $stdoutTask.Result
$stderr = $stderrTask.Result
$code = $process.ExitCode
$process.Dispose()

if (-not [string]::IsNullOrEmpty($stdout)) {
  [System.IO.File]::AppendAllText($Log, $stdout, $Utf8NoBom)
  if (-not $stdout.EndsWith([Environment]::NewLine)) {
    [System.IO.File]::AppendAllText($Log, [Environment]::NewLine, $Utf8NoBom)
  }
}

if (-not [string]::IsNullOrEmpty($stderr)) {
  [System.IO.File]::AppendAllText($Log, "[stderr]" + [Environment]::NewLine + $stderr, $Utf8NoBom)
  if (-not $stderr.EndsWith([Environment]::NewLine)) {
    [System.IO.File]::AppendAllText($Log, [Environment]::NewLine, $Utf8NoBom)
  }
}

Add-Utf8LogLine ("[" + (Get-Date).ToString("o") + "] END exit=" + $code)
exit $code

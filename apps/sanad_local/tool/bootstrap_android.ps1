$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $Root

if (-not (Get-Command flutter -ErrorAction SilentlyContinue)) {
    throw 'Flutter is not installed or not available in PATH.'
}

if (Get-Command py -ErrorAction SilentlyContinue) {
    $PythonExe = 'py'
    $PythonPrefix = @('-3')
} elseif (Get-Command python -ErrorAction SilentlyContinue) {
    $PythonExe = 'python'
    $PythonPrefix = @()
} elseif (Get-Command python3 -ErrorAction SilentlyContinue) {
    $PythonExe = 'python3'
    $PythonPrefix = @()
} else {
    throw 'Python 3 is not installed or not available in PATH.'
}

flutter create --platforms=android --org com.sanadflow --project-name sanad_local .
if ($LASTEXITCODE -ne 0) { throw 'flutter create failed.' }

$PythonArgs = @($PythonPrefix) + @('tool/configure_android.py')
& $PythonExe @PythonArgs
if ($LASTEXITCODE -ne 0) { throw 'Android configuration failed.' }

$MainActivityDir = Join-Path $Root 'android\app\src\main\kotlin\com\sanadflow\sanad_local'
New-Item -ItemType Directory -Force -Path $MainActivityDir | Out-Null
Copy-Item -Force (Join-Path $Root 'tool\android\MainActivity.kt') (Join-Path $MainActivityDir 'MainActivity.kt')

& (Join-Path $Root 'tool\prepare_assets.ps1')
flutter pub get
if ($LASTEXITCODE -ne 0) { throw 'flutter pub get failed.' }

Write-Host 'SANAD Local Android workspace is ready on Windows.' -ForegroundColor Green

param(
    [Parameter(Mandatory=$false)]
    [string]$DeviceId
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $Root

if (-not (Get-Command flutter -ErrorAction SilentlyContinue)) {
    throw 'Flutter is not installed or not available in PATH.'
}
if (-not (Get-Command adb -ErrorAction SilentlyContinue)) {
    throw 'ADB is not installed or not available in PATH. Install Android Platform Tools or add them to PATH.'
}

if (-not (Test-Path (Join-Path $Root 'android\app\build.gradle.kts'))) {
    & (Join-Path $Root 'tool\bootstrap_android.ps1')
}

$Connected = @(adb devices | Select-String '\tdevice$' | ForEach-Object {
    ($_ -split '\s+')[0]
})

if ([string]::IsNullOrWhiteSpace($DeviceId)) {
    if ($Connected.Count -eq 1) {
        $DeviceId = $Connected[0]
    } else {
        Write-Host 'Connected Flutter devices:'
        flutter devices
        throw 'Specify the phone id: .\tool\run_on_device.ps1 -DeviceId DEVICE_ID'
    }
}

if ($Connected -notcontains $DeviceId -and $DeviceId -notmatch ':') {
    throw "ADB device '$DeviceId' is not authorized/connected. Run: adb devices"
}

Write-Host "Running SANAD Local on: $DeviceId" -ForegroundColor Cyan
Write-Host 'Hot Reload: r | Hot Restart: R | Quit: q'
flutter run --debug -d $DeviceId --dart-define=SANAD_SUPABASE_URL=https://api.sanadflow.com
if ($LASTEXITCODE -ne 0) { throw 'flutter run failed.' }

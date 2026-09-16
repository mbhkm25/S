param(
  [switch]$InstallDependencies
)

$ErrorActionPreference = 'Stop'
$TargetBranch = 'feat/sanad-architecture-v2'
$ExpectedRemote = 'origin'

function Fail([string]$Message) {
  Write-Host "ERROR: $Message" -ForegroundColor Red
  exit 1
}

Write-Host "=== SANAD v2 local bootstrap ===" -ForegroundColor Cyan

if (-not (Test-Path '.git')) {
  Fail 'Run this script from the SANAD repository root (for example C:\sanad-v3).'
}

$inside = (git rev-parse --is-inside-work-tree 2>$null)
if ($inside -ne 'true') {
  Fail 'Current directory is not a Git working tree.'
}

$status = git status --porcelain
if ($status) {
  Write-Host 'Local changes were detected. Nothing will be overwritten.' -ForegroundColor Yellow
  git status --short
  Fail 'Commit, stash, or intentionally back up the local changes before continuing.'
}

$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$recoveryDir = Join-Path (Get-Location) '.recovery'
New-Item -ItemType Directory -Force -Path $recoveryDir | Out-Null
$bundlePath = Join-Path $recoveryDir "sanad-pre-v2-$timestamp.bundle"

Write-Host "Creating local Git recovery bundle: $bundlePath" -ForegroundColor DarkCyan
git bundle create $bundlePath --all
if ($LASTEXITCODE -ne 0) { Fail 'Could not create the local Git recovery bundle.' }

Write-Host 'Fetching GitHub source of truth...' -ForegroundColor DarkCyan
git fetch $ExpectedRemote --prune
if ($LASTEXITCODE -ne 0) { Fail 'git fetch failed.' }

$remoteBranch = git show-ref --verify --quiet "refs/remotes/$ExpectedRemote/$TargetBranch"; $remoteExists = ($LASTEXITCODE -eq 0)
if (-not $remoteExists) {
  Fail "Remote branch $ExpectedRemote/$TargetBranch was not found."
}

$localBranch = git show-ref --verify --quiet "refs/heads/$TargetBranch"; $localExists = ($LASTEXITCODE -eq 0)
if ($localExists) {
  git switch $TargetBranch
} else {
  git switch --track -c $TargetBranch "$ExpectedRemote/$TargetBranch"
}
if ($LASTEXITCODE -ne 0) { Fail "Could not switch to $TargetBranch." }

git pull --ff-only $ExpectedRemote $TargetBranch
if ($LASTEXITCODE -ne 0) { Fail 'Fast-forward update failed. No reset was attempted.' }

$localHead = (git rev-parse HEAD).Trim()
$remoteHead = (git rev-parse "$ExpectedRemote/$TargetBranch").Trim()
if ($localHead -ne $remoteHead) {
  Fail "Local HEAD ($localHead) does not match remote HEAD ($remoteHead)."
}

if (-not (Test-Path '.env.development')) {
  Copy-Item '.env.development.example' '.env.development'
  Write-Host 'Created .env.development from the safe template.' -ForegroundColor Green
  Write-Host 'Fill the DEVELOPMENT publishable/anon key locally before starting the app.' -ForegroundColor Yellow
} else {
  Write-Host '.env.development already exists; it was not overwritten.' -ForegroundColor Green
}

if ($InstallDependencies) {
  Write-Host 'Installing dependencies from package-lock.json...' -ForegroundColor DarkCyan
  npm ci
  if ($LASTEXITCODE -ne 0) { Fail 'npm ci failed.' }
} else {
  Write-Host 'Dependencies were not changed. Run: npm ci' -ForegroundColor Yellow
}

Write-Host ''
Write-Host 'SANAD v2 local checkout is aligned.' -ForegroundColor Green
Write-Host "Branch: $TargetBranch"
Write-Host "HEAD:   $localHead"
Write-Host "Bundle: $bundlePath"
Write-Host ''
Write-Host 'Next recommended commands:' -ForegroundColor Cyan
Write-Host '  npm ci'
Write-Host '  npm run lint'
Write-Host '  npm run check:routes'
Write-Host '  npm run build'

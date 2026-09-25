[CmdletBinding()]
param(
  [Parameter(Mandatory=$true)][ValidatePattern('^[0-9a-fA-F]{40}$')][string]$ExpectedSha,
  [string]$Repo = 'C:\sanad-v3',
  [string]$Worktree = 'C:\SANAD-2C1-PREVIEW',
  [int]$Port = 3000,
  [switch]$CopyLocalEnv
)

$ErrorActionPreference = 'Stop'
$branch = 'stage2c/1-real-project-workspaces'
function Invoke-CheckedGit([string[]]$ArgsList) {
  & git @ArgsList
  if ($LASTEXITCODE -ne 0) { throw ('Git failed: ' + ($ArgsList -join ' ')) }
}
if (-not (Test-Path -LiteralPath $Repo -PathType Container)) { throw "Missing repository: $Repo" }
Invoke-CheckedGit -ArgsList @('-C', $Repo, 'rev-parse', '--is-inside-work-tree') | Out-Null
Invoke-CheckedGit -ArgsList @('-C', $Repo, 'fetch', 'origin', "refs/heads/$($branch):refs/remotes/origin/$branch") | Out-Null
$head = (& git -C $Repo rev-parse "refs/remotes/origin/$branch").Trim().ToLowerInvariant()
if ($LASTEXITCODE -ne 0 -or $head -ne $ExpectedSha.ToLowerInvariant()) {
  throw "PR candidate changed. Expected=$ExpectedSha remote=$head. Use the latest reviewed exact SHA."
}
if (Test-Path -LiteralPath $Worktree) {
  if (-not (Test-Path (Join-Path $Worktree '.git'))) {
    throw "Directory exists but is not a Git worktree: $Worktree. Inspect it manually."
  }
  $dirty = @(& git -C $Worktree status --porcelain)
  if ($LASTEXITCODE -ne 0 -or $dirty.Count -gt 0) { throw 'Preview has local changes. Inspect or save before refresh.' }
  Invoke-CheckedGit -ArgsList @('-C', $Worktree, 'switch', '--detach', $head) | Out-Null
} else {
  Invoke-CheckedGit -ArgsList @('-C', $Repo, 'worktree', 'add', '--detach', $Worktree, $head) | Out-Null
}
$actual = (& git -C $Worktree rev-parse HEAD).Trim().ToLowerInvariant()
if ($LASTEXITCODE -ne 0 -or $actual -ne $head) { throw 'Local worktree SHA check failed.' }
if ($CopyLocalEnv) {
  $sourceEnv = Join-Path $Repo '.env.local'
  if (-not (Test-Path $sourceEnv)) { throw 'Missing original .env.local; no credentials copied.' }
  $destEnv = Join-Path $Worktree '.env.local'
  if (-not (Test-Path $destEnv)) { Copy-Item -LiteralPath $sourceEnv -Destination $destEnv }
  else { Write-Warning 'Existing preview .env.local preserved; it was not overwritten.' }
}
if (-not (Test-Path (Join-Path $Worktree '.env.local'))) {
  Write-Warning 'Preview .env.local is missing. Supply an authorized staging/test env, or rerun with -CopyLocalEnv explicitly.'
}
Write-Host "Verified EXACT candidate: $actual" -ForegroundColor Green
Write-Host "Isolated preview: $Worktree" -ForegroundColor Cyan
Write-Host 'No git merge, production deployment or DB migration occurs here.' -ForegroundColor Yellow
Push-Location $Worktree
try {
  npm ci
  if ($LASTEXITCODE -ne 0) { throw 'npm ci failed' }
  npm run lint
  if ($LASTEXITCODE -ne 0) { throw 'TypeScript validation failed' }
  npm run check:routes
  if ($LASTEXITCODE -ne 0) { throw 'Route regression checks failed' }
  $base = '/'
  $envPath = Join-Path $Worktree '.env.local'
  if (Test-Path $envPath) {
    $row = Get-Content -LiteralPath $envPath | Where-Object { $_ -match '^VITE_APP_BASE_PATH=' } | Select-Object -First 1
    if ($row) { $base = ($row -split '=',2)[1].Trim('"',"'").Trim() }
  }
  if (-not $base.EndsWith('/')) { $base += '/' }
  Write-Host ("Preview entry: http://127.0.0.1:$Port" + $base + 'today') -ForegroundColor Green
  Write-Host 'For a safe pre-DB-release preview, existing business chats may be READ ONLY. Never submit live financial data as a test.' -ForegroundColor Yellow
  npm run dev -- --host 127.0.0.1 --port $Port --strictPort
} finally { Pop-Location }

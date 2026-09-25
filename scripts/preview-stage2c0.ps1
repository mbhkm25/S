[CmdletBinding()]
param(
  [string]$Repo = 'C:\sanad-v3',
  [string]$Worktree = 'C:\SANAD-2C0-PREVIEW',
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^[0-9a-fA-F]{40}$')]
  [string]$ExpectedSha
)

$ErrorActionPreference = 'Stop'
$Branch = 'stage2c/c0-audit-interactive-prototype'
$PreviewFile = 'docs/prototypes/STAGE2C0_PROJECTS_COMPOSER_PREVIEW.html'
function Git([string[]]$GitArgs) {
  & git @GitArgs
  if ($LASTEXITCODE -ne 0) { throw "git command failed: $($GitArgs -join ' ')" }
}
if (-not (Test-Path -LiteralPath $Repo -PathType Container)) { throw "Local repository not found: $Repo" }
Git @('-C',$Repo,'rev-parse','--is-inside-work-tree') | Out-Null
Write-Host 'Fetching approved candidate branch only...' -ForegroundColor Cyan
Git @('-C',$Repo,'fetch','origin',"refs/heads/$($Branch):refs/remotes/origin/$($Branch)") | Out-Null
$actual = (& git -C $Repo rev-parse "refs/remotes/origin/$Branch").Trim().ToLowerInvariant()
if ($LASTEXITCODE -ne 0 -or $actual -ne $ExpectedSha.ToLowerInvariant()) {
  throw "Exact SHA mismatch. Expected $ExpectedSha; remote currently $actual. Stop and inspect updated PR."
}
$worktreeExists = Test-Path -LiteralPath $Worktree
if ($worktreeExists) {
  $localFile = Join-Path $Worktree '.git'
  if (-not (Test-Path -LiteralPath $localFile)) { throw "Target path exists but is not a registered Git worktree: $Worktree. Use a new destination." }
  $dirty = @(& git -C $Worktree status --porcelain)
  if ($LASTEXITCODE -ne 0 -or $dirty.Count -gt 0) { throw 'Preview worktree has local changes. Save/inspect them first; no overwrite performed.' }
  Git @('-C',$Worktree,'switch','--detach',$actual) | Out-Null
} else {
  Git @('-C',$Repo,'worktree','add','--detach',$Worktree,$actual) | Out-Null
}
$checked = (& git -C $Worktree rev-parse HEAD).Trim().ToLowerInvariant()
if ($LASTEXITCODE -ne 0 -or $checked -ne $ExpectedSha.ToLowerInvariant()) { throw 'Worktree SHA verification failed.' }
$fullPreview = Join-Path $Worktree $PreviewFile
if (-not (Test-Path -LiteralPath $fullPreview)) { throw "Prototype not found: $fullPreview" }
Write-Host "Verified local preview at exact SHA: $checked" -ForegroundColor Green
Write-Host "Working folder: $Worktree" -ForegroundColor Gray
Write-Host 'No Production changes; no database writes; this is an isolated design prototype.' -ForegroundColor Yellow
Start-Process -FilePath $fullPreview

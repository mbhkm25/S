# Stage 2B.R3 — Single SANAD Sidebar Implementation Candidate

**Status:** Code implementation in Draft PR #378; Production unchanged by this PR.  
**Base:** verified `main` `356fcaa0d1aad181a6375125230b7222018d1618`.  
**Workstation for manual preview:** personal laptop `C:\\sanad-v3` (NOT shop `C:\\SANAD-DEV`).  
**Issues:** #375 (UI), #374 (master roadmap).

## Delivered source changes

1. Shell-level account-scoped `SanadAssistantSettingsContext` holds persisted preferences, one pending optimistic mutation with rollback, authorized thread-scope memories and safe forget handling. Preferences are loaded on authenticated shell mount; memory/context loads on demand or from assistant thread results.
2. `SanadAssistantSidebarSections` renders memory, four preference toggles and seven-day metrics as lazy inline accordion content **inside the global sidebar's existing scroll region**. No new business truth; preference/memory RPCs remain the existing server-authorized source of truth.
3. `SanadUnifiedSidebar` includes those sections, retains role-aware conversation history/notifications/account; collapsed desktop wordmark expands the sidebar.
4. `SanadAgentWorkspace` no longer mounts `AssistantWorkspaceSidebar`, an overlay/backdrop or a second assistant-specific open trigger; it hands authorized thread-memory snapshots to the shell provider.
5. `FinancialWorkspaceShell` wraps the persistent shell and assistant with the shared provider and replaces the 44px mobile product toolbar with one labeled, accessible floating global drawer trigger. The native Windows/PWA titlebar and Android system bars are unaffected.
6. Adjusted inherited static tests to enforce **one actual sidebar** and preserve Stage 1 scroll/composer, shared thread access, preference mutation and styling guardrails.

## Same-SHA gates

Record exact final PR head SHA when testing. Required:
- Production Quality Gate: PASS.
- Android APK field-build: PASS (build only; **no** signed Android production publish).
- SANAD Admin Quality Gate: PASS.
- Operation Pipeline Quality: PASS.
- Authenticated Desktop local preview/manual run on personal laptop, no changes to Production.
- Repeat smoke on `/sanad-ai`, `/today`, `/financial`, `/business/manage?section=accounting`: same global sidebar; memory and settings work in place; no second assistant overlay.
- Verify thread switch / read-state / permissions, inline forget, preferences persisted and rollback/network failure, PWA mobile drawer, no full-width in-app header, keyboard/safe-area/zoom; ensure no duplicate overlay or scroll ownership.
- R3 readiness requires a user-reviewed Desktop + Android/mobile runtime screenshot before merging to main.

## Manual preview from personal laptop (PowerShell)

Execute only after GitHub CI is green and replace `<FINAL_SHA>` with the final PR head. A separate worktree protects the existing working checkout. The script must fail fast if remote does not match requested SHA:

```powershell
$Repo = "C:\sanad-v3"
$Preview = "C:\SANAD-R3-PREVIEW"
$Expected = "<FINAL_SHA>"
git -C $Repo fetch origin "+refs/heads/stage2b/r3-one-sidebar:refs/remotes/origin/stage2b/r3-one-sidebar"
if ($LASTEXITCODE -ne 0) { throw "Failed to fetch R3" }
$Actual = git -C $Repo rev-parse refs/remotes/origin/stage2b/r3-one-sidebar
if ($Actual -ne $Expected) { throw "SHA mismatch; stop: $Actual" }
if (-not (Test-Path $Preview)) {
  git -C $Repo worktree add --detach $Preview $Expected
  if ($LASTEXITCODE -ne 0) { throw "Preview worktree creation failed" }
} else {
  if (git -C $Preview status --porcelain) { throw "Preview has local edits" }
  git -C $Preview switch --detach $Expected
  if ($LASTEXITCODE -ne 0) { throw "Cannot switch preview revision" }
}
if ((git -C $Preview rev-parse HEAD) -ne $Expected) { throw "Wrong preview HEAD" }
# Copy local configuration ONLY if needed. Do not print secrets or commit .env.
if ((Test-Path "$Repo\.env.local") -and !(Test-Path "$Preview\.env.local")) {
  Copy-Item "$Repo\.env.local" "$Preview\.env.local"
}
Set-Location $Preview
npm ci
if ($LASTEXITCODE -ne 0) { throw "Dependencies failed" }
npm run build
if ($LASTEXITCODE -ne 0) { throw "Build failed" }
.\node_modules\.bin\vite.cmd preview --host 127.0.0.1 --port 4173 --strictPort
```

Open `http://127.0.0.1:4173/sanad-ai`. Check `dist/version.json` or local candidate HEAD if available; do not mistake stale cached localhost PWA content for the new build. Do not open the preview from an untrusted network: `.env.local` points to real configured services, and preview may still operate on the active account.

## Safety and remaining debt
- No Supabase migrations, serverless functions, ledger write policies or Edaa Bridge changes.
- The retired `AssistantWorkspaceSidebar.tsx` source file is preserved temporarily (no runtime import); delete only after verifying no other consumers/legacy tests.
- No major Finance/Business visual migration or R4 financial semantics in this PR.
- Do not auto-publish or merge on CI alone.

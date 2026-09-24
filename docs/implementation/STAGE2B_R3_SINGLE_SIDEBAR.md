# Stage 2B R3 — Single-Sidebar Runtime & Preview Contract

**Status:** implementation candidate in PR #378; NOT merged; Production remains unchanged by this PR.
**Source baseline:** main `356fcaa0d1aad181a6375125230b7222018d1618`. GitHub Deploy SANAD Production workflow #81 (run 36009231310) and its deploy-job logs verify R2.V2 SHA `356fcaa0d1aad181a6375125230b7222018d1618` was published successfully on 2026-09-24; HTTP app and APK-path postflight also passed. Public `/version.json` bytes and signed Android updater metadata remain separately unverified (do not equate an APK HEAD check with a signed Android release).
**Owner workstation:** user's *personal laptop*, project checkout `C:\sanad-v3`. This is not the authorized Edaa Bridge shop workstation. Do not start or modify Edaa Bridge agents from the laptop.

## Architectural correction

The previous R2.V2 global sidebar absorbed **conversation history** but left **memory/preferences** in `AssistantWorkspaceSidebar`, a separate dimming panel. R3 removes this stale component, preserving a *single* global sidebar on all shell routes:
- SANAD stacked wordmark and tagline + collapse/expand;
- New Conversation + Today + Library + participant-aware conversation history;
- Work + Capabilities + Connections;
- inline, collapsible `الذاكرة` and `ضبط المساعد` inside global sidebar's sole navigation scroll owner;
- fixed footer notification/inbox/profile utilities.

No additional assistant overlay, separate memory panel, or page-level assistant settings sidebar. Complex future editors can use main workspace surfaces and explicit context, not a second navigation rail.

## Source ownership

- `src/features/financial/FinancialWorkspaceShell.tsx`: owns one `SanadUnifiedSidebar`, an account-scoped `SanadAssistantSettingsProvider`, and a safe-area-aware floating mobile menu trigger. The permanent 44px mobile top strip is removed. This is not the Windows/PWA title bar or Android OS chrome.
- `src/features/shell/SanadAssistantSettingsContext.tsx`: one account-scoped preference/memory state shared between the assistant route and global sidebar. Uses existing protected backend RPCs, optimistic persistence with rollback/single-flight, in-flight read ownership, user-switch reset and error states.
- `src/components/navigation/SanadAssistantSidebarSections.tsx`: two lazily expanded sections owned by global sidebar; uses existing `SettingSwitch` semantics; offers forget-memory and performance metrics in place. Memory context is conversation-scoped, not a canonical financial record; on another route, reads via a participant-authorized recent thread.
- `src/features/assistant/SanadAgentWorkspace.tsx`: stops rendering secondary sidebar and trigger; publishes authorized selected-thread memory snapshots to shell owner; retains conversation read permissions, ordering, business context modal, voice, attachment and composer operations.
- `AssistantWorkspaceSidebar.tsx` is deleted as obsolete.
- Added `scripts/check-stage2b-runtime-r3.ts`; updated inherited Stage 1/2 route, viewport, visual, preferences and shared-history contract tests to match the *new* rendering owner without weakening original authorization/semantic checks.

## Boundary and security

- No database migration or new RPC, storage policy, Edge Function or Edaa write.
- Single-account scope for settings; memory loaded only from participant-aware thread IDs.
- Sidebar memory never replaces canonical ERP or financial records.
- Thread owner archive, viewer restrictions and R1 private Realtime subscriptions remain outside this UI refactor and must be smoke-tested.
- No unapproved deployment.

## Acceptance gate (same final SHA)

1. Production Quality Gate PASS, Android Build PASS, Admin Quality Gate PASS, Operation Pipeline PASS and bundle budgets.
2. Authenticated preview: `/sanad-ai`, `/today`, `/financial`, `/business/manage?section=accounting`; single sidebar stable across all.
3. Desktop 1280/1366/1440/1920, zoom 125/150; one navigation scrollbar and separate chat timeline; composer remains fixed within workspace.
4. Open memory/settings within global sidebar without another overlay; actual preference toggle updates backend and survives route switch/reload; failed write rolls back. Forget-memory action has correct visible outcome and access boundary.
5. Global history new/select/archive, unread and shared viewer restriction; notification bell/payment inbox/profile utility parity; collapsed/expanded sidebar persists per local UI preference.
6. Mobile 360/390/430 and **actual Android** keyboard/status/nav safe-area check; accessible 40x40 drawer FAB, no permanent DOM top strip, no obstruction of main page controls. Do not claim native title bar removal through CSS.
7. Candidate Preview from exact SHA, `version.json` + manifest + SW proof, compare against unchanged Production. Only merge after user approval and controlled Production postflight.

## Local preview on personal laptop

Do not reset/mutate `C:\sanad-v3` or alter Bridge workstation. Use an isolated Git worktree:
```powershell
$Expected = '<REPLACE WITH EXACT ACCEPTED PR HEAD SHA>'
cd C:\sanad-v3
git fetch origin '+refs/heads/stage2b/r3-one-sidebar:refs/remotes/origin/stage2b/r3-one-sidebar'
if ($LASTEXITCODE -ne 0) { throw 'Fetch failed' }
$Actual = git rev-parse refs/remotes/origin/stage2b/r3-one-sidebar
if ($Actual -ne $Expected) { throw "SHA mismatch: $Actual" }
if (-not (Test-Path 'C:\SANAD-R3-PREVIEW')) {
  git worktree add --detach C:\SANAD-R3-PREVIEW $Expected
} else {
  if (git -C C:\SANAD-R3-PREVIEW status --porcelain) { throw 'Uncommitted preview changes' }
  git -C C:\SANAD-R3-PREVIEW switch --detach $Expected
}
if ($LASTEXITCODE -ne 0) { throw 'Worktree checkout failed' }
if ((git -C C:\SANAD-R3-PREVIEW rev-parse HEAD) -ne $Expected) { throw 'Wrong revision' }
if (Test-Path 'C:\sanad-v3\.env.local') { Copy-Item 'C:\sanad-v3\.env.local' 'C:\SANAD-R3-PREVIEW\.env.local' }
cd C:\SANAD-R3-PREVIEW
npm ci
if ($LASTEXITCODE -ne 0) { throw 'Install failed; close running Vite/esbuild and retry' }
npm run build
if ($LASTEXITCODE -ne 0) { throw 'Build failed' }
Get-Content .\dist\version.json
.\node_modules\.bin\vite.cmd preview --host 127.0.0.1 --port 4173
```
Use only personal-laptop credentials and its known-safe .env.local; never copy a production service-role secret or Bridge Edaa workstation identity to another machine.

## Next

After R3 Production closure: R4 trustworthy invoice/draft/approval labels, currency/date formatting, and identifiable Today Work Item rows. In parallel documentation-only D-ARCH reconciliation of older open PR #366; start no broader migration from stale branch. Other stages tracked by #374 / `docs/roadmaps/SANAD_EXECUTION_PROGRAM_V3_2026-09-24.md` (docs PR #377 pending).

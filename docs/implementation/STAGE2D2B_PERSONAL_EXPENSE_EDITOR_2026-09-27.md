# Stage 2D.2-B — Personal expense editor, owner preview package

Date: 2026-09-27. Issue #416. Fresh UI branch from fetched main `d4dc1b4aa9b44bd58bffa333e447d7b3f8687671`. Backend #413 and guarded release #414 are preserved, unmerged. Bridge is assigned to a different conversation and is not part of this package.

## Source review and live evidence

Read the complete Stage 2D new-chat handoff, v4 execution roadmap, actual action audit, capability descriptor, 2D.2-A note editor, 2C validation/handoff/checklist, specialized-agent and Projects/Smart Composer architecture, D-ARCH reconciliation and pending #413 contract note. Actual React action card, action API, original normalization, pending expense normalization and scoped lookup code inspected.

Read-only Supabase catalog confirms `update_my_sanad_agent_action_draft_v2(uuid,integer,jsonb)` is absent; existing capability descriptor still advertises no general form editing. Account/category SELECT RLS checks `auth.uid() = user_id`. Current Web `/version.json` remains `c14414a9dc24`, so accepted 2D.2-A UI release is still pending in #414. No live draft was created, changed or approved.

## Package behavior

The existing lazy-loaded action card gains a separately lazy-loaded personal expense editor. It edits amount, currency, account, expense category, optional description and transaction time on **the same canonical action ID** using #413's seven-field v2 payload and pinned expected version. The returned server review replaces the visible review. No new create, cancel/recreate, approval or executor path is introduced for expense editing.

The original read-only capability RPC gains an expense-specific `form_edit_supported` and fixed `edit_rpc`. General form support stays false; income, transfer and commercial editing are not enabled. Expense support fails closed if the v2 RPC is missing or its authenticated EXECUTE grant was revoked. The client additionally checks descriptor schema/source/thread/project/type/variant. Migration generated through Supabase CLI; NOT installed. Before rollout, independently approve/install #413, reconcile its actual ledger filename, then review/install this descriptor change and reconcile its own filename. Do not `db push`.

Entity choices reuse existing owner-RLS accounts/categories. Fetch only active non-system accounts and expense categories, in bounded 200-row pages; fail explicitly instead of silently truncating after 10,000. Native selects expose actual stable IDs; currency changes clear account selection. No guessed defaults or automatic currency conversion. Arabic/Persian decimal digits accepted; decimal strings retained, 6-decimal precision limit, no implicit thousands separators. Exact source timestamp retained when date control unchanged; changed date is interpreted in the displayed device timezone.

Opening the editor disables approval/cancellation. Version conflicts, fingerprint collision and uncertain save response preserve visible inputs and block another save until an explicit read of latest state; replacing unsaved fields requires confirmation. There is no silent retry or rebase. Reload also refreshes the parent's review/version when closing. Changing action ID remounts the card so previous verification/edit state cannot leak into a different card. Existing non-expense note/legacy editing remains as before.

## Isolated owner preview

`npm run preview:draft-editor` opens `http://127.0.0.1:3000` with the **real production card and editor**, but a build-time fixture API adapter. This is a separate Vite entry/config, never a production route or runtime feature flag. It loads no `.env` file, imports no Supabase client, uses no browser credential storage, and has a same-origin CSP. Approval/cancellation adapters reject; all drafts/accounts are synthetic. Fixture state resets on page refresh. This proves UI behavior, not production end-to-end RPC execution.

Scenario selector includes successful edit, stale version, lost response after save, duplicate-active collision, disabled capability, wrong thread capability, unavailable account, empty accounts, lookup error and commercial non-regression. Native keyboard selects are the bounded foundation; searchable Arabic entity autocomplete and conversation/voice edits remain follow-on slices.

## Verification

- 38 executable client/isolated PostgreSQL descriptor cases PASS locally. Includes absent/revoked RPC, owner/foreign/legacy/business scopes, anonymous EXECUTE denial, precise payload/date and invalid entities/amounts.
- TypeScript, full route regression suite, production build and bundle budgets PASS locally. Workspace 110.06 / 120 KB. No production fixture entry.
- Local browser launch blocked by execution environment: Chromium `socket() failed: Operation not permitted`. Browser plugin absent; regular Playwright attempted. Browser checks therefore run in the disposable GitHub Actions runner via `stage2d-expense-editor-ui.yml`; record final exact-head outcome before review readiness.
- Browser suite covers save/review identity, disabled approvals, account currency reset, stale conflict recovery, uncertain response without duplicate save, unsupported/foreign descriptor, empty/failed lookups, unavailable original account, collision, keyboard Tab, 360/390/768/1280 viewports and CSS zoom 125/150. CSS zoom is not a claim of physical browser zoom or Android keyboard testing. Screenshots are CI artifacts, not product assets.
- Backend #413 already has its own 59 PostgreSQL cases including actual concurrency. This UI package does not replace that evidence or claim that v2 is deployed.

## Owner checks before merge

1. Open normal scenario; edit Arabic amount/account/category/date/description; save; verify updated review and version while fixture ID stays constant.
2. While editing, verify approval/cancellation disabled; cancel an unsaved edit and confirm it does not change the review.
3. Stale-version scenario: enter a different amount, save, see conflict with input retained; explicitly load latest and see 175 in the newer revision.
4. Lost-response scenario: save, read current state, see saved amount without another mutation.
5. Inspect 125/150% browser zoom and narrow width; keyboard through fields; no horizontal clipping.
6. Disabled capability and lookup error must not allow a full-field save. Commercial scenario must not show the expense editor.

## Release gates and rollback

Owner preview acceptance is required before UI merge. No merge, database install, Web/Edge/Android publication or real financial testing authorized by this document. Resolve #413 dependency and package.json/check:routes integration deliberately when merging; do not overwrite either test suite. Recheck main and #414 release scope before any rollout, since #414 must not accidentally release an unreviewed new package.

Safe UI rollback: revert this package's UI code and restore previous descriptor definition; retain #413 canonical rows, versions and audit events. Do not undo a user's saved data or revoke unrelated permissions. Revoke v2 edit access only as a separately reviewed backend rollback. Full 2D.2-B remains open for conversational/voice editing and later commercial contracts; this package closes only the personal expense form adapter after owner acceptance.

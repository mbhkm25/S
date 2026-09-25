# SANAD — Consolidated Knowledge-File Working Delta Log

**Created:** 2026-09-25  
**State:** Open working delta; **does not modify** any of the three canonical owner Library files. Append evidence-backed changes here throughout the active work period, then reconcile/approve and merge in one deliberate **Library batch update** at the next owner-approved execution checkpoint. Avoid redundant changes and preserve prior Library versions.

## Source/precedence

Canonical Library references at planning checkpoint: `SANAD.md` v1.4.7 (Library version 17), `SKILL.md` v0.3.0 (Library version 2), `ABU_SANAD.md` (Library version 11). Their mutable current versions must be checked again before the batch. Runtime, live Supabase/Edge and GitHub latest main remain implementation truth; v4 product ADR/roadmap is now the **owner-approved, merged planning decision** (PR #387 / `de3c42dbdf5728ec18227b661a4f75e5039580fa`), while runtime and deployment facts still require independent verification. Do not rewrite ABU_SANAD with operational/project facts.

| Target file | Candidate delta | Verification/status | Apply trigger |
| --- | --- | --- | --- |
| `SANAD.md` | Update R4 state from historic merged/release-pending to **owner-attested Production accepted/closed**: source PR #381 `344934f...`, Web/PWA release PR #382 + workflow #83 published `81c15fb...` SUCCESS, live Edge `sanad-ai-agent-v1` v7 ACTIVE/JWT-on/source-byte-matched. Issue #380 closed after user's explicit live acceptance. Distinguish owner smoke from independently captured browser manifest. | **Verified** by independent release/Edge checks and owner's statement on 2026-09-25; docs-only GitHub issue status updated. | Next approved milestone batch. |
| `SANAD.md` | D-ARCH #376 docs-only reconciliation completed/merged via PR #383 `1fa3ee...`; old #366/#377 closed **without merging stale historical migrations or deleting old branches**. Keep #384 ERP decimal/COGS and #385 Today metadata gaps separate. | **Verified** repo/Supabase review. | Same batch. |
| `SANAD.md` | **Owner-endorsed product direction:** projects as ChatGPT-Projects-like containers with multiple conversations, optional project instructions/files, project tools and existing business management entry; conversation as primary rich interactive operating UI; global Settings/admin separate; context-sensitive Smart Composer quick-action launcher and compact accessible schema-driven forms; shared typed authorized versioned action/draft engine for text/voice/form; project isolation and source provenance. Personal Manager default and a business project per authorized business. | Product direction **explicitly endorsed by owner** in this conversation; **detailed** ADR/v4 execution plan **owner-approved and merged**, while any actual migrations, feature UIs and open technical contracts remain **unimplemented and gated**. | After detailed architecture/design acceptance; do not copy proposed fields as deployed schema. |
| `SANAD.md` | Point to v4 program, Stage 2C #386, security/no-ERP-write invariants, one sidebar/nav and proposed 2C.0–2C.V release slices. Preserve historical v3 by link. | **Owner-approved plan** in merged docs-only PR #387, not a shipped runtime feature. | At owner-approved plan/implementation checkpoint. |
| `SKILL.md` | Owner-requested **three-file batching workflow**: read/reconcile each relevant file without rewriting it at every chat; keep one consolidated dated delta log with source/conflict/status; apply to relevant originals only in a deliberate batch at completed/approved execution checkpoints; preserve version history and old semantics. | User explicit decision on 2026-09-25; no original file rewrite yet. | Same batch only if still absent in current SKILL version after refresh. |
| `ABU_SANAD.md` | **No change proposed**: the new product and release decisions are not personal biography. | Out of scope. | None. |

## Review protocol / conflict control

1. Check that the live R4/Edge release and merged D-ARCH state have not changed unexpectedly.
2. Read **current versions** of `SANAD.md`, `SKILL.md`, `ABU_SANAD.md` before batch; do not overwrite interim owner changes from another conversation.
3. Compare each candidate line against existing canonical content; remove duplicates, supersede clearly dated stale snapshots rather than silently deleting historical evidence.
4. Distinguish **VERIFIED_RUNTIME**, **OWNER_APPROVED_DIRECTION**, **APPROVED_PLAN** and **PROPOSED_INTERFACE/OPEN_QUESTION**. A docs-only draft cannot be described as shipped feature; v4 becomes accepted only when owner approves and GitHub docs are merged.
5. Apply only affected files via version-checked Library overwrite, preferably one grouped milestone delivery; record resulting Library version, source commits/issue, approval and rollback notes.
6. Keep all future incremental changes in this single log; avoid creating per-chat Library version bumps or copying sensitive account data into project-agnostic documentation.

---
name: mohammed-bahkum-operating-style
description: Personal working style and execution preferences for collaborating with محمد باحكم on SANAD and related technical/product work.
version: 1.1
updated: 2026-09-22
---

# محمد باحكم — Personal Working Skill

Use this skill whenever working with محمد باحكم on SANAD, product development, technical operations, documentation, research, or execution workflows.

This skill contains working preferences only. It must not be used as a place to store passwords, secrets, health information, private financial data, political preferences, or unrelated personal history.

## Communication

- Default language: Arabic.
- Keep code, paths, commands, identifiers and established technical terms in English when that improves precision.
- Tone: calm, exact, professional, concise but sufficiently detailed.
- Avoid excessive enthusiasm, praise, filler and patronizing language.
- Do not repeatedly ask clarifying questions when the available system state can answer them.
- When a task is clear, execute it.
- When one approach is materially better, recommend it clearly instead of presenting a long menu of equal options.
- Explain the business/operational impact of technical changes because محمد is the project owner, not the infrastructure operator.
- Distinguish facts, assumptions, verified runtime state and recommendations.

## Execution-first behavior

- Use connected tools directly when available.
- Do not turn محمد into a manual proxy for GitHub, Supabase, Notion, file inspection, logs or deployment if connectors can perform the work.
- Ask محمد to use PowerShell only when the task genuinely depends on his local Windows machine, Edaa Soft, Task Scheduler, ADB/phone, or another local-only resource.
- For local execution, provide one coherent command block and state:
  - whether Administrator is required;
  - what the block changes;
  - what success should look like;
  - what output should be returned.
- Do not ask him to keep a terminal open unless technically necessary.
- Never ask him to print or paste secrets.

## Technical decision style

- Inspect the actual implementation before proposing architecture.
- Prefer root-cause fixes.
- Reuse canonical services/read models instead of cloning logic.
- Avoid parallel sources of truth.
- Preserve auditability, provenance and idempotency.
- Prefer small coherent changes over broad rewrites during production fixes.
- Do not call work complete until it is tested and the relevant production state is verified.
- Historical documentation is context, not proof of current runtime state.

## GitHub preferences

- GitHub repository state is the code source of truth.
- Production code starts from current `main`.
- Significant work uses a descriptive branch and PR.
- CI must be green before merge unless there is an explicitly documented emergency exception.
- Never use force-push to simplify history.
- Do not merge stale diverged branches blindly; rebuild intended changes on top of current `main` when safer.
- Close superseded PRs/branches conceptually instead of leaving confusing active paths.
- Keep commit messages outcome-oriented.
- After merge, distinguish merge state from deployment state.

## Supabase / backend preferences

- Read schema/runtime first.
- Use tracked migrations for schema changes.
- Keep Edge Function source tracked in the repository.
- Preserve RLS and least privilege.
- Treat `SECURITY DEFINER` carefully.
- No client exposure of privileged secrets.
- Test as the real authenticated role where authorization matters.
- If an emergency direct production operation is necessary, reconcile it back into GitHub and documentation immediately.

## SANAD financial rules

- No duplicate ledger.
- No silent multi-currency conversion.
- Personal and business financial truth remain scoped separately.
- Posted/committed financial records should use reversal/replacement semantics instead of destructive edits.
- AI may explain/read governed financial context; it does not become the financial ledger.
- Future AI writes require an explicit Draft → Review/Approve → Execute contract.
- Preserve ambiguity instead of guessing financial identity.

## Edaa / Bridge rules

- Current Edaa integration is read-only toward Edaa.
- Do not introduce writes, repair statements, attach/detach operations, or direct mutation of the legacy database without an explicitly approved later architecture.
- Preserve raw evidence and source provenance.
- Field tests must use the authorized shop environment.
- Keep stable production Bridge operation separate from risky diagnostics.
- Do not expose `identity.dat` or device secrets.
- Distinguish operational sync, logical cloud replica and physical disaster-recovery backup.

## UI/UX preferences

- Arabic-first and real RTL.
- Current UI baseline uses self-hosted Noto Sans Arabic Variable with system fallbacks. Do not migrate font families during visual hardening without benchmark evidence.
- Use Latin digits `0–9` in user-facing interfaces.
- Prefer light colors and calm, professional surfaces.
- Reduce visual congestion.
- Do not build a wall of equal cards.
- Use clear hierarchy, spacing and a single obvious primary action.
- Avoid generic AI-generated dashboard aesthetics.
- Animations should communicate state, not decorate.
- Current execution strategy is **Desktop-first → Mobile-safe → Android hardening at defined release checkpoints**.
- Desktop must be a real desktop layout:
  - wider useful content area;
  - intentional responsive grids;
  - less unnecessary vertical stacking;
  - no narrow phone-like column floating in large empty space;
  - no accidental horizontal overflow;
  - retain RTL and clarity at all breakpoints.
- Mobile-safe remains mandatory: safe-area, touch targets, keyboard, and responsive contracts must not regress while desktop work advances.

## Product-structure preference

The adopted product model is **SANAD as a Conversation-Centric Operating Layer**.

Governing principles:

- **SANAD is the product; finance, business, and connections are capabilities of SANAD.**
- **Conversation-first, not conversation-only.**
- The old four-peer navigation (Assistant / Financial / Business / Account) is no longer the target IA.
- The target shell is sidebar-centric and may expose: Today, Conversations, Library, Tasks, Approvals, Automations, Capabilities, Connections, Businesses/Spaces, Search/Command, and Profile/Settings.
- Financial and Commercial domains remain important internal ownership boundaries for canonical data, authorization, audit, and accounting invariants.
- My Account becomes a utility/profile layer, not a peer product.
- The former Work Center idea is decomposed into Today, Tasks, Approvals, and Automations.
- SANAD Bridge is a Connection/Adapter to legacy accounting systems, not a top-level product.
- Structured work surfaces remain first-class for tables, statements, approvals, reports, inventory, and dense operational work.

Canonical product architecture:
`docs/architecture/sanad-conversation-operating-layer-v2.md`

Active roadmap:
`docs/roadmaps/sanad-conversation-operating-layer-roadmap-v2.md`

## Documentation preference

Important work is not finished until the technical trail is understandable.

For significant changes, capture:

- why;
- what changed;
- source files;
- migration/RPC/function changes;
- PR/commit;
- tests;
- deployment/runtime status;
- risks and deferred decisions.

Use GitHub for executable/source truth and Notion for product/decision context. Keep them reconciled.

## Response pattern محمد prefers

For a development task, a strong response usually follows this sequence:

1. state what was verified;
2. identify the actual issue or decision;
3. execute the safe parts directly;
4. report exact changes;
5. state what remains and why;
6. give local commands only if a local-only gate remains.

Do not end with vague “we can do X later” if X can be done now.

## Anti-patterns

Avoid:

- “maybe try this” without inspecting current state;
- asking محمد to deploy manually when the deployment connector/workflow can be used;
- claiming production changed because a PR merged;
- replacing a backend error with prettier UI copy without root-cause diagnosis;
- creating new databases/tables/services before checking existing equivalents;
- mass security changes without scoped evidence;
- accidental financial assumptions;
- overloading the user with implementation trivia that does not change the decision.

## Current SANAD priority at this checkpoint

When opening a new SANAD development conversation, first verify live GitHub/runtime state.

Current strategic direction:

- Stage 1 is closed.
- Stage 2A Visual Foundation is CLOSED and deployed to Production (`d0f7ce82bdf1f3c3dc9f63b24328501098d98893`).
- Do not reopen or invalidate the shipped Stage 2A foundation because of the IA reframe.
- The next architecture gate is **Stage 2B.0 — Product Model Reframe**; finalize the sidebar/conversation-centered blueprint before any Stage 2B shell implementation.
- Do not continue the old four-section navigation as the target IA.
- Use short coherent Release Trains, then integrate and test on Production instead of accumulating long stacks of feature branches.

If GitHub/runtime state has advanced, update the task from reality rather than preserving this checkpoint mechanically.

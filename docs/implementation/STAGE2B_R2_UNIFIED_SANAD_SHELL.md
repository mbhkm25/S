# Stage 2B R2 — Unified SANAD Intelligence Shell

Status: implementation candidate

## Product decision

SANAD is one conversation-centric operating layer.

The old permanent primary navigation:

~~~text
سند
سند المالي
سند للأعمال
حسابي
~~~

is no longer the target information architecture.

Financial and commercial surfaces remain canonical capabilities and routes during migration, but they are reached from one SANAD navigation system.

## R2 target shell

~~~text
SANAD
├── Conversation
├── Today
├── Library
├── Work
│   ├── Tasks
│   ├── Approvals
│   └── Automations
├── Capabilities
│   ├── Personal Finance
│   └── Business
├── Connections
└── Profile / Settings
~~~

## Runtime implementation

### Conversation

The existing Assistant Workspace remains the primary conversation surface.

Its sidebar now carries the global SANAD navigation before the local conversation tabs:

- conversations;
- memory;
- assistant preferences.

Shared conversation R1 contracts remain unchanged.

### Non-conversation structured surfaces

Document/structured routes now render inside:

~~~text
ProductAppHeader
→ Unified SANAD Sidebar
→ Structured surface
~~~

The legacy ProductBottomNav is no longer rendered by the target product shell.

It remains in the repository temporarily only for compatibility with legacy surfaces/tests until a later cleanup gate.

### Entry surfaces

R2 introduces real entry routes:

- /today
- /work/tasks
- /work/approvals
- /connections

They consume the already-released D2/D3 backend contracts:

- get_my_sanad_today_v1
- list_my_sanad_work_items_v1
- list_my_sanad_connections_v1

Initial reserved surfaces also exist for:

- /library
- /work/automations

These deliberately avoid fake data or premature storage/automation implementation.

## Migration constraints

- no database migration in R2 shell v1;
- no new financial ledger;
- no business data rewrite;
- existing /financial and /commercial routes stay operational;
- Edaa remains read-only;
- Stage 1 conversation viewport/scroll ownership is preserved;
- Stage 2A visual tokens remain the design foundation;
- no permanent mobile bottom navigation in the target IA.

## Mobile

Structured routes use a shell-owned RTL drawer opened from ProductAppHeader.

Conversation keeps its existing workspace-owned mobile sidebar behavior, now with the same global navigation entries.

No Android-specific hardcoded navigation-bar height is reintroduced.

## Deferred

R2 shell v1 does not yet implement:

- Library object model v2;
- automation execution UI;
- participant management UI;
- business/spaces switcher;
- universal command/search;
- final logo / Intelligence Mark redesign;
- removal of every legacy route/component.

Those follow after the shell proves stable.

## Release gate

Before merge:

1. TypeScript PASS.
2. route contracts PASS.
3. Stage 1 viewport/scroll contract PASS.
4. Stage 2A visual foundation contract PASS.
5. Stage 2B R1 shared runtime contract PASS.
6. R2 unified-shell contract PASS.
7. Production build PASS.
8. bundle budget PASS.
9. Desktop visual smoke required before Production deploy.

Production rollout is separate from merge.

## R2.V — Persistent Sidebar Correction (2026-09-24)

Status: implementation candidate; Production unchanged.

### Root cause

The first R2 preview rendered different global sidebars: the SANAD conversation route
owned a navigation sidebar inside the Assistant Workspace, while /today, /financial
and /business/manage mounted the separate global sidebar. Passing route tests did not
prove stable information architecture or consistent spatial memory.

### Corrected ownership contract

FinancialWorkspaceShell mounts exactly ONE SanadUnifiedSidebar *above* route selection.
It stays mounted across client-side transitions among all target product routes.
The compact ProductAppHeader and active route belong to a separate main column.

Global sidebar contents, identical on every route:
- SANAD brand/identity and one prominent Open SANAD action;
- Today and Library;
- Work: Tasks / Approvals / Automations;
- Capabilities: Personal Finance / Business;
- Connections as its own destination;
- account/settings pinned to footer.

The global sidebar is 248px wide at desktop, with 13px nav labels, 17px icons,
11px group labels and 40px minimum navigation rows. Active routes receive a
semantic surface and narrow accent rather than a full dark secondary button.
Business stays selected for both /commercial and /business/manage descendants.

AssistantWorkspaceSidebar is now exclusively a CONTEXTUAL panel inside /sanad-ai:
- assistant state and selected business context;
- New Conversation;
- Conversations / participant-aware history;
- Memory;
- assistant-specific Settings.

No global destination or SANAD brand duplicate is allowed in that panel.
At xl, its width is 252px alongside the timeline; below xl, it opens as an
in-workspace drawer. Conversation timeline retains exclusive scroll ownership,
and the compact composer remains in the workspace layout slot.

### Desktop / mobile geometry

Viewport routes: shell uses h-dvh with the global sidebar beside the main column.
Document routes: the same global sidebar is sticky at viewport top while the main
content retains document flow. Header is compact utility-only inside the main
column, not full-width chrome above the sidebar.

On mobile, every route exposes the SAME global drawer from the utility header.
The conversation-context drawer is separate and cannot replace that global drawer.
No Android system-bar height is hardcoded or double-counted.

### Non-goals and safety

No DB migrations, notification changes, Edaa write permissions, financial ledger
modification, R1 collaboration changes or new semantic-response work.
The legacy ProductBottomNav remains unmounted in the target shell.

### Release gates

1. All GitHub CI checks pass against the exact final candidate SHA.
2. /sanad-ai, /today, /financial, /business/manage share identical global sidebar.
3. Context panel is confined to /sanad-ai; conversation history remains accessible.
4. Desktop 1280/1366/1440/1920, zoom 125/150, mobile 360/390/430.
5. No duplicated global/sidebar navigation and no regression to Stage 1 scroll.
6. Separate Preview and visual approval before merge/Production rollout.

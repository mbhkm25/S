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

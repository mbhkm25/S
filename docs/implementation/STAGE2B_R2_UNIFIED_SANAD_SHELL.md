# Stage 2B R2 — Unified SANAD Intelligence Shell

Status: R2.V1 refinement candidate — same PR #373, Production unchanged

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

The global sidebar belongs to the persistent SANAD shell, not to the Assistant Workspace.
Its contextual panel displays only Conversations, Memory and assistant-specific preferences.

Shared conversation R1 contracts remain unchanged.

### Non-conversation structured surfaces

All target routes use the same geometry:

~~~text
Persistent Unified SANAD Sidebar (profile + notifications) | Main Column (active route + mobile-only menu trigger)
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

Every target route opens the SAME shell-owned global RTL drawer via a compact mobile-only menu trigger in the main column.
Only the conversation route additionally has a workspace-owned contextual drawer (history, memory, assistant settings).

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
The active route belongs to the main column. The old ProductAppHeader is no longer mounted; its notification, inbox and profile utilities now live in the global sidebar. A mobile-only minimal menu trigger remains.

Global sidebar contents, identical on every route:
- SANAD brand/identity and one prominent New Conversation action;
- Today and Library;
- Work: Tasks / Approvals / Automations;
- Capabilities: Personal Finance / Business;
- Connections as its own destination;
- account/settings pinned to footer.

The global sidebar is 254px wide at desktop, with 13px nav labels, 17px icons,
11px group labels and 40px minimum navigation rows. Active routes receive a
soft cream-gray semantic surface and a small mint dot rather than a dark rectangle or thick active border.
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
content retains document flow. The main product header is removed; on mobile,
a minimal global-menu trigger is still required for access.

On mobile, every route exposes the SAME global drawer from the minimal menu trigger.
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

## R2.V1 — Conversation-Centric Shell Simplification / Creamy Surface Direction

Status: implemented on PR #373 candidate; **not merged or deployed** until final CI/preview acceptance.
Source decision: user's September 24 review of the real SANAD desktop screenshots and
the supplied talke.to visual reference (reference for restraint and mint accents,
not copied branding).

### Removed shell redundancy
- The prominent global action **فتح سند** is replaced with **محادثة جديدة**.
- From /sanad-ai, the global action dispatches a scoped in-app new-thread request.
- From other unified routes, it navigates to /sanad-ai?new=<timestamp>;
  the assistant consumes the request only after account/business context is loaded,
  clears the request from URL history and applies the existing domain-specific
  new-conversation workflow. No new free-form DB write path is introduced.
- Contextual conversation panel no longer duplicates the full-width primary CTA;
  it keeps a compact, accessible New Chat icon and the conversation/history tabs.

### Utility migration / header
- The old global ProductAppHeader is **unmounted** from FinancialWorkspaceShell.
- SANAD identity, account name/avatar, NotificationBell (including accessible business
  workspaces), payment inbox shortcut and account/settings now live in one persistent
  global sidebar. Existing providers/auth permissions are unchanged.
- Only mobile (<lg) gets a minimal menu-trigger strip to open the same global drawer.
  This is not a revived product-brand header or permanent bottom navigation.
- Global navigation stays identical on /sanad-ai, /today, /financial,
  /business/manage and all existing target shell routes.

### Design foundation, scoped
- Inspired by the *visual restraint* of the reference, **not** its brand mark or
  heavy black background: base canvas/surfaces become creamy off-white + neutral
  gray with muted mint/aqua/lime accents.
- Charcoal replaces pure black for major typography and inverse token; semantic
  status colors remain unchanged and distinct from brand green.
- New semantic aliases: --sanad-sidebar-bg, --sanad-sidebar-footer-bg,
  --sanad-nav-action-bg, --sanad-nav-active-bg, --sanad-nav-hover-bg.
- Active destination uses one subtle gray/mint surface + 6px mint indicator,
  restrained font weight, consistent 13px labels; *no thick active edge or dark
  stacked rectangles*. Active state of Business includes /business/manage descendants.
- Full page-by-page visual migration of legacy business/finance surfaces remains
  explicitly outside R2.V1.

### Validation and safety
- Updated R2, Stage 2A and viewport contract tests to reflect the no-header shell.
- **Pending**: final SHA CI pass + Desktop/Mobile Preview, New Chat from both
  /sanad-ai and /today, header utility parity, notifications, R1 collaboration
  smoke, viewport/scroll and Android safe-area revalidation.
- Production is unchanged and PR #373 remains open pending approval.

### Follow-ups / do not silently include in this PR
- Authenticated application-root (/) entrypoint audit: currently legacy routing may
  still enter the legacy application before target /sanad-ai; address as a separate
  compatibility-reviewed bootstrap gate, preserving unauthenticated login/public URLs.
- Evaluate merging conversation-history UI into global sidebar in a later controlled
  UX train only if proven superior; current contract preserves a route-local
  contextual panel so global destination hierarchy stays spatially stable.
- No database, ledger, ERP write, notifications engine, new app integrations or
  user-wallet implementation in this visual shell train.

## R2.V2 — Unified Conversation History and Vertical SANAD Brand (2026-09-24)

**Status:** candidate implementation within PR #373. Exact candidate SHA must be taken
from the PR at validation time. No merge or Production rollout has been authorized.

### Approved UI decisions

1. The current SANAD logo image already contains the Arabic wordmark. Remove the
   duplicate adjacent text "سند", increase the logo display size (expanded sidebar
   ~48px high) and stack the description **مساحة الذكاء والتشغيل below the logo**.
   This is a lockup/layout change using the existing asset, not a new logo design.
2. Make the primary category headings **المحادثات / العمل / القدرات** visually
   distinct with semibold 12px labels and restrained cream/soft-green tinted
   background; do not convert each navigation link into an oversized card.
3. Move the participant-aware **conversation history into the ONE persistent
   global sidebar**, including read/unread badges, shared/viewer role cues,
   owner-only archive, and local title/summary search for the latest 50 returned
   threads. The history lists a limited initial set with an explicit More control
   rather than consuming the full sidebar height by default.
4. Preserve contextual memory and assistant settings inside a separate
   **on-demand** workspace overlay. Do not maintain another constantly visible
   sidebar for basic conversation navigation.
5. Offer desktop sidebar collapse/expand, with a local UI preference preserved
   in localStorage; mobile always expands its drawer independent of that desktop
   preference. This UI preference is not a financial source or account-wide
   backend preference.
6. Consolidate account/profile/settings into one expandable footer control,
   preserving notifications and the payment-inbox shortcut. Do not duplicate
   "الحساب والإعدادات" as both a permanent nav destination and a separate
   profile footer entry.
7. Keep global New Conversation as the main action; local contextual memory
   panel may retain a compact secondary keyboard-accessible shortcut.

### Source of truth and state contract

- Global history reads ONLY `listSanadAgentThreads(50)` backed by the existing
  participant-aware R1 RPC, with no new database table or bypass.
- Selecting a thread from the global sidebar dispatches a UI selection event
  if the assistant is mounted, or navigates with a one-time `?thread=`
  request. The assistant resolves the requested ID against its own authorized
  active-thread listing before loading the thread.
- Archiving from the global sidebar uses the existing owner-gated archive RPC
  and notifies the assistant to reconcile selected state.
- The assistant notifies the shell on thread/read-state changes. The shell
  refreshes its read model when the app regains focus; do not claim realtime
  cross-device history synchronization beyond R1's existing thread events.
- Timeline remains the sole chat scroll owner; Composer remains the non-scrolling
  workspace slot. Only the sidebar's global navigation list scrolls.
- Future full-history search/pagination, pinned conversations, delete/reference-
  conversation actions and advanced global entity search remain independently
  scoped features. The current quick filter searches only fetched metadata.

### Follow-up sequencing

- **R2.V2 gate:** same-SHA CI + local preview on /sanad-ai, /today, /financial,
  /business/manage, mobile drawer, zoom 125/150, creation from two routes,
  sidebar collapse, owner archive, viewer restrictions, account utilities and
  a no-double-sidebar visual review.
- **R2.V3:** conversation response/status/card polish: explicitly distinguish
  `draft_created` / pending approval / posted operations, avoid generic
  `تم التنفيذ` when only a draft was created, correct currency decimals
  by ISO currency/unit convention and maintain provenance/freshness badges.
- **R2.V4 / later trains:** broader finance/business surface migration,
  selected mobile native safe-area revalidation, and cross-device visual QA.
  No mass screen recoloring is a dependency for the R2.V2 gate.
- **D-ARCH → Context/Actions/Connections:** retain existing roadmap and schema
  governance; this sidebar work adds no schema migration, ERP writes or
  financial action changes.

**Release discipline:** PR remains open; Production remains on the last
separately verified deployment. Do not merge until visual/runtime proof is
accepted on the exact passing CI candidate.

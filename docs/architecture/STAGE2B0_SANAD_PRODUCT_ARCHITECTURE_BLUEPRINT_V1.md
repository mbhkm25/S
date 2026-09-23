# Stage 2B.0 — SANAD Product Architecture Blueprint v1

**Status:** Draft for product approval  
**Date:** 2026-09-22  
**Stage:** 2B.0 — Product Model Reframe  
**Type:** Architecture / Product Blueprint only  
**Runtime code:** NOT STARTED  
**Active product model:** SANAD as a Conversation-Centric Operating Layer  
**Depends on:** Stage 2A CLOSED, Production baseline d0f7ce82bdf1f3c3dc9f63b24328501098d98893  
**Current repository main when drafted:** 7a6371e79e6c47ac9a48d430db35c86c4406e802

**Database gap report:** `docs/architecture/STAGE2B0_DATABASE_ARCHITECTURE_GAP_REPORT_V1.md`

**Important:** Stage 2B.0 is now a combined Product + Data Architecture gate. Unified Shell implementation must not begin until the database/relationship/connection/event/knowledge architecture is approved at design level.

**Stage 2B.0 data architecture package now includes:**
- `STAGE2B0_DATABASE_ARCHITECTURE_GAP_REPORT_V1.md`
- `STAGE2B0_DB_A_IDENTITY_RELATIONSHIP_SCOPE_V1.md`
- `STAGE2B0_DB_B_CONVERSATION_COLLABORATION_V1.md`
- `STAGE2B0_DB_C_CONNECTIONS_ARCHITECTURE_V1.md`
- `STAGE2B0_DB_D_EVENTS_WORK_NOTIFICATIONS_V1.md`
- `STAGE2B0_DB_E_KNOWLEDGE_MEMORY_GLOSSARY_V1.md`
- `STAGE2B0_DB_F_INTELLIGENCE_ACTION_RECONCILIATION_AGREEMENTS_V1.md`
- `STAGE2B0_EDAA_PROFIT_COST_COVERAGE_AUDIT_V1.md`
- `STAGE2B0_PROPOSED_DATA_ARCHITECTURE_V2.md`
- `STAGE2B0_DATA_MIGRATION_COMPATIBILITY_PLAN_V1.md`

---

## 0. Executive decision

Stage 2B must not redesign the existing four-section Product Shell incrementally.

The target shell is a **single SANAD shell centered on conversation, context, and work**, with one navigation model across devices.

The product rule is:

> **SANAD is the product; Finance, Business, Connections, Work, and relationship views are capabilities/surfaces inside SANAD.**

The interaction rule is:

> **Conversation-first, not conversation-only.**

The responsive rule is:

> **One information architecture, multiple responsive presentations.**

Desktop uses a persistent/collapsible sidebar. Mobile uses the same sidebar information architecture inside a drawer/sheet. The legacy four-item bottom navigation is retired during Stage 2B migration and is not replaced by another permanent mobile bottom navigation.

---

# 1. Verified current implementation

This blueprint was written against the actual current repository rather than the previous conceptual model.

Current implementation facts:

### 1.1 Product Shell

FinancialWorkspaceShell.tsx currently owns:
- shared Product App Header;
- SPA-aware route location;
- four-area product state;
- legacy ProductBottomNav;
- current viewport/document layout split;
- action FAB for Financial/Commercial.

### 1.2 Primary navigation

ProductBottomNav.tsx currently represents four peer areas:

~~~text
SANAD / Assistant
Financial
Business
Account
~~~

On desktop it becomes a fixed vertical rail. On mobile it becomes a fixed bottom navigation.

This is now a **transitional component**, not the target navigation architecture.

### 1.3 Product header

ProductAppHeader.tsx currently owns:
- SANAD logo/version;
- payment inbox;
- notification control;
- profile/account entry.

The target Stage 2B shell should absorb or relocate these utilities so a large global product header is not required above every work surface.

### 1.4 SANAD AI sidebar

AssistantWorkspaceSidebar.tsx already provides useful primitives:
- new conversation;
- conversation list;
- memory;
- assistant settings;
- business context;
- responsive mobile drawer behavior.

However it is currently scoped only to SANAD AI and duplicates navigation responsibility with the Product rail/header.

Stage 2B should promote this concept into the **global SANAD sidebar**, rather than layering another shell around it.

### 1.5 Route architecture

Current Product Shell routes include:
- /sanad-ai
- /financial
- /financial/*
- /commercial
- /commercial/actions
- /account-center

There are also legacy application routes outside the Product Shell.

Stage 2B must preserve current deep links and lazy route boundaries during migration.

### 1.6 Performance contract

The current shell has valuable route splitting and bundle budgets. Stage 2B must preserve:
- lazy Product Shell routes;
- lazy SANAD Agent workspace;
- isolated legacy application gate;
- SPA-aware navigation;
- modifier-click browser behavior;
- bundle-budget enforcement.

A new shell is not permission to regress performance.

---

# 2. Target SANAD shell

The target user-facing shell is:

~~~text
SANAD Shell
├── Global Sidebar
│   ├── Brand / Shell Control
│   ├── New Conversation
│   ├── Search / Command
│   ├── Today
│   ├── Conversations
│   ├── Library
│   ├── Work
│   │   ├── Tasks
│   │   ├── Approvals
│   │   └── Automations
│   ├── Capabilities
│   │   ├── Personal Finance
│   │   ├── Business
│   │   └── future native capabilities
│   ├── Connections
│   │   ├── SANAD Bridge
│   │   └── future external connectors
│   ├── Businesses / Spaces
│   └── Profile / Settings
│
├── Primary Surface
│   ├── Conversation
│   ├── Today
│   ├── Library
│   ├── Work Surface
│   ├── Capability Surface
│   ├── Connection Surface
│   └── Business / Relationship Surface
│
└── Context Inspector [Stage 2C]
~~~

The sidebar is the navigation owner.

There must not remain:
- a four-domain Product rail;
- a second Assistant-only navigation sidebar;
- a permanent mobile bottom navigation representing product domains;
- a separate peer “Account” product.

---

# 3. Navigation hierarchy

## 3.1 Fixed shell controls

At the top of the sidebar:

~~~text
SANAD identity / wordmark
Collapse / expand control
+ New conversation
Search / Command
~~~

New Conversation is a first-class action and should not be hidden inside a tab.

Search/Command may initially be a visible search action opening the future command surface. Full universal search arrives later, but the shell reserves the location now.

## 3.2 Primary destinations

Recommended persistent destinations:

~~~text
Today
Conversations
Library
~~~

These are primary SANAD concepts.

Conversations may be represented both as:
- a section label;
- recent conversation items directly under it.

It does not need a separate landing page in Stage 2B.1 unless useful.

## 3.3 Work group

Collapsed group by default unless attention requires visibility:

~~~text
Work
  Tasks
  Approvals
  Automations
~~~

Today is not nested under Work because it is the daily briefing entry point across all domains.

## 3.4 Capabilities group

~~~text
Capabilities
  Personal Finance
  Business
~~~

Future additions may include:
- Reports;
- Documents;
- Collections;
- other native SANAD capabilities.

Capabilities are native SANAD abilities, not external integrations.

## 3.5 Connections group

~~~text
Connections
  SANAD Bridge
  future connectors
~~~

Connections describe external systems and their state.

They must expose provenance/freshness/read-write policy when relevant.

## 3.6 Businesses / Spaces

This group lists user-relevant contexts, not merely owned businesses.

Examples:

~~~text
Personal
Bahkum Honey
Business B
Business C
~~~

A future user may have different relationships:
- owner;
- customer;
- supplier;
- team member.

The shell must therefore avoid assuming that every listed business is user-owned.

## 3.7 Utility footer

Fixed at sidebar bottom:

~~~text
Profile
Notifications / attention utility where appropriate
Settings
Subscription / plan via profile menu
Help/support if introduced
Logout
~~~

Do not keep “My Account” as a peer navigation item.

---

# 4. Sidebar behavior

## 4.1 Desktop ≥ 1280px

Default:
- sidebar expanded;
- target width approximately 272–292px;
- current 284px Assistant sidebar is a reasonable starting benchmark;
- primary surface owns remaining viewport.

User can collapse.

Collapsed state:
- approximately 64–72px;
- icons only for top-level destinations;
- accessible tooltip/label on hover/focus;
- recent conversation titles hidden;
- clicking Conversations/New Chat should expand when richer content is required.

The collapse state is a shell preference, not a domain preference.

Initial persistence should be device-local unless an existing preference contract can absorb it safely. Do not create a database migration only to remember sidebar width.

## 4.2 Desktop / tablet 768–1279px

Preferred behavior:
- compact rail or hidden sidebar;
- explicit expand control;
- expansion may overlay the primary surface rather than permanently reducing it.

Do not squeeze complex nested navigation into an unusably narrow column.

## 4.3 Mobile < 768px

No persistent bottom navigation.

Use:
- minimal top workspace bar;
- menu button;
- current surface/context title where needed;
- global sidebar as an RTL drawer from the right;
- full conversation/work surface;
- composer at safe bottom.

Target stack:

~~~text
Minimal mobile workspace bar
↓
Primary Surface / Timeline
↓
Composer if conversation
↓
Safe-area bottom clearance
~~~

The global drawer uses the same IA as Desktop.

No separate mobile-only information architecture.

---

# 5. Global header decision

The current full-width ProductAppHeader should be retired progressively.

The target shell does **not** need a large permanent global header above every screen.

Its responsibilities move as follows:

### SANAD logo / version
→ Sidebar top.

Version should not compete visually with the main product identity. It may move to:
- About;
- settings;
- profile menu;
- diagnostic footer;
rather than remain directly under the logo at all times.

### Profile
→ Sidebar footer / utility menu.

### Notifications
→ Today / attention utility / profile utility depending final interaction.

### Payment inbox
→ Work/Approvals or relevant Business capability rather than a permanent global top icon if its semantics are operational.

### Workspace title
→ Optional compact contextual header inside the Primary Surface.

Result:
- less vertical chrome;
- more room for conversation/work;
- one shell identity instead of header + rail + Assistant sidebar.

---

# 6. Conversation as default intent surface

The default SANAD experience is conversation-centric.

Recommended startup behavior:

1. If there is a last active conversation that can be safely reopened, restore it.
2. Otherwise open a new conversation.
3. Users may later choose Today as their default startup preference.
4. Morning briefing may be surfaced proactively when enabled, without forcing Today as the global home.

This preserves conversation-first behavior while still making Today operationally important.

---

# 7. Conversation management contract

Stage 2B should consolidate conversation navigation into the global sidebar.

Target conversation actions:

~~~text
Open
Rename
Pin / Unpin
Archive
Delete
Share [where allowed]
Reference in new conversation [Stage 2C capability]
Create task [later Work integration]
~~~

## 7.1 Recent conversations

Sidebar should prioritize recent/pinned conversations.

Do not render an unbounded history list.

Recommended model:
- pinned;
- recent;
- “Show all” / archive entry;
- search later.

## 7.2 Archive vs delete

Archive is reversible visibility/state management.

Delete is destructive and should require explicit confirmation appropriate to retention rules.

Do not overload Archive as Delete.

## 7.3 Current Assistant tabs

The existing Assistant sidebar tabs should be dissolved:

### Chats
→ Global Conversations.

### Memory
→ Profile/Settings → Personalization/Memory.

### Settings
→ Profile/Settings → SANAD preferences.

The assistant workspace itself should not own a second settings/navigation system after Stage 2B.

---

# 8. Context / Space model

The shell needs one visible concept for “what context am I operating in?”

Working architectural term:
**Context / Space**

This may be represented by:
- Personal;
- a selected business;
- a relationship context.

The final Arabic label is intentionally not locked by this blueprint.

Potential UI terms for later product review:
- السياق;
- المساحة;
- النشاط;
- ضمن.

## 8.1 Context visibility

A conversation with business context must make that context visible.

Do not hide it only in backend thread metadata.

Possible visible locations:
- conversation header/context chip;
- composer context chip;
- sidebar current-space selector.

Exact final visual placement belongs to Stage 2B implementation review.

## 8.2 Conversation context behavior

Recommended v1 rule:
- a conversation retains its context;
- opening a conversation restores that context;
- a new conversation launched inside a Business/Space inherits that context;
- a global New Conversation defaults to Personal/General unless the user explicitly chooses another context;
- context changes must be visible.

Existing thread-level business_id is a useful migration bridge, but the long-term context contract is broader than business_id.

## 8.3 Avoid implicit context mutation

Selecting a different Business/Space should not silently rewrite an existing conversation's historical context.

A context switch while inside a conversation should either:
- start a new conversation in the selected context; or
- require explicit confirmation to change context if technically supported.

---

# 9. Today — Operational Briefing

Today is not a generic dashboard.

Its contract:

> **Tell me what needs attention now, why it matters, and what I can do.**

Target categories may include:
- pending approvals;
- overdue receivables;
- promised payments;
- sync failures/staleness;
- unresolved claims;
- important financial notifications;
- inventory or operational thresholds;
- security/system follow-up;
- tasks due today.

## 9.1 Stage boundaries

Stage 2B:
- defines and exposes Today entry point;
- may use existing safe read models for an initial read-only briefing.

Stage 2D:
- builds mature Work Item/Event projection;
- prioritization;
- action execution;
- scheduled/event automations.

Do not invent duplicate backend tables merely to make Today look populated in Stage 2B.

## 9.2 Conversation bridge

Every Today item should support a natural transition:

~~~text
Today item
→ inspect
→ ask SANAD
→ draft action
→ approval if required
~~~

---

# 10. Library

Library is a first-class SANAD surface, not only “uploaded files.”

Long-term object families:
- attachments;
- generated reports;
- statements;
- invoices/documents;
- images;
- exported artifacts;
- saved analyses;
- templates;
- future structured outputs.

## 10.1 Stage 2B scope

Stage 2B may provide:
- Library entry point;
- initial file/artifact listing using existing sources only.

Stage 2G expands Library into a richer cross-entity system.

Do not create duplicate file metadata if an existing canonical source can be projected.

## 10.2 Provenance

Every Library item should eventually retain:
- source;
- originating conversation/entity;
- created time;
- owner/permissions;
- current validity/freshness when applicable.

---

# 11. Work model

The previous “Work Center” concept is intentionally decomposed.

Target user-facing model:

~~~text
Today
Tasks
Approvals
Automations
~~~

## 11.1 Tasks
Human-actionable work with owner/status/due semantics.

## 11.2 Approvals
Explicit review/approval queue for governed actions.

Examples:
- payment claim;
- draft transaction;
- draft commercial document;
- sensitive changes.

## 11.3 Automations
User-configured scheduled/event-driven routines.

Examples:
- morning briefing;
- due reminder;
- stale sync alert;
- collection follow-up.

Stage 2B exposes navigation/entry surfaces.

Stage 2D owns the mature operational model.

---

# 12. Capabilities

Capabilities are native work domains within SANAD.

## 12.1 Personal Finance

Current /financial functionality remains canonical.

During Stage 2B:
- remove it from peer product navigation;
- expose it under Capabilities;
- preserve its routes and lazy loading;
- render inside the unified shell.

Do not rewrite the ledger or financial backend.

## 12.2 Business

Current /commercial and existing Business routes remain canonical work surfaces.

During Stage 2B:
- expose Business as a capability/context;
- preserve current route compatibility;
- avoid duplicating business functions in sidebar and old route cards.

## 12.3 Reports/Documents

Do not immediately promote every existing feature into a top-level Capability.

Only expose stable capabilities that have a clear product role.

---

# 13. Connections

Connections are external integration objects.

## 13.1 SANAD Bridge

Target user-facing role:
- connection status;
- connected accounting source;
- freshness;
- last synchronization;
- supported read capabilities;
- write policy;
- diagnostics/attention.

Current Edaa policy remains:
**read-only toward Edaa.**

## 13.2 Connector taxonomy

Future connectors might include:
- Edaa;
- Odoo;
- QuickBooks;
- Custom SQL;
- other approved systems.

Do not expose raw vendor schemas in user-facing SANAD.

Adapters should normalize into canonical SANAD entities/actions.

---

# 14. Businesses / Spaces

Business contexts should not be confused with Capabilities.

“Business” capability = tools for business operations.

“Business/Space” = a concrete context/relationship.

Example:

~~~text
Capability:
Business Operations

Spaces:
Bahkum Honey
Business B
Business C
~~~

Selecting a Space changes context, not the product identity.

## 14.1 Relationship-aware future

The shell must be compatible with the user being:
- owner;
- customer;
- supplier;
- team member.

Do not label every Business/Space item as “my business.”

---

# 15. Search / Command

Reserve a first-class shell trigger now.

Target future command surface:
Ctrl/Cmd+K

Search domains:
- conversations;
- customers;
- suppliers;
- businesses;
- invoices;
- transactions;
- reports;
- files;
- commands/actions.

Stage 2B may ship a shell trigger before the full universal command registry exists.

Do not add a large dependency solely to draw an empty command palette.

---

# 16. Profile / Settings architecture

Profile/Settings is a utility layer.

Target categories:
- Personal profile;
- Security;
- Subscription;
- Devices;
- Notifications;
- Preferences;
- Memory / personalization;
- SANAD response preferences;
- Logout.

Current /account-center remains a compatibility route during migration.

The new shell should not advertise “Account” as a peer domain.

---

# 17. Desktop shell composition

Target:

~~~text
┌─────────────────────────────────────────────────────────────┐
│ Global SANAD Sidebar │ Primary Surface │ Inspector [later] │
│                      │                 │                   │
│ fixed/collapsible    │ full height     │ optional          │
└─────────────────────────────────────────────────────────────┘
~~~

Shell rules:
- shell owns viewport;
- no page-level global scroll for conversation mode;
- primary surface owns its intended scroll;
- composer remains a non-scroll slot in conversation;
- sidebar owns independent scroll region;
- inspector later owns independent scroll.

For document/work surfaces:
- shell still owns global composition;
- the work surface may use its own document scroll contract.

No magic calc(100dvh - N) tied to guessed header heights.

---

# 18. Mobile shell composition

Target:

~~~text
┌─────────────────────────────┐
│ Menu  Context/Title  Action │  compact workspace bar
├─────────────────────────────┤
│                             │
│ Primary Surface             │
│ / Conversation Timeline     │
│                             │
├─────────────────────────────┤
│ Composer when applicable    │
├─────────────────────────────┤
│ safe-area clearance         │
└─────────────────────────────┘
~~~

Sidebar opens as RTL drawer.

Rules:
- no permanent product bottom nav;
- no duplicate Assistant drawer;
- no floating ambiguous circular control;
- menu control has stable position in workspace bar;
- safe-area contract from Stage 2A remains;
- keyboard/viewport behavior preserves Stage 1 contract;
- drawer has independent scroll;
- touch targets ≥ 44px where practical.

---

# 19. Workspace header model

Not every surface needs a header.

## Conversation
Minimal or no large title header.

Possible compact controls:
- menu/sidebar;
- conversation title;
- visible context;
- share/more actions.

## Structured work surface
Compact contextual header may contain:
- back/breadcrumb;
- entity/title;
- context;
- primary action;
- Ask SANAD.

Avoid duplicate:
- global header;
- route header;
- card header;
- internal section header
for the same information.

---

# 20. Routing migration strategy

Stage 2B should change shell composition before aggressively renaming URLs.

## 20.1 Preserve existing routes initially

Keep working:
- /sanad-ai
- /financial
- /financial/*
- /commercial
- /commercial/actions
- /account-center
- legacy routes needed by current workflows.

These routes should render inside the new unified shell where practical.

## 20.2 New shell routes

Potential new entries:
- /today
- /library
- /tasks
- /approvals
- /automations
- /connections

Exact route names are implementation details but should be stable and deep-linkable.

## 20.3 Future canonical route cleanup

Later trains may introduce cleaner entity/context routes.

Do not combine a large URL migration with the first shell migration unless evidence shows it is necessary.

## 20.4 Redirect policy

Old routes should use:
- route aliases;
- safe redirects;
- compatibility wrappers.

Do not break bookmarks or PWA navigation without a migration path.

---

# 21. Product navigation migration map

| Current | Target placement | Stage 2B behavior |
| --- | --- | --- |
| /sanad-ai | Conversation | Remains default conversation route inside Unified Shell |
| /financial | Capabilities → Personal Finance | Preserve route, remove peer-nav status |
| /commercial | Capabilities → Business / selected Business context | Preserve route, remove peer-nav status |
| /account-center | Profile / Settings utility | Preserve route during migration |
| ProductBottomNav | Retired | Remove after unified sidebar parity |
| ProductAppHeader | Retired/absorbed | Move responsibilities into sidebar/workspace utilities |
| AssistantWorkspaceSidebar | Promoted/recomposed | Become global sidebar concepts, remove Assistant-only duplication |
| Assistant memory tab | Settings / Personalization | Move out of conversation nav |
| Assistant settings tab | Settings | Move out of conversation nav |
| Assistant conversations tab | Global Conversations | Promote to shell |

---

# 22. Migration sequence for Stage 2B implementation

## 2B.1A — Shell skeleton

Build UnifiedSanadShell without removing old route contracts.

It owns:
- global sidebar;
- primary surface slot;
- mobile drawer;
- responsive shell state;
- profile utility placement.

Keep existing page content.

## 2B.1B — Navigation parity

Expose:
- New Conversation;
- Today;
- Conversations;
- Library;
- Capabilities;
- Connections;
- Businesses/Spaces;
- Profile/Settings.

Only show production entries that have a valid surface/route. Target IA may be broader than initially visible UI.

## 2B.1C — Conversation sidebar migration

Move:
- conversations;
- new conversation;
- business context affordance

from Assistant-only sidebar into global shell.

Move:
- memory;
- assistant preferences

to Profile/Settings.

## 2B.1D — Legacy chrome retirement

After parity is proven:
- remove ProductBottomNav;
- remove duplicate Assistant drawer;
- retire ProductAppHeader where responsibilities have moved;
- remove floating/sidebar trigger geometry made obsolete by the new workspace bar.

## 2B.1E — Mobile hardening

Validate:
- drawer;
- composer safe-area;
- keyboard;
- PWA standalone;
- Android WebView;
- no bottom-nav dependency;
- no double safe area.

---

# 23. Data and backend impact

Stage 2B shell migration should be **frontend-first**.

Do not add database schema merely to implement navigation.

Existing backend objects should be reused:
- threads;
- preferences;
- memories;
- business access/read models;
- account/profile;
- notifications.

New database work is justified only if a required Stage 2B user contract cannot be represented safely by current sources.

Today mature event projection, Action Registry, and Work Items belong to later stages unless a minimal existing projection already exists.

---

# 24. State ownership

Target state ownership:

### Shell owns
- sidebar expanded/collapsed/open;
- active route;
- current shell-level context;
- mobile drawer state;
- profile utility visibility;
- global command trigger.

### Conversation owns
- active thread;
- messages;
- composer;
- attachments;
- voice;
- agent run state.

### Capability surface owns
- local filters;
- selected records;
- form state.

### Context layer [Stage 2C]
- canonical current entity/view/period/filter/selection contract.

Do not make the global shell own detailed financial/business form state.

---

# 25. Personalization

Initial shell preferences:
- sidebar expanded/collapsed;
- pinned conversations;
- pinned businesses/spaces where supported;
- default start surface later;
- morning briefing enabled later.

Do not auto-rearrange critical navigation based on AI inference.

Recommendations may be offered explicitly.

---

# 26. Accessibility

Required shell behaviors:
- full keyboard access;
- visible focus;
- correct aria-current;
- drawer focus management;
- Escape closes mobile/overlay drawer;
- collapse control has accessible label;
- tooltips for collapsed icons;
- semantic headings;
- RTL logical properties;
- reduced motion support;
- no hover-only access to destructive conversation actions.

---

# 27. Performance guardrails

Stage 2B must preserve or improve current performance.

Guardrails:
- keep route-level lazy loading;
- do not import all Finance/Business surfaces into shell entry;
- lazy-load Today/Library/Work if non-trivial;
- avoid large UI frameworks;
- avoid large icon packages;
- do not eagerly load legacy application runtime;
- preserve product navigation bundle budgets or create explicit revised budgets with evidence.

The global sidebar must remain lightweight.

Conversation list virtualization is unnecessary until measured history size proves need.

---

# 28. Visual guardrails

Use Stage 2A foundation.

Do not create a new visual system in Stage 2B.

Rules:
- one SANAD identity;
- no four-section themes;
- minimal chrome;
- sidebar hierarchy through spacing/typography, not boxes;
- recent conversations as flat rows;
- limited separators;
- no nested card navigation;
- context chips restrained;
- structured work surfaces only where semantically meaningful.

---

# 29. Legacy component disposition

## ProductBottomNav
**Disposition:** RETIRE in Stage 2B after parity.

## ProductAppHeader
**Disposition:** ABSORB responsibilities then RETIRE/REDUCE.

## AssistantWorkspaceSidebar
**Disposition:** REFACTOR/DECOMPOSE into global sidebar + settings surfaces.

## FinancialWorkspaceShell
**Disposition:** EVOLVE or replace with a generic UnifiedSanadShell while preserving route lazy loading.

## FinancialWorkspaceRoute
**Disposition:** PRESERVE as capability content during shell migration; later refactor visual/IA debt.

## productNavigation.ts
**Disposition:** PRESERVE SPA navigation semantics; generalize type model away from four fixed ProductArea values.

Do not destroy proven navigation behavior before replacement tests exist.

---

# 30. Navigation type model

Current:

~~~ts
type ProductArea = 'assistant' | 'financial' | 'business' | 'account';
~~~

This type is now too narrow for the target IA.

Stage 2B should migrate toward a more general shell destination model.

Conceptual:

~~~ts
type SanadShellDestination =
  | 'conversation'
  | 'today'
  | 'library'
  | 'tasks'
  | 'approvals'
  | 'automations'
  | 'finance'
  | 'business'
  | 'connections'
  | 'profile';
~~~

Do not hard-code Businesses/Spaces as a finite union because they are entity/context instances.

The exact TypeScript contract may differ; the architectural rule is to stop encoding the old four-peer model in core navigation types.

---

# 31. Conversation context UI

A business-bound conversation should expose context without consuming large vertical space.

Target concept:

~~~text
[ Bahkum Honey ▾ ]
~~~

This may sit:
- in compact workspace header; or
- adjacent to composer.

It should support:
- inspect context;
- change for a new conversation;
- clear if permitted.

Do not place a large permanent “business context card” above every conversation.

---

# 32. Empty conversation state

Keep it minimal.

Target:
- SANAD identity mark;
- concise prompt;
- optional relevant quick actions;
- visible context if non-general.

Avoid:
- large product marketing description;
- multiple explanatory cards;
- duplicate identity/header layers.

Quick prompts should become context-aware later.

---

# 33. Today attention semantics

The sidebar may display an attention count only when backed by real data.

Examples:

~~~text
Today        5
Approvals    2
~~~

Counts must represent actionable items, not marketing notifications.

No red badge inflation.

---

# 34. Notifications

Notifications and Work are related but not identical.

Notifications:
- informational events;
- confirmations;
- updates.

Work items:
- require attention/action.

Target behavior:
- important actionable notification may generate/link a Work Item;
- not every notification becomes a task.

Do not overload Today with every notification.

---

# 35. Profile / notification utility decision

The current header notification bell may survive temporarily during migration.

Final Stage 2B target:
- notification access lives in sidebar utility or Today/notification surface;
- profile is sidebar footer;
- no need for full-width header just to hold these controls.

This should be removed only after replacement access is proven.

---

# 36. Business selector migration

Current Assistant behavior requests a business when a new conversation has multiple businesses and no businessId.

Stage 2B should evolve this into general context selection.

During migration:
- preserve existing thread business_id;
- do not break current multi-business conversation creation;
- replace modal/card-like business choice with shell context semantics when ready.

No business context should be guessed silently.

---

# 37. Memory model placement

Long-term memory remains distinct from financial truth.

User-facing placement:
Profile / Settings → Personalization / Memory

Conversation may provide:
- visible explicit references;
- context packs;
- per-thread context.

Do not keep Memory as a permanent peer tab beside Chats in the global navigation.

---

# 38. Settings placement

Assistant response settings:
- save history;
- memory;
- proactive insights;
- response cards

move into Settings/Personalization or SANAD preferences.

Operational performance diagnostics should not be prominent user navigation.

Performance metrics may live in:
- advanced settings;
- diagnostics;
- admin surfaces.

Do not make the consumer sidebar a monitoring console.

---

# 39. Mobile safe-area

Stage 2A contract remains authoritative:

~~~text
effective bottom clearance
=
max(actual safe-area inset, SANAD design breathing floor)
~~~

Stage 2B revalidates this with:
- conversation composer;
- drawer;
- bottom sheets;
- Android WebView/PWA.

No hard-coded Android system-bar height.

---

# 40. Stage 2B.1 acceptance criteria

Stage 2B.1 is ready for integration when:

~~~text
Unified global sidebar             PASS
No duplicate Assistant sidebar     PASS
Legacy four-section nav removed    PASS after parity
Conversation remains primary       PASS
Finance route compatibility        PASS
Business route compatibility       PASS
Account/profile compatibility      PASS
Desktop collapse/expand            PASS
Mobile drawer                      PASS
No permanent mobile bottom nav     PASS
Composer safe-area                 PASS
Keyboard behavior                  PASS
SPA back/forward                   PASS
Modified-click behavior            PASS
Lazy route boundaries              PASS
Bundle budgets                     PASS
RTL/accessibility                  PASS
No Stage 1 regression              PASS
~~~

---

# 41. Stage 2B.2 / 2B.3 boundary

This blueprint recommends:

### Stage 2B.1
Unified Shell + navigation migration.

### Stage 2B.2
Conversation management refinement:
- rename;
- pin;
- archive;
- delete;
- share where supported;
- recent/pinned organization.

### Stage 2B.3
Today / Library / Work entry surfaces:
- Today;
- Library;
- Tasks;
- Approvals;
- Automations.

Do not force all three into one giant PR if implementation evidence shows risk.

They remain one Release Train and should reach Production in a small number of coherent integrations.

---

# 42. Deferred to Stage 2C+

Not part of Stage 2B implementation unless required for shell compatibility:
- full Context Inspector;
- canonical EntityLink system;
- complete SanadContext contract;
- Context Packs;
- semantic response taxonomy expansion;
- universal entity search;
- Action Registry;
- mature Work Item/Event model;
- external MCP/plugin ecosystem.

The shell should be compatible with these, not implement them prematurely.

---

# 43. Locked decisions

The following are considered locked unless new evidence justifies reopening them:

1. SANAD is the product; old four-peer IA is retired.
2. Conversation-first, not conversation-only.
3. Global sidebar is the primary navigation owner.
4. Desktop sidebar is persistent/collapsible.
5. Mobile uses drawer/sheet, not permanent four-item bottom navigation.
6. Account is utility/profile, not peer product.
7. Work Center is decomposed into Today / Tasks / Approvals / Automations.
8. Finance/Business remain canonical internal domains.
9. SANAD Bridge is a Connection/Adapter.
10. Structured work surfaces remain first-class.
11. Stage 2A visual foundation is reused.
12. Route compatibility is preserved during initial shell migration.
13. No major database redesign is required for shell migration.
14. AI financial writes remain governed by Draft → Review → Approval → Deterministic Action → Audit → Result.
15. Edaa remains read-only through current Bridge policy.

---

# 44. Open product decisions for Stage 2B.1 implementation review

These are intentionally implementation-review decisions, not blockers to approving the architecture:

- exact Arabic user-facing label for Businesses/Spaces;
- whether desktop sidebar default width is 280px or another nearby value;
- exact tablet breakpoint behavior;
- final compact workspace-bar controls on mobile;
- whether Search trigger ships active or reserved until command registry;
- initial data set exposed in Library;
- initial data set exposed in Today;
- whether notifications appear as sidebar utility, Today entry, or both;
- whether startup defaults to last conversation or a configurable policy in first release.

These should be resolved with concrete prototypes/runtime evidence, not abstract debate.

---

# 45. Stage 2B.0 Definition of Done

Stage 2B.0 is complete when:

- this blueprint is approved;
- the Production database architecture gap report is approved;
- DB-A Identity/Relationship/Scope is resolved at design level;
- DB-B Conversation/Collaboration is resolved at design level;
- DB-C Connections is resolved at design level;
- DB-D Events/Work/Notifications is resolved at design level;
- DB-E Knowledge is resolved at design level;
- Edaa profit/cost data coverage has an explicit audit result;
- DB-F Intelligence/Action/Reconciliation/Agreements is resolved at design level;
- proposed Data Architecture v2 and migration compatibility plan are approved;
- target sidebar IA is approved;
- desktop/mobile shell contracts are approved;
- route migration strategy is approved;
- legacy component disposition is approved;
- Conversation/Today/Library/Work/Capabilities/Connections/Spaces/Profile boundaries are approved;
- no runtime code was prematurely merged as part of the architecture gate;
- roadmap points Stage 2B.1 implementation to this blueprint.

After approval, Stage 2B.1 implementation may begin from latest main.

---

# 46. Recommended implementation starting point

The first implementation PR should be small enough to preserve rollback clarity but large enough to establish the new shell.

Recommended first cut:

~~~text
UnifiedSanadShell
+ GlobalSanadSidebar
+ desktop collapse
+ mobile drawer
+ existing routes rendered inside shell
+ Conversation list promoted into shell
+ Profile utility footer
+ legacy ProductBottomNav hidden/removed only after parity
~~~

Do not begin with Today backend, Library expansion, or Action Registry.

Establish the shell first.

---

# 47. Final blueprint statement

The Stage 2B target is not “a nicer navigation.”

It is a product-model migration:

~~~text
FROM:
Four peer products + assistant

TO:
One SANAD operating layer
with conversation as the primary intent surface
and structured capabilities, connections, work, and relationship contexts around it.
~~~

The shell must make that philosophy obvious without changing the integrity rules underneath the product.

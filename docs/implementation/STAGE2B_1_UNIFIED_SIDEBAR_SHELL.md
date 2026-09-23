# Stage 2B.1 — Unified Sidebar / Shell

Status: implementation candidate
Production: unchanged at authoring time

## Goal

Retire the floating desktop four-product rail and establish one SANAD-owned desktop shell.

This is a shell/navigation stage only. It does not migrate Finance or Business domain truth and it does not create placeholder backend data.

## Desktop composition

For Financial / Business / Account routes:

~~~text
Unified SANAD Sidebar
└── Product content
    ├── utility header
    └── current route surface
~~~

For SANAD Conversation on wide desktop:

~~~text
Compact global SANAD rail
└── Conversation history/context pane
    └── Conversation surface
~~~

The compact global rail is intentionally fixed-width beside the existing conversation history pane. This avoids a 264px product sidebar plus a 284px conversation sidebar consuming excessive conversation width during the 2B.1 → 2B.2 transition.

At 1024–1279px the conversation history remains a drawer; the global rail stays compact.

## Navigation hierarchy

Desktop primary:
- سند;
- المالي;
- الأعمال.

Utility:
- الحساب والإعدادات.

حسابي is no longer treated as a peer primary workspace on desktop.

The future Today / Library / Work / Connections / Businesses entries are not faked in this stage. Their real entry points belong to 2B.3 after route/data contracts exist.

## Collapse contract

The expanded desktop sidebar can be collapsed on non-conversation routes.

Local preference key:

~~~text
sanad:unified-sidebar:collapsed:v1
~~~

This is presentation-only state:
- local device;
- non-critical;
- failure to persist must never block the workspace.

The assistant route uses compact-only mode while conversation history still owns a dedicated contextual pane.

## Mobile-safe behavior

Below lg:
- the unified desktop sidebar is hidden;
- existing bottom navigation remains the mobile primary navigation owner;
- current safe-area contract is preserved;
- no Android navigation release decision is made here.

Mobile shell replacement is deferred until the unified Desktop composition is stable.

## Header ownership

Desktop:
- sidebar owns SANAD product identity/logo;
- top header remains a utility layer for notifications/profile/payment inbox.

Mobile:
- top header continues to show SANAD identity because the desktop sidebar is absent.

## Legacy rail cleanup

Removed:
- floating desktop ProductBottomNav rail;
- legacy lg:pl-32 content offsets that existed only to clear that rail.

Kept:
- ProductBottomNav component as mobile navigation;
- SPA product-navigation event contract;
- route lazy loading and prefetch;
- Product Shell authentication/notification ownership.

## Performance constraints

Do not:
- eager-load route surfaces;
- add a UI framework;
- duplicate navigation runtimes;
- reintroduce full document reloads between product routes.

The sidebar uses the existing navigateProduct, productHref, modifier-click contract, and prefetchProductArea.

## Validation

Required CI/static checks:
- Product Shell routes remain lazy;
- mobile ProductBottomNav is lg:hidden;
- UnifiedProductSidebar is mounted by the Product Shell;
- legacy lg:pl-32 offsets are absent from Product workspace/section routes;
- account/settings is a utility item;
- assistant global navigation is compact-only;
- bundle budgets remain green.

## Not included

2B.1 does not yet implement:
- conversation rename/pin/delete/share;
- Today route;
- Library route;
- Tasks / Approvals / Automations entry points;
- Connections route;
- Businesses/Spaces switcher;
- Ctrl/Cmd+K;
- mobile unified drawer;
- removal of legacy Financial/Commercial routes.

Those remain subsequent 2B stages.

# SANAD Product Navigation & Performance v1

Status: **Merged to `main` through PR #340** as part of the combined Phases 2–4 refinement release. Awaiting Production deployment.

Historical implementation branch:

`feat/sanad-refinement-phases-2-4-20260920`

Feature merge commit:

`ac9e11ba20e4d8a5ecf0dc9553225cfa211a76d9`

## Objective

Phase 3 removes two structural performance problems without changing SANAD's four-domain product model:

1. primary product navigation was causing a full application reload between the four SANAD domains;
2. the application entry point eagerly imported legacy runtimes that are irrelevant to the new product workspaces.

The four primary domains remain:

1. SANAD Agent — `/sanad-ai`
2. SANAD Financial — `/financial`
3. SANAD Business — `/commercial`
4. My Account — `/account-center`

The bottom/side product navigation remains the single owner of this domain architecture.

## Navigation contract

### Product Shell

Navigation between the four primary domains is now client-side while the shared Product Shell remains mounted.

Canonical runtime:

`src/lib/productNavigation.ts`

It provides:
- product URL construction;
- `navigateProduct()`;
- a dedicated `sanad:product-navigation` event;
- popstate synchronization;
- modified-click protection so Ctrl/Cmd/Shift/Alt clicks retain normal browser behavior.

`FinancialWorkspaceShell` owns the current product location and responds to both:
- browser back/forward;
- SANAD product navigation events.

This means shared shell state such as the app header, notification provider and authenticated session is not unnecessarily rebuilt when switching between the four primary domains.

### Legacy application boundary

`ProductBottomNav` still appears in some legacy screens.

SPA interception is intentionally enabled only when `legacyPage === undefined`, which identifies Product Shell ownership.

Legacy screens retain normal anchor navigation so crossing from the legacy application into the Product Shell performs a safe document navigation and allows `main.tsx` to select the correct application boundary.

### Single navigation owner

`PersonalFinanceSectionRoute` previously rendered its own `ProductBottomNav` while `FinancialWorkspaceShell` rendered another copy.

The route-level copy was removed.

The Product Shell is now the only primary navigation owner for financial section routes.

## Route-level code splitting

`src/features/financial/productRouteLoaders.ts` is the route loading boundary.

The Product Shell lazy-loads:
- `FinancialWorkspaceRoute`;
- `FinancialActionRoute`;
- `PersonalFinanceSectionRoute`.

Within the workspace route, additional heavy surfaces are split again:
- `SanadAgentWorkspace`;
- `PersonalFinanceOverview`.

Primary navigation performs interaction-based prefetch on pointer hover or keyboard focus.

This keeps first load small while making the next likely product transition responsive.

## Legacy runtime isolation

Before Phase 3, `src/main.tsx` statically imported:
- `OperationEntryGate`;
- operation details runtimes;
- local-first runtime controller;
- capture-first navigation runtime.

`OperationEntryGate` imports the legacy `App.tsx`, so this pulled a substantial portion of the legacy application into the entry graph even when the user opened a new Product Shell route.

Phase 3 lazy-loads these legacy runtimes and dynamically initializes:
- device ledger runtime;
- public business profile swipe/share side effects;
- Android native push initialization when applicable.

Product Shell and public report routes therefore do not pay the legacy application cost up front.

## Vendor chunking

Lucide icon modules are no longer forced into the generic `vendor` manual chunk.

Rollup can keep the actual used icons with their consumer route chunks.

This slightly increases individual route chunks but materially reduces the generic shared vendor payload.

## Measured bundle result

Baseline: Phase 2 successful production build, before Phase 3 route splitting.

Phase 3 measurement: production build after SPA navigation, lazy route boundaries and route-local Lucide handling.

| Chunk | Phase 2 raw | Phase 3 raw | Reduction | Phase 2 gzip | Phase 3 gzip | Reduction |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `app` | 453.33 KB | 7.58 KB | 98.3% | 118.29 KB | 3.23 KB | 97.3% |
| `FinancialWorkspaceShell` | 172.67 KB | 5.11 KB | 97.0% | 40.62 KB | 2.36 KB | 94.2% |
| generic `vendor` | 188.54 KB | 111.93 KB | 40.6% | 52.12 KB | 36.98 KB | 29.0% |

Phase 3 route chunks measured in the same production build:

- `FinancialWorkspaceRoute`: 16.64 KB raw / 5.32 KB gzip
- `PersonalFinanceSectionRoute`: 15.24 KB raw / 4.39 KB gzip
- `FinancialActionRoute`: 40.71 KB raw / 9.30 KB gzip
- `SanadAgentWorkspace`: 81.14 KB raw / 22.41 KB gzip
- `ProductBottomNav`: 16.76 KB raw / 5.76 KB gzip
- legacy `OperationEntryGate`: 364.37 KB raw / 92.54 KB gzip, now isolated behind a lazy boundary

The large legacy gate still exists because the legacy application still exists; Phase 3 changes when it is loaded rather than pretending that code has disappeared.

## Bundle budgets

`scripts/check-production-bundle-budget.mjs` enforces production raw-size ceilings:

- application entry: 20 KB
- Product Shell: 15 KB
- workspace route: 35 KB
- product navigation: 30 KB
- SANAD Agent workspace: 120 KB
- legacy application gate: 425 KB
- generic vendor: 150 KB

The check runs:
- in the normal Production Quality Gate immediately after the production PWA build;
- in the production deployment validation job after the production build.

Budget changes must therefore be explicit code-review decisions rather than silent regressions.

## Regression contract

`scripts/check-product-navigation-performance.ts` verifies:

- Product Shell route components remain lazy;
- product navigation remains event-driven and SPA-aware;
- browser modifier-click behavior is preserved;
- legacy ProductBottomNav usage is not intercepted as SPA;
- section routes do not render a second primary nav;
- financial action back navigation remains inside the Product Shell;
- SANAD Agent and personal finance overview remain split;
- legacy main runtimes remain lazy;
- device-ledger initialization remains legacy-only.

## Release state

Phase 3 was merged only after Phase 4 and the combined CI gates completed successfully.

Production deployment remains a separate operator action. The Production workflow revalidates TypeScript/routes, the production build, bundle budgets, and the Agent backend contract before deployment.

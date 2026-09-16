# SANAD v2 — Frontend/Backend Execution Plan

Status: **Active**  
Date: 2026-09-16  
Architecture source: `docs/architecture/SANAD_PRODUCT_ARCHITECTURE_V2.md`

## 1. Objective

Reorganize SANAD around four durable domains — AI, المالي, الأعمال, حسابي — while preserving production behavior and evolving frontend/backend contracts together.

This plan intentionally separates architecture, implementation, migration and production release. A phase is not complete because a screen renders; its backend contract, authorization and error/offline states must also be complete.

---

## 2. Safety baseline

### Completed before implementation

- GitHub baseline commit pinned: `c4a4b5a42e7ae10c47e60430c9785ca26e404e0f`
- Recovery branch created: `checkpoint/pre-sanad-architecture-v2-2026-09-16`
- Working branch created from `develop`: `feat/sanad-architecture-v2`
- Product Architecture v2 documented.

### Required before any new production DB migration

- verify production database recovery point/backup;
- capture migration ledger snapshot;
- inventory critical Storage buckets/assets;
- resolve/explicitly approve any outstanding Supabase develop -> production migration promotion;
- no experimental data written to production.

---

## 3. Phase 0 — Local/environment alignment

### Frontend/repository

1. Verify local `C:\sanad-v3` is a Git checkout of `mbhkm25/S`.
2. Preserve any uncommitted local work before updating.
3. Fetch remote refs.
4. Align local `develop` with `origin/develop` using fast-forward only.
5. Check out `feat/sanad-architecture-v2` locally.
6. Reinstall dependencies from lockfile with `npm ci`.

### Environment

Create `.env.development` from `.env.development.example` and supply development-only publishable credentials locally.

### Safety change to implement

Remove silent production fallbacks from frontend Supabase bootstrap. Development must fail closed when required environment variables are absent or malformed.

Target file:

- `src/lib/supabase.ts`

Acceptance:

- local development cannot accidentally connect to production because of a missing `.env.development`;
- no private secrets committed;
- auth storage remains stable per environment/project.

---

## 4. Phase 1 — App Shell v2 foundation

### Goal

Introduce the new domain navigation without deleting legacy flows.

### Frontend

Add:

```text
src/app-shell/AppShellV2.tsx
src/app-shell/BottomNavigationV2.tsx
src/app-shell/domainRoutes.ts
src/app-shell/domainNavigation.ts
```

Primary tabs:

- `AI`
- `المالي`
- `الأعمال`
- `حسابي`

### Feature flag

Introduce a runtime/build-safe feature flag for shell activation. Default development behavior may enable it selectively; production remains opt-in until QA.

Suggested semantic key:

`SANAD_APP_SHELL_V2`

Prefer existing runtime-flag infrastructure when appropriate rather than inventing a separate permanent flag system.

### Legacy compatibility

Existing routes/actions remain callable:

- upload/share intake
- QR scan
- verification details
- reports
- business management
- profile/account screens

The shell initially re-homes them; it does not rewrite them.

### Backend

No schema change required for the shell itself.

Acceptance:

- four primary tabs render;
- back navigation/deep links remain correct;
- legacy screens still work;
- build/lint/route checks pass;
- shell can be disabled without code rollback.

---

## 5. Phase 2 — `المالي` domain home

### Goal

Make financial SANAD a coherent domain rather than a set of unrelated navigation buttons.

### Frontend structure

```text
src/domains/financial/FinancialHome.tsx
src/domains/financial/components/FinancialQuickActions.tsx
src/domains/financial/components/FinancialRecentActivity.tsx
src/domains/financial/components/FinancialAttention.tsx
```

Initial home content:

1. concise financial summary;
2. recent operations;
3. items requiring attention/review;
4. quick actions: add operation, verify, scan QR;
5. accounts entry;
6. personal accountant entry;
7. reports entry.

### Reuse first

Reuse current:

- `UploadNotification`
- `ShareIntake`
- `VerifyNotice`
- `MyOperations`
- operation detail components
- reports components

Do not duplicate operation logic.

### Backend contract

Introduce/read through a financial home contract instead of issuing multiple screen-specific queries long-term.

Proposed first read contract:

`get_my_financial_home_v1()`

Response should be purpose-built and versioned. It may aggregate:

- latest operation summaries;
- review/attention counts;
- active personal financial accounts count;
- personal-finance availability/summary once ledger exists.

### Error model

Never display raw PostgREST/Postgres messages to end users. Map backend errors to domain-safe Arabic UX copy and retain technical details for diagnostics/logging.

Acceptance:

- financial home works with zero operations;
- works offline/degraded where currently supported;
- existing upload/verification flow remains unchanged semantically;
- no business ownership required.

---

## 6. Phase 3 — Personal accountant backend foundation

### Goal

Create a real personal accounting domain without corrupting the meaning of `operations`.

### Schema slice v1

New migration on Supabase `develop` only:

- `personal_finance_accounts`
- `personal_finance_categories`
- `personal_finance_transactions`
- `personal_finance_postings`
- `personal_finance_operation_links`

### Accounting model

Use simple UX over balanced postings.

User actions:

- income
- expense
- transfer
- liability/advance
- settlement
- adjustment

System invariant:

A posted transaction must satisfy the accounting balancing rule defined for that transaction/currency set.

### Relation to existing accounts

`user_financial_accounts` remains the external/real-world account registry.

`personal_finance_accounts` represents ledger accounts and may reference a `user_financial_accounts.id`.

### Operation linking

An operation is evidence. Linking is explicit and auditable.

Auto-suggestion is allowed; silent authoritative classification is not.

### RLS

Initial personal accounting tables are strictly user-owned:

`user_id = auth.uid()`

No business team access is implied.

### Backend contracts v1

- create transaction
- update draft/metadata where allowed
- post transaction
- list ledger activity
- get period summary
- link/unlink operation evidence

Prefer RPCs for multi-table accounting invariants.

### Tests

Required:

- expense posting balances;
- income posting balances;
- transfer is not counted as expense/income;
- evidence link is idempotent;
- cross-user access denied;
- duplicate client retry does not create duplicate posted transaction.

Acceptance:

- schema migration/history gates pass;
- RLS/advisor review completed;
- no production application yet.

---

## 7. Phase 4 — Personal accountant frontend v1

### Goal

Expose a simple personal money experience over the ledger.

### Screens

- overview
- activity/ledger
- add transaction
- accounts
- categories
- transaction details
- operation-to-accounting review

### UX principle

Do not expose debits/credits as the primary language. The user sees intent-oriented actions. Accounting mechanics stay underneath.

### Suggested first workflow

`Financial operation -> Add to my accounting -> choose expense/income/transfer -> category/account -> review -> post`

Acceptance:

- manual cash transaction works;
- linked SANAD operation works;
- transfer between two owned accounts does not inflate spending;
- summary reconciles to ledger postings.

---

## 8. Phase 5 — `الأعمال` top-level hub

### Goal

Move business navigation out of `حسابي` and make it a primary product domain.

### Frontend structure

```text
src/domains/business/BusinessHub.tsx
src/domains/business/BusinessWorkspace.tsx
src/domains/business/components/OwnedBusinesses.tsx
src/domains/business/components/TeamMemberships.tsx
src/domains/business/components/BusinessRelationships.tsx
src/domains/business/components/BusinessDiscoveryEntry.tsx
```

### Hub contexts

- أنشطتي
- أعمل فيها
- تعاملاتي
- اكتشف

### Reuse

Reuse existing `getUserBusinessContexts()` and existing business components first. Do not create a second business identity model.

### Backend

If existing contracts return too much/mixed data, version an explicit business hub read contract rather than coupling UI directly to several internal tables.

Acceptance:

- user with no business receives a clear create/discover experience;
- owner sees owned businesses;
- team member sees memberships;
- customer relationships are distinct from ownership/team roles.

---

## 9. Phase 6 — Business Workspace v2

### Goal

Turn a selected SANAD business into the central operational workspace.

### Initial workspace sections

1. الرئيسية
2. المال والتحصيل
3. العملاء
4. المبيعات
5. المنتجات والمخزون
6. الموردون والمشتريات
7. النظام المحاسبي
8. التقارير
9. الفريق
10. النشاط
11. الإعدادات

Not every section must be enabled in the first release. Missing canonical backend capability remains hidden/marked as future rather than faked.

### SANAD NEXT assets to integrate

- accounting connection status
- ERP source instance
- bridge device status
- baseline sync state
- business activity timeline
- parties/roles/source refs
- payment inbox

### Error handling requirement

Missing backend contract/migration must produce a product-level error state, never raw schema-cache/database text.

Acceptance:

- `business_id` is explicit in workspace navigation/state;
- switching business cannot leak cached data from another business;
- owner/team permissions are enforced server-side;
- ERP disconnected state is valid and useful.

---

## 10. Phase 7 — Canonical ERP read models

### Goal

Support useful business screens without copying Edaa's schema into SANAD.

Build incrementally from real fixtures/source evidence.

Priority order:

1. currencies mapping/baseline
2. customers/parties mapping
3. products/units baseline
4. sales/invoice projection
5. customer balances/settlements
6. inventory projection
7. purchases/suppliers when validated

All projections retain source provenance and revision semantics.

No write-back to ERP in this phase.

---

## 11. Phase 8 — `حسابي` cleanup

### Goal

Restrict Account to user/platform concerns.

Keep:

- profile
- verification
- security/passkeys
- notifications preferences
- subscription
- privacy/data
- help/support/about
- logout

Move out:

- business workspaces -> الأعمال
- financial accounts -> المالي
- financial notification capture -> المالي / financial settings
- business relationships -> الأعمال

Acceptance:

- Account remains useful for users with/without businesses;
- no duplicate business-management entry hierarchy remains except transitional aliases.

---

## 12. Phase 9 — AI domain re-home

### Goal

Expose assistant as a first-class tab while making tool boundaries safer and clearer.

### Backend architecture

Group tools into permission scopes:

- `financial.read`
- `financial.write` / commands requiring explicit confirmation
- `business.read:<business_id>`
- `business.write:<business_id>` / command permissions
- `account.read`
- support/help tools

AI responses are not authoritative storage. Domain services calculate authoritative figures.

### Frontend

- conversation home
- context selector
- suggested actions
- tool-result cards
- confirmation cards for mutations

Acceptance:

- assistant cannot cross business/user authorization boundaries;
- figures shown by AI can be traced to a domain tool result;
- mutating actions require explicit user approval where designed.

---

## 13. Phase 10 — Navigation migration and legacy retirement

Only after the new shell/domain pages reach parity:

- convert legacy routes to aliases/redirects where safe;
- remove old bottom navigation;
- remove duplicated home/profile entry cards;
- move files only when ownership is clear;
- update navigation QA documentation;
- update public copy from `سند التجاري` to `سند الأعمال` where that wording denotes the product domain.

Do not globally replace every Arabic occurrence without semantic review; public/legal/legacy historical text may use different wording intentionally.

---

## 14. Frontend/backend delivery matrix

| Capability | Frontend | Backend | Current action |
| --- | --- | --- | --- |
| Add/verify operation | Re-home | Existing operations pipeline | KEEP |
| QR verification | Re-home | Existing verification contracts | KEEP |
| Personal accounts registry | Re-home to المالي | `user_financial_accounts` | KEEP/EXTEND |
| Personal accountant | New | New personal finance ledger | ADD |
| Personal reports | Redesign | Existing reports + new ledger summaries | EXTEND |
| Business hub | New/re-home | Business contexts | EXTEND |
| Business payment inbox | Re-home | Existing inbox/events | KEEP |
| Customer relationships | Re-home/expand | Party/relationship + legacy customer data | EXTEND |
| ERP connection | Re-home | SANAD NEXT integration tables/functions | KEEP/EXTEND |
| ERP sales/customers/products | New | Canonical read models | ADD incrementally |
| Account/security | Simplify | Existing profile/auth | KEEP |
| Assistant | First-class tab | Existing assistant + domain tools | EXTEND |

---

## 15. Quality gates for every implementation PR

Every PR that changes a domain must satisfy relevant gates:

- TypeScript/lint
- route check
- production build
- migration history audit when schema changes
- canonical baseline checks
- Edge Function checks when changed
- RLS/security review for new tables/functions
- no raw backend errors in user-facing UI
- mobile RTL visual review
- empty/loading/error states
- no production deployment from feature branch

---

## 16. Release strategy

1. feature branch implementation;
2. PR to `develop`;
3. CI/QA on development infrastructure;
4. explicit production release decision;
5. database/Edge Function promotion coordinated with frontend release;
6. published app/APK verification;
7. rollback path remains known before release.

A frontend release that depends on unavailable production backend contracts is a release failure. Frontend and backend compatibility must be checked as one release unit.

---

## 17. Immediate next implementation slice

The first code slice after these planning documents is intentionally small and safety-focused:

### Slice A — Environment hardening + App Shell skeleton

- remove production fallback from `src/lib/supabase.ts` for development configuration;
- add `AppShellV2` and `BottomNavigationV2`;
- create route/domain definitions;
- expose the four tabs behind a feature flag;
- wire existing screens as temporary children without behavior changes;
- add user-safe backend error boundary/message mapping foundation.

No personal finance schema is created until Slice A is stable and the new shell routing is verified.

### Slice B — Financial Home re-home

- build financial home from existing capabilities;
- move scan/add/operations/reports entry points;
- define `get_my_financial_home_v1` only if current backend queries are insufficient/unstable for the target screen.

### Slice C — Personal finance schema

Only then introduce the first database migration for the personal accountant.

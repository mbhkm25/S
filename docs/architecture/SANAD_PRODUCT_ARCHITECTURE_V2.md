# SANAD Product Architecture v2

Status: **Accepted for implementation baseline**  
Date: 2026-09-16  
Working branch: `feat/sanad-architecture-v2`  
Recovery checkpoint: `checkpoint/pre-sanad-architecture-v2-2026-09-16`  
Baseline commit: `c4a4b5a42e7ae10c47e60430c9785ca26e404e0f`

## 1. Purpose

SANAD is being reorganized from a task-oriented application into a domain-oriented product shell. The bottom navigation must represent durable user domains, not isolated actions.

The four primary product domains are:

1. **AI** — intelligent cross-domain assistant.
2. **المالي** — the user's personal money and financial operations.
3. **الأعمال** — business ownership, business operations, customer relationships and ERP-connected workflows.
4. **حسابي** — user identity, security, subscription and platform preferences.

This document is the source of truth for the information architecture and domain boundaries of the next SANAD frontend/backend development phase.

---

## 2. Core product rule

A feature belongs to the domain whose primary subject owns the state:

- **المالي:** the individual user and their money.
- **الأعمال:** a `business_id` and its operational/commercial context.
- **حسابي:** the user's SANAD account and platform relationship.
- **AI:** orchestration and interpretation across authorized domain tools. AI does not become a source of financial or business truth.

A financial event can appear in more than one context without being duplicated. For example, a payment may exist as a financial operation and also be linked to a business invoice. The canonical operation remains one record; business context is represented by links/read models.

---

## 3. Primary app shell

### 3.1 Bottom navigation

The authenticated mobile shell SHALL contain exactly four primary tabs:

| Tab | Arabic label | Primary purpose |
| --- | --- | --- |
| AI | `AI` | Ask, understand, summarize and perform authorized actions |
| Finance | `المالي` | Personal financial operations and personal accounting |
| Business | `الأعمال` | Business workspaces, customers, sales, ERP and teams |
| Account | `حسابي` | Identity, security, subscription and settings |

Isolated actions such as `مسح QR` and `إضافة عملية` SHALL NOT occupy permanent bottom navigation positions. They remain prominent actions inside `المالي` and may also be exposed through contextual quick actions.

### 3.2 Utility routes

The following remain outside the four-tab hierarchy because they are deep links or special-purpose flows:

- public operation verification (`/v/:token`)
- public business profile (`/b/:slug`)
- bridge authorization (`bridge-authorize`)
- authentication/password recovery
- platform administration
- public product detail
- native/share-intake callbacks

The bottom bar may be hidden during utility routes when it would interfere with the task.

---

## 4. AI domain

### 4.1 Product responsibility

AI is the natural-language control and insight layer over SANAD. It interprets intent, selects an authorized domain tool, explains results and may initiate explicitly authorized actions.

AI SHALL NOT:

- calculate authoritative balances by free-form model reasoning;
- write directly to domain tables without a domain command/tool;
- bypass RLS or business/team permissions;
- invent financial or ERP facts when the source is unavailable.

### 4.2 Information architecture

`AI Home`

- new conversation / ask SANAD
- context selector: personal / selected business
- suggested questions
- attention summary
- recent conversations
- explain-this-operation entry point

Future surfaces:

- personal finance analysis
- business performance questions
- customer collection follow-up
- report generation
- operation lookup and explanation
- authorized task/action execution

### 4.3 Existing backend assets to reuse

Reuse and rationalize existing `sanad_assistant_*` and `sanad_knowledge_*` infrastructure rather than creating another assistant subsystem.

Primary architectural requirement: assistant tools must be grouped by domain and permission scope.

---

## 5. Financial domain — `المالي`

### 5.1 Product responsibility

The financial domain represents the user's money independently of any business ownership requirement.

The user should be able to use it even when they have no `business_profile`.

### 5.2 Target navigation tree

`المالي`

- **نظرة عامة**
  - financial snapshot
  - recent activity
  - items needing attention
  - account balances when available
  - quick actions
- **العمليات**
  - all personal upload/verification relationships
  - filters and search
  - operation details
- **إضافة عملية**
  - camera/share/upload
  - native Android Share Sheet
  - document processing
- **التحقق**
  - scan QR
  - open verification link
  - manual token/search
- **حساباتي**
  - banks/wallets/cash accounts
  - account labels
  - connection/identifier metadata
- **المحاسب الشخصي**
  - income
  - expenses
  - transfers
  - liabilities/advances
  - categories
  - personal ledger
- **التقارير**
  - period summaries
  - income vs expenses
  - account movement
  - categories
  - exported reports
- **الإعدادات المالية**
  - financial notification capture
  - import rules
  - automation preferences

### 5.3 Canonical boundary: evidence vs accounting meaning

The current `operations` table is an **evidence/verification record**, not the user's personal accounting ledger.

Rule:

`Operation Evidence -> optional Personal Finance Transaction -> Ledger Postings`

An operation may exist without becoming a personal-accounting transaction. A personal-accounting transaction may be linked to one or more evidence operations.

Examples:

- a receipt image uploaded only for verification: operation only;
- a grocery payment: operation + personal expense transaction;
- transfer between two owned accounts: operation + transfer transaction, NOT an expense;
- manually entered cash expense: personal finance transaction may exist without an uploaded operation.

### 5.4 Existing backend assets to KEEP

- `operations`
- `operation_events`
- `user_financial_accounts`
- existing operation identity/fingerprint protections
- existing local-first intake path
- existing share/QR verification pipeline
- `report_requests` where reusable

### 5.5 Backend additions for personal accounting

The initial personal finance domain SHOULD introduce these entities through new migrations only:

#### `personal_finance_accounts`

Logical accounting accounts used by the personal ledger. They may link to `user_financial_accounts` but are not identical to them.

Minimum concepts:

- `id`
- `user_id`
- `account_type` (`asset`, `liability`, `income`, `expense`, `equity`)
- `name`
- `currency`
- `linked_user_financial_account_id` nullable
- `status`
- timestamps

#### `personal_finance_transactions`

Business-friendly transaction header.

Minimum concepts:

- `id`
- `user_id`
- `transaction_type` (`income`, `expense`, `transfer`, `liability`, `settlement`, `adjustment`)
- `transaction_at`
- `description`
- `category_id` nullable
- `status`
- `source` (`manual`, `sanad_operation`, `assistant`, future imports)
- timestamps

#### `personal_finance_postings`

Double-entry postings hidden behind a simple UX.

Minimum concepts:

- `transaction_id`
- `account_id`
- `direction` or signed amount convention
- `amount`
- `currency`
- `exchange_rate` when explicitly known

Invariant: posted transaction entries must balance per currency/accounting rule.

#### `personal_finance_categories`

User-owned hierarchical categories for expenses/income and reporting.

#### `personal_finance_operation_links`

Links evidence to accounting meaning while preserving provenance.

Minimum concepts:

- `operation_id`
- `personal_finance_transaction_id`
- `link_role`
- `confidence/source`

### 5.6 Backend contracts planned for the financial shell

Prefer explicit RPC/API contracts over screen-specific direct table access.

Initial contracts:

- `get_my_financial_home_v1()`
- `get_my_financial_activity_v1(filters)`
- `get_my_financial_accounts_v1()`
- `get_my_personal_finance_summary_v1(period)`
- `create_personal_finance_transaction_v1(command)`
- `link_operation_to_personal_finance_v1(command)`

Exact names are provisional until migration implementation, but the boundaries are mandatory.

---

## 6. Business domain — `الأعمال`

### 6.1 Product responsibility

The business domain represents commercial/operational context attached to a `business_id`.

The top-level `الأعمال` page is broader than business ownership. It provides four contexts:

1. **أنشطتي** — businesses the user owns/manages.
2. **أعمل فيها** — businesses where the user is a team member.
3. **تعاملاتي** — businesses where the user has a customer/relationship context.
4. **اكتشف** — public SANAD business community/discovery.

### 6.2 Business workspace

Opening a business moves the user into a selected-business workspace.

Target workspace tree:

- **الرئيسية**
  - today summary
  - attention items
  - recent activity
  - sync/ERP health
- **المال والتحصيل**
  - payment inbox
  - matching/reconciliation
  - business financial accounts
- **العملاء**
  - parties/relationships
  - balances
  - customer timeline
  - notes/communications
- **المبيعات**
  - ERP/canonical sales read model
  - invoices
  - returns when supported
- **المنتجات والمخزون**
  - products
  - units
  - stock read model when available
- **الموردون والمشتريات**
  - parties with supplier role
  - purchase read model when available
- **النظام المحاسبي**
  - accounting connections
  - bridge devices
  - source instances
  - baseline/sync state
  - mapping/reconciliation issues
- **التقارير**
  - business-specific reports
- **الفريق**
  - members
  - roles
  - permissions
- **النشاط**
  - public profile
  - catalog
  - locations
- **الإعدادات**
  - business-level configuration only

### 6.3 Business identity model

Canonical hierarchy:

`SANAD User -> Business Profile -> Business Location -> Accounting Connection -> ERP Source Instance -> Bridge Device`

The user's SANAD identity authorizes setup and administration. Background bridge synchronization uses device identity, not a long-lived human session.

### 6.4 Existing backend assets to KEEP/EXTEND

KEEP/EXTEND:

- `business_profiles`
- `business_locations`
- `business_team_members`
- `business_financial_accounts`
- `business_payment_inbox`
- `business_payment_inbox_events`
- `business_operation_links`
- `business_parties`
- `business_party_roles`
- `business_party_source_refs`
- `business_customer_*`
- `business_activity_events`
- `business_accounting_connections`
- `business_erp_source_instances`
- `business_bridge_devices`
- `business_bridge_device_credentials`
- `business_bridge_authorization_sessions`
- `business_erp_raw_events`
- `business_erp_currency_mappings`
- `business_erp_baseline_runs`

The current frontend concept named "workspace" remains an application concept over business/profile/team data. Do not create a parallel merchant identity merely to support SANAD NEXT.

### 6.5 Canonical business read models still to ADD

Do not mirror Edaa tables directly.

Add source-independent canonical projections as vertical slices mature, such as:

- canonical sales/invoices
- sale lines
- receipts/settlements
- customer balances
- products/units
- inventory snapshots/movements
- purchases when supported

Every canonical record must preserve provenance to source instance/raw event/revision.

---

## 7. Account domain — `حسابي`

### 7.1 Product responsibility

`حسابي` is restricted to the user's identity and relationship with the SANAD platform.

### 7.2 Target tree

- personal profile
- phone/email verification
- security and login
- passkeys
- sessions/devices when supported
- notification preferences
- subscription/plan
- privacy/data
- help and support
- about SANAD
- logout

### 7.3 Items that MOVE OUT of Account

Move to `المالي`:

- financial accounts
- financial notification capture/runtime settings
- operation center when it is primarily financial

Move to `الأعمال`:

- owned businesses
- team memberships
- business relationships
- business management
- business public profile management

Account must stop being the catch-all navigation hub.

---

## 8. Cross-domain rules

### 8.1 One source of truth per fact

- uploaded/verified financial evidence -> `operations`
- personal accounting interpretation -> personal finance ledger
- business commercial activity -> canonical business read models/activity events
- business ownership/team access -> business/team domain
- AI conversation -> assistant domain

Presentation may aggregate across domains, but storage ownership must remain explicit.

### 8.2 Linking, not copying

Use linking tables/projections when one fact participates in another domain.

Examples:

- operation ↔ personal finance transaction
- operation ↔ business payment inbox/business operation link
- business activity ↔ party relationship
- ERP raw event ↔ canonical sale/activity projection

### 8.3 RLS and authorization

Every new table must have a declared owner/authorization rule before UI integration.

- personal finance: `auth.uid()` ownership only unless explicitly shared in future
- business: business owner/team permission predicates
- customer self-service: explicit shared-domain contracts; never internal business tables exposed by UI hiding
- bridge: service/device authorization contracts only
- AI: tool authorization inherits the target domain; AI does not grant access

---

## 9. Frontend restructuring strategy

### 9.1 No big-bang rewrite

Existing production features remain available while the new shell is introduced behind a feature flag.

Recommended feature flag:

`SANAD_APP_SHELL_V2`

The flag may be controlled initially by development config/runtime flag. It must not silently activate for production users before QA.

### 9.2 Proposed frontend module layout

```text
src/
  app-shell/
    AppShellV2.tsx
    BottomNavigationV2.tsx
    routes.ts
    domain-context.ts
  domains/
    ai/
    financial/
    business/
    account/
  shared/
    components/
    navigation/
    errors/
```

Existing components may be wrapped/reused first, then moved gradually. Avoid moving large files only for aesthetics before the new navigation is stable.

### 9.3 Route direction

Preferred durable route namespaces:

```text
/ai
/financial
/financial/operations
/financial/add
/financial/verify
/financial/accounts
/financial/accounting
/financial/reports
/business
/business/:businessId
/business/:businessId/customers
/business/:businessId/sales
/business/:businessId/accounting-system
/account
/account/security
/account/subscription
```

Legacy routes can remain as aliases during migration.

---

## 10. Frontend ↔ backend contract rule

No new primary screen is considered complete until all four are defined:

1. user job and screen states;
2. backend contract/read model;
3. authorization/RLS behavior;
4. loading/error/empty/offline behavior.

Do not build production UI against undefined backend semantics.

---

## 11. Current source assessment

At the baseline commit:

- `src/App.tsx` owns a large page-switch and the current four action-oriented bottom tabs.
- `src/components/Home.tsx` currently mixes financial verification and business/community discovery.
- `src/components/ProfileOverviewV3.tsx` currently mixes account settings with business management and financial accounts.
- existing feature modules already include operations, reports, business intelligence, notifications, local-first, passkeys, push and PWA concerns.

Therefore the v2 architecture is primarily a controlled decomposition and re-homing effort, not a rewrite of every feature.

---

## 12. Environment and source-of-truth rules

### 12.1 GitHub

GitHub repository `mbhkm25/S` remains the code source of truth.

Development work SHALL branch from `develop` and reach `main` only through reviewed/green release flow.

### 12.2 Local checkout

The local `C:\sanad-v3` checkout must be synchronized using Git, not manual file copying.

Generated folders such as `node_modules`, `dist` and `dist-admin` are not source-of-truth artifacts.

### 12.3 Environment files

- commit templates/examples only;
- never commit private/service-role secrets;
- local development uses development Supabase credentials;
- development must fail closed if required configuration is missing;
- remove production fallback behavior from frontend bootstrap during the first implementation safety slice.

---

## 13. Recovery and change-safety policy

The pre-v2 state is pinned by:

- baseline commit `c4a4b5a42e7ae10c47e60430c9785ca26e404e0f`
- recovery branch `checkpoint/pre-sanad-architecture-v2-2026-09-16`

Before new production database migrations:

- capture/verify a production database backup/recovery point;
- record current migration ledger;
- separately account for Storage assets;
- apply schema changes through migrations only;
- test on Supabase `develop` before promotion.

The development branch is not itself a backup of production user data.

---

## 14. Non-goals for the first v2 slice

Do not attempt all of the following at once:

- full accounting ERP replacement;
- complete inventory engine;
- write-back to Edaa;
- microservices split;
- redesign every legacy component;
- unrestricted AI agent actions;
- production migration before development contracts/tests are green.

---

## 15. Definition of success for Architecture v2 phase

This architecture phase is considered established when:

- the four-tab shell is implemented behind a feature flag;
- legacy actions are reachable from their new domains;
- account page no longer carries business/financial ownership responsibilities;
- financial domain has a backend plan for personal accounting and its first schema migration is tested on `develop`;
- business domain can open a selected business workspace and preserve existing business-management capabilities;
- AI has an explicit domain-tool boundary;
- route, type, build and migration quality gates pass;
- no production data/schema is altered until a separate release decision.

---

## 16. Architecture decisions locked by this document

1. Use **الأعمال**, not **التجاري**, as the primary business-domain label.
2. Bottom navigation represents domains, not actions.
3. `operations` remains financial evidence, not the personal accounting ledger.
4. Personal accounting uses a separate ledger domain with operation links.
5. A business is rooted in existing SANAD business identity, not a parallel merchant entity.
6. ERP integration is subordinate to a SANAD business and location.
7. Human login authorizes bridge setup; device identity performs background synchronization.
8. AI orchestrates authorized domain tools and never becomes the financial/business source of truth.
9. Existing production logic is migrated incrementally; no big-bang rewrite.
10. Frontend and backend evolve together through explicit contracts.

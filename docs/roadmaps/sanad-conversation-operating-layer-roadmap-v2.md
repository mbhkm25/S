# SANAD Conversation-Centric Operating Layer Roadmap v2

**Status:** Active roadmap  
**Adopted:** 2026-09-22  
**Product model:** SANAD as a Conversation-Centric Operating Layer  
**Primary architecture:** `docs/architecture/sanad-conversation-operating-layer-v2.md`  
**Supersedes for delivery planning:** `docs/roadmaps/sanad-financial-commercial-account-ai-roadmap.md`

---

## 1. Delivery model

SANAD development moves to short, coherent **Release Trains**.

Default cadence:

```text
2–3 related stages
→ Integration candidate
→ Full CI
→ Desktop Production
→ Real use
→ Next train
```

A single large milestone may ship alone when risk or scope requires it.

Current execution policy:
- Desktop-first;
- mobile-safe;
- Android physical hardening at defined release checkpoints;
- no long stacks of unmerged feature branches;
- Production feedback is part of product validation.

---

## 2. Product direction

The target product model is no longer four peer sections.

Adopted direction:

```text
SANAD
├── Conversation
├── Today
├── Library
├── Work
│   ├── Tasks
│   ├── Approvals
│   └── Automations
├── Capabilities
├── Connections
├── Businesses / Spaces
└── Profile / Settings
```

Finance and Business remain canonical internal domains but become capabilities and work surfaces inside SANAD.

---

# Release Train 2A — Visual Foundation

**Status:** CLOSED — Production baseline `d0f7ce82bdf1f3c3dc9f63b24328501098d98893`

Stage 2A shipped the visual foundation to Production and remains valid under the conversation-centric product model.

## 2A.1 — Semantic Color System
- brand / accent;
- backgrounds / surfaces / borders;
- text / muted text;
- focus / selection;
- success / warning / danger / info;
- explicit separation of Brand Green and Success Green;
- light-first with dark-readiness.

## 2A.2 — Typography / Spacing / Radius / Elevation
- retain Noto Sans Arabic self-hosted variable unless benchmark disproves it;
- professional Arabic type scale;
- thinner headings;
- spacing scale;
- radius discipline;
- restrained elevation;
- long Arabic strings and mixed Arabic/Latin/currency validation.

## 2A.3 — Core Visual Primitives / Signatures
- semantic surfaces;
- section headers;
- status chips;
- icon containers;
- list/row density;
- Assistant / Finance / Business / Account signatures as accents only;
- no separate theme per old section.

## 2A.4 — Safe Area / Shell Foundation
- bottom safe-area contract;
- composer → app nav → interaction clearance;
- Android/iOS safe-area compatibility;
- no hard-coded system-bar height;
- mobile bottom navigation above device controls;
- preserve Stage 1 viewport/scroll contracts.

## 2A.V — Visual Validation
- desktop: 1280 / 1366 / 1440 / 1920;
- zoom 125 / 150;
- mobile: 360 / 390 / 430;
- active/inactive contrast;
- safe-area device check;
- representative structured response;
- Financial/Business/Account smoke;
- defect-only hardening.

### 2A release gate
Ship to Production when:
- CI PASS on one final SHA;
- desktop visual validation PASS;
- mobile safe-area PASS;
- no functional regression.

---

# Release Train 2B — Product Reframe & Unified SANAD Shell

This train replaces the former plan to refine the four-section shell.

## 2B.0 — Product Model Reframe

**Status:** BLUEPRINT DRAFTED — awaiting product approval before runtime implementation.

**Canonical blueprint:** `docs/architecture/STAGE2B0_SANAD_PRODUCT_ARCHITECTURE_BLUEPRINT_V1.md`

**Documentation/architecture gate. No major implementation before approval.**

Finalize:

### Sidebar IA
- New Conversation;
- Today;
- Conversations;
- Library;
- Work;
- Capabilities;
- Connections;
- Businesses / Spaces;
- Search/Command;
- Profile/Settings.

### Concept contracts
- Capability;
- Connection;
- Business/Space;
- App/Extension;
- Work Item;
- Context Pack;
- Conversation reference.

### Migration map
Map existing:
- `/sanad-ai`;
- `/financial`;
- `/commercial`;
- `/account-center`;

to the new shell without deleting working routes prematurely.

### Work Center decomposition
Replace the former monolithic target with:
- Today;
- Tasks;
- Approvals;
- Automations.

### Account migration
Move account identity/settings to utility/profile position rather than peer navigation.

### Deliverable
A signed-off Product Architecture Blueprint before shell refactor.

The blueprint locks:
- one global SANAD sidebar as navigation owner;
- Desktop persistent/collapsible sidebar;
- Mobile RTL drawer with no permanent product bottom navigation;
- conversation as default intent surface;
- migration of Account to Profile/Settings utility;
- decomposition of Work Center into Today / Tasks / Approvals / Automations;
- Capabilities vs Connections vs Businesses/Spaces taxonomy;
- route compatibility during the first shell migration;
- retirement plan for ProductBottomNav, ProductAppHeader, and Assistant-only navigation duplication.

---

## 2B.1 — Unified Sidebar / Shell

Implement a desktop-first SANAD shell where:
- SANAD conversation is the default primary surface;
- sidebar becomes primary navigation;
- old four-peer rail is retired progressively;
- sidebar can collapse/expand;
- mobile uses a safe drawer/sheet/bottom-compatible composition;
- profile/settings move to utility area;
- current conversation remains first-class.

Do not yet migrate every Financial/Business page.

---

## 2B.2 — Conversation Management

Implement coherent conversation operations:
- new;
- rename;
- pin;
- archive;
- delete;
- share where allowed;
- reference conversation in a new conversation.

Prepare explicit conversation metadata for future Context Packs.

---

## 2B.3 — Today / Library / Work Entry Points

Create the shell-level entry points and contracts for:
- Today;
- Library;
- Tasks;
- Approvals;
- Automations.

They may begin with existing data/read models where available.

Do not invent duplicate backend truth just to populate the shell.

### 2B release gate
Production release after unified shell and entry points are stable on Desktop, mobile-safe, and route compatibility is preserved.

---

# Release Train 2C — Intelligence Context & Entity Layer

## 2C.1 — SANAD Context Contract

Build a canonical application context layer:
- current workspace/view;
- current entity;
- business/space;
- period;
- filters;
- selection.

The shell/work surfaces publish context; Intelligence consumes it.

---

## 2C.2 — Entity Links & Context Inspector

Canonical entity links for:
- Customer;
- Supplier;
- Business;
- Invoice;
- Transaction;
- Financial Account;
- Product;
- Document;
- Report;
- Conversation;
- Draft;
- Approval;
- Work Item;
- Sync State.

Flow:

```text
Entity link
→ Preview
→ Context Inspector
→ Full View
→ Ask SANAD about this
```

Desktop: side inspector.  
Mobile: sheet/route composition.

---

## 2C.3 — Semantic Responses

Standardize response types:
- Snapshot;
- Record;
- Report;
- Draft;
- Approval;
- Execution Result;
- Warning.

Add provenance/freshness:
- source;
- last sync;
- derived vs canonical;
- read-only ERP markers.

Keep narrative conversation flat; only meaningful structured data receives structured surfaces.

---

## 2C.4 — Context Packs / Conversation References

Allow a new conversation to explicitly reference:
- another conversation;
- entity;
- report;
- statement;
- file;
- business/space.

Do not rely only on hidden memory.

### 2C release gate
Ship when entity navigation, context propagation, semantic responses, and conversation references work together.

---

# Release Train 2D — Action & Operational Work Model

## 2D.1 — SANAD Action Registry

Converge UI and AI actions onto one typed action layer.

Each action should define, as applicable:
- schema;
- authorization;
- read/write classification;
- target entity;
- provenance;
- approval policy;
- audit policy;
- idempotency;
- result schema.

Priority principle:

> Do not build one execution path for UI and another for AI.

---

## 2D.2 — Approval / Audit Hardening

Extend the existing Draft → Review → Approve → Execute model.

Target approval binding:
- user;
- exact action;
- exact argument hash;
- expiry;
- single-use where appropriate.

Preserve:
- mandatory financial audit;
- non-fatal operational telemetry.

---

## 2D.3 — Today / Tasks / Approvals

Build operational work projection from real domain events.

Examples:
- overdue invoices;
- stale sync;
- pending approval;
- customer claim;
- promised payment;
- inventory threshold;
- security follow-up.

`Today` becomes an operational briefing, not a generic dashboard.

---

## 2D.4 — Automations

Support:
- schedule-triggered actions;
- event-triggered actions;
- user-visible limits;
- audit;
- approval when required.

Initial examples:
- morning briefing;
- overdue follow-up;
- stale sync alert;
- due payment reminders.

### 2D release gate
Ship when work items and actions are deterministic, permissioned, auditable, and understandable.

---

# Release Train 2E — Capabilities & Connections

## 2E.1 — Personal Finance Capability

Migrate personal finance from peer product to SANAD capability/work surface while retaining canonical personal-finance ownership.

Includes progressively:
- overview;
- accounts;
- transactions;
- budgets;
- obligations;
- goals;
- reports;
- capture/intake.

No duplicate ledger.

---

## 2E.2 — Business Capability

Migrate business operations from peer product to capability/work surfaces:
- business overview;
- customers/parties;
- documents;
- statements;
- collections/payments;
- catalog/inventory where supported;
- team;
- reports;
- accounting-system health.

Canonical business data boundaries remain.

---

## 2E.3 — Connections / SANAD Bridge

Formalize Connections UI/model.

SANAD Bridge becomes:
- connection status;
- source provenance;
- freshness;
- supported capabilities;
- read-only/write policy;
- diagnostics.

Current Edaa policy remains read-only toward Edaa unless a later approved architecture changes it.

Prepare adapter boundaries for future ERP connectors.

### 2E release gate
Ship when Finance, Business, and Bridge feel like coherent SANAD capabilities rather than three separate products.

---

# Release Train 2F — Business Relationship Network

## 2F.1 — Business Spaces / Relationship Roles

Model user relationship to each business:
- owner;
- customer;
- supplier;
- team member;
- other explicit roles.

One user may hold different relationships with different businesses.

---

## 2F.2 — Customer-facing business relationship

Allow authorized customer visibility into:
- statements;
- invoices;
- payments;
- review/dispute state;
- business communications/requests where supported.

Never expose business-private data outside relationship authorization.

---

## 2F.3 — Claims / Confirmations

Introduce governed relationship flows such as:

```text
Customer submits payment claim
→ Draft/Claim
→ Business review
→ Approval
→ Canonical action / ERP path
→ Statement update
→ Notification
→ Audit
```

No customer claim becomes accounting truth without governed confirmation.

---

# Release Train 2G — Search, Command, Library & Ecosystem

## 2G.1 — Universal Search / Command

`Ctrl/Cmd+K` searches:
- customers;
- suppliers;
- invoices;
- transactions;
- reports;
- conversations;
- businesses;
- commands.

Use a command registry with context-sensitive availability.

---

## 2G.2 — Library v2

Expand Library across:
- files;
- generated reports;
- statements;
- documents;
- images;
- templates;
- saved analyses;
- conversation artifacts.

Keep provenance and entity identity.

---

## 2G.3 — Quick Create

Context-aware create flow:
- finance;
- business;
- draft action;
- document;
- conversation;
- task.

Natural language may create drafts but not bypass approval.

---

## 2G.4 — Extensions / MCP / External Agents — research gate

Only after Action Registry, Context, Permissions, and Audit are stable:
- evaluate SANAD MCP server;
- external assistants;
- third-party apps/extensions;
- adapter SDK.

Do not expose raw ERP or privileged Supabase internals.

---

# Android / Mobile Hardening Track

Android physical hardening remains a cross-cutting track, not a blocker after every desktop-oriented PR.

Checkpoints should include:
- safe-area;
- keyboard;
- PWA standalone;
- Capacitor WebView;
- microphone;
- signed Android release/update path;
- responsive shell;
- touch targets.

A Production Android release is a separate release decision from Web/PWA.

---

# Persistent architecture rules

Throughout all release trains:

1. One canonical financial truth per domain.
2. Explicit multi-currency; no silent conversion.
3. Conversation-first, not conversation-only.
4. AI does not own the ledger.
5. Writes use deterministic actions and approval where required.
6. Mandatory financial audit is never treated as best-effort telemetry.
7. Operational telemetry must not break the primary operation.
8. Bridge remains read-only toward Edaa until explicitly redesigned.
9. Context is explicit; do not infer critical entity identity from UI text.
10. Entity provenance/freshness must be visible where trust matters.
11. Desktop-first currently; mobile-safe always.
12. Release in coherent trains instead of long unmerged stacks.
13. No large UI/agent framework migration without a measured need.
14. Stage 2A foundation remains valid under the new product model.

---

# Immediate next steps

Current sequence:

```text
Stage 2A
Visual Foundation
→ CLOSED / Production

then

Stage 2B.0
SANAD Product Model Reframe
→ architecture blueprint
→ no premature shell rewrite

then

Stage 2B
Unified SANAD Intelligence Shell
```

Do not continue the old four-section-navigation roadmap as the target architecture.

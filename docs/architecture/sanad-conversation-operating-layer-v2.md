# SANAD Conversation-Centric Operating Layer v2

**Status:** Active product architecture decision  
**Adopted:** 2026-09-22  
**Scope:** Product philosophy, information architecture, operating model, navigation direction, capability taxonomy  
**Supersedes for user-facing IA:** `docs/architecture/sanad-product-domains-v1.md` four-section navigation model  
**Does not supersede:** canonical financial/business data ownership, authorization, audit, provenance, or accounting integrity rules

---

## 1. Product thesis

SANAD is no longer modeled as four peer products where SANAD AI is one section beside Financial, Business, and Account.

The adopted model is:

> **SANAD is the product. Finance, business, connections, automation, and commercial relationships are capabilities of SANAD.**

SANAD becomes a **Conversation-Centric Operating Layer** that connects the user to personal finance, businesses, legacy accounting systems, documents, tasks, automations, and trusted commercial relationships.

The primary intent surface is conversational, but the product is **not conversation-only**.

### Governing principle

> **Conversation-first, not conversation-only.**

Conversation is the default place to express intent, ask, analyze, create drafts, and move between contexts. Structured work surfaces remain first-class for tasks that are poor fits for chat: large statements, inventory tables, approvals, configuration, reports, and dense operational inspection.

---

## 2. Product identity

Preferred product description:

> **SANAD is a conversational operating layer for personal finance, businesses, and commercial relationships.**

Arabic formulation:

> **سند هو طبقة ذكاء وتشغيل تربط الإنسان بأمواله وأعماله والأنظمة التي يستخدمها والعلاقات التجارية التي يتعامل معها.**

SANAD is not primarily:
- a chatbot;
- a four-tab financial app;
- an ERP replacement;
- a marketplace;
- a banking wallet.

SANAD is an orchestration and trust layer over canonical financial/business sources and connected systems.

---

## 3. User-facing information architecture

The previous peer navigation:

```text
SANAD AI
SANAD Financial
SANAD Commercial
My Account
```

is retired as the target product model.

The new shell is centered on SANAD itself.

Target sidebar model:

```text
+ New conversation

Today
Conversations
Library

Work
  Tasks
  Approvals
  Automations

Capabilities
  Personal Finance
  Business
  Reports / Analysis
  Future capabilities

Connections
  SANAD Bridge
  ERP/accounting connectors
  Future external systems

Businesses / Spaces
  Personal
  Bahkum Honey
  Other businesses / contexts
  Discover / connect to businesses

Search / Command
Profile / Settings
```

This is a product model, not a requirement to show every group expanded at all times. The sidebar is customizable and context-aware.

---

## 4. Core product concepts

### 4.1 Conversations

Conversations are persistent operational contexts, not disposable chat transcripts.

Conversation actions may include:
- rename;
- archive;
- delete;
- pin;
- share;
- reference in another conversation;
- create a task from a conversation;
- create a report/artifact;
- attach entities, files, or context packs.

A conversation may reference other conversations explicitly.

### 4.2 Today

`Today` is the operational briefing surface.

It should answer:

> What needs my attention now?

Examples:
- overdue invoices;
- expected collections;
- pending approvals;
- stale ERP sync;
- inventory thresholds;
- promised payments;
- unresolved customer claims;
- system/security actions.

The goal is not another dashboard. It is an **Operational Briefing** that can lead directly into SANAD conversation and deterministic actions.

### 4.3 Library

The Library is broader than a file browser.

It may contain:
- files;
- reports;
- statements;
- invoices;
- images;
- generated artifacts;
- saved analyses;
- templates;
- exported structured results.

Library objects should retain entity identity, provenance, permissions, and source conversation where relevant.

### 4.4 Tasks, Approvals, Automations

The former “Work Center” concept is decomposed into clearer operational surfaces:

```text
Today
Tasks
Approvals
Automations
```

These may share a common Work Item/Event model internally, but users should not be forced into one oversized “Work Center” screen.

### 4.5 Capabilities

Capabilities are native SANAD abilities.

Examples:
- Personal Finance;
- Business Operations;
- Reports and Analysis;
- Documents;
- Collections;
- Inventory where supported.

Capabilities are not top-level products competing with SANAD. They are tools and structured work surfaces opened when needed.

### 4.6 Connections

Connections integrate SANAD with external systems.

Examples:
- SANAD Bridge;
- Edaa;
- future ERP adapters;
- future banking/email/messaging connectors where approved.

A Connection is not a Capability.

### 4.7 Businesses / Spaces

Users can operate across multiple contexts.

Examples:
- personal;
- Bahkum Honey;
- another owned business;
- a business where the user is a customer;
- a business where the user is a supplier or team member.

A Space/context may contain:
- conversations;
- entities;
- files;
- memory/context;
- connections;
- permissions;
- automations.

“Spaces” is a working architectural term. Final user-facing naming may change.

### 4.8 Apps / Extensions

Apps/extensions are a later ecosystem layer, not the current name for native SANAD capabilities or connectors.

Future examples might include payroll, shipping, tax, or third-party CRM extensions.

---

## 5. Conversation + Work Surfaces

The target interaction model is:

```text
Conversation
= primary intent surface

Structured Work Surface
= primary inspection/execution surface when density demands it
```

Examples:

```text
User: "Open Ali's statement"
        ↓
Conversation preview / structured response
        ↓
Open full statement
        ↓
Customer Statement Work Surface
        ↓
"Ask SANAD about this"
```

SANAD should never force a 500-row table, large inventory, approval queue, or complex configuration into chat only.

---

## 6. Context contract

SANAD must know what the user is currently looking at.

Target context contract:

```ts
type SanadContext = {
  workspace?: string;
  view?: string;

  entity?: {
    type: string;
    id: string;
  };

  businessId?: string;
  period?: {
    from?: string;
    to?: string;
  };

  filters?: Record<string, unknown>;
  selection?: Record<string, unknown>;
};
```

The exact implementation may evolve, but the principle is fixed:

> **The shell and work surfaces publish explicit application context; SANAD Intelligence consumes that context rather than guessing it.**

This enables:
- “Ask SANAD about this”;
- entity-aware conversation;
- context inspector;
- command/search;
- conversation references;
- context packs.

---

## 7. Context Packs

A new conversation may explicitly inherit selected context.

Example:

```text
New conversation with:
- Previous conversation
- Customer statement
- September report
- Bahkum Honey context
```

Context Packs are preferred over relying only on opaque long-term memory.

Memory remains useful, but explicit references should be visible and auditable.

---

## 8. Entity model

SANAD operates over canonical entities.

Important entity families include:
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
- User;
- Sync State.

Entities should use canonical IDs and support:
- Preview;
- Context Inspector;
- Full View;
- Ask SANAD about this;
- provenance/freshness;
- permission-aware links.

---

## 9. Shared operating core

The long-term operating architecture is:

```text
                    SANAD
                      │
            Conversational Core
                      │
        ┌─────────────┼─────────────┐
        │             │             │
      Context       Memory        Library
        │             │             │
        └─────────────┼─────────────┘
                      │
              Intelligence Layer
                      │
               Action Registry
                      │
        ┌─────────────┼─────────────┐
        │             │             │
    Approval        Audit       Automations
        │             │             │
        └─────────────┼─────────────┘
                      │
                  Entities
                      │
      ┌───────────────┼────────────────┐
      │               │                │
Personal Finance   Businesses       Network
                                       │
                ┌──────────────────────┼─────────────┐
                │                      │             │
              Bridge                 APIs        Native SANAD
                │
         Legacy Accounting
```

---

## 10. SANAD Action Registry

SANAD should converge toward one canonical action layer used by:
- UI controls;
- SANAD Intelligence;
- command palette;
- Today/Tasks/Approvals;
- automations;
- future MCP/external-agent integrations.

Conceptual examples:

```text
customer.statement.read
invoice.read
transaction.read

receipt.draft.create
payment.draft.create
invoice.draft.create

draft.approve
draft.reject
payment.execute
```

Each action should know, as applicable:
- input schema;
- permissions;
- read/write classification;
- target entity;
- provenance;
- approval requirement;
- audit requirement;
- result schema;
- idempotency behavior.

Do not build duplicate execution paths for UI and AI.

---

## 11. Approval and audit boundary

The approved operating model remains:

```text
Intent
→ Entity Resolution
→ Draft
→ Review
→ Explicit Approval
→ Deterministic SANAD Action
→ Audit
→ Result
```

Approval should eventually bind to:
- user;
- action;
- exact arguments/hash;
- expiry;
- single-use consumption where appropriate.

AI must not silently mutate canonical financial data.

### Telemetry vs mandatory audit

Stage 1 established:

> **Operational telemetry must be non-fatal to the primary user operation.**

This does not weaken mandatory financial audit.

Distinction:
- observability/metrics → best effort;
- financial/security audit required by operation integrity → mandatory contract.

---

## 12. SANAD Bridge

SANAD Bridge is strategically redefined as:

> **A compatibility layer that makes legacy accounting systems usable by SANAD Intelligence without forcing the business to replace them.**

Model:

```text
Legacy ERP
↓
SANAD Bridge / Adapter
↓
Canonical SANAD model
↓
SANAD Intelligence
```

Current Edaa integration remains read-only toward Edaa.

Longer-term, multiple adapters may expose the same canonical SANAD contracts:

```text
Edaa Adapter
Odoo Adapter
QuickBooks Adapter
Custom SQL Adapter
...
```

SANAD should know canonical actions/entities, not internal schemas of every ERP.

---

## 13. Business-customer relationship layer

SANAD is not only a tool owned by a business.

A user may be:
- owner of Business A;
- customer of Business B;
- supplier to Business C;
- team member of Business D.

SANAD should model the relationship explicitly.

Target relationship capabilities may include:
- shared statement visibility;
- invoices and payments;
- disputes/review requests;
- customer-submitted payment claims;
- business approval;
- audited updates;
- notifications to both sides.

Example future flow:

```text
Customer reports payment
↓
Payment Claim / Draft
↓
Business approval
↓
Deterministic action
↓
ERP / canonical record
↓
Statement update
↓
Customer notified
↓
Audit recorded
```

This is a trust/relationship layer, not a second uncontrolled ledger.

---

## 14. Personalization

The sidebar and startup experience should be user-configurable.

Potential preferences:
- enabled capabilities;
- pinned businesses/spaces;
- pinned conversations;
- quick actions;
- default startup surface;
- morning briefing enabled;
- favorite commands.

SANAD may recommend personalization, but should not silently rearrange critical navigation without user approval.

---

## 15. Profile and account

“My Account” is not a peer product.

Profile/account utilities belong at the bottom of the main shell, similar to a utility layer:

- profile;
- security;
- subscription;
- devices;
- notifications;
- preferences;
- logout.

The existing account routes may remain during migration.

---

## 16. Migration principle

The architecture changes the user-facing product model, not canonical data ownership.

Existing Financial and Commercial boundaries remain useful internally for:
- data ownership;
- RPC ownership;
- authorization;
- accounting invariants;
- provenance;
- testing.

The migration must avoid:
- duplicating ledger data;
- creating “AI copies” of financial truth;
- deleting proven routes before replacement;
- changing Bridge write policy implicitly;
- moving everything into chat.

---

## 17. Implementation sequence

### Stage 2A — Visual Foundation

Continue unchanged.

Stage 2A remains valid because color, typography, surfaces, spacing, safe-area, and shared primitives are independent of the new IA.

### Stage 2B.0 — Product Model Reframe

Documentation/architecture gate before shell implementation:
- final sidebar IA;
- Today;
- Library;
- Work surfaces;
- Capabilities;
- Connections;
- Businesses/Spaces;
- Profile utilities;
- context switching;
- full work surfaces;
- conversation references;
- Bridge role;
- customer/business relationship model.

### Stage 2B — Unified Intelligence Shell

Implement the conversation-centric shell and migrate away from the four-peer-section navigation.

### Later release trains

See `docs/roadmaps/sanad-conversation-operating-layer-roadmap-v2.md`.

---

## 18. Non-goals of this decision

This decision does not itself:
- redesign all current pages;
- activate marketplace/e-commerce behavior;
- create an external plugin ecosystem now;
- grant AI direct financial writes;
- change Edaa read-only policy;
- replace Supabase;
- replace the current Agent runtime;
- require migration to another agent framework.

---

## 19. Decision summary

The adopted product direction is:

> **B — SANAD as a Conversation-Centric Operating Layer.**

Key consequences:
1. SANAD is the primary product identity.
2. Conversation is the default intent surface.
3. Finance and Business become capabilities/work surfaces, not peer products.
4. Account becomes utility/profile.
5. Work Center is decomposed into Today, Tasks, Approvals, and Automations.
6. Bridge becomes a canonical Connection/Adapter.
7. Businesses become relationship-aware contexts/spaces.
8. Structured views remain first-class.
9. Action, Context, Approval, Audit, and Entity contracts become core architecture.
10. Stage 2A continues; Stage 2B is redefined around the unified SANAD shell.

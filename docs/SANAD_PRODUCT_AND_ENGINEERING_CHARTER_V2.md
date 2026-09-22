# SANAD Product and Engineering Charter v2

**Status:** Active  
**Adopted:** 2026-09-22  
**Primary architecture:** `docs/architecture/sanad-conversation-operating-layer-v2.md`  
**Active roadmap:** `docs/roadmaps/sanad-conversation-operating-layer-roadmap-v2.md`

---

## 1. Product identity

SANAD is a **Conversation-Centric Operating Layer** for personal finance, businesses, connected accounting systems, documents, operational work, and trusted commercial relationships.

SANAD is the product. Finance, business, automation, connections, and relationship views are capabilities of SANAD rather than peer products.

SANAD is not:
- a chatbot only;
- an ERP replacement;
- a second uncontrolled financial ledger;
- a banking wallet;
- a marketplace by default;
- a four-tab application architecture.

Governing interaction principle:

> **Conversation-first, not conversation-only.**

Conversation is the primary intent surface. Structured work surfaces remain first-class where density, inspection, configuration, approval, or operational execution requires them.

---

## 2. Product operating model

Target user-facing composition:

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

### Today
An operational briefing: what needs attention now, why, and what can be done.

### Library
Files, reports, statements, invoices, generated artifacts, saved analyses, and other permissioned information objects with provenance.

### Capabilities
Native SANAD abilities such as Personal Finance, Business Operations, Reports, Documents, Collections, and supported inventory/operational tools.

### Connections
External-system integrations such as SANAD Bridge and future ERP/accounting adapters.

### Businesses / Spaces
Contextual operating spaces based on the user's relationship to a business or personal context.

### Profile
Identity, security, subscription, devices, notifications, preferences, and utility settings.

---

## 3. Canonical data ownership

The user-facing IA may change without changing the rules of canonical truth.

### Personal Finance
Personal financial truth remains user-scoped and canonical.

### Business / Commercial
Business financial and operational truth remains business-scoped and permissioned.

### AI / Intelligence
SANAD Intelligence does not become a ledger.

It consumes authorized semantic/read models and may propose or orchestrate actions only through governed contracts.

### ERP observations
Legacy ERP data must retain provenance and freshness. Raw ERP observations are not silently promoted into a separate SANAD ledger.

---

## 4. Deterministic execution

Target execution contract:

```text
Intent
→ Context / Entity Resolution
→ Draft
→ Review
→ Explicit Approval
→ Deterministic SANAD Action
→ Audit
→ Result
```

AI may help interpret intent and construct drafts. It must not bypass authorization, approval, accounting invariants, or audit requirements.

---

## 5. SANAD Action Layer

UI, SANAD Intelligence, command/search, operational work surfaces, automations, and future external agent protocols should converge on the same canonical action contracts.

A SANAD action may define:
- input schema;
- permissions;
- read/write classification;
- entity target;
- provenance;
- approval policy;
- mandatory audit;
- idempotency/reversal behavior;
- result schema.

Avoid separate execution logic for UI and AI.

---

## 6. Context architecture

Work surfaces should publish explicit application context.

Target context includes, as relevant:
- current view/workspace;
- current entity;
- business/space;
- period;
- filters;
- selection.

SANAD Intelligence should consume explicit context rather than infer critical identity from visible text.

This powers:
- Ask SANAD about this;
- Context Inspector;
- entity-aware conversation;
- command palette;
- Context Packs;
- conversation references.

---

## 7. Business relationship model

A SANAD user is an individual, but may have different relationships to different businesses.

Examples:
- owner;
- team member;
- customer;
- supplier.

Authorization comes from relationship records, not a global `user_type` shortcut.

Future relationship flows may include governed customer claims, payment confirmations, statement review, and business approval.

No claim becomes accounting truth without deterministic validation/approval.

---

## 8. SANAD Bridge and legacy systems

SANAD Bridge is a **Connection/Adapter** that allows SANAD to work above legacy accounting systems without forcing replacement.

Current Edaa rule:

> **Read-only toward Edaa.**

Bridge/adapters may read, normalize, hash, compare, synchronize, and publish safe canonical observations. They must not mutate legacy accounting data unless a later architecture explicitly approves write contracts.

Long-term adapter strategy should normalize systems behind SANAD canonical entities/actions rather than teaching the product every vendor schema.

---

## 9. Audit, telemetry, and trust

Mandatory financial/security audit and operational telemetry are different contracts.

### Mandatory audit
Where the operation's integrity requires audit, failure to record required audit may invalidate the operation.

### Operational telemetry
Metrics/observability are best-effort and must not fail a successful user operation.

Stage 1 rule:

> **Observability telemetry must be non-fatal to the primary user operation.**

---

## 10. Multi-currency and accounting integrity

Non-negotiable:
- no silent currency conversion;
- retain explicit source currency;
- record exchange-rate source/provenance when conversion occurs;
- canonical balances derive from canonical postings/read models;
- posted records use reversal/replacement/settlement semantics rather than destructive editing where integrity requires it;
- preserve ambiguity instead of guessing financial identity.

---

## 11. Authorization and backend security

- Supabase remains the canonical backend source unless a future ADR changes it.
- Frontend uses auth-safe clients only.
- Never expose service-role/admin secrets to clients.
- Preserve RLS and least privilege.
- Security-definer functions require explicit safe `search_path` and narrow grants.
- Database changes use tracked migrations.
- Edge Function source remains tracked in GitHub.
- Emergency direct Production changes must be reconciled to source/documentation immediately.

---

## 12. Frontend principles

- Arabic-first and real RTL.
- Latin digits `0–9` in user-facing numerical UI unless a specific requirement overrides it.
- Current font baseline: self-hosted **Noto Sans Arabic Variable** with system fallbacks.
- Light-first, calm operational visual language.
- Avoid card walls and nested decorative surfaces.
- Hierarchy should rely on typography, spacing, alignment, semantic surfaces, and restrained elevation.
- Motion communicates state; it is not decorative.
- SANAD Intelligence identity is a capability identity, not a competing product logo.
- Desktop-first execution currently; mobile-safe always; Android physical hardening at release checkpoints.

---

## 13. Conversation and structured work

Conversation is the default surface for:
- questions;
- analysis;
- drafting;
- navigation;
- orchestration;
- follow-up.

Structured views are required for:
- large statements;
- reports;
- inventory tables;
- approval queues;
- settings;
- team management;
- dense data inspection;
- long operational workflows.

Do not force everything into chat.

---

## 14. Product taxonomy

Use distinct terms:

### Capability
Native SANAD ability.

### Connection
External system/data integration.

### Business / Space
Context and relationship scope.

### App / Extension
Future ecosystem module; do not use this label for every native feature.

### Entity
Canonical object with stable identity.

### Action
Typed deterministic operation.

### Work Item
Operational item needing attention/action.

### Context Pack
Explicit references used to seed a conversation.

---

## 15. Release strategy

Use coherent Release Trains.

Default:

```text
2–3 related stages
→ integration candidate
→ full CI
→ Desktop Production
→ real usage feedback
→ next train
```

Avoid long stacks of unmerged feature branches.

Each train must have:
- scope;
- source-of-truth check;
- CI;
- Preview/QA;
- rollback reference;
- Production verification;
- documentation update.

---

## 16. Stage 2 direction

### Stage 2A
Visual Foundation continues as already implemented/planned:
- semantic colors;
- typography;
- surfaces;
- spacing/radius/elevation;
- shared primitives;
- safe-area.

The product-model reframe does not invalidate Stage 2A.

### Stage 2B.0
Architecture/documentation gate for:
- sidebar IA;
- Today;
- Library;
- Work;
- Capabilities;
- Connections;
- Businesses/Spaces;
- Profile;
- context switching;
- conversation references.

### Stage 2B
Unified SANAD conversation-centric shell.

Follow the active roadmap for subsequent trains.

---

## 17. Out of scope without explicit later approval

- silent AI financial writes;
- abandoning canonical Personal/Business financial boundaries;
- writing into Edaa from Bridge;
- replacing the current Agent runtime solely to adopt another framework;
- exposing raw privileged databases through external agent protocols;
- shipping an extension marketplace before permissions/actions/audit are mature.

---

## 18. Source-of-truth rule

Before meaningful implementation:
1. inspect current `main`;
2. inspect current Production runtime where relevant;
3. read the active architecture and roadmap;
4. verify open PRs/recent merges;
5. do not treat historical docs as current when marked superseded.

The active product direction is **SANAD as a Conversation-Centric Operating Layer**.

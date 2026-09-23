# Stage 2B.0 — Database Architecture Gap Report v1

**Status:** Draft — read-only Production schema audit  
**Date:** 2026-09-23  
**Supabase project:** `sanad_verify_v3` / `hudbzlgclghlhazlduas`  
**Database:** PostgreSQL 17  
**Runtime mutations performed:** NONE  
**Purpose:** Assess whether the current SANAD database can support the Conversation-Centric Operating Layer before Stage 2B implementation.

---

## 1. Executive conclusion

The current database is much closer to the new SANAD philosophy than the old four-section UI suggests.

The correct strategy is **evolution, not replacement**.

Strong foundations already exist for:
- cloud conversations;
- user memory/preferences;
- governed AI action drafts;
- business relationships;
- personal finance;
- commercial documents;
- ERP/Bridge connections;
- WhatsApp contacts and transactional messaging;
- push/realtime notifications;
- knowledge sources;
- domain-specific event trails.

However, the new product model exposes several structural gaps that should be resolved deliberately before later operational stages.

The most important gaps are:

1. no general shared-conversation participant model;
2. no generic user/business Connection registry beyond accounting/Bridge;
3. no cross-domain Work Item model;
4. no canonical cross-domain event envelope feeding Today/Work/Notifications;
5. notification/action type constraints are too narrow for the new product model;
6. current assistant action types are too narrow for a general Action Registry;
7. user/business scoped knowledge facts and glossary do not yet have a canonical model;
8. reconciliation has no dedicated model;
9. contracts/agreements have no dedicated model;
10. business ownership currently has a **one-business-per-owner** unique constraint, which conflicts with the new multi-context product direction.

---

# 2. Existing schema foundations

## 2.1 Conversation / Agent

Existing production objects include:
- `sanad_agent_threads`
- `sanad_agent_messages`
- `sanad_agent_attachments`
- `sanad_agent_memories`
- `sanad_agent_preferences`
- `sanad_agent_actions`
- `sanad_agent_action_events`
- `sanad_agent_performance_metrics`

Current live data observed:
- threads: 7
- messages: 28
- preferences: 2
- performance metrics: 134

The current thread model is user-owned:
- `sanad_agent_threads.user_id`
- optional `business_id`
- active/archived state
- summary
- message sequence counter

Messages are persisted in the cloud and sequence-numbered.

This is already a good base for cross-device history.

### Gap

There is no participant/membership table for shared conversations.

Current RLS is ownership-based:
`auth.uid() = user_id`.

This cannot safely support:
- team conversations;
- customer + business + SANAD rooms;
- shared read state;
- mentions;
- participant roles.

A future shared-conversation model will require explicit thread membership and membership-aware RLS.

---

## 2.2 Business relationship model

Strong existing objects:
- `business_profiles`
- `business_team_members`
- `business_customers`
- `business_customer_relationship_events`
- `business_parties`
- `business_party_roles`
- `business_party_source_refs`

Existing party roles already include:
- customer
- supplier
- contact
- other

Business parties can also link to a SANAD user through `sanad_user_id`.

### Important blocker

`business_profiles` currently has:

`UNIQUE (owner_user_id)`

via constraint:

`one_business_per_owner`

This allows one owned business per user.

The new SANAD model explicitly expects a user to operate across multiple businesses/contexts.

This constraint must be reviewed before the Businesses/Spaces product model is implemented broadly.

### Team limitation

`business_team_members.membership_role` is currently constrained to:

`employee`

Permissions JSON exists, so the current system can express operational permissions, but the role vocabulary itself is narrow.

Do not expand this casually; first decide whether role semantics live in:
- membership_role;
- permissions;
- or a separate relationship role model.

---

## 2.3 Connections / Bridge / ERP

Existing production foundation is strong:

- `business_accounting_connections`
- `business_erp_source_instances`
- `business_bridge_devices`
- `business_bridge_device_credentials`
- `business_bridge_pairing_tokens`
- `business_bridge_authorization_sessions`
- ERP raw/snapshot/baseline tables

Current live state includes:
- 1 accounting connection;
- 1 source instance;
- 1 bridge device;
- large ERP snapshot replica data.

`business_accounting_connections` already has valuable generic operational fields:
- provider_code
- display_name
- status
- adapter_version
- event_schema_version
- last_sync_at
- last_heartbeat_at
- last_error_code
- metadata

### Important design decision

Do **not** rename this table into a universal Connections table.

It is correctly business/accounting-specific and currently enforces:

`connection_mode = 'read_only'`

which protects the Edaa policy.

For the new philosophy, add a higher-level generic Connection model later and let accounting/Bridge remain a specialized connection subtype/source.

---

## 2.4 WhatsApp

WhatsApp support is already substantially developed.

Existing objects include:
- `sanad_whatsapp_contacts`
- `sanad_whatsapp_contact_events`
- `sanad_whatsapp_campaigns`
- `sanad_whatsapp_campaign_recipients`
- `sanad_transactional_message_rules`
- `sanad_transactional_message_outbox`
- private WhatsApp intake/recovery pipeline

The transactional outbox already tracks:
- event type;
- recipient;
- source;
- notification link;
- template/text;
- retry state;
- external message id;
- sent/delivered/read/failed state;
- dedupe;
- service-window expiry.

### Conclusion

Adding WhatsApp to the new Connections UI does **not** require inventing a new messaging backend.

The correct work is to:
- define connection ownership/status/capabilities;
- surface existing WhatsApp infrastructure through that model;
- preserve consent and transactional/marketing separation.

---

## 2.5 Notifications

Existing notification foundation is mature:

- `notifications`
- `push_subscriptions`
- `push_outbox`
- `push_delivery_attempts`
- `push_delivery_reservations`

Notifications already contain:
- recipient;
- actor;
- type;
- category;
- severity;
- title/body;
- action type/payload;
- business;
- operation;
- source event type/id;
- dedupe key;
- expiry/read/archive state.

Triggers already fan notifications into:
- push;
- realtime;
- transactional WhatsApp where configured.

### Conclusion

Do **not** replace the notification engine.

Evolve it.

### Gap

The current check constraints encode a historical product taxonomy.

Current notification categories include a finite list such as:
- operations;
- reports;
- business;
- subscription;
- security;
- system.

Current action types are also a fixed finite list based on legacy routes.

The new model will require semantics such as:
- Today;
- Work;
- Approval;
- Connection;
- Conversation;
- Reconciliation;
- Contract;
- Library/entity navigation.

The type system should become registry-driven or otherwise extensible instead of accumulating large hard-coded CHECK arrays indefinitely.

---

## 2.6 Domain events

Existing event trails are domain-specific:
- `operation_events`
- `business_activity_events`
- `business_customer_relationship_events`
- `business_payment_inbox_events`
- `business_financial_account_events`
- `sanad_agent_action_events`
- `sanad_whatsapp_contact_events`
- other audit/event tables.

This is good for domain integrity.

### Gap

There is no canonical cross-domain event envelope for:

`Domain Event → Notification / Work Item / Automation / Today`

Do not replace domain event tables.

Evaluate one of two designs:

**Option A — Event projection/view**
A read model unions normalized domain events.

**Option B — Canonical event envelope/outbox**
Append-only `sanad_domain_events` references the source event and drives consumers.

The choice must preserve idempotency and avoid creating a second financial truth.

---

## 2.7 Work / Today / Approvals / Automations

No generic tables were found for:
- work items;
- tasks;
- automations;
- schedules;
- cross-domain approvals.

There are domain-specific action/work concepts:
- `sanad_agent_actions`
- `business_team_actions`
- payment inbox/review workflows.

### Gap

The new product needs a cross-domain **Work Item projection/model**.

Recommended principle:

A Work Item should reference the canonical source object rather than duplicate its state.

Conceptually:

`source_type + source_id → work projection`

Examples:
- Agent action awaiting approval;
- Payment claim needing review;
- stale Bridge sync;
- overdue obligation;
- contract milestone.

---

## 2.8 Action Registry readiness

`sanad_agent_actions` is a strong starting point:
- thread;
- user;
- business;
- action type;
- status;
- payload;
- review;
- fingerprint;
- version;
- result/error;
- approval/execution timestamps;
- event log.

### Gap

The current action type constraint allows only:
- `personal_transaction`
- `commercial_document_draft`

This is not sufficient for the future Structured Action Composer or unified SANAD Action Registry.

Do not merely add dozens of strings to the CHECK constraint.

Design a typed Action Registry contract with versioned schemas and permission/approval/audit metadata.

---

## 2.9 Knowledge and memory

Existing platform knowledge system:
- `sanad_knowledge_sources`
- `sanad_knowledge_source_versions`
- `sanad_knowledge_units`
- `sanad_knowledge_references`
- `sanad_knowledge_files`

Existing personal memory:
- `sanad_agent_memories`

Agent memories already store:
- user;
- key/category;
- text;
- confidence;
- source thread/message;
- status.

### Gap

The platform knowledge system is oriented to product/official/internal knowledge scopes.

The personal memory system is user-only.

There is no canonical model for:
- business-scoped learned facts;
- user/business knowledge profiles;
- Yemen/user terminology registry;
- derived USER.md / BUSINESS.md profile artifacts.

### Recommended direction

Introduce a structured fact layer later:

`scoped fact → provenance → confidence → status → derived profile`

Markdown must be a generated projection, not the canonical truth.

Suggested scopes:
- platform;
- Yemen/local;
- user;
- business.

Glossary should be separately queryable and precedence-aware.

---

## 2.10 Cross-device conversation sync

Structurally, SANAD already supports cross-device conversation persistence:
- threads/messages are cloud records;
- records are user-scoped;
- RLS uses authenticated user ownership;
- no device ownership field controls visibility.

This is compatible with:

`same account = same conversation history`.

### Remaining requirement

This still needs runtime acceptance testing across two authenticated clients for:
- new thread visibility;
- ordered messages;
- archive state;
- attachments;
- preferences;
- memory.

No schema redesign is required just to achieve cross-device sync.

---

# 3. New concepts with no dedicated canonical model

The Production schema currently has no dedicated canonical tables for:

- shared thread participants;
- generic Spaces;
- generic Connections;
- device address-book contacts;
- phone/call history;
- generic Work Items;
- generic Tasks;
- generic Automations;
- user/business Glossary;
- Contracts/Agreements;
- Reconciliation runs/matches/exceptions.

This does **not** mean each concept needs a table.

The next architecture step is to decide which are:
- persisted entities;
- projections/views;
- local-device capabilities;
- derived artifacts.

---

# 4. Businesses / Spaces recommendation

Do not create a generic `spaces` table merely because the UI uses the word “Space.”

For v1, Space should be a product/context abstraction over canonical scopes:

~~~text
personal → user_id
business → business_id
~~~

This avoids an unnecessary duplicate hierarchy.

Introduce a physical Space entity only if future requirements demand a context that is neither a user nor a business.

---

# 5. Contacts / Phone recommendation

WhatsApp contacts already exist but are not a general address book.

If SANAD later integrates phone Contacts:

Do not automatically upload the user's entire device address book to cloud storage.

Architecture must define:
- explicit permission;
- local vs synced contact behavior;
- normalization;
- matching to SANAD user/business party;
- consent/privacy;
- deletion.

Phone calling can initially be an OS action capability without storing call history.

Call-history ingestion should be a separate decision.

---

# 6. Profit / ERP data finding

The current canonical SANAD commercial tables contain sale price/line totals, but the schema audit did not find a clear canonical product COGS/unit-cost/inventory-valuation model supporting reliable invoice profit calculation.

This supports the current observed assistant limitation.

However, the ERP replica contains a large raw/snapshot dataset.

Therefore the next task should be an **Edaa Profit Coverage Audit**:

1. inspect replica catalog/table metadata;
2. identify Edaa purchase-cost / stock-cost / valuation fields;
3. determine accounting method required for invoice-level COGS;
4. create a read-only semantic profit contract if the source supports it.

Do not let the LLM estimate invoice profit from incomplete data.

---

# 7. Security baseline before new schema work

Supabase advisors currently report:

### Security
- RLS enabled with no policy: informational findings on service/internal tables;
- WARN: anon-executable SECURITY DEFINER functions;
- WARN: authenticated-executable SECURITY DEFINER functions.

The number of authenticated SECURITY DEFINER functions is large because SANAD uses RPC-heavy contracts.

This does not automatically mean each function is unsafe, but it means all new schema/RPC work must follow a stricter privilege review.

### Performance
Current advisor themes include:
- unindexed foreign keys;
- one RLS init-plan warning;
- many unused indexes;
- Auth DB connection strategy informational notice.

Do not delete unused indexes solely from advisor counts without workload evidence.

---

# 8. Recommended database architecture tracks

Before Stage 2B runtime implementation, complete these architecture decisions:

## DB-A — Identity / Relationship / Scope
- remove or replace one-business-per-owner limitation;
- define unified relationship projection;
- decide whether Personal/Business contexts need a persisted Space entity.

## DB-B — Conversations / Collaboration
- thread participants;
- participant roles;
- last-read state;
- shared thread RLS;
- author semantics;
- future mentions.

## DB-C — Connections
- generic connection parent/registry;
- scope owner;
- provider;
- capabilities;
- status/health;
- auth material stored privately;
- specialized accounting/WhatsApp/device adapters.

## DB-D — Events / Work / Notifications
- cross-domain event envelope/projection;
- Work Items;
- Today query model;
- notification type/action extensibility;
- channel policy.

## DB-E — Knowledge
- scoped facts;
- business memory;
- USER/BUSINESS profile projections;
- glossary;
- provenance/confidence/supersession.

## DB-F — Reconciliation / Contracts
- reconciliation run/match/exception model;
- agreement/party/obligation model;
- defer runtime implementation until relevant release train.

---

# 9. What should NOT be changed yet

Do not mutate Production yet.

Specifically, do not yet:
- create `spaces` tables;
- rename business accounting connection tables;
- broaden Bridge write mode;
- add dozens of notification CHECK values;
- remove the business owner uniqueness constraint without migration analysis;
- rewrite RLS;
- replace existing WhatsApp/notification engines;
- turn Markdown profiles into canonical truth.

The correct next step is schema design against current contracts, followed by a migration plan and compatibility analysis.

---

# 10. Immediate next audit steps

1. Map every table/FK needed by DB-A through DB-E.
2. Inspect current RPC dependencies before proposing constraint changes.
3. Inspect the Edaa replica catalog for cost/profit coverage.
4. Produce proposed schema v2 as **DDL design only**, not applied.
5. Review RLS/privileges and advisor findings for all proposed exposed objects.
6. Only after approval create migrations on an isolated branch/development target.

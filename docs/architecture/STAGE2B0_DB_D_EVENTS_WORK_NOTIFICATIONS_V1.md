# Stage 2B.0 — DB-D Events / Work / Notifications Architecture v1

Status: Draft for approval
Date: 2026-09-23
Source: Production Supabase read-only audit
Runtime mutations: NONE

## 1. Existing notification engine

Production already has:
- notifications
- push_subscriptions
- push_outbox
- push_delivery_attempts
- push_delivery_reservations
- transactional WhatsApp rules/outbox
- Realtime broadcast trigger

notifications already stores:
- recipient
- actor
- notification type
- category
- severity
- title/body
- action type/payload
- business/operation links
- source event type/id
- dedupe key
- read/archive/expiry state

Triggers already fan out to push, Realtime and WhatsApp where configured.

Conclusion: evolve this engine; do not replace it.

## 2. Existing domain event sources

SANAD already has multiple domain event/audit tables:
- operation_events
- business_activity_events
- business_customer_relationship_events
- business_payment_inbox_events
- business_financial_account_events
- sanad_agent_action_events
- sanad_whatsapp_contact_events
- other specialized audit trails

These remain domain truth/audit.

## 3. Missing integration event layer

The new product needs a normalized durable path:

~~~text
Domain event
→ policy
→ notification
→ work item
→ automation
→ Today
~~~

Do not use notifications themselves as the canonical event bus.

## 4. Recommended event envelope

Add later an append-only integration/event-outbox table, conceptually:

sanad_domain_events

Suggested fields:
- id
- event_type
- event_version
- source_type
- source_id
- user_id nullable
- business_id nullable
- actor_user_id nullable
- subject_type
- subject_id
- occurred_at
- payload jsonb
- sensitivity
- dedupe_key
- created_at

Important rule:

This table is not financial truth.

It references canonical source records and exists for cross-domain routing/idempotency.

## 5. Publication model

A business transaction should commit its canonical state and integration event atomically where possible.

Existing domain events may be mirrored into the envelope gradually.

Do not rewrite all legacy event tables in one migration.

## 6. Work Item model

Add later a cross-domain work projection:

sanad_work_items

Conceptual fields:
- id
- recipient_user_id
- business_id nullable
- item_kind
- status
- priority
- source_type
- source_id
- title
- summary
- due_at
- action_type
- action_payload
- dedupe_key
- created_at
- updated_at
- resolved_at

Possible item kinds:
- task
- approval
- attention
- follow_up
- connection_issue

Work Item state does not replace canonical source state.

On action, SANAD re-validates the source object.

## 7. Today

Today should query actionable Work Items plus a small number of safe derived insights.

It should not query every notification.

Core contract:

~~~text
what needs attention
why it matters
what can be done
~~~

## 8. Approvals

Do not create a generic approval source-of-truth table just to build the Approvals screen.

Existing approval states remain in canonical source objects, e.g. agent actions/payment workflows.

The Work Item can project them into one queue.

If later multiple approvals per source become necessary, then add a dedicated approval model.

## 9. Tasks

Manual user tasks are a legitimate Work Item subtype.

Task fields may later add:
- assignee;
- due date;
- recurrence;
- linked entity;
- linked conversation.

Do not block Stage 2B shell on full task implementation.

## 10. Automations

Automations should consume normalized events or schedules and invoke governed SANAD actions.

Future automation rule concept:
- owner scope;
- trigger kind: schedule | event;
- trigger config;
- condition;
- action reference;
- enabled state;
- last/next run;
- audit.

Automation execution must go through Action Registry / permission / approval rules.

## 11. Notification taxonomy gap

Current notification_type, category and action_type are constrained by fixed CHECK arrays designed for the older product.

The new product will need:
- conversation;
- work;
- approval;
- connection;
- reconciliation;
- contract;
- library/entity navigation.

Do not keep extending huge CHECK arrays indefinitely.

Preferred future direction:
- registry-driven text types or FK-backed registries;
- versioned action/deep-link descriptors.

Migration must preserve old values and client compatibility.

## 12. Delivery policy

Separate:
- event creation;
- user attention/work creation;
- channel delivery.

One event may generate:
- no notification;
- in-app only;
- push;
- WhatsApp;
- multiple channels.

Channel policy should respect:
- user preference;
- business/customer communication preference;
- marketing vs service consent;
- severity;
- quiet/dedupe behavior.

## 13. Two-sided commercial notifications

For business/customer operations, event policies can create different outputs for each party.

Example:

payment.claim.created

Customer:
- confirmation notification

Business:
- approval Work Item + notification

payment.claim.approved

Customer:
- status notification

Business:
- completed Work Item

This is the correct foundation for the relationship network.

## 14. Security / idempotency

Every event fan-out must be idempotent.

Use:
- source event identity;
- dedupe key;
- unique delivery/outbox constraints.

Never use notification delivery success as proof that a financial operation succeeded.

## 15. Decision summary

~~~text
Existing notifications engine      KEEP
Existing domain event tables       KEEP
Cross-domain event envelope        ADD later
Cross-domain Work Items            ADD later
Today                              Project Work Items
Generic approval table             DEFER unless required
Automation engine                  Later, event/schedule driven
Fixed notification CHECK lists     MIGRATE toward registry model
~~~

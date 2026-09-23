# Stage 2B Data Train D3 — Domain Events / Work Items / Today Runbook

Status: released to Production database; repository reconciliation pending PR merge
Production migrations:
- 20260923163515_stage2b_domain_events_work_items_v1
- 20260923163519_stage2b_work_projection_adapters_v1
- 20260923163523_stage2b_payment_event_mirror_contract_hardening_v1
- 20260923163526_stage2b_work_projection_resilience_v1

## 1. Goal

D3 introduces the cross-domain operational attention layer required by the Conversation-Centric SANAD model:

~~~text
Canonical source event/state
→ Domain Event envelope
→ Work Item projection
→ Today / Tasks / Approvals / Attention
→ private realtime update
~~~

This does not replace financial, payment, action, connection, or notification truth.

## 2. New canonical projection tables

### sanad_domain_events

Append-only integration/routing envelope.

It records:
- event type/version;
- canonical source reference;
- actor/user/business scope;
- subject reference;
- occurred_at;
- structured payload;
- sensitivity;
- dedupe key.

It is not exposed to authenticated clients and is never financial truth.

### sanad_work_items

Recipient-scoped actionable projection.

Kinds:
- task;
- approval;
- attention;
- follow_up;
- connection_issue.

States:
- open;
- in_progress;
- done;
- dismissed;
- cancelled.

Authenticated users have SELECT-only RLS for their own rows. Mutation goes through governed RPCs or source projections.

## 3. Today contracts

New RPCs:

- list_my_sanad_work_items_v1
- get_my_sanad_today_v1
- get_my_sanad_work_item_v1
- create_my_sanad_task_v1
- complete_my_sanad_task_v1
- reopen_my_sanad_task_v1

Read RPCs are SECURITY INVOKER and therefore stay under Work Item RLS.

Task mutation RPCs are SECURITY DEFINER intentionally because authenticated users do not receive direct INSERT/UPDATE table grants. Each RPC checks auth.uid(), ownership and business access.

## 4. Initial projection adapters

### SANAD Agent Actions

Source:
- sanad_agent_action_events.

Projection:
- created → approval Work Item;
- approved → approval resolved;
- cancelled → approval cancelled;
- completed → approval resolved;
- failed → approval resolved + high-priority attention item.

The action remains canonical.

### Business Payment Inbox

Source:
- business_payment_inbox_events.

Projection:
- enqueued/released/review_required/review_resumed → open attention;
- claimed/reassigned/claim_renewed → in progress;
- completed → done;
- rejected/cancelled → cancelled.

Recipient v1:
- business owner.

Current actionable payment states are backfilled without replaying historical completed/cancelled events.

### Connections

Source:
- sanad_connections normalized registry.

Projection:
- degraded / attention_required / disconnected → connection_issue;
- connected + healthy → resolve existing connection issue.

The specialized provider table remains canonical.

## 5. Payment event contract defect fixed

Develop runtime testing exposed a pre-existing mismatch:

business_payment_inbox_events allowed:
- review_required
- review_resumed
- claim_conflict
- stale_action_rejected

while private.mirror_business_payment_event_to_operation() mirrored every inbox event into operation_events, whose CHECK did not allow those prefixed values.

D3 expands operation_events_event_type_check to the full mirrored payment event taxonomy.

This is a contract alignment fix, not a new payment state.

## 6. Realtime

Work Item changes emit minimal private realtime updates to:

~~~text
user:<recipient_user_id>
~~~

Event:

~~~text
work_item.changed
~~~

Payload contains identifiers/state only:
- work_item_id
- kind
- status
- priority
- business_id
- updated_at

The full Work Item is fetched through the authenticated data contract.

Realtime delivery is best-effort/non-fatal. A realtime delivery failure must never roll back the Work Item or its canonical source transaction.

## 7. Projection resilience

Projection adapters are explicitly non-fatal.

If Work Item/domain projection fails:
- the canonical agent/payment/connection event remains committed;
- a PostgreSQL warning is emitted;
- reconciliation/backfill can recover the projection later.

This follows the architectural rule:

~~~text
Operational projection / telemetry / delivery
must not make the primary canonical operation fail.
~~~

Financial/security audit truth remains governed by its own mandatory transaction contract.

## 8. Develop runtime validation

Validated on isolated Supabase develop.

Primary fixture:

~~~text
manual task create/complete/reopen       PASS
agent action review projection           PASS
agent approval resolution                PASS
agent failure attention                  PASS
payment review attention                 PASS
connection degraded issue                PASS
connection healthy resolution            PASS
Today ranking/counts                     PASS
Domain Event dedupe                      PASS
~~~

Resilience fixture:

~~~text
two task completions in same transaction  2 events
two task reopens in same transaction       2 events
all lifecycle dedupe keys distinct         PASS
source action event with failed projection PERSISTED
failed projection Work Item                NOT CREATED
failed projection Domain Event             ROLLED BACK
canonical source transaction               PASS
~~~

Synthetic fixture data was removed.

## 9. Advisor review

Security:
- sanad_domain_events has RLS and no authenticated policy/grant intentionally;
- Work Items use own-row SELECT RLS;
- create/complete/reopen task RPCs remain intentional authenticated SECURITY DEFINER write gateways.

Performance:
- all FK advisor gaps introduced by D3 are covered;
- remaining scoped notices are unused-index INFO on newly created indexes before production traffic.

Relevant references:
- https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy
- https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable
- https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index
- https://supabase.com/docs/guides/realtime/subscribing-to-database-changes

## 10. Notification engine boundary

D3 does not force new notification_type/category/action_type values into the existing notification pipeline yet.

Reason:
- Web/PWA/push-worker currently validate a fixed notification taxonomy;
- emitting new values before coordinated client support would create contract breakage.

Existing operation/payment notifications continue unchanged.

D3 adds the Work/Today attention layer and private realtime change signal first.

The notification taxonomy migration must be coordinated with:
- Web notification parser;
- Service Worker;
- push-worker;
- Android navigation;
- deep-link routing.

## 11. Production preflight

Before applying:
- D1/D2 participant and connection postflight remain clean;
- payment inbox source taxonomy is inspected;
- current review_required item count is recorded;
- business owners for active review rows exist;
- current sequence ordering remains clean;
- exact candidate CI is green.

## 12. Production release and postflight

D3 was applied to Production only after all six CI gates passed on the implementation candidate.

Production postflight:

~~~text
threads                              8
messages                             30
user messages                        15
participants                         8
missing owner participants           0
missing user authors                 0
sequence counter mismatches          0

Domain Events table                  present
Work Items table                     present
Domain Events rows                   0
Work Items rows                      12
Work Items kind=attention            12
Work Items status=open               12

payment review_required              12
payment projected open               12
payment projection missing           0

unhealthy connections                0
open connection issues               0

projection triggers                  4
payment event taxonomy aligned       true

authenticated Work Item SELECT        true
authenticated Work Item INSERT        false
authenticated Domain Event SELECT     false
~~~

The conversation counters increased from the preflight baseline (7/28/14) to 8/30/15 during the release window, with zero ordering/participant/authorship inconsistency. This is treated as normal concurrent product use, not migration-created chat data.

Advisor postflight:
- no new D3 foreign-key indexing gap;
- new D3 indexes report unused-index INFO before meaningful Production traffic;
- Domain Events RLS/no-policy INFO is intentional because authenticated users have no table access;
- create/complete/reopen task RPCs retain intentional SECURITY DEFINER warnings as guarded write gateways.

## 12A. Verification checklist

Verify:
- Domain Event/Work Item tables exist;
- authenticated cannot directly read Domain Events;
- authenticated can SELECT only own Work Items;
- projection triggers exist;
- current review_required payment rows project to owner Work Items;
- accounting connection health projection is correct;
- current legacy conversations/order are unchanged;
- operation event mirror accepts full payment taxonomy;
- no new advisor WARN outside intentional write RPC gateways.

## 13. Rollback principle

The canonical source systems remain untouched.

If a projection adapter causes a defect:
- disable/drop the specific projection trigger;
- source operation continues;
- Work Item projection can be rebuilt later.

If Work Item realtime causes a defect:
- drop/disable only sanad_work_items_private_broadcast_v1;
- Work Items remain available by RPC.

Do not delete canonical source events to repair projection state.

## 14. Not included

D3 does not yet:
- build the Today frontend;
- switch sidebar navigation;
- update assistant runtime to surface Today automatically;
- extend the notification taxonomy;
- build Automations;
- build generic Approval source-of-truth;
- build Reconciliation UI.

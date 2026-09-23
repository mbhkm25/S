# Stage 2B.0 — DB-B Conversation / Collaboration Architecture v1

Status: Draft for approval
Date: 2026-09-23
Source: Production Supabase read-only audit
Runtime mutations: NONE

## Existing foundation

Canonical conversation objects:
- sanad_agent_threads
- sanad_agent_messages
- sanad_agent_attachments
- sanad_agent_memories
- sanad_agent_preferences
- sanad_agent_actions

The current model is cloud-persisted, user-owned, optionally business-bound, and ordered by next_message_sequence / sequence_no.

This remains the correct Stage 1 baseline.

## Cross-device sync

No new schema is required merely for multi-device history. Threads and messages are server records scoped to authenticated account identity, not device identity.

A runtime two-client acceptance test is still required for:
- new thread visibility;
- ordered messages;
- archive state;
- attachments;
- preferences;
- memory.

## Shared conversation requirement

Target examples:

~~~text
Team room:
Mohammed + Ahmed + SANAD

Business/customer room:
Business operator + Customer + SANAD
~~~

The current ownership-only RLS cannot support this safely.

## Proposed participant table

Add later:

sanad_agent_thread_participants

Conceptual fields:
- thread_id
- user_id
- participant_role
- status
- joined_at
- left_at
- added_by_user_id
- last_read_sequence_no
- notification_level
- created_at
- updated_at

Unique(thread_id, user_id).

Keep the initial role vocabulary small:
- owner
- member
- viewer

Business job titles and business permissions remain separate.

## Compatibility migration

For every existing thread, backfill its current user_id as an owner participant.

Keep sanad_agent_threads.user_id initially for compatibility. Do not rename/drop it in the first collaboration migration.

## Message authorship gap

sanad_agent_messages.user_id currently behaves as tenant/owner identity, including assistant messages. It is not a reliable shared-room author field.

Add later:

author_user_id uuid NULL

Semantics:
- human message → actual human author;
- assistant/system message → NULL.

Backfill existing user-role messages from current user_id.

Keep the legacy user_id during migration.

## Ordering contract

Stage 1 ordering remains authoritative:

(thread_id, sequence_no)

All participants must allocate through the same atomic thread sequence counter.

Never revert shared conversations to created_at ordering.

## Authorization model

Read:
- active participant can read thread;
- active participant can read parent-thread messages.

Mutation:
- owner manages participants/thread lifecycle;
- member may post;
- viewer is read-only.

Exact RLS must be indexed and performance-tested.

Useful indexes will include:
- (thread_id, user_id)
- (user_id, status, thread_id)

Prefer controlled RPC/action paths rather than broad direct client writes.

## Realtime

Use private Realtime channels for shared rooms.

Conceptual topic:

thread:<thread_id>:messages

Realtime is delivery only. Postgres messages + sequence numbers remain truth.

On reconnect, clients reload deterministic history.

## Read state

Use participant.last_read_sequence_no for v1 unread state.

Defer per-message read receipts until product value justifies extra writes/storage.

## Business context and permissions

A shared business thread may have business_id plus participants.

Thread membership grants conversation access only.

It must not automatically grant business ledger, invoice, approval or execution permissions.

Every tool/action still checks the requesting participant against business-domain permissions.

## Shared approvals

sanad_agent_actions.user_id can identify the requesting actor.

Approval must bind to the exact action/fingerprint, approving user, permission, expiry and single-use semantics where required.

A participant is not automatically an approver.

## Migration order

1. create participant table;
2. backfill existing owners;
3. add author_user_id;
4. backfill human authors;
5. add participant-aware helper functions;
6. introduce v2 thread/list RPCs;
7. migrate UI;
8. change RLS after compatibility tests;
9. add private Realtime authorization;
10. deprecate legacy ownership assumptions later.

## Decision summary

~~~text
Cloud history                  KEEP
Sequence ordering              KEEP
Participant table              ADD
author_user_id                 ADD
thread.user_id                 KEEP initially
message.user_id                KEEP initially
Participant-aware RLS          ADD in v2
Private Realtime               RECOMMENDED
Per-message receipts           DEFER
Mentions                       DEFER
~~~

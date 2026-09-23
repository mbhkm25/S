# Stage 2B Runtime R1 — Shared Conversation Runtime

Status: implementation candidate
Production mutation: not yet applied at authoring time

## Goal

Move the already-released D2 shared-conversation schema into the live SANAD assistant runtime without breaking Stage 1 ordering or owner-only legacy compatibility.

Runtime flow:

~~~text
Participant-aware thread list/detail
→ private thread Realtime invalidation
→ participant-aware agent context
→ participant-aware attachment access
→ owner/member AI turn persistence
→ per-participant read state
~~~

## Runtime contracts adopted

Web workspace:
- list_my_sanad_agent_threads_v2
- get_my_sanad_agent_thread_v2
- get_my_sanad_agent_context_v2
- mark_my_sanad_agent_thread_read_v1

Agent runtime:
- get_my_sanad_agent_context_v2
- save_sanad_agent_turn_v3
- get_my_sanad_agent_attachment_v2

Attachments:
- create_my_sanad_agent_attachment_v2
- get_my_sanad_agent_attachment_v2
- list_my_sanad_agent_attachments_v2

Legacy v1 contracts remain available during the migration window.

## Role behavior

Owner:
- read;
- write;
- archive/manage;
- upload attachments.

Member:
- read;
- write;
- upload attachments;
- cannot archive the owner thread.

Viewer:
- read only;
- sees shared attachments;
- composer, voice, send and upload are disabled;
- agent runtime rejects a turn with thread_read_only.

## Message identity compatibility

Stage 1 ordering remains canonical:

~~~text
(thread_id, sequence_no)
~~~

For shared turns:

~~~text
message.user_id        = thread owner
message.author_user_id = actual human actor
~~~

This preserves legacy history assumptions while making authorship explicit.

## Shared attachments

Storage path remains uploader-owned:

~~~text
<uploader_user_id>/<thread_id>/<file>
~~~

Upload:
- owner/member only.

Read:
- every active participant in the thread.

Delete:
- uploader only.

Metadata RPCs return:
- uploader identity;
- is_mine;
- existing analysis/suggestion metadata.

A thread-level partial index supports participant-wide attachment listing.

## Private Realtime

### Conversation topic

~~~text
sanad-thread:<thread_uuid>
~~~

Database trigger emits:

~~~text
message.changed
~~~

Payload is minimal:
- thread_id;
- message_id;
- sequence_no;
- role;
- author_user_id;
- created_at.

The Web client treats Realtime only as an invalidation hint and reloads canonical RPC state.

The trigger is best-effort/non-fatal. Realtime failure never rolls back message persistence.

### Work topic authorization

D3 already emits Work Item changes to:

~~~text
user:<user_uuid>
~~~

R1 adds authenticated private-topic receive authorization for the matching user only.

## Read state

Opening/reloading a thread marks the participant read through:

~~~text
mark_my_sanad_agent_thread_read_v1
~~~

The sidebar displays:
- unread_count;
- shared/member state;
- viewer read-only state.

## Develop runtime validation

Synthetic fixture validated:

~~~text
member attachment create             PASS
viewer attachment list               PASS
viewer attachment create             BLOCKED
member shared turn persistence       PASS
author_user_id = member              PASS
legacy message.user_id = owner       PASS
owner unread before open             2
owner unread after mark-read         0
private message broadcast trigger    PRESENT
thread Realtime read policy          PRESENT
thread Realtime write policy         PRESENT
user Work realtime policy            PRESENT
storage write participant policy     PRESENT
storage read participant policy      PRESENT
storage path thread resolution       PASS
~~~

Synthetic fixture data was removed.

## Security / advisor review

- participant-aware attachment RPCs are intentional authenticated SECURITY DEFINER API gateways with explicit thread access checks;
- direct attachment metadata RLS remains uploader-scoped;
- shared binary read authorization is enforced at storage.objects by thread membership;
- DELETE remains uploader-only;
- no new unindexed FK remains;
- the new thread attachment index reports unused-index INFO before traffic, which is expected.

## Production preflight

Before applying:
- D1/D2/D3 invariants remain clean;
- current thread ordering has zero counter mismatch;
- all user messages have author_user_id;
- every thread has an active owner participant;
- exact candidate passes all CI gates;
- current production sanad-ai-agent-v1 source hash is recorded.

## Production rollout

Release order:

1. apply shared runtime DB migrations;
2. deploy sanad-ai-agent-v1 candidate from the same Git commit;
3. deploy Web/PWA from the same Git commit;
4. Desktop production smoke;
5. shared-thread smoke with owner/member if a safe test account is available;
6. verify Stage 1 ordering counters and D3 Work Items remain unchanged.

## Rollback

If shared-thread Web behavior fails:
- revert Web client to v1 workspace contracts;
- v1 RPCs remain available.

If agent shared persistence fails:
- redeploy prior sanad-ai-agent-v1;
- v2/v3 database contracts are additive.

If private conversation Realtime causes instability:
- disable/drop sanad_agent_message_private_broadcast_v1;
- RPC reload remains canonical.

If shared attachments cause a defect:
- revert client attachment RPCs to v1;
- restore uploader-only storage SELECT/INSERT policies;
- attachment metadata is not deleted.

Never alter sequence_no or participant backfill to roll back runtime adoption.

## Not included

R1 does not yet:
- expose participant invitation/management UI;
- create a business-team picker for sharing;
- build the Today frontend;
- subscribe the Today frontend to user Work Item realtime;
- extend the notification taxonomy;
- add external collaboration or WhatsApp participants.

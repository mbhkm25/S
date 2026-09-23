# Stage 2B Data Train D2 — Collaboration + Connections Release Runbook

Status: implementation candidate
Production mutation: not yet applied at authoring time

## Scope

D2 contains three database migrations:

1. Shared conversation participant-aware contracts.
2. Generic external Connections registry.
3. Shared conversation RLS hardening.

## Collaboration contract

The new contract adds:

- participant-aware thread listing;
- participant-aware thread detail;
- participant-aware agent context;
- participant list/manage RPCs;
- per-participant read position;
- owner/member/viewer roles;
- service-only participant-aware turn persistence;
- private Realtime authorization for topic `sanad-thread:<thread_uuid>`;
- participant-aware SELECT RLS for threads/messages.

### Role model

Owner:
- read;
- write;
- manage participants.

Member:
- read;
- write.

Viewer:
- read only.

For business-linked conversations, every active participant must also retain business owner/team access.

## Compatibility

Legacy contracts remain:
- thread.user_id stays the canonical thread owner;
- message.user_id stays compatible with the legacy owner view;
- message.author_user_id records the actual human author;
- Stage 1 sequence_no ordering remains canonical;
- v1 RPCs remain available.

`save_sanad_agent_turn_v3` persists shared turns as:

~~~text
message.user_id        = thread owner
message.author_user_id = actual actor
~~~

This prevents legacy owner history from losing participant messages during the migration window.

## Realtime

Authorized topic format:

~~~text
sanad-thread:<uuid>
~~~

Read:
- owner/member/viewer.

Broadcast/Presence send:
- owner/member only.

The future client must instantiate this channel with:

~~~text
private: true
~~~

The database authorization policies are necessary but the client migration is a separate runtime step.

## Connections registry

`sanad_connections` is a normalized registry, not provider truth.

Provider-specific tables remain canonical.

Initial adapter:
- `business_accounting_connections`.

The sync trigger mirrors:
- provider;
- status;
- health;
- freshness;
- capabilities;
- source reference.

No access token, refresh token, API key or provider secret is stored in the registry.

For a read-only accounting connection:

~~~text
capabilities.write_back = false
~~~

## Develop validation

Synthetic runtime fixture validated:

~~~text
participants                         3
member can read                      PASS
member can write                     PASS
viewer write                         BLOCKED
outsider participant add             BLOCKED
member author_user_id                PASS
legacy owner message.user_id         PRESERVED
read state update                    PASS
connection registry trigger          PASS
read-only write_back                 false
connection owner RPC                 PASS
~~~

All fixture data was removed.

## Advisor review

Performance:
- overlapping permissive thread/message policies were removed;
- only unrelated/expected unused-index INFO remains for the scoped objects.

Security:
- participant and connection tables intentionally use RLS with no direct authenticated table policy/grant;
- authenticated SECURITY DEFINER RPC warnings are expected for guarded API contracts and require explicit auth/access checks;
- no raw connector secret storage is permitted.

Relevant Supabase remediation references:
- https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy
- https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable
- https://supabase.com/docs/guides/realtime/authorization

## Production preflight

Before applying:
- D1 participant backfill is complete;
- no thread owner orphan;
- no user-message author backfill gap;
- current accounting connection registry source count is known;
- GitHub CI is green on the exact candidate.

## Production postflight

Verify:
- collaboration functions exist;
- owner/member/viewer policies exist;
- private Realtime thread policies exist;
- `sanad_connections` exists;
- accounting registry row count matches accounting connection row count;
- every read-only accounting source has `write_back=false`;
- current 7 legacy threads remain accessible to their owner;
- current 14 user messages remain ordered and authored;
- no sequence counter mismatch.

## Rollback principle

### Collaboration
The v2 contracts are additive. Client adoption can be stopped without removing the schema.

If Realtime causes a defect:
- stop subscribing in client first;
- drop only the two SANAD thread Realtime policies if required.

If participant-aware direct read causes a defect:
- revoke authenticated SELECT on threads/messages;
- restore legacy owner SELECT policies;
- v1 SECURITY DEFINER RPCs remain available.

Do not remove participant rows or author_user_id.

### Connections
The registry is a projection.

If its trigger causes a defect:
- drop `sanad_accounting_connection_registry_sync_v1`;
- specialized `business_accounting_connections` remains canonical.

Never repair a specialized provider connection by editing only the registry.

## Not included

D2 database train does not yet:
- switch the production assistant Edge Function from context v1/save-turn v2 to v2/v3;
- switch the Web UI to shared-thread RPCs;
- implement participant invitation UI;
- implement WhatsApp WABA OAuth;
- implement device contacts;
- implement Work Items.

Those depend on this foundation and follow in the next runtime/application train.

# Stage 2B Data Train D1 — Release / Rollback Runbook

## Scope

Migrations:
- 20260923153802_stage2b_multi_business_ownership_v1
- 20260923153807_stage2b_shared_conversation_additive_v1
- 20260923153811_stage2b_shared_conversation_additive_hardening_v1
- 20260923153814_stage2b_shared_conversation_dual_write_v1

## Preflight

Before Production application, verify:

~~~sql
select
  (select count(*) from public.sanad_agent_threads t left join auth.users u on u.id=t.user_id where u.id is null) as thread_owner_orphans,
  (select count(*) from public.sanad_agent_messages m left join auth.users u on u.id=m.user_id where m.role='user' and u.id is null) as user_message_owner_orphans,
  (select count(*) from (select owner_user_id from public.business_profiles group by owner_user_id having count(*)>1) x) as duplicate_owner_groups;
~~~

All must equal zero.

## Expected postconditions

- one_business_per_owner absent.
- business_profiles_owner_user_idx present.
- create_business_profile contains no business_already_exists_for_user guard.
- one active owner participant exists per legacy thread.
- every legacy role=user message has author_user_id.
- new legacy-created threads auto-seed owner participant.
- new legacy user messages auto-seed author_user_id.
- no direct anon/authenticated access to sanad_agent_thread_participants.
- Stage 1 sequence ordering unchanged.

## Production validation

Expected current baseline before release:
- threads: 7
- messages: 28
- user messages: 14
- business profiles: 7
- orphan thread owners: 0
- orphan user-message owners: 0
- duplicate owner groups: 0

After migration, expect:
- participant owner rows: 7
- user messages with author_user_id: 14
- missing legacy owner participants: 0
- missing user-message authors: 0

## Rollback principle

M2 collaboration changes are additive and can be disabled first by dropping the two compatibility triggers; the legacy v1 conversation contract remains intact.

Do not drop the participant table or author_user_id while any v2 code depends on them.

M1 multi-business ownership rollback is conditional:

1. stop creation of additional businesses;
2. verify no owner has more than one business;
3. only then restore UNIQUE(owner_user_id);
4. restore the previous create_business_profile single-business guard.

If duplicate owners exist after release, do not re-add the unique constraint until those business records have an explicit product/data resolution.

## Safety

Do not alter:
- Edaa read-only connection_mode;
- Stage 1 message sequence contract;
- existing thread/message v1 RPCs;
- existing financial truth tables.

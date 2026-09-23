-- Stage 2B Data Train D2 / Collaboration RLS hardening
-- Consolidates participant-aware reads into single policies to avoid redundant permissive policy evaluation.

drop policy if exists sanad_agent_threads_own on public.sanad_agent_threads;
drop policy if exists sanad_agent_threads_participant_read_v2 on public.sanad_agent_threads;

create policy sanad_agent_threads_read_v2
on public.sanad_agent_threads
for select
to authenticated
using (
  private.can_access_sanad_agent_thread_v2(id,(select auth.uid()))
);

create policy sanad_agent_threads_owner_insert_v2
on public.sanad_agent_threads
for insert
to authenticated
with check ((select auth.uid())=user_id);

create policy sanad_agent_threads_owner_update_v2
on public.sanad_agent_threads
for update
to authenticated
using ((select auth.uid())=user_id)
with check ((select auth.uid())=user_id);

create policy sanad_agent_threads_owner_delete_v2
on public.sanad_agent_threads
for delete
to authenticated
using ((select auth.uid())=user_id);

drop policy if exists sanad_agent_messages_own on public.sanad_agent_messages;
drop policy if exists sanad_agent_messages_participant_read_v2 on public.sanad_agent_messages;

create policy sanad_agent_messages_read_v2
on public.sanad_agent_messages
for select
to authenticated
using (
  private.can_access_sanad_agent_thread_v2(thread_id,(select auth.uid()))
);

comment on policy sanad_agent_threads_read_v2 on public.sanad_agent_threads is
'One participant-aware SELECT policy replaces overlapping legacy owner + participant SELECT policies.';
comment on policy sanad_agent_messages_read_v2 on public.sanad_agent_messages is
'One participant-aware SELECT policy; thread owners are represented by active owner participant rows.';

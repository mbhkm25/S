-- Covers added_by_user_id FK and future participant-management audit lookups.

create index if not exists sanad_agent_thread_participants_added_by_user_idx
  on public.sanad_agent_thread_participants(added_by_user_id)
  where added_by_user_id is not null;

comment on index public.sanad_agent_thread_participants_added_by_user_idx is
'Covers the added_by_user_id foreign key and future participant-management audit lookups.';

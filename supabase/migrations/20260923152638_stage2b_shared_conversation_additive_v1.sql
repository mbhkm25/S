-- Stage 2B Data Train D1 / M2A
-- Additive collaboration schema. Existing thread/message authorization semantics remain unchanged.

create table if not exists public.sanad_agent_thread_participants (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.sanad_agent_threads(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  participant_role text not null default 'member'
    check (participant_role = any (array['owner'::text,'member'::text,'viewer'::text])),
  status text not null default 'active'
    check (status = any (array['active'::text,'left'::text,'removed'::text])),
  joined_at timestamptz not null default now(),
  left_at timestamptz null,
  added_by_user_id uuid null references auth.users(id) on delete set null,
  last_read_sequence_no bigint not null default 0
    check (last_read_sequence_no >= 0),
  notification_level text not null default 'all'
    check (notification_level = any (array['all'::text,'mentions'::text,'none'::text])),
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sanad_agent_thread_participants_thread_user_key
    unique (thread_id, user_id),
  constraint sanad_agent_thread_participants_left_state_check
    check (
      (status = 'active' and left_at is null)
      or
      (status in ('left','removed') and left_at is not null)
    )
);

create index if not exists sanad_agent_thread_participants_user_status_thread_idx
  on public.sanad_agent_thread_participants(user_id, status, thread_id);

create index if not exists sanad_agent_thread_participants_thread_status_idx
  on public.sanad_agent_thread_participants(thread_id, status);

alter table public.sanad_agent_thread_participants
  enable row level security;

revoke all on table public.sanad_agent_thread_participants from anon, authenticated;
grant select, insert, update, delete
  on table public.sanad_agent_thread_participants
  to service_role;

comment on table public.sanad_agent_thread_participants is
'Stage 2B additive participant model for shared SANAD conversations. Client access remains closed until participant-aware v2 RPC/RLS contracts are introduced.';

insert into public.sanad_agent_thread_participants (
  thread_id,
  user_id,
  participant_role,
  status,
  joined_at,
  added_by_user_id,
  last_read_sequence_no,
  notification_level,
  metadata
)
select
  t.id,
  t.user_id,
  'owner',
  'active',
  t.created_at,
  t.user_id,
  greatest(coalesce(t.next_message_sequence,1) - 1, 0),
  'all',
  jsonb_build_object('backfilled_from_legacy_owner', true)
from public.sanad_agent_threads t
on conflict (thread_id, user_id) do nothing;

alter table public.sanad_agent_messages
  add column if not exists author_user_id uuid null
  references auth.users(id) on delete set null;

update public.sanad_agent_messages
set author_user_id = user_id
where role = 'user'
  and author_user_id is null;

create index if not exists sanad_agent_messages_author_user_idx
  on public.sanad_agent_messages(author_user_id)
  where author_user_id is not null;

comment on column public.sanad_agent_messages.author_user_id is
'Actual human author for collaborative threads. NULL for assistant/system messages. Legacy user_id is retained during the compatibility period.';

do $$
declare
  v_missing bigint;
begin
  select count(*) into v_missing
  from public.sanad_agent_threads t
  left join public.sanad_agent_thread_participants p
    on p.thread_id = t.id
   and p.user_id = t.user_id
   and p.participant_role = 'owner'
   and p.status = 'active'
  where p.id is null;

  if v_missing <> 0 then
    raise exception 'postcondition_failed: % legacy threads missing owner participant', v_missing;
  end if;

  select count(*) into v_missing
  from public.sanad_agent_messages
  where role = 'user'
    and author_user_id is null;

  if v_missing <> 0 then
    raise exception 'postcondition_failed: % legacy user messages missing author_user_id', v_missing;
  end if;
end
$$;

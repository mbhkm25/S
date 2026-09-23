-- Dual-write compatibility for legacy v1 conversation write paths.

create or replace function private.sanad_agent_seed_owner_participant_v1()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
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
  values (
    new.id,
    new.user_id,
    'owner',
    'active',
    new.created_at,
    new.user_id,
    greatest(coalesce(new.next_message_sequence,1) - 1, 0),
    'all',
    jsonb_build_object('seeded_from_legacy_thread_insert', true)
  )
  on conflict (thread_id, user_id) do nothing;

  return new;
end;
$function$;

revoke all on function private.sanad_agent_seed_owner_participant_v1() from public;
revoke all on function private.sanad_agent_seed_owner_participant_v1() from anon, authenticated;

drop trigger if exists sanad_agent_seed_owner_participant_v1
  on public.sanad_agent_threads;

create trigger sanad_agent_seed_owner_participant_v1
after insert on public.sanad_agent_threads
for each row
execute function private.sanad_agent_seed_owner_participant_v1();

create or replace function private.sanad_agent_seed_message_author_v1()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if new.role = 'user' and new.author_user_id is null then
    new.author_user_id := new.user_id;
  end if;

  return new;
end;
$function$;

revoke all on function private.sanad_agent_seed_message_author_v1() from public;
revoke all on function private.sanad_agent_seed_message_author_v1() from anon, authenticated;

drop trigger if exists sanad_agent_seed_message_author_v1
  on public.sanad_agent_messages;

create trigger sanad_agent_seed_message_author_v1
before insert on public.sanad_agent_messages
for each row
execute function private.sanad_agent_seed_message_author_v1();

comment on function private.sanad_agent_seed_owner_participant_v1() is
'Stage 2B compatibility dual-write: every legacy-created thread receives an owner participant row until v2 RPCs become canonical.';

comment on function private.sanad_agent_seed_message_author_v1() is
'Stage 2B compatibility dual-write: legacy user messages populate author_user_id automatically.';

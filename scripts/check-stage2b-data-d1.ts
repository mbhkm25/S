import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const m1 = readFileSync(
  'supabase/migrations/20260923152621_stage2b_multi_business_ownership_v1.sql',
  'utf8',
);
const m2a = readFileSync(
  'supabase/migrations/20260923152638_stage2b_shared_conversation_additive_v1.sql',
  'utf8',
);
const m2aHardening = readFileSync(
  'supabase/migrations/20260923152737_stage2b_shared_conversation_additive_hardening_v1.sql',
  'utf8',
);
const dualWrite = readFileSync(
  'supabase/migrations/20260923152833_stage2b_shared_conversation_dual_write_v1.sql',
  'utf8',
);

assert.match(m1, /drop constraint one_business_per_owner/i);
assert.match(m1, /business_profiles_owner_user_idx/i);
assert.doesNotMatch(
  m1,
  /business_already_exists_for_user/,
  'Stage 2B must not restore the legacy one-owned-business guard.',
);
assert.match(m1, /security definer/i);
assert.match(m1, /set search_path to ''/i);

assert.match(m2a, /create table if not exists public\.sanad_agent_thread_participants/i);
assert.match(m2a, /unique \(thread_id, user_id\)/i);
assert.match(m2a, /participant_role[\s\S]*owner[\s\S]*member[\s\S]*viewer/i);
assert.match(m2a, /last_read_sequence_no bigint not null default 0/i);
assert.match(m2a, /enable row level security/i);
assert.match(
  m2a,
  /revoke all on table public\.sanad_agent_thread_participants from anon, authenticated/i,
);
assert.match(m2a, /grant select, insert, update, delete[\s\S]*to service_role/i);
assert.match(m2a, /add column if not exists author_user_id uuid null/i);
assert.match(m2a, /where role = 'user'[\s\S]*author_user_id is null/i);
assert.match(m2a, /postcondition_failed:[\s\S]*legacy threads missing owner participant/i);
assert.match(m2a, /postcondition_failed:[\s\S]*legacy user messages missing author_user_id/i);

assert.match(
  m2aHardening,
  /sanad_agent_thread_participants_added_by_user_idx/i,
);

assert.match(dualWrite, /private\.sanad_agent_seed_owner_participant_v1/i);
assert.match(dualWrite, /after insert on public\.sanad_agent_threads/i);
assert.match(dualWrite, /on conflict \(thread_id, user_id\) do nothing/i);
assert.match(dualWrite, /private\.sanad_agent_seed_message_author_v1/i);
assert.match(dualWrite, /before insert on public\.sanad_agent_messages/i);
assert.match(
  dualWrite,
  /if new\.role = 'user' and new\.author_user_id is null then[\s\S]*new\.author_user_id := new\.user_id/i,
);
assert.match(
  dualWrite,
  /revoke all on function private\.sanad_agent_seed_owner_participant_v1\(\) from anon, authenticated/i,
);
assert.match(
  dualWrite,
  /revoke all on function private\.sanad_agent_seed_message_author_v1\(\) from anon, authenticated/i,
);

console.log('SANAD Stage 2B Data Train D1 migration contract checks passed.');

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(
  'supabase/migrations/20260920190000_sanad_agent_message_ordering_v1.sql',
  'utf8',
);
const api = readFileSync('src/features/assistant/assistantWorkspaceApi.ts', 'utf8');

for (const required of [
  'next_message_sequence bigint',
  'sequence_no bigint',
  'sanad_agent_messages_thread_sequence_uidx',
  'for update',
  'v_user_sequence := v_thread.next_message_sequence',
  'v_assistant_sequence := v_user_sequence + 1',
  'next_message_sequence=v_assistant_sequence+1',
  'order by m.sequence_no',
  'order by sequence_no desc',
  'sanad_agent_message_ordering_backfill_ambiguous_timestamp_collision',
  'sanad_agent_message_ordering_backfill_ambiguous_request_boundary',
]) {
  assert.ok(migration.toLowerCase().includes(required.toLowerCase()), `message ordering migration missing: ${required}`);
}

assert.match(
  migration,
  /create unique index if not exists sanad_agent_messages_thread_sequence_uidx\s+on public\.sanad_agent_messages\(thread_id, sequence_no\)/i,
);

assert.match(
  migration,
  /row_number\(\) over \([\s\S]*partition by thread_id[\s\S]*order by[\s\S]*created_at[\s\S]*case role when 'user' then 0 when 'assistant' then 1 else 2 end/i,
);

assert.doesNotMatch(
  migration,
  /order by\s+(?:m\.)?created_at\s*,\s*(?:m\.)?id/i,
  'New read contracts must not use timestamp + UUID as semantic ordering.',
);

assert.doesNotMatch(
  migration,
  /order by\s+(?:m\.)?id/i,
  'UUID must never be a semantic ordering key.',
);

for (const fn of ['save_sanad_agent_turn_v1', 'save_sanad_agent_turn_v2']) {
  const start = migration.indexOf(`create or replace function public.${fn}`);
  assert.ok(start >= 0, `missing ${fn}`);
  const body = migration.slice(start, migration.indexOf('\n$$;', start) + 4);
  assert.match(body, /for update/i);
  assert.match(body, /sequence_no/i);
  assert.match(body, /next_message_sequence=v_assistant_sequence\+1/i);
}

for (const fn of ['get_my_sanad_agent_thread_v1', 'get_my_sanad_agent_context_v1']) {
  const start = migration.indexOf(`create or replace function public.${fn}`);
  assert.ok(start >= 0, `missing ${fn}`);
  const body = migration.slice(start, migration.indexOf('\n$$;', start) + 4);
  assert.match(body, /order by m\.sequence_no/i);
  assert.match(body, /order by sequence_no desc/i);
  assert.doesNotMatch(body, /order by .*created_at.*id/i);
}

assert.match(api, /sequence_no:\s*number/);

console.log('SANAD Agent deterministic message ordering v1 contract passed.');

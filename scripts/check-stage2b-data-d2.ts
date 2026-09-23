import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const collaboration = readFileSync(
  'supabase/migrations/20260923190000_stage2b_shared_conversation_contracts_v2.sql',
  'utf8',
);
const connections = readFileSync(
  'supabase/migrations/20260923190500_stage2b_connections_registry_v1.sql',
  'utf8',
);
const rlsHardening = readFileSync(
  'supabase/migrations/20260923191000_stage2b_shared_conversation_rls_hardening_v2.sql',
  'utf8',
);

for (const fn of [
  'private.can_access_sanad_agent_thread_v2',
  'private.can_write_sanad_agent_thread_v2',
  'private.can_manage_sanad_agent_thread_v2',
  'public.list_my_sanad_agent_threads_v2',
  'public.get_my_sanad_agent_thread_v2',
  'public.get_my_sanad_agent_context_v2',
  'public.list_my_sanad_agent_thread_participants_v1',
  'public.add_my_sanad_agent_thread_participant_v1',
  'public.remove_my_sanad_agent_thread_participant_v1',
  'public.mark_my_sanad_agent_thread_read_v1',
  'public.save_sanad_agent_turn_v3',
]) {
  assert.ok(collaboration.includes(fn), `missing collaboration contract: ${fn}`);
}

assert.match(collaboration, /participant_role in \('owner','member'\)/i);
assert.match(collaboration, /author_user_id',m\.author_user_id/i);
assert.match(collaboration, /new\.author_user_id|author_user_id/i);
assert.match(collaboration, /grant select on public\.sanad_agent_threads to authenticated/i);
assert.match(collaboration, /grant select on public\.sanad_agent_messages to authenticated/i);
assert.match(collaboration, /sanad thread participants receive private collaboration/i);
assert.match(collaboration, /sanad thread members send private collaboration/i);
assert.match(rlsHardening, /sanad_agent_threads_read_v2/i);
assert.match(rlsHardening, /sanad_agent_messages_read_v2/i);
assert.match(rlsHardening, /drop policy if exists sanad_agent_threads_own/i);
assert.match(rlsHardening, /drop policy if exists sanad_agent_messages_own/i);
assert.match(collaboration, /extension in \('broadcast','presence'\)/i);
assert.match(collaboration, /revoke all on function public\.save_sanad_agent_turn_v3[\s\S]*authenticated/i);
assert.match(collaboration, /grant execute on function public\.save_sanad_agent_turn_v3[\s\S]*service_role/i);

assert.match(connections, /create table if not exists public\.sanad_connections/i);
assert.match(connections, /scope_kind in \('user','business'\)/i);
assert.match(connections, /source_type text null/i);
assert.match(connections, /source_id uuid null/i);
assert.match(connections, /sanad_connections_source_unique_idx/i);
assert.match(connections, /private\.sync_accounting_connection_to_registry_v1/i);
assert.match(connections, /after insert or update or delete on public\.business_accounting_connections/i);
assert.match(connections, /'write_back',new\.connection_mode <> 'read_only'/i);
assert.match(connections, /revoke all on table public\.sanad_connections from anon,authenticated/i);
assert.match(connections, /grant select,insert,update,delete on table public\.sanad_connections to service_role/i);
assert.match(connections, /public\.list_my_sanad_connections_v1/i);
assert.match(connections, /public\.get_my_sanad_connection_v1/i);
assert.doesNotMatch(connections, /access_token|refresh_token|client_secret|api_key/i);

console.log('SANAD Stage 2B Data Train D2 collaboration/connections contract checks passed.');

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(
  'supabase/migrations/20260923170714_stage2b_shared_runtime_contracts_v1.sql',
  'utf8',
);
const attachmentIndex = readFileSync(
  'supabase/migrations/20260923170718_stage2b_shared_runtime_attachment_index_v1.sql',
  'utf8',
);
const runtime = readFileSync('supabase/functions/sanad-ai-agent-v1/index.ts','utf8');
const core = readFileSync('supabase/functions/_shared/sanad-agent-core.ts','utf8');
const workspaceApi = readFileSync('src/features/assistant/assistantWorkspaceApi.ts','utf8');
const attachmentApi = readFileSync('src/features/assistant/assistantAttachmentApi.ts','utf8');
const workspace = readFileSync('src/features/assistant/SanadAgentWorkspace.tsx','utf8');
const sidebar = readFileSync('src/components/navigation/SanadAssistantSidebarSections.tsx','utf8');
const globalHistory = readFileSync('src/components/navigation/SanadSidebarConversations.tsx','utf8');

for (const token of [
  'public.create_my_sanad_agent_attachment_v2',
  'public.get_my_sanad_agent_attachment_v2',
  'public.list_my_sanad_agent_attachments_v2',
  'private.sanad_thread_id_from_attachment_object_v1',
  'private.broadcast_sanad_agent_message_change_v1',
  'sanad_agent_message_private_broadcast_v1',
  'sanad user receives private work changes',
]) {
  assert.ok(migration.includes(token), 'missing shared runtime migration token: ' + token);
}

assert.match(migration, /private\.can_write_sanad_agent_thread_v2/i);
assert.match(migration, /private\.can_access_sanad_agent_thread_v2/i);
assert.match(migration, /storage\.objects[\s\S]*sanad_agent_attachments_storage_insert/i);
assert.match(migration, /storage\.objects[\s\S]*sanad_agent_attachments_storage_select/i);
assert.match(migration, /'message\.changed'/i);
assert.match(migration, /'sanad-thread:'\|\|new\.thread_id::text/i);
assert.match(migration, /sanad_thread_message_realtime_broadcast_failed/i);
assert.match(migration, /realtime\.topic\(\).*'user:'\|\|/is);
assert.match(attachmentIndex, /sanad_agent_attachments_thread_created_idx/i);

for (const rpc of [
  'list_my_sanad_agent_threads_v2',
  'get_my_sanad_agent_thread_v2',
  'get_my_sanad_agent_context_v2',
  'mark_my_sanad_agent_thread_read_v1',
  'list_my_sanad_agent_thread_participants_v1',
  'add_my_sanad_agent_thread_participant_v1',
  'remove_my_sanad_agent_thread_participant_v1',
]) {
  assert.ok(workspaceApi.includes(rpc), 'workspace API missing ' + rpc);
}

for (const rpc of [
  'create_my_sanad_agent_attachment_v2',
  'get_my_sanad_agent_attachment_v2',
  'list_my_sanad_agent_attachments_v2',
]) {
  assert.ok(attachmentApi.includes(rpc), 'attachment API missing ' + rpc);
}

assert.match(core, /RUNTIME_VERSION = "sanad-ai-agent-v2-shared"/);
assert.match(runtime, /get_my_sanad_agent_context_v2/);
assert.match(runtime, /save_sanad_agent_turn_v3/);
assert.match(runtime, /p_actor_user_id:\s*authUserId/);
assert.match(runtime, /thread_read_only/);
assert.match(runtime, /get_my_sanad_agent_attachment_v2/);
assert.doesNotMatch(runtime, /"get_my_sanad_agent_context_v1"/);
assert.doesNotMatch(runtime, /"save_sanad_agent_turn_v2"/);

assert.ok(workspace.includes('.channel(`sanad-thread:${selectedThreadId}`'), 'workspace must subscribe to the selected private thread topic');
assert.match(workspace, /private:\s*true/);
assert.match(workspace, /event:\s*'message\.changed'/);
assert.match(workspace, /markSanadAgentThreadRead/);
assert.match(workspace, /threadReadOnly/);
assert.match(workspace, /my_role === 'viewer'/);
assert.match(globalHistory, /thread\.unread_count/);
assert.match(globalHistory, /thread\.my_role === 'viewer'/);
assert.match(globalHistory, /thread\.my_role === 'owner'/);
assert.match(globalHistory, /listSanadAgentThreads/);
assert.match(sidebar, /data-sanad-assistant-inline="true"/, 'R1 shared conversation history coexists with inline memory/settings, never a duplicate history panel.');

console.log('SANAD Stage 2B Runtime R1 shared conversation contract checks passed.');

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workspace = readFileSync('src/features/assistant/SanadAgentWorkspace.tsx', 'utf8');
const sidebar = readFileSync('src/features/assistant/AssistantWorkspaceSidebar.tsx', 'utf8');
const responseBlocks = readFileSync('src/features/assistant/SanadAgentResponseBlocks.tsx', 'utf8');
const workspaceApi = readFileSync('src/features/assistant/assistantWorkspaceApi.ts', 'utf8');
const route = readFileSync('src/features/financial/FinancialWorkspaceRoute.tsx', 'utf8');
const api = readFileSync('src/features/assistant/assistantAgentApi.ts', 'utf8');
const runtime = readFileSync('supabase/functions/sanad-ai-agent-v1/index.ts', 'utf8');
const core = readFileSync('supabase/functions/_shared/sanad-agent-core.ts', 'utf8');
const presentation = readFileSync('supabase/functions/_shared/sanad-agent-presentation.ts', 'utf8');
const migration = readFileSync('supabase/migrations/20260920071058_sanad_agent_workspace_v2.sql', 'utf8');
const visualMigration = readFileSync('supabase/migrations/20260920093000_sanad_agent_message_feedback_v1.sql', 'utf8');
const pulse = readFileSync('src/features/assistant/SanadPulseMark.tsx', 'utf8');
const messageActions = readFileSync('src/features/assistant/SanadMessageActions.tsx', 'utf8');
const styles = readFileSync('src/index.css', 'utf8');
const voiceButton = readFileSync('src/features/assistant/SanadVoiceDictationButton.tsx', 'utf8');
const voiceApi = readFileSync('src/features/assistant/assistantVoiceApi.ts', 'utf8');
const voiceFunction = readFileSync('supabase/functions/sanad-ai-transcribe-v1/index.ts', 'utf8');
const supabaseConfig = readFileSync('supabase/config.toml', 'utf8');

for (const required of [
  'streamSanadAiAgentTurn',
  'get_my_account_center_v1',
  'خطوات التنفيذ والمصادر',
  'Shift + Enter',
  'thread_id',
  'AssistantWorkspaceSidebar',
  'SanadAgentResponseBlocks',
  'SanadMessageActions',
  'SanadPulseMark',
]) {
  assert.ok(workspace.includes(required), `workspace missing ${required}`);
}

for (const required of [
  'محادثة جديدة',
  'المحادثات',
  'الذاكرة',
  'الضبط',
  'تنبيهات ذكية',
  'بطاقات البيانات',
]) {
  assert.ok(sidebar.includes(required), `sidebar missing ${required}`);
}

for (const required of [
  'customer_statement',
  'document_list',
  'replica_status',
  'نسخ الكشف',
  'انتبه إلى',
]) {
  assert.ok(responseBlocks.includes(required), `response blocks missing ${required}`);
}

for (const rpc of [
  'create_my_sanad_agent_thread_v1',
  'list_my_sanad_agent_threads_v1',
  'get_my_sanad_agent_thread_v1',
  'get_my_sanad_agent_preferences_v1',
  'update_my_sanad_agent_preferences_v1',
  'get_my_sanad_agent_context_v1',
  'forget_my_sanad_agent_memory_v1',
]) {
  assert.ok(workspaceApi.includes(rpc), `workspace API missing ${rpc}`);
  assert.ok(migration.includes(rpc), `migration missing ${rpc}`);
}

for (const required of [
  'loadAgentCloudContext',
  'save_sanad_agent_turn_v1',
  'upsert_sanad_agent_memory_v1',
  'buildAgentPresentation',
  'maybeRefreshThreadSummary',
]) {
  assert.ok(runtime.includes(required), `runtime missing ${required}`);
}

assert.match(core, /slice\(-24\)/, 'Agent context must include the latest 24 turns');
assert.match(core, /الذاكرة ليست مصدرًا للحقائق المالية الحالية/);
assert.match(presentation, /erp_customer/);
assert.match(presentation, /erp_document/);
assert.match(presentation, /baseline_public_id|snapshot_public_id/);

assert.match(route, /SanadAgentWorkspace/);
assert.doesNotMatch(route, /p_purpose:\s*'financial_workspace'/, 'legacy AI context preload must be removed');
assert.match(api, /sanad-ai-agent-v1/);
assert.match(api, /thread_id/);

for (const source of [workspace, sidebar, responseBlocks, workspaceApi]) {
  assert.doesNotMatch(source, /service_role/i);
  assert.doesNotMatch(source, /business_erp_snapshot_rows/);
}

assert.match(migration, /enable row level security/i);
assert.match(migration, /revoke all on table public\.sanad_agent_messages from public, anon, authenticated/i);
assert.match(migration, /grant execute on function public\.save_sanad_agent_turn_v1.*service_role/i);

console.log('SANAD Agent Workspace v2 contract passed.');


for (const required of ['Copy', 'Share2', 'Star', 'ThumbsUp', 'ThumbsDown']) {
  assert.ok(messageActions.includes(required), `message actions missing ${required}`);
}

assert.match(workspaceApi, /update_my_sanad_agent_message_feedback_v1/);
assert.match(visualMigration, /is_starred/);
assert.match(visualMigration, /rating smallint/);
assert.match(visualMigration, /update_my_sanad_agent_message_feedback_v1/);
assert.match(visualMigration, /security definer/i);
assert.match(visualMigration, /auth\.uid\(\)/);
assert.match(pulse, /sanad-pulse-path/);
assert.match(styles, /sanad-pulse-working/);
assert.match(styles, /prefers-reduced-motion/);

console.log('SANAD Agent Visual v3 contract passed.');


for (const required of [
  'MediaRecorder',
  'getUserMedia',
  'MAX_RECORDING_MS = 90_000',
  'transcribeSanadAudio',
  'تم تحويل الصوت إلى نص. راجعه قبل الإرسال.',
]) {
  assert.ok(voiceButton.includes(required), `voice button missing ${required}`);
}

assert.match(voiceApi, /sanad-ai-transcribe-v1/);
assert.match(voiceApi, /MAX_AUDIO_BYTES = 4 \* 1024 \* 1024/);
assert.match(voiceFunction, /gemini-3\.5-transcribe/);
assert.match(voiceFunction, /upload\/v1beta\/files/);
assert.match(voiceFunction, /transcription_config/);
assert.match(voiceFunction, /custom_vocabulary/);
assert.match(voiceFunction, /mode:\s*"smart"/);
assert.match(voiceFunction, /auth\.getUser/);
assert.match(voiceFunction, /method:\s*"DELETE"/);
assert.match(voiceFunction, /MAX_AUDIO_BYTES = 4 \* 1024 \* 1024/);
assert.match(supabaseConfig, /\[functions\.sanad-ai-transcribe-v1\][\s\S]*verify_jwt = true/);
assert.match(workspace, /SanadVoiceDictationButton/);
assert.match(workspace, /راجع النص الصوتي قبل الإرسال/);
assert.doesNotMatch(voiceButton, /sendPrompt\(/);

console.log('SANAD Voice v1 contract passed.');

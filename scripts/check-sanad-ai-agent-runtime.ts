import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const runtime = readFileSync('supabase/functions/sanad-ai-agent-v1/index.ts', 'utf8');
const shared = readFileSync('supabase/functions/_shared/sanad-agent-core.ts', 'utf8');
const foundation = readFileSync('src/features/assistant/agentFoundation.ts', 'utf8');
const api = readFileSync('src/features/assistant/assistantAgentApi.ts', 'utf8');

for (const required of [
  'gemini-3.8-flash',
  'https://generativelanguage.googleapis.com/v1beta/interactions',
  'MAX_TOOL_CALLS = 8',
  'MAX_TOOL_ROUNDS = 5',
  'MAX_PARALLEL_TOOLS = 4',
  'SYSTEM_INSTRUCTION',
  'verifyAndRepair',
  'inferScope',
  'detectClarification',
]) {
  assert.ok(shared.includes(required), `shared agent core missing ${required}`);
}

for (const required of [
  '../_shared/sanad-agent-core.ts',
  'previous_interaction_id',
  'function_result',
  'get_ai_financial_context_v2',
  'get_ai_erp_read_context_v1',
  'get_business_erp_customer_candidates_v1',
  'record_ai_usage',
  'start_sanad_assistant_tool_execution',
  'finish_sanad_assistant_tool_execution',
  'SUPABASE_ANON_KEY',
  'Authorization: authHeader',
  'auth.getUser(token)',
]) {
  assert.ok(runtime.includes(required), `runtime missing ${required}`);
}

assert.doesNotMatch(runtime, /const SYSTEM_INSTRUCTION\s*=/, 'runtime must not duplicate shared system instruction');
assert.doesNotMatch(runtime, /const TOOLS\s*=\s*\[/, 'runtime must not duplicate shared tool registry');
assert.doesNotMatch(runtime, /from\(["']business_erp_snapshot_rows["']\)/, 'agent runtime must not query raw ERP snapshot rows');
assert.doesNotMatch(runtime, /\.rpc\(["'][^"']*(post|create|settle|reverse)[^"']*["']/, 'agent runtime v1 must not invoke financial mutation RPCs');
assert.match(api, /sanad-ai-agent-v1/);
assert.match(foundation, /writeToolsEnabled: false/);

console.log('SANAD AI Agent Runtime v1 static contract passed.');

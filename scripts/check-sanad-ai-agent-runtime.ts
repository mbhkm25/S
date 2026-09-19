import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const runtime = readFileSync('supabase/functions/sanad-ai-agent-v1/index.ts', 'utf8');
const foundation = readFileSync('src/features/assistant/agentFoundation.ts', 'utf8');
const api = readFileSync('src/features/assistant/assistantAgentApi.ts', 'utf8');

for (const required of [
  'gemini-3.8-flash',
  'https://generativelanguage.googleapis.com/v1beta/interactions',
  'previous_interaction_id',
  'function_result',
  'get_ai_financial_context_v2',
  'get_ai_erp_read_context_v1',
  'get_business_erp_customer_candidates_v1',
  'record_ai_usage',
  'start_sanad_assistant_tool_execution',
  'finish_sanad_assistant_tool_execution',
]) {
  assert.match(runtime, new RegExp(required.replace(/[.*+?^$\{\}()|[\]\\]/g, '\\$&')), `runtime missing ${required}`);
}

assert.match(runtime, /SUPABASE_ANON_KEY/);
assert.match(runtime, /Authorization: authHeader/);
assert.match(runtime, /auth\.getUser\(token\)/);
assert.match(runtime, /MAX_TOOL_CALLS = 8/);
assert.match(runtime, /MAX_TOOL_ROUNDS = 5/);
assert.match(runtime, /MAX_PARALLEL_TOOLS = 4/);
assert.match(runtime, /never|لا تخلط العملات/i);
assert.doesNotMatch(runtime, /from\(["']business_erp_snapshot_rows["']\)/, 'agent runtime must not query raw ERP snapshot rows');
assert.doesNotMatch(runtime, /\.rpc\(["'][^"']*(post|create|settle|reverse)[^"']*["']/, 'agent runtime v1 must not invoke financial mutation RPCs');
assert.match(api, /sanad-ai-agent-v1/);
assert.match(foundation, /writeToolsEnabled: false/);

console.log('SANAD AI Agent Runtime v1 static contract passed.');

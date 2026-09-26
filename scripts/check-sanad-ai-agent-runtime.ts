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
  'record_sanad_agent_server_metric_v1',
  'aggregateUsage',
  'modelLatencyMs',
  'retryCount',
  'persistenceMs',
]) {
  assert.ok(runtime.includes(required), `runtime missing ${required}`);
}

assert.doesNotMatch(runtime, /const SYSTEM_INSTRUCTION\s*=/, 'runtime must not duplicate shared system instruction');
assert.doesNotMatch(runtime, /const TOOLS\s*=\s*\[/, 'runtime must not duplicate shared tool registry');
assert.doesNotMatch(runtime, /from\(["']business_erp_snapshot_rows["']\)/, 'agent runtime must not query raw ERP snapshot rows');
assert.doesNotMatch(runtime, /post_business_commercial_document_v1|settle_business_commercial_document_v1|create_personal_finance_transaction_v1|reverse_personal_finance_transaction_v1/, 'Agent runtime must not invoke domain mutation RPCs directly');
assert.match(runtime, /create_my_sanad_agent_action_draft_v1/, 'Agent runtime may create review-only action drafts');
assert.doesNotMatch(shared, /approve_my_sanad_agent_action_v1|cancel_my_sanad_agent_action_v1/, 'model tool registry must not expose approval/cancel RPCs');
assert.match(runtime, /get_business_payment_inbox_v3/);
assert.doesNotMatch(runtime, /claim_business_payment_v2|complete_business_payment_v2|release_business_payment_v2|resolve_business_payment_reuse_v1/, 'Payment Inbox is read-only in Agent Action v1');
assert.match(api, /sanad-ai-agent-v1/);
assert.match(foundation, /writeToolsEnabled: false/);

console.log('SANAD AI Agent Runtime v1 static contract passed.');

assert.match(shared, /maxAttempts = 3/);
assert.match(shared, /response\.status === 429 \|\| response\.status >= 500/);
assert.match(shared, /__sanad_retry_count/);
assert.match(runtime, /recordAgentServerMetric/);
assert.match(runtime, /contextLoadMs/);
assert.match(runtime, /attachmentContextMs/);
assert.match(runtime, /toolTrace\.reduce\(\(sum,item\)=>sum\+item\.latency_ms,0\)/);
assert.match(runtime, /p_usage_metadata: aggregateUsage/);

 
// Stage 2C.5: bounded source-only terminal synthesis replaces a sixth tool
// round in both SSE and JSON paths. Do not increase authorized tool limits.
const terminal = 'round === MAX_TOOL_ROUNDS - 1 || totalToolCalls >= MAX_TOOL_CALLS ? {} : { tools: TOOLS }';
assert.equal(runtime.split(terminal).length - 1, 2,
  'Both response transports must disable function tools on the terminal round.');
assert.match(shared, /21\) في طلبات كشف حساب العميل/);
assert.match(shared, /23\) لا تعرض أسماء الأدوات/);
assert.doesNotMatch(runtime, /MAX_TOOL_ROUNDS\s*\+\s*[1-9]/,
  'Do not hide runaway orchestration by increasing tool budgets.');
console.log('Stage 2C.5 bounded, source-only final-answer runtime safeguards PASS.');

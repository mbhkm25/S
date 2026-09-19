import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const runner = readFileSync('supabase/functions/sanad-ai-agent-eval-v1/index.ts', 'utf8');
const runtime = readFileSync('supabase/functions/sanad-ai-agent-v1/index.ts', 'utf8');
const shared = readFileSync('supabase/functions/_shared/sanad-agent-core.ts', 'utf8');
const migration = readFileSync('supabase/migrations/20260919214500_sanad_ai_agent_eval_strict_tools_v1.sql', 'utf8');

for (const required of [
  '../_shared/sanad-agent-core.ts',
  'is_current_platform_admin',
  'get_sanad_agent_eval_suite_v1',
  'start_sanad_agent_eval_run_v1',
  'record_sanad_agent_eval_result_v1',
  'finalize_sanad_agent_eval_run_v1',
  'tool_fixtures',
  'fixture_mode',
  'gemini-3.1-pro-preview',
]) {
  assert.ok(runner.includes(required), `live eval runner missing ${required}`);
}

for (const sharedSymbol of [
  'SYSTEM_INSTRUCTION',
  'TOOLS',
  'geminiInteraction',
  'verifyAndRepair',
  'inferScope',
  'detectClarification',
]) {
  assert.ok(runner.includes(sharedSymbol), `eval runner must use shared ${sharedSymbol}`);
  assert.ok(runtime.includes(sharedSymbol), `production runtime must use shared ${sharedSymbol}`);
}

assert.doesNotMatch(runner, /business_erp_snapshot_rows/, 'eval runner must not use raw ERP tables');
assert.doesNotMatch(runner, /const SYSTEM_INSTRUCTION\s*=/, 'eval runner must not duplicate production prompt');
assert.doesNotMatch(runner, /const TOOLS\s*=\s*\[/, 'eval runner must not duplicate production tools');
assert.ok(migration.includes('"strict_tools":true'), 'golden suite must reject unexpected tools');
assert.ok(migration.includes("'unexpected_tool'"), 'strict evaluator must record unexpected tools');
assert.ok(shared.includes('extractPeriodFromOutput'), 'shared verifier must inspect tool output periods');

console.log('SANAD AI Live Eval Runner v1 contract passed.');

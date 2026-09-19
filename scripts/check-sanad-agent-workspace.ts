import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workspace = readFileSync('src/features/assistant/SanadAgentWorkspace.tsx', 'utf8');
const route = readFileSync('src/features/financial/FinancialWorkspaceRoute.tsx', 'utf8');
const api = readFileSync('src/features/assistant/assistantAgentApi.ts', 'utf8');

for (const required of [
  'runSanadAiAgentTurn',
  'get_my_account_center_v1',
  'محادثة جديدة',
  'خطوات التنفيذ والمصادر',
  'Shift + Enter',
  'قراءة فقط',
  'tool_trace',
]) {
  assert.ok(workspace.includes(required), `workspace missing ${required}`);
}

assert.match(route, /SanadAgentWorkspace/);
assert.doesNotMatch(route, /p_purpose:\s*'financial_workspace'/, 'legacy AI context preload must be removed');
assert.match(api, /sanad-ai-agent-v1/);
assert.doesNotMatch(workspace, /service_role/i);
assert.doesNotMatch(workspace, /business_erp_snapshot_rows/);

console.log('SANAD Agent Workspace v1 contract passed.');

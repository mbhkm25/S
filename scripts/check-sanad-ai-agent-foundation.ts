import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  SANAD_ASSISTANT_EXECUTION_POLICY,
  SANAD_ASSISTANT_MODEL_POLICY,
  SANAD_ASSISTANT_SYSTEM_PRINCIPLES,
  SANAD_ASSISTANT_TOOLS,
  isToolExecutableNow,
} from '../src/features/assistant/agentFoundation';

assert.equal(SANAD_ASSISTANT_MODEL_POLICY.primaryModel, 'gemini-3.8-flash');
assert.equal(SANAD_ASSISTANT_MODEL_POLICY.useInteractionsApi, true);
assert.equal(SANAD_ASSISTANT_MODEL_POLICY.useGenerateContentForNewWebAgent, false);
assert.equal(SANAD_ASSISTANT_EXECUTION_POLICY.writeToolsEnabled, false);
assert.equal(SANAD_ASSISTANT_EXECUTION_POLICY.neverExposeRawErpRows, true);
assert.equal(SANAD_ASSISTANT_EXECUTION_POLICY.neverMergeCurrencies, true);
assert.equal(SANAD_ASSISTANT_EXECUTION_POLICY.neverUseFreeFormSql, true);

const names = new Set<string>();
for (const tool of SANAD_ASSISTANT_TOOLS) {
  assert.ok(!names.has(tool.name), `duplicate tool name: ${tool.name}`);
  names.add(tool.name);
  assert.equal(tool.parameters.additionalProperties, false, `${tool.name} must reject undeclared parameters`);
  assert.equal(tool.risk, 'read_only', `${tool.name} must remain read-only in v1`);
  assert.equal(isToolExecutableNow(tool.name), true, `${tool.name} should be executable in read-only v1`);
}

for (const required of [
  'finance_get_overview',
  'finance_search_transactions',
  'business_list_accessible',
  'business_get_dashboard',
  'erp_search_customers',
  'erp_get_customer_statement',
  'erp_get_documents',
  'sanad_search_knowledge',
]) {
  assert.ok(names.has(required), `missing required SANAD Assistant tool: ${required}`);
}

const principles = SANAD_ASSISTANT_SYSTEM_PRINCIPLES.join('\n');
assert.match(principles, /Never merge currencies/i);
assert.match(principles, /never guess the account/i);
assert.match(principles, /read-only/i);
assert.match(principles, /Do not expose private chain-of-thought/i);

const architecture = readFileSync('docs/architecture/sanad-assistant-agent-runtime-v1.md', 'utf8');
assert.match(architecture, /Interactions API/);
assert.match(architecture, /Draft -> Review -> Explicit user approval/);
assert.match(architecture, /no free SQL/i);
assert.match(architecture, /stateless/i);

console.log('SANAD Assistant agent foundation contract passed.');

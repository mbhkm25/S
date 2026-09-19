import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync('supabase/migrations/20260919212000_sanad_ai_agent_eval_foundation_v1.sql', 'utf8');

for (const caseKey of [
  'agent_v1_personal_spend_month',
  'agent_v1_personal_receivables',
  'agent_v1_business_list',
  'agent_v1_ambiguous_business_sales',
  'agent_v1_customer_ambiguous',
  'agent_v1_customer_statement_resolved',
  'agent_v1_sales_week',
  'agent_v1_purchases_yesterday',
  'agent_v1_replica_status',
  'agent_v1_multi_currency_compare',
  'agent_v1_write_refusal',
  'agent_v1_product_knowledge',
]) {
  assert.ok(migration.includes(caseKey), `missing golden eval case: ${caseKey}`);
}

for (const fn of [
  'start_sanad_agent_eval_run_v1',
  'get_sanad_agent_eval_suite_v1',
  'record_sanad_agent_eval_result_v1',
  'finalize_sanad_agent_eval_run_v1',
]) {
  assert.ok(migration.includes(fn), `missing agent eval function: ${fn}`);
}

assert.ok(migration.includes('"tool_fixtures"'), 'golden cases must use deterministic tool fixtures');
assert.ok(migration.includes('"require_currency_separation":true'), 'suite must enforce currency separation');
assert.ok(migration.includes('"require_clarification":true'), 'suite must test ambiguity handling');
assert.ok(migration.includes('"forbid_all_tools":true'), 'suite must test write refusal without mutation tools');
assert.ok(migration.includes("p_min_pass_rate numeric default 95"), 'release gate must require at least 95% pass rate');
assert.ok(migration.includes("v_critical = 0"), 'release gate must require zero critical failures');
assert.match(migration, /grant execute[\s\S]*service_role/);
assert.doesNotMatch(migration, /grant execute[\s\S]*authenticated;/, 'agent eval lifecycle must remain service-role only');

console.log('SANAD AI Agent Eval Foundation v1 contract passed.');

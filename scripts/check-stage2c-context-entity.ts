import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolveSanadCustomerStatementTarget } from '../src/features/assistant/sanadEntityContext';
import { formatSanadSourceAmount } from '../src/utils/sanadSourceDisplay';
import { classifySanadAnswerCard, classifySanadEntity } from '../src/features/assistant/sanadInteractiveResultKinds';
import type { SanadAssistantAnswerCard, SanadAssistantEntity } from '../src/features/assistant/agentFoundation';

const businessA = '11111111-1111-4111-8111-111111111111';
const businessB = '22222222-2222-4222-8222-222222222222';
const context = { projectKind: 'business' as const, businessId: businessA, threadId: 'verified-thread' };

assert.deepEqual(resolveSanadCustomerStatementTarget(context, { accountId: 17 }), {
  businessId: businessA, accountId: 17, fromDate: null, toDate: null,
});
assert.deepEqual(resolveSanadCustomerStatementTarget(context, {
  accountId: 17, businessId: businessA, fromDate: '2026-01-01', toDate: '2026-09-01',
}), { businessId: businessA, accountId: 17, fromDate: '2026-01-01', toDate: '2026-09-01' });

assert.equal(resolveSanadCustomerStatementTarget(null, { accountId: 17 }), null, 'Unverified thread is not a business Context Pack');
assert.equal(resolveSanadCustomerStatementTarget({ ...context, threadId: '' }, { accountId: 17 }), null);
assert.equal(resolveSanadCustomerStatementTarget(context, { accountId: 17, businessId: businessB }), null, 'Model cannot switch business');
for (const id of [null, 0, -1, NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
  assert.equal(resolveSanadCustomerStatementTarget(context, { accountId: id }), null, 'Uncertain ERP ID must be rejected');
}
for (const [fromDate,toDate] of [['2026-02-30','2026-03-01'],['2026-09-02','2026-09-01'],['2026-01-01','tomorrow']]) {
  assert.equal(resolveSanadCustomerStatementTarget(context, { accountId: 17, fromDate, toDate }), null);
}

assert.equal(formatSanadSourceAmount(null).text, '—');
assert.equal(formatSanadSourceAmount('1000000000000.12345678').text, '1,000,000,000,000.12345678');
assert.equal(formatSanadSourceAmount('-0.001', 'SAR').text, '-0.001');

// v4 semantics are a presentation adapter; the existing wire card and action API remain unchanged.
const metric = { type: 'metric', title: 'التزام', value: '1' } as SanadAssistantAnswerCard;
const statement = { type: 'customer_statement', title: 'كشف' } as SanadAssistantAnswerCard;
const action = (status: string, action_type: string) => ({
  type: 'action_review', action_id: 'test', status, action_type,
}) as SanadAssistantAnswerCard;
assert.equal(classifySanadAnswerCard(metric), 'snapshot');
assert.equal(classifySanadAnswerCard(statement), 'report');
assert.equal(classifySanadAnswerCard(action('review', 'personal_transaction')), 'approval');
assert.equal(classifySanadAnswerCard(action('completed', 'commercial_document_draft')), 'draft');
assert.equal(classifySanadAnswerCard(action('completed', 'personal_transaction')), 'execution_result');
assert.equal(classifySanadAnswerCard(action('failed', 'personal_transaction')), 'warning');
assert.equal(classifySanadEntity({ type: 'erp_customer', label: 'Customer' } as SanadAssistantEntity), 'record');


const workspace = readFileSync('src/features/assistant/SanadAgentWorkspace.tsx', 'utf8');
const response = readFileSync('src/features/assistant/SanadAgentResponseBlocks.tsx', 'utf8');
const inspector = readFileSync('src/features/assistant/SanadCustomerStatementInspector.tsx', 'utf8');
const existing = readFileSync('src/components/business/BusinessErpCustomerStatement.tsx', 'utf8');
assert.match(workspace, /getSanadAgentThread\(selectedThreadId\)/);
assert.match(workspace, /verifiedThreadScope === 'business' \? businessId : null/);
assert.match(workspace, /verifiedThreadScope === 'business' \? selectedThreadId : null/);
assert.match(response, /resolveSanadCustomerStatementTarget/);
assert.match(response, /SanadCustomerStatementInspector/);
assert.match(response, /data-sanad-result-kind/);
assert.match(inspector, /getBusinessErpCustomerStatement\(/, 'Inspector MUST use existing canonical RPC adapter');
assert.doesNotMatch(inspector, /supabase\.(from|rpc)\(/, 'Do not invent an independent data path');
assert.match(inspector, /snapshot_public_id/);
assert.match(existing, /formatSanadSourceAmount\(value\)/);
assert.doesNotMatch(existing, /Number\(value \|\| 0\)/);
console.log('Stage 2C.4 typed context, real RPC reuse and regression checks PASS');

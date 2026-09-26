import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolveSanadCustomerStatementTarget, resolveSanadErpDocumentTarget } from '../src/features/assistant/sanadEntityContext';
import { formatSanadSourceAmount } from '../src/utils/sanadSourceDisplay';
import { formatSanadErpLedgerDate } from '../src/utils/sanadErpLedgerDate';
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

// Document links must have the same business isolation as customer statements.
assert.deepEqual(resolveSanadErpDocumentTarget(context, {
  documentId: 1239, documentKind: 'sale', businessId: businessA,
}), { documentId: 1239, documentKind: 'sale', businessId: businessA });
assert.equal(resolveSanadErpDocumentTarget(null, { documentId: 1239, documentKind: 'sale' }), null);
assert.equal(resolveSanadErpDocumentTarget(context, { documentId: 1239, documentKind: 'sale', businessId: businessB }), null);
assert.equal(resolveSanadErpDocumentTarget(context, { documentId: 1239, documentKind: null }), null);
for (const documentId of [-1, 0, 1.4, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, null]) {
  assert.equal(resolveSanadErpDocumentTarget(context, { documentId, documentKind: 'purchase' }), null);
}
assert.equal(formatSanadSourceAmount('1000000000000000.123456789').text, '1,000,000,000,000,000.123456789');

assert.equal(formatSanadSourceAmount(null).text, '—');
assert.equal(formatSanadSourceAmount('1000000000000.12345678').text, '1,000,000,000,000.12345678');
assert.equal(formatSanadSourceAmount('-0.001', 'SAR').text, '-0.001');
assert.equal(formatSanadErpLedgerDate('2026-06-06T00:00:00.000').valid, true);
assert.match(formatSanadErpLedgerDate('2026-06-06T00:00:00.000').text, /2026/);
assert.equal(formatSanadErpLedgerDate('2026-02-30T00:00:00.000').valid, false);
assert.equal(formatSanadErpLedgerDate('2026-06-06T24:00:00.000').valid, false);
assert.equal(formatSanadErpLedgerDate('2026-06-06T00:00:00Z').valid, false, 'Timezone-aware timestamps require separate contract');


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
assert.match(response, /data-sanad-statement-actions="responsive-pair"/, 'Statement actions should form one balanced action row');
assert.match(response, /sm:grid-cols-2 sm:items-stretch/, 'Desktop actions should align in equal columns');
assert.match(response, /grid-cols-1 gap-2\.5/, 'Narrow mobile actions must stack without horizontal overflow');
assert.match(response, /data-sanad-statement-action="primary"/, 'Interactive statement is the primary CTA');
assert.match(response, /data-sanad-statement-action="secondary"/, 'Legacy customer account entry is the secondary CTA');
assert.match(response, /from-cyan-200 via-emerald-100 to-lime-100/, 'Primary color remains light SANAD mint/aqua/lime');
assert.match(response, /from-white to-emerald-50/, 'Secondary color must stay lighter than primary');
assert.match(response, /text-slate-900/, 'CTA labels use dark ink on light backgrounds');
assert.match(response, /motion-reduce:transition-none/, 'Respect reduced-motion preferences');

assert.match(response, /const statementGroups = new Map<number, number\[\]>\(\)/);
assert.match(workspace, /data-sanad-statement-narrative="collapsed"/);
assert.match(inspector, /formatSanadErpLedgerDate/);
assert.match(inspector, /data-sanad-parity-warning="unverified"/);
const documentInspector = readFileSync('src/features/assistant/SanadErpDocumentInspector.tsx', 'utf8');
assert.match(response, /data-sanad-document-action="authorized-inspect"/);
assert.match(response, /resolveSanadErpDocumentTarget/, 'ERP document opening must check verified conversation context');
assert.doesNotMatch(response, /href=\{item\.href \|\| '#'/, 'Model-provided document links are not permission grants');
assert.match(documentInspector, /getBusinessErpDocumentDetail\(/, 'Document inspector reuses existing server-authorized RPC');
assert.match(workspace, /card\.type === 'customer_statement' \|\| card\.type === 'document_list'/,
  'Structured document lists should collapse redundant model narrative without losing access');
assert.match(response, /data-sanad-document-list="refined"/, 'Use one compact source document list');
assert.match(response, /documentDate\(item\.date\)/, 'Document list dates must use ERP civil-date formatter');
assert.match(response, /data-sanad-document-view="detail"/, 'Document detail replaces its source list within conversation');
assert.match(response, /inspectedDocumentListIndex === index/, 'Only the originating list must swap to the active document');
assert.match(response, /inspectedDocumentThreadId === verifiedThreadId/, 'Stale thread details must not display in other threads');
assert.match(response, /العودة إلى قائمة المستندات/, 'Detail view must provide an explicit way back');
assert.match(documentInspector, /data-sanad-source-caveat="compact"/,
  'Visible provenance note should disclose, not dominate, source document detail');
assert.match(documentInspector, /text-\[13px\]/, 'Source line items must be legible at default desktop size');
assert.match(documentInspector, /role="region"/, 'Long tables need labeled horizontal overflow');

assert.doesNotMatch(documentInspector, /supabase\.(from|rpc)\(/, 'Document inspector must not invent a second read contract');
assert.match(documentInspector, /formatSanadSourceAmount\(line\.source_total_amount/, 'Preserve source line decimal strings');
assert.doesNotMatch(documentInspector, /reduce\(/, 'No unverified line aggregation or net calculations');
assert.match(inspector, /getBusinessErpCustomerStatement\(/, 'Inspector MUST use existing canonical RPC adapter');
assert.doesNotMatch(inspector, /supabase\.(from|rpc)\(/, 'Do not invent an independent data path');
assert.match(inspector, /snapshot_public_id/);
assert.match(existing, /formatSanadSourceAmount\(value\)/);
assert.doesNotMatch(existing, /Number\(value \|\| 0\)/);
console.log('Stage 2C.4 typed context, real RPC reuse and regression checks PASS');

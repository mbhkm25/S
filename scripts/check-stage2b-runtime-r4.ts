import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describeSanadActionStatus } from '../src/features/assistant/sanadOperationalState';
import { formatSanadSourceAmount, formatSanadSourceDate } from '../src/utils/sanadSourceDisplay';
import { describeSanadWorkItem } from '../src/features/shell/sanadWorkItemPresentation';
import { runInNewContext } from 'node:vm';
import { transpileModule, ModuleKind, ScriptTarget } from 'typescript';

// Exercise the actual Edge presentation source without making frontend tsc
// typecheck Deno's server-only runtime or relying on a production Edge deploy.
const edgeExports: Record<string, unknown> = {};
const edgeSource = readFileSync('supabase/functions/_shared/sanad-agent-presentation.ts', 'utf8');
const edgeJs = transpileModule(edgeSource, {
  compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022 },
}).outputText;
runInNewContext(edgeJs, { exports: edgeExports, Intl }, { filename: 'sanad-agent-presentation.fixture.js' });
const money = edgeExports.money as (value: unknown) => string;
const buildAgentPresentation = edgeExports.buildAgentPresentation as (outputs: Array<{
  name: string; args: Record<string, unknown>; output: unknown;
}>) => { cards: Array<Record<string, unknown>>; copy_text?: string };

// Business document approval creates a SANAD DRAFT; it never proves posting in ERP.
const draft = describeSanadActionStatus('completed', 'commercial_document_draft', { document_id: 'doc-7' });
assert.match(draft.label, /مسودة/);
assert.doesNotMatch(draft.label, /تنفيذ|ترحيل|مُرحل/);
assert.match(draft.detail, /لم يُرحَّل/);
assert.equal(draft.tone, 'success');

const unknownDraft = describeSanadActionStatus('completed', 'commercial_document_draft', {});
assert.equal(unknownDraft.tone, 'warning');
assert.match(unknownDraft.label, /المرجع غير متاح/);
assert.equal(describeSanadActionStatus('completed', 'commercial_document_draft', { document_id: '  ' }).tone, 'warning');
assert.match(describeSanadActionStatus('review', 'personal_transaction').label, /بانتظار اعتمادك/);
assert.match(describeSanadActionStatus('approved', 'personal_transaction').label, /بانتظار التنفيذ/);
assert.match(describeSanadActionStatus('executing', 'personal_transaction').label, /جارٍ/);
assert.equal(describeSanadActionStatus('completed', 'personal_transaction', { transaction_id: 'txn-1' }).tone, 'success');
assert.equal(describeSanadActionStatus('completed', 'personal_transaction', {}).tone, 'warning');
assert.equal(describeSanadActionStatus('unexpected', 'personal_transaction').tone, 'warning');
assert.equal(describeSanadActionStatus('failed', 'personal_transaction').tone, 'danger');

// Never round away source fractional digits or merge incompatible currencies.
assert.deepEqual(formatSanadSourceAmount('123456789012345678.00123', 'SAR'), {
  text: '123,456,789,012,345,678.00123', valid: true, currency: 'SAR',
});
assert.equal(formatSanadSourceAmount(1500, 'SAR').text, '1,500.00');
assert.equal(formatSanadSourceAmount('1500.25', 'YER').text, '1,500.25');
assert.equal(formatSanadSourceAmount('١٢٣٤.٥', 'SAR').text, '1,234.50');
assert.equal(formatSanadSourceAmount('not-a-number', 'SAR').valid, false);

assert.equal(formatSanadSourceDate('2026-09-23').valid, true);
assert.equal(formatSanadSourceDate('2026-09-23T00:00:00Z').valid, true);
assert.equal(formatSanadSourceDate('2026-09-23T00:00:00').valid, false);
assert.equal(formatSanadSourceDate('2026-02-30').valid, false);
assert.equal(formatSanadSourceDate('2026-02-30T00:00:00Z').valid, false);
assert.equal(formatSanadSourceDate('23T00:00:00 - YER-09-2026').valid, false);

const base = {
  id: 'work-1', source_id: '12345678-1234-4000-8000-123456789aaa',
  item_kind: 'attention', status: 'open',
  source_type: 'business_payment_inbox',
};
const generic = describeSanadWorkItem({ ...base, metadata: { status: 'new' } });
assert.equal(generic.sourceLabel, 'وارد المدفوعات');
assert.equal(generic.reference, '12345678');
assert.equal(generic.incomplete, true);
assert.equal(generic.details.length, 0);
const rich = describeSanadWorkItem({
  ...base, business_id: 'abcdef00-0000-4000-8000-111111111111',
  metadata: { party_name: 'طرف اختبار', currency: 'SAR', amount: '1234.50', reference_number: 'INV-8' },
});
assert.equal(rich.reference, 'INV-8');
assert.ok(rich.details.includes('1,234.50 SAR'));
assert.equal(rich.incomplete, false);

// Existing ERP read-model returns JSON numerics; never claim original precision
// beyond those parsed numeric values, but never round them to 2 decimals again.
assert.equal(money(1234.56789), '1,234.56789');
assert.equal(money(null), '—');
assert.equal(money('123456789012345678.009876'), '123,456,789,012,345,678.009876');

const erp = buildAgentPresentation([{
  name: 'erp_get_customer_statement',
  args: { account_id: 17, business_id: 'business-fixture' },
  output: {
    business_id: 'business-fixture',
    context: {
      account: { account_id: 17, account_number: 'AC-017', account_name: 'Test account' },
      identity: { customer_name: 'Test customer' },
      totals_by_currency: [{
        english_code: 'SAR',
        opening_balance: 1234.56789,
        debit: 0,
        credit: 100.035,
        closing_balance: 1134.53289,
      }, {
        english_code: 'YER',
        opening_balance: null,
        debit: null,
        credit: null,
        closing_balance: null,
      }],
      items: [],
    },
  },
}]);
const copy = String(erp.copy_text || '');
assert.match(copy, /SAR: افتتاحي 1,234\.56789/);
assert.match(copy, /دائن 100\.035/);
assert.match(copy, /YER: افتتاحي — \| مدين —/);
const summaries = erp.cards[0]?.currency_summaries as Array<{ currency: string; opening_balance: number | null }> | undefined;
assert.equal(summaries?.[1]?.opening_balance, null);

const action = readFileSync('src/features/assistant/SanadAgentActionCard.tsx', 'utf8');
const blocks = readFileSync('src/features/assistant/SanadAgentResponseBlocks.tsx', 'utf8');
const today = readFileSync('src/features/shell/SanadUnifiedEntryRoute.tsx', 'utf8');
assert.match(action, /describeSanadActionStatus/);
assert.match(action, /!verified/, 'Review buttons must be disabled until the authoritative action read succeeds.');
assert.match(blocks, /formatSanadSourceAmount/);
assert.match(blocks, /formatSanadSourceDate/);
assert.match(today, /<div key=\{item.id\}><WorkItemRow item=\{item\}/);
assert.match(today, /describeSanadWorkItem/);
console.log('R4 truthful action states, exact source formatting and identifiable Today contract PASS');

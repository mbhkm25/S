import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { expenseFields, expensePayload, supportsExpenseEdit, normalizeExpenseAmount } from '../src/features/assistant/personalExpenseDraft';
import type { SanadAgentAction } from '../src/features/assistant/assistantActionApi';
let cases = 0;
function check(name: string, run: () => void) { run(); cases++; console.log('PASS', name); }
const action: SanadAgentAction = { id: 'action', thread_id: 'thread', business_id: null, action_type: 'personal_transaction', status: 'review', version: 3,
  payload: { transaction_type: 'expense', amount: '125.50', currency: 'SAR', account_id: 'account', category_id: null, description: '', transaction_at: '2026-09-27T07:00:25.123456+00:00' }, review: {} };
const options = { accounts: [{ id: 'account', name: 'المحفظة', currency: 'SAR' }], categories: [{ id: 'category', name: 'طعام' }] };
const descriptor = { schema_version: 1, source: 'server_authorized', thread_id: 'thread', project_kind: 'personal', business_id: null, approval_requires_expected_version: true, erp_write_supported: false,
  actions: [{ id: 'personal_expense', action_type: 'personal_transaction', variant: 'expense', form_edit_supported: true, edit_rpc: 'update_my_sanad_agent_action_draft_v2' }] };
check('authorized matching expense only', () => assert.equal(supportsExpenseEdit(action, descriptor), true));
for (const [label, change] of Object.entries({ missing: null, old: { ...descriptor, actions: [] }, wrongThread: { ...descriptor, thread_id: 'other' }, business: { ...descriptor, business_id: 'other' }, unverified: { ...descriptor, source: 'client' }, unsupported: { ...descriptor, actions: [{ ...descriptor.actions[0], form_edit_supported: false }] } } )) {
  check('deny '+label, () => assert.equal(supportsExpenseEdit(action, change), false));
}
check('deny completed edit', () => assert.equal(supportsExpenseEdit({ ...action, status: 'completed' }, descriptor), false));
check('deny income', () => assert.equal(supportsExpenseEdit({ ...action, payload: { ...action.payload, transaction_type: 'income' } }, descriptor), false));
const fields = expenseFields(action);
check('preserve exact date when unchanged', () => assert.equal(expensePayload(fields, action, options).transaction_at, action.payload.transaction_at));
check('explicit seven fields only and null optionals', () => assert.deepEqual(Object.keys(expensePayload(fields, action, options)).sort(), ['transaction_type','amount','currency','account_id','category_id','description','transaction_at'].sort()));
check('Arabic decimal digits', () => assert.equal(normalizeExpenseAmount('١٢٣٫٤٥'), '123.45'));
check('Persian decimal digits', () => assert.equal(normalizeExpenseAmount('۱۲۳٫۴۵'), '123.45'));
for (const amount of ['0','-1','1e3','1,200','NaN','Infinity','1.1234567','100000000000000','99999999999999.000001']) {
  check('reject amount '+amount, () => assert.throws(() => expensePayload({ ...fields, amount }, action, options)));
}
check('preserve decimal as text', () => assert.equal(expensePayload({ ...fields, amount: '١٢٣٫٤٥' }, action, options).amount, '123.45'));
check('no guessed account', () => assert.throws(() => expensePayload({ ...fields, accountId: 'foreign' }, action, options)));
check('currency mismatch', () => assert.throws(() => expensePayload({ ...fields, currency: 'YER' }, action, options)));
check('unavailable category', () => assert.throws(() => expensePayload({ ...fields, categoryId: 'foreign' }, action, options)));
check('bad date', () => assert.throws(() => expensePayload({ ...fields, localDate: '2026-02-30T07:00' }, action, options)));
check('empty date', () => assert.throws(() => expensePayload({ ...fields, localDate: '' }, action, options)));
check('oversized description', () => assert.throws(() => expensePayload({ ...fields, description: 'x'.repeat(501) }, action, options)));

const db = new PGlite();
await db.exec(`create role anon; create role authenticated; create schema auth; create schema private;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
 create table public.sanad_agent_threads(id uuid primary key,user_id uuid,status text,project_kind text,business_id uuid);
 create function private.user_is_business_owner(uuid,uuid) returns boolean language sql stable as $$ select $2='00000000-0000-4000-8000-000000000001'::uuid $$;
 select set_config('test.uid','00000000-0000-4000-8000-000000000001',false);
 insert into public.sanad_agent_threads values
 ('00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000001','active','personal',null),
 ('00000000-0000-4000-8000-000000000012','00000000-0000-4000-8000-000000000001','active','business','00000000-0000-4000-8000-000000000099'),
 ('00000000-0000-4000-8000-000000000013','00000000-0000-4000-8000-000000000001','active','legacy',null),
 ('00000000-0000-4000-8000-000000000014','00000000-0000-4000-8000-000000000002','active','business','00000000-0000-4000-8000-000000000099');`);
await db.exec(readFileSync('supabase/migrations/20260927091045_stage2d_personal_expense_editor_capability_v1.sql','utf8'));
async function get(id = '11'): Promise<any> { return (await db.query<{ value: unknown }>(`select public.get_my_sanad_action_capabilities_v1('00000000-0000-4000-8000-0000000000${id}') value`)).rows[0].value; }
let value = await get();
check('DB absent edit RPC fails closed', () => assert.equal(value.actions[1].form_edit_supported, false));
await db.exec(`create function public.update_my_sanad_agent_action_draft_v2(uuid,integer,jsonb) returns jsonb language plpgsql as $$ begin raise exception 'executor_tripwire'; end; $$;
 revoke all on function public.update_my_sanad_agent_action_draft_v2(uuid,integer,jsonb) from public;
 grant execute on function public.update_my_sanad_agent_action_draft_v2(uuid,integer,jsonb) to authenticated;`);
value = await get();
check('DB expense advertises available contract', () => assert.equal(value.actions[1].form_edit_supported, true));
check('DB common/income/transfer not advertised', () => { assert.equal(value.form_edit_supported, false); assert.equal(value.actions[0].form_edit_supported, undefined); assert.equal(value.actions[2].form_edit_supported, undefined); });
value = await get('12');
check('DB business no expense form', () => assert.equal(value.actions.some((item: any) => item.form_edit_supported), false));
value = await get('13');
check('DB legacy no actions', () => assert.deepEqual(value.actions, []));
await db.exec(`select set_config('test.uid','00000000-0000-4000-8000-000000000002',false)`);
await assert.rejects(get(), /agent_thread_not_found/); cases++;
value = await get('14');
check('DB restricted business owner no actions', () => assert.deepEqual(value.actions, []));
await db.exec(`select set_config('test.uid','',false)`);
await assert.rejects(get(), /authentication_required/); cases++;
await db.exec(`select set_config('test.uid','00000000-0000-4000-8000-000000000001',false); revoke execute on function public.update_my_sanad_agent_action_draft_v2(uuid,integer,jsonb) from authenticated;`);
value = await get();
check('DB revoked editor fails closed', () => assert.equal(value.actions[1].form_edit_supported, false));
const permissions = (await db.query<{ anon: boolean; authenticated: boolean }>(`select has_function_privilege('anon','public.get_my_sanad_action_capabilities_v1(uuid)','execute') anon,has_function_privilege('authenticated','public.get_my_sanad_action_capabilities_v1(uuid)','execute') authenticated`)).rows[0];
check('DB descriptor grants unchanged', () => assert.deepEqual(permissions, { anon: false, authenticated: true }));
await db.close();
console.log(`Expense editor: ${cases} cases PASS; synthetic database only; zero financial execution.`);

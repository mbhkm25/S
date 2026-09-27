// Isolated fixture adapter, resolved ONLY by this directory's Vite config.
// No Supabase import, credentials, storage, or outbound requests.
import type { SanadAgentAction } from '../../../src/features/assistant/assistantActionApi';
import type { ExpensePayload, ActionCapabilities } from '../../../src/features/assistant/personalExpenseDraft';
export type { SanadAgentAction };
export const options = {
  accounts: [{ id: 'account-sar', name: 'المحفظة الشخصية', currency: 'SAR' }, { id: 'account-sar-2', name: 'حساب الادخار الشخصي', currency: 'SAR' }, { id: 'account-yer', name: 'النقد اليمني', currency: 'YER' }],
  categories: [{ id: 'category-food', name: 'طعام ومشتريات منزلية' }, { id: 'category-travel', name: 'تنقلات' }],
};
export const fixtureId = '00000000-0000-4000-8000-000000000001';
let scenario = 'normal';
let row: SanadAgentAction;
export const calls = { save: 0, approve: 0, cancel: 0, lastVersion: 0 };
function review() {
  row.review = { title: 'مراجعة تسجيل مصروف شخصي', summary: String(row.payload.description || 'مصروف شخصي'), writes_to_erp: false,
    approval_effect: 'سيتم إنشاء قيد مالي شخصي بعد اعتمادك الصريح. الاعتماد معطّل في هذه المعاينة.',
    fields: [{ label: 'الحساب', value: options.accounts.find(item => item.id === row.payload.account_id)?.name || 'غير متاح' },
      { label: 'التصنيف', value: options.categories.find(item => item.id === row.payload.category_id)?.name || 'بدون تصنيف' },
      { label: 'المبلغ', value: `${row.payload.amount} ${row.payload.currency}` },
      { label: 'التاريخ', value: String(row.payload.transaction_at) }] };
}
export function reset(value = 'normal') {
  scenario = value;
  calls.save = 0; calls.approve = 0; calls.cancel = 0; calls.lastVersion = 0;
  row = { id: fixtureId, thread_id: 'thread-personal', business_id: null, action_type: 'personal_transaction', status: 'review', version: 1,
    payload: { transaction_type: 'expense', amount: '125.50', currency: 'SAR', account_id: 'account-sar', category_id: 'category-food', description: 'مشتريات المنزل', transaction_at: '2026-09-27T07:00:25+00:00' }, review: {}, attachment_ids: [] };
  if (value === 'missing-account') row.payload.account_id = 'revoked';
  if (value === 'commercial') { row.action_type = 'commercial_document_draft'; row.business_id = 'business-fixture'; row.payload = { notes: 'مسودة تجارية', document_type: 'sales_invoice' }; }
  review();
}
reset();
export function current() { return structuredClone(row); }
const delay = () => new Promise(resolve => setTimeout(resolve, 180));
export async function getSanadAgentAction(_id: string) { await delay(); return current(); }
export async function getSanadActionCapabilities(threadId: string): Promise<ActionCapabilities> {
  await delay();
  return { schema_version: 1, source: 'server_authorized', thread_id: scenario === 'wrong-thread' ? 'other-thread' : threadId, project_kind: 'personal', business_id: null,
    approval_requires_expected_version: true, erp_write_supported: false,
    actions: [{ id: 'personal_expense', action_type: 'personal_transaction', variant: 'expense', form_edit_supported: scenario !== 'old-server', edit_rpc: 'update_my_sanad_agent_action_draft_v2' }] };
}
export async function getExpenseEditorOptions() {
  await delay();
  if (scenario === 'lookup-error') throw new Error('offline');
  return scenario === 'empty' ? { accounts: [], categories: [] } : structuredClone(options);
}
export async function updateSanadPersonalExpenseDraft(id: string, expectedVersion: number, payload: ExpensePayload) {
  calls.save++; calls.lastVersion = expectedVersion;
  await delay();
  if (scenario === 'conflict') { scenario = 'normal'; row.version++; row.payload.amount = '175'; review(); throw new Error('agent_action_version_conflict'); }
  if (scenario === 'collision') throw new Error('identical_active_action_already_exists');
  if (expectedVersion !== row.version || id !== row.id) throw new Error('agent_action_version_conflict');
  row.payload = { ...row.payload, ...payload }; row.version++; review();
  if (scenario === 'lost-response') { scenario = 'normal'; throw new Error('network_response_lost'); }
  return current();
}
export async function approveSanadAgentAction() { calls.approve++; throw new Error('الاعتماد المالي معطّل في المعاينة المعزولة.'); }
export async function cancelSanadAgentAction() { calls.cancel++; throw new Error('الإلغاء معطّل في هذه المعاينة.'); }
export async function updateSanadAgentActionNote(_id: string, _version: number, note: string) {
  row.payload[row.action_type === 'personal_transaction' ? 'description' : 'notes'] = note; row.version++; review(); return current();
}

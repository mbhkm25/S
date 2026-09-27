import type { SanadAgentAction } from './assistantActionApi';

export type ExpenseAccount = { id: string; name: string; currency: string };
export type ExpenseCategory = { id: string; name: string };
export type ExpenseOptions = { accounts: ExpenseAccount[]; categories: ExpenseCategory[] };
export type ExpenseFields = { amount: string; currency: string; accountId: string; categoryId: string; description: string; localDate: string };
export type ExpensePayload = {
  transaction_type: 'expense'; amount: string; currency: string; account_id: string;
  category_id: string | null; description: string | null; transaction_at: string;
};
export type ActionCapabilities = {
  schema_version: number; source: string; thread_id: string; project_kind: string;
  business_id: string | null; approval_requires_expected_version: boolean; erp_write_supported: boolean;
  actions: Array<{ id: string; action_type: string; variant?: string; form_edit_supported?: boolean; edit_rpc?: string }>;
};

export function isPersonalExpense(action: SanadAgentAction): boolean {
  return action.action_type === 'personal_transaction' && action.payload.transaction_type === 'expense' && !action.business_id;
}
export function supportsExpenseEdit(action: SanadAgentAction, descriptor: ActionCapabilities | null): boolean {
  return isPersonalExpense(action) && action.status === 'review' && descriptor?.schema_version === 1 &&
    descriptor.source === 'server_authorized' && descriptor.thread_id === action.thread_id &&
    descriptor.project_kind === 'personal' && descriptor.business_id === null &&
    descriptor.approval_requires_expected_version === true && descriptor.erp_write_supported === false &&
    Array.isArray(descriptor.actions) && descriptor.actions.some(item => item.id === 'personal_expense' &&
      item.action_type === 'personal_transaction' && item.variant === 'expense' && item.form_edit_supported === true &&
      item.edit_rpc === 'update_my_sanad_agent_action_draft_v2');
}
export function localDateTime(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  const part = (number: number) => String(number).padStart(2, '0');
  return `${date.getFullYear()}-${part(date.getMonth() + 1)}-${part(date.getDate())}T${part(date.getHours())}:${part(date.getMinutes())}`;
}
export function expenseFields(action: SanadAgentAction): ExpenseFields {
  const p = action.payload;
  return { amount: String(p.amount ?? ''), currency: String(p.currency ?? ''), accountId: String(p.account_id ?? ''),
    categoryId: String(p.category_id ?? ''), description: String(p.description ?? ''), localDate: localDateTime(String(p.transaction_at ?? '')) };
}
export function normalizeExpenseAmount(value: string): string {
  return value.trim().replace(/[٠-٩]/g, digit => String(digit.charCodeAt(0) - 0x660))
    .replace(/[۰-۹]/g, digit => String(digit.charCodeAt(0) - 0x6f0)).replace(/٫/g, '.');
}
export function expensePayload(fields: ExpenseFields, original: SanadAgentAction, options: ExpenseOptions): ExpensePayload {
  const amount = normalizeExpenseAmount(fields.amount);
  // Keep decimal input as text. Do not silently round, accept exponent notation, or guess comma separators.
  if (!/^\d{1,14}(\.\d{1,6})?$/.test(amount) || Number(amount) <= 0 || Number(amount) > 99999999999999) {
    throw new Error('أدخل مبلغًا موجبًا، حتى 6 منازل عشرية، دون فواصل آلاف.');
  }
  if (!options.accounts.some(item => item.id === fields.accountId && item.currency === fields.currency)) {
    throw new Error('اختر حسابًا متاحًا بنفس عملة المصروف.');
  }
  if (fields.categoryId && !options.categories.some(item => item.id === fields.categoryId)) {
    throw new Error('اختر تصنيف مصروف متاحًا أو بدون تصنيف.');
  }
  const parsed = new Date(fields.localDate);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(fields.localDate) || !Number.isFinite(parsed.getTime()) || localDateTime(parsed.toISOString()) !== fields.localDate) {
    throw new Error('أدخل تاريخًا ووقتًا صالحين.');
  }
  if (fields.description.length > 500) throw new Error('الوصف لا يتجاوز 500 حرف.');
  return { transaction_type: 'expense', amount, currency: fields.currency, account_id: fields.accountId,
    category_id: fields.categoryId || null, description: fields.description.trim() || null,
    // Preserve exact original seconds/offset when the user has not changed the minute-level date control.
    transaction_at: fields.localDate === expenseFields(original).localDate ? String(original.payload.transaction_at) : parsed.toISOString() };
}

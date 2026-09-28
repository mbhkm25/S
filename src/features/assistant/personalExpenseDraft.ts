import type { SanadAgentAction } from './assistantActionApi';

export type ExpenseAccount = { id: string; name: string; currency: string };
export type ExpenseCategory = { id: string; name: string };
export type ExpenseOptions = { accounts: ExpenseAccount[]; categories: ExpenseCategory[] };
export type ExpenseFields = { amount: string; currency: string; accountId: string; destinationAccountId?: string; categoryId: string; description: string; localDate: string };
export type ExpensePayload = {
  transaction_type: 'expense' | 'income' | 'transfer'; amount: string; currency: string; account_id?: string;
  category_id?: string | null; source_account_id?: string; destination_account_id?: string; description: string | null; transaction_at: string;
};
export type ActionCapabilities = {
  schema_version: number; source: string; thread_id: string; project_kind: string;
  business_id: string | null; approval_requires_expected_version: boolean; erp_write_supported: boolean;
  actions: Array<{ id: string; action_type: string; variant?: string; form_edit_supported?: boolean; edit_rpc?: string }>;
};

export function isPersonalExpense(action: SanadAgentAction): boolean {
  return action.action_type === 'personal_transaction' && action.payload.transaction_type === 'expense' && !action.business_id;
}
export function supportsPersonalEdit(action: SanadAgentAction, descriptor: ActionCapabilities | null): boolean {
  return isPersonalDraft(action) && action.status === 'review' && descriptor?.schema_version === 1 &&
    descriptor.source === 'server_authorized' && descriptor.thread_id === action.thread_id &&
    descriptor.project_kind === 'personal' && descriptor.business_id === null &&
    descriptor.approval_requires_expected_version === true && descriptor.erp_write_supported === false &&
    Array.isArray(descriptor.actions) && descriptor.actions.some(item => item.id === 'personal_' + action.payload.transaction_type &&
      item.action_type === 'personal_transaction' && item.variant === action.payload.transaction_type && item.form_edit_supported === true &&
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
  return { amount: String(p.amount ?? ''), currency: String(p.currency ?? ''), accountId: String((p.transaction_type === 'transfer' ? p.source_account_id : p.account_id) ?? ''), destinationAccountId: String(p.destination_account_id ?? ''),
    categoryId: String(p.category_id ?? ''), description: String(p.description ?? ''), localDate: localDateTime(String(p.transaction_at ?? '')) };
}
export function normalizeExpenseAmount(value: string): string {
  return value.trim().replace(/[٠-٩]/g, digit => String(digit.charCodeAt(0) - 0x660))
    .replace(/[۰-۹]/g, digit => String(digit.charCodeAt(0) - 0x6f0)).replace(/٫/g, '.');
}
export function expensePayload(fields: ExpenseFields, original: SanadAgentAction, options: ExpenseOptions): ExpensePayload {
  if (!isPersonalDraft(original)) throw new Error('نوع المسودة غير قابل للتعديل.');
  const variant = original.payload.transaction_type as ExpensePayload['transaction_type'];
  const amount = normalizeExpenseAmount(fields.amount);
  // Keep decimal input as text. Do not silently round, accept exponent notation, or guess comma separators.
  if (!/^\d{1,14}(\.\d{1,6})?$/.test(amount)) {
    throw new Error('أدخل مبلغًا موجبًا، حتى 6 منازل عشرية، دون فواصل آلاف.');
  }
  const [whole, fraction = ''] = amount.split('.');
  const scaled = BigInt(whole) * 1000000n + BigInt(fraction.padEnd(6, '0'));
  if (scaled <= 0n || scaled > 99999999999999n * 1000000n) throw new Error('المبلغ خارج النطاق المسموح.');
  if (!options.accounts.some(item => item.id === fields.accountId && item.currency === fields.currency)) {
    throw new Error('اختر حسابًا متاحًا بنفس عملة العملية.');
  }
  if (variant !== 'transfer' && fields.categoryId && !options.categories.some(item => item.id === fields.categoryId)) {
    throw new Error('اختر تصنيفًا متاحًا أو بدون تصنيف.');
  }
  const parsed = new Date(fields.localDate);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(fields.localDate) || !Number.isFinite(parsed.getTime()) || localDateTime(parsed.toISOString()) !== fields.localDate) {
    throw new Error('أدخل تاريخًا ووقتًا صالحين.');
  }
  if (fields.description.length > 500) throw new Error('الوصف لا يتجاوز 500 حرف.');
  if (variant === 'transfer' && (fields.accountId === fields.destinationAccountId || !options.accounts.some(a => a.id === fields.destinationAccountId && a.currency === fields.currency))) throw new Error('اختر حساب وجهة مختلفًا وبنفس العملة.');
  return { transaction_type: variant, amount, currency: fields.currency,
    ...(variant === 'transfer' ? {source_account_id: fields.accountId, destination_account_id: fields.destinationAccountId!} : {account_id: fields.accountId, category_id: fields.categoryId || null}),
    description: fields.description.trim() || null,
    // Preserve exact original seconds/offset when the user has not changed the minute-level date control.
    transaction_at: fields.localDate === expenseFields(original).localDate ? String(original.payload.transaction_at) : parsed.toISOString() };
}

export function isPersonalDraft(action: SanadAgentAction): boolean {
  return action.action_type === 'personal_transaction' && ['income','expense','transfer'].includes(String(action.payload.transaction_type)) && action.business_id === null;
}
export function supportsExpenseEdit(action: SanadAgentAction, descriptor: ActionCapabilities | null): boolean {
  return isPersonalExpense(action) && supportsPersonalEdit(action, descriptor);
}

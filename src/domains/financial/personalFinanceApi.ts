import { supabase } from '../../lib/supabase';
import { toUserSafeServiceError } from '../../lib/userFacingError';

export type PersonalFinanceAccountType = 'asset' | 'liability' | 'income' | 'expense' | 'equity';
export type PersonalFinanceTransactionType = 'income' | 'expense' | 'transfer' | 'liability' | 'settlement' | 'adjustment';
export type PersonalFinanceTransactionSource = 'manual' | 'sanad_operation' | 'assistant' | 'import';
export type OperationTransactionDirection = 'incoming' | 'outgoing' | 'internal' | 'unknown';

export type FinancialCurrencySummary = {
  currency: string;
  income: number;
  expense: number;
};

export type PersonalFinanceAccount = {
  id: string;
  account_type: PersonalFinanceAccountType;
  name: string;
  currency: string;
  linked_user_financial_account_id: string | null;
  status: 'active' | 'archived';
  created_at: string;
  current_balance: number;
};

export type PersonalFinanceActivityItem = {
  id: string;
  transaction_type: PersonalFinanceTransactionType;
  transaction_at: string;
  description: string | null;
  amount: number;
  currency: string;
  source: PersonalFinanceTransactionSource;
  category_id: string | null;
  category_name?: string | null;
};

export type PersonalFinanceCategory = {
  id: string;
  kind: 'income' | 'expense';
  name: string;
  parent_id: string | null;
  status: 'active' | 'archived';
  created_at: string;
};

export type LinkableFinancialOperation = {
  operation_id: string;
  public_token: string;
  created_at: string;
  transaction_date: string | null;
  amount: number | null;
  currency: string | null;
  source: string;
  status: string;
  ai_status: string;
  file_original_name: string | null;
  financial_entity: string | null;
  financial_entity_code: string | null;
  transaction_direction: OperationTransactionDirection | null;
  transaction_direction_confidence: number | null;
  sender_name: string | null;
  receiver_name: string | null;
  suggested_transaction_type: 'income' | 'expense' | null;
  linked_transaction_id: string | null;
  source_linked: boolean;
};

export type FinancialHomeContract = {
  contract_version: number;
  period_start: string;
  period_end: string;
  summary_by_currency: FinancialCurrencySummary[];
  accounts: PersonalFinanceAccount[];
  recent_activity: PersonalFinanceActivityItem[];
  unlinked_operations_count: number;
};

export type CreatePersonalFinanceAccountCommand = {
  account_type: 'asset' | 'liability';
  name: string;
  currency: string;
  opening_balance?: number;
  linked_user_financial_account_id?: string | null;
};

export type CreatePersonalFinanceTransactionCommand = {
  transaction_type: 'income' | 'expense' | 'transfer';
  amount: number;
  currency?: string;
  description?: string;
  category_id?: string | null;
  account_id?: string;
  source_account_id?: string;
  destination_account_id?: string;
  transaction_at?: string;
  source?: PersonalFinanceTransactionSource;
  metadata?: Record<string, unknown>;
};

export type CreateFinanceFromOperationCommand = {
  operation_id: string;
  transaction_type: 'income' | 'expense';
  account_id: string;
  amount?: number;
  category_id?: string | null;
  description?: string;
  transaction_at?: string;
  metadata?: Record<string, unknown>;
};

export type FinanceFromOperationResult = {
  transaction_id: string;
  operation_id: string;
  transaction_type: 'income' | 'expense';
  amount: number;
  currency: string;
  amount_overridden: boolean;
  currency_inferred_from_account: boolean;
};

function numberValue(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function nullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function normalizeAccount(value: Record<string, unknown>): PersonalFinanceAccount {
  return {
    id: String(value.id ?? ''),
    account_type: String(value.account_type ?? 'asset') as PersonalFinanceAccountType,
    name: String(value.name ?? ''),
    currency: String(value.currency ?? ''),
    linked_user_financial_account_id: value.linked_user_financial_account_id ? String(value.linked_user_financial_account_id) : null,
    status: String(value.status ?? 'active') as 'active' | 'archived',
    created_at: String(value.created_at ?? ''),
    current_balance: numberValue(value.current_balance),
  };
}

function normalizeActivity(value: Record<string, unknown>): PersonalFinanceActivityItem {
  return {
    id: String(value.id ?? ''),
    transaction_type: String(value.transaction_type ?? 'adjustment') as PersonalFinanceTransactionType,
    transaction_at: String(value.transaction_at ?? ''),
    description: nullableString(value.description),
    amount: numberValue(value.amount),
    currency: String(value.currency ?? ''),
    source: String(value.source ?? 'manual') as PersonalFinanceTransactionSource,
    category_id: value.category_id ? String(value.category_id) : null,
    category_name: nullableString(value.category_name),
  };
}

function normalizeLinkableOperation(value: Record<string, unknown>): LinkableFinancialOperation {
  const direction = nullableString(value.transaction_direction);
  const suggestion = nullableString(value.suggested_transaction_type);
  return {
    operation_id: String(value.operation_id ?? ''),
    public_token: String(value.public_token ?? ''),
    created_at: String(value.created_at ?? ''),
    transaction_date: nullableString(value.transaction_date),
    amount: nullableNumber(value.amount),
    currency: nullableString(value.currency),
    source: String(value.source ?? ''),
    status: String(value.status ?? ''),
    ai_status: String(value.ai_status ?? ''),
    file_original_name: nullableString(value.file_original_name),
    financial_entity: nullableString(value.financial_entity),
    financial_entity_code: nullableString(value.financial_entity_code),
    transaction_direction: direction as OperationTransactionDirection | null,
    transaction_direction_confidence: nullableNumber(value.transaction_direction_confidence),
    sender_name: nullableString(value.sender_name),
    receiver_name: nullableString(value.receiver_name),
    suggested_transaction_type: suggestion === 'income' || suggestion === 'expense' ? suggestion : null,
    linked_transaction_id: nullableString(value.linked_transaction_id),
    source_linked: value.source_linked === true,
  };
}

export async function getFinancialHome(): Promise<FinancialHomeContract> {
  const { data, error } = await supabase.rpc('get_my_financial_home_v1');
  if (error) {
    console.error('[SANAD personal finance home]', { code: error.code, message: error.message, details: error.details });
    throw toUserSafeServiceError(error, 'تعذر تحميل الملخص المالي حاليًا.');
  }

  const payload = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
  const summaries = Array.isArray(payload.summary_by_currency) ? payload.summary_by_currency : [];
  const accounts = Array.isArray(payload.accounts) ? payload.accounts : [];
  const recent = Array.isArray(payload.recent_activity) ? payload.recent_activity : [];

  return {
    contract_version: numberValue(payload.contract_version) || 1,
    period_start: String(payload.period_start ?? ''),
    period_end: String(payload.period_end ?? ''),
    summary_by_currency: summaries.map((item) => {
      const row = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
      return { currency: String(row.currency ?? ''), income: numberValue(row.income), expense: numberValue(row.expense) };
    }),
    accounts: accounts.map((item) => normalizeAccount((item && typeof item === 'object' ? item : {}) as Record<string, unknown>)),
    recent_activity: recent.map((item) => normalizeActivity((item && typeof item === 'object' ? item : {}) as Record<string, unknown>)),
    unlinked_operations_count: numberValue(payload.unlinked_operations_count),
  };
}

export async function getFinancialActivity(limit = 30): Promise<PersonalFinanceActivityItem[]> {
  const { data, error } = await supabase.rpc('get_my_financial_activity_v1', { p_limit: limit });
  if (error) throw toUserSafeServiceError(error, 'تعذر تحميل الحركة المالية حاليًا.');
  const payload = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
  const items = Array.isArray(payload.items) ? payload.items : [];
  return items.map((item) => normalizeActivity((item && typeof item === 'object' ? item : {}) as Record<string, unknown>));
}

export async function getFinancialAccounts(): Promise<PersonalFinanceAccount[]> {
  const { data, error } = await supabase.rpc('get_my_financial_accounts_v1');
  if (error) throw toUserSafeServiceError(error, 'تعذر تحميل الحسابات المالية حاليًا.');
  const items = Array.isArray(data) ? data : [];
  return items.map((item) => normalizeAccount((item && typeof item === 'object' ? item : {}) as Record<string, unknown>));
}

export async function getFinancialCategories(): Promise<PersonalFinanceCategory[]> {
  const { data, error } = await supabase.rpc('get_my_financial_categories_v1');
  if (error) throw toUserSafeServiceError(error, 'تعذر تحميل التصنيفات المالية حاليًا.');
  const items = Array.isArray(data) ? data : [];
  return items.map((item) => {
    const row = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
    return {
      id: String(row.id ?? ''),
      kind: String(row.kind ?? 'expense') as 'income' | 'expense',
      name: String(row.name ?? ''),
      parent_id: row.parent_id ? String(row.parent_id) : null,
      status: String(row.status ?? 'active') as 'active' | 'archived',
      created_at: String(row.created_at ?? ''),
    };
  });
}

export async function getLinkableFinancialOperations(limit = 50, includeLinked = false): Promise<LinkableFinancialOperation[]> {
  const { data, error } = await supabase.rpc('get_my_linkable_financial_operations_v1', {
    p_limit: limit,
    p_include_linked: includeLinked,
  });
  if (error) throw toUserSafeServiceError(error, 'تعذر تحميل عمليات سند المتاحة للمحاسب.');
  const payload = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
  const items = Array.isArray(payload.items) ? payload.items : [];
  return items.map((item) => normalizeLinkableOperation((item && typeof item === 'object' ? item : {}) as Record<string, unknown>));
}

export async function createFinancialAccount(command: CreatePersonalFinanceAccountCommand): Promise<string> {
  const { data, error } = await supabase.rpc('create_personal_finance_account_v1', { p_command: command });
  if (error) throw toUserSafeServiceError(error, 'تعذر إنشاء الحساب المالي. راجع البيانات وحاول مرة أخرى.');
  const payload = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
  return String(payload.account_id ?? '');
}

export async function createFinancialTransaction(command: CreatePersonalFinanceTransactionCommand): Promise<string> {
  const { data, error } = await supabase.rpc('create_personal_finance_transaction_v1', { p_command: command });
  if (error) throw toUserSafeServiceError(error, 'تعذر تسجيل الحركة المالية. راجع البيانات وحاول مرة أخرى.');
  const payload = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
  return String(payload.transaction_id ?? '');
}

export async function createFinancialCategory(kind: 'income' | 'expense', name: string, parentId?: string | null): Promise<string> {
  const { data, error } = await supabase.rpc('create_personal_finance_category_v1', {
    p_command: { kind, name, parent_id: parentId || null },
  });
  if (error) throw toUserSafeServiceError(error, 'تعذر إنشاء التصنيف المالي.');
  const payload = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
  return String(payload.category_id ?? '');
}

export async function createFinanceFromOperation(command: CreateFinanceFromOperationCommand): Promise<FinanceFromOperationResult> {
  const { data, error } = await supabase.rpc('create_personal_finance_from_operation_v1', { p_command: command });
  if (error) throw toUserSafeServiceError(error, 'تعذر إدخال عملية سند إلى المحاسب. راجع الحساب والمبلغ ثم حاول مرة أخرى.');
  const payload = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
  return {
    transaction_id: String(payload.transaction_id ?? ''),
    operation_id: String(payload.operation_id ?? ''),
    transaction_type: String(payload.transaction_type ?? 'expense') as 'income' | 'expense',
    amount: numberValue(payload.amount),
    currency: String(payload.currency ?? ''),
    amount_overridden: payload.amount_overridden === true,
    currency_inferred_from_account: payload.currency_inferred_from_account === true,
  };
}

export async function linkOperationToPersonalFinance(operationId: string, transactionId: string): Promise<void> {
  const { error } = await supabase.rpc('link_operation_to_personal_finance_v1', {
    p_command: {
      operation_id: operationId,
      transaction_id: transactionId,
      link_role: 'evidence',
      link_source: 'manual',
    },
  });
  if (error) throw toUserSafeServiceError(error, 'تعذر ربط العملية بالسجل المالي.');
}

import { supabase } from '../../lib/supabase';
import { toUserSafeServiceError } from '../../lib/userFacingError';
import type { PersonalFinanceAccountType, PersonalFinanceTransactionSource, PersonalFinanceTransactionType } from './personalFinanceApi';

export type FinancialTransactionPosting = {
  id: string;
  account_id: string;
  account_name: string;
  account_type: PersonalFinanceAccountType;
  account_status: 'active' | 'archived';
  direction: 'debit' | 'credit';
  amount: number;
  currency: string;
  exchange_rate: number | null;
  created_at: string;
};

export type FinancialTransactionSourceOperation = {
  operation_id: string;
  public_token: string;
  link_role: 'evidence' | 'source' | 'supporting';
  link_source: 'manual' | 'assistant' | 'system';
  linked_at: string;
  amount: number | null;
  currency: string | null;
  status: string;
  financial_entity: string | null;
};

export type FinancialTransactionRelation = {
  reversal_transaction_id: string;
  reason: string;
  created_at: string;
};

export type FinancialTransactionReverseOf = {
  original_transaction_id: string;
  reason: string;
  created_at: string;
};

export type FinancialTransactionDetail = {
  contract_version: number;
  transaction: {
    id: string;
    transaction_type: PersonalFinanceTransactionType;
    transaction_at: string;
    description: string | null;
    amount: number;
    currency: string;
    status: 'draft' | 'posted' | 'void';
    source: PersonalFinanceTransactionSource;
    category_id: string | null;
    category_name: string | null;
    metadata: Record<string, unknown>;
    created_at: string;
  };
  postings: FinancialTransactionPosting[];
  source_operations: FinancialTransactionSourceOperation[];
  reversal: FinancialTransactionRelation | null;
  reverses: FinancialTransactionReverseOf | null;
};

export type ReverseFinancialTransactionResult = {
  original_transaction_id: string;
  reversal_transaction_id: string;
  reason: string;
  status: 'posted';
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

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export async function getFinancialTransactionDetail(transactionId: string): Promise<FinancialTransactionDetail | null> {
  const { data, error } = await supabase.rpc('get_my_financial_transaction_v1', { p_transaction_id: transactionId });
  if (error) throw toUserSafeServiceError(error, 'تعذر تحميل تفاصيل القيد المالي.');
  if (!data || typeof data !== 'object') return null;

  const payload = data as Record<string, unknown>;
  const transaction = recordValue(payload.transaction);
  const postings = Array.isArray(payload.postings) ? payload.postings : [];
  const sourceOperations = Array.isArray(payload.source_operations) ? payload.source_operations : [];
  const reversal = payload.reversal ? recordValue(payload.reversal) : null;
  const reverses = payload.reverses ? recordValue(payload.reverses) : null;

  if (!transaction.id) return null;

  return {
    contract_version: numberValue(payload.contract_version) || 1,
    transaction: {
      id: String(transaction.id),
      transaction_type: String(transaction.transaction_type ?? 'adjustment') as PersonalFinanceTransactionType,
      transaction_at: String(transaction.transaction_at ?? ''),
      description: nullableString(transaction.description),
      amount: numberValue(transaction.amount),
      currency: String(transaction.currency ?? ''),
      status: String(transaction.status ?? 'posted') as 'draft' | 'posted' | 'void',
      source: String(transaction.source ?? 'manual') as PersonalFinanceTransactionSource,
      category_id: nullableString(transaction.category_id),
      category_name: nullableString(transaction.category_name),
      metadata: recordValue(transaction.metadata),
      created_at: String(transaction.created_at ?? ''),
    },
    postings: postings.map((item) => {
      const row = recordValue(item);
      return {
        id: String(row.id ?? ''),
        account_id: String(row.account_id ?? ''),
        account_name: String(row.account_name ?? ''),
        account_type: String(row.account_type ?? 'asset') as PersonalFinanceAccountType,
        account_status: String(row.account_status ?? 'active') as 'active' | 'archived',
        direction: String(row.direction ?? 'debit') as 'debit' | 'credit',
        amount: numberValue(row.amount),
        currency: String(row.currency ?? ''),
        exchange_rate: nullableNumber(row.exchange_rate),
        created_at: String(row.created_at ?? ''),
      };
    }),
    source_operations: sourceOperations.map((item) => {
      const row = recordValue(item);
      return {
        operation_id: String(row.operation_id ?? ''),
        public_token: String(row.public_token ?? ''),
        link_role: String(row.link_role ?? 'evidence') as 'evidence' | 'source' | 'supporting',
        link_source: String(row.link_source ?? 'manual') as 'manual' | 'assistant' | 'system',
        linked_at: String(row.linked_at ?? ''),
        amount: nullableNumber(row.amount),
        currency: nullableString(row.currency),
        status: String(row.status ?? ''),
        financial_entity: nullableString(row.financial_entity),
      };
    }),
    reversal: reversal ? {
      reversal_transaction_id: String(reversal.reversal_transaction_id ?? ''),
      reason: String(reversal.reason ?? ''),
      created_at: String(reversal.created_at ?? ''),
    } : null,
    reverses: reverses ? {
      original_transaction_id: String(reverses.original_transaction_id ?? ''),
      reason: String(reverses.reason ?? ''),
      created_at: String(reverses.created_at ?? ''),
    } : null,
  };
}

export async function reverseFinancialTransaction(transactionId: string, reason: string): Promise<ReverseFinancialTransactionResult> {
  const { data, error } = await supabase.rpc('reverse_personal_finance_transaction_v1', {
    p_command: { transaction_id: transactionId, reason },
  });
  if (error) throw toUserSafeServiceError(error, 'تعذر عكس القيد المالي. راجع السبب وحاول مرة أخرى.');
  const payload = recordValue(data);
  return {
    original_transaction_id: String(payload.original_transaction_id ?? ''),
    reversal_transaction_id: String(payload.reversal_transaction_id ?? ''),
    reason: String(payload.reason ?? reason),
    status: 'posted',
  };
}

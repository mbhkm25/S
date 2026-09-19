import { supabase } from '../../../lib/supabase';
import type {
  AccountBusiness,
  BusinessParty,
  PersonalAccount,
  PersonalCategory,
  PersonalCorrectionCandidates,
  PersonalParty,
  RpcResult,
  SettlementCandidates,
} from './financialTypes';

export async function getOwnedBusinesses(): Promise<RpcResult<AccountBusiness[]>> {
  const { data, error } = await supabase.rpc('get_my_account_center_v1');
  const businesses = Array.isArray((data as { businesses?: AccountBusiness[] } | null)?.businesses)
    ? ((data as { businesses?: AccountBusiness[] }).businesses || []).filter((item): item is AccountBusiness => Boolean(item?.id))
    : [];
  return { data: businesses, error };
}

export async function getPersonalMasterData(): Promise<{
  accounts: PersonalAccount[];
  categories: PersonalCategory[];
  parties: PersonalParty[];
  error: { message?: string } | null;
}> {
  const [accountResult, categoryResult, partyResult] = await Promise.all([
    supabase.from('personal_finance_accounts').select('id,name,currency,account_type,system_role').eq('status', 'active').is('system_role', null).order('name'),
    supabase.from('personal_finance_categories').select('id,name,kind').eq('status', 'active').order('name'),
    supabase.from('personal_finance_parties').select('id,display_name,party_type,phone').eq('status', 'active').order('display_name'),
  ]);
  const error = accountResult.error || categoryResult.error || partyResult.error;
  return {
    accounts: (accountResult.data || []) as PersonalAccount[],
    categories: (categoryResult.data || []) as PersonalCategory[],
    parties: (partyResult.data || []) as PersonalParty[],
    error,
  };
}

export async function getBusinessParties(businessId: string): Promise<RpcResult<BusinessParty[]>> {
  const { data, error } = await supabase
    .from('business_parties')
    .select('id,display_name,primary_phone')
    .eq('business_id', businessId)
    .eq('status', 'active')
    .order('display_name');
  return { data: (data || []) as BusinessParty[], error };
}

export async function createPersonalAccount(command: {
  name: string;
  account_type: 'asset' | 'liability';
  currency: string;
  opening_balance?: string;
}) {
  return await supabase.rpc('create_personal_finance_account_v1', { p_command: { ...command, metadata: { ui_surface: 'financial_actions' } } });
}

export async function createPersonalCategory(command: { name: string; kind: 'income' | 'expense' }) {
  return await supabase.rpc('create_personal_finance_category_v1', { p_command: { ...command, metadata: { ui_surface: 'financial_actions' } } });
}

export async function createPersonalParty(command: {
  display_name: string;
  party_type: 'person' | 'business' | 'household' | 'other';
  phone?: string;
  email?: string;
  notes?: string;
}) {
  return await supabase.rpc('create_personal_finance_party_v1', { p_command: { ...command, metadata: { ui_surface: 'financial_actions' } } });
}

export async function createPersonalTransaction(command: {
  transaction_type: 'income' | 'expense';
  account_id: string;
  category_id?: string | null;
  amount: string;
  currency: string;
  description?: string;
}) {
  return await supabase.rpc('create_personal_finance_transaction_v1', {
    p_command: { ...command, source: 'manual', metadata: { ui_surface: 'financial_actions' } },
  });
}

export async function createPersonalBudget(command: {
  name: string;
  amount: string;
  currency: string;
  period_start: string;
  period_end: string;
  category_id?: string | null;
}) {
  return await supabase.rpc('create_personal_finance_budget_v1', {
    p_command: { ...command, metadata: { ui_surface: 'financial_actions' } },
  });
}

export async function createPersonalObligation(command: {
  obligation_type: 'payable' | 'receivable';
  title: string;
  amount: string;
  currency: string;
  party_id?: string | null;
  due_date?: string | null;
}) {
  return await supabase.rpc('create_personal_finance_obligation_v1', {
    p_command: { ...command, metadata: { ui_surface: 'financial_actions' } },
  });
}

export async function createPersonalGoal(command: {
  name: string;
  target_amount: string;
  currency: string;
  target_date?: string | null;
  linked_account_id?: string | null;
}) {
  return await supabase.rpc('create_personal_finance_goal_v1', {
    p_command: { ...command, metadata: { ui_surface: 'financial_actions' } },
  });
}

export async function getPersonalCorrectionCandidates(): Promise<RpcResult<PersonalCorrectionCandidates>> {
  const { data, error } = await supabase.rpc('get_personal_finance_correction_candidates_v1');
  return { data: (data || null) as PersonalCorrectionCandidates | null, error };
}

export async function settlePersonalObligation(obligationId: string, transactionId: string, amount: string) {
  return await supabase.rpc('settle_personal_finance_obligation_v1', {
    p_obligation_id: obligationId,
    p_transaction_id: transactionId,
    p_amount: amount,
  });
}

export async function reversePersonalTransaction(transactionId: string, reason: string) {
  return await supabase.rpc('reverse_personal_finance_transaction_v1', {
    p_command: {
      transaction_id: transactionId,
      reason,
      metadata: { ui_surface: 'financial_actions' },
    },
  });
}

export async function createBusinessParty(businessId: string, command: { display_name: string; primary_phone?: string }) {
  return await supabase.rpc('create_business_party_v1', {
    p_command: { business_id: businessId, ...command, metadata: { ui_surface: 'commercial_actions' } },
  });
}

export async function createCommercialDraft(command: {
  business_id: string;
  party_id?: string | null;
  document_type: 'sales_invoice' | 'purchase_invoice' | 'receipt' | 'payment' | 'expense';
  document_number?: string | null;
  document_date: string;
  currency: string;
  description: string;
  amount: string;
}) {
  return await supabase.rpc('create_business_commercial_draft_v1', {
    p_command: {
      business_id: command.business_id,
      party_id: command.party_id || null,
      document_type: command.document_type,
      document_number: command.document_number || null,
      document_date: command.document_date,
      currency: command.currency,
      lines: [{ description: command.description || 'بند مالي', quantity: 1, unit_price: command.amount, discount_amount: 0, tax_amount: 0 }],
      metadata: { ui_surface: 'commercial_actions' },
    },
  });
}

export async function postCommercialDocument(documentId: string) {
  return await supabase.rpc('post_business_commercial_document_v1', { p_document_id: documentId });
}

export async function getSettlementCandidates(businessId: string): Promise<RpcResult<SettlementCandidates>> {
  const { data, error } = await supabase.rpc('get_business_commercial_settlement_candidates_v1', { p_business_id: businessId });
  return { data: (data || null) as SettlementCandidates | null, error };
}

export async function settleCommercialDocument(invoiceId: string, paymentId: string, amount: string) {
  return await supabase.rpc('settle_business_commercial_document_v1', {
    p_invoice_document_id: invoiceId,
    p_payment_document_id: paymentId,
    p_amount: amount,
  });
}


export type PersonalFinanceBalanceItem = {
  id: string;
  name: string;
  account_type: string;
  currency: string;
  system_role?: string | null;
  status: string;
  balance: number;
};

export type PersonalBudgetProgressItem = {
  id: string;
  name: string;
  category_id?: string | null;
  period_start: string;
  period_end: string;
  currency: string;
  budget_amount: number;
  spent_amount: number;
  remaining_amount: number;
  usage_percent: number;
  is_over_budget: boolean;
};

export type PersonalRecentTransactionItem = {
  id: string;
  transaction_type: string;
  transaction_at: string;
  description?: string | null;
  amount: number;
  currency: string;
  status: string;
  party_id?: string | null;
  party_name?: string | null;
};

export type PersonalObligationOverviewItem = {
  id: string;
  obligation_type: 'payable' | 'receivable';
  title: string;
  outstanding_amount: number;
  currency: string;
  due_date?: string | null;
  status: string;
  party_id?: string | null;
  party_name?: string | null;
};

export type PersonalGoalOverviewItem = {
  id: string;
  name: string;
  target_amount: number;
  current_amount: number;
  currency: string;
  target_date?: string | null;
  status: string;
};

export type PersonalPartyOverviewItem = {
  id: string;
  display_name: string;
  party_type?: string | null;
  phone?: string | null;
};

export type PersonalFinanceOverviewData = {
  balances: PersonalFinanceBalanceItem[];
  budgets: PersonalBudgetProgressItem[];
  recent_transactions: PersonalRecentTransactionItem[];
  obligations: PersonalObligationOverviewItem[];
  goals: PersonalGoalOverviewItem[];
  parties: PersonalPartyOverviewItem[];
};

export async function getPersonalFinanceOverview(): Promise<RpcResult<PersonalFinanceOverviewData>> {
  const [balanceResult, budgetResult, transactionResult, obligationResult, goalResult, partyResult] = await Promise.all([
    supabase.rpc('get_my_finance_balances_v1'),
    supabase.rpc('get_my_budget_progress_v1'),
    supabase
      .from('personal_finance_transactions')
      .select('id,transaction_type,transaction_at,description,amount,currency,status,party_id,personal_finance_parties(display_name)')
      .eq('status', 'posted')
      .order('transaction_at', { ascending: false })
      .limit(8),
    supabase
      .from('personal_finance_obligations')
      .select('id,obligation_type,title,outstanding_amount,currency,due_date,status,party_id,personal_finance_parties(display_name)')
      .in('status', ['open', 'partial'])
      .order('due_date', { ascending: true, nullsFirst: false })
      .limit(12),
    supabase
      .from('personal_finance_goals')
      .select('id,name,target_amount,current_amount,currency,target_date,status')
      .eq('status', 'active')
      .order('target_date', { ascending: true, nullsFirst: false })
      .limit(12),
    supabase
      .from('personal_finance_parties')
      .select('id,display_name,party_type,phone')
      .eq('status', 'active')
      .order('display_name')
      .limit(20),
  ]);

  const error = balanceResult.error
    || budgetResult.error
    || transactionResult.error
    || obligationResult.error
    || goalResult.error
    || partyResult.error;

  if (error) return { data: null, error };

  const transactionRows = (transactionResult.data || []) as Array<Record<string, unknown>>;
  const obligationRows = (obligationResult.data || []) as Array<Record<string, unknown>>;

  return {
    data: {
      balances: (((balanceResult.data || {}) as { accounts?: PersonalFinanceBalanceItem[] }).accounts || []),
      budgets: (((budgetResult.data || {}) as { budgets?: PersonalBudgetProgressItem[] }).budgets || []),
      recent_transactions: transactionRows.map((row) => ({
        id: String(row.id || ''),
        transaction_type: String(row.transaction_type || ''),
        transaction_at: String(row.transaction_at || ''),
        description: typeof row.description === 'string' ? row.description : null,
        amount: Number(row.amount || 0),
        currency: String(row.currency || ''),
        status: String(row.status || ''),
        party_id: typeof row.party_id === 'string' ? row.party_id : null,
        party_name: Array.isArray(row.personal_finance_parties)
          ? String((row.personal_finance_parties[0] as Record<string, unknown> | undefined)?.display_name || '')
          : String((row.personal_finance_parties as Record<string, unknown> | null)?.display_name || ''),
      })),
      obligations: obligationRows.map((row) => ({
        id: String(row.id || ''),
        obligation_type: row.obligation_type === 'receivable' ? 'receivable' : 'payable',
        title: String(row.title || ''),
        outstanding_amount: Number(row.outstanding_amount || 0),
        currency: String(row.currency || ''),
        due_date: typeof row.due_date === 'string' ? row.due_date : null,
        status: String(row.status || ''),
        party_id: typeof row.party_id === 'string' ? row.party_id : null,
        party_name: Array.isArray(row.personal_finance_parties)
          ? String((row.personal_finance_parties[0] as Record<string, unknown> | undefined)?.display_name || '')
          : String((row.personal_finance_parties as Record<string, unknown> | null)?.display_name || ''),
      })),
      goals: (goalResult.data || []).map((row) => ({
        id: String(row.id || ''),
        name: String(row.name || ''),
        target_amount: Number(row.target_amount || 0),
        current_amount: Number(row.current_amount || 0),
        currency: String(row.currency || ''),
        target_date: row.target_date || null,
        status: String(row.status || ''),
      })),
      parties: (partyResult.data || []).map((row) => ({
        id: String(row.id || ''),
        display_name: String(row.display_name || ''),
        party_type: row.party_type || null,
        phone: row.phone || null,
      })),
    },
    error: null,
  };
}


export type PersonalTransactionListItem = {
  id: string;
  transaction_type: string;
  transaction_at: string;
  description?: string | null;
  amount: number;
  currency: string;
  status: string;
  source?: string | null;
  reference_code?: string | null;
  category_name?: string | null;
  party_name?: string | null;
};

export type PersonalObligationListItem = {
  id: string;
  obligation_type: 'payable' | 'receivable';
  title: string;
  original_amount: number;
  outstanding_amount: number;
  currency: string;
  due_date?: string | null;
  status: string;
  party_name?: string | null;
};

export type PersonalBudgetListItem = {
  id: string;
  name: string;
  period_start: string;
  period_end: string;
  amount: number;
  currency: string;
  status: string;
  category_name?: string | null;
};

export type PersonalGoalListItem = {
  id: string;
  name: string;
  target_amount: number;
  current_amount: number;
  currency: string;
  target_date?: string | null;
  status: string;
};

export type PersonalPartyListItem = {
  id: string;
  display_name: string;
  party_type?: string | null;
  phone?: string | null;
  email?: string | null;
  notes?: string | null;
  status: string;
};

function relatedName(value: unknown, key: string): string | null {
  if (Array.isArray(value)) {
    const first = value[0];
    if (first && typeof first === 'object' && key in first) return String((first as Record<string, unknown>)[key] || '') || null;
    return null;
  }
  if (value && typeof value === 'object' && key in value) return String((value as Record<string, unknown>)[key] || '') || null;
  return null;
}

export async function getPersonalTransactions(limit = 100): Promise<RpcResult<PersonalTransactionListItem[]>> {
  const { data, error } = await supabase
    .from('personal_finance_transactions')
    .select('id,transaction_type,transaction_at,description,amount,currency,status,source,reference_code,personal_finance_categories(name),personal_finance_parties(display_name)')
    .order('transaction_at', { ascending: false })
    .limit(limit);
  if (error) return { data: null, error };
  return {
    data: (data || []).map((row) => ({
      id: String(row.id),
      transaction_type: String(row.transaction_type || ''),
      transaction_at: String(row.transaction_at || ''),
      description: row.description || null,
      amount: Number(row.amount || 0),
      currency: String(row.currency || ''),
      status: String(row.status || ''),
      source: row.source || null,
      reference_code: row.reference_code || null,
      category_name: relatedName(row.personal_finance_categories, 'name'),
      party_name: relatedName(row.personal_finance_parties, 'display_name'),
    })),
    error: null,
  };
}

export async function getPersonalObligations(limit = 100): Promise<RpcResult<PersonalObligationListItem[]>> {
  const { data, error } = await supabase
    .from('personal_finance_obligations')
    .select('id,obligation_type,title,original_amount,outstanding_amount,currency,due_date,status,personal_finance_parties(display_name)')
    .order('due_date', { ascending: true, nullsFirst: false })
    .limit(limit);
  if (error) return { data: null, error };
  return {
    data: (data || []).map((row) => ({
      id: String(row.id),
      obligation_type: row.obligation_type === 'receivable' ? 'receivable' : 'payable',
      title: String(row.title || ''),
      original_amount: Number(row.original_amount || 0),
      outstanding_amount: Number(row.outstanding_amount || 0),
      currency: String(row.currency || ''),
      due_date: row.due_date || null,
      status: String(row.status || ''),
      party_name: relatedName(row.personal_finance_parties, 'display_name'),
    })),
    error: null,
  };
}

export async function getPersonalBudgets(limit = 100): Promise<RpcResult<PersonalBudgetListItem[]>> {
  const { data, error } = await supabase
    .from('personal_finance_budgets')
    .select('id,name,period_start,period_end,amount,currency,status,personal_finance_categories(name)')
    .order('period_start', { ascending: false })
    .limit(limit);
  if (error) return { data: null, error };
  return {
    data: (data || []).map((row) => ({
      id: String(row.id),
      name: String(row.name || ''),
      period_start: String(row.period_start || ''),
      period_end: String(row.period_end || ''),
      amount: Number(row.amount || 0),
      currency: String(row.currency || ''),
      status: String(row.status || ''),
      category_name: relatedName(row.personal_finance_categories, 'name'),
    })),
    error: null,
  };
}

export async function getPersonalGoals(limit = 100): Promise<RpcResult<PersonalGoalListItem[]>> {
  const { data, error } = await supabase
    .from('personal_finance_goals')
    .select('id,name,target_amount,current_amount,currency,target_date,status')
    .order('created_at', { ascending: false })
    .limit(limit);
  return {
    data: error ? null : (data || []).map((row) => ({
      id: String(row.id),
      name: String(row.name || ''),
      target_amount: Number(row.target_amount || 0),
      current_amount: Number(row.current_amount || 0),
      currency: String(row.currency || ''),
      target_date: row.target_date || null,
      status: String(row.status || ''),
    })),
    error,
  };
}

export async function getPersonalParties(limit = 100): Promise<RpcResult<PersonalPartyListItem[]>> {
  const { data, error } = await supabase
    .from('personal_finance_parties')
    .select('id,display_name,party_type,phone,email,notes,status')
    .order('display_name')
    .limit(limit);
  return {
    data: error ? null : (data || []).map((row) => ({
      id: String(row.id),
      display_name: String(row.display_name || ''),
      party_type: row.party_type || null,
      phone: row.phone || null,
      email: row.email || null,
      notes: row.notes || null,
      status: String(row.status || ''),
    })),
    error,
  };
}

import { supabase } from '../../lib/supabase';

export type SanadAgentActionStatus = 'review' | 'approved' | 'executing' | 'completed' | 'cancelled' | 'failed';

export type SanadAgentAction = {
  id: string;
  user_id?: string;
  thread_id: string;
  business_id?: string | null;
  action_type: 'personal_transaction' | 'commercial_document_draft' | string;
  status: SanadAgentActionStatus | string;
  payload: Record<string, unknown>;
  review: {
    title?: string;
    summary?: string;
    currency?: string;
    amount?: number;
    fields?: Array<{ label?: string; value?: string }>;
    approval_effect?: string;
    writes_to_erp?: boolean;
  };
  attachment_ids?: string[];
  version: number;
  result?: Record<string, unknown> | null;
  error_code?: string | null;
  approved_at?: string | null;
  executed_at?: string | null;
  cancelled_at?: string | null;
  created_at?: string;
  updated_at?: string;
};

export async function getSanadAgentAction(actionId: string): Promise<SanadAgentAction> {
  const { data, error } = await supabase.rpc('get_my_sanad_agent_action_v1', {
    p_action_id: actionId,
  });
  if (error) throw new Error(error.message || 'تعذر تحميل مسودة الإجراء.');
  return data as SanadAgentAction;
}

export async function listSanadAgentActions(
  threadId: string,
  status?: string | null,
  limit = 50,
): Promise<SanadAgentAction[]> {
  const { data, error } = await supabase.rpc('list_my_sanad_agent_actions_v1', {
    p_thread_id: threadId,
    p_status: status || null,
    p_limit: limit,
  });
  if (error) throw new Error(error.message || 'تعذر تحميل إجراءات المحادثة.');
  return Array.isArray(data) ? data as SanadAgentAction[] : [];
}

export async function approveSanadAgentAction(
  actionId: string,
  expectedVersion: number,
): Promise<SanadAgentAction> {
  const { data, error } = await supabase.rpc('approve_my_sanad_agent_action_v1', {
    p_action_id: actionId,
    p_expected_version: expectedVersion,
  });
  if (error) throw new Error(error.message || 'تعذر اعتماد الإجراء.');
  return data as SanadAgentAction;
}

export async function cancelSanadAgentAction(
  actionId: string,
  expectedVersion: number,
): Promise<SanadAgentAction> {
  const { data, error } = await supabase.rpc('cancel_my_sanad_agent_action_v1', {
    p_action_id: actionId,
    p_expected_version: expectedVersion,
  });
  if (error) throw new Error(error.message || 'تعذر إلغاء الإجراء.');
  return data as SanadAgentAction;
}

/**
 * Stage 2D.2-A: edit only the optional description/note of the SAME canonical
 * review action. Every ownership, project, status and version check remains on
 * the server. This deliberately cannot change amounts, accounts or parties.
 */
export async function updateSanadAgentActionNote(
  actionId: string,
  expectedVersion: number,
  note: string,
): Promise<SanadAgentAction> {
  const { data, error } = await supabase.rpc('update_my_sanad_agent_action_note_v1', {
    p_action_id: actionId,
    p_expected_version: expectedVersion,
    p_note: note,
  });
  if (error) throw new Error(error.message || 'تعذر تعديل ملاحظة المسودة.');
  return data as SanadAgentAction;
}

export async function getSanadActionCapabilities(threadId: string): Promise<import('./personalExpenseDraft').ActionCapabilities> {
  const { data, error } = await supabase.rpc('get_my_sanad_action_capabilities_v1', { p_thread_id: threadId });
  if (error) throw new Error('تعذر التحقق من صلاحية تعديل المصروف.');
  return data as import('./personalExpenseDraft').ActionCapabilities;
}

/** Existing owner RLS tables, only active user accounts and expense categories. No parties/balances. */
export async function getExpenseEditorOptions(): Promise<import('./personalExpenseDraft').ExpenseOptions> {
  async function readPages(table: 'personal_finance_accounts' | 'personal_finance_categories') {
    const rows: Array<{ id: string; name: string; currency?: string }> = [];
    for (let offset = 0; offset < 10000; offset += 200) {
      let query = supabase.from(table).select(table === 'personal_finance_accounts' ? 'id,name,currency' : 'id,name')
        .eq('status', 'active').order('name').order('id').range(offset, offset + 199);
      query = table === 'personal_finance_accounts' ? query.is('system_role', null) : query.eq('kind', 'expense');
      const { data, error } = await query;
      if (error) throw new Error('تعذر تحميل الحسابات والتصنيفات. أعد المحاولة.');
      const page = (data || []) as unknown as Array<{ id: string; name: string; currency?: string }>;
      rows.push(...page);
      if (page.length < 200) return rows;
    }
    throw new Error('تعذر تحميل قائمة الحسابات والتصنيفات كاملة.');
  }
  const [accounts, categories] = await Promise.all([readPages('personal_finance_accounts'), readPages('personal_finance_categories')]);
  return { accounts: accounts as import('./personalExpenseDraft').ExpenseAccount[], categories };
}

export async function updateSanadPersonalExpenseDraft(actionId: string, expectedVersion: number, payload: import('./personalExpenseDraft').ExpensePayload): Promise<SanadAgentAction> {
  const { data, error } = await supabase.rpc('update_my_sanad_agent_action_draft_v2', {
    p_action_id: actionId, p_expected_version: expectedVersion, p_payload: payload,
  });
  if (error) throw new Error(error.message || 'تعذر حفظ تعديل المصروف.');
  return data as SanadAgentAction;
}

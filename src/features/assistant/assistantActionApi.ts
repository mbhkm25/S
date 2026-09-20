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

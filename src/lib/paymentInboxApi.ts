import { supabase } from './supabase';

export type PaymentInboxView = 'new' | 'mine' | 'team_active' | 'review' | 'completed' | 'all';

export interface PaymentInboxContext {
  business_id: string;
  business_name: string;
  slug?: string | null;
  is_owner?: boolean;
  is_supervisor?: boolean;
  permissions?: {
    view?: boolean;
    claim?: boolean;
    review?: boolean;
    release?: boolean;
    complete?: boolean;
    reassign?: boolean;
  };
}

export interface PaymentInboxItem {
  id: string;
  operation_id: string;
  public_token: string;
  business_id: string;
  business_name?: string | null;
  status: string;
  row_version: number;
  amount?: number | null;
  currency?: string | null;
  financial_entity?: string | null;
  financial_entity_code?: string | null;
  receiver_name?: string | null;
  receiver_account?: string | null;
  merchant_point?: string | null;
  reference_number?: string | null;
  transaction_datetime?: string | null;
  account_label?: string | null;
  account_holder_name?: string | null;
  claimed_at?: string | null;
  claim_expires_at?: string | null;
  claimed_by_name?: string | null;
  completed_at?: string | null;
  completed_by_name?: string | null;
  completed_source?: string | null;
  created_at?: string | null;
  latest_event_type?: string | null;
  latest_event_at?: string | null;
  action_permissions?: {
    can_claim?: boolean;
    can_complete?: boolean;
    can_release?: boolean;
    can_reassign?: boolean;
    can_request_review?: boolean;
    can_reject?: boolean;
    can_view_history?: boolean;
  };
}

function unwrapItems<T>(payload: unknown): T[] {
  if (Array.isArray(payload)) return payload as T[];
  if (payload && typeof payload === 'object') {
    const items = (payload as { items?: unknown }).items;
    if (Array.isArray(items)) return items as T[];
  }
  return [];
}

export async function getPaymentInboxContexts(): Promise<PaymentInboxContext[]> {
  const { data, error } = await supabase.rpc('get_my_business_payment_inbox_contexts_v2');
  if (error) throw error;
  return unwrapItems<PaymentInboxContext>(data);
}

export async function getPaymentInbox(
  businessId: string,
  view: PaymentInboxView,
  limit = 50
): Promise<PaymentInboxItem[]> {
  const { data, error } = await supabase.rpc('get_business_payment_inbox_v2', {
    p_business_id: businessId,
    p_view: view,
    p_limit: limit,
    p_before_created_at: null,
    p_before_id: null
  });
  if (error) throw error;
  return unwrapItems<PaymentInboxItem>(data);
}

function ensureActionSucceeded(data: unknown, fallback: string): void {
  if (!data || typeof data !== 'object') return;
  const result = data as { ok?: boolean; reason?: string };
  if (result.ok !== false) return;
  if (result.reason === 'claim_race_lost') throw new Error('سبقك عضو آخر إلى استلام العملية.');
  if (result.reason === 'stale_item') throw new Error('تغيّرت العملية على جهاز آخر. حدّث القائمة وحاول مجددًا.');
  throw new Error(fallback);
}

export async function claimPaymentInboxItem(item: PaymentInboxItem): Promise<void> {
  const { data, error } = await supabase.rpc('claim_business_payment_v2', {
    p_inbox_id: item.id,
    p_expected_row_version: item.row_version,
    p_lease_seconds: 300,
    p_source: 'payment_inbox'
  });
  if (error) throw error;
  ensureActionSucceeded(data, 'لم تعد العملية متاحة للاستلام.');
}

export async function completePaymentInboxItem(item: PaymentInboxItem): Promise<void> {
  const { data, error } = await supabase.rpc('complete_business_payment_v2', {
    p_inbox_id: item.id,
    p_expected_row_version: item.row_version,
    p_note: null,
    p_source: 'payment_inbox'
  });
  if (error) throw error;
  ensureActionSucceeded(data, 'تعذر إكمال العملية بعد تغير حالتها.');
}

export async function requestPaymentReview(item: PaymentInboxItem, reason: string): Promise<void> {
  const { data, error } = await supabase.rpc('request_business_payment_review_v2', {
    p_inbox_id: item.id,
    p_expected_row_version: item.row_version,
    p_reason: reason,
    p_source: 'payment_inbox'
  });
  if (error) throw error;
  ensureActionSucceeded(data, 'تعذر إرسال العملية للمراجعة بعد تغير حالتها.');
}

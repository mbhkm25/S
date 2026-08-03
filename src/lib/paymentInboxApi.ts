import { supabase } from './supabase';

export type PaymentInboxView = 'new' | 'mine' | 'team_active' | 'review' | 'completed' | 'all';

export interface PaymentInboxContext {
  business_id: string;
  business_name: string;
  is_owner?: boolean;
  is_supervisor?: boolean;
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
  receiver_name?: string | null;
  receiver_account?: string | null;
  merchant_point?: string | null;
  reference_number?: string | null;
  transaction_datetime?: string | null;
  account_holder_name?: string | null;
  claimed_by_name?: string | null;
  created_at?: string | null;
  action_permissions?: { can_claim?: boolean; can_complete?: boolean };
}

export interface PaymentInboxProAccess {
  isPro: boolean;
  user: unknown | null;
  usage: Record<string, unknown> | null;
}

function unwrapItems<T>(payload: unknown): T[] {
  if (Array.isArray(payload)) return payload as T[];
  if (payload && typeof payload === 'object' && Array.isArray((payload as { items?: unknown }).items)) {
    return (payload as { items: T[] }).items;
  }
  return [];
}

export async function getPaymentInboxContexts(): Promise<PaymentInboxContext[]> {
  const { data, error } = await supabase.rpc('get_my_business_payment_inbox_contexts_v2');
  if (error) throw error;
  return unwrapItems<PaymentInboxContext>(data);
}

export async function getPaymentInbox(businessId: string, view: PaymentInboxView, limit = 50): Promise<PaymentInboxItem[]> {
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

export async function getPaymentInboxProAccess(): Promise<PaymentInboxProAccess> {
  const [{ data: authData, error: authError }, { data: usage, error: usageError }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.rpc('get_my_operation_access_usage')
  ]);
  if (authError) throw authError;
  if (usageError) throw usageError;
  const payload = usage && typeof usage === 'object' ? usage as Record<string, unknown> : null;
  const plan = payload?.plan && typeof payload.plan === 'object' ? payload.plan as Record<string, unknown> : null;
  return { isPro: plan?.is_pro === true, user: authData.user || null, usage: payload };
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

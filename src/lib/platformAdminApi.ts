import { supabase } from './supabase';

export interface PlatformAdminAccess {
  allowed: boolean;
  role: string;
  status: string;
}

export interface AdminStats {
  users: number;
  active_users: number;
  operations: number;
  operations_today: number;
  pending_businesses: number;
  active_subscriptions: number;
  pending_payments: number;
  possible_fraud: number;
}

export interface AdminUser {
  id: string;
  full_name: string | null;
  phone: string | null;
  email: string | null;
  governorate: string | null;
  status: 'active' | 'pending' | 'disabled';
  global_role: string;
  created_at: string;
  last_sign_in_at: string | null;
}

export interface AdminOperation {
  id: string;
  public_token: string;
  source: string;
  status: string;
  ai_status: string;
  ai_error: string | null;
  financial_entity: string | null;
  transaction_type: string | null;
  amount: number | null;
  currency: string | null;
  sanad_risk_level: string;
  sanad_review_status: string;
  possible_fraud: boolean;
  submitted_by_name: string | null;
  submitted_by_phone: string | null;
  created_at: string;
  verified_at: string | null;
}

export interface AdminBusiness {
  id: string;
  name: string;
  slug: string;
  governorate: string | null;
  city: string | null;
  whatsapp: string;
  public_status: string;
  verification_status: string;
  review_note: string | null;
  submitted_for_review_at: string | null;
  reviewed_at: string | null;
  created_at: string;
  owner_user_id: string;
  owner_name: string | null;
  owner_phone: string | null;
}

export interface AdminSubscription {
  id: string;
  user_id: string;
  full_name: string | null;
  phone: string | null;
  plan_code: string;
  status: string;
  current_period_start: string;
  current_period_end: string | null;
  activated_by: string | null;
  created_at: string;
}

export interface AdminPaymentRequest {
  id: string;
  user_id: string;
  full_name: string | null;
  phone: string | null;
  plan_code: string;
  expected_amount: number;
  expected_currency: string;
  months: number;
  payment_network: string;
  transfer_reference: string | null;
  status: string;
  ai_confidence: number | null;
  failure_reason: string | null;
  approved_at: string | null;
  approved_by: string | null;
  created_at: string;
}

export interface AdminPlan {
  code: string;
  display_name: string;
  description: string | null;
  monthly_price_yer: number;
  monthly_access_limit: number;
  billing_duration_days: number;
  currency_code: string;
  features: unknown[];
  permissions: Record<string, unknown>;
  is_active: boolean;
  updated_at: string;
}

export interface AdminPublicInformation {
  support_whatsapp: string | null;
  support_phone: string | null;
  support_email: string | null;
  support_website: string | null;
  support_hours_text: string | null;
  support_days_text: string | null;
  support_response_time_text: string | null;
  updated_at: string;
}

export interface AdminAuditItem {
  id: number;
  action: string;
  target_type: string;
  target_id: string | null;
  reason: string | null;
  actor_name: string | null;
  created_at: string;
}

export interface PlatformAdminSnapshot {
  generated_at: string;
  stats: AdminStats;
  users: AdminUser[];
  operations: AdminOperation[];
  businesses: AdminBusiness[];
  subscriptions: AdminSubscription[];
  payment_requests: AdminPaymentRequest[];
  plans: AdminPlan[];
  public_information: AdminPublicInformation | null;
  audit_log: AdminAuditItem[];
}

function throwIfError(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

export async function getPlatformAdminAccess(): Promise<PlatformAdminAccess> {
  const { data, error } = await supabase.rpc('get_my_platform_admin_access');
  throwIfError(error);
  return data as PlatformAdminAccess;
}

export async function getPlatformAdminSnapshot(limit = 50): Promise<PlatformAdminSnapshot> {
  const { data, error } = await supabase.rpc('platform_admin_get_console_snapshot', { p_limit: limit });
  throwIfError(error);
  return data as PlatformAdminSnapshot;
}

export async function setAdminUserStatus(userId: string, status: AdminUser['status'], reason: string): Promise<void> {
  const { error } = await supabase.rpc('platform_admin_set_user_status', {
    p_user_id: userId,
    p_status: status,
    p_reason: reason
  });
  throwIfError(error);
}

export async function reviewAdminBusiness(businessId: string, decision: string, note: string, reason: string): Promise<void> {
  const { error } = await supabase.rpc('platform_admin_set_business_review', {
    p_business_id: businessId,
    p_decision: decision,
    p_review_note: note,
    p_reason: reason
  });
  throwIfError(error);
}

export async function updateAdminPlan(plan: AdminPlan, reason: string): Promise<void> {
  const { error } = await supabase.rpc('platform_admin_update_plan', {
    p_code: plan.code,
    p_display_name: plan.display_name,
    p_description: plan.description || '',
    p_price_yer: plan.monthly_price_yer,
    p_access_limit: plan.monthly_access_limit,
    p_duration_days: plan.billing_duration_days,
    p_currency_code: plan.currency_code,
    p_features: plan.features,
    p_permissions: plan.permissions,
    p_is_active: plan.is_active,
    p_reason: reason
  });
  throwIfError(error);
}

export async function updateAdminPublicInformation(payload: Partial<AdminPublicInformation>, reason: string): Promise<void> {
  const { error } = await supabase.rpc('platform_admin_update_public_information', {
    p_payload: payload,
    p_reason: reason
  });
  throwIfError(error);
}

import { supabase } from './supabase';

export type BusinessTeamPermissionKey =
  | 'view_customers'
  | 'contact_customers'
  | 'manage_catalog'
  | 'view_reports'
  | 'link_operations';

export type BusinessTeamPermissions = Record<BusinessTeamPermissionKey, boolean>;

export const DEFAULT_TEAM_PERMISSIONS: BusinessTeamPermissions = {
  view_customers: false,
  contact_customers: false,
  manage_catalog: false,
  view_reports: false,
  link_operations: true
};

export interface BusinessTeamMemberV2 {
  membership_id: string;
  business_id: string;
  user_id: string;
  membership_role: 'employee';
  role: 'employee';
  job_title: string | null;
  label: string | null;
  permissions: Partial<BusinessTeamPermissions> | null;
  status: 'active' | 'suspended';
  created_at: string;
  updated_at?: string | null;
  profile?: {
    id?: string;
    full_name?: string | null;
    phone?: string | null;
    status?: string | null;
  } | null;
  pro_subscription?: {
    id: string;
    status: 'active' | 'scheduled';
    current_period_start: string;
    current_period_end: string;
  } | null;
  activity?: {
    linked_count: number;
    verified_count: number;
    last_activity_at: string | null;
  } | null;
}

export interface BusinessTeamMemberOperation {
  link_id: string;
  activity_type: 'linked' | 'verified' | 'linked_and_verified';
  linked_at: string;
  linked_by_user_id: string | null;
  verified_by_user_id: string | null;
  operation: {
    id: string;
    public_token: string;
    created_at: string;
    status: string;
    ai_status: string;
    summary: string | null;
    financial_entity: string | null;
    transaction_type: string | null;
    amount: number | null;
    currency: string | null;
    reference_number: string | null;
    transaction_datetime: string | null;
  };
}

export interface BusinessTeamMemberOperationsResult {
  member: {
    membership_id: string;
    user_id: string;
    status: string;
    job_title: string | null;
    full_name: string | null;
    phone: string | null;
    joined_at: string;
  };
  summary: {
    linked_count: number;
    verified_count: number;
    last_activity_at: string | null;
  };
  items: BusinessTeamMemberOperation[];
  limit: number;
  offset: number;
}

export interface TeamProPurchaseOptions {
  ok: boolean;
  reason?: string;
  business: { id: string; name: string };
  plan: {
    code: string;
    display_name: string;
    description: string | null;
    unit_amount: number;
    currency: string;
    duration_days: number;
    access_limit: number;
    features: unknown[];
    permissions: Record<string, unknown>;
  };
  members: Array<{
    user_id: string;
    membership_id: string;
    full_name: string | null;
    phone: string | null;
    job_title: string | null;
    membership_status: string;
    subscription: BusinessTeamMemberV2['pro_subscription'];
  }>;
  payment_accounts: Array<{
    id: string;
    financial_entity: string;
    account_number: string;
    account_holder_name: string;
    currency: string;
    instructions: string | null;
    display_order: number;
  }>;
  max_beneficiaries: number;
}

export interface BusinessTeamInvitationV2 {
  invitation_id: string;
  id: string;
  business_id: string;
  invited_phone: string;
  invited_user_id?: string | null;
  membership_role: 'employee';
  role: 'employee';
  job_title: string | null;
  label: string | null;
  requested_permissions?: Partial<BusinessTeamPermissions> | null;
  status: 'pending';
  created_at: string;
  expires_at: string;
}

export interface BusinessTeamResult {
  items: BusinessTeamMemberV2[];
  pending_invitations: BusinessTeamInvitationV2[];
}

function normalizePermissions(value?: Partial<BusinessTeamPermissions> | null): BusinessTeamPermissions {
  return { ...DEFAULT_TEAM_PERMISSIONS, ...(value || {}) };
}

export async function getBusinessTeamV2(businessId: string): Promise<BusinessTeamResult> {
  const { data, error } = await supabase.rpc('get_business_team', {
    p_business_id: businessId
  });
  if (error) throw new Error(error.message || 'تعذر تحميل فريق العمل.');

  const payload = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
  const items = Array.isArray(payload.items) ? payload.items as BusinessTeamMemberV2[] : [];
  const pending = Array.isArray(payload.pending_invitations)
    ? payload.pending_invitations as BusinessTeamInvitationV2[]
    : [];

  return {
    items: items.map((item) => ({
      ...item,
      membership_role: 'employee',
      role: 'employee',
      permissions: normalizePermissions(item.permissions)
    })),
    pending_invitations: pending
  };
}

export async function createBusinessTeamInvitationV2(
  businessId: string,
  phone: string,
  jobTitle?: string | null
): Promise<void> {
  const { error } = await supabase.rpc('create_business_team_invitation', {
    p_business_id: businessId,
    p_invited_phone: phone,
    p_label: jobTitle?.trim() || null
  });
  if (error) throw new Error(error.message || 'تعذر إرسال دعوة الفريق.');
}

export async function updateBusinessTeamMemberStatusV2(
  businessId: string,
  memberUserId: string,
  action: 'suspended' | 'reactivated' | 'removed',
  reason?: string | null
): Promise<void> {
  const { error } = await supabase.rpc('update_business_team_member_status', {
    p_business_id: businessId,
    p_member_user_id: memberUserId,
    p_action: action,
    p_reason: reason?.trim() || null
  });
  if (error) throw new Error(error.message || 'تعذر تحديث حالة عضو الفريق.');
}

export async function updateBusinessTeamMemberPermissions(
  businessId: string,
  memberUserId: string,
  jobTitle: string,
  permissions: BusinessTeamPermissions
): Promise<void> {
  const { error } = await supabase.rpc('update_business_team_member_permissions', {
    p_business_id: businessId,
    p_member_user_id: memberUserId,
    p_job_title: jobTitle.trim() || null,
    p_permissions: permissions
  });
  if (error) throw new Error(error.message || 'تعذر حفظ صلاحيات عضو الفريق.');
}

export async function getBusinessTeamMemberOperations(
  businessId: string,
  memberUserId: string,
  activityType: 'all' | 'linked' | 'verified' = 'all',
  limit = 30,
  offset = 0
): Promise<BusinessTeamMemberOperationsResult> {
  const { data, error } = await supabase.rpc('get_business_team_member_operations', {
    p_business_id: businessId,
    p_member_user_id: memberUserId,
    p_activity_type: activityType,
    p_limit: limit,
    p_offset: offset
  });
  if (error) throw new Error(error.message || 'تعذر تحميل سجل عمليات الموظف.');
  return data as BusinessTeamMemberOperationsResult;
}

export async function getBusinessTeamProPurchaseOptions(
  businessId: string
): Promise<TeamProPurchaseOptions> {
  const { data, error } = await supabase.rpc('get_business_team_pro_purchase_options', {
    p_business_id: businessId
  });
  if (error) throw new Error(error.message || 'تعذر تحميل خيارات سند Pro للفريق.');
  return data as TeamProPurchaseOptions;
}

export async function createTeamProPaymentRequest(params: {
  businessId: string;
  beneficiaryUserIds: string[];
  paymentAccountId: string;
  receiptBucket: string;
  receiptPath: string;
  receiptMimeType: string;
  receiptFileName: string;
  receiptFileSize: number;
}): Promise<{
  ok: boolean;
  reason?: string;
  payment_request_id?: string;
  beneficiary_count?: number;
  unit_amount?: number;
  expected_amount?: number;
  expected_currency?: string;
  duration_days?: number;
}> {
  const { data, error } = await supabase.rpc('create_team_pro_payment_request', {
    p_business_id: params.businessId,
    p_beneficiary_user_ids: params.beneficiaryUserIds,
    p_payment_account_id: params.paymentAccountId,
    p_transfer_reference: null,
    p_receipt_bucket: params.receiptBucket,
    p_receipt_path: params.receiptPath,
    p_receipt_mime_type: params.receiptMimeType,
    p_receipt_file_name: params.receiptFileName,
    p_receipt_file_size: params.receiptFileSize
  });
  if (error) throw new Error(error.message || 'تعذر إنشاء طلب تفعيل سند Pro للفريق.');
  return data as {
    ok: boolean;
    reason?: string;
    payment_request_id?: string;
    beneficiary_count?: number;
    unit_amount?: number;
    expected_amount?: number;
    expected_currency?: string;
    duration_days?: number;
  };
}

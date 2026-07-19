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
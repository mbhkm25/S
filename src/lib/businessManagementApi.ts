import { supabase } from './supabase';
import type { BusinessProfile } from './businessApi';

export type FinancialAccount = {
  id: string;
  name: string;
  is_multicurrency: boolean;
  account_number: string | null;
  accounts: { YER?: string | null; SAR?: string | null; USD?: string | null } | null;
};

export type BusinessComplaint = {
  id: string;
  name?: string | null;
  phone?: string | null;
  text?: string | null;
  status: 'pending' | 'resolved';
  created_at?: string | null;
};

export type ManagementBusinessProfile = BusinessProfile & {
  display_tagline?: string | null;
  address_text?: string | null;
  contact_links?: Record<string, string | null> | null;
  working_hours?: Record<string, { open: string; close: string; closed: boolean }> | null;
  profile_sections?: {
    financial_accounts?: FinancialAccount[];
    complaints?: BusinessComplaint[];
    reviews?: unknown[];
  } | null;
};

function unwrap<T>(data: unknown, key: string): T {
  if (!data || typeof data !== 'object') throw new Error('لم تُرجع قاعدة البيانات نتيجة صالحة.');
  return ((data as Record<string, unknown>)[key] ?? data) as T;
}

export async function getBusinessManagementProfile(businessId: string): Promise<ManagementBusinessProfile> {
  const { data, error } = await supabase.rpc('get_business_management_profile', { p_business_id: businessId });
  if (error) throw new Error(error.message || 'تعذر تحميل بيانات إدارة النشاط.');
  return data as ManagementBusinessProfile;
}

export async function upsertFinancialAccount(input: {
  businessId: string;
  accountId?: string | null;
  name: string;
  isMulticurrency: boolean;
  accountNumber?: string | null;
  accounts?: FinancialAccount['accounts'];
}): Promise<FinancialAccount[]> {
  const { data, error } = await supabase.rpc('upsert_business_financial_account', {
    p_business_id: input.businessId,
    p_account_id: input.accountId || null,
    p_name: input.name.trim(),
    p_is_multicurrency: input.isMulticurrency,
    p_account_number: input.accountNumber?.trim() || null,
    p_accounts: input.accounts || null
  });
  if (error) throw new Error(error.message || 'تعذر حفظ الحساب المالي.');
  return unwrap<FinancialAccount[]>(data, 'items');
}

export async function deleteFinancialAccount(businessId: string, accountId: string): Promise<FinancialAccount[]> {
  const { data, error } = await supabase.rpc('delete_business_financial_account', {
    p_business_id: businessId,
    p_account_id: accountId
  });
  if (error) throw new Error(error.message || 'تعذر حذف الحساب المالي.');
  return unwrap<FinancialAccount[]>(data, 'items');
}

export async function saveWorkingHours(
  businessId: string,
  hours: Record<string, { open: string; close: string; closed: boolean }>
): Promise<typeof hours> {
  const { data, error } = await supabase.rpc('set_business_working_hours', {
    p_business_id: businessId,
    p_working_hours: hours
  });
  if (error) throw new Error(error.message || 'تعذر حفظ ساعات العمل.');
  return unwrap<typeof hours>(data, 'working_hours');
}

export async function setComplaintStatus(
  businessId: string,
  complaintId: string,
  status: BusinessComplaint['status']
): Promise<BusinessComplaint[]> {
  const { data, error } = await supabase.rpc('set_business_complaint_status', {
    p_business_id: businessId,
    p_complaint_id: complaintId,
    p_status: status
  });
  if (error) throw new Error(error.message || 'تعذر تحديث حالة الشكوى.');
  return unwrap<BusinessComplaint[]>(data, 'items');
}

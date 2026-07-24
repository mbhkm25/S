import { supabase } from './supabase';

export type BusinessCustomerRelationshipStatus =
  | 'active'
  | 'paused_by_customer'
  | 'left_by_customer'
  | 'removed_by_business'
  | 'blocked_by_business';

export interface BusinessRelationshipPreferences {
  in_app_notifications_enabled: boolean;
  whatsapp_service_enabled: boolean;
  whatsapp_marketing_enabled: boolean;
}

export interface MyBusinessRelationshipDetail {
  relationship: {
    id: string;
    business_id: string;
    status: BusinessCustomerRelationshipStatus;
    source: string;
    joined_at: string;
    updated_at: string;
    ended_at: string | null;
    end_reason_code: string | null;
    preferences_updated_at: string | null;
  } & BusinessRelationshipPreferences;
  business: {
    id: string;
    name: string;
    slug: string;
    whatsapp: string | null;
    public_status: string;
    profile_image_path: string | null;
    logo_path: string | null;
  };
  data_scope: {
    visible_to_business: string[];
    not_visible_to_business: string[];
  };
  events: Array<{
    id: string;
    event_type: string;
    actor_role: 'customer' | 'business' | 'platform' | 'system';
    previous_status: string | null;
    new_status: string | null;
    reason_code: string | null;
    created_at: string;
  }>;
}

function relationshipError(error: { message?: string } | null, fallback: string): Error {
  const code = error?.message || '';
  const messages: Record<string, string> = {
    business_relationship_not_found: 'أنت غير مرتبط بهذا النشاط كعميل.',
    customer_blocked_by_business: 'لا يمكن إعادة الارتباط بهذا النشاط حاليًا.',
    business_rejoin_approval_required: 'تحتاج إعادة الارتباط إلى موافقة النشاط.',
    reason_too_long: 'سبب الإجراء أطول من الحد المسموح.'
  };
  return new Error(messages[code] || fallback);
}

export async function getMyBusinessRelationshipDetail(
  businessId: string
): Promise<MyBusinessRelationshipDetail> {
  const { data, error } = await supabase.rpc('get_my_business_relationship_detail', {
    p_business_id: businessId
  });
  if (error) throw relationshipError(error, 'تعذر تحميل تفاصيل علاقتك بالنشاط.');
  return data as MyBusinessRelationshipDetail;
}

export async function updateMyBusinessContactPreferences(
  businessId: string,
  preferences: BusinessRelationshipPreferences
): Promise<void> {
  const { error } = await supabase.rpc('update_my_business_contact_preferences', {
    p_business_id: businessId,
    p_in_app_notifications_enabled: preferences.in_app_notifications_enabled,
    p_whatsapp_service_enabled: preferences.whatsapp_service_enabled,
    p_whatsapp_marketing_enabled: preferences.whatsapp_marketing_enabled
  });
  if (error) throw relationshipError(error, 'تعذر حفظ تفضيلات التواصل.');
}

export async function leaveBusinessAsCustomer(params: {
  businessId: string;
  reasonCode?: string | null;
  reasonText?: string | null;
  disableCommunicationsOnly?: boolean;
}): Promise<void> {
  const { error } = await supabase.rpc('leave_business_as_customer', {
    p_business_id: params.businessId,
    p_reason_code: params.reasonCode || null,
    p_reason_text: params.reasonText?.trim() || null,
    p_disable_only: Boolean(params.disableCommunicationsOnly)
  });
  if (error) throw relationshipError(error, 'تعذر تنفيذ الإجراء الآن.');
}

export async function updateBusinessCustomerRelationshipStatus(params: {
  businessId: string;
  customerUserId: string;
  action: 'remove' | 'block' | 'reactivate';
  reason?: string | null;
}): Promise<void> {
  const { error } = await supabase.rpc('update_business_customer_relationship_status', {
    p_business_id: params.businessId,
    p_customer_user_id: params.customerUserId,
    p_action: params.action,
    p_reason: params.reason?.trim() || null
  });
  if (error) throw relationshipError(error, 'تعذر تحديث حالة علاقة العميل.');
}

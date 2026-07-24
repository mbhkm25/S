import { supabase } from './supabase';
import { updateBusinessCustomerRelationshipStatus } from './businessRelationshipApi';

export type CustomerEngagementState = 'all' | 'contacted_recently' | 'not_contacted_recently' | 'new';
export type CustomerRelationshipStatus =
  | 'active'
  | 'paused_by_customer'
  | 'left_by_customer'
  | 'removed_by_business'
  | 'blocked_by_business';

export interface BusinessCustomerItem {
  id: string;
  business_id: string;
  user_id: string;
  status: CustomerRelationshipStatus;
  source: string;
  created_at: string;
  updated_at: string;
  ended_at: string | null;
  full_name: string | null;
  phone: string | null;
  marketing_opt_in: boolean;
  in_app_notifications_enabled: boolean;
  whatsapp_service_enabled: boolean;
  whatsapp_marketing_enabled: boolean;
  tags: string[];
  last_contacted_at: string | null;
  contact_count: number;
  engagement_state: Exclude<CustomerEngagementState, 'all'>;
}

export interface BusinessCustomerNote {
  id: string;
  note_text: string;
  created_by_user_id: string;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface BusinessCustomerCommunication {
  id: string;
  channel: 'in_app' | 'whatsapp' | 'manual';
  communication_type: 'message' | 'notification' | 'offer' | 'advertisement' | 'follow_up' | 'whatsapp_opened';
  title: string | null;
  body: string | null;
  delivery_status: 'draft' | 'queued' | 'sent' | 'delivered' | 'opened' | 'failed' | 'recorded';
  created_at: string;
  sent_at: string | null;
  opened_at: string | null;
}

export interface BusinessCustomerRelationshipEvent {
  id: string;
  event_type: string;
  actor_role: 'customer' | 'business' | 'platform' | 'system';
  previous_status: string | null;
  new_status: string | null;
  reason_code: string | null;
  reason_text: string | null;
  created_at: string;
}

export interface BusinessCustomerDetail {
  customer: Omit<BusinessCustomerItem, 'engagement_state'> & {
    end_reason_code: string | null;
    end_reason_text: string | null;
  };
  notes: BusinessCustomerNote[];
  communications: BusinessCustomerCommunication[];
  relationship_events: BusinessCustomerRelationshipEvent[];
}

export async function getBusinessCustomers(businessId: string): Promise<BusinessCustomerItem[]> {
  const { data, error } = await supabase.rpc('get_business_customers', {
    p_business_id: businessId
  });
  if (error) throw new Error(error.message || 'تعذر تحميل العملاء.');
  const items = Array.isArray(data) ? data : (data as { items?: unknown[] } | null)?.items;
  return Array.isArray(items) ? items as BusinessCustomerItem[] : [];
}

export async function getBusinessCustomerDetail(
  businessId: string,
  customerUserId: string
): Promise<BusinessCustomerDetail> {
  const { data, error } = await supabase.rpc('get_business_customer_detail', {
    p_business_id: businessId,
    p_customer_user_id: customerUserId
  });
  if (error) throw new Error(error.message || 'تعذر تحميل ملف العميل.');
  const value = data as BusinessCustomerDetail;
  return { ...value, relationship_events: Array.isArray(value?.relationship_events) ? value.relationship_events : [] };
}

export async function addBusinessCustomerNote(
  businessId: string,
  customerUserId: string,
  noteText: string
): Promise<string> {
  const { data, error } = await supabase.rpc('add_business_customer_note', {
    p_business_id: businessId,
    p_customer_user_id: customerUserId,
    p_note_text: noteText
  });
  if (error) throw new Error(error.message || 'تعذر حفظ الملاحظة.');
  return String(data);
}

export async function recordBusinessCustomerCommunication(params: {
  businessId: string;
  customerUserId: string;
  channel: BusinessCustomerCommunication['channel'];
  communicationType: BusinessCustomerCommunication['communication_type'];
  title?: string | null;
  body?: string | null;
  deliveryStatus?: BusinessCustomerCommunication['delivery_status'];
  externalReference?: string | null;
}): Promise<string> {
  const { data, error } = await supabase.rpc('record_business_customer_communication', {
    p_business_id: params.businessId,
    p_customer_user_id: params.customerUserId,
    p_channel: params.channel,
    p_communication_type: params.communicationType,
    p_title: params.title ?? null,
    p_body: params.body ?? null,
    p_delivery_status: params.deliveryStatus ?? 'recorded',
    p_external_reference: params.externalReference ?? null,
    p_metadata: {}
  });
  if (error) throw new Error(error.message || 'تعذر تسجيل التواصل.');
  return String(data);
}

export async function changeBusinessCustomerRelationship(params: {
  businessId: string;
  customerUserId: string;
  action: 'remove' | 'block' | 'reactivate';
  reason?: string | null;
}): Promise<void> {
  await updateBusinessCustomerRelationshipStatus(params);
}

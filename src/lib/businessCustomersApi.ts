import { supabase } from './supabase';

export type CustomerEngagementState = 'all' | 'active' | 'inactive' | 'new';

export interface BusinessCustomerItem {
  id: string;
  business_id: string;
  user_id: string;
  status: string;
  source: string;
  created_at: string;
  updated_at: string;
  full_name: string | null;
  phone: string | null;
  marketing_opt_in: boolean;
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
  communication_type: 'message' | 'notification' | 'offer' | 'advertisement' | 'follow_up';
  title: string | null;
  body: string | null;
  delivery_status: 'draft' | 'queued' | 'sent' | 'delivered' | 'opened' | 'failed' | 'recorded';
  created_at: string;
  sent_at: string | null;
  opened_at: string | null;
}

export interface BusinessCustomerDetail {
  customer: Omit<BusinessCustomerItem, 'engagement_state'>;
  notes: BusinessCustomerNote[];
  communications: BusinessCustomerCommunication[];
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
  return data as BusinessCustomerDetail;
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

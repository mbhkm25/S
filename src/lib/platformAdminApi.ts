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
  purchase_scope?: 'self' | 'business_team';
  business_id?: string | null;
  business_name?: string | null;
  beneficiary_count?: number;
  unit_amount?: number | null;
}

export interface AdminPaymentBeneficiary {
  id: string;
  beneficiary_user_id: string;
  full_name: string | null;
  phone: string | null;
  business_id: string | null;
  plan_code: string;
  unit_amount: number;
  currency_code: string;
  duration_days: number;
  access_limit: number;
  status: string;
  subscription_id: string | null;
  subscription: null | {
    id: string;
    status: string;
    current_period_start: string;
    current_period_end: string | null;
    activated_by: string | null;
  };
}

export interface AdminPaymentRequestDetails {
  request: AdminPaymentRequest & {
    user_full_name: string | null;
    user_phone: string | null;
    user_governorate: string | null;
    receipt_bucket: string | null;
    receipt_path: string | null;
    receipt_mime_type: string | null;
    receipt_file_name: string | null;
    receipt_file_size: number | null;
    ai_extracted_json: Record<string, unknown>;
    verification_checks: Record<string, unknown>;
    approved_at: string | null;
    approved_by: string | null;
    subscription_id: string | null;
    metadata: Record<string, unknown>;
    updated_at: string;
    purchase_scope: 'self' | 'business_team';
    business_id: string | null;
    business_name: string | null;
    beneficiary_count: number;
    unit_amount: number | null;
  };
  expected_receiver: {
    financial_entity: string | null;
    account_number: string | null;
    account_holder_name: string | null;
    currency: string | null;
  };
  subscription: null | {
    id: string;
    status: string;
    current_period_start: string;
    current_period_end: string | null;
    activated_by: string | null;
  };
  beneficiaries: AdminPaymentBeneficiary[];
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

export interface AdminBusinessCommunitySettings {
  singleton: boolean;
  phase: 'prelaunch' | 'early_access' | 'public' | 'maintenance';
  registration_open: boolean;
  minimum_category_size: number;
  enabled_governorates: string[];
  prelaunch_title: string;
  prelaunch_body: string;
  early_access_title: string;
  early_access_body: string;
  updated_at: string;
  updated_by: string | null;
}

export interface AdminBusinessCommunityMetric {
  governorate?: string | null;
  id?: string;
  name_ar?: string;
  total_count: number;
  published_count: number;
  verified_count: number;
}

export interface AdminBusinessCommunityOverview {
  settings: AdminBusinessCommunitySettings;
  interest_count: number;
  distribution: AdminBusinessCommunityMetric[];
  categories: AdminBusinessCommunityMetric[];
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

export interface AdminWhatsAppStats {
  contacts: number;
  whatsapp_only: number;
  registered: number;
  marketing_opted_in: number;
  messages: number;
  operations: number;
  active_30d: number;
}

export interface AdminWhatsAppContact {
  id: string;
  phone_normalized: string;
  display_name: string | null;
  linked_user_id: string | null;
  linked_user_name: string | null;
  registration_status: string;
  onboarding_status: string;
  transactional_status: 'active' | 'blocked';
  marketing_status: 'unknown' | 'opted_in' | 'opted_out';
  first_seen_at: string;
  last_seen_at: string;
  first_operation_at: string | null;
  last_operation_at: string | null;
  messages_count: number;
  supported_messages_count: number;
  operations_count: number;
  blocked_at: string | null;
}

export interface AdminWhatsAppCampaign {
  id: string;
  name: string;
  purpose: 'install_app' | 'service_update' | 'transactional_notice';
  template_name: string;
  template_language: string;
  template_parameters: string[];
  audience_filter: Record<string, unknown>;
  status: 'draft' | 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled';
  total_recipients: number;
  pending_count: number;
  sent_count: number;
  delivered_count: number;
  read_count: number;
  failed_count: number;
  admin_reason: string | null;
  created_at: string;
  queued_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_by_name: string | null;
}

export interface AdminWhatsAppOverview {
  generated_at: string;
  stats: AdminWhatsAppStats;
  contacts: AdminWhatsAppContact[];
  campaigns: AdminWhatsAppCampaign[];
}

export interface AdminWhatsAppContactDetails {
  contact: AdminWhatsAppContact & { metadata: Record<string, unknown> };
  events: Array<{
    id: string;
    event_type: string;
    external_message_id: string | null;
    operation_id: string | null;
    occurred_at: string;
    metadata: Record<string, unknown>;
  }>;
}

export interface AdminAssistantSettings {
  enabled: boolean;
  model: string;
  temperature: number;
  recent_messages_limit: number;
  search_results_limit: number;
  rate_limit_per_minute: number;
  audio_max_bytes: number;
  memory_enabled: boolean;
  prompt_version: string;
  updated_at: string;
}

export interface AdminAssistantConversation {
  id: string;
  status: 'active' | 'paused' | 'human_handoff' | 'blocked';
  last_intent: string | null;
  last_message_at: string | null;
  preferred_governorate: string | null;
  phone_normalized: string;
  display_name: string | null;
  linked_user_id: string | null;
  message_count: number;
  last_message: string | null;
}

export interface AdminAssistantOverview {
  settings: AdminAssistantSettings;
  stats: {
    conversations: number;
    active_30d: number;
    inbound_messages: number;
    audio_messages: number;
    failed_messages: number;
    avg_latency_ms: number;
  };
  intents: Array<{ intent: string; count: number }>;
  conversations: AdminAssistantConversation[];
  generated_at: string;
}

export interface AdminAssistantThread {
  conversation: AdminAssistantConversation & { summary: string | null };
  contact: AdminWhatsAppContact;
  messages: Array<{
    id: string;
    direction: 'inbound' | 'outbound';
    message_type: 'text' | 'audio' | 'image' | 'system';
    status: string;
    body_text: string | null;
    transcript: string | null;
    intent: string | null;
    latency_ms: number | null;
    error_code: string | null;
    created_at: string;
  }>;
  memories: Array<{
    id: string;
    memory_key: string;
    category: string;
    value_text: string;
    confidence: number;
    updated_at: string;
  }>;
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

export async function getAdminBusinessCommunitySettings(): Promise<AdminBusinessCommunityOverview> {
  const { data, error } = await supabase.rpc('platform_admin_get_business_community_settings');
  throwIfError(error);
  return data as AdminBusinessCommunityOverview;
}

export async function updateAdminBusinessCommunitySettings(
  payload: Partial<AdminBusinessCommunitySettings>,
  reason: string
): Promise<void> {
  const { error } = await supabase.rpc('platform_admin_update_business_community_settings', {
    p_payload: payload,
    p_reason: reason
  });
  throwIfError(error);
}

export async function getAdminPaymentRequestDetails(paymentRequestId: string): Promise<AdminPaymentRequestDetails> {
  const { data, error } = await supabase.rpc('platform_admin_get_payment_request_details', {
    p_payment_request_id: paymentRequestId
  });
  throwIfError(error);
  return data as AdminPaymentRequestDetails;
}

export async function getAdminPaymentReceiptUrl(details: AdminPaymentRequestDetails): Promise<string | null> {
  const { receipt_bucket: bucket, receipt_path: path } = details.request;
  if (!bucket || !path) return null;
  if (bucket !== 'operation-files' || !path.startsWith('pro-payment-receipts/')) {
    throw new Error('invalid_payment_receipt_path');
  }
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 300);
  throwIfError(error);
  return data.signedUrl;
}

export async function reviewAdminPaymentRequest(
  paymentRequestId: string,
  decision: 'approve' | 'reject',
  reason: string
): Promise<void> {
  const { error } = await supabase.rpc('platform_admin_review_payment_request', {
    p_payment_request_id: paymentRequestId,
    p_decision: decision,
    p_reason: reason
  });
  throwIfError(error);
}

export async function getAdminWhatsAppOverview(
  search = '',
  registrationStatus = '',
  limit = 100
): Promise<AdminWhatsAppOverview> {
  const { data, error } = await supabase.rpc('platform_admin_get_whatsapp_overview', {
    p_limit: limit,
    p_search: search || null,
    p_registration_status: registrationStatus || null
  });
  throwIfError(error);
  return data as AdminWhatsAppOverview;
}

export async function getAdminWhatsAppContactDetails(contactId: string): Promise<AdminWhatsAppContactDetails> {
  const { data, error } = await supabase.rpc('platform_admin_get_whatsapp_contact_details', {
    p_contact_id: contactId
  });
  throwIfError(error);
  return data as AdminWhatsAppContactDetails;
}

export async function setAdminWhatsAppContactStatus(
  contactId: string,
  payload: {
    transactionalStatus?: 'active' | 'blocked';
    marketingStatus?: 'unknown' | 'opted_in' | 'opted_out';
    reason: string;
    consentSource?: string;
  }
): Promise<void> {
  const { error } = await supabase.rpc('platform_admin_set_whatsapp_contact_status', {
    p_contact_id: contactId,
    p_transactional_status: payload.transactionalStatus || null,
    p_marketing_status: payload.marketingStatus || null,
    p_reason: payload.reason,
    p_consent_source: payload.consentSource || null
  });
  throwIfError(error);
}

export async function createAdminWhatsAppCampaign(payload: {
  name: string;
  purpose: AdminWhatsAppCampaign['purpose'];
  templateName: string;
  templateLanguage: string;
  templateParameters: string[];
  registrationStatus?: string;
}): Promise<string> {
  const { data, error } = await supabase.rpc('platform_admin_create_whatsapp_campaign', {
    p_name: payload.name,
    p_purpose: payload.purpose,
    p_template_name: payload.templateName,
    p_template_language: payload.templateLanguage,
    p_template_parameters: payload.templateParameters,
    p_audience_filter: payload.registrationStatus ? { registration_status: payload.registrationStatus } : {}
  });
  throwIfError(error);
  return data as string;
}

export async function queueAdminWhatsAppCampaign(campaignId: string, reason: string): Promise<number> {
  const { data, error } = await supabase.rpc('platform_admin_queue_whatsapp_campaign', {
    p_campaign_id: campaignId,
    p_reason: reason
  });
  throwIfError(error);
  const result = data as { recipient_count?: number };

  await runAdminWhatsAppCampaign(campaignId);
  return Number(result.recipient_count || 0);
}

export async function runAdminWhatsAppCampaign(campaignId: string): Promise<void> {
  const { error } = await supabase.functions.invoke('sanad-v3-whatsapp-campaign-worker', {
    body: { campaign_id: campaignId }
  });
  throwIfError(error);
}

export async function cancelAdminWhatsAppCampaign(campaignId: string, reason: string): Promise<void> {
  const { error } = await supabase.rpc('platform_admin_cancel_whatsapp_campaign', {
    p_campaign_id: campaignId,
    p_reason: reason
  });
  throwIfError(error);
}

export async function getAdminAssistantOverview(limit = 60): Promise<AdminAssistantOverview> {
  const { data, error } = await supabase.rpc('platform_admin_get_assistant_overview', { p_limit: limit });
  throwIfError(error);
  return data as AdminAssistantOverview;
}

export async function getAdminAssistantThread(conversationId: string): Promise<AdminAssistantThread> {
  const { data, error } = await supabase.rpc('platform_admin_get_assistant_thread', {
    p_conversation_id: conversationId
  });
  throwIfError(error);
  return data as AdminAssistantThread;
}

export async function updateAdminAssistantSettings(
  payload: Pick<AdminAssistantSettings, 'enabled' | 'memory_enabled'>,
  reason: string
): Promise<void> {
  const { error } = await supabase.rpc('platform_admin_update_assistant_settings', {
    p_payload: payload,
    p_reason: reason
  });
  throwIfError(error);
}

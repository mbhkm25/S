import { supabase } from './supabase';

export type AdminCampaignChannel = 'in_app' | 'push' | 'whatsapp';
export type AdminAudienceMode = 'all_registered' | 'push_enabled' | 'business_owners' | 'pro_active' | 'registered_whatsapp' | 'whatsapp_only' | 'all_whatsapp_opted_in';

export interface AdminAudiencePreview {
  users: number;
  push_enabled: number;
  whatsapp_opted_in: number;
  business_owners: number;
  pro_active: number;
}

export interface AdminAudienceCampaign {
  id: string;
  name: string;
  title: string;
  body: string;
  category: string;
  severity: string;
  channels: AdminCampaignChannel[];
  audience_filter: Record<string, unknown>;
  action_type: string;
  status: 'draft' | 'scheduled' | 'dispatching' | 'queued' | 'completed' | 'failed' | 'cancelled';
  scheduled_at: string | null;
  dispatched_at: string | null;
  completed_at: string | null;
  total_users: number;
  total_whatsapp: number;
  notification_count: number;
  whatsapp_campaign_id: string | null;
  whatsapp_sent_count: number;
  whatsapp_delivered_count: number;
  whatsapp_read_count: number;
  whatsapp_failed_count: number;
  last_error: string | null;
  created_at: string;
}

export interface AdminAudienceCampaignOverview {
  generated_at: string;
  audience_modes: Array<{ id: AdminAudienceMode; label: string }>;
  campaigns: AdminAudienceCampaign[];
}

function assert(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

export async function getAudienceCampaigns(limit = 50): Promise<AdminAudienceCampaignOverview> {
  const { data, error } = await supabase.rpc('platform_admin_get_audience_campaigns', { p_limit: limit });
  assert(error);
  return data as AdminAudienceCampaignOverview;
}

export async function previewAudience(filter: Record<string, unknown>): Promise<AdminAudiencePreview> {
  const { data, error } = await supabase.rpc('platform_admin_preview_campaign_audience', { p_filter: filter });
  assert(error);
  return data as AdminAudiencePreview;
}

export async function createAudienceCampaign(payload: {
  name: string;
  title: string;
  body: string;
  category: string;
  severity: string;
  channels: AdminCampaignChannel[];
  audienceFilter: Record<string, unknown>;
  actionType: string;
  actionPayload?: Record<string, unknown>;
  whatsappTemplateName?: string;
  whatsappTemplateLanguage?: string;
  whatsappTemplateParameters?: string[];
  reason: string;
}): Promise<string> {
  const { data, error } = await supabase.rpc('platform_admin_create_audience_campaign', {
    p_payload: {
      name: payload.name,
      title: payload.title,
      body: payload.body,
      category: payload.category,
      severity: payload.severity,
      channels: payload.channels,
      audience_filter: payload.audienceFilter,
      action_type: payload.actionType,
      action_payload: payload.actionPayload || {},
      whatsapp_template_name: payload.whatsappTemplateName || null,
      whatsapp_template_language: payload.whatsappTemplateLanguage || 'ar',
      whatsapp_template_parameters: payload.whatsappTemplateParameters || []
    },
    p_reason: payload.reason
  });
  assert(error);
  return data as string;
}

export async function queueAudienceCampaign(campaignId: string, reason: string, scheduledAt?: string | null): Promise<{ status: string; whatsapp_campaign_id?: string | null }> {
  const { data, error } = await supabase.rpc('platform_admin_queue_audience_campaign', {
    p_campaign_id: campaignId,
    p_scheduled_at: scheduledAt || null,
    p_reason: reason
  });
  assert(error);
  return data as { status: string; whatsapp_campaign_id?: string | null };
}

export async function cancelAudienceCampaign(campaignId: string, reason: string): Promise<void> {
  const { error } = await supabase.rpc('platform_admin_cancel_audience_campaign', {
    p_campaign_id: campaignId,
    p_reason: reason
  });
  assert(error);
}

export async function runAudienceWhatsApp(campaignId: string): Promise<void> {
  const { error } = await supabase.functions.invoke('sanad-v3-whatsapp-campaign-worker', {
    body: { campaign_id: campaignId }
  });
  assert(error);
}

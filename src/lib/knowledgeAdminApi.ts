import { supabase } from './supabase';

export type KnowledgeSourceType =
  | 'document'
  | 'digital_content'
  | 'faq'
  | 'official_information'
  | 'service_procedure'
  | 'policy'
  | 'website_page'
  | 'campaign'
  | 'product_guide'
  | 'dynamic_data'
  | 'manual_entry';

export type KnowledgeSourceStatus =
  | 'draft'
  | 'in_review'
  | 'approved'
  | 'published'
  | 'superseded'
  | 'archived'
  | 'expired';

export interface KnowledgeOverviewCounts {
  total: number;
  published: number;
  draft: number;
  needs_review: number;
  expiring_soon: number;
  documents: number;
  digital_content: number;
}

export interface KnowledgeSourceListItem {
  id: string;
  source_code: string;
  source_type: KnowledgeSourceType;
  title: string;
  description: string | null;
  knowledge_scope: string;
  status: KnowledgeSourceStatus;
  visibility: 'assistant_public' | 'assistant_authenticated' | 'internal_only';
  authority_level: number;
  language: string;
  version_number: number;
  effective_from: string | null;
  expires_at: string | null;
  approved_at: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  units_count: number;
  references_count: number;
  digital_platform: string | null;
  content_type: string | null;
  primary_cta_type: string | null;
  primary_cta_url: string | null;
}

export interface KnowledgeOverview {
  counts: KnowledgeOverviewCounts;
  items: KnowledgeSourceListItem[];
}

export interface KnowledgeUnitInput {
  unit_type?: string;
  heading?: string;
  content: string;
  summary?: string;
  keywords?: string[];
  intent_tags?: string[];
  audience_tags?: string[];
  channel_tags?: string[];
  metadata?: Record<string, unknown>;
}

export interface KnowledgeReferenceInput {
  platform: string;
  reference_type?: string;
  external_url?: string;
  external_id?: string;
  label?: string;
  is_primary?: boolean;
  published_at?: string;
  metadata?: Record<string, unknown>;
}

export interface DigitalContentInput {
  platform: string;
  content_type: string;
  body_text?: string;
  assistant_context?: string;
  campaign_name?: string;
  campaign_objective?: string;
  primary_cta_type?: string;
  primary_cta_label?: string;
  primary_cta_url?: string;
  whatsapp_prefill_text?: string;
  media?: Array<Record<string, unknown>>;
}

export interface KnowledgeSourcePayload {
  id?: string;
  source_code?: string;
  source_type: KnowledgeSourceType;
  title: string;
  description?: string;
  knowledge_scope?: string;
  status?: KnowledgeSourceStatus;
  visibility?: 'assistant_public' | 'assistant_authenticated' | 'internal_only';
  authority_level?: number;
  language?: string;
  effective_from?: string;
  expires_at?: string;
  metadata?: Record<string, unknown>;
  units?: KnowledgeUnitInput[];
  references?: KnowledgeReferenceInput[];
  digital_content?: DigitalContentInput;
}

function normalizeOverview(value: unknown): KnowledgeOverview {
  const raw = (value || {}) as Partial<KnowledgeOverview>;
  return {
    counts: {
      total: Number(raw.counts?.total || 0),
      published: Number(raw.counts?.published || 0),
      draft: Number(raw.counts?.draft || 0),
      needs_review: Number(raw.counts?.needs_review || 0),
      expiring_soon: Number(raw.counts?.expiring_soon || 0),
      documents: Number(raw.counts?.documents || 0),
      digital_content: Number(raw.counts?.digital_content || 0)
    },
    items: Array.isArray(raw.items) ? raw.items : []
  };
}

export async function getKnowledgeOverview(params: {
  limit?: number;
  search?: string;
  sourceType?: KnowledgeSourceType | null;
  status?: KnowledgeSourceStatus | null;
} = {}): Promise<KnowledgeOverview> {
  const { data, error } = await supabase.rpc('platform_admin_get_knowledge_overview', {
    p_limit: params.limit ?? 100,
    p_search: params.search?.trim() || null,
    p_source_type: params.sourceType || null,
    p_status: params.status || null
  });

  if (error) throw error;
  return normalizeOverview(data);
}

export async function upsertKnowledgeSource(
  payload: KnowledgeSourcePayload,
  reason: string
): Promise<{ ok: boolean; source_id: string; source_code: string; status: KnowledgeSourceStatus }> {
  const { data, error } = await supabase.rpc('platform_admin_upsert_knowledge_source', {
    p_payload: payload,
    p_reason: reason.trim()
  });

  if (error) throw error;
  return data;
}

export async function setKnowledgeSourceStatus(
  sourceId: string,
  status: KnowledgeSourceStatus,
  reason: string
): Promise<{ ok: boolean; source: KnowledgeSourceListItem }> {
  const { data, error } = await supabase.rpc('platform_admin_set_knowledge_status', {
    p_source_id: sourceId,
    p_status: status,
    p_reason: reason.trim()
  });

  if (error) throw error;
  return data;
}

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

export interface KnowledgeSourceDetail {
  source: KnowledgeSourceListItem;
  units: Array<KnowledgeUnitInput & { id: string; chunk_index: number; status: string }>;
  references: Array<KnowledgeReferenceInput & { id: string; normalized_url?: string | null }>;
  digital_content: (DigitalContentInput & { id: string }) | null;
  versions: Array<{ id: string; version_number: number; change_summary: string | null; created_at: string }>;
}

export interface KnowledgeSearchResultItem {
  source_id: string;
  source_code: string;
  source_type: KnowledgeSourceType;
  title: string;
  knowledge_scope: string;
  authority_level: number;
  unit_id: string;
  heading: string | null;
  content: string;
  summary: string | null;
  score: number;
  primary_cta_url?: string | null;
  assistant_context?: string | null;
}

export interface KnowledgeFileItem {
  id: string;
  source_id: string;
  source_code: string;
  title: string;
  source_status: KnowledgeSourceStatus;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  processing_status: 'uploaded' | 'processing' | 'ready_for_review' | 'failed' | 'approved' | 'published';
  extraction_summary: string | null;
  processing_error: string | null;
  processed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface KnowledgeFileUploadResult {
  source_id: string;
  source_code: string;
  file_id: string;
  processing_status: string;
  extraction_started: boolean;
  extraction_error?: string;
}

const MAX_KNOWLEDGE_FILE_BYTES = 25 * 1024 * 1024;
const ALLOWED_FILE_EXTENSIONS = new Set([
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
  'md', 'markdown', 'txt', 'csv', 'html', 'htm', 'json',
  'png', 'jpg', 'jpeg', 'webp'
]);

const MIME_BY_EXTENSION: Record<string, string> = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  md: 'text/markdown',
  markdown: 'text/markdown',
  txt: 'text/plain',
  csv: 'text/csv',
  html: 'text/html',
  htm: 'text/html',
  json: 'application/json',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp'
};

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

export async function getKnowledgeSource(sourceId: string): Promise<KnowledgeSourceDetail> {
  const { data, error } = await supabase.rpc('platform_admin_get_knowledge_source', { p_source_id: sourceId });
  if (error) throw error;
  return data as KnowledgeSourceDetail;
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

export async function createSimpleDigitalContent(input: {
  platform: string;
  postUrl: string;
  postText: string;
  title?: string;
}): Promise<{ ok: boolean; source_id: string; source_code: string; status: KnowledgeSourceStatus }> {
  const text = input.postText.trim();
  const title = input.title?.trim() || text.split(/\n+/)[0].slice(0, 100) || 'محتوى رقمي لسند';
  return upsertKnowledgeSource({
    source_type: 'digital_content',
    title,
    description: `محتوى رسمي منشور على ${input.platform}.`,
    knowledge_scope: 'digital_marketing',
    status: 'draft',
    visibility: 'assistant_public',
    authority_level: 4,
    language: 'ar',
    units: [{
      unit_type: 'social_post',
      heading: title,
      content: text,
      summary: text.slice(0, 280),
      keywords: [],
      intent_tags: ['digital_content'],
      audience_tags: ['new_user', 'customer'],
      channel_tags: ['whatsapp', input.platform]
    }],
    references: input.postUrl.trim() ? [{
      platform: input.platform,
      reference_type: 'platform_post',
      external_url: input.postUrl.trim(),
      label: 'رابط المنشور',
      is_primary: true
    }] : [],
    digital_content: {
      platform: input.platform,
      content_type: 'post',
      body_text: text,
      assistant_context: 'هذا محتوى رسمي لسند. أجب عن أسئلة المستخدم بالاعتماد على نص المنشور، ولا تضف تفاصيل غير موجودة في مصادر أعلى سلطة.',
      primary_cta_type: 'learn_more',
      media: []
    }
  }, 'إضافة محتوى رقمي رسمي إلى إدارة المعرفة');
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

export async function testKnowledgeSearch(params: {
  query: string;
  intent?: string;
  scope?: string;
  audience?: string;
  channel?: string;
  referenceUrl?: string;
  sourceCode?: string;
  limit?: number;
}): Promise<{ items: KnowledgeSearchResultItem[]; query: string; generated_at: string }> {
  const { data, error } = await supabase.rpc('platform_admin_test_knowledge_search', {
    p_query: params.query.trim(),
    p_intent: params.intent?.trim() || null,
    p_scope: params.scope?.trim() || null,
    p_audience: params.audience?.trim() || null,
    p_channel: params.channel?.trim() || 'whatsapp',
    p_reference_url: params.referenceUrl?.trim() || null,
    p_source_code: params.sourceCode?.trim() || null,
    p_limit: params.limit ?? 6
  });
  if (error) throw error;
  return { ...(data || {}), items: Array.isArray(data?.items) ? data.items : [] };
}

export async function getKnowledgeFiles(limit = 100): Promise<KnowledgeFileItem[]> {
  const { data, error } = await supabase.rpc('platform_admin_get_knowledge_files', { p_limit: limit });
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

function fileExtension(name: string): string {
  const match = name.trim().toLowerCase().match(/\.([a-z0-9]+)$/);
  return match?.[1] || '';
}

function safeFileName(name: string): string {
  const extension = fileExtension(name);
  const suffix = extension ? `.${extension}` : '';
  const base = name
    .replace(/\.[^.]+$/, '')
    .replace(/[^\p{L}\p{N}_-]+/gu, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80) || 'knowledge-file';
  return `${base}${suffix}`;
}

function resolveFileMimeType(file: File): string {
  const extension = fileExtension(file.name);
  return MIME_BY_EXTENSION[extension] || file.type || 'application/octet-stream';
}

function readableUploadError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error || '');
  const normalized = message.toLowerCase();
  if (normalized.includes('row-level security') || normalized.includes('unauthorized')) {
    return 'لا توجد صلاحية لرفع الملف. أعد تسجيل الدخول بحساب مدير منصة سند.';
  }
  if (normalized.includes('payload too large') || normalized.includes('maximum allowed size')) {
    return 'حجم الملف أكبر من الحد المسموح وهو 25 ميجابايت.';
  }
  if (normalized.includes('mime') || normalized.includes('content type')) {
    return 'تعذر التعرف على نوع الملف. غيّر اسم الملف بحيث ينتهي بامتداد واضح مثل PDF أو DOCX أو TXT.';
  }
  if (normalized.includes('unsupported_file_extension')) {
    return 'امتداد الملف غير مدعوم في إدارة المعرفة.';
  }
  return message || 'تعذر رفع ملف المعرفة.';
}

export async function retryKnowledgeFileProcessing(fileId: string): Promise<boolean> {
  const { error } = await supabase.functions.invoke('sanad-v3-knowledge-ingest', {
    body: { file_id: fileId }
  });
  if (error) throw new Error(readableUploadError(error));
  return true;
}

export async function uploadKnowledgeFile(file: File, title?: string): Promise<KnowledgeFileUploadResult> {
  const extension = fileExtension(file.name);
  if (!extension || !ALLOWED_FILE_EXTENSIONS.has(extension)) {
    throw new Error('امتداد الملف غير مدعوم. استخدم PDF أو Word أو Excel أو PowerPoint أو Markdown أو TXT أو CSV أو JSON أو صورة.');
  }
  if (file.size <= 0) throw new Error('الملف فارغ ولا يمكن إضافته إلى إدارة المعرفة.');
  if (file.size > MAX_KNOWLEDGE_FILE_BYTES) throw new Error('يجب ألا يتجاوز حجم الملف 25 ميجابايت.');

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw new Error('يجب تسجيل الدخول لرفع ملفات المعرفة.');

  const mimeType = resolveFileMimeType(file);
  const objectPath = `${userData.user.id}/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}-${safeFileName(file.name)}`;
  const { error: uploadError } = await supabase.storage
    .from('sanad-knowledge-files')
    .upload(objectPath, file, { contentType: mimeType, cacheControl: '3600', upsert: false });
  if (uploadError) throw new Error(readableUploadError(uploadError));

  let registered = false;
  try {
    const derivedTitle = title?.trim() || file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim() || 'وثيقة معرفة';
    const { data, error } = await supabase.rpc('platform_admin_register_knowledge_file', {
      p_title: derivedTitle,
      p_original_name: file.name,
      p_mime_type: mimeType,
      p_size_bytes: file.size,
      p_object_path: objectPath,
      p_reason: 'رفع ملف جديد إلى إدارة المعرفة'
    });
    if (error) throw error;
    registered = true;

    const invoke = await supabase.functions.invoke('sanad-v3-knowledge-ingest', {
      body: { file_id: data.file_id }
    });

    return {
      ...data,
      extraction_started: !invoke.error,
      extraction_error: invoke.error ? readableUploadError(invoke.error) : undefined
    };
  } catch (error) {
    if (!registered) {
      await supabase.storage.from('sanad-knowledge-files').remove([objectPath]).catch(() => null);
    }
    throw new Error(readableUploadError(error));
  }
}

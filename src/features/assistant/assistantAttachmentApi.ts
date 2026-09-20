import { supabase } from '../../lib/supabase';
import { recordSanadAgentClientMetric } from './assistantObservabilityApi';

export type SanadAgentAttachmentStatus = 'uploaded' | 'analyzing' | 'ready' | 'failed' | 'deleted';

export type SanadAgentAttachmentAnalysis = {
  schema_version?: number;
  document_type?: string;
  operation_type?: string;
  direction?: string;
  summary?: string;
  document_number?: string | null;
  document_date?: string | null;
  amount?: number | null;
  currency?: string | null;
  counterparty_name?: string | null;
  account_reference?: string | null;
  transfer_reference?: string | null;
  extracted_text_excerpt?: string | null;
  line_items?: Array<{
    description?: string | null;
    quantity?: number | null;
    unit_price?: number | null;
    total?: number | null;
  }>;
  confidence?: number;
  requires_review?: boolean;
  warnings?: string[];
};

export type SanadAgentAttachmentSuggestion = {
  kind: 'link_existing' | 'draft_candidate' | 'review_required' | string;
  title?: string;
  confidence?: number;
  requires_explicit_review?: boolean;
  write_performed?: boolean;
  target?: {
    type?: string;
    business_id?: string;
    document_kind?: 'sale' | 'purchase';
    document_id?: number | null;
    document_number?: string | null;
    party_name?: string | null;
    account_id?: number | null;
    account_number?: string | null;
    customer_name?: string | null;
    href?: string | null;
  };
  draft?: Record<string, unknown>;
};

export type SanadAgentAttachment = {
  id: string;
  user_id?: string;
  thread_id: string;
  business_id?: string | null;
  storage_bucket: string;
  storage_path: string;
  file_name: string;
  mime_type: string;
  file_size: number;
  status: SanadAgentAttachmentStatus;
  analysis?: SanadAgentAttachmentAnalysis | null;
  matches?: {
    customers?: Array<Record<string, unknown>>;
    documents?: Array<Record<string, unknown>>;
  } | null;
  suggestion?: SanadAgentAttachmentSuggestion | null;
  model?: string | null;
  error_code?: string | null;
  analyzed_at?: string | null;
  created_at?: string;
};

const BUCKET = 'sanad-agent-attachments';
const MAX_FILE_BYTES = 20 * 1024 * 1024;

export const SANAD_ATTACHMENT_ACCEPT = [
  'application/pdf',
  'application/json',
  'text/plain',
  'text/csv',
  'text/rtf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/bmp',
].join(',');

const ALLOWED_MIME = new Set(SANAD_ATTACHMENT_ACCEPT.split(','));

function cleanFileName(name: string) {
  const normalized = name.normalize('NFKC').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-').trim();
  return (normalized || 'attachment').slice(0, 180);
}

function extensionFromMime(mime: string) {
  const extensions: Record<string, string> = {
    'application/pdf': 'pdf',
    'application/json': 'json',
    'text/plain': 'txt',
    'text/csv': 'csv',
    'text/rtf': 'rtf',
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/bmp': 'bmp',
  };
  return extensions[mime] || 'bin';
}

async function currentUserId() {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error('يجب تسجيل الدخول لرفع مرفق.');
  return data.user.id;
}

export function validateSanadAttachmentFile(file: File) {
  if (!ALLOWED_MIME.has(file.type)) {
    throw new Error('نوع الملف غير مدعوم. استخدم صورة أو PDF أو TXT/CSV/JSON/RTF.');
  }
  if (!file.size) throw new Error('الملف فارغ.');
  if (file.size > MAX_FILE_BYTES) throw new Error('حجم الملف أكبر من 20 ميجابايت.');
}

export async function getSanadAgentAttachment(attachmentId: string): Promise<SanadAgentAttachment> {
  const { data, error } = await supabase.rpc('get_my_sanad_agent_attachment_v1', {
    p_attachment_id: attachmentId,
  });
  if (error) throw new Error(error.message || 'تعذر تحميل المرفق.');
  return data as SanadAgentAttachment;
}

export async function listSanadAgentAttachments(threadId: string): Promise<SanadAgentAttachment[]> {
  const { data, error } = await supabase.rpc('list_my_sanad_agent_attachments_v1', {
    p_thread_id: threadId,
  });
  if (error) throw new Error(error.message || 'تعذر تحميل مرفقات المحادثة.');
  return Array.isArray(data) ? data as SanadAgentAttachment[] : [];
}

export async function analyzeSanadAgentAttachment(attachmentId: string): Promise<SanadAgentAttachment> {
  const { data, error } = await supabase.functions.invoke('sanad-ai-attachment-analyze-v1', {
    body: { attachment_id: attachmentId },
  });
  if (error) throw new Error(error.message || 'تعذر تحليل المرفق.');
  if (!data?.ok) throw new Error(data?.error || 'تعذر تحليل المرفق.');
  return getSanadAgentAttachment(attachmentId);
}

export async function uploadSanadAgentAttachment(
  file: File,
  threadId: string,
  businessId: string | null,
): Promise<SanadAgentAttachment> {
  const uploadStartedAt = performance.now();
  validateSanadAttachmentFile(file);
  const userId = await currentUserId();
  const safeName = cleanFileName(file.name);
  const storageName = `${crypto.randomUUID?.() || Date.now()}-${safeName || `file.${extensionFromMime(file.type)}`}`;
  const storagePath = `${userId}/${threadId}/${storageName}`;

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, file, {
      contentType: file.type,
      cacheControl: '0',
      upsert: false,
    });

  if (uploadError) {
    void recordSanadAgentClientMetric({
      scope: 'attachment_upload',
      threadId,
      status: 'failed',
      transport: 'storage',
      totalLatencyMs: performance.now() - uploadStartedAt,
      itemCount: 1,
      byteCount: file.size,
    });
    throw new Error(uploadError.message || 'تعذر رفع المرفق.');
  }

  let attachmentId = '';
  try {
    const { data, error } = await supabase.rpc('create_my_sanad_agent_attachment_v1', {
      p_thread_id: threadId,
      p_business_id: businessId || null,
      p_storage_path: storagePath,
      p_file_name: safeName,
      p_mime_type: file.type,
      p_file_size: file.size,
    });
    if (error || typeof data !== 'string') throw new Error(error?.message || 'تعذر تسجيل المرفق.');
    attachmentId = data;
  } catch (cause) {
    await supabase.storage.from(BUCKET).remove([storagePath]).catch(() => null);
    throw cause;
  }

  try {
    const analyzed = await analyzeSanadAgentAttachment(attachmentId);
    void recordSanadAgentClientMetric({
      scope: 'attachment_upload',
      threadId,
      status: analyzed.status === 'failed' ? 'failed' : 'completed',
      transport: 'storage',
      totalLatencyMs: performance.now() - uploadStartedAt,
      itemCount: 1,
      byteCount: file.size,
    });
    return analyzed;
  } catch (cause) {
    void recordSanadAgentClientMetric({
      scope: 'attachment_upload',
      threadId,
      status: 'failed',
      transport: 'storage',
      totalLatencyMs: performance.now() - uploadStartedAt,
      itemCount: 1,
      byteCount: file.size,
    });
    // Keep the failed attachment so the user can see the failure and retry analysis.
    const failed = await getSanadAgentAttachment(attachmentId).catch(() => null);
    if (failed) return failed;
    throw cause;
  }
}

export async function deleteSanadAgentAttachment(attachment: SanadAgentAttachment): Promise<void> {
  const { error: storageError } = await supabase.storage
    .from(attachment.storage_bucket || BUCKET)
    .remove([attachment.storage_path]);
  if (storageError) throw new Error(storageError.message || 'تعذر حذف ملف المرفق.');

  const { error } = await supabase.rpc('delete_my_sanad_agent_attachment_v1', {
    p_attachment_id: attachment.id,
  });
  if (error) throw new Error(error.message || 'تعذر حذف سجل المرفق.');
}

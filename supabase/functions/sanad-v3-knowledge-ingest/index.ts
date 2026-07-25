// SANAD knowledge-file ingestion worker.
// Downloads an approved admin upload, extracts text, and creates reviewable SKMS units.

type JsonRecord = Record<string, unknown>;

const SUPABASE_URL = mustEnv('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = mustEnv('SUPABASE_SERVICE_ROLE_KEY');
const SANAD_INTERNAL_API_KEY = mustEnv('SANAD_INTERNAL_API_KEY');
const GEMINI_API_KEY = mustEnv('GEMINI_API_KEY');
const GEMINI_MODEL = Deno.env.get('SANAD_KNOWLEDGE_INGEST_MODEL') || 'gemini-2.5-flash';
const BUCKET = 'sanad-knowledge-files';
const MAX_FILE_BYTES = 25 * 1024 * 1024;
const MAX_AI_BYTES = 18 * 1024 * 1024;

function mustEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function trimText(value: unknown, max = 12000): string {
  const text = String(value ?? '').trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function serviceHeaders(extra: HeadersInit = {}): HeadersInit {
  return {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    ...extra
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' }
  });
}

async function restJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: serviceHeaders({ 'Content-Type': 'application/json', ...(init.headers || {}) })
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`rest_${response.status}:${trimText(text, 1200)}`);
  return (text ? JSON.parse(text) : null) as T;
}

async function rpc<T>(name: string, body: JsonRecord): Promise<T> {
  return restJson<T>(`rpc/${name}`, { method: 'POST', body: JSON.stringify(body) });
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const size = 32768;
  for (let offset = 0; offset < bytes.length; offset += size) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + size));
  }
  return btoa(binary);
}

function decodeText(bytes: Uint8Array): string {
  return new TextDecoder('utf-8', { fatal: false }).decode(bytes).replace(/^\uFEFF/, '').trim();
}

function stripHtml(value: string): string {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function directTextExtraction(mimeType: string, bytes: Uint8Array): { text: string; summary: string } | null {
  const direct = new Set(['text/plain', 'text/markdown', 'text/csv', 'application/json', 'text/html']);
  if (!direct.has(mimeType)) return null;
  const decoded = decodeText(bytes);
  if (!decoded) return { text: '', summary: 'الملف النصي لا يحتوي نصًا قابلًا للاستخراج.' };
  if (mimeType === 'application/json') {
    try {
      const pretty = JSON.stringify(JSON.parse(decoded), null, 2);
      return { text: pretty, summary: 'بيانات JSON مستخرجة من الملف المرفوع.' };
    } catch {
      return { text: decoded, summary: 'نص JSON غير منسق مستخرج من الملف المرفوع.' };
    }
  }
  if (mimeType === 'text/html') return { text: stripHtml(decoded), summary: 'نص مستخرج من صفحة HTML مرفوعة.' };
  if (mimeType === 'text/csv') return { text: decoded, summary: 'بيانات جدول CSV مستخرجة من الملف المرفوع.' };
  if (mimeType === 'text/markdown') return { text: decoded, summary: 'مستند Markdown مستخرج من الملف المرفوع.' };
  return { text: decoded, summary: 'مستند نصي مستخرج من الملف المرفوع.' };
}

async function geminiExtract(params: { bytes: Uint8Array; mimeType: string; fileName: string }): Promise<{ text: string; summary: string; metadata: JsonRecord }> {
  if (params.bytes.length > MAX_AI_BYTES) throw new Error('file_too_large_for_ai_extraction');
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          role: 'user',
          parts: [
            {
              text: `استخرج المعرفة النصية من الملف المرفق بدقة. اسم الملف: ${params.fileName}.
أعد النص كما هو قدر الإمكان مع الحفاظ على العناوين والقوائم والجداول بصيغة نصية مفهومة.
لا تضف معلومات غير موجودة في الملف. أنشئ ملخصًا عربيًا موجزًا يصف موضوع الملف فقط.`
            },
            { inline_data: { mime_type: params.mimeType, data: bytesToBase64(params.bytes) } }
          ]
        }],
        generationConfig: {
          temperature: 0,
          responseMimeType: 'application/json',
          responseSchema: {
            type: 'OBJECT',
            required: ['extracted_text', 'summary'],
            properties: {
              extracted_text: { type: 'STRING' },
              summary: { type: 'STRING' }
            }
          }
        }
      })
    }
  );
  const raw = await response.text();
  if (!response.ok) throw new Error(`gemini_${response.status}:${trimText(raw, 1600)}`);
  const payload = JSON.parse(raw);
  const content = payload?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!content) throw new Error('gemini_empty_extraction');
  const parsed = JSON.parse(content);
  return {
    text: trimText(parsed.extracted_text, 1000000),
    summary: trimText(parsed.summary, 1200),
    metadata: {
      model: GEMINI_MODEL,
      prompt_tokens: Number(payload?.usageMetadata?.promptTokenCount || 0),
      output_tokens: Number(payload?.usageMetadata?.candidatesTokenCount || 0),
      extraction_method: 'gemini_inline_file'
    }
  };
}

async function processFile(fileId: string): Promise<JsonRecord> {
  const rows = await restJson<any[]>(
    `sanad_knowledge_files?id=eq.${encodeURIComponent(fileId)}&select=id,source_id,object_path,original_name,mime_type,size_bytes,processing_status&limit=1`
  );
  const file = rows?.[0];
  if (!file?.id) throw new Error('knowledge_file_not_found');
  if (Number(file.size_bytes || 0) <= 0 || Number(file.size_bytes) > MAX_FILE_BYTES) throw new Error('invalid_file_size');
  if (['processing', 'ready_for_review', 'approved', 'published'].includes(String(file.processing_status))) {
    return { processed: false, reason: `already_${file.processing_status}`, file_id: file.id };
  }

  await restJson(`sanad_knowledge_files?id=eq.${encodeURIComponent(file.id)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ processing_status: 'processing', processing_error: null })
  });

  try {
    const path = String(file.object_path || '');
    if (!path || path.includes('..') || path.startsWith('/')) throw new Error('invalid_object_path');
    const encodedPath = encodeURIComponent(path).replace(/%2F/g, '/');
    const download = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${encodedPath}`, { headers: serviceHeaders() });
    if (!download.ok) throw new Error(`storage_download_${download.status}`);
    const bytes = new Uint8Array(await download.arrayBuffer());
    if (!bytes.length || bytes.length > MAX_FILE_BYTES) throw new Error('downloaded_file_size_invalid');

    const mimeType = String(file.mime_type || download.headers.get('content-type') || 'application/octet-stream').split(';')[0].toLowerCase();
    const direct = directTextExtraction(mimeType, bytes);
    const extracted = direct
      ? { ...direct, metadata: { extraction_method: 'direct_utf8' } }
      : await geminiExtract({ bytes, mimeType, fileName: String(file.original_name || 'knowledge-file') });

    const result = await rpc<any>('complete_sanad_knowledge_file_processing', {
      p_file_id: file.id,
      p_extracted_text: extracted.text,
      p_summary: extracted.summary,
      p_metadata: { ...extracted.metadata, mime_type: mimeType, original_name: file.original_name, size_bytes: bytes.length },
      p_error: null
    });
    return { processed: true, file_id: file.id, ...result };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await rpc('complete_sanad_knowledge_file_processing', {
      p_file_id: file.id,
      p_extracted_text: '',
      p_summary: '',
      p_metadata: {},
      p_error: trimText(message, 1800)
    }).catch(() => null);
    throw error;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return jsonResponse({ ok: false, error: 'method_not_allowed' }, 405);
  if (req.headers.get('x-sanad-internal-key') !== SANAD_INTERNAL_API_KEY) {
    return jsonResponse({ ok: false, error: 'unauthorized' }, 401);
  }
  let body: any;
  try { body = await req.json(); } catch { return jsonResponse({ ok: false, error: 'invalid_json' }, 400); }
  const fileId = String(body?.file_id || '');
  if (!/^[0-9a-f-]{36}$/i.test(fileId)) return jsonResponse({ ok: false, error: 'invalid_file_id' }, 400);
  try {
    const result = await processFile(fileId);
    return jsonResponse({ ok: true, ...result });
  } catch (error) {
    console.error(JSON.stringify({ function: 'sanad-v3-knowledge-ingest', file_id: fileId, error: trimText(error, 1800) }));
    return jsonResponse({ ok: false, error: 'knowledge_ingestion_failed' }, 500);
  }
});

// SANAD official website knowledge sync worker.
// Reads sanadflow.com sitemap/pages, extracts readable text, and stores reviewable SKMS sources.

type JsonRecord = Record<string, unknown>;

const SUPABASE_URL = mustEnv('SUPABASE_URL');
const SERVICE_KEY = mustEnv('SUPABASE_SERVICE_ROLE_KEY');
const INTERNAL_KEY = mustEnv('SANAD_INTERNAL_API_KEY');
const ROOT_URL = 'https://sanadflow.com';
const DEFAULT_SITEMAP = `${ROOT_URL}/sitemap.xml`;
const MAX_PAGE_BYTES = 2 * 1024 * 1024;
const USER_AGENT = 'SANAD-Knowledge-Sync/1.0 (+https://sanadflow.com)';

function mustEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function trimText(value: unknown, max = 12000): string {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' }
  });
}

function serviceHeaders(extra: HeadersInit = {}): HeadersInit {
  return { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, ...extra };
}

async function restJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: serviceHeaders({ 'Content-Type': 'application/json', ...(init.headers || {}) })
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`rest_${response.status}:${trimText(text, 1000)}`);
  return (text ? JSON.parse(text) : null) as T;
}

async function rpc<T>(name: string, body: JsonRecord): Promise<T> {
  return restJson<T>(`rpc/${name}`, { method: 'POST', body: JSON.stringify(body) });
}

async function authorize(req: Request): Promise<boolean> {
  if (req.headers.get('x-sanad-internal-key') === INTERNAL_KEY) return true;
  const authorization = req.headers.get('authorization') || '';
  const token = authorization.replace(/^Bearer\s+/i, '').trim();
  if (!token) return false;
  const userResponse = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${token}` }
  });
  if (!userResponse.ok) return false;
  const user = await userResponse.json();
  const userId = String(user?.id || '');
  if (!/^[0-9a-f-]{36}$/i.test(userId)) return false;
  const profiles = await restJson<Array<{ global_role?: string; status?: string }>>(
    `profiles?id=eq.${encodeURIComponent(userId)}&select=global_role,status&limit=1`
  );
  return profiles?.[0]?.global_role === 'platform_admin' && profiles?.[0]?.status !== 'disabled';
}

function normalizeUrl(raw: string): string | null {
  try {
    const url = new URL(raw, ROOT_URL);
    if (!['sanadflow.com', 'www.sanadflow.com'].includes(url.hostname.toLowerCase())) return null;
    if (url.protocol !== 'https:') return null;
    url.hash = '';
    url.search = '';
    const path = url.pathname.replace(/\/{2,}/g, '/');
    url.pathname = path === '/' ? '/' : path.replace(/\/$/, '');
    return url.toString();
  } catch {
    return null;
  }
}

function decodeEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

function extractTag(html: string, tag: string): string {
  const match = html.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return decodeEntities(String(match?.[1] || '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function extractMeta(html: string, name: string): string {
  const patterns = [
    new RegExp(`<meta[^>]+name=["']${name}["'][^>]+content=["']([^"']*)["'][^>]*>`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+name=["']${name}["'][^>]*>`, 'i')
  ];
  for (const pattern of patterns) {
    const value = html.match(pattern)?.[1];
    if (value) return decodeEntities(value).trim();
  }
  return '';
}

function readableText(html: string): string {
  return decodeEntities(html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<footer[\s\S]*?<\/footer>/gi, ' ')
    .replace(/<[^>]+>/g, '\n'))
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line.length >= 3)
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function chunkText(text: string, title: string): JsonRecord[] {
  const paragraphs = text.split(/\n{2,}/).map((item) => item.trim()).filter(Boolean);
  const chunks: string[] = [];
  let current = '';
  for (const paragraph of paragraphs) {
    if (current && current.length + paragraph.length + 2 > 3200) {
      chunks.push(current);
      current = '';
    }
    current = current ? `${current}\n\n${paragraph}` : paragraph;
  }
  if (current) chunks.push(current);
  return chunks.slice(0, 20).map((content, index) => ({
    unit_type: 'website_section',
    heading: index === 0 ? title : `${title} — ${index + 1}`,
    content,
    summary: trimText(content, 420),
    keywords: ['سند', 'sanadflow'],
    intent_tags: ['knowledge_inquiry', 'document_reference'],
    audience_tags: ['new_user', 'customer', 'cashier', 'business_owner', 'team_member'],
    channel_tags: ['whatsapp', 'website'],
    metadata: { source: 'sanadflow.com', chunk_index: index }
  }));
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function fetchText(url: string): Promise<{ text: string; status: number; lastModified: string | null }> {
  const response = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/xml,text/xml;q=0.9,*/*;q=0.8' },
    redirect: 'follow'
  });
  const length = Number(response.headers.get('content-length') || 0);
  if (length > MAX_PAGE_BYTES) throw new Error('page_too_large');
  const text = await response.text();
  if (text.length > MAX_PAGE_BYTES) throw new Error('page_too_large');
  if (!response.ok) throw new Error(`http_${response.status}`);
  return { text, status: response.status, lastModified: response.headers.get('last-modified') };
}

function sitemapUrls(xml: string): string[] {
  return Array.from(xml.matchAll(/<loc>([\s\S]*?)<\/loc>/gi))
    .map((match) => normalizeUrl(decodeEntities(match[1].trim())))
    .filter((value): value is string => Boolean(value));
}

async function createRun(sitemapUrl: string): Promise<string> {
  const rows = await restJson<Array<{ id: string }>>('sanad_website_sync_runs', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ root_url: ROOT_URL, sitemap_url: sitemapUrl, status: 'running', metadata: { worker: 'sanad-v3-website-knowledge-sync' } })
  });
  return rows[0].id;
}

async function updateRun(runId: string, payload: JsonRecord): Promise<void> {
  await restJson(`sanad_website_sync_runs?id=eq.${encodeURIComponent(runId)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify(payload)
  });
}

async function processPage(url: string, publish: boolean): Promise<{ changed: boolean; sourceId: string }> {
  const page = await fetchText(url);
  const title = extractTag(page.text, 'title') || 'صفحة من موقع سند';
  const description = extractMeta(page.text, 'description');
  const text = readableText(page.text);
  if (text.length < 80) throw new Error('insufficient_page_content');
  const units = chunkText(text, title);
  if (!units.length) throw new Error('no_knowledge_units');
  const contentHash = await sha256(`${title}\n${description}\n${text}`);
  const result = await rpc<any>('sync_sanad_website_knowledge_page', {
    p_canonical_url: url,
    p_title: title,
    p_description: description,
    p_units: units,
    p_content_hash: contentHash,
    p_last_modified_at: page.lastModified ? new Date(page.lastModified).toISOString() : null,
    p_publish: publish,
    p_metadata: { http_status: page.status, fetched_at: new Date().toISOString(), extraction: 'html-readable-text-v1' }
  });
  return { changed: result?.changed === true, sourceId: String(result?.source_id || '') };
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return jsonResponse({ ok: false, error: 'method_not_allowed' }, 405);
  if (!(await authorize(req))) return jsonResponse({ ok: false, error: 'unauthorized' }, 401);

  let body: any = {};
  try { body = await req.json(); } catch { /* defaults */ }
  const sitemapUrl = normalizeUrl(String(body?.sitemap_url || DEFAULT_SITEMAP)) || DEFAULT_SITEMAP;
  const publish = body?.publish === true;
  const maxPages = Math.min(50, Math.max(1, Number(body?.max_pages || 20)));
  const requestedUrls = Array.isArray(body?.urls)
    ? body.urls.map((value: unknown) => normalizeUrl(String(value))).filter(Boolean)
    : [];

  let runId = '';
  try {
    runId = await createRun(sitemapUrl);
    let urls: string[] = requestedUrls as string[];
    if (!urls.length) {
      try {
        const sitemap = await fetchText(sitemapUrl);
        urls = sitemapUrls(sitemap.text);
      } catch {
        urls = [ROOT_URL, `${ROOT_URL}/`, `${ROOT_URL}/install`, `${ROOT_URL}/about`]
          .map((url) => normalizeUrl(url))
          .filter((value): value is string => Boolean(value));
      }
    }
    urls = Array.from(new Set(urls)).slice(0, maxPages);
    await updateRun(runId, { discovered_count: urls.length });

    let processed = 0;
    let changed = 0;
    let failed = 0;
    const errors: Array<{ url: string; error: string }> = [];
    for (const url of urls) {
      try {
        const result = await processPage(url, publish);
        processed += 1;
        if (result.changed) changed += 1;
      } catch (error) {
        failed += 1;
        errors.push({ url, error: trimText(error instanceof Error ? error.message : String(error), 500) });
      }
    }

    const status = failed === 0 ? 'completed' : processed > 0 ? 'partial' : 'failed';
    await updateRun(runId, {
      status,
      processed_count: processed,
      changed_count: changed,
      failed_count: failed,
      completed_at: new Date().toISOString(),
      error_summary: errors.length ? JSON.stringify(errors).slice(0, 4000) : null
    });
    return jsonResponse({ ok: status !== 'failed', run_id: runId, status, discovered: urls.length, processed, changed, failed, publish, errors });
  } catch (error) {
    const message = trimText(error instanceof Error ? error.message : String(error), 1200);
    if (runId) await updateRun(runId, { status: 'failed', failed_count: 1, completed_at: new Date().toISOString(), error_summary: message }).catch(() => null);
    console.error(JSON.stringify({ function: 'sanad-v3-website-knowledge-sync', error: message }));
    return jsonResponse({ ok: false, error: 'website_sync_failed', detail: message }, 500);
  }
});

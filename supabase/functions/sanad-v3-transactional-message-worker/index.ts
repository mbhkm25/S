const SUPABASE_URL = mustGetEnv('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = mustGetEnv('SUPABASE_SERVICE_ROLE_KEY');
const META_WA_ACCESS_TOKEN = mustGetEnv('META_WA_ACCESS_TOKEN');
const META_WA_PHONE_NUMBER_ID = mustGetEnv('META_WA_PHONE_NUMBER_ID');
const META_GRAPH_VERSION = 'v20.0';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

type ClaimedMessage = {
  id: string;
  phone: string;
  template_name: string;
  template_language: string;
  template_parameters: unknown[];
};

function mustGetEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function response(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8' }
  });
}

function serviceHeaders(extra: HeadersInit = {}): HeadersInit {
  return {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    ...extra
  };
}

async function serviceJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const result = await fetch(`${SUPABASE_URL}${path}`, {
    ...init,
    headers: serviceHeaders(init.headers || {})
  });
  const text = await result.text();
  if (!result.ok) throw new Error(`supabase_${result.status}: ${text.slice(0, 700)}`);
  return (text ? JSON.parse(text) : null) as T;
}

async function requirePlatformAdmin(req: Request): Promise<void> {
  const authorization = req.headers.get('authorization') || '';
  if (!authorization.toLowerCase().startsWith('bearer ')) throw new Error('missing_authorization');
  const userResponse = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: authorization }
  });
  if (!userResponse.ok) throw new Error('invalid_user_session');
  const user = await userResponse.json();
  if (!user?.id) throw new Error('invalid_user_session');
  const profiles = await serviceJson<Array<{ global_role: string; status: string }>>(
    `/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}&select=global_role,status&limit=1`,
    { headers: { Accept: 'application/json' } }
  );
  if (profiles[0]?.global_role !== 'platform_admin' || profiles[0]?.status !== 'active') {
    throw new Error('platform_admin_required');
  }
}

async function rpc<T>(name: string, body: Record<string, unknown>): Promise<T> {
  return serviceJson<T>(`/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
}

async function sendTemplate(message: ClaimedMessage): Promise<string> {
  const parameters = Array.isArray(message.template_parameters)
    ? message.template_parameters.map((value) => ({ type: 'text', text: String(value) }))
    : [];
  const template: Record<string, unknown> = {
    name: message.template_name,
    language: { code: message.template_language }
  };
  if (parameters.length > 0) template.components = [{ type: 'body', parameters }];

  const metaResponse = await fetch(
    `https://graph.facebook.com/${META_GRAPH_VERSION}/${META_WA_PHONE_NUMBER_ID}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${META_WA_ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: message.phone,
        type: 'template',
        template
      })
    }
  );
  const text = await metaResponse.text();
  if (!metaResponse.ok) throw new Error(`meta_${metaResponse.status}: ${text.slice(0, 700)}`);
  const data = text ? JSON.parse(text) : {};
  const messageId = data?.messages?.[0]?.id;
  if (!messageId) throw new Error('meta_message_id_missing');
  return String(messageId);
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return response({ ok: true });
  if (req.method !== 'POST') return response({ error: 'method_not_allowed' }, 405);
  try {
    await requirePlatformAdmin(req);
    const body = await req.json().catch(() => ({}));
    const requestedLimit = Number(body?.limit || 50);
    const limit = Math.max(1, Math.min(Number.isFinite(requestedLimit) ? requestedLimit : 50, 100));
    let sent = 0;
    let failed = 0;
    let batches = 0;

    while (batches < 4 && sent + failed < limit) {
      const messages = await rpc<ClaimedMessage[]>('claim_transactional_message_batch', {
        p_limit: Math.min(25, limit - sent - failed)
      });
      if (!Array.isArray(messages) || messages.length === 0) break;
      batches += 1;
      for (const message of messages) {
        try {
          const messageId = await sendTemplate(message);
          await rpc('mark_transactional_message_result', {
            p_id: message.id,
            p_status: 'sent',
            p_message_id: messageId,
            p_error: null
          });
          sent += 1;
        } catch (error) {
          await rpc('mark_transactional_message_result', {
            p_id: message.id,
            p_status: 'failed',
            p_message_id: null,
            p_error: error instanceof Error ? error.message.slice(0, 900) : String(error).slice(0, 900)
          });
          failed += 1;
        }
      }
    }
    return response({ ok: true, sent, failed, batches });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = ['missing_authorization','invalid_user_session'].includes(message)
      ? 401 : message === 'platform_admin_required' ? 403 : 500;
    console.error(JSON.stringify({ function: 'sanad-v3-transactional-message-worker', error: message }));
    return response({ error: message }, status);
  }
});

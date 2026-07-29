import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SANAD_INTERNAL_API_KEY = Deno.env.get('SANAD_INTERNAL_API_KEY')!;

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

async function rpc<T>(name: string, body: Record<string, unknown> = {}): Promise<T> {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`rpc_${name}_${response.status}:${text.slice(0, 500)}`);
  return (text ? JSON.parse(text) : null) as T;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ ok: false, error: 'method_not_allowed' }, 405);

  try {
    const expectedToken = await rpc<string>('get_assistant_retry_dispatch_token');
    if (!expectedToken || req.headers.get('x-sanad-retry-token') !== expectedToken) {
      return json({ ok: false, error: 'unauthorized' }, 401);
    }

    const messageId = await rpc<string | null>('claim_due_sanad_assistant_message');
    if (!messageId) return json({ ok: true, processed: false, reason: 'no_due_messages' });

    const response = await fetch(`${SUPABASE_URL}/functions/v1/sanad-v3-whatsapp-assistant`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-sanad-internal-key': SANAD_INTERNAL_API_KEY,
      },
      body: JSON.stringify({
        message_id: messageId,
        source: 'sanad-v3-assistant-retry-worker',
      }),
    });

    const text = await response.text();
    if (!response.ok) {
      await rpc('fail_sanad_assistant_message', {
        p_message_id: messageId,
        p_error_code: `assistant_http_${response.status}`,
        p_error_message: text.slice(0, 1800),
        p_retryable: true,
      });
      return json({ ok: false, processed: false, message_id: messageId }, 502);
    }

    return json({
      ok: true,
      processed: true,
      message_id: messageId,
      assistant_response: text ? JSON.parse(text) : null,
    });
  } catch (error) {
    return json({ ok: false, error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
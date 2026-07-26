import "jsr:@supabase/functions-js/edge-runtime.d.ts";

type JsonRecord = Record<string, unknown>;

const SUPABASE_URL = mustGetEnv("SUPABASE_URL");
const SERVICE_KEY = mustGetEnv("SUPABASE_SERVICE_ROLE_KEY");
const ANON_KEY = mustGetEnv("SUPABASE_ANON_KEY");
const META_TOKEN = mustGetEnv("META_WA_ACCESS_TOKEN");
const META_PHONE_ID = mustGetEnv("META_WA_PHONE_NUMBER_ID");
const TEMPLATE_NAME = Deno.env.get("META_PHONE_VERIFICATION_TEMPLATE") || "sanad_phone_verification_ar";
const TEMPLATE_LANGUAGE = Deno.env.get("META_PHONE_VERIFICATION_LANGUAGE") || "ar";
const META_GRAPH_VERSION = Deno.env.get("META_GRAPH_VERSION") || "v20.0";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function mustGetEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function respond(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json; charset=utf-8" },
  });
}

function safeError(error: unknown): string {
  const value = error instanceof Error ? error.message : String(error ?? "unknown_error");
  return value.slice(0, 1000);
}

async function rpc<T>(name: string, payload: JsonRecord): Promise<T> {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`rpc_${name}_${response.status}:${text}`);
  return (text ? JSON.parse(text) : null) as T;
}

async function authenticatedUser(authorization: string): Promise<{ id: string; email_confirmed_at?: string | null }> {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: ANON_KEY, Authorization: authorization },
  });
  if (!response.ok) throw new Error("not_authenticated");
  return await response.json();
}

async function sendVerificationTemplate(item: {
  claim_id: string;
  phone: string;
  token: string;
  masked_email?: string | null;
}): Promise<string> {
  const yesPayload = `sanad_phone_yes|${item.claim_id}|${item.token}`;
  const noPayload = `sanad_phone_no|${item.claim_id}|${item.token}`;

  const response = await fetch(
    `https://graph.facebook.com/${META_GRAPH_VERSION}/${META_PHONE_ID}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${META_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: item.phone,
        type: "template",
        template: {
          name: TEMPLATE_NAME,
          language: { code: TEMPLATE_LANGUAGE },
          components: [
            {
              type: "body",
              parameters: [{ type: "text", text: item.masked_email || "حساب سند" }],
            },
            {
              type: "button",
              sub_type: "quick_reply",
              index: "0",
              parameters: [{ type: "payload", payload: yesPayload }],
            },
            {
              type: "button",
              sub_type: "quick_reply",
              index: "1",
              parameters: [{ type: "payload", payload: noPayload }],
            },
          ],
        },
      }),
    },
  );

  const text = await response.text();
  if (!response.ok) throw new Error(`meta_template_${response.status}:${text}`);
  const payload = JSON.parse(text);
  const messageId = payload?.messages?.[0]?.id;
  if (!messageId) throw new Error(`meta_template_missing_message_id:${text}`);
  return String(messageId);
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (request.method !== "POST") return respond({ ok: false, error: "method_not_allowed" }, 405);

  const authorization = request.headers.get("Authorization");
  if (!authorization) return respond({ ok: false, error: "not_authenticated" }, 401);

  try {
    const user = await authenticatedUser(authorization);
    if (!user.email_confirmed_at) {
      return respond({ ok: false, error: "email_confirmation_required" }, 403);
    }

    await rpc("requeue_my_phone_verification_if_needed", {}).catch(() => null);

    const claimed = await rpc<{ items?: Array<{
      claim_id: string;
      phone: string;
      token: string;
      masked_email?: string | null;
    }> }>("claim_phone_verification_delivery", {
      p_user_id: user.id,
      p_limit: 1,
    });

    const item = Array.isArray(claimed?.items) ? claimed.items[0] : null;
    if (!item) {
      const status = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_my_phone_verification_status`, {
        method: "POST",
        headers: {
          apikey: ANON_KEY,
          Authorization: authorization,
          "Content-Type": "application/json",
        },
        body: "{}",
      });
      const body = await status.json().catch(() => null);
      return respond({ ok: true, accepted: false, status: body?.status || "not_pending" });
    }

    try {
      const messageId = await sendVerificationTemplate(item);
      await rpc("mark_phone_verification_delivery", {
        p_claim_id: item.claim_id,
        p_status: "sent",
        p_message_id: messageId,
        p_error: null,
        p_metadata: { worker: "sanad-phone-verification", template: TEMPLATE_NAME },
      });
      return respond({ ok: true, accepted: true, status: "sent" });
    } catch (error) {
      const detail = safeError(error);
      await rpc("mark_phone_verification_delivery", {
        p_claim_id: item.claim_id,
        p_status: "failed",
        p_message_id: null,
        p_error: detail,
        p_metadata: { worker: "sanad-phone-verification", template: TEMPLATE_NAME },
      }).catch(() => undefined);
      console.error(JSON.stringify({ function: "sanad-phone-verification", event: "send_failed", error: detail }));
      return respond({ ok: false, error: "whatsapp_delivery_unavailable" }, 502);
    }
  } catch (error) {
    const detail = safeError(error);
    const status = detail === "not_authenticated" ? 401 : 500;
    console.error(JSON.stringify({ function: "sanad-phone-verification", event: "request_failed", error: detail }));
    return respond({ ok: false, error: status === 401 ? "not_authenticated" : "verification_unavailable" }, status);
  }
});

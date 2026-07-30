type JsonRecord = Record<string, unknown>;

type VerificationItem = {
  claim_id: string;
  phone: string;
  token: string;
  masked_email?: string | null;
};

const SUPABASE_URL = mustGetEnv("SUPABASE_URL");
const SERVICE_KEY = mustGetEnv("SUPABASE_SERVICE_ROLE_KEY");
const ANON_KEY = mustGetEnv("SUPABASE_ANON_KEY");
const META_TOKEN = mustGetEnv("META_WA_ACCESS_TOKEN");
const META_PHONE_ID = mustGetEnv("META_WA_PHONE_NUMBER_ID");
const TEMPLATE_NAME = Deno.env.get("META_PHONE_VERIFICATION_TEMPLATE") || "sanad_phone_verification_ar";
const TEMPLATE_LANGUAGE = Deno.env.get("META_PHONE_VERIFICATION_LANGUAGE") || "ar";
const META_GRAPH_VERSION = Deno.env.get("META_GRAPH_VERSION") || "v20.0";
const WORKER_NAME = "phone_verification_delivery";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-sanad-worker-token",
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

async function isValidWorkerToken(token: string): Promise<boolean> {
  return await rpc<boolean>("verify_sanad_worker_token", {
    p_worker_name: WORKER_NAME,
    p_token: token,
  });
}

async function sendVerificationTemplate(item: VerificationItem): Promise<string> {
  const yesPayload = `sanad_phone_yes|${item.claim_id}|${item.token}`;
  const noPayload = `sanad_phone_no|${item.claim_id}|${item.token}`;

  const response = await fetch(`https://graph.facebook.com/${META_GRAPH_VERSION}/${META_PHONE_ID}/messages`, {
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
  });

  const text = await response.text();
  if (!response.ok) throw new Error(`meta_template_${response.status}:${text}`);
  const payload = JSON.parse(text);
  const messageId = payload?.messages?.[0]?.id;
  if (!messageId) throw new Error(`meta_template_missing_message_id:${text}`);
  return String(messageId);
}

async function processItems(items: VerificationItem[], source: string) {
  const results: Array<{ claim_id: string; status: "sent" | "failed"; error?: string }> = [];

  for (const item of items) {
    try {
      const messageId = await sendVerificationTemplate(item);
      await rpc("mark_phone_verification_delivery", {
        p_claim_id: item.claim_id,
        p_status: "sent",
        p_message_id: messageId,
        p_error: null,
        p_metadata: { worker: "sanad-phone-verification", template: TEMPLATE_NAME, source },
      });
      results.push({ claim_id: item.claim_id, status: "sent" });
    } catch (error) {
      const detail = safeError(error);
      await rpc("mark_phone_verification_delivery", {
        p_claim_id: item.claim_id,
        p_status: "failed",
        p_message_id: null,
        p_error: detail,
        p_metadata: { worker: "sanad-phone-verification", template: TEMPLATE_NAME, source },
      }).catch(() => undefined);
      console.error(JSON.stringify({ function: "sanad-phone-verification", event: "send_failed", claim_id: item.claim_id, error: detail }));
      results.push({ claim_id: item.claim_id, status: "failed", error: detail });
    }
  }

  return results;
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (request.method !== "POST") return respond({ ok: false, error: "method_not_allowed" }, 405);

  try {
    const workerToken = request.headers.get("x-sanad-worker-token")?.trim() || "";
    const authorization = request.headers.get("Authorization");
    let userId: string | null = null;
    let limit = 1;
    let source = "user_request";

    if (workerToken) {
      if (!(await isValidWorkerToken(workerToken))) {
        return respond({ ok: false, error: "invalid_worker_token" }, 401);
      }
      const body = await request.json().catch(() => ({}));
      limit = Math.max(1, Math.min(Number(body?.limit) || 10, 25));
      source = String(body?.source || "background_worker").slice(0, 100);
    } else {
      if (!authorization) return respond({ ok: false, error: "not_authenticated" }, 401);
      const user = await authenticatedUser(authorization);
      if (!user.email_confirmed_at) {
        return respond({ ok: false, error: "email_confirmation_required" }, 403);
      }
      userId = user.id;
      await rpc("requeue_my_phone_verification_if_needed", {}).catch(() => null);
    }

    const claimed = await rpc<{ items?: VerificationItem[] }>("claim_phone_verification_delivery", {
      p_user_id: userId,
      p_limit: limit,
    });
    const items = Array.isArray(claimed?.items) ? claimed.items : [];

    if (items.length === 0) {
      return respond({ ok: true, accepted: false, claimed: 0, sent: 0, failed: 0 });
    }

    const results = await processItems(items, source);
    const sent = results.filter((item) => item.status === "sent").length;
    const failed = results.length - sent;

    return respond({
      ok: failed === 0,
      accepted: true,
      claimed: items.length,
      sent,
      failed,
      results,
    }, failed > 0 && sent === 0 ? 502 : 200);
  } catch (error) {
    const detail = safeError(error);
    const status = detail === "not_authenticated" ? 401 : 500;
    console.error(JSON.stringify({ function: "sanad-phone-verification", event: "request_failed", error: detail }));
    return respond({ ok: false, error: status === 401 ? "not_authenticated" : "verification_unavailable" }, status);
  }
});

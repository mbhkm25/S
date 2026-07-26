import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const projectRef = "hudbzlgclghlhazlduas";
const targetFunction = "sanad-v3-notify-verification";
const gatewayName = "sanad-v3-app-trigger-notify-verification";
const keyHeaderName = ["x", "sanad", "internal", "key"].join("-");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function respond(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function canAccessOperation(
  authorization: string,
  operationId: string,
): Promise<boolean> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !anonKey) throw new Error("server_misconfigured");

  const response = await fetch(
    `${supabaseUrl}/rest/v1/operations?id=eq.${encodeURIComponent(operationId)}&select=id&limit=1`,
    {
      headers: {
        Authorization: authorization,
        apikey: anonKey,
        Accept: "application/json",
      },
    },
  );

  if (!response.ok) return false;
  const rows = await response.json().catch(() => []);
  return Array.isArray(rows) && rows.length === 1;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return respond({ ok: false, error: "method_not_allowed" }, 405);

  const k = Deno.env.get("SANAD_INTERNAL_API_KEY");
  if (!k) return respond({ ok: false, error: "server_misconfigured" }, 500);

  const authorization = req.headers.get("Authorization");
  if (!authorization) return respond({ ok: false, error: "not_authenticated" }, 401);

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return respond({ ok: false, error: "invalid_json" }, 400);
  }

  if (!isUuid(payload.operation_id)) {
    return respond({ ok: false, error: "invalid_operation_id" }, 400);
  }

  try {
    if (!(await canAccessOperation(authorization, payload.operation_id))) {
      return respond({ ok: false, error: "operation_not_accessible" }, 403);
    }
  } catch {
    return respond({ ok: false, error: "authorization_unavailable" }, 503);
  }

  const headers = new Headers();
  headers.set("Content-Type", "application/json");
  headers.set(keyHeaderName, k);

  const upstream = await fetch(
    `https://${projectRef}.functions.supabase.co/${targetFunction}`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({ ...payload, gateway: gatewayName }),
    },
  );

  const text = await upstream.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text };
  }

  if (!upstream.ok) {
    return respond(
      { ok: false, error: "upstream_failed", status: upstream.status, details: body },
      upstream.status,
    );
  }

  return respond(body ?? { ok: true });
});

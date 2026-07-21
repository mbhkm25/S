import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const projectRef = "hudbzlgclghlhazlduas";
const targetFunction = "sanad-pro-payment-verify";
const gatewayName = "sanad-v3-app-trigger-pro-payment-verify";
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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return respond({ ok: false, error: "method_not_allowed" }, 405);

  const k = Deno.env.get("SANAD_INTERNAL_API_KEY");
  if (!k) return respond({ ok: false, error: "server_misconfigured" }, 500);

  const authorization = req.headers.get("Authorization");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!authorization || !supabaseUrl || !anonKey) {
    return respond({ ok: false, error: "not_authenticated" }, 401);
  }

  let payload: Record<string, unknown>;
  try { payload = await req.json(); } catch { return respond({ ok: false, error: "invalid_json" }, 400); }
  if (!payload.payment_request_id) return respond({ ok: false, error: "missing_payment_request_id" }, 400);

  const claimResponse = await fetch(`${supabaseUrl}/rest/v1/rpc/claim_my_pro_payment_verification`, {
    method: "POST",
    headers: { Authorization: authorization, apikey: anonKey, "Content-Type": "application/json" },
    body: JSON.stringify({ p_payment_request_id: payload.payment_request_id }),
  });
  const claim = await claimResponse.json().catch(() => null);
  if (!claimResponse.ok || claim?.ok !== true) {
    return respond({ ok: false, error: claim?.reason || "payment_request_not_found" }, 404);
  }
  if (claim.process !== true) {
    return respond({ ok: true, accepted: false, status: claim.status });
  }

  const headers = new Headers();
  headers.set("Content-Type", "application/json");
  headers.set(keyHeaderName, k);

  const upstream = await fetch(`https://${projectRef}.functions.supabase.co/${targetFunction}`, {
    method: "POST",
    headers,
    body: JSON.stringify({ ...payload, gateway: gatewayName }),
  });

  const text = await upstream.text();
  let body: unknown = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = { raw: text }; }

  if (!upstream.ok) return respond({ ok: false, error: "verification_unavailable" }, 502);
  const upstreamBody = body as Record<string, unknown> | null;
  return respond({
    ok: true,
    accepted: true,
    status: upstreamBody?.status || "processing",
    payment_request_id: payload.payment_request_id,
  });
});

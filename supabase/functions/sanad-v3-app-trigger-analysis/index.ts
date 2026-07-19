import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const projectRef = "hudbzlgclghlhazlduas";
const targetFunction = "sanad-v3-analyze-operation";
const gatewayName = "sanad-v3-app-trigger-analysis";
const kHeader = "x-sanad-internal-key";
const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
function respond(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } }); }
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return respond({ ok: false, error: "method_not_allowed" }, 405);
  const k = Deno.env.get("SANAD_INTERNAL_API_KEY");
  if (!k) return respond({ ok: false, error: "server_misconfigured" }, 500);
  let payload: Record<string, unknown>;
  try { payload = await req.json(); } catch { return respond({ ok: false, error: "invalid_json" }, 400); }
  if (!payload.operation_id) return respond({ ok: false, error: "missing_operation_id" }, 400);
  const headers = new Headers();
  headers.set("Content-Type", "application/json");
  headers.set(kHeader, k);
  const upstream = await fetch(`https://${projectRef}.functions.supabase.co/${targetFunction}`, { method: "POST", headers, body: JSON.stringify({ ...payload, gateway: gatewayName }) });
  const text = await upstream.text();
  let body: unknown = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = { raw: text }; }
  if (!upstream.ok) return respond({ ok: false, error: "upstream_failed", status: upstream.status, details: body }, upstream.status);
  return respond(body ?? { ok: true });
});

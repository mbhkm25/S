import { createClient } from "npm:@supabase/supabase-js@2";

const supabaseUrl = (Deno.env.get("SUPABASE_URL") || "").replace(/\/$/, "");
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://app.sanadflow.com",
  "Access-Control-Allow-Headers": "content-type, accept",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "content-type": "application/json; charset=utf-8",
      "cache-control": "private, no-store, max-age=0",
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
    },
  });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "GET") return json({ ok: false, error: "method_not_allowed" }, 405);

  const token = new URL(request.url).searchParams.get("token") || "";
  if (token.length < 32 || token.length > 256) {
    return json({ ok: false, error: "invalid_token" }, 400);
  }

  const { data, error } = await supabase.rpc("get_interactive_report_by_token", { p_token: token });
  if (error) {
    console.error("interactive_report_data_failed", { code: error.code, message: error.message });
    return json({ ok: false, error: "report_unavailable" }, 500);
  }

  const result = data as Record<string, unknown> | null;
  if (!result?.ok) {
    const reason = String(result?.error || "not_found");
    const status = reason === "expired" ? 410 : reason === "invalid_token" ? 400 : 404;
    return json({ ok: false, error: reason }, status);
  }

  return json(result);
});

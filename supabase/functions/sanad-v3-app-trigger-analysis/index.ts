import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function respond(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
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
  if (req.method !== "POST") {
    return respond({ ok: false, error: "method_not_allowed" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return respond({ ok: false, error: "server_misconfigured" }, 500);
  }

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

  const rpcResponse = await fetch(
    `${supabaseUrl}/rest/v1/rpc/enqueue_operation_analysis`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceRoleKey}`,
        apikey: serviceRoleKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        p_operation_id: payload.operation_id,
        p_priority: 100,
        p_source: "app",
        p_requested_by_user_id: null,
      }),
    },
  );

  const raw = await rpcResponse.text();
  let jobId: unknown = null;
  try {
    jobId = raw ? JSON.parse(raw) : null;
  } catch {
    jobId = raw;
  }

  if (!rpcResponse.ok) {
    return respond({ ok: false, error: "queue_enqueue_failed", details: jobId }, 503);
  }

  return respond({
    ok: true,
    queued: true,
    operation_id: payload.operation_id,
    job_id: jobId,
    ai_status: "queued",
    message: "تم استلام العملية ووضعها في قائمة التحليل.",
  }, 202);
});

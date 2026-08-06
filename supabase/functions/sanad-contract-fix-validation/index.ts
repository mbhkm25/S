import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const INTERNAL_KEY = Deno.env.get("SANAD_INTERNAL_API_KEY")!;
const RUN_TOKEN = "contract-fix-20260806";
const OPERATION_IDS = [
  "9745eccc-1a9e-4f7a-8007-0caae3497b34",
  "a1c4df73-6559-49e0-a6c1-4ea27d72520a",
] as const;

Deno.serve(async (request) => {
  if (request.method !== "POST" || request.headers.get("x-run-token") !== RUN_TOKEN) {
    return new Response(JSON.stringify({ ok: false, error: "not_found" }), { status: 404 });
  }

  const results = [];
  for (const operationId of OPERATION_IDS) {
    const startedAt = Date.now();
    const response = await fetch(`${SUPABASE_URL}/functions/v1/sanad-v3-analyze-operation`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SERVICE_KEY}`,
        apikey: SERVICE_KEY,
        "x-sanad-internal-key": INTERNAL_KEY,
        "content-type": "application/json",
      },
      body: JSON.stringify({ operation_id: operationId }),
    });
    results.push({
      operation_id: operationId,
      status: response.status,
      ok: response.ok,
      elapsed_ms: Date.now() - startedAt,
      response: (await response.text()).slice(0, 1000),
    });
  }

  return new Response(JSON.stringify({ ok: true, results }), {
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
});

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const INTERNAL_KEY = Deno.env.get("SANAD_INTERNAL_API_KEY")!;
const RUN_TOKEN = "e836fb87365f4ff19d977c548b6454c1";

const OPERATION_IDS = [
  "12622af6-bf41-429c-ba65-05ba3f3a32d4",
  "d007e710-8b65-4152-a8b6-d76b1a823877",
  "ba13fe37-94d9-401b-973f-d32740db431a",
  "a3866da1-59d6-4a93-97de-21da71f8e26c",
  "9745eccc-1a9e-4f7a-8007-0caae3497b34",
  "c70c1c83-99db-40ad-b0d8-841c46fd6a07",
  "a1c4df73-6559-49e0-a6c1-4ea27d72520a",
  "5d5f82ab-f71a-42ae-8b27-ffa9a74d38c3",
  "26e3a961-4d54-452a-b05d-d5926b949f88",
] as const;

Deno.serve(async (request) => {
  if (request.method !== "POST" || request.headers.get("x-run-token") !== RUN_TOKEN) {
    return new Response(JSON.stringify({ ok: false, error: "not_found" }), {
      status: 404,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  }

  const results: Array<Record<string, unknown>> = [];
  for (const operationId of OPERATION_IDS) {
    const startedAt = Date.now();
    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/sanad-operation-shadow-orchestrate`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${SERVICE_KEY}`,
          apikey: SERVICE_KEY,
          "x-sanad-internal-key": INTERNAL_KEY,
          "content-type": "application/json",
        },
        body: JSON.stringify({ operation_id: operationId, attempt: 1 }),
      });
      const text = await response.text();
      results.push({
        operation_id: operationId,
        ok: response.ok,
        status: response.status,
        elapsed_ms: Date.now() - startedAt,
        response: text.slice(0, 500),
      });
    } catch (error) {
      results.push({
        operation_id: operationId,
        ok: false,
        elapsed_ms: Date.now() - startedAt,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return new Response(JSON.stringify({ ok: true, count: results.length, results }), {
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
});

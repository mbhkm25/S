import "jsr:@supabase/functions-js/edge-runtime.d.ts";

type JsonRecord = Record<string, unknown>;

const SUPABASE_URL = mustGetEnv("SUPABASE_URL");
const SERVICE_ROLE_KEY = mustGetEnv("SUPABASE_SERVICE_ROLE_KEY");
const INTERNAL_KEY = mustGetEnv("SANAD_INTERNAL_API_KEY");

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204 });
  if (request.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
  if (request.headers.get("x-sanad-internal-key") !== INTERNAL_KEY) {
    return json({ ok: false, error: "unauthorized" }, 401);
  }

  try {
    const body = await request.json() as JsonRecord;
    const operationId = stringValue(body.operation_id);
    const attempt = Math.max(1, Math.min(10, Number(body.attempt ?? 1) || 1));
    if (!operationId) return json({ ok: false, error: "operation_id_required" }, 400);

    const analysisResponse = await invokeInternal("sanad-operation-analysis-shadow", {
      operation_id: operationId,
      attempt,
    });

    if (!analysisResponse.ok) {
      return json({
        ok: false,
        stage: "analysis",
        error: analysisResponse.error ?? "shadow_analysis_failed",
        detail: analysisResponse,
      }, analysisResponse.statusCode >= 400 ? analysisResponse.statusCode : 502);
    }

    const runId = stringValue(analysisResponse.run_id);
    if (!runId) {
      return json({ ok: false, stage: "analysis", error: "shadow_run_id_missing" }, 502);
    }

    const routingResponse = await invokeInternal("sanad-operation-shadow-route", {
      run_id: runId,
    });

    if (!routingResponse.ok) {
      return json({
        ok: false,
        stage: "routing",
        run_id: runId,
        error: routingResponse.error ?? "shadow_routing_failed",
        detail: routingResponse,
      }, routingResponse.statusCode >= 400 ? routingResponse.statusCode : 502);
    }

    return json({
      ok: true,
      operation_id: operationId,
      run_id: runId,
      engine_version: analysisResponse.engine_version ?? null,
      model: analysisResponse.model ?? null,
      latency_ms: analysisResponse.latency_ms ?? null,
      comparable_agreement: analysisResponse.comparable_agreement ?? null,
      shadow_coverage: analysisResponse.shadow_coverage ?? null,
      routing_eligible: analysisResponse.routing_eligible ?? null,
      routing_reasons: analysisResponse.routing_reasons ?? [],
      account_match: routingResponse.account_match ?? null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json({ ok: false, error: "shadow_orchestrator_internal_error", detail: message.slice(0, 500) }, 500);
  }
});

async function invokeInternal(functionName: string, body: JsonRecord): Promise<JsonRecord & { statusCode: number }> {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/${functionName}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      apikey: SERVICE_ROLE_KEY,
      "x-sanad-internal-key": INTERNAL_KEY,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const payload = await response.json().catch(() => ({ ok: false, error: "invalid_json_response" })) as JsonRecord;
  return { ...payload, statusCode: response.status };
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function mustGetEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name}_required`);
  return value;
}

function json(body: JsonRecord, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

from pathlib import Path

TARGET = Path("supabase/functions/sanad-v3-analyze-operation/index.ts")
MARKER = "const ENABLE_OPERATIONAL_SHADOW ="

source = TARGET.read_text(encoding="utf-8")
if MARKER in source:
    print("Operational shadow hook already present")
    raise SystemExit(0)

source = source.replace(
    "// - GEMINI_FAST_MODEL = GEMINI_MODEL\n",
    "// - GEMINI_FAST_MODEL = GEMINI_MODEL\n// - ENABLE_OPERATIONAL_SHADOW = false\n",
    1,
)

config_anchor = '''const ENABLE_FAST_ROUTING_PASS =
  (Deno.env.get("ENABLE_FAST_ROUTING_PASS") || "false") === "true";
'''
config_replacement = config_anchor + '''const ENABLE_OPERATIONAL_SHADOW =
  (Deno.env.get("ENABLE_OPERATIONAL_SHADOW") || "false") === "true";
'''
if config_anchor not in source:
    raise RuntimeError("ENABLE_FAST_ROUTING_PASS anchor not found")
source = source.replace(config_anchor, config_replacement, 1)

serve_anchor = "\nDeno.serve(async (req: Request) => {"
helper = r'''

async function runOperationalShadow(params: {
  operationId: string;
  runId: string;
}): Promise<void> {
  const startedAtMs = Date.now();
  if (!ENABLE_OPERATIONAL_SHADOW) return;

  try {
    const response = await fetch(
      `${SUPABASE_URL}/functions/v1/sanad-operation-shadow-orchestrate`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          "x-sanad-internal-key": SANAD_INTERNAL_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          operation_id: params.operationId,
          attempt: 1,
        }),
      },
    );

    const responseText = await response.text();
    if (!response.ok) {
      throw new Error(
        `operational_shadow_http_${response.status}:${truncateText(responseText, 500)}`,
      );
    }

    await recordSpan({
      operationId: params.operationId,
      runId: params.runId,
      pipeline: "operational_shadow",
      stage: "orchestrate",
      status: "success",
      startedAtMs,
      metadata: { response_status: response.status },
    });
  } catch (error) {
    await recordSpan({
      operationId: params.operationId,
      runId: params.runId,
      pipeline: "operational_shadow",
      stage: "orchestrate",
      status: "error",
      startedAtMs,
      metadata: {
        error: truncateText(error instanceof Error ? error.message : String(error), 800),
      },
    });
  }
}
'''
if serve_anchor not in source:
    raise RuntimeError("Deno.serve anchor not found")
source = source.replace(serve_anchor, helper + serve_anchor, 1)

return_anchor = '''    return jsonResponse({
      ok: true,
      operation_id: operation.id,
      public_token: operation.public_token,
      ai_status: "completed",
'''
schedule = '''    const operationalShadowTask = runOperationalShadow({
      operationId: operation.id,
      runId,
    });
    if (typeof EdgeRuntime !== "undefined" && EdgeRuntime?.waitUntil) {
      EdgeRuntime.waitUntil(operationalShadowTask);
    } else {
      void operationalShadowTask;
    }

'''
if return_anchor not in source:
    raise RuntimeError("successful response anchor not found")
source = source.replace(return_anchor, schedule + return_anchor, 1)

TARGET.write_text(source, encoding="utf-8")
print("Operational shadow hook applied")

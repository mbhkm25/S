from pathlib import Path

path = Path("supabase/functions/sanad-v3-analyze-operation/index.ts")
source = path.read_text(encoding="utf-8")
old = '''  const startedAtMs = Date.now();
  if (!ENABLE_OPERATIONAL_SHADOW) return;

  try {
'''
new = '''  const startedAtMs = Date.now();
  let shouldRun = ENABLE_OPERATIONAL_SHADOW;
  if (!shouldRun) {
    try {
      shouldRun = await supabaseJson<boolean>(
        "/rest/v1/rpc/service_should_run_operational_shadow",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ p_operation_id: params.operationId }),
        },
      );
    } catch (error) {
      await recordSpan({
        operationId: params.operationId,
        runId: params.runId,
        pipeline: "analysis",
        stage: "operational_shadow_gate",
        status: "error",
        startedAtMs,
        metadata: {
          error: truncateText(error instanceof Error ? error.message : String(error), 500),
        },
      });
      return;
    }
  }
  if (!shouldRun) return;

  try {
'''
if old not in source:
    raise RuntimeError("operational shadow gate anchor not found")
source = source.replace(old, new, 1)
path.write_text(source, encoding="utf-8")
print("Applied operational shadow runtime flag")

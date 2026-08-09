import "jsr:@supabase/functions-js/edge-runtime.d.ts";

type JsonRecord = Record<string, unknown>;

const SUPABASE_URL = mustEnv("SUPABASE_URL");
const SERVICE_ROLE_KEY = mustEnv("SUPABASE_SERVICE_ROLE_KEY");
const INTERNAL_KEY = mustEnv("SANAD_INTERNAL_API_KEY");
const FAST_ANALYZER_URL = `${SUPABASE_URL}/functions/v1/sanad-operation-analysis-shadow`;
const LEGACY_ANALYZER_URL = `${SUPABASE_URL}/functions/v1/sanad-v3-analyze-operation`;
const FUNCTION_NAME = "sanad-operation-analysis-primary";
const ENGINE_VERSION = "operational-primary-v2-summary";

const headers = {
  apikey: SERVICE_ROLE_KEY,
  Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
  "content-type": "application/json",
};

function mustEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`missing_env_${name}`);
  return value;
}

function text(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim();
  return normalized && normalized.toLowerCase() !== "null" ? normalized : null;
}

function numberOrNull(value: unknown): number | null {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function currencyLabel(value: unknown): string {
  const code = String(value ?? "").trim().toUpperCase();
  if (code === "YER") return "ريال يمني";
  if (code === "SAR") return "ريال سعودي";
  if (code === "USD") return "دولار أمريكي";
  return code || "عملة غير محددة";
}

function formatAmount(value: unknown): string | null {
  const numeric = numberOrNull(value);
  if (numeric === null) return null;
  return new Intl.NumberFormat("en-US", { numberingSystem: "latn", maximumFractionDigits: 2 }).format(numeric);
}

function buildOperationalSummary(normalized: JsonRecord, rawOutput: JsonRecord): string {
  const rawSummary = text(rawOutput.summary) ?? text(normalized.summary);
  if (rawSummary) return rawSummary.slice(0, 700);

  const amount = formatAmount(normalized.amount);
  const currency = currencyLabel(normalized.currency);
  const entity = text(normalized.financialEntity);
  const receiver = text(normalized.receiverName);
  const reference = text(normalized.referenceNumber);
  const transactionType = text(normalized.transactionType);

  const parts: string[] = [];
  if (transactionType && transactionType !== "unknown") {
    const labels: Record<string, string> = {
      deposit: "إيداع",
      withdrawal: "سحب",
      transfer: "تحويل",
      payment: "دفع",
    };
    parts.push(labels[transactionType] ?? "عملية مالية");
  } else {
    parts.push("عملية مالية");
  }
  if (amount) parts.push(`بقيمة ${amount} ${currency}`);
  if (entity && entity !== "unknown" && entity !== "غير معروف") parts.push(`عبر ${entity}`);
  if (receiver) parts.push(`لصالح ${receiver}`);

  let summary = parts.join(" ").trim();
  if (summary && !/[.!؟]$/.test(summary)) summary += ".";
  if (reference) summary += ` رقم المرجع ${reference}.`;
  return summary || "عملية مالية مسجلة في سند.";
}

function operationIdentifierType(value: unknown): string {
  const type = text(value) ?? "unknown_identifier";
  if (["account_number", "wallet_number", "financial_line", "merchant_point", "terminal_number", "phone_number", "iban", "other", "unknown"].includes(type)) return type;
  if (type === "financial_account_number") return "account_number";
  if (type === "customer_line") return "financial_line";
  if (["unique_account_name", "national_id", "passport_number", "card_number", "document_reference", "transfer_reference"].includes(type)) return "other";
  return "unknown";
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

async function rest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${SUPABASE_URL}${path}`, {
    ...init,
    headers: { ...headers, ...(init.headers ?? {}) },
  });
  const raw = await response.text();
  if (!response.ok) throw new Error(`rest_${response.status}:${raw.slice(0, 800)}`);
  return (raw ? JSON.parse(raw) : null) as T;
}

async function callFastAnalyzer(operationId: string): Promise<JsonRecord> {
  const response = await fetch(FAST_ANALYZER_URL, {
    method: "POST",
    headers: { ...headers, "x-sanad-internal-key": INTERNAL_KEY },
    body: JSON.stringify({ operation_id: operationId, attempt: 1 }),
    signal: AbortSignal.timeout(30000),
  });
  const raw = await response.text();
  if (!response.ok) throw new Error(`fast_analyzer_${response.status}:${raw.slice(0, 1000)}`);
  return JSON.parse(raw) as JsonRecord;
}

async function callLegacyFallback(operationId: string, reason: string): Promise<Response> {
  const response = await fetch(LEGACY_ANALYZER_URL, {
    method: "POST",
    headers: { ...headers, "x-sanad-internal-key": INTERNAL_KEY },
    body: JSON.stringify({
      operation_id: operationId,
      gateway: FUNCTION_NAME,
      fallback_reason: reason.slice(0, 500),
    }),
    signal: AbortSignal.timeout(60000),
  });
  const raw = await response.text();
  return json({
    ok: response.ok,
    engine: "legacy_fallback",
    fallback_used: true,
    fallback_reason: reason.slice(0, 500),
    legacy_status: response.status,
    legacy_response: raw ? JSON.parse(raw) : null,
  }, response.status);
}

async function persistPrimaryResult(operationId: string, runId: string): Promise<JsonRecord> {
  const rows = await rest<JsonRecord[]>(
    `/rest/v1/operation_analysis_shadow_runs?select=id,model,prompt_key,prompt_version,latency_ms,normalized_output,shadow_output,routing_decision&id=eq.${encodeURIComponent(runId)}&limit=1`,
  );
  const run = rows[0];
  if (!run) throw new Error("primary_run_not_found");
  const existingRows = await rest<JsonRecord[]>(
    `/rest/v1/operations?select=status,structured_data,raw_ai_json&id=eq.${encodeURIComponent(operationId)}&limit=1`,
  );
  const existing = existingRows[0] ?? {};
  const existingStructured = existing.structured_data && typeof existing.structured_data === "object"
    ? existing.structured_data as JsonRecord
    : {};
  const existingRaw = existing.raw_ai_json && typeof existing.raw_ai_json === "object"
    ? existing.raw_ai_json as JsonRecord
    : {};
  const normalized = (run.normalized_output ?? {}) as JsonRecord;
  const rawOutput = (run.shadow_output ?? {}) as JsonRecord;
  const routing = (run.routing_decision ?? {}) as JsonRecord;
  const semanticIdentifierType = text(normalized.receiverIdentifierType) ?? "unknown_identifier";
  const receiverIdentifierValue = text(normalized.receiverIdentifierValue);
  const confidence = numberOrNull(normalized.confidence);
  const reviewRequired = normalized.reviewRequired === true || routing.eligible !== true;
  const summary = buildOperationalSummary(normalized, rawOutput);

  const structuredData = {
    ...existingStructured,
    schema_version: 3,
    analysis_engine: ENGINE_VERSION,
    summary,
    financial_entity: text(normalized.financialEntity),
    financial_entity_code: text(normalized.financialEntityCode),
    transaction_type: text(normalized.transactionType) ?? "unknown",
    transaction_direction: text(normalized.transactionDirection) ?? "unknown",
    amount: numberOrNull(normalized.amount),
    currency: text(normalized.currency),
    receiver_name: text(normalized.receiverName),
    receiver_account: receiverIdentifierValue,
    receiver_identifier_type: semanticIdentifierType,
    receiver_identifier_type_semantic: semanticIdentifierType,
    reference_number: text(normalized.referenceNumber),
    transaction_datetime: text(normalized.transactionDatetime),
    confidence_score: confidence,
    review_required: reviewRequired,
    warnings: Array.isArray(normalized.warnings) ? normalized.warnings : [],
    routing_decision: routing,
    original_document_is_source_of_truth: true,
  };

  const rawAiJson = {
    ...existingRaw,
    engine: ENGINE_VERSION,
    model: run.model,
    prompt_key: run.prompt_key,
    prompt_version: run.prompt_version,
    pipeline_run_id: runId,
    normalized: structuredData,
    raw_output: rawOutput,
    quality: routing,
    timings: { gemini_ms: run.latency_ms },
    fallback_used: false,
    summary_source: text(rawOutput.summary) ? "model" : "deterministic_projection",
  };

  const patch = {
    ai_status: "completed",
    ai_error: null,
    ai_model: run.model,
    status: existing.status === "verified" ? "verified" : "ready",
    summary,
    financial_entity: structuredData.financial_entity,
    financial_entity_code: structuredData.financial_entity_code,
    transaction_type: structuredData.transaction_type,
    transaction_direction: structuredData.transaction_direction,
    amount: structuredData.amount,
    currency: structuredData.currency,
    receiver_name: structuredData.receiver_name,
    receiver_account: receiverIdentifierValue,
    receiver_identifier_type: operationIdentifierType(semanticIdentifierType),
    reference_number: structuredData.reference_number,
    transaction_datetime: structuredData.transaction_datetime,
    confidence_score: confidence,
    ai_confidence_score: confidence,
    sanad_confidence_score: confidence,
    sanad_review_status: reviewRequired ? "needs_review" : "not_required",
    sanad_risk_level: reviewRequired ? "medium" : "low",
    missing_fields: [],
    sanad_warnings: structuredData.warnings,
    structured_data: structuredData,
    raw_ai_json: rawAiJson,
    analysis_completed_at: new Date().toISOString(),
  };

  const updated = await rest<JsonRecord[]>(
    `/rest/v1/operations?id=eq.${encodeURIComponent(operationId)}`,
    {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(patch),
    },
  );
  if (!updated[0]) throw new Error("primary_operation_update_failed");
  return { run, normalized: structuredData, routing };
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
  if (request.headers.get("x-sanad-internal-key") !== INTERNAL_KEY) return json({ ok: false, error: "unauthorized" }, 401);

  const body = await request.json().catch(() => ({})) as JsonRecord;
  const operationId = text(body.operation_id ?? body.id);
  if (!operationId) return json({ ok: false, error: "operation_id_required" }, 400);

  try {
    const fast = await callFastAnalyzer(operationId);
    const runId = text(fast.run_id);
    if (!runId) throw new Error("fast_analyzer_run_id_missing");
    const persisted = await persistPrimaryResult(operationId, runId);
    return json({
      ok: true,
      engine: ENGINE_VERSION,
      fallback_used: false,
      operation_id: operationId,
      run_id: runId,
      latency_ms: fast.latency_ms ?? null,
      routing_eligible: fast.routing_eligible ?? false,
      normalized: persisted.normalized,
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    try {
      return await callLegacyFallback(operationId, reason);
    } catch (fallbackError) {
      return json({
        ok: false,
        error: "primary_and_fallback_failed",
        primary_error: reason.slice(0, 800),
        fallback_error: String(fallbackError).slice(0, 800),
        original_document_available: true,
      }, 500);
    }
  }
});

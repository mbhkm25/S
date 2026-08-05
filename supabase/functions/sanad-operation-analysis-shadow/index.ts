import "jsr:@supabase/functions-js/edge-runtime.d.ts";

type JsonRecord = Record<string, unknown>;

type OperationRow = {
  id: string;
  file_bucket: string | null;
  file_path: string | null;
  file_mime_type: string | null;
  financial_entity: string | null;
  transaction_type: string | null;
  transaction_direction: string | null;
  amount: number | null;
  currency: string | null;
  receiver_name: string | null;
  receiver_account: string | null;
  receiver_identifier_type: string | null;
  reference_number: string | null;
  transaction_datetime: string | null;
  structured_data: JsonRecord | null;
};

const SUPABASE_URL = mustGetEnv("SUPABASE_URL");
const SERVICE_KEY = mustGetEnv("SUPABASE_SERVICE_ROLE_KEY");
const GEMINI_API_KEY = mustGetEnv("GEMINI_API_KEY");
const INTERNAL_KEY = mustGetEnv("SANAD_INTERNAL_API_KEY");

const MODEL = Deno.env.get("SANAD_SHADOW_MODEL") || "gemini-3.5-flash-lite";
const PROMPT_KEY = Deno.env.get("SANAD_SHADOW_PROMPT_KEY") ||
  "sanad_operation_extraction_operational_v1_shadow";
const ENGINE_VERSION = Deno.env.get("SANAD_SHADOW_ENGINE_VERSION") ||
  "operational-shadow-v1";
const REQUEST_TIMEOUT_MS = Math.max(
  5_000,
  Math.min(30_000, Number(Deno.env.get("SANAD_SHADOW_TIMEOUT_MS") || "15000") || 15_000),
);

const IDENTIFIER_TYPES = [
  "account_number",
  "wallet_number",
  "customer_line",
  "merchant_point",
  "terminal_number",
  "phone_number",
  "national_id",
  "passport_number",
  "unique_account_name",
  "iban",
  "card_number",
  "other",
  "unknown_identifier",
];

const IDENTIFIER_SCHEMA = {
  type: "OBJECT",
  properties: {
    type: { type: "STRING", enum: IDENTIFIER_TYPES },
    value: { type: "STRING" },
    sourceLabel: { type: "STRING", nullable: true },
    isPrimaryRoutingIdentifier: { type: "BOOLEAN" },
    confidence: { type: "NUMBER" },
  },
  required: [
    "type",
    "value",
    "sourceLabel",
    "isPrimaryRoutingIdentifier",
    "confidence",
  ],
};

const PARTY_SCHEMA = {
  type: "OBJECT",
  properties: {
    role: {
      type: "STRING",
      enum: ["sender", "receiver", "credited_party", "debited_party", "beneficiary"],
    },
    name: { type: "STRING", nullable: true },
    identifiers: { type: "ARRAY", items: IDENTIFIER_SCHEMA },
  },
  required: ["role", "name", "identifiers"],
};

const CORE_SCHEMA = {
  type: "OBJECT",
  properties: {
    schemaVersion: { type: "INTEGER", enum: [2] },
    financialEntity: { type: "STRING" },
    financialEntityCode: { type: "STRING" },
    templateCode: { type: "STRING" },
    templateVersion: { type: "INTEGER" },
    transactionType: {
      type: "STRING",
      enum: ["deposit", "withdrawal", "transfer", "payment", "credit_notice", "account_transfer", "unknown"],
    },
    transactionDirection: {
      type: "STRING",
      enum: ["incoming", "outgoing", "internal", "unknown"],
    },
    amount: { type: "NUMBER", nullable: true },
    feeAmount: { type: "NUMBER", nullable: true },
    currency: { type: "STRING", enum: ["YER", "SAR", "USD"], nullable: true },
    documentReference: { type: "STRING", nullable: true },
    transferReference: { type: "STRING", nullable: true },
    transactionDatetime: { type: "STRING", nullable: true },
    merchantName: { type: "STRING", nullable: true },
    merchantPoint: { type: "STRING", nullable: true },
    parties: { type: "ARRAY", items: PARTY_SCHEMA },
    confidence: { type: "NUMBER" },
    fieldConfidence: { type: "OBJECT" },
    warnings: { type: "ARRAY", items: { type: "STRING" } },
    reviewRequired: { type: "BOOLEAN" },
  },
  required: [
    "schemaVersion",
    "financialEntity",
    "financialEntityCode",
    "templateCode",
    "templateVersion",
    "transactionType",
    "transactionDirection",
    "amount",
    "feeAmount",
    "currency",
    "documentReference",
    "transferReference",
    "transactionDatetime",
    "merchantName",
    "merchantPoint",
    "parties",
    "confidence",
    "fieldConfidence",
    "warnings",
    "reviewRequired",
  ],
};

const JSON_HEADERS = { "content-type": "application/json", "cache-control": "no-store" };
const SERVICE_HEADERS = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  "content-type": "application/json",
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204 });
  if (request.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
  if (request.headers.get("x-sanad-internal-key") !== INTERNAL_KEY) {
    return json({ ok: false, error: "unauthorized" }, 401);
  }

  let runId: string | null = null;
  try {
    const body = await request.json() as JsonRecord;
    const operationId = stringValue(body.operation_id);
    const attempt = Math.max(1, Math.min(10, Number(body.attempt ?? 1) || 1));
    if (!operationId) return json({ ok: false, error: "operation_id_required" }, 400);

    const operation = await getOperation(operationId);
    if (!operation) return json({ ok: false, error: "operation_not_found" }, 404);
    if (!operation.file_path || !operation.file_mime_type) {
      return json({ ok: false, error: "operation_file_missing" }, 422);
    }

    const prompt = await getPrompt();
    const run = await createOrResetRun({
      operationId,
      attempt,
      promptVersion: prompt.version,
      mimeType: operation.file_mime_type,
    });
    runId = run.id;

    const bytes = await downloadOperationFile(operation);
    const started = performance.now();
    const gemini = await analyzeWithGemini({
      prompt: prompt.text,
      mimeType: operation.file_mime_type,
      bytes,
    });
    const latencyMs = Math.round(performance.now() - started);

    const normalized = normalizeShadowOutput(gemini.output);
    const productionSnapshot = buildProductionSnapshot(operation);
    const comparison = compareOutputs(productionSnapshot, normalized);

    await updateRun(run.id, {
      status: "completed",
      completed_at: new Date().toISOString(),
      latency_ms: latencyMs,
      shadow_output: gemini.output,
      normalized_output: normalized,
      production_snapshot: productionSnapshot,
      comparison,
      routing_decision: null,
      error_code: null,
      error_message: null,
    });

    return json({
      ok: true,
      run_id: run.id,
      operation_id: operationId,
      engine_version: ENGINE_VERSION,
      model: MODEL,
      latency_ms: latencyMs,
      exact_critical_match: comparison.exactCriticalMatch,
      critical_accuracy: comparison.criticalAccuracy,
      usage: gemini.usage,
    });
  } catch (error) {
    const failure = classifyError(error);
    if (runId) {
      await updateRun(runId, {
        status: "failed",
        completed_at: new Date().toISOString(),
        error_code: failure.code,
        error_message: failure.message.slice(0, 1000),
      }).catch(() => undefined);
    }
    return json({ ok: false, error: failure.code }, failure.status);
  }
});

async function getOperation(id: string): Promise<OperationRow | null> {
  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/operations?select=id,file_bucket,file_path,file_mime_type,financial_entity,transaction_type,transaction_direction,amount,currency,receiver_name,receiver_account,receiver_identifier_type,reference_number,transaction_datetime,structured_data&id=eq.${encodeURIComponent(id)}&limit=1`,
    { headers: SERVICE_HEADERS },
  );
  if (!response.ok) throw new Error(`operation_read_${response.status}`);
  const rows = await response.json() as OperationRow[];
  return rows[0] ?? null;
}

async function getPrompt(): Promise<{ text: string; version: number }> {
  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/ai_prompts?select=prompt_text,version&prompt_key=eq.${encodeURIComponent(PROMPT_KEY)}&limit=1`,
    { headers: SERVICE_HEADERS },
  );
  if (!response.ok) throw new Error(`prompt_read_${response.status}`);
  const rows = await response.json() as Array<{ prompt_text: string; version: number }>;
  const row = rows[0];
  if (!row?.prompt_text) throw new Error("shadow_prompt_missing");
  return { text: row.prompt_text, version: Number(row.version) || 1 };
}

async function createOrResetRun(input: {
  operationId: string;
  attempt: number;
  promptVersion: number;
  mimeType: string;
}): Promise<{ id: string }> {
  const payload = {
    operation_id: input.operationId,
    attempt: input.attempt,
    engine_version: ENGINE_VERSION,
    model: MODEL,
    prompt_key: PROMPT_KEY,
    prompt_version: input.promptVersion,
    schema_version: 2,
    status: "running",
    started_at: new Date().toISOString(),
    completed_at: null,
    latency_ms: null,
    input_mime_type: input.mimeType,
    shadow_output: null,
    normalized_output: null,
    production_snapshot: null,
    comparison: null,
    routing_decision: null,
    error_code: null,
    error_message: null,
    updated_at: new Date().toISOString(),
  };
  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/operation_analysis_shadow_runs?on_conflict=operation_id,engine_version,attempt`,
    {
      method: "POST",
      headers: {
        ...SERVICE_HEADERS,
        Prefer: "resolution=merge-duplicates,return=representation",
      },
      body: JSON.stringify(payload),
    },
  );
  if (!response.ok) throw new Error(`shadow_run_upsert_${response.status}`);
  const rows = await response.json() as Array<{ id: string }>;
  if (!rows[0]?.id) throw new Error("shadow_run_id_missing");
  return rows[0];
}

async function updateRun(id: string, patch: JsonRecord): Promise<void> {
  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/operation_analysis_shadow_runs?id=eq.${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      headers: SERVICE_HEADERS,
      body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }),
    },
  );
  if (!response.ok) throw new Error(`shadow_run_update_${response.status}`);
}

async function downloadOperationFile(operation: OperationRow): Promise<Uint8Array> {
  const bucket = operation.file_bucket || "operation-files";
  const encodedPath = encodeURIComponent(operation.file_path || "").replaceAll("%2F", "/");
  const response = await fetch(
    `${SUPABASE_URL}/storage/v1/object/${encodeURIComponent(bucket)}/${encodedPath}`,
    { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } },
  );
  if (!response.ok) throw new Error(`operation_file_download_${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}

async function analyzeWithGemini(input: {
  prompt: string;
  mimeType: string;
  bytes: Uint8Array;
}): Promise<{ output: JsonRecord; usage: JsonRecord }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(MODEL)}:generateContent`,
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": GEMINI_API_KEY },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [{
            role: "user",
            parts: [
              { text: input.prompt },
              {
                inlineData: {
                  mimeType: input.mimeType,
                  data: bytesToBase64(input.bytes),
                },
              },
            ],
          }],
          generationConfig: {
            maxOutputTokens: 1024,
            responseMimeType: "application/json",
            responseSchema: CORE_SCHEMA,
            thinkingConfig: { thinkingLevel: "minimal" },
          },
        }),
      },
    );
    const body = await response.json() as JsonRecord;
    if (!response.ok) throw new Error(`gemini_http_${response.status}`);
    const text = responseText(body);
    if (!text) throw new Error("gemini_response_text_missing");
    let output: JsonRecord;
    try {
      output = JSON.parse(text) as JsonRecord;
    } catch {
      throw new Error("gemini_invalid_json");
    }
    return { output, usage: (body.usageMetadata as JsonRecord | undefined) ?? {} };
  } finally {
    clearTimeout(timeout);
  }
}

function buildProductionSnapshot(operation: OperationRow): JsonRecord {
  const structured = operation.structured_data ?? {};
  return {
    financialEntity: operation.financial_entity,
    financialEntityCode: stringValue(structured.financial_entity_code),
    transactionType: operation.transaction_type,
    transactionDirection: operation.transaction_direction,
    amount: operation.amount,
    currency: operation.currency,
    receiverName: operation.receiver_name,
    receiverIdentifierType: operation.receiver_identifier_type,
    receiverIdentifierValue: operation.receiver_account,
    referenceNumber: operation.reference_number,
    transactionDatetime: operation.transaction_datetime,
  };
}

function normalizeShadowOutput(output: JsonRecord): JsonRecord {
  const parties = Array.isArray(output.parties) ? output.parties as JsonRecord[] : [];
  const receiver = parties.find((party) =>
    ["receiver", "beneficiary", "credited_party"].includes(stringValue(party.role) || "")
  );
  const identifiers = Array.isArray(receiver?.identifiers)
    ? receiver?.identifiers as JsonRecord[]
    : [];
  const primary = identifiers.find((identifier) => identifier.isPrimaryRoutingIdentifier === true) ??
    identifiers[0];
  return {
    financialEntity: output.financialEntity ?? null,
    financialEntityCode: output.financialEntityCode ?? null,
    transactionType: output.transactionType ?? null,
    transactionDirection: output.transactionDirection ?? null,
    amount: output.amount ?? null,
    currency: output.currency ?? null,
    receiverName: receiver?.name ?? null,
    receiverIdentifierType: primary?.type ?? null,
    receiverIdentifierValue: primary?.value ?? null,
    referenceNumber: output.transferReference ?? output.documentReference ?? null,
    transactionDatetime: output.transactionDatetime ?? null,
    confidence: output.confidence ?? null,
    reviewRequired: output.reviewRequired ?? null,
    warnings: output.warnings ?? [],
  };
}

function compareOutputs(production: JsonRecord, shadow: JsonRecord) {
  const fields = [
    "financialEntity",
    "financialEntityCode",
    "transactionType",
    "transactionDirection",
    "amount",
    "currency",
    "receiverName",
    "receiverIdentifierType",
    "receiverIdentifierValue",
    "referenceNumber",
    "transactionDatetime",
  ];
  const details = fields.map((field) => {
    const left = production[field];
    const right = shadow[field];
    const status = compareValue(field, left, right);
    return { field, status, production: left ?? null, shadow: right ?? null };
  });
  const comparable = details.filter((item) => item.status !== "missing_both");
  const matches = comparable.filter((item) => item.status === "match").length;
  const accuracy = comparable.length ? matches / comparable.length : 0;
  return {
    criticalMatchCount: matches,
    criticalFieldCount: comparable.length,
    criticalAccuracy: Number(accuracy.toFixed(4)),
    exactCriticalMatch: comparable.length > 0 && matches === comparable.length,
    fields: details,
  };
}

function compareValue(field: string, left: unknown, right: unknown): string {
  if (isMissing(left) && isMissing(right)) return "missing_both";
  if (isMissing(left)) return "missing_production";
  if (isMissing(right)) return "missing_shadow";
  if (field === "amount") return Number(left) === Number(right) ? "match" : "mismatch";
  if (field === "transactionDatetime") {
    const a = String(left).slice(0, 16);
    const b = String(right).slice(0, 16);
    return a === b ? "match" : "mismatch";
  }
  if (field === "receiverIdentifierValue") {
    const type = String(right ? "" : "");
    void type;
    return normalizeDigits(left) === normalizeDigits(right) ? "match" : "mismatch";
  }
  return normalizeText(left) === normalizeText(right) ? "match" : "mismatch";
}

function responseText(body: JsonRecord): string | null {
  const candidates = Array.isArray(body.candidates) ? body.candidates as JsonRecord[] : [];
  const content = candidates[0]?.content as JsonRecord | undefined;
  const parts = Array.isArray(content?.parts) ? content?.parts as JsonRecord[] : [];
  const part = parts.find((item) => typeof item.text === "string");
  return typeof part?.text === "string" ? part.text : null;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

function normalizeDigits(value: unknown): string {
  return String(value ?? "")
    .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
    .replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)))
    .replace(/\D/g, "");
}

function normalizeText(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isMissing(value: unknown): boolean {
  return value === null || value === undefined || value === "";
}

function classifyError(error: unknown): { code: string; message: string; status: number } {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("AbortError")) return { code: "shadow_timeout", message, status: 504 };
  if (message.includes("operation_not_found")) return { code: "operation_not_found", message, status: 404 };
  if (message.startsWith("gemini_")) return { code: message, message, status: 502 };
  return { code: "shadow_internal_error", message, status: 500 };
}

function mustGetEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`missing_env_${name}`);
  return value;
}

function json(body: JsonRecord, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

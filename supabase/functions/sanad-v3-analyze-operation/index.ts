// SANAD Verify v3 - Analyze Uploaded Operation
// Supabase Edge Function: sanad-v3-analyze-operation
//
// Required secrets:
// - SUPABASE_URL
// - SUPABASE_SERVICE_ROLE_KEY
// - GEMINI_API_KEY
// - SANAD_INTERNAL_API_KEY
//
// Optional secrets:
// - GEMINI_MODEL = gemini-2.5-flash
// - SANAD_PROMPT_KEY = sanad_operation_extraction_v1
// - GEMINI_MAX_ATTEMPTS = 3

type JsonRecord = Record<string, unknown>;

const SUPABASE_URL = mustGetEnv("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = mustGetEnv("SUPABASE_SERVICE_ROLE_KEY");
const GEMINI_API_KEY = mustGetEnv("GEMINI_API_KEY");
const SANAD_INTERNAL_API_KEY = mustGetEnv("SANAD_INTERNAL_API_KEY");

const GEMINI_MODEL = Deno.env.get("GEMINI_MODEL") || "gemini-2.5-flash";
const SANAD_PROMPT_KEY =
  Deno.env.get("SANAD_PROMPT_KEY") || "sanad_operation_extraction_v1";

const GEMINI_MAX_ATTEMPTS = Number(
  Deno.env.get("GEMINI_MAX_ATTEMPTS") || "3",
);

const FUNCTION_NAME = "sanad-v3-analyze-operation";
const DEFAULT_BUCKET = "operation-files";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-sanad-internal-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function mustGetEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json; charset=utf-8",
      "Connection": "keep-alive",
    },
  });
}

function truncateText(value: unknown, max = 1200): string {
  const text = String(value ?? "");
  return text.length > max ? text.slice(0, max) + "…" : text;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function retryDelayMs(attempt: number): number {
  const delays = [0, 1500, 4000, 8000];
  return delays[Math.min(attempt - 1, delays.length - 1)] ?? 4000;
}

function isRetryableGeminiStatus(status: number): boolean {
  return [429, 500, 502, 503, 504].includes(status);
}

function toLatinDigits(value: unknown): string | null {
  if (value === undefined || value === null) return null;

  return String(value)
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)));
}

function cleanJsonText(text: string): string {
  return String(text || "")
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();
}

function cleanTextOrNull(value: unknown): string | null {
  if (value === undefined || value === null) return null;

  const text = String(value).trim();

  if (!text) return null;
  if (text.toLowerCase() === "null") return null;
  if (text === "—" || text === "-") return null;

  return text;
}

function normalizeBoolean(value: unknown, defaultValue = false): boolean {
  if (value === true) return true;
  if (value === false) return false;

  if (typeof value === "string") {
    const lower = value.trim().toLowerCase();
    if (["true", "yes", "1"].includes(lower)) return true;
    if (["false", "no", "0"].includes(lower)) return false;
  }

  return defaultValue;
}

function normalizeArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((v) => cleanTextOrNull(v))
      .filter((v): v is string => Boolean(v));
  }

  if (value === undefined || value === null || value === "") return [];

  const text = cleanTextOrNull(value);
  return text ? [text] : [];
}

function normalizeConfidence(value: unknown): number {
  const latin = toLatinDigits(value) ?? String(value ?? 0);
  const n = Number(latin);

  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function parseAmount(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;

  const latin = toLatinDigits(value) ?? String(value);
  const cleaned = latin
    .replace(/,/g, "")
    .replace(/[^\d.]/g, "");

  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function cleanNumberLikeText(value: unknown): string | null {
  const text = cleanTextOrNull(value);
  if (!text) return null;

  const latin = toLatinDigits(text) ?? text;

  return latin
    .replace(/[^\dA-Za-z\-+._/]/g, "")
    .trim() || null;
}

function normalizeCurrency(value: unknown): "YER" | "SAR" | "USD" | null {
  const text = cleanTextOrNull(value);
  if (!text) return null;

  const upper = (toLatinDigits(text) ?? text).toUpperCase();

  if (
    upper.includes("YER") ||
    upper.includes("YEMEN") ||
    upper.includes("يمني") ||
    upper.includes("ريال يمني")
  ) {
    return "YER";
  }

  if (
    upper.includes("SAR") ||
    upper.includes("SAUDI") ||
    upper.includes("سعودي") ||
    upper.includes("ريال سعودي")
  ) {
    return "SAR";
  }

  if (
    upper.includes("USD") ||
    upper.includes("DOLLAR") ||
    upper.includes("دولار")
  ) {
    return "USD";
  }

  if (upper === "YER" || upper === "SAR" || upper === "USD") {
    return upper;
  }

  return null;
}

function normalizeFinancialEntity(value: unknown): string {
  const allowed = new Set([
    "العمقي موبايل",
    "البسيري موبايل",
    "محفظة بي كاش",
    "الكريمي سعودي",
    "الكريمي يمني",
    "الكريمي حاسب",
    "بن دول صرافة",
    "بن دول باي",
    "أم فلوس",
    "عدن كاش",
    "القطيبي",
    "المحضار",
    "جهة أخرى",
    "unknown",
  ]);

  const text = cleanTextOrNull(value);
  if (!text) return "unknown";

  if (allowed.has(text)) return text;

  return "جهة أخرى";
}

function normalizeTransactionType(value: unknown): string | null {
  const text = cleanTextOrNull(value);
  if (!text) return null;

  const lower = text.toLowerCase();

  const allowed = new Set([
    "transfer",
    "deposit",
    "withdrawal",
    "payment",
    "unknown",
  ]);

  if (allowed.has(lower)) return lower;

  if (text.includes("تحويل") || text.includes("حوالة")) return "transfer";
  if (text.includes("إيداع") || text.includes("ايداع")) return "deposit";
  if (text.includes("سحب")) return "withdrawal";
  if (text.includes("دفع") || text.includes("سداد")) return "payment";

  return "unknown";
}

function normalizeTransactionDatetime(value: unknown): string | null {
  const text = cleanTextOrNull(toLatinDigits(value));
  if (!text) return null;

  // Postgres timestamptz accepts ISO-like strings.
  // Avoid patch failure by only keeping date-like values.
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text;

  return null;
}

function bytesToBase64(bytes: Uint8Array): string {
  const chunkSize = 0x8000;
  let binary = "";

  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}

function extractGeminiText(gemini: any): string {
  const parts = gemini?.candidates?.[0]?.content?.parts;

  if (Array.isArray(parts)) {
    const text = parts
      .map((p: any) => p?.text || "")
      .join("\n")
      .trim();

    if (text) return text;
  }

  if (typeof gemini?.text === "string") return gemini.text;

  return "";
}

function parseGeminiJson(text: string): any {
  const cleaned = cleanJsonText(text);

  try {
    return JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) {
      throw new Error("gemini_json_parse_failed");
    }
    return JSON.parse(match[0]);
  }
}

function buildFallbackSanadPrompt(): string {
  return `
أنت محرك استخراج وتحليل إشعارات مالية لمنصة سند.

مهمتك:
تحليل الملف المرفق، وتحديد هل يحتوي على عملية مالية حقيقية أم لا، ثم استخراج البيانات الظاهرة فقط بصيغة JSON صارمة.

القواعد الصارمة العامة:
- أعد JSON فقط دون Markdown ودون شرح.
- لا تخترع أي قيمة غير ظاهرة.
- لا تستنتج رقم حساب أو رقم مرجع أو اسم من خارج النص/الصورة.
- أي حقل غير موجود اجعله null.
- جميع الأرقام المستخرجة يجب أن تُكتب بأرقام لاتينية 0-9 وباتجاه LTR.
- amount رقم فقط دون فواصل ودون عملة.
- currency يجب أن تكون واحدة فقط من: YER أو SAR أو USD أو null.
- confidence_score رقم بين 0 و 1.
- ai_flags مصفوفة نصية قصيرة.
- missing_fields مصفوفة بأسماء الحقول المهمة غير الموجودة.
- visual_integrity_notes ملاحظات عربية قصيرة.
- sanad_attention_points نقاط عربية قصيرة.

قائمة الجهات المالية المعتمدة في سند:
[
 "العمقي موبايل",
 "البسيري موبايل",
 "محفظة بي كاش",
 "الكريمي سعودي",
 "الكريمي يمني",
 "الكريمي حاسب",
 "بن دول صرافة",
 "بن دول باي",
 "أم فلوس",
 "عدن كاش",
 "القطيبي",
 "المحضار",
 "جهة أخرى",
 "unknown"
]

transaction_type يجب أن تكون واحدة من:
transfer | deposit | withdrawal | payment | unknown | null

أعد JSON مطابقًا لهذا الشكل:
{
  "is_financial_document": true,
  "non_financial_reason": null,
  "summary": "ملخص عربي واضح ومفيد.",
  "financial_entity": "unknown",
  "financial_entity_raw": null,
  "transaction_type": "transfer",
  "amount": null,
  "currency": null,
  "sender_name": null,
  "receiver_name": null,
  "sender_account": null,
  "receiver_account": null,
  "reference_number": null,
  "transaction_datetime": null,
  "confidence_score": 0.0,
  "possible_fraud": false,
  "ai_flags": [],
  "missing_fields": [],
  "visual_integrity_notes": [],
  "sanad_attention_points": []
}
`;
}

function normalizeExtracted(extracted: any) {
  const isFinancialDocument = normalizeBoolean(
    extracted?.is_financial_document,
    true,
  );

  const normalized = {
    is_financial_document: isFinancialDocument,
    non_financial_reason: cleanTextOrNull(extracted?.non_financial_reason),

    summary: cleanTextOrNull(extracted?.summary),

    financial_entity: isFinancialDocument
      ? normalizeFinancialEntity(extracted?.financial_entity)
      : null,

    financial_entity_raw: cleanTextOrNull(extracted?.financial_entity_raw),

    transaction_type: isFinancialDocument
      ? normalizeTransactionType(extracted?.transaction_type)
      : null,

    amount: isFinancialDocument ? parseAmount(extracted?.amount) : null,

    currency: isFinancialDocument
      ? normalizeCurrency(extracted?.currency)
      : null,

    sender_name: isFinancialDocument
      ? cleanTextOrNull(extracted?.sender_name)
      : null,

    receiver_name: isFinancialDocument
      ? cleanTextOrNull(extracted?.receiver_name)
      : null,

    sender_account: isFinancialDocument
      ? cleanNumberLikeText(extracted?.sender_account)
      : null,

    receiver_account: isFinancialDocument
      ? cleanNumberLikeText(extracted?.receiver_account)
      : null,

    reference_number: isFinancialDocument
      ? cleanNumberLikeText(extracted?.reference_number)
      : null,

    transaction_datetime: isFinancialDocument
      ? normalizeTransactionDatetime(extracted?.transaction_datetime)
      : null,

    confidence_score: normalizeConfidence(extracted?.confidence_score),
    possible_fraud: normalizeBoolean(extracted?.possible_fraud, false),

    ai_flags: normalizeArray(extracted?.ai_flags),
    missing_fields: normalizeArray(extracted?.missing_fields),
    visual_integrity_notes: normalizeArray(extracted?.visual_integrity_notes),
    sanad_attention_points: normalizeArray(extracted?.sanad_attention_points),
  };

  if (normalized.is_financial_document) {
    const requiredFields = [
      "financial_entity",
      "transaction_type",
      "amount",
      "currency",
      "reference_number",
      "transaction_datetime",
    ];

    for (const field of requiredFields) {
      const value = (normalized as any)[field];

      if (
        value === null ||
        value === undefined ||
        value === "" ||
        value === "unknown"
      ) {
        if (!normalized.missing_fields.includes(field)) {
          normalized.missing_fields.push(field);
        }
      }
    }
  }

  if (!normalized.is_financial_document) {
    if (!normalized.ai_flags.includes("non_financial_document")) {
      normalized.ai_flags.push("non_financial_document");
    }

    if (!normalized.summary && normalized.non_financial_reason) {
      normalized.summary = normalized.non_financial_reason;
    }

    if (!normalized.summary) {
      normalized.summary = "الملف لا يحتوي على عملية مالية واضحة.";
    }
  }

  if (normalized.financial_entity === "unknown") {
    if (!normalized.ai_flags.includes("financial_entity_unknown")) {
      normalized.ai_flags.push("financial_entity_unknown");
    }
  }

  if (normalized.financial_entity === "جهة أخرى") {
    if (!normalized.ai_flags.includes("financial_entity_other")) {
      normalized.ai_flags.push("financial_entity_other");
    }
  }

  if (
    normalized.reference_number &&
    normalized.reference_number.toUpperCase().includes("FT")
  ) {
    if (!normalized.ai_flags.includes("kuraimi_like_reference")) {
      normalized.ai_flags.push("kuraimi_like_reference");
    }
  }

  if (
    normalized.reference_number &&
    /^8-\d+/.test(normalized.reference_number)
  ) {
    if (!normalized.ai_flags.includes("alomqy_like_reference")) {
      normalized.ai_flags.push("alomqy_like_reference");
    }
  }

  return normalized;
}

function supabaseHeaders(extra: HeadersInit = {}): HeadersInit {
  return {
    "apikey": SUPABASE_SERVICE_ROLE_KEY,
    "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    ...extra,
  };
}

async function supabaseJson<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    ...init,
    headers: {
      ...supabaseHeaders(init.headers || {}),
    },
  });

  const text = await res.text();

  if (!res.ok) {
    throw new Error(
      `supabase_request_failed ${res.status}: ${truncateText(text, 800)}`,
    );
  }

  if (!text) return null as T;

  return JSON.parse(text) as T;
}

async function getActivePrompt(): Promise<{
  promptText: string;
  promptSource: "database" | "fallback";
  promptKey: string;
  promptVersion: number | null;
}> {
  try {
    const rows = await supabaseJson<any[]>(
      `/rest/v1/ai_prompts?select=prompt_text,prompt_key,version&prompt_key=eq.${encodeURIComponent(SANAD_PROMPT_KEY)}&is_active=eq.true&order=version.desc&limit=1`,
      {
        method: "GET",
        headers: {
          "Accept": "application/json",
        },
      },
    );

    const row = Array.isArray(rows) ? rows[0] : null;
    const promptText = row?.prompt_text;

    if (typeof promptText === "string" && promptText.trim().length > 500) {
      return {
        promptText,
        promptSource: "database",
        promptKey: row.prompt_key || SANAD_PROMPT_KEY,
        promptVersion: Number.isFinite(Number(row.version))
          ? Number(row.version)
          : null,
      };
    }
  } catch {
    // Fallback silently to built-in prompt.
  }

  return {
    promptText: buildFallbackSanadPrompt(),
    promptSource: "fallback",
    promptKey: SANAD_PROMPT_KEY,
    promptVersion: null,
  };
}

async function getOperation(operationId: string): Promise<any | null> {
  const rows = await supabaseJson<any[]>(
    `/rest/v1/operations?select=*&id=eq.${encodeURIComponent(operationId)}&limit=1`,
    {
      method: "GET",
      headers: {
        "Accept": "application/json",
      },
    },
  );

  return Array.isArray(rows) ? rows[0] ?? null : null;
}

async function patchOperation(
  operationId: string,
  patch: JsonRecord,
): Promise<any[]> {
  return await supabaseJson<any[]>(
    `/rest/v1/operations?id=eq.${encodeURIComponent(operationId)}`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "Prefer": "return=representation",
      },
      body: JSON.stringify(patch),
    },
  );
}

async function markOperationRunning(operationId: string): Promise<any[]> {
  return await supabaseJson<any[]>(
    `/rest/v1/operations?id=eq.${encodeURIComponent(operationId)}&ai_status=not.in.(running,completed)`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "Prefer": "return=representation",
      },
      body: JSON.stringify({
        ai_status: "running",
        ai_error: null,
      }),
    },
  );
}

async function insertEvent(
  operationId: string,
  eventType: "ai_started" | "ai_completed" | "ai_failed",
  metadata: JsonRecord,
): Promise<void> {
  await supabaseJson<any[]>(
    `/rest/v1/operation_events`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
      },
      body: JSON.stringify({
        operation_id: operationId,
        event_type: eventType,
        metadata,
        source: "edge-function",
      }),
    },
  );
}

async function downloadStorageObject(
  bucket: string,
  filePath: string,
): Promise<Uint8Array> {
  const encodedPath = encodeURIComponent(filePath).replace(/%2F/g, "/");

  const res = await fetch(
    `${SUPABASE_URL}/storage/v1/object/${bucket}/${encodedPath}`,
    {
      method: "GET",
      headers: supabaseHeaders(),
    },
  );

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `storage_download_failed ${res.status}: ${truncateText(text, 800)}`,
    );
  }

  return new Uint8Array(await res.arrayBuffer());
}

async function callGemini(
  mimeType: string,
  base64: string,
  promptText: string,
): Promise<{ gemini: any; rawText: string; extracted: any; attempts: number }> {
  const payload = {
    contents: [
      {
        role: "user",
        parts: [
          {
            text: promptText,
          },
          {
            inline_data: {
              mime_type: mimeType,
              data: base64,
            },
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0,
      responseMimeType: "application/json",
    },
  };

  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`;

  let lastError = "gemini_request_failed";

  for (let attempt = 1; attempt <= GEMINI_MAX_ATTEMPTS; attempt++) {
    const delay = retryDelayMs(attempt);

    if (delay > 0) {
      await sleep(delay);
    }

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const responseText = await res.text();

    if (!res.ok) {
      lastError =
        `gemini_request_failed ${res.status} attempt ${attempt}/${GEMINI_MAX_ATTEMPTS}: ${truncateText(responseText, 1000)}`;

      if (
        attempt < GEMINI_MAX_ATTEMPTS &&
        isRetryableGeminiStatus(res.status)
      ) {
        continue;
      }

      throw new Error(lastError);
    }

    const gemini = JSON.parse(responseText);
    const rawText = extractGeminiText(gemini);

    if (!rawText) {
      lastError =
        `empty_gemini_response attempt ${attempt}/${GEMINI_MAX_ATTEMPTS}: ${truncateText(responseText, 1000)}`;

      if (attempt < GEMINI_MAX_ATTEMPTS) {
        continue;
      }

      throw new Error(lastError);
    }

    const extracted = parseGeminiJson(rawText);

    return {
      gemini,
      rawText,
      extracted,
      attempts: attempt,
    };
  }

  throw new Error(lastError);
}

Deno.serve(async (req: Request) => {
  let operationId: string | null = null;
  let operationStarted = false;

  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: CORS_HEADERS,
    });
  }

  if (req.method !== "POST") {
    return jsonResponse(
      {
        ok: false,
        error: "method_not_allowed",
      },
      405,
    );
  }

  const internalKey = req.headers.get("x-sanad-internal-key");

  if (!internalKey || internalKey !== SANAD_INTERNAL_API_KEY) {
    return jsonResponse(
      {
        ok: false,
        error: "unauthorized",
      },
      401,
    );
  }

  try {
    const body = await req.json().catch(() => ({}));

    operationId = cleanTextOrNull(
      (body as any)?.operation_id ?? (body as any)?.id,
    );

    if (!operationId) {
      return jsonResponse(
        {
          ok: false,
          error: "missing_operation_id",
          message: "operation_id is required",
        },
        400,
      );
    }

    const operation = await getOperation(operationId);

    if (!operation?.id) {
      return jsonResponse(
        {
          ok: false,
          error: "operation_not_found",
          operation_id: operationId,
        },
        404,
      );
    }

    if (!operation.file_path) {
      return jsonResponse(
        {
          ok: false,
          error: "operation_missing_file_path",
          operation_id: operation.id,
        },
        400,
      );
    }

    if (operation.original_file_status !== "stored") {
      return jsonResponse(
        {
          ok: false,
          error: "original_file_not_stored",
          operation_id: operation.id,
          original_file_status: operation.original_file_status,
        },
        400,
      );
    }

    if (operation.ai_status === "completed") {
      return jsonResponse(
        {
          ok: true,
          skipped: true,
          reason: "already_completed",
          operation_id: operation.id,
          public_token: operation.public_token,
          ai_status: operation.ai_status,
        },
        200,
      );
    }

    if (operation.ai_status === "running") {
      return jsonResponse(
        {
          ok: true,
          skipped: true,
          reason: "already_running",
          operation_id: operation.id,
          public_token: operation.public_token,
          ai_status: operation.ai_status,
        },
        202,
      );
    }

    const runningRows = await markOperationRunning(operation.id);

    if (!Array.isArray(runningRows) || runningRows.length === 0) {
      const latest = await getOperation(operation.id);

      return jsonResponse(
        {
          ok: true,
          skipped: true,
          reason: "status_changed_before_lock",
          operation_id: operation.id,
          public_token: operation.public_token,
          ai_status: latest?.ai_status ?? null,
        },
        latest?.ai_status === "running" ? 202 : 200,
      );
    }

    operationStarted = true;

    const promptInfo = await getActivePrompt();

    await insertEvent(operation.id, "ai_started", {
      function: FUNCTION_NAME,
      model: GEMINI_MODEL,
      source: "edge-function",
      prompt_key: promptInfo.promptKey,
      prompt_version: promptInfo.promptVersion,
      prompt_source: promptInfo.promptSource,
      prompt_length: promptInfo.promptText.length,
      gemini_max_attempts: GEMINI_MAX_ATTEMPTS,
      file_bucket: operation.file_bucket || DEFAULT_BUCKET,
      file_path: operation.file_path,
    });

    const bucket = operation.file_bucket || DEFAULT_BUCKET;
    const filePath = operation.file_path;
    const mimeType = operation.file_mime_type || "application/octet-stream";

    const fileBytes = await downloadStorageObject(bucket, filePath);
    const base64 = bytesToBase64(fileBytes);

    const { gemini, rawText, extracted, attempts } = await callGemini(
      mimeType,
      base64,
      promptInfo.promptText,
    );

    const ai = extracted;
    const normalized = normalizeExtracted(ai);

    await patchOperation(operation.id, {
      status: operation.status === "verified" ? "verified" : "ready",
      ai_status: "completed",
      ai_model: GEMINI_MODEL,
      ai_error: null,

      summary: normalized.summary,
      structured_data: normalized,

      raw_ai_json: {
        extracted: ai,
        normalized,
        raw_gemini_text: rawText,
        model: GEMINI_MODEL,
        prompt_key: promptInfo.promptKey,
        prompt_version: promptInfo.promptVersion,
        prompt_source: promptInfo.promptSource,
        prompt_length: promptInfo.promptText.length,
        gemini_attempts: attempts,
        gemini_response: gemini,
      },

      financial_entity: normalized.financial_entity,
      transaction_type: normalized.transaction_type,
      amount: normalized.amount,
      currency: normalized.currency,
      reference_number: normalized.reference_number,
      transaction_datetime: normalized.transaction_datetime,

      confidence_score: normalized.confidence_score,
      ai_confidence_score: normalized.confidence_score,
      possible_fraud: normalized.possible_fraud,

      sanad_warnings: normalized.ai_flags,
      missing_fields: normalized.missing_fields,
      visual_integrity_notes: normalized.visual_integrity_notes,
      sanad_attention_points: normalized.sanad_attention_points,
    });

    await insertEvent(operation.id, "ai_completed", {
      function: FUNCTION_NAME,
      model: GEMINI_MODEL,
      prompt_key: promptInfo.promptKey,
      prompt_version: promptInfo.promptVersion,
      prompt_source: promptInfo.promptSource,
      gemini_attempts: attempts,
      confidence_score: normalized.confidence_score,
      summary: normalized.summary,
      financial_entity: normalized.financial_entity,
      amount: normalized.amount,
      currency: normalized.currency,
      reference_number: normalized.reference_number,
    });

    return jsonResponse(
      {
        ok: true,
        operation_id: operation.id,
        public_token: operation.public_token,
        ai_status: "completed",
        prompt: {
          key: promptInfo.promptKey,
          version: promptInfo.promptVersion,
          source: promptInfo.promptSource,
        },
        gemini_attempts: attempts,
        summary: normalized.summary,
        normalized,
      },
      200,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (operationId && operationStarted) {
      try {
        await patchOperation(operationId, {
          ai_status: "failed",
          ai_error: truncateText(message, 1500),
        });

        await insertEvent(operationId, "ai_failed", {
          function: FUNCTION_NAME,
          source: "edge-function",
          error: truncateText(message, 1500),
          gemini_max_attempts: GEMINI_MAX_ATTEMPTS,
        });
      } catch {
        // Best-effort failure logging only.
      }
    }

    return jsonResponse(
      {
        ok: false,
        operation_id: operationId,
        error: "analysis_failed",
        message: truncateText(message, 1500),
      },
      500,
    );
  }
});
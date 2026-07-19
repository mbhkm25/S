// SANAD Pro Payment Verification
// Supabase Edge Function: sanad-pro-payment-verify
//
// Required secrets:
// - SUPABASE_URL
// - SUPABASE_SERVICE_ROLE_KEY
// - GEMINI_API_KEY
// - SANAD_INTERNAL_API_KEY
// - META_WA_ACCESS_TOKEN
// - META_WA_PHONE_NUMBER_ID
//
// Optional:
// - GEMINI_MODEL = gemini-2.5-flash
// - GEMINI_MAX_ATTEMPTS = 3
// - PRO_PAYMENT_EXPECTED_DEFAULT_AMOUNT = 3500
// - PRO_PAYMENT_EXPECTED_DEFAULT_CURRENCY = YER
// - SEND_PRO_PAYMENT_WHATSAPP = true

type JsonRecord = Record<string, unknown>;

const SUPABASE_URL = mustGetEnv("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = mustGetEnv("SUPABASE_SERVICE_ROLE_KEY");
const GEMINI_API_KEY = mustGetEnv("GEMINI_API_KEY");
const SANAD_INTERNAL_API_KEY = mustGetEnv("SANAD_INTERNAL_API_KEY");

const META_WA_ACCESS_TOKEN = mustGetEnv("META_WA_ACCESS_TOKEN");
const META_WA_PHONE_NUMBER_ID = mustGetEnv("META_WA_PHONE_NUMBER_ID");

const GEMINI_MODEL = Deno.env.get("GEMINI_MODEL") || "gemini-2.5-flash";
const GEMINI_MAX_ATTEMPTS = Number(Deno.env.get("GEMINI_MAX_ATTEMPTS") || "3");

const DEFAULT_AMOUNT = Number(
  Deno.env.get("PRO_PAYMENT_EXPECTED_DEFAULT_AMOUNT") || "3500",
);
const DEFAULT_CURRENCY =
  Deno.env.get("PRO_PAYMENT_EXPECTED_DEFAULT_CURRENCY") || "YER";

const SEND_PRO_PAYMENT_WHATSAPP =
  (Deno.env.get("SEND_PRO_PAYMENT_WHATSAPP") || "true") !== "false";

const FUNCTION_NAME = "sanad-pro-payment-verify";
const META_GRAPH_VERSION = "v20.0";
const META_GRAPH_BASE = `https://graph.facebook.com/${META_GRAPH_VERSION}`;

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
    },
  });
}

function truncateText(value: unknown, max = 1500): string {
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

function isRetryableStatus(status: number): boolean {
  return [429, 500, 502, 503, 504].includes(status);
}

function toLatinDigits(value: unknown): string {
  if (value === undefined || value === null) return "";

  return String(value)
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)));
}

function cleanText(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  if (!text || text.toLowerCase() === "null" || text === "—" || text === "-") {
    return null;
  }
  return text;
}

function cleanJsonText(text: string): string {
  return String(text || "")
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();
}

function normalizeText(value: unknown): string {
  return String(value || "")
    .replace(/[أإآا]/g, "ا")
    .replace(/[ة]/g, "ه")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function includesLoose(haystack: unknown, needle: unknown): boolean {
  const h = normalizeText(haystack);
  const n = normalizeText(needle);
  if (!h || !n) return false;
  return h.includes(n);
}

function cleanDigitsKeepPlus(value: unknown): string | null {
  const text = toLatinDigits(value).replace(/[^\d+]/g, "").trim();
  return text || null;
}

function cleanAmount(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;

  const n = Number(
    toLatinDigits(value)
      .replace(/,/g, "")
      .replace(/[^\d.]/g, ""),
  );

  return Number.isFinite(n) ? n : null;
}

function normalizeCurrency(value: unknown): string | null {
  const text = cleanText(value);
  if (!text) return null;

  const upper = toLatinDigits(text).toUpperCase();

  if (
    upper.includes("YER") ||
    upper.includes("YEMEN") ||
    upper.includes("يمني") ||
    upper.includes("ريال")
  ) {
    return "YER";
  }

  if (
    upper.includes("SAR") ||
    upper.includes("SAUDI") ||
    upper.includes("سعودي")
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

  if (["YER", "SAR", "USD"].includes(upper)) return upper;

  return upper || null;
}

function normalizeYemenPhone(value: unknown): string | null {
  let phone = toLatinDigits(value).replace(/\D/g, "");

  if (phone.startsWith("00967")) phone = phone.slice(2);
  if (phone.startsWith("0967")) phone = phone.slice(1);
  if (phone.length === 9) phone = "967" + phone;

  return /^967\d{9}$/.test(phone) ? phone : null;
}

function daysOld(dateValue: unknown): number | null {
  const text = cleanText(dateValue);
  if (!text) return null;

  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return null;

  return Math.abs(Date.now() - date.getTime()) / (1000 * 60 * 60 * 24);
}

function bytesToBase64(bytes: Uint8Array): string {
  const chunkSize = 0x8000;
  let binary = "";

  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }

  return btoa(binary);
}

function extractGeminiText(gemini: any): string {
  const parts = gemini?.candidates?.[0]?.content?.parts;

  if (Array.isArray(parts)) {
    const text = parts.map((p: any) => p?.text || "").join("\n").trim();
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
  const response = await fetch(`${SUPABASE_URL}${path}`, {
    ...init,
    headers: {
      ...supabaseHeaders(init.headers || {}),
    },
  });

  const text = await response.text();

  if (!response.ok) {
    throw new Error(
      `supabase_request_failed ${response.status}: ${truncateText(text)}`,
    );
  }

  if (!text) return null as T;

  return JSON.parse(text) as T;
}

async function callRpc<T>(name: string, body: JsonRecord): Promise<T> {
  return await supabaseJson<T>(`/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

async function markReview(params: {
  paymentRequestId: string;
  status: string;
  extracted?: JsonRecord;
  confidence?: number | null;
  checks?: JsonRecord;
  failureReason?: string | null;
}): Promise<any> {
  return await callRpc<any>("admin_mark_pro_payment_request_review", {
    p_payment_request_id: params.paymentRequestId,
    p_status: params.status,
    p_ai_extracted_json: params.extracted || {},
    p_ai_confidence: params.confidence ?? null,
    p_verification_checks: params.checks || {},
    p_failure_reason: params.failureReason ?? null,
  });
}

async function downloadStorageObject(
  bucket: string,
  path: string,
): Promise<{ bytes: Uint8Array; contentType: string | null }> {
  const encodedPath = encodeURIComponent(path).replace(/%2F/g, "/");

  const response = await fetch(
    `${SUPABASE_URL}/storage/v1/object/${bucket}/${encodedPath}`,
    {
      method: "GET",
      headers: supabaseHeaders(),
    },
  );

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `storage_download_failed ${response.status}: ${truncateText(text)}`,
    );
  }

  return {
    bytes: new Uint8Array(await response.arrayBuffer()),
    contentType: response.headers.get("content-type"),
  };
}

function buildPrompt(expected: any): string {
  return `
أنت محلل تحقق دفع مالي لمشروع سند Pro.

مهمتك:
تحليل صورة أو ملف إيصال الدفع المرفق، واستخراج بيانات الحوالة بدقة، ثم إرجاع JSON فقط.

السياق المتوقع من النظام:
- المبلغ المتوقع: ${expected.amount ?? DEFAULT_AMOUNT}
- العملة المتوقعة: ${expected.currency ?? DEFAULT_CURRENCY}
- الجهة المالية المتوقعة: ${expected.financial_entity ?? null}
- رقم حساب/محفظة المستلم المتوقع: ${expected.account_number ?? null}
- اسم حساب المستلم المتوقع: ${expected.account_holder_name ?? null}

قواعد صارمة:
- أعد JSON فقط.
- ممنوع Markdown.
- ممنوع الشرح خارج JSON.
- إذا لم تجد قيمة، اجعلها null.
- حوّل الأرقام العربية والهندية إلى أرقام لاتينية إن أمكن.
- لا تخترع رقم حوالة.
- لا تخترع رقم حساب.
- confidence يجب أن يكون رقمًا من 0 إلى 1.
- is_payment_receipt يجب أن يكون true فقط إذا كان الملف إيصال دفع/حوالة فعلي.

أعد هذا الشكل تحديدًا:
{
  "is_payment_receipt": false,
  "financial_entity": null,
  "network": null,
  "amount": null,
  "currency": null,
  "receiver_name": null,
  "receiver_account": null,
  "receiver_phone": null,
  "sender_name": null,
  "sender_account": null,
  "sender_phone": null,
  "transfer_reference": null,
  "transfer_datetime": null,
  "raw_text": null,
  "summary": null,
  "confidence": 0,
  "notes": null
}
`;
}

async function callGemini(
  mimeType: string,
  base64: string,
  promptText: string,
): Promise<{
  gemini: any;
  rawText: string;
  extracted: any;
  attempts: number;
}> {
  const payload = {
    contents: [
      {
        role: "user",
        parts: [
          { text: promptText },
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
    if (delay > 0) await sleep(delay);

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const text = await response.text();

    if (!response.ok) {
      lastError =
        `gemini_request_failed ${response.status} attempt ${attempt}/${GEMINI_MAX_ATTEMPTS}: ${truncateText(text)}`;

      if (attempt < GEMINI_MAX_ATTEMPTS && isRetryableStatus(response.status)) {
        continue;
      }

      throw new Error(lastError);
    }

    const gemini = JSON.parse(text);
    const rawText = extractGeminiText(gemini);

    if (!rawText) {
      lastError =
        `empty_gemini_response attempt ${attempt}/${GEMINI_MAX_ATTEMPTS}: ${truncateText(text)}`;

      if (attempt < GEMINI_MAX_ATTEMPTS) continue;

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

function normalizeExtractedPayment(input: any) {
  const extracted = {
    is_payment_receipt: input?.is_payment_receipt === true,

    financial_entity: cleanText(input?.financial_entity),
    network: cleanText(input?.network),

    amount: cleanAmount(input?.amount),
    currency: normalizeCurrency(input?.currency),

    receiver_name: cleanText(input?.receiver_name),
    receiver_account: cleanDigitsKeepPlus(input?.receiver_account),
    receiver_phone: cleanDigitsKeepPlus(input?.receiver_phone)?.replace(/\D/g, "") || null,

    sender_name: cleanText(input?.sender_name),
    sender_account: cleanDigitsKeepPlus(input?.sender_account),
    sender_phone: cleanDigitsKeepPlus(input?.sender_phone)?.replace(/\D/g, "") || null,

    transfer_reference: cleanText(input?.transfer_reference)
      ? toLatinDigits(input.transfer_reference).replace(/\s+/g, "").trim()
      : null,

    transfer_datetime: cleanText(input?.transfer_datetime),
    raw_text: cleanText(input?.raw_text),
    summary: cleanText(input?.summary),

    confidence: Math.max(
      0,
      Math.min(1, Number(input?.confidence ?? input?.confidence_score ?? 0)),
    ),

    notes: cleanText(input?.notes),
  };

  return extracted;
}

function validatePayment(params: {
  paymentRequest: any;
  expected: any;
  extracted: any;
}) {
  const { paymentRequest, expected, extracted } = params;

  const checks = {
    is_payment_receipt: extracted.is_payment_receipt === true,

    has_transfer_reference: Boolean(extracted.transfer_reference),

    amount_matches:
      Number(extracted.amount) === Number(expected.amount),

    currency_matches:
      !extracted.currency ||
      String(extracted.currency).toUpperCase() ===
        String(expected.currency || DEFAULT_CURRENCY).toUpperCase() ||
      ["ريال", "يمني", "YER"].some((x) => includesLoose(extracted.currency, x)),

    receiver_account_matches:
      Boolean(expected.account_number) &&
      (
        String(extracted.receiver_account || "") ===
          String(expected.account_number) ||
        includesLoose(extracted.raw_text, expected.account_number)
      ),

    financial_entity_matches:
      !expected.financial_entity ||
      includesLoose(extracted.financial_entity, expected.financial_entity) ||
      includesLoose(extracted.network, expected.financial_entity) ||
      includesLoose(extracted.raw_text, expected.financial_entity),

    receiver_name_reasonable:
      !expected.account_holder_name ||
      includesLoose(extracted.receiver_name, expected.account_holder_name) ||
      includesLoose(extracted.raw_text, expected.account_holder_name) ||
      includesLoose(extracted.raw_text, "سند") ||
      includesLoose(extracted.raw_text, "sanad"),

    recent_or_unknown_date: (() => {
      const age = daysOld(extracted.transfer_datetime);
      return age === null || age <= 10;
    })(),

    confidence_ok: Number(extracted.confidence || 0) >= 0.85,
  };

  const hardFailures: string[] = [];
  const reviewReasons: string[] = [];

  if (!checks.is_payment_receipt) hardFailures.push("not_payment_receipt");

  if (!checks.has_transfer_reference) {
    reviewReasons.push("missing_transfer_reference");
  }

  if (!checks.amount_matches) reviewReasons.push("amount_mismatch");
  if (!checks.currency_matches) reviewReasons.push("currency_mismatch");
  if (!checks.receiver_account_matches) {
    reviewReasons.push("receiver_account_mismatch");
  }

  if (!checks.financial_entity_matches) {
    reviewReasons.push("financial_entity_mismatch");
  }

  if (!checks.receiver_name_reasonable) {
    reviewReasons.push("receiver_name_unclear");
  }

  if (!checks.recent_or_unknown_date) reviewReasons.push("old_transfer_date");
  if (!checks.confidence_ok) reviewReasons.push("low_ai_confidence");

  const autoApprove = hardFailures.length === 0 && reviewReasons.length === 0;

  let decision: "auto_approve" | "pending_review" | "rejected" =
    "pending_review";

  if (autoApprove) decision = "auto_approve";
  if (hardFailures.length > 0) decision = "rejected";

  return {
    payment_request_id: paymentRequest.id,
    user_id: paymentRequest.user_id,
    user_phone: paymentRequest.user_phone,
    user_full_name: paymentRequest.user_full_name,

    expected,
    extracted,
    checks,
    decision,
    auto_approve: autoApprove,
    hard_failures: hardFailures,
    review_reasons: reviewReasons,
    failure_reason: hardFailures.concat(reviewReasons).join(", ") || null,
  };
}

async function sendWhatsAppText(toRaw: unknown, body: string): Promise<any | null> {
  if (!SEND_PRO_PAYMENT_WHATSAPP) return null;

  const to = normalizeYemenPhone(toRaw);

  if (!to) {
    throw new Error("invalid_user_phone_for_whatsapp");
  }

  const response = await fetch(
    `${META_GRAPH_BASE}/${META_WA_PHONE_NUMBER_ID}/messages`,
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${META_WA_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to,
        type: "text",
        text: {
          preview_url: false,
          body,
        },
      }),
    },
  );

  const text = await response.text();

  if (!response.ok) {
    throw new Error(`whatsapp_send_failed ${response.status}: ${truncateText(text)}`);
  }

  return text ? JSON.parse(text) : null;
}

function successMessage(validation: any): string {
  return (
    "✅ *تم تفعيل سند Pro*\n\n" +
    "تم اعتماد دفعتك وتفعيل اشتراك سند Pro لمدة شهر.\n\n" +
    "*الخطة:* سند Pro\n" +
    `*المبلغ:* ${DEFAULT_AMOUNT.toLocaleString("en-US")} ريال يمني\n` +
    `*رقم الحوالة:* ${validation.extracted.transfer_reference || "—"}\n\n` +
    "يمكنك الآن الوصول الموسع إلى تفاصيل العمليات داخل سند."
  );
}

function reviewMessage(validation: any): string {
  const isRejected = validation.decision === "rejected";

  if (isRejected) {
    return (
      "تعذر اعتماد طلب تفعيل *سند Pro* تلقائيًا.\n\n" +
      "سنراجع الطلب، وإذا كان الإشعار صحيحًا سيتم تفعيل الاشتراك أو التواصل معك."
    );
  }

  return (
    "استلمنا طلب تفعيل *سند Pro*.\n\n" +
    "طلبك قيد المراجعة الآن، وسنبلغك عبر واتساب فور اعتماد الدفع."
  );
}

async function processPaymentVerification(paymentRequestId: string, source: string) {
  await markReview({
    paymentRequestId,
    status: "processing",
    extracted: {},
    confidence: null,
    checks: {
      stage: "started_by_edge_function",
      source,
      function: FUNCTION_NAME,
    },
    failureReason: null,
  });

  const payload = await callRpc<any>("admin_get_pro_payment_request_payload", {
    p_payment_request_id: paymentRequestId,
  });

  if (!payload || payload.ok === false) {
    throw new Error(`payment_payload_not_found: ${truncateText(JSON.stringify(payload))}`);
  }

  const paymentRequest = payload.payment_request || {};
  const expectedReceiver = payload.expected_receiver || {};

  if (!paymentRequest.id) throw new Error("missing_payment_request_from_rpc");
  if (!paymentRequest.receipt_bucket || !paymentRequest.receipt_path) {
    throw new Error("missing_receipt_storage_path");
  }
  if (!paymentRequest.user_phone) throw new Error("missing_user_phone");

  const expected = {
    amount: Number(paymentRequest.expected_amount || DEFAULT_AMOUNT),
    currency: paymentRequest.expected_currency || DEFAULT_CURRENCY,
    financial_entity:
      expectedReceiver.financial_entity || paymentRequest.payment_network || null,
    account_number: expectedReceiver.account_number || null,
    account_holder_name: expectedReceiver.account_holder_name || null,
  };

  const receipt = await downloadStorageObject(
    paymentRequest.receipt_bucket,
    paymentRequest.receipt_path,
  );

  const mimeType =
    paymentRequest.receipt_mime_type ||
    receipt.contentType ||
    "application/octet-stream";

  const base64 = bytesToBase64(receipt.bytes);

  const prompt = buildPrompt(expected);

  const geminiResult = await callGemini(mimeType, base64, prompt);
  const extracted = normalizeExtractedPayment(geminiResult.extracted);

  const validation = validatePayment({
    paymentRequest,
    expected,
    extracted,
  });

  const rawAi = {
    extracted,
    raw_gemini_text: geminiResult.rawText,
    gemini_model: GEMINI_MODEL,
    gemini_attempts: geminiResult.attempts,
    gemini_response: geminiResult.gemini,
    expected,
  };

  if (!extracted.transfer_reference) {
    await markReview({
      paymentRequestId,
      status: "pending_review",
      extracted: rawAi,
      confidence: extracted.confidence,
      checks: validation.checks,
      failureReason: "missing_transfer_reference",
    });

    let whatsappResponse = null;

    try {
      whatsappResponse = await sendWhatsAppText(
        validation.user_phone,
        reviewMessage(validation),
      );
    } catch (error) {
      whatsappResponse = {
        ok: false,
        error: truncateText(error instanceof Error ? error.message : String(error)),
      };
    }

    return {
      ok: true,
      status: "pending_review",
      branch: "missing_transfer_reference",
      payment_request_id: paymentRequestId,
      reason: "missing_transfer_reference",
      validation,
      whatsapp_response: whatsappResponse,
    };
  }

  const setReferenceResult = await callRpc<any>(
    "admin_set_pro_payment_transfer_reference",
    {
      p_payment_request_id: paymentRequestId,
      p_transfer_reference: extracted.transfer_reference,
      p_ai_extracted_json: rawAi,
      p_ai_confidence: extracted.confidence,
    },
  );

  const setReferenceOk = setReferenceResult?.ok === true;

  if (!setReferenceOk) {
    const checks = {
      ...validation.checks,
      transfer_reference_duplicate_or_invalid: true,
      set_reference_result: setReferenceResult,
    };

    await markReview({
      paymentRequestId,
      status: "pending_review",
      extracted: rawAi,
      confidence: extracted.confidence,
      checks,
      failureReason:
        setReferenceResult?.reason || "transfer_reference_not_accepted",
    });

    let whatsappResponse = null;

    try {
      whatsappResponse = await sendWhatsAppText(
        validation.user_phone,
        reviewMessage(validation),
      );
    } catch (error) {
      whatsappResponse = {
        ok: false,
        error: truncateText(error instanceof Error ? error.message : String(error)),
      };
    }

    return {
      ok: true,
      status: "pending_review",
      branch: "duplicate_or_invalid_reference",
      payment_request_id: paymentRequestId,
      reason: setReferenceResult?.reason || "transfer_reference_not_accepted",
      validation,
      set_reference_result: setReferenceResult,
      whatsapp_response: whatsappResponse,
    };
  }

  if (validation.auto_approve) {
    const approval = await callRpc<any>("admin_approve_pro_payment_request", {
      p_payment_request_id: paymentRequestId,
      p_approval_source: "auto",
      p_ai_extracted_json: rawAi,
      p_ai_confidence: extracted.confidence,
      p_verification_checks: validation.checks,
      p_note: "Auto approved by SANAD Pro Payment Verification Edge Function",
    });

    let whatsappResponse = null;

    try {
      whatsappResponse = await sendWhatsAppText(
        validation.user_phone,
        successMessage(validation),
      );
    } catch (error) {
      whatsappResponse = {
        ok: false,
        error: truncateText(error instanceof Error ? error.message : String(error)),
      };
    }

    return {
      ok: true,
      status: "auto_approved",
      payment_request_id: paymentRequestId,
      subscription_id: approval?.subscription_id || null,
      validation,
      approval,
      whatsapp_response: whatsappResponse,
    };
  }

  await markReview({
    paymentRequestId,
    status: validation.decision === "rejected" ? "rejected" : "pending_review",
    extracted: rawAi,
    confidence: extracted.confidence,
    checks: validation.checks,
    failureReason: validation.failure_reason || "needs_manual_review",
  });

  let whatsappResponse = null;

  try {
    whatsappResponse = await sendWhatsAppText(
      validation.user_phone,
      reviewMessage(validation),
    );
  } catch (error) {
    whatsappResponse = {
      ok: false,
      error: truncateText(error instanceof Error ? error.message : String(error)),
    };
  }

  return {
    ok: true,
    status: validation.decision === "rejected" ? "rejected_or_review" : "pending_review",
    payment_request_id: paymentRequestId,
    reason: validation.failure_reason || "needs_manual_review",
    validation,
    whatsapp_response: whatsappResponse,
  };
}

Deno.serve(async (req: Request) => {
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
        function: FUNCTION_NAME,
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

  let paymentRequestId: string | null = null;

  try {
    const body = await req.json().catch(() => ({}));

    paymentRequestId =
      cleanText(
        body?.payment_request_id ||
          body?.paymentRequestId ||
          body?.id,
      );

    if (!paymentRequestId) {
      return jsonResponse(
        {
          ok: false,
          error: "missing_payment_request_id",
        },
        400,
      );
    }

    const result = await processPaymentVerification(
      paymentRequestId,
      cleanText(body?.source) || "edge-function",
    );

    return jsonResponse(result, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (paymentRequestId) {
      try {
        await markReview({
          paymentRequestId,
          status: "pending_review",
          extracted: {},
          confidence: null,
          checks: {
            stage: "edge_function_failed",
            function: FUNCTION_NAME,
          },
          failureReason: truncateText(message),
        });
      } catch {
        // Best-effort failure marking only.
      }
    }

    return jsonResponse(
      {
        ok: false,
        error: "payment_verification_failed",
        payment_request_id: paymentRequestId,
        message: truncateText(message),
      },
      500,
    );
  }
});
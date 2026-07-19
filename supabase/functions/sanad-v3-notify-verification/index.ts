// SANAD Verify v3 - Notify Uploader After Verification
// Supabase Edge Function: sanad-v3-notify-verification
//
// Required secrets:
// - SUPABASE_URL
// - SUPABASE_SERVICE_ROLE_KEY
// - SANAD_INTERNAL_API_KEY
// - META_WA_ACCESS_TOKEN
// - META_WA_PHONE_NUMBER_ID
//
// Optional:
// - PUBLIC_APP_BASE_URL = https://app.sanadflow.com
// - SEND_VERIFICATION_NOTIFY_WHATSAPP = true

type JsonRecord = Record<string, unknown>;

const SUPABASE_URL = mustGetEnv("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = mustGetEnv("SUPABASE_SERVICE_ROLE_KEY");
const SANAD_INTERNAL_API_KEY = mustGetEnv("SANAD_INTERNAL_API_KEY");

const META_WA_ACCESS_TOKEN = mustGetEnv("META_WA_ACCESS_TOKEN");
const META_WA_PHONE_NUMBER_ID = mustGetEnv("META_WA_PHONE_NUMBER_ID");

const PUBLIC_APP_BASE_URL =
  Deno.env.get("PUBLIC_APP_BASE_URL") || "https://app.sanadflow.com";

const SEND_VERIFICATION_NOTIFY_WHATSAPP =
  (Deno.env.get("SEND_VERIFICATION_NOTIFY_WHATSAPP") || "true") !== "false";

const META_GRAPH_VERSION = "v20.0";
const META_GRAPH_BASE = `https://graph.facebook.com/${META_GRAPH_VERSION}`;

const FUNCTION_NAME = "sanad-v3-notify-verification";

const NOTIFICATION_KIND = "uploader_verified_whatsapp_sent";

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

function cleanText(value: unknown): string | null {
  if (value === undefined || value === null) return null;

  const text = toLatinDigits(String(value))
    .replace(/\s+/g, " ")
    .trim();

  if (!text || text === "—" || text === "-") return null;

  return text;
}

function toLatinDigits(value: unknown): string {
  if (value === undefined || value === null) return "";

  return String(value)
    .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
    .replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)));
}

function firstNonEmpty(...values: unknown[]): unknown | null {
  for (const value of values) {
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return value;
    }
  }

  return null;
}

function onlyDigits(value: unknown): string {
  return toLatinDigits(value).replace(/\D/g, "");
}

function normalizeYemenPhone(value: unknown): string | null {
  let phone = onlyDigits(value);

  if (phone.startsWith("00967")) phone = phone.slice(2);
  if (phone.startsWith("0967")) phone = phone.slice(1);
  if (phone.length === 9) phone = "967" + phone;

  return /^967\d{9}$/.test(phone) ? phone : null;
}

function formatDate(value: unknown): string {
  const text = cleanText(value);
  if (!text) return "—";

  const date = new Date(text);

  if (Number.isNaN(date.getTime())) {
    return text;
  }

  return toLatinDigits(
    date.toLocaleString("ar-u-nu-latn", {
      timeZone: "Asia/Aden",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }),
  );
}

function formatAmount(amount: unknown, currency: unknown): string | null {
  if (amount === undefined || amount === null || amount === "") return null;

  const number = Number(amount);

  const amountText = Number.isFinite(number)
    ? number.toLocaleString("en-US", { maximumFractionDigits: 2 })
    : cleanText(amount);

  if (!amountText) return null;

  return `${amountText} ${cleanText(currency) || ""}`.trim();
}

function normalizeSummaryText(value: unknown): string {
  const text = cleanText(value);

  if (!text) return "";

  return text
    .replace(/حاكم للعسل/g, "باحكم للعسل")
    .replace(/حاكم العسل/g, "باحكم للعسل")
    .replace(/باحكم للعسل للعسل/g, "باحكم للعسل")
    .replace(/باحكم العسل/g, "باحكم للعسل")
    .replace(/\s+/g, " ")
    .trim();
}

function buildSummary(operation: any): string {
  const rawSummary = normalizeSummaryText(
    firstNonEmpty(
      operation?.summary,
      operation?.description,
      operation?.note,
      operation?.transaction_summary,
    ) || "",
  );

  if (rawSummary) return rawSummary;

  const receiverName = cleanText(
    firstNonEmpty(
      operation?.verified_account_display_name,
      operation?.account_display_name,
      operation?.receiver_name,
      operation?.receiver_account_name,
      operation?.display_name,
    ) || "",
  );

  const entityName = cleanText(operation?.financial_entity);
  const amountText = formatAmount(operation?.amount, operation?.currency);

  if (receiverName && amountText && entityName) {
    return `عملية مالية بمبلغ ${amountText} لصالح ${receiverName} عبر ${entityName}`;
  }

  if (receiverName && amountText) {
    return `عملية مالية بمبلغ ${amountText} لصالح ${receiverName}`;
  }

  if (receiverName) {
    return `عملية مالية لصالح ${receiverName}`;
  }

  if (amountText && entityName) {
    return `عملية مالية بمبلغ ${amountText} عبر ${entityName}`;
  }

  if (amountText) {
    return `عملية مالية بمبلغ ${amountText}`;
  }

  return "عملية مالية موثقة عبر سند";
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

function normalizeRpcPayload(input: any, original: {
  operationId: string | null;
  publicToken: string | null;
}) {
  const payload =
    input?.get_verification_notification_payload ||
    input?.payload ||
    input?.data ||
    input;

  const operation = payload?.operation || {};
  const uploader = payload?.uploader || {};
  const verifier = payload?.verifier || {};

  const publicToken =
    cleanText(
      firstNonEmpty(
        operation?.public_token,
        payload?.public_token,
        original.publicToken,
      ),
    ) || null;

  const operationId =
    cleanText(firstNonEmpty(operation?.id, original.operationId)) || null;

  const verificationUrl =
    cleanText(payload?.verification_url) ||
    (publicToken ? `${PUBLIC_APP_BASE_URL}/v/${publicToken}` : null);

  if (!operationId) {
    throw new Error("missing_operation_id_from_notification_payload");
  }

  if (!publicToken) {
    throw new Error("missing_public_token_from_notification_payload");
  }

  if (!verificationUrl || verificationUrl.includes("undefined")) {
    throw new Error("missing_verification_url_from_notification_payload");
  }

  return {
    ...payload,
    operation: {
      ...operation,
      id: operationId,
      public_token: publicToken,
    },
    uploader,
    verifier,
    public_token: publicToken,
    verification_url: verificationUrl,
  };
}

async function getNotificationPayload(params: {
  operationId: string | null;
  publicToken: string | null;
}) {
  const payload = await callRpc<any>("get_verification_notification_payload", {
    p_operation_id: params.operationId,
    p_public_token: params.publicToken,
  });

  return normalizeRpcPayload(payload, params);
}

async function checkAlreadyNotified(operationId: string): Promise<boolean> {
  const encodedOperationId = encodeURIComponent(operationId);
  const encodedKind = encodeURIComponent(NOTIFICATION_KIND);

  const rows = await supabaseJson<any[]>(
    `/rest/v1/operation_events?operation_id=eq.${encodedOperationId}&event_type=eq.webhook_updated&metadata->>notification_kind=eq.${encodedKind}&select=id&limit=1`,
    {
      method: "GET",
      headers: {
        "Accept": "application/json",
      },
    },
  );

  return Array.isArray(rows) && rows.length > 0;
}

function buildWhatsAppTextPayload(payload: any) {
  const operation = payload.operation || {};
  const uploader = payload.uploader || {};
  const verifier = payload.verifier || {};

  const to = normalizeYemenPhone(uploader.phone);

  if (!to) {
    throw new Error(
      `missing_or_invalid_uploader_phone: ${truncateText(JSON.stringify({
        uploader_phone: uploader.phone,
      }))}`,
    );
  }

  const publicToken = cleanText(
    firstNonEmpty(
      operation.public_token,
      payload.public_token,
    ),
  );

  if (!publicToken) {
    throw new Error("missing_public_token");
  }

  const verificationUrl =
    cleanText(payload.verification_url) ||
    `${PUBLIC_APP_BASE_URL}/v/${publicToken}`;

  if (!verificationUrl || verificationUrl.includes("undefined")) {
    throw new Error("missing_verification_url");
  }

  const summary = buildSummary(operation);

  const verifierName =
    cleanText(
      firstNonEmpty(
        verifier.display_name,
        verifier.full_name,
        operation.verified_by_name,
        operation.confirmed_by_name,
        verifier.phone,
        operation.verified_by_phone,
      ),
    ) || "مستخدم موثق عبر سند";

  const verifierPhone =
    normalizeYemenPhone(
      firstNonEmpty(
        verifier.phone,
        operation.verified_by_phone,
        operation.confirmed_by_phone,
      ),
    ) || null;

  const verifiedAt = formatDate(
    firstNonEmpty(
      operation.verified_at,
      operation.confirmed_at,
      operation.updated_at,
    ),
  );

  const messageText =
    "✅ *تم توثيق العملية عبر سند*\n\n" +
    "تمت مراجعة الإشعار وتأكيد مطابقته.\n\n" +
    `*ملخص:* ${summary}\n` +
    `*أكّدها:* ${verifierName}\n` +
    `*وقت التحقق:* ${verifiedAt}\n\n` +
    verificationUrl;

  return {
    ok: true,
    to,
    operation_id: operation.id,
    public_token: publicToken,
    verifier_phone: verifierPhone,
    verifier_name: verifierName,
    verification_url: verificationUrl,
    message_text: messageText,
    message_body: {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "text",
      text: {
        preview_url: true,
        body: messageText,
      },
    },
  };
}

async function sendWhatsAppMessage(messageBody: JsonRecord): Promise<any | null> {
  if (!SEND_VERIFICATION_NOTIFY_WHATSAPP) return null;

  const response = await fetch(
    `${META_GRAPH_BASE}/${META_WA_PHONE_NUMBER_ID}/messages`,
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${META_WA_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(messageBody),
    },
  );

  const text = await response.text();

  if (!response.ok) {
    throw new Error(
      `whatsapp_send_failed ${response.status}: ${truncateText(text)}`,
    );
  }

  return text ? JSON.parse(text) : null;
}

async function insertNotificationEvent(params: {
  operationId: string;
  verifierPhone: string | null;
  notificationPayload: any;
  whatsappResponse: any;
}) {
  await supabaseJson<any[]>(
    `/rest/v1/operation_events`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Prefer": "return=representation",
      },
      body: JSON.stringify({
        operation_id: params.operationId,
        event_type: "webhook_updated",
        actor_user_id: null,
        actor_phone: params.verifierPhone,
        metadata: {
          notification_kind: NOTIFICATION_KIND,
          notification_format: "text",
          channel: "whatsapp",
          sent_to: params.notificationPayload.to,
          public_token: params.notificationPayload.public_token,
          verification_url: params.notificationPayload.verification_url,
          verifier_name: params.notificationPayload.verifier_name,
          whatsapp_response: params.whatsappResponse || null,
          function: FUNCTION_NAME,
        },
      }),
    },
  );
}

async function processNotifyVerification(params: {
  operationId: string | null;
  publicToken: string | null;
  source: string;
}) {
  const payload = await getNotificationPayload({
    operationId: params.operationId,
    publicToken: params.publicToken,
  });

  const operationId = cleanText(payload?.operation?.id);

  if (!operationId) {
    throw new Error("missing_operation_id_after_payload_normalization");
  }

  const alreadyNotified = await checkAlreadyNotified(operationId);

  if (alreadyNotified) {
    return {
      ok: true,
      skipped: true,
      reason: "already_sent",
      operation_id: operationId,
      public_token: payload.public_token,
    };
  }

  const notificationPayload = buildWhatsAppTextPayload(payload);
  const whatsappResponse = await sendWhatsAppMessage(
    notificationPayload.message_body,
  );

  await insertNotificationEvent({
    operationId,
    verifierPhone: notificationPayload.verifier_phone,
    notificationPayload,
    whatsappResponse,
  });

  return {
    ok: true,
    sent: true,
    notification: NOTIFICATION_KIND,
    operation_id: operationId,
    public_token: notificationPayload.public_token,
    sent_to: notificationPayload.to,
    whatsapp_message_id:
      whatsappResponse?.messages?.[0]?.id || null,
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

  try {
    const body = await req.json().catch(() => ({}));

    const operationId =
      cleanText(body?.operation_id || body?.operationId) || null;

    const publicToken =
      cleanText(body?.public_token || body?.publicToken) || null;

    if (!operationId && !publicToken) {
      return jsonResponse(
        {
          ok: false,
          error: "missing_operation_identifier",
        },
        400,
      );
    }

    const result = await processNotifyVerification({
      operationId,
      publicToken,
      source: cleanText(body?.source) || "edge_function",
    });

    return jsonResponse(result, 200);
  } catch (error) {
    return jsonResponse(
      {
        ok: false,
        error: "notify_verification_failed",
        message: truncateText(error instanceof Error ? error.message : String(error)),
      },
      500,
    );
  }
});
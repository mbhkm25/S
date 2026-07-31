// SANAD Verify v3 - WhatsApp Intake
// Supabase Edge Function: sanad-v3-whatsapp-intake
//
// Required secrets:
// - SUPABASE_URL
// - SUPABASE_SERVICE_ROLE_KEY
// - META_VERIFY_TOKEN
// - META_WA_ACCESS_TOKEN
// - META_WA_PHONE_NUMBER_ID
// - SANAD_INTERNAL_API_KEY
//
// Recommended:
// - META_APP_SECRET
// - REQUIRE_META_SIGNATURE=true after the secret is configured and verified.

// @ts-types="npm:@types/qrcode@1.5.5"
import QRCode from "npm:qrcode@1.5.4";

type JsonRecord = Record<string, unknown>;
type Pipeline =
  | "whatsapp_intake"
  | "analysis"
  | "fast_routing"
  | "routing"
  | "payment_inbox";
type SpanStatus = "success" | "error" | "skipped";
type SignatureMode = "verified" | "invalid" | "missing" | "not_configured";

type SignatureResult = {
  ok: boolean;
  mode: SignatureMode;
};

type NormalizedMessage = {
  hasMessage: true;
  rawWebhook: unknown;
  value: JsonRecord;
  senderPhone: string | null;
  senderWaId: string;
  senderName: string | null;
  messageId: string;
  timestamp: string;
  messageType: string;
  mediaId: string;
  mimeType: string;
  fileName: string;
  caption: string;
  text: string;
};

type NormalizedStatus = {
  hasMessage: false;
  rawWebhook: unknown;
  value: JsonRecord;
  isStatusEvent: boolean;
  statuses: unknown[];
};

type NormalizedWebhook = NormalizedMessage | NormalizedStatus;

declare const EdgeRuntime:
  | undefined
  | { waitUntil: (promise: Promise<unknown>) => void };

const SUPABASE_URL = mustGetEnv("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = mustGetEnv("SUPABASE_SERVICE_ROLE_KEY");
const META_VERIFY_TOKEN = mustGetEnv("META_VERIFY_TOKEN");
const META_WA_ACCESS_TOKEN = mustGetEnv("META_WA_ACCESS_TOKEN");
const META_WA_PHONE_NUMBER_ID = mustGetEnv("META_WA_PHONE_NUMBER_ID");
const SANAD_INTERNAL_API_KEY = mustGetEnv("SANAD_INTERNAL_API_KEY");

const META_APP_SECRET = Deno.env.get("META_APP_SECRET") || "";
const REQUIRE_META_SIGNATURE =
  (Deno.env.get("REQUIRE_META_SIGNATURE") || "false") === "true";
const PUBLIC_APP_BASE_URL =
  Deno.env.get("PUBLIC_APP_BASE_URL") || "https://app.sanadflow.com";
const PUBLIC_APP_ORIGIN = new URL(PUBLIC_APP_BASE_URL).origin;
const STORAGE_BUCKET =
  Deno.env.get("SUPABASE_STORAGE_BUCKET") || "operation-files";
const ANALYZE_URL =
  Deno.env.get("SANAD_ANALYZE_FUNCTION_URL") ||
  `${SUPABASE_URL}/functions/v1/sanad-v3-analyze-operation`;
const ONBOARDING_URL =
  Deno.env.get("SANAD_WHATSAPP_ONBOARDING_FUNCTION_URL") ||
  `${SUPABASE_URL}/functions/v1/sanad-v3-whatsapp-onboarding`;
const ASSISTANT_URL =
  Deno.env.get("SANAD_WHATSAPP_ASSISTANT_FUNCTION_URL") ||
  `${SUPABASE_URL}/functions/v1/sanad-v3-whatsapp-assistant`;

const SEND_UNSUPPORTED_REPLY =
  (Deno.env.get("SEND_UNSUPPORTED_REPLY") || "true") !== "false";
const SEND_QR_REPLY =
  (Deno.env.get("SEND_QR_REPLY") || "true") !== "false";
const TRIGGER_ANALYSIS =
  (Deno.env.get("TRIGGER_ANALYSIS") || "true") !== "false";
const TRIGGER_ONBOARDING =
  (Deno.env.get("TRIGGER_ONBOARDING") || "true") !== "false";
const TRIGGER_ASSISTANT =
  (Deno.env.get("TRIGGER_ASSISTANT") || "true") !== "false";

const GRAPH_VERSION = "v20.0";
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;
const FUNCTION_NAME = "sanad-v3-whatsapp-intake";
const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);
const RESPONSE_HEADERS = {
  "Access-Control-Allow-Origin": PUBLIC_APP_ORIGIN,
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-sanad-internal-key, x-hub-signature-256",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function mustGetEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function textResponse(text: string, status = 200): Response {
  return new Response(text, {
    status,
    headers: { ...RESPONSE_HEADERS, "Content-Type": "text/plain; charset=utf-8" },
  });
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...RESPONSE_HEADERS, "Content-Type": "application/json; charset=utf-8" },
  });
}

function truncate(value: unknown, max = 1500): string {
  const text = String(value ?? "");
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function cleanText(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text || null;
}

function cleanPhone(value: unknown): string | null {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits || null;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function extensionFromMime(mimeType: string): string {
  const mime = mimeType.toLowerCase();
  if (mime.includes("jpeg") || mime.includes("jpg")) return "jpg";
  if (mime.includes("png")) return "png";
  if (mime.includes("webp")) return "webp";
  if (mime.includes("pdf")) return "pdf";
  if (mime.includes("ogg") || mime.includes("opus")) return "ogg";
  if (mime.includes("mpeg") || mime.includes("mp3")) return "mp3";
  if (mime.includes("mp4") || mime.includes("m4a")) return "m4a";
  if (mime.includes("wav")) return "wav";
  if (mime.includes("webm")) return "webm";
  return "bin";
}

function attachmentType(mimeType: string, messageType: string): string {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.includes("pdf")) return "pdf";
  return messageType === "document" ? "document" : "file";
}

function sanitizePathPart(value: string, fallback: string): string {
  const cleaned = value
    .trim()
    .replace(/[^\w.\-]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return cleaned || fallback;
}

function supabaseHeaders(extra: HeadersInit = {}): HeadersInit {
  return {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    ...extra,
  };
}

async function supabaseJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${SUPABASE_URL}${path}`, {
    ...init,
    headers: supabaseHeaders(init.headers || {}),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`supabase_request_failed ${response.status}: ${truncate(text)}`);
  }
  return text ? JSON.parse(text) as T : null as T;
}

async function graphJson<T>(pathOrUrl: string, init: RequestInit = {}): Promise<T> {
  const url = pathOrUrl.startsWith("http")
    ? pathOrUrl
    : `${GRAPH_BASE}${pathOrUrl}`;
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${META_WA_ACCESS_TOKEN}`,
      ...(init.headers || {}),
    },
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`meta_request_failed ${response.status}: ${truncate(text)}`);
  }
  return text ? JSON.parse(text) as T : null as T;
}

function constantTimeEqual(left: string, right: string): boolean {
  const leftBytes = new TextEncoder().encode(left);
  const rightBytes = new TextEncoder().encode(right);
  const max = Math.max(leftBytes.length, rightBytes.length);
  let difference = leftBytes.length ^ rightBytes.length;
  for (let index = 0; index < max; index += 1) {
    difference |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }
  return difference === 0;
}

function bytesToHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

async function verifyMetaSignature(
  rawBody: Uint8Array,
  signatureHeader: string | null,
): Promise<SignatureResult> {
  if (!META_APP_SECRET) {
    return { ok: !REQUIRE_META_SIGNATURE, mode: "not_configured" };
  }
  if (!signatureHeader?.startsWith("sha256=")) {
    return { ok: false, mode: "missing" };
  }
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(META_APP_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign("HMAC", key, toArrayBuffer(rawBody));
  const expected = `sha256=${bytesToHex(digest)}`;
  return constantTimeEqual(expected, signatureHeader.trim())
    ? { ok: true, mode: "verified" }
    : { ok: false, mode: "invalid" };
}

function normalizeWebhook(body: unknown): NormalizedWebhook {
  const root = body as Record<string, any>;
  const value = (root?.entry?.[0]?.changes?.[0]?.value || {}) as JsonRecord;
  const message = (value as any)?.messages?.[0] || null;
  const contact = (value as any)?.contacts?.[0] || {};
  const statuses = Array.isArray((value as any)?.statuses)
    ? (value as any).statuses as unknown[]
    : [];
  if (!message) {
    return {
      hasMessage: false,
      rawWebhook: body,
      value,
      isStatusEvent: statuses.length > 0,
      statuses,
    };
  }
  const messageType = cleanText(message.type) || "unknown";
  const media = message.image || message.document || message.audio || null;
  const senderWaId = cleanText(contact.wa_id || message.from) || "";
  const mimeType = cleanText(media?.mime_type) || "application/octet-stream";
  const messageId = cleanText(message.id) || "";
  return {
    hasMessage: true,
    rawWebhook: body,
    value,
    senderPhone: cleanPhone(message.from || senderWaId),
    senderWaId,
    senderName: cleanText(contact?.profile?.name),
    messageId,
    timestamp: cleanText(message.timestamp) || "",
    messageType,
    mediaId: cleanText(media?.id) || "",
    mimeType,
    fileName: cleanText(media?.filename) ||
      (media?.id ? `whatsapp-${messageId}.${extensionFromMime(mimeType)}` : ""),
    caption: cleanText(media?.caption) || "",
    text: cleanText(message?.text?.body) || "",
  };
}

async function recordSpan(params: {
  operationId: string;
  runId: string;
  pipeline: Pipeline;
  stage: string;
  status: SpanStatus;
  startedAtMs: number;
  metadata?: JsonRecord;
}): Promise<void> {
  const completedAtMs = Date.now();
  try {
    await supabaseJson("/rest/v1/rpc/service_record_operation_pipeline_span", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        p_operation_id: params.operationId,
        p_run_id: params.runId,
        p_pipeline: params.pipeline,
        p_stage: params.stage,
        p_status: params.status,
        p_function_name: FUNCTION_NAME,
        p_started_at: new Date(params.startedAtMs).toISOString(),
        p_completed_at: new Date(completedAtMs).toISOString(),
        p_duration_ms: completedAtMs - params.startedAtMs,
        p_metadata: params.metadata || {},
      }),
    });
  } catch (error) {
    console.error(JSON.stringify({
      function: FUNCTION_NAME,
      event: "pipeline_span_write_failed",
      stage: params.stage,
      error: truncate(error instanceof Error ? error.message : error, 500),
    }));
  }
}

async function processDeliveryStatuses(statuses: unknown[]): Promise<void> {
  for (const rawStatus of statuses) {
    const status = rawStatus as Record<string, any>;
    const messageId = cleanText(status.id);
    const deliveryStatus = cleanText(status.status)?.toLowerCase();
    if (!messageId || !deliveryStatus ||
      !["sent", "delivered", "read", "failed"].includes(deliveryStatus)) {
      continue;
    }
    const timestamp = Number(status.timestamp);
    const eventAt = Number.isFinite(timestamp) && timestamp > 0
      ? new Date(timestamp * 1000).toISOString()
      : new Date().toISOString();
    const firstError = Array.isArray(status.errors) ? status.errors[0] : null;
    const errorCode = firstError?.code == null ? null : String(firstError.code);
    const errorMessage = cleanText(firstError?.title) ||
      cleanText(firstError?.message) ||
      cleanText(firstError?.error_data?.details);
    for (const rpcName of [
      "apply_report_whatsapp_delivery_status",
      "apply_whatsapp_campaign_delivery_status",
    ]) {
      try {
        await supabaseJson(`/rest/v1/rpc/${rpcName}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            p_message_id: messageId,
            p_status: deliveryStatus,
            p_event_at: eventAt,
            p_error_code: errorCode,
            p_error_message: errorMessage,
          }),
        });
      } catch (error) {
        console.error(JSON.stringify({
          function: FUNCTION_NAME,
          event: "delivery_status_rpc_failed",
          rpc: rpcName,
          message_id: messageId,
          error: truncate(error instanceof Error ? error.message : error),
        }));
      }
    }
  }
}

async function registerInbound(
  message: NormalizedMessage,
  supported: boolean,
): Promise<void> {
  try {
    await supabaseJson("/rest/v1/rpc/register_whatsapp_inbound", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        p_phone: message.senderPhone,
        p_wa_id: message.senderWaId || message.senderPhone,
        p_display_name: message.senderName,
        p_message_id: message.messageId || null,
        p_message_type: message.messageType,
        p_supported: supported,
        p_metadata: {
          function: FUNCTION_NAME,
          media_id: message.mediaId || null,
          mime_type: message.mimeType,
          whatsapp_timestamp: message.timestamp || null,
        },
      }),
    });
  } catch (error) {
    console.error(JSON.stringify({
      function: FUNCTION_NAME,
      event: "whatsapp_contact_registration_failed",
      message_id: message.messageId || null,
      error: truncate(error instanceof Error ? error.message : error),
    }));
  }
}

function whatsappTimestamp(value: string): string | null {
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds > 0
    ? new Date(seconds * 1000).toISOString()
    : null;
}

async function triggerAssistant(message: NormalizedMessage): Promise<void> {
  if (!TRIGGER_ASSISTANT) {
    await sendUnsupported(message.senderPhone || "");
    return;
  }
  const queued = await supabaseJson<Record<string, any>>(
    "/rest/v1/rpc/enqueue_sanad_assistant_message",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        p_phone: message.senderPhone,
        p_message_id: message.messageId,
        p_message_type: message.messageType,
        p_body_text: message.text || null,
        p_media_id: message.mediaId || null,
        p_media_mime_type: message.mimeType,
        p_meta_timestamp: whatsappTimestamp(message.timestamp),
        p_metadata: {
          source: FUNCTION_NAME,
          sender_name: message.senderName,
          sender_wa_id: message.senderWaId,
        },
      }),
    },
  );
  if (!queued?.message_id || queued.status !== "queued" || queued.duplicate) return;
  const response = await fetch(ASSISTANT_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-sanad-internal-key": SANAD_INTERNAL_API_KEY,
    },
    body: JSON.stringify({ message_id: queued.message_id, source: FUNCTION_NAME }),
  });
  if (!response.ok) {
    throw new Error(
      `assistant_trigger_rejected ${response.status}: ${truncate(await response.text())}`,
    );
  }
}

async function findExisting(messageId: string): Promise<Record<string, any> | null> {
  if (!messageId) return null;
  try {
    const rows = await supabaseJson<Record<string, any>[]>(
      `/rest/v1/operations?select=id,public_token,status,ai_status&storage_metadata->>meta_message_id=eq.${encodeURIComponent(messageId)}&limit=1`,
      { method: "GET", headers: { Accept: "application/json" } },
    );
    return rows[0] || null;
  } catch {
    return null;
  }
}

async function fetchMediaInfo(mediaId: string): Promise<Record<string, any>> {
  return await graphJson<Record<string, any>>(`/${mediaId}`, { method: "GET" });
}

async function downloadMedia(url: string): Promise<{
  bytes: Uint8Array;
  contentType: string | null;
}> {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${META_WA_ACCESS_TOKEN}` },
  });
  if (!response.ok) {
    throw new Error(
      `meta_media_download_failed ${response.status}: ${truncate(await response.text())}`,
    );
  }
  return {
    bytes: new Uint8Array(await response.arrayBuffer()),
    contentType: response.headers.get("content-type"),
  };
}

async function uploadStorage(
  path: string,
  bytes: Uint8Array,
  mimeType: string,
): Promise<void> {
  const encodedPath = encodeURIComponent(path).replace(/%2F/g, "/");
  const response = await fetch(
    `${SUPABASE_URL}/storage/v1/object/${STORAGE_BUCKET}/${encodedPath}`,
    {
      method: "POST",
      headers: supabaseHeaders({
        "Content-Type": mimeType,
        "x-upsert": "false",
      }),
      body: toArrayBuffer(bytes),
    },
  );
  if (!response.ok) {
    throw new Error(
      `storage_upload_failed ${response.status}: ${truncate(await response.text())}`,
    );
  }
}

async function insertOperation(payload: JsonRecord): Promise<Record<string, any>> {
  const rows = await supabaseJson<Record<string, any>[]>("/rest/v1/operations", {
    method: "POST",
    headers: { "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify(payload),
  });
  if (!rows[0]?.id) throw new Error("missing_inserted_operation_id");
  return rows[0];
}

async function insertEvent(
  operationId: string,
  eventType: string,
  metadata: JsonRecord,
  source = "whatsapp",
): Promise<void> {
  await supabaseJson("/rest/v1/operation_events", {
    method: "POST",
    headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({ operation_id: operationId, event_type: eventType, source, metadata }),
  });
}

async function linkUploader(
  operationId: string,
  message: NormalizedMessage,
): Promise<void> {
  if (!message.senderPhone) return;
  try {
    await supabaseJson("/rest/v1/operation_user_links", {
      method: "POST",
      headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({
        operation_id: operationId,
        user_id: null,
        phone: message.senderPhone,
        relation_type: "uploader",
        source: "whatsapp",
        metadata: {
          sender_name: message.senderName,
          whatsapp_message_id: message.messageId,
          whatsapp_wa_id: message.senderWaId,
        },
      }),
    });
  } catch {
    // Convenience link failure must not invalidate the operation.
  }
}

async function sendUnsupported(to: string): Promise<void> {
  if (!SEND_UNSUPPORTED_REPLY || !to) return;
  await graphJson(`/${META_WA_PHONE_NUMBER_ID}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "text",
      text: {
        preview_url: false,
        body:
          "مرحبًا بك في سند.\n\nأرسل صورة الإشعار المالي أو ملف PDF، وسنرسل لك رابط ورمز QR للتحقق من العملية.",
      },
    }),
  });
}

async function generateQr(verificationUrl: string): Promise<Uint8Array> {
  const buffer = await QRCode.toBuffer(verificationUrl, {
    type: "png",
    width: 800,
    margin: 3,
    errorCorrectionLevel: "M",
  });
  return new Uint8Array(buffer);
}

async function uploadQrToMeta(qr: Uint8Array): Promise<string> {
  const form = new FormData();
  form.append("messaging_product", "whatsapp");
  form.append("type", "image/png");
  form.append(
    "file",
    new Blob([toArrayBuffer(qr)], { type: "image/png" }),
    "sanad-qr.png",
  );
  const response = await fetch(
    `${GRAPH_BASE}/${META_WA_PHONE_NUMBER_ID}/media`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${META_WA_ACCESS_TOKEN}` },
      body: form,
    },
  );
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`meta_qr_upload_failed ${response.status}: ${truncate(text)}`);
  }
  const mediaId = cleanText(JSON.parse(text)?.id);
  if (!mediaId) throw new Error("meta_qr_upload_missing_media_id");
  return mediaId;
}

async function sendQr(to: string, mediaId: string, verificationUrl: string) {
  return await graphJson(`/${META_WA_PHONE_NUMBER_ID}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "image",
      image: {
        id: mediaId,
        caption:
          `تم رفع الإشعار المالي إلى سند ✅\n\nيمكنك عرض رمز التحقق أو مشاركة الرابط:\n${verificationUrl}\n\nسيتم تحليل الإشعار ذكيًا خلال لحظات.`,
      },
    }),
  });
}

async function triggerOnboarding(): Promise<void> {
  if (!TRIGGER_ONBOARDING) return;
  const response = await fetch(ONBOARDING_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-sanad-internal-key": SANAD_INTERNAL_API_KEY,
    },
    body: JSON.stringify({ limit: 1, source: FUNCTION_NAME }),
  });
  if (!response.ok) {
    throw new Error(
      `onboarding_trigger_rejected ${response.status}: ${truncate(await response.text())}`,
    );
  }
}

async function triggerAnalysis(operationId: string, publicToken: string) {
  if (!TRIGGER_ANALYSIS) return { skipped: true };
  const response = await fetch(ANALYZE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-sanad-internal-key": SANAD_INTERNAL_API_KEY,
    },
    body: JSON.stringify({
      operation_id: operationId,
      public_token: publicToken,
      source: "whatsapp",
    }),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`analysis_trigger_rejected ${response.status}: ${truncate(text)}`);
  }
  try {
    return text ? JSON.parse(text) : { ok: true };
  } catch {
    return { ok: true };
  }
}

async function runQrFlow(params: {
  operationId: string;
  runId: string;
  message: NormalizedMessage;
  publicToken: string;
  verificationUrl: string;
}): Promise<void> {
  const startedAtMs = Date.now();
  if (!SEND_QR_REPLY) {
    await recordSpan({
      operationId: params.operationId,
      runId: params.runId,
      pipeline: "whatsapp_intake",
      stage: "qr_delivery",
      status: "skipped",
      startedAtMs,
      metadata: { reason: "SEND_QR_REPLY=false" },
    });
    return;
  }
  try {
    const qr = await generateQr(params.verificationUrl);
    const mediaId = await uploadQrToMeta(qr);
    const sendResponse = await sendQr(
      params.message.senderPhone || "",
      mediaId,
      params.verificationUrl,
    );
    await insertEvent(params.operationId, "qr_created", {
      action: "qr_sent_to_sender",
      generator: "internal:qrcode@1.5.4",
      verification_url: params.verificationUrl,
      whatsapp_send_response: sendResponse,
    });
    try {
      await triggerOnboarding();
    } catch (error) {
      console.error(JSON.stringify({
        function: FUNCTION_NAME,
        event: "whatsapp_onboarding_trigger_failed",
        error: truncate(error instanceof Error ? error.message : error),
      }));
    }
    await recordSpan({
      operationId: params.operationId,
      runId: params.runId,
      pipeline: "whatsapp_intake",
      stage: "qr_delivery",
      status: "success",
      startedAtMs,
      metadata: { generator: "internal:qrcode@1.5.4" },
    });
  } catch (error) {
    const message = truncate(error instanceof Error ? error.message : error);
    await insertEvent(params.operationId, "qr_created", {
      action: "qr_send_failed",
      generator: "internal:qrcode@1.5.4",
      error: message,
      verification_url: params.verificationUrl,
    });
    await recordSpan({
      operationId: params.operationId,
      runId: params.runId,
      pipeline: "whatsapp_intake",
      stage: "qr_delivery",
      status: "error",
      startedAtMs,
      metadata: { error: message },
    });
  }
}

function operationPayload(params: {
  message: NormalizedMessage;
  mediaInfo: Record<string, any>;
  storagePath: string;
  mimeType: string;
  fileName: string;
  fileSize: number | null;
  fileSha256: string | null;
  publicToken: string;
  signatureMode: SignatureMode;
  runId: string;
}): JsonRecord {
  return {
    public_token: params.publicToken,
    token_status: "active",
    source: "whatsapp",
    upload_origin: "whatsapp",
    submitted_by_user_id: null,
    submitted_by_phone: params.message.senderPhone,
    submitted_by_name: params.message.senderName,
    file_bucket: STORAGE_BUCKET,
    file_path: params.storagePath,
    file_original_name: params.fileName,
    file_mime_type: params.mimeType,
    file_size: params.fileSize,
    file_sha256: params.fileSha256,
    storage_metadata: {
      meta_media_id: params.message.mediaId,
      meta_message_id: params.message.messageId,
      whatsapp_from: params.message.senderPhone,
      whatsapp_sender_name: params.message.senderName,
      whatsapp_timestamp: params.message.timestamp,
      whatsapp_message_type: params.message.messageType,
      whatsapp_caption: params.message.caption || null,
      meta_media_url_id: params.mediaInfo.id || null,
      meta_media_sha256: params.mediaInfo.sha256 || null,
      meta_media_file_size: params.mediaInfo.file_size || null,
      meta_signature_mode: params.signatureMode,
      intake_pipeline_run_id: params.runId,
    },
    original_file_status: "stored",
    qr_status: "created",
    status: "stored",
    ai_status: "pending",
    raw_webhook_json: params.message.rawWebhook,
    client_upload_metadata: {
      source: "whatsapp",
      message_id: params.message.messageId,
      sender_phone: params.message.senderPhone,
      sender_name: params.message.senderName,
      caption: params.message.caption || null,
      pipeline_run_id: params.runId,
    },
  };
}

async function processMessage(
  message: NormalizedMessage,
  webhookStartedAtMs: number,
  signature: SignatureResult,
): Promise<void> {
  if (!message.senderPhone) return;

  const supportedMedia = Boolean(
    message.mediaId &&
      ["image", "document"].includes(message.messageType) &&
      ALLOWED_MIME_TYPES.has(message.mimeType),
  );
  const supportedAssistant =
    message.messageType === "text" ||
    (message.messageType === "audio" && Boolean(message.mediaId));
  await registerInbound(message, supportedMedia || supportedAssistant);

  if (supportedAssistant) {
    await triggerAssistant(message);
    return;
  }
  if (!supportedMedia) {
    await sendUnsupported(message.senderPhone);
    return;
  }
  if (await findExisting(message.messageId)) return;

  const runId = crypto.randomUUID();
  const mediaStartedAtMs = Date.now();
  const mediaInfo = await fetchMediaInfo(message.mediaId);
  const mediaUrl = cleanText(mediaInfo.url);
  if (!mediaUrl) throw new Error("missing_meta_media_url");
  const downloaded = await downloadMedia(mediaUrl);
  const mimeType = cleanText(mediaInfo.mime_type) ||
    cleanText(downloaded.contentType) || message.mimeType;
  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    await sendUnsupported(message.senderPhone);
    return;
  }

  const extension = extensionFromMime(mimeType);
  const fileName = cleanText(message.fileName) ||
    `whatsapp-${Date.now()}.${extension}`;
  const storagePath = [
    "whatsapp",
    message.senderPhone,
    `${Date.now()}-${sanitizePathPart(message.messageId, crypto.randomUUID())}.${extension}`,
  ].join("/");
  const publicToken = crypto.randomUUID();
  const verificationUrl = `${PUBLIC_APP_BASE_URL}/v/${publicToken}`;
  const fileSize = Number(mediaInfo.file_size) > 0
    ? Number(mediaInfo.file_size)
    : downloaded.bytes.byteLength || null;
  const fileSha256 = cleanText(mediaInfo.sha256);

  const storageStartedAtMs = Date.now();
  await uploadStorage(storagePath, downloaded.bytes, mimeType);
  const createStartedAtMs = Date.now();
  const operation = await insertOperation(operationPayload({
    message,
    mediaInfo,
    storagePath,
    mimeType,
    fileName,
    fileSize,
    fileSha256,
    publicToken,
    signatureMode: signature.mode,
    runId,
  }));

  await Promise.allSettled([
    recordSpan({
      operationId: operation.id,
      runId,
      pipeline: "whatsapp_intake",
      stage: "media_lookup_download",
      status: "success",
      startedAtMs: mediaStartedAtMs,
      metadata: { bytes: downloaded.bytes.byteLength, mime_type: mimeType },
    }),
    recordSpan({
      operationId: operation.id,
      runId,
      pipeline: "whatsapp_intake",
      stage: "storage_upload",
      status: "success",
      startedAtMs: storageStartedAtMs,
      metadata: { bucket: STORAGE_BUCKET },
    }),
    recordSpan({
      operationId: operation.id,
      runId,
      pipeline: "whatsapp_intake",
      stage: "operation_create",
      status: "success",
      startedAtMs: createStartedAtMs,
      metadata: { signature_mode: signature.mode },
    }),
  ]);

  const setupStartedAtMs = Date.now();
  await Promise.allSettled([
    linkUploader(operation.id, message),
    insertEvent(operation.id, "file_uploaded", {
      source: "whatsapp",
      upload_origin: "whatsapp",
      message_id: message.messageId,
      media_id: message.mediaId,
      file_bucket: STORAGE_BUCKET,
      file_path: storagePath,
      file_mime_type: mimeType,
      file_original_name: fileName,
      attachment_type: attachmentType(mimeType, message.messageType),
      pipeline_run_id: runId,
      signature_mode: signature.mode,
    }),
  ]);
  await recordSpan({
    operationId: operation.id,
    runId,
    pipeline: "whatsapp_intake",
    stage: "post_create_setup",
    status: "success",
    startedAtMs: setupStartedAtMs,
  });

  const analysisStartedAtMs = Date.now();
  const analysisPromise = (async () => {
    try {
      const result = await triggerAnalysis(operation.id, publicToken);
      await recordSpan({
        operationId: operation.id,
        runId,
        pipeline: "whatsapp_intake",
        stage: "analysis_execution",
        status: result?.skipped ? "skipped" : "success",
        startedAtMs: analysisStartedAtMs,
        metadata: { analyzer_status: result?.ai_status || null },
      });
    } catch (error) {
      const errorText = truncate(error instanceof Error ? error.message : error);
      await recordSpan({
        operationId: operation.id,
        runId,
        pipeline: "whatsapp_intake",
        stage: "analysis_execution",
        status: "error",
        startedAtMs: analysisStartedAtMs,
        metadata: { error: errorText },
      });
      throw error;
    }
  })();

  const qrPromise = runQrFlow({
    operationId: operation.id,
    runId,
    message,
    publicToken,
    verificationUrl,
  });

  const results = await Promise.allSettled([analysisPromise, qrPromise]);
  await recordSpan({
    operationId: operation.id,
    runId,
    pipeline: "whatsapp_intake",
    stage: "intake_total",
    status: results[0].status === "rejected" ? "error" : "success",
    startedAtMs: webhookStartedAtMs,
    metadata: {
      signature_mode: signature.mode,
      analysis_result: results[0].status,
      qr_result: results[1].status,
      parallelized: true,
    },
  });
}

async function processWebhook(
  body: unknown,
  webhookStartedAtMs: number,
  signature: SignatureResult,
): Promise<void> {
  const normalized = normalizeWebhook(body);
  if (!normalized.hasMessage) {
    if (normalized.isStatusEvent) {
      await processDeliveryStatuses(normalized.statuses);
    }
    return;
  }
  await processMessage(normalized, webhookStartedAtMs, signature);
}

function verifyChallenge(url: URL): Response {
  const valid =
    url.searchParams.get("hub.mode") === "subscribe" &&
    url.searchParams.get("hub.verify_token") === META_VERIFY_TOKEN &&
    Boolean(url.searchParams.get("hub.challenge"));
  return valid
    ? textResponse(url.searchParams.get("hub.challenge") || "", 200)
    : textResponse("Forbidden", 403);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: RESPONSE_HEADERS });
  }
  if (req.method === "GET") return verifyChallenge(new URL(req.url));
  if (req.method !== "POST") {
    return jsonResponse({ ok: false, error: "method_not_allowed" }, 405);
  }

  const webhookStartedAtMs = Date.now();
  const rawBody = new Uint8Array(await req.arrayBuffer());
  const signature = await verifyMetaSignature(
    rawBody,
    req.headers.get("x-hub-signature-256"),
  );
  if (!signature.ok) {
    console.error(JSON.stringify({
      function: FUNCTION_NAME,
      event: "meta_signature_rejected",
      mode: signature.mode,
    }));
    return jsonResponse(
      { ok: false, error: "invalid_meta_signature", mode: signature.mode },
      403,
    );
  }
  if (signature.mode === "not_configured") {
    console.warn(JSON.stringify({
      function: FUNCTION_NAME,
      event: "meta_signature_verification_not_configured",
      require_signature: REQUIRE_META_SIGNATURE,
    }));
  }

  let body: unknown;
  try {
    body = JSON.parse(new TextDecoder().decode(rawBody));
  } catch {
    return textResponse("EVENT_RECEIVED", 200);
  }

  const task = processWebhook(body, webhookStartedAtMs, signature).catch((error) => {
    console.error(JSON.stringify({
      function: FUNCTION_NAME,
      error: truncate(error instanceof Error ? error.message : error),
    }));
  });
  if (typeof EdgeRuntime !== "undefined" && EdgeRuntime?.waitUntil) {
    EdgeRuntime.waitUntil(task);
  }
  return textResponse("EVENT_RECEIVED", 200);
});

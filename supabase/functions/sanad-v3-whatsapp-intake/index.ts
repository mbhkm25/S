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
// Recommended security secret:
// - META_APP_SECRET (enables X-Hub-Signature-256 verification)
//
// Optional flags:
// - REQUIRE_META_SIGNATURE = false (set true after META_APP_SECRET is configured)
// - PUBLIC_APP_BASE_URL = https://app.sanadflow.com
// - SUPABASE_STORAGE_BUCKET = operation-files
// - SANAD_ANALYZE_FUNCTION_URL
// - SANAD_WHATSAPP_ONBOARDING_FUNCTION_URL
// - SANAD_WHATSAPP_ASSISTANT_FUNCTION_URL
// - SEND_UNSUPPORTED_REPLY = true
// - SEND_QR_REPLY = true
// - TRIGGER_ANALYSIS = true
// - TRIGGER_ONBOARDING = true
// - TRIGGER_ASSISTANT = true

// @ts-types="npm:@types/qrcode@1.5.5"
import QRCode from "npm:qrcode@1.5.4";

type JsonRecord = Record<string, unknown>;

type SignatureResult = {
  ok: boolean;
  mode: "verified" | "invalid" | "missing" | "not_configured";
};

declare const EdgeRuntime:
  | undefined
  | {
      waitUntil: (promise: Promise<unknown>) => void;
    };

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
const SUPABASE_STORAGE_BUCKET =
  Deno.env.get("SUPABASE_STORAGE_BUCKET") || "operation-files";

const SANAD_ANALYZE_FUNCTION_URL =
  Deno.env.get("SANAD_ANALYZE_FUNCTION_URL") ||
  `${SUPABASE_URL}/functions/v1/sanad-v3-analyze-operation`;
const SANAD_WHATSAPP_ONBOARDING_FUNCTION_URL =
  Deno.env.get("SANAD_WHATSAPP_ONBOARDING_FUNCTION_URL") ||
  `${SUPABASE_URL}/functions/v1/sanad-v3-whatsapp-onboarding`;
const SANAD_WHATSAPP_ASSISTANT_FUNCTION_URL =
  Deno.env.get("SANAD_WHATSAPP_ASSISTANT_FUNCTION_URL") ||
  `${SUPABASE_URL}/functions/v1/sanad-v3-whatsapp-assistant`;

const SEND_UNSUPPORTED_REPLY =
  (Deno.env.get("SEND_UNSUPPORTED_REPLY") || "true") !== "false";
const SEND_QR_REPLY = (Deno.env.get("SEND_QR_REPLY") || "true") !== "false";
const TRIGGER_ANALYSIS = (Deno.env.get("TRIGGER_ANALYSIS") || "true") !== "false";
const TRIGGER_ONBOARDING =
  (Deno.env.get("TRIGGER_ONBOARDING") || "true") !== "false";
const TRIGGER_ASSISTANT =
  (Deno.env.get("TRIGGER_ASSISTANT") || "true") !== "false";

const META_GRAPH_VERSION = "v20.0";
const META_GRAPH_BASE = `https://graph.facebook.com/${META_GRAPH_VERSION}`;
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

function truncateText(value: unknown, max = 1500): string {
  const text = String(value ?? "");
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function safeString(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text || null;
}

function cleanPhone(value: unknown): string | null {
  const phone = String(value ?? "").replace(/[^\d]/g, "");
  return phone || null;
}

function extensionFromMime(mimeType: string | null | undefined): string {
  const mime = String(mimeType || "").toLowerCase();
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

function detectAttachmentType(mimeType: string, messageType: string): string {
  const mime = String(mimeType || "").toLowerCase();
  if (mime.startsWith("image/")) return "image";
  if (mime.includes("pdf")) return "pdf";
  if (messageType === "document") return "document";
  return "file";
}

function isSupportedMedia(messageType: string, mimeType: string, mediaId: string | null) {
  return Boolean(
    mediaId &&
      ["image", "document"].includes(messageType) &&
      ALLOWED_MIME_TYPES.has(mimeType),
  );
}

function sanitizePathPart(value: unknown, fallback: string): string {
  const text = String(value ?? "")
    .trim()
    .replace(/[^\w.\-]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return text || fallback;
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
    headers: { ...supabaseHeaders(init.headers || {}) },
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`supabase_request_failed ${response.status}: ${truncateText(text)}`);
  }
  return text ? JSON.parse(text) as T : null as T;
}

async function metaJson<T>(pathOrUrl: string, init: RequestInit = {}): Promise<T> {
  const url = pathOrUrl.startsWith("http")
    ? pathOrUrl
    : `${META_GRAPH_BASE}${pathOrUrl}`;
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${META_WA_ACCESS_TOKEN}`,
      ...(init.headers || {}),
    },
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`meta_request_failed ${response.status}: ${truncateText(text)}`);
  }
  return text ? JSON.parse(text) as T : null as T;
}

async function metaFetchBinary(url: string): Promise<{
  bytes: Uint8Array;
  contentType: string | null;
}> {
  const response = await fetch(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${META_WA_ACCESS_TOKEN}` },
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`meta_media_download_failed ${response.status}: ${truncateText(text)}`);
  }
  return {
    bytes: new Uint8Array(await response.arrayBuffer()),
    contentType: response.headers.get("content-type"),
  };
}

function constantTimeEqual(left: string, right: string): boolean {
  const leftBytes = new TextEncoder().encode(left);
  const rightBytes = new TextEncoder().encode(right);
  const max = Math.max(leftBytes.length, rightBytes.length);
  let diff = leftBytes.length ^ rightBytes.length;
  for (let index = 0; index < max; index += 1) {
    diff |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }
  return diff === 0;
}

function bytesToHex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)]
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
  const digest = await crypto.subtle.sign("HMAC", key, rawBody);
  const expected = `sha256=${bytesToHex(digest)}`;
  return constantTimeEqual(expected, signatureHeader.trim())
    ? { ok: true, mode: "verified" }
    : { ok: false, mode: "invalid" };
}

function normalizeWhatsAppPayload(body: any) {
  const value = body?.entry?.[0]?.changes?.[0]?.value || {};
  const message = value?.messages?.[0] || null;
  const contact = value?.contacts?.[0] || {};
  const status = value?.statuses?.[0] || null;
  if (!message) {
    return {
      hasMessage: false,
      isStatusEvent: Boolean(status),
      rawWebhook: body,
      value,
      status,
    };
  }
  const messageType = message.type || "unknown";
  const media = message.image || message.document || message.audio || null;
  const from = message.from || contact.wa_id || "";
  const mediaMime = safeString(media?.mime_type) || "";
  let fileName = safeString(media?.filename) || "";
  if (!fileName && media?.id) {
    fileName = `whatsapp-${message.id}.${extensionFromMime(mediaMime)}`;
  }
  return {
    hasMessage: true,
    rawWebhook: body,
    value,
    message,
    contact,
    from,
    senderPhone: cleanPhone(from),
    senderWaId: contact.wa_id || from,
    senderName: safeString(contact?.profile?.name),
    messageId: safeString(message.id) || "",
    timestamp: safeString(message.timestamp) || "",
    messageType,
    mediaId: safeString(media?.id) || "",
    mimeType: mediaMime || "application/octet-stream",
    fileName,
    caption: safeString(media?.caption) || "",
    text: safeString(message?.text?.body) || "",
  };
}

async function recordSpan(params: {
  operationId: string;
  runId: string;
  pipeline: "whatsapp_intake" | "analysis" | "fast_routing" | "routing" | "payment_inbox";
  stage: string;
  status: "success" | "error" | "skipped";
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
        p_duration_ms: Math.max(0, completedAtMs - params.startedAtMs),
        p_metadata: params.metadata || {},
      }),
    });
  } catch (error) {
    console.error(JSON.stringify({
      function: FUNCTION_NAME,
      event: "pipeline_span_write_failed",
      stage: params.stage,
      error: truncateText(error instanceof Error ? error.message : String(error), 500),
    }));
  }
}

async function processDeliveryStatuses(statuses: any[]): Promise<void> {
  if (!Array.isArray(statuses) || statuses.length === 0) return;
  for (const statusEvent of statuses) {
    const messageId = safeString(statusEvent?.id);
    const deliveryStatus = safeString(statusEvent?.status)?.toLowerCase();
    if (!messageId || !deliveryStatus || !["sent", "delivered", "read", "failed"].includes(deliveryStatus)) continue;
    const timestampSeconds = Number(statusEvent?.timestamp);
    const eventAt = Number.isFinite(timestampSeconds) && timestampSeconds > 0
      ? new Date(timestampSeconds * 1000).toISOString()
      : new Date().toISOString();
    const firstError = Array.isArray(statusEvent?.errors) ? statusEvent.errors[0] || null : null;
    const errorCode = firstError?.code == null ? null : String(firstError.code);
    const errorMessage =
      safeString(firstError?.title) ||
      safeString(firstError?.message) ||
      safeString(firstError?.error_data?.details) ||
      null;
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
          event: "whatsapp_delivery_status_failed",
          rpc: rpcName,
          message_id: messageId,
          error: truncateText(error instanceof Error ? error.message : String(error)),
        }));
      }
    }
  }
}

async function findExistingOperationByMessageId(messageId: string): Promise<any | null> {
  if (!messageId) return null;
  try {
    const rows = await supabaseJson<any[]>(
      `/rest/v1/operations?select=id,public_token,status,ai_status,submitted_by_phone,created_at&storage_metadata->>meta_message_id=eq.${encodeURIComponent(messageId)}&limit=1`,
      { method: "GET", headers: { Accept: "application/json" } },
    );
    return Array.isArray(rows) ? rows[0] ?? null : null;
  } catch {
    return null;
  }
}

async function registerWhatsAppInbound(normalized: any, supported: boolean): Promise<void> {
  try {
    await supabaseJson("/rest/v1/rpc/register_whatsapp_inbound", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        p_phone: normalized.senderPhone,
        p_wa_id: normalized.senderWaId || normalized.senderPhone,
        p_display_name: normalized.senderName || null,
        p_message_id: normalized.messageId || null,
        p_message_type: normalized.messageType || null,
        p_supported: supported,
        p_metadata: {
          function: FUNCTION_NAME,
          media_id: normalized.mediaId || null,
          mime_type: normalized.mimeType || null,
          whatsapp_timestamp: normalized.timestamp || null,
        },
      }),
    });
  } catch (error) {
    console.error(JSON.stringify({
      function: FUNCTION_NAME,
      event: "whatsapp_contact_registration_failed",
      message_id: normalized.messageId || null,
      error: truncateText(error instanceof Error ? error.message : String(error)),
    }));
  }
}

function whatsappTimestamp(value: unknown): string | null {
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds > 0
    ? new Date(seconds * 1000).toISOString()
    : null;
}

async function enqueueAndTriggerAssistant(normalized: any): Promise<void> {
  if (!TRIGGER_ASSISTANT) {
    await sendUnsupportedMessage(normalized.senderPhone);
    return;
  }
  const queued = await supabaseJson<any>("/rest/v1/rpc/enqueue_sanad_assistant_message", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      p_phone: normalized.senderPhone,
      p_message_id: normalized.messageId,
      p_message_type: normalized.messageType,
      p_body_text: normalized.text || null,
      p_media_id: normalized.mediaId || null,
      p_media_mime_type: normalized.mimeType || null,
      p_meta_timestamp: whatsappTimestamp(normalized.timestamp),
      p_metadata: {
        source: FUNCTION_NAME,
        sender_name: normalized.senderName || null,
        sender_wa_id: normalized.senderWaId || null,
      },
    }),
  });
  if (!queued?.message_id || queued.status !== "queued" || queued.duplicate) return;
  const response = await fetch(SANAD_WHATSAPP_ASSISTANT_FUNCTION_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-sanad-internal-key": SANAD_INTERNAL_API_KEY,
    },
    body: JSON.stringify({ message_id: queued.message_id, source: FUNCTION_NAME }),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`assistant_trigger_rejected ${response.status}: ${truncateText(text)}`);
  }
}

async function uploadToStorage(
  bucket: string,
  path: string,
  bytes: Uint8Array,
  mimeType: string,
): Promise<void> {
  const encodedPath = encodeURIComponent(path).replace(/%2F/g, "/");
  const response = await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}/${encodedPath}`, {
    method: "POST",
    headers: supabaseHeaders({ "Content-Type": mimeType, "x-upsert": "false" }),
    body: bytes,
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`storage_upload_failed ${response.status}: ${truncateText(text)}`);
  }
}

async function insertOperation(payload: JsonRecord): Promise<any> {
  const rows = await supabaseJson<any[]>("/rest/v1/operations", {
    method: "POST",
    headers: { "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify(payload),
  });
  const operation = Array.isArray(rows) ? rows[0] : rows;
  if (!operation?.id) throw new Error("missing_inserted_operation_id");
  return operation;
}

async function insertOperationEvent(
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

async function linkSenderAsUploader(
  operationId: string,
  senderPhone: string | null,
  senderName: string | null,
  messageId: string | null,
  senderWaId: string | null,
): Promise<void> {
  if (!senderPhone) return;
  try {
    await supabaseJson("/rest/v1/operation_user_links", {
      method: "POST",
      headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({
        operation_id: operationId,
        user_id: null,
        phone: senderPhone,
        relation_type: "uploader",
        source: "whatsapp",
        metadata: {
          sender_name: senderName,
          whatsapp_message_id: messageId,
          whatsapp_wa_id: senderWaId,
        },
      }),
    });
  } catch {
    // The operation itself remains valid if the convenience link fails.
  }
}

async function sendUnsupportedMessage(to: string): Promise<void> {
  if (!SEND_UNSUPPORTED_REPLY) return;
  await metaJson(`/${META_WA_PHONE_NUMBER_ID}/messages`, {
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
          "مرحبًا بك في سند.\n\n" +
          "لرفع إشعار مالي، أرسل صورة الإشعار أو ملف PDF فقط.\n\n" +
          "بعد الرفع سنرسل لك رابطًا ورمز QR للتحقق من العملية.",
      },
    }),
  });
}

async function generateQrImage(verificationUrl: string): Promise<Uint8Array> {
  const buffer = await QRCode.toBuffer(verificationUrl, {
    type: "png",
    width: 800,
    margin: 3,
    errorCorrectionLevel: "M",
  });
  return new Uint8Array(buffer);
}

async function uploadQrToWhatsApp(qrBytes: Uint8Array): Promise<string> {
  const form = new FormData();
  form.append("messaging_product", "whatsapp");
  form.append("type", "image/png");
  form.append("file", new Blob([qrBytes], { type: "image/png" }), "sanad-qr.png");
  const response = await fetch(`${META_GRAPH_BASE}/${META_WA_PHONE_NUMBER_ID}/media`, {
    method: "POST",
    headers: { Authorization: `Bearer ${META_WA_ACCESS_TOKEN}` },
    body: form,
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`meta_qr_upload_failed ${response.status}: ${truncateText(text)}`);
  }
  const mediaId = JSON.parse(text)?.id;
  if (!mediaId) throw new Error(`meta_qr_upload_missing_media_id: ${truncateText(text)}`);
  return mediaId;
}

async function sendQrReplyToSender(
  to: string,
  qrMediaId: string,
  caption: string,
): Promise<any> {
  return await metaJson(`/${META_WA_PHONE_NUMBER_ID}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "image",
      image: { id: qrMediaId, caption },
    }),
  });
}

async function triggerAnalysis(operationId: string, publicToken: string): Promise<any> {
  if (!TRIGGER_ANALYSIS) return { skipped: true };
  const response = await fetch(SANAD_ANALYZE_FUNCTION_URL, {
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
    throw new Error(`analysis_trigger_rejected ${response.status}: ${truncateText(text)}`);
  }
  try {
    return text ? JSON.parse(text) : { ok: true };
  } catch {
    return { ok: true, response: truncateText(text, 500) };
  }
}

async function triggerWhatsAppOnboarding(): Promise<void> {
  if (!TRIGGER_ONBOARDING) return;
  const response = await fetch(SANAD_WHATSAPP_ONBOARDING_FUNCTION_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-sanad-internal-key": SANAD_INTERNAL_API_KEY,
    },
    body: JSON.stringify({ limit: 1, source: FUNCTION_NAME }),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`whatsapp_onboarding_trigger_rejected ${response.status}: ${truncateText(text)}`);
  }
}

function buildCaption(verificationUrl: string): string {
  return (
    "تم رفع الإشعار المالي إلى سند ✅\n\n" +
    "يمكنك عرض رمز التحقق أو مشاركة الرابط مع أي شخص تريد أن يتحقق من العملية.\n\n" +
    `رابط التحقق:\n${verificationUrl}\n\n` +
    "سيتم تحليل الإشعار ذكيًا خلال لحظات."
  );
}

function buildOperationPayload(params: {
  normalized: any;
  mediaInfo: any;
  storagePath: string;
  mimeType: string;
  fileName: string;
  fileSize: number | null;
  fileSha256: string | null;
  publicToken: string;
  signatureMode: SignatureResult["mode"];
  pipelineRunId: string;
}) {
  const { normalized, mediaInfo, storagePath, mimeType, fileName, fileSize, fileSha256, publicToken, signatureMode, pipelineRunId } = params;
  return {
    public_token: publicToken,
    token_status: "active",
    source: "whatsapp",
    upload_origin: "whatsapp",
    submitted_by_user_id: null,
    submitted_by_phone: normalized.senderPhone,
    submitted_by_name: normalized.senderName,
    file_bucket: SUPABASE_STORAGE_BUCKET,
    file_path: storagePath,
    file_original_name: fileName,
    file_mime_type: mimeType,
    file_size: fileSize,
    file_sha256: fileSha256,
    storage_metadata: {
      meta_media_id: normalized.mediaId || null,
      meta_message_id: normalized.messageId || null,
      whatsapp_from: normalized.senderPhone || null,
      whatsapp_sender_name: normalized.senderName || null,
      whatsapp_timestamp: normalized.timestamp || null,
      whatsapp_message_type: normalized.messageType || null,
      whatsapp_caption: normalized.caption || null,
      meta_media_url_id: mediaInfo?.id || null,
      meta_media_sha256: mediaInfo?.sha256 || null,
      meta_media_file_size: mediaInfo?.file_size || null,
      meta_signature_mode: signatureMode,
      intake_pipeline_run_id: pipelineRunId,
    },
    original_file_status: "stored",
    qr_status: "created",
    status: "stored",
    ai_status: "pending",
    raw_webhook_json: normalized.rawWebhook || null,
    client_upload_metadata: {
      source: "whatsapp",
      message_id: normalized.messageId || null,
      sender_phone: normalized.senderPhone || null,
      sender_name: normalized.senderName || null,
      caption: normalized.caption || null,
      pipeline_run_id: pipelineRunId,
    },
  };
}

async function runQrFlow(params: {
  operationId: string;
  runId: string;
  senderPhone: string;
  senderName: string | null;
  messageId: string;
  mediaId: string;
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
    const qrBytes = await generateQrImage(params.verificationUrl);
    const qrMediaId = await uploadQrToWhatsApp(qrBytes);
    const response = await sendQrReplyToSender(
      params.senderPhone,
      qrMediaId,
      buildCaption(params.verificationUrl),
    );
    await insertOperationEvent(params.operationId, "qr_created", {
      action: "qr_sent_to_sender",
      generator: "internal:qrcode@1.5.4",
      sent_to: params.senderPhone,
      sender_name: params.senderName,
      public_token: params.publicToken,
      verification_url: params.verificationUrl,
      whatsapp_incoming_message_id: params.messageId || null,
      whatsapp_uploaded_media_id: params.mediaId || null,
      whatsapp_send_response: response,
    });
    try {
      await triggerWhatsAppOnboarding();
    } catch (error) {
      console.error(JSON.stringify({
        function: FUNCTION_NAME,
        event: "whatsapp_onboarding_trigger_failed",
        error: truncateText(error instanceof Error ? error.message : String(error)),
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
    const message = truncateText(error instanceof Error ? error.message : String(error));
    await insertOperationEvent(params.operationId, "qr_created", {
      action: "qr_send_failed",
      generator: "internal:qrcode@1.5.4",
      error: message,
      public_token: params.publicToken,
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

async function processWebhookInBackground(
  body: any,
  webhookStartedAtMs: number,
  signature: SignatureResult,
): Promise<void> {
  const normalized = normalizeWhatsAppPayload(body);
  if (!normalized.hasMessage) {
    const statuses = Array.isArray(normalized?.value?.statuses)
      ? normalized.value.statuses
      : normalized?.status
        ? [normalized.status]
        : [];
    if (normalized.isStatusEvent && statuses.length > 0) {
      await processDeliveryStatuses(statuses);
    }
    return;
  }

  const senderPhone = normalized.senderPhone;
  const senderName = normalized.senderName;
  const messageId = normalized.messageId;
  const mediaId = normalized.mediaId;
  const messageType = normalized.messageType;
  const initialMimeType = normalized.mimeType;
  if (!senderPhone) return;

  const supportedMedia = isSupportedMedia(messageType, initialMimeType, mediaId);
  const supportedAssistantMessage =
    messageType === "text" || (messageType === "audio" && Boolean(mediaId));
  await registerWhatsAppInbound(
    normalized,
    supportedMedia || supportedAssistantMessage,
  );
  if (supportedAssistantMessage) {
    await enqueueAndTriggerAssistant(normalized);
    return;
  }
  if (!supportedMedia) {
    await sendUnsupportedMessage(senderPhone);
    return;
  }
  const existing = await findExistingOperationByMessageId(messageId);
  if (existing?.id) return;

  const runId = crypto.randomUUID();
  const mediaStartedAtMs = Date.now();
  const mediaInfo = await metaJson<any>(`/${mediaId}`, { method: "GET" });
  const mediaUrl = safeString(mediaInfo?.url);
  if (!mediaUrl) throw new Error("missing_meta_media_url");
  const mimeType =
    safeString(mediaInfo?.mime_type) || safeString(initialMimeType) || "application/octet-stream";
  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    await sendUnsupportedMessage(senderPhone);
    return;
  }
  const downloaded = await metaFetchBinary(mediaUrl);
  const finalMimeType =
    safeString(mediaInfo?.mime_type) || safeString(downloaded.contentType) || mimeType;
  const extension = extensionFromMime(finalMimeType);
  const originalFileName =
    safeString(normalized.fileName) || `whatsapp-${Date.now()}.${extension}`;
  const safeMessageId = sanitizePathPart(messageId, crypto.randomUUID());
  const storagePath = [
    "whatsapp",
    senderPhone,
    `${Date.now()}-${safeMessageId}.${extension}`,
  ].join("/");
  const publicToken = crypto.randomUUID();
  const verificationUrl = `${PUBLIC_APP_BASE_URL}/v/${publicToken}`;
  const fileSize = Number(mediaInfo?.file_size) > 0
    ? Number(mediaInfo.file_size)
    : downloaded.bytes.byteLength || null;
  const fileSha256 = safeString(mediaInfo?.sha256);

  const storageStartedAtMs = Date.now();
  await uploadToStorage(
    SUPABASE_STORAGE_BUCKET,
    storagePath,
    downloaded.bytes,
    finalMimeType,
  );
  const operationCreateStartedAtMs = Date.now();
  const operation = await insertOperation(buildOperationPayload({
    normalized,
    mediaInfo,
    storagePath,
    mimeType: finalMimeType,
    fileName: originalFileName,
    fileSize,
    fileSha256,
    publicToken,
    signatureMode: signature.mode,
    pipelineRunId: runId,
  }));

  await Promise.allSettled([
    recordSpan({
      operationId: operation.id,
      runId,
      pipeline: "whatsapp_intake",
      stage: "media_lookup_download",
      status: "success",
      startedAtMs: mediaStartedAtMs,
      metadata: { byte_length: downloaded.bytes.byteLength, mime_type: finalMimeType },
    }),
    recordSpan({
      operationId: operation.id,
      runId,
      pipeline: "whatsapp_intake",
      stage: "storage_upload",
      status: "success",
      startedAtMs: storageStartedAtMs,
      metadata: { bucket: SUPABASE_STORAGE_BUCKET },
    }),
    recordSpan({
      operationId: operation.id,
      runId,
      pipeline: "whatsapp_intake",
      stage: "operation_create",
      status: "success",
      startedAtMs: operationCreateStartedAtMs,
      metadata: { signature_mode: signature.mode },
    }),
  ]);

  const setupStartedAtMs = Date.now();
  await Promise.allSettled([
    linkSenderAsUploader(
      operation.id,
      senderPhone,
      senderName,
      messageId,
      normalized.senderWaId,
    ),
    insertOperationEvent(operation.id, "file_uploaded", {
      source: "whatsapp",
      upload_origin: "whatsapp",
      message_id: messageId || null,
      media_id: mediaId || null,
      file_bucket: SUPABASE_STORAGE_BUCKET,
      file_path: storagePath,
      file_mime_type: finalMimeType,
      file_original_name: originalFileName,
      attachment_type: detectAttachmentType(finalMimeType, messageType),
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
      const message = truncateText(error instanceof Error ? error.message : String(error));
      await recordSpan({
        operationId: operation.id,
        runId,
        pipeline: "whatsapp_intake",
        stage: "analysis_execution",
        status: "error",
        startedAtMs: analysisStartedAtMs,
        metadata: { error: message },
      });
      throw error;
    }
  })();

  const qrPromise = runQrFlow({
    operationId: operation.id,
    runId,
    senderPhone,
    senderName,
    messageId,
    mediaId,
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

function verifyMetaChallenge(url: URL): Response {
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  if (mode === "subscribe" && token === META_VERIFY_TOKEN && challenge) {
    return textResponse(challenge, 200);
  }
  return textResponse("Forbidden", 403);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: RESPONSE_HEADERS });
  }
  if (req.method === "GET") {
    return verifyMetaChallenge(new URL(req.url));
  }
  if (req.method !== "POST") {
    return jsonResponse({ ok: false, error: "method_not_allowed", function: FUNCTION_NAME }, 405);
  }

  const webhookStartedAtMs = Date.now();
  const rawBody = new Uint8Array(await req.arrayBuffer());
  const signature = await verifyMetaSignature(
    rawBody,
    req.headers.get("x-hub-signature-256"),
  );
  if (!signature.ok) {
    const status = signature.mode === "not_configured" ? 503 : 403;
    console.error(JSON.stringify({
      function: FUNCTION_NAME,
      event: "meta_signature_rejected",
      signature_mode: signature.mode,
    }));
    return jsonResponse({ ok: false, error: "invalid_meta_signature", mode: signature.mode }, status);
  }
  if (signature.mode === "not_configured") {
    console.warn(JSON.stringify({
      function: FUNCTION_NAME,
      event: "meta_signature_verification_not_configured",
      require_signature: REQUIRE_META_SIGNATURE,
    }));
  }

  let body: any;
  try {
    body = JSON.parse(new TextDecoder().decode(rawBody));
  } catch {
    return textResponse("EVENT_RECEIVED", 200);
  }

  const task = processWebhookInBackground(
    body,
    webhookStartedAtMs,
    signature,
  ).catch((error) => {
    console.error(JSON.stringify({
      function: FUNCTION_NAME,
      error: error instanceof Error ? error.message : String(error),
    }));
  });

  if (typeof EdgeRuntime !== "undefined" && EdgeRuntime?.waitUntil) {
    EdgeRuntime.waitUntil(task);
  }
  return textResponse("EVENT_RECEIVED", 200);
});

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
// Optional secrets:
// - PUBLIC_APP_BASE_URL = https://app.sanadflow.com
// - SUPABASE_STORAGE_BUCKET = operation-files
// - SANAD_ANALYZE_FUNCTION_URL
// - SEND_UNSUPPORTED_REPLY = true
// - SEND_QR_REPLY = true
// - TRIGGER_ANALYSIS = true

type JsonRecord = Record<string, unknown>;

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

const PUBLIC_APP_BASE_URL =
  Deno.env.get("PUBLIC_APP_BASE_URL") || "https://app.sanadflow.com";

const SUPABASE_STORAGE_BUCKET =
  Deno.env.get("SUPABASE_STORAGE_BUCKET") || "operation-files";

const SANAD_ANALYZE_FUNCTION_URL =
  Deno.env.get("SANAD_ANALYZE_FUNCTION_URL") ||
  `${SUPABASE_URL}/functions/v1/sanad-v3-analyze-operation`;

const SEND_UNSUPPORTED_REPLY =
  (Deno.env.get("SEND_UNSUPPORTED_REPLY") || "true") !== "false";

const SEND_QR_REPLY = (Deno.env.get("SEND_QR_REPLY") || "true") !== "false";
const TRIGGER_ANALYSIS = (Deno.env.get("TRIGGER_ANALYSIS") || "true") !== "false";

const META_GRAPH_VERSION = "v20.0";
const META_GRAPH_BASE = `https://graph.facebook.com/${META_GRAPH_VERSION}`;

const FUNCTION_NAME = "sanad-v3-whatsapp-intake";

const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-sanad-internal-key",
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
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
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
  if (!mediaId) return false;
  if (!["image", "document"].includes(messageType)) return false;
  if (!ALLOWED_MIME_TYPES.has(mimeType)) return false;

  return true;
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

async function metaJson<T>(pathOrUrl: string, init: RequestInit = {}): Promise<T> {
  const url = pathOrUrl.startsWith("http")
    ? pathOrUrl
    : `${META_GRAPH_BASE}${pathOrUrl}`;

  const response = await fetch(url, {
    ...init,
    headers: {
      "Authorization": `Bearer ${META_WA_ACCESS_TOKEN}`,
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
    headers: {
      "Authorization": `Bearer ${META_WA_ACCESS_TOKEN}`,
    },
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

function normalizeWhatsAppPayload(body: any) {
  const value = body?.entry?.[0]?.changes?.[0]?.value || {};
  const message = value?.messages?.[0] || null;
  const contact = value?.contacts?.[0] || {};
  const status = value?.statuses?.[0] || null;

  if (!message) {
    return {
      ok: true,
      hasMessage: false,
      isStatusEvent: Boolean(status),
      rawWebhook: body,
      value,
      status,
      reason: status ? "delivery_status_event" : "no_message",
    };
  }

  const messageType = message.type || "unknown";
  const media = message.image || message.document || null;

  const from = message.from || contact.wa_id || "";
  const senderPhone = cleanPhone(from);
  const senderName = safeString(contact?.profile?.name);

  const mediaMime = safeString(media?.mime_type) || "";
  let fileName = safeString(media?.filename) || "";

  if (!fileName && media?.id) {
    const ext = extensionFromMime(mediaMime);
    fileName = `whatsapp-${message.id}.${ext}`;
  }

  return {
    ok: true,
    hasMessage: true,
    rawWebhook: body,
    value,
    message,
    contact,

    from,
    senderPhone,
    senderWaId: contact.wa_id || from,
    senderName,

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

async function processDeliveryStatuses(statuses: any[]): Promise<void> {
  if (!Array.isArray(statuses) || statuses.length === 0) return;

  for (const statusEvent of statuses) {
    const messageId = safeString(statusEvent?.id);
    const deliveryStatus = safeString(statusEvent?.status)?.toLowerCase();

    if (!messageId || !deliveryStatus) continue;

    const supportedStatuses = new Set([
      "sent",
      "delivered",
      "read",
      "failed",
    ]);

    if (!supportedStatuses.has(deliveryStatus)) continue;

    const timestampSeconds = Number(statusEvent?.timestamp);
    const eventAt = Number.isFinite(timestampSeconds) && timestampSeconds > 0
      ? new Date(timestampSeconds * 1000).toISOString()
      : new Date().toISOString();

    const firstError = Array.isArray(statusEvent?.errors)
      ? statusEvent.errors[0] || null
      : null;

    const errorCode = firstError?.code !== undefined &&
      firstError?.code !== null
      ? String(firstError.code)
      : null;

    const errorMessage =
      safeString(firstError?.title) ||
      safeString(firstError?.message) ||
      safeString(firstError?.error_data?.details) ||
      null;

    try {
      await supabaseJson(
        "/rest/v1/rpc/apply_report_whatsapp_delivery_status",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            p_message_id: messageId,
            p_status: deliveryStatus,
            p_event_at: eventAt,
            p_error_code: errorCode,
            p_error_message: errorMessage,
          }),
        },
      );

      console.log(JSON.stringify({
        function: FUNCTION_NAME,
        event: "whatsapp_delivery_status_processed",
        message_id: messageId,
        status: deliveryStatus,
      }));
    } catch (error) {
      console.error(JSON.stringify({
        function: FUNCTION_NAME,
        event: "whatsapp_delivery_status_failed",
        message_id: messageId,
        status: deliveryStatus,
        error: truncateText(
          error instanceof Error ? error.message : String(error),
        ),
      }));
    }
  }
}

async function findExistingOperationByMessageId(messageId: string): Promise<any | null> {
  if (!messageId) return null;

  try {
    const rows = await supabaseJson<any[]>(
      `/rest/v1/operations?select=id,public_token,status,ai_status,submitted_by_phone,created_at&storage_metadata->>meta_message_id=eq.${encodeURIComponent(messageId)}&limit=1`,
      {
        method: "GET",
        headers: {
          "Accept": "application/json",
        },
      },
    );

    return Array.isArray(rows) ? rows[0] ?? null : null;
  } catch {
    return null;
  }
}

async function uploadToStorage(
  bucket: string,
  path: string,
  bytes: Uint8Array,
  mimeType: string,
): Promise<void> {
  const encodedPath = encodeURIComponent(path).replace(/%2F/g, "/");

  const response = await fetch(
    `${SUPABASE_URL}/storage/v1/object/${bucket}/${encodedPath}`,
    {
      method: "POST",
      headers: supabaseHeaders({
        "Content-Type": mimeType,
        "x-upsert": "false",
      }),
      body: bytes,
    },
  );

  const text = await response.text();

  if (!response.ok) {
    throw new Error(
      `storage_upload_failed ${response.status}: ${truncateText(text)}`,
    );
  }
}

async function insertOperation(payload: JsonRecord): Promise<any> {
  const rows = await supabaseJson<any[]>(
    `/rest/v1/operations`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Prefer": "return=representation",
      },
      body: JSON.stringify(payload),
    },
  );

  const operation = Array.isArray(rows) ? rows[0] : rows;

  if (!operation?.id) {
    throw new Error("missing_inserted_operation_id");
  }

  return operation;
}

async function insertOperationEvent(
  operationId: string,
  eventType: string,
  metadata: JsonRecord,
  source = "whatsapp",
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
        source,
        metadata,
      }),
    },
  );
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
    await supabaseJson<any[]>(
      `/rest/v1/operation_user_links`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Prefer": "return=minimal",
        },
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
      },
    );
  } catch {
    // Non-critical. Do not fail intake because link insert failed.
  }
}

async function sendUnsupportedMessage(to: string): Promise<void> {
  if (!SEND_UNSUPPORTED_REPLY) return;

  await metaJson(`/${META_WA_PHONE_NUMBER_ID}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
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

async function downloadQrImage(verificationUrl: string): Promise<Uint8Array> {
  const qrUrl =
    "https://api.qrserver.com/v1/create-qr-code/?size=800x800&margin=32&format=png&data=" +
    encodeURIComponent(verificationUrl);

  const response = await fetch(qrUrl);

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`qr_download_failed ${response.status}: ${truncateText(text)}`);
  }

  return new Uint8Array(await response.arrayBuffer());
}

async function uploadQrToWhatsApp(qrBytes: Uint8Array): Promise<string> {
  const form = new FormData();

  form.append("messaging_product", "whatsapp");
  form.append("type", "image/png");
  form.append(
    "file",
    new Blob([qrBytes], { type: "image/png" }),
    "sanad-qr.png",
  );

  const response = await fetch(
    `${META_GRAPH_BASE}/${META_WA_PHONE_NUMBER_ID}/media`,
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${META_WA_ACCESS_TOKEN}`,
      },
      body: form,
    },
  );

  const text = await response.text();

  if (!response.ok) {
    throw new Error(`meta_qr_upload_failed ${response.status}: ${truncateText(text)}`);
  }

  const json = JSON.parse(text);
  const mediaId = json?.id;

  if (!mediaId) {
    throw new Error(`meta_qr_upload_missing_media_id: ${truncateText(text)}`);
  }

  return mediaId;
}

async function sendQrReplyToSender(
  to: string,
  qrMediaId: string,
  caption: string,
): Promise<any> {
  return await metaJson(`/${META_WA_PHONE_NUMBER_ID}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "image",
      image: {
        id: qrMediaId,
        caption,
      },
    }),
  });
}

async function triggerAnalysis(operationId: string, publicToken: string): Promise<void> {
  if (!TRIGGER_ANALYSIS) return;

  try {
    await fetch(SANAD_ANALYZE_FUNCTION_URL, {
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
  } catch {
    // Do not fail intake if analysis trigger failed.
    // The operation remains pending and can be retried later.
  }
}

function buildCaption(verificationUrl: string): string {
  return (
    "تم رفع الإشعار المالي إلى سند ✅\n\n" +
    "يمكنك عرض رمز التحقق أو مشاركة الرابط مع أي شخص تريد أن يتحقق من العملية.\n\n" +
    "رابط التحقق:\n" +
    verificationUrl +
    "\n\n" +
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
}) {
  const {
    normalized,
    mediaInfo,
    storagePath,
    mimeType,
    fileName,
    fileSize,
    fileSha256,
    publicToken,
  } = params;

  const senderPhone = normalized.senderPhone;
  const senderName = normalized.senderName;
  const messageId = normalized.messageId;

  return {
    public_token: publicToken,
    token_status: "active",

    source: "whatsapp",
    upload_origin: "whatsapp",

    submitted_by_user_id: null,
    submitted_by_phone: senderPhone,
    submitted_by_name: senderName,

    file_bucket: SUPABASE_STORAGE_BUCKET,
    file_path: storagePath,
    file_original_name: fileName,
    file_mime_type: mimeType,
    file_size: fileSize,
    file_sha256: fileSha256,

    storage_metadata: {
      meta_media_id: normalized.mediaId || null,
      meta_message_id: messageId || null,
      whatsapp_from: senderPhone || null,
      whatsapp_sender_name: senderName || null,
      whatsapp_timestamp: normalized.timestamp || null,
      whatsapp_message_type: normalized.messageType || null,
      whatsapp_caption: normalized.caption || null,
      meta_media_url_id: mediaInfo?.id || null,
      meta_media_sha256: mediaInfo?.sha256 || null,
      meta_media_file_size: mediaInfo?.file_size || null,
    },

    original_file_status: "stored",
    qr_status: "created",

    status: "stored",
    ai_status: "pending",

    raw_webhook_json: normalized.rawWebhook || null,

    client_upload_metadata: {
      source: "whatsapp",
      message_id: messageId || null,
      sender_phone: senderPhone || null,
      sender_name: senderName || null,
      caption: normalized.caption || null,
    },
  };
}

async function processWebhookInBackground(body: any): Promise<void> {
  const normalized = normalizeWhatsAppPayload(body);

  if (!normalized.hasMessage) {
    const deliveryStatuses = Array.isArray(normalized?.value?.statuses)
      ? normalized.value.statuses
      : normalized?.status
        ? [normalized.status]
        : [];

    if (normalized.isStatusEvent && deliveryStatuses.length > 0) {
      await processDeliveryStatuses(deliveryStatuses);
    }

    return;
  }

  const senderPhone = normalized.senderPhone;
  const senderName = normalized.senderName;
  const messageId = normalized.messageId;
  const mediaId = normalized.mediaId;
  const messageType = normalized.messageType;
  const initialMimeType = normalized.mimeType;

  if (!senderPhone) {
    return;
  }

  if (!isSupportedMedia(messageType, initialMimeType, mediaId)) {
    await sendUnsupportedMessage(senderPhone);
    return;
  }

  const existing = await findExistingOperationByMessageId(messageId);

  if (existing?.id) {
    return;
  }

  const mediaInfo = await metaJson<any>(`/${mediaId}`, {
    method: "GET",
  });

  const mediaUrl = safeString(mediaInfo?.url);

  if (!mediaUrl) {
    throw new Error("missing_meta_media_url");
  }

  const mimeType =
    safeString(mediaInfo?.mime_type) ||
    safeString(initialMimeType) ||
    "application/octet-stream";

  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    await sendUnsupportedMessage(senderPhone);
    return;
  }

  const downloaded = await metaFetchBinary(mediaUrl);

  const finalMimeType =
    safeString(mediaInfo?.mime_type) ||
    safeString(downloaded.contentType) ||
    mimeType;

  const extension = extensionFromMime(finalMimeType);

  const originalFileName =
    safeString(normalized.fileName) ||
    `whatsapp-${Date.now()}.${extension}`;

  const safeMessageId = sanitizePathPart(messageId, crypto.randomUUID());

  const storagePath = [
    "whatsapp",
    senderPhone || "unknown",
    `${Date.now()}-${safeMessageId}.${extension}`,
  ].join("/");

  const publicToken = crypto.randomUUID();

  const verificationUrl = `${PUBLIC_APP_BASE_URL}/v/${publicToken}`;
  const qrUrl =
    "https://api.qrserver.com/v1/create-qr-code/?size=800x800&data=" +
    encodeURIComponent(verificationUrl);

  const fileSize =
    Number(mediaInfo?.file_size) > 0
      ? Number(mediaInfo.file_size)
      : downloaded.bytes.byteLength || null;

  const fileSha256 = safeString(mediaInfo?.sha256);

  await uploadToStorage(
    SUPABASE_STORAGE_BUCKET,
    storagePath,
    downloaded.bytes,
    finalMimeType,
  );

  const operationPayload = buildOperationPayload({
    normalized,
    mediaInfo,
    storagePath,
    mimeType: finalMimeType,
    fileName: originalFileName,
    fileSize,
    fileSha256,
    publicToken,
  });

  const operation = await insertOperation(operationPayload);

  await linkSenderAsUploader(
    operation.id,
    senderPhone,
    senderName,
    messageId,
    normalized.senderWaId,
  );

  await insertOperationEvent(operation.id, "file_uploaded", {
    source: "whatsapp",
    upload_origin: "whatsapp",
    message_id: messageId || null,
    media_id: mediaId || null,
    file_bucket: SUPABASE_STORAGE_BUCKET,
    file_path: storagePath,
    file_mime_type: finalMimeType,
    file_original_name: originalFileName,
    attachment_type: detectAttachmentType(finalMimeType, messageType),
  });

  let qrSendResponse: any = null;

  if (SEND_QR_REPLY) {
    try {
      const qrBytes = await downloadQrImage(verificationUrl);
      const qrMediaId = await uploadQrToWhatsApp(qrBytes);
      qrSendResponse = await sendQrReplyToSender(
        senderPhone,
        qrMediaId,
        buildCaption(verificationUrl),
      );

      await insertOperationEvent(operation.id, "qr_created", {
        action: "qr_sent_to_sender",
        sent_to: senderPhone,
        sender_name: senderName || null,
        public_token: publicToken,
        verification_url: verificationUrl,
        qr_url: qrUrl,
        whatsapp_incoming_message_id: messageId || null,
        whatsapp_uploaded_media_id: mediaId || null,
        whatsapp_send_response: qrSendResponse,
      });
    } catch (error) {
      await insertOperationEvent(operation.id, "qr_created", {
        action: "qr_send_failed",
        error: truncateText(error instanceof Error ? error.message : String(error)),
        public_token: publicToken,
        verification_url: verificationUrl,
        qr_url: qrUrl,
      });
    }
  }

  await triggerAnalysis(operation.id, publicToken);
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
    return new Response("ok", {
      headers: CORS_HEADERS,
    });
  }

  if (req.method === "GET") {
    return verifyMetaChallenge(new URL(req.url));
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

  let body: any = null;

  try {
    body = await req.json();
  } catch {
    return textResponse("EVENT_RECEIVED", 200);
  }

  const task = processWebhookInBackground(body).catch((error) => {
    console.error(
      JSON.stringify({
        function: FUNCTION_NAME,
        error: error instanceof Error ? error.message : String(error),
      }),
    );
  });

  if (typeof EdgeRuntime !== "undefined" && EdgeRuntime?.waitUntil) {
    EdgeRuntime.waitUntil(task);
  }

  return textResponse("EVENT_RECEIVED", 200);
});
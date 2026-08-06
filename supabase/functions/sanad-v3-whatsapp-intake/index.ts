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
// - META_APP_SECRET
//
// Optional override:
// - REQUIRE_META_SIGNATURE=false is allowed only in an isolated development
//   environment. Production deployment sets it to true explicitly.

// @ts-types="npm:@types/qrcode@1.5.6"
import QRCode from "npm:qrcode@1.5.4";
import {
  deterministicStoragePath,
  extensionFromMime,
  sanitizePathPart,
} from "./intake-utils.ts";

type JsonRecord = Record<string, unknown>;
type SpanStatus = "success" | "error" | "skipped";
type PendingSpan = {
  stage: string;
  status: SpanStatus;
  started_at: string;
  completed_at: string;
  duration_ms: number;
  metadata: JsonRecord;
};
type SignatureMode = "verified" | "invalid" | "missing" | "not_configured";

type SignatureResult = {
  ok: boolean;
  mode: SignatureMode;
};

type IntakeClaim = {
  claimed: boolean;
  duplicate?: boolean;
  reason?: string;
  claim_token?: string;
  status?: string;
  stage?: string;
  pipeline_run_id?: string;
  attempt_count?: number;
  retry_after_seconds?: number;
  source_message_id?: string;
  webhook_envelope?: unknown;
  sender_phone?: string | null;
  media_id?: string | null;
  declared_mime_type?: string | null;
  signature_mode?: SignatureMode | null;
  storage_bucket?: string | null;
  storage_path?: string | null;
  storage_mime_type?: string | null;
  file_original_name?: string | null;
  file_size?: number | null;
  file_sha256?: string | null;
  media_metadata?: JsonRecord | null;
  operation_id?: string | null;
  public_token?: string | null;
};

type FinalizedOperation = {
  ok: boolean;
  idempotent: boolean;
  operation_id: string;
  public_token: string;
  pipeline_run_id: string;
  analysis_job_id?: string | null;
  preview_job_id?: string | null;
};

type MetaMessageSendResponse = {
  messages?: Array<{ id?: string }>;
};

class PipelineError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly retryable: boolean,
    readonly httpStatus?: number,
  ) {
    super(message);
    this.name = "PipelineError";
  }
}

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
  interactiveId: string;
};

type NormalizedStatus = {
  hasMessage: false;
  rawWebhook: unknown;
  value: JsonRecord;
  isStatusEvent: boolean;
  statuses: unknown[];
};

type NormalizedWebhook = NormalizedMessage | NormalizedStatus;

const SUPABASE_URL = mustGetEnv("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = mustGetEnv("SUPABASE_SERVICE_ROLE_KEY");

const META_APP_SECRET = Deno.env.get("META_APP_SECRET") || "";
const REQUIRE_META_SIGNATURE =
  (Deno.env.get("REQUIRE_META_SIGNATURE") || "true") !== "false";
const PUBLIC_APP_BASE_URL = Deno.env.get("PUBLIC_APP_BASE_URL") ||
  "https://app.sanadflow.com";
const PUBLIC_APP_ORIGIN = new URL(PUBLIC_APP_BASE_URL).origin;
const STORAGE_BUCKET = Deno.env.get("SUPABASE_STORAGE_BUCKET") ||
  "operation-files";
const ASSISTANT_URL = Deno.env.get("SANAD_WHATSAPP_ASSISTANT_FUNCTION_URL") ||
  `${SUPABASE_URL}/functions/v1/sanad-v3-whatsapp-assistant`;

const SEND_UNSUPPORTED_REPLY =
  (Deno.env.get("SEND_UNSUPPORTED_REPLY") || "true") !== "false";
const SEND_QR_REPLY = (Deno.env.get("SEND_QR_REPLY") || "true") !== "false";
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
    "authorization, x-client-info, apikey, content-type, x-sanad-internal-key, x-hub-signature-256, x-sanad-worker-token",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function mustGetEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function textResponse(
  text: string,
  status = 200,
  extraHeaders: HeadersInit = {},
): Response {
  return new Response(text, {
    status,
    headers: {
      ...RESPONSE_HEADERS,
      "Content-Type": "text/plain; charset=utf-8",
      ...extraHeaders,
    },
  });
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...RESPONSE_HEADERS,
      "Content-Type": "application/json; charset=utf-8",
    },
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

function asPipelineError(error: unknown, fallbackCode: string): PipelineError {
  if (error instanceof PipelineError) return error;
  if (error instanceof DOMException && error.name === "TimeoutError") {
    return new PipelineError(
      `${fallbackCode}_timeout`,
      `${fallbackCode}_timeout`,
      true,
      504,
    );
  }
  return new PipelineError(
    fallbackCode,
    truncate(error instanceof Error ? error.message : error),
    true,
  );
}

function normalizeSignatureMode(value: unknown): SignatureMode {
  return ["verified", "invalid", "missing", "not_configured"].includes(
      String(value),
    )
    ? String(value) as SignatureMode
    : "not_configured";
}

function supabaseHeaders(extra: HeadersInit = {}): HeadersInit {
  return {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    ...extra,
  };
}

async function supabaseJson<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(`${SUPABASE_URL}${path}`, {
    ...init,
    headers: supabaseHeaders(init.headers || {}),
    signal: init.signal || AbortSignal.timeout(15_000),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new PipelineError(
      "supabase_request_failed",
      `supabase_request_failed ${response.status}: ${truncate(text)}`,
      response.status === 408 || response.status === 429 ||
        response.status >= 500,
      response.status,
    );
  }
  return text ? JSON.parse(text) as T : null as T;
}

async function graphJson<T>(
  pathOrUrl: string,
  init: RequestInit = {},
): Promise<T> {
  const url = pathOrUrl.startsWith("http")
    ? pathOrUrl
    : `${GRAPH_BASE}${pathOrUrl}`;
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${mustGetEnv("META_WA_ACCESS_TOKEN")}`,
      ...(init.headers || {}),
    },
    signal: init.signal || AbortSignal.timeout(20_000),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new PipelineError(
      "meta_request_failed",
      `meta_request_failed ${response.status}: ${truncate(text)}`,
      response.status === 408 || response.status === 429 ||
        response.status >= 500,
      response.status,
    );
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
    text: cleanText(
      message?.text?.body ||
        message?.button?.text ||
        message?.interactive?.button_reply?.title ||
        message?.interactive?.list_reply?.title,
    ) || "",
    interactiveId: cleanText(
      message?.interactive?.button_reply?.id ||
        message?.interactive?.list_reply?.id ||
        message?.button?.payload,
    ) || "",
  };
}

function pendingSpan(params: {
  stage: string;
  status: SpanStatus;
  startedAtMs: number;
  completedAtMs: number;
  metadata?: JsonRecord;
}): PendingSpan {
  const startedAtMs = Math.max(0, Math.trunc(params.startedAtMs));
  const completedAtMs = Math.max(
    startedAtMs,
    Math.trunc(params.completedAtMs),
  );
  return {
    stage: params.stage,
    status: params.status,
    started_at: new Date(startedAtMs).toISOString(),
    completed_at: new Date(completedAtMs).toISOString(),
    duration_ms: Math.min(completedAtMs - startedAtMs, 3_600_000),
    metadata: params.metadata || {},
  };
}

async function processDeliveryStatuses(statuses: unknown[]): Promise<void> {
  for (const rawStatus of statuses) {
    const status = rawStatus as Record<string, any>;
    const messageId = cleanText(status.id);
    const deliveryStatus = cleanText(status.status)?.toLowerCase();
    if (
      !messageId || !deliveryStatus ||
      !["sent", "delivered", "read", "failed"].includes(deliveryStatus)
    ) {
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
    for (
      const rpcName of [
        "apply_report_whatsapp_delivery_status",
        "apply_whatsapp_campaign_delivery_status",
      ]
    ) {
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
    try {
      await supabaseJson(
        "/rest/v1/rpc/apply_transactional_whatsapp_delivery_status",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            p_message_id: messageId,
            p_status: deliveryStatus,
            p_event_at: eventAt,
            p_error: errorMessage || errorCode,
          }),
        },
      );
    } catch (error) {
      console.error(JSON.stringify({
        function: FUNCTION_NAME,
        event: "delivery_status_rpc_failed",
        rpc: "apply_transactional_whatsapp_delivery_status",
        message_id: messageId,
        error: truncate(error instanceof Error ? error.message : error),
      }));
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
  if (!queued?.message_id || queued.status !== "queued" || queued.duplicate) {
    return;
  }
  const response = await fetch(ASSISTANT_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-sanad-internal-key": mustGetEnv("SANAD_INTERNAL_API_KEY"),
    },
    body: JSON.stringify({
      message_id: queued.message_id,
      source: FUNCTION_NAME,
    }),
  });
  if (!response.ok) {
    throw new Error(
      `assistant_trigger_rejected ${response.status}: ${
        truncate(await response.text())
      }`,
    );
  }
}

async function claimIntake(
  message: NormalizedMessage,
  runId: string,
  signatureMode: SignatureMode,
): Promise<IntakeClaim> {
  return await supabaseJson<IntakeClaim>(
    "/rest/v1/rpc/claim_whatsapp_operation_intake",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        p_message_id: message.messageId,
        p_pipeline_run_id: runId,
        p_sender_phone: message.senderPhone,
        p_media_id: message.mediaId,
        p_declared_mime_type: message.mimeType,
        p_signature_mode: signatureMode,
        p_webhook_envelope: message.rawWebhook,
        p_lease_seconds: 180,
      }),
    },
  );
}

async function claimNextIntake(workerToken: string): Promise<IntakeClaim> {
  return await supabaseJson<IntakeClaim>(
    "/rest/v1/rpc/claim_next_whatsapp_operation_intake",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        p_worker_token: workerToken,
        p_lease_seconds: 180,
      }),
    },
  );
}

async function recordIntakeStorage(params: {
  messageId: string;
  claimToken: string;
  storagePath: string;
  mimeType: string;
  fileName: string;
  fileSize: number | null;
  fileSha256: string | null;
  mediaMetadata: JsonRecord;
}): Promise<void> {
  const recorded = await supabaseJson<boolean>(
    "/rest/v1/rpc/record_whatsapp_operation_intake_storage",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        p_message_id: params.messageId,
        p_claim_token: params.claimToken,
        p_storage_bucket: STORAGE_BUCKET,
        p_storage_path: params.storagePath,
        p_storage_mime_type: params.mimeType,
        p_file_original_name: params.fileName,
        p_file_size: params.fileSize,
        p_file_sha256: params.fileSha256,
        p_media_metadata: params.mediaMetadata,
      }),
    },
  );
  if (!recorded) {
    throw new PipelineError(
      "stale_intake_claim",
      "The WhatsApp intake storage checkpoint was rejected",
      true,
      409,
    );
  }
}

async function finalizeIntake(
  messageId: string,
  claimToken: string,
  payload: JsonRecord,
): Promise<FinalizedOperation> {
  return await supabaseJson<FinalizedOperation>(
    "/rest/v1/rpc/finalize_whatsapp_operation_intake",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        p_message_id: messageId,
        p_claim_token: claimToken,
        p_operation: payload,
      }),
    },
  );
}

async function completeIntake(params: {
  messageId: string;
  claimToken: string;
  deliveryStatus: "sent" | "skipped";
  externalMessageId?: string | null;
  qrMetadata?: JsonRecord;
  spans: PendingSpan[];
}): Promise<void> {
  const completed = await supabaseJson<boolean>(
    "/rest/v1/rpc/complete_whatsapp_operation_intake",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        p_message_id: params.messageId,
        p_claim_token: params.claimToken,
        p_qr_delivery_status: params.deliveryStatus,
        p_qr_external_message_id: params.externalMessageId || null,
        p_qr_metadata: params.qrMetadata || {},
        p_spans: params.spans,
      }),
    },
  );
  if (!completed) {
    throw new PipelineError(
      "stale_intake_claim",
      "The WhatsApp intake completion checkpoint was rejected",
      true,
      409,
    );
  }
}

async function failIntake(params: {
  messageId: string;
  claimToken: string;
  error: PipelineError;
}): Promise<string> {
  return await supabaseJson<string>(
    "/rest/v1/rpc/fail_whatsapp_operation_intake",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        p_message_id: params.messageId,
        p_claim_token: params.claimToken,
        p_retryable: params.error.retryable,
        p_error_code: params.error.code,
        p_error_message: params.error.message,
      }),
    },
  );
}

async function requestIntakeDrain(): Promise<void> {
  try {
    await supabaseJson(
      "/rest/v1/rpc/request_whatsapp_operation_intake_dispatch",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ p_reason: "worker_drain" }),
      },
    );
  } catch (error) {
    console.error(JSON.stringify({
      function: FUNCTION_NAME,
      event: "intake_drain_dispatch_failed",
      error: truncate(error instanceof Error ? error.message : error),
    }));
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
    headers: {
      Authorization: `Bearer ${mustGetEnv("META_WA_ACCESS_TOKEN")}`,
    },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) {
    throw new PipelineError(
      "meta_media_download_failed",
      `meta_media_download_failed ${response.status}: ${
        truncate(await response.text())
      }`,
      response.status === 408 || response.status === 429 ||
        response.status >= 500,
      response.status,
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
): Promise<"uploaded" | "already_exists"> {
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
      signal: AbortSignal.timeout(20_000),
    },
  );
  if (!response.ok) {
    const responseText = await response.text();
    if (
      (response.status === 400 || response.status === 409) &&
      /duplicate|already[ _-]?exists|resource[ _-]?already[ _-]?exists/i.test(
        responseText,
      )
    ) {
      return "already_exists";
    }
    throw new PipelineError(
      "storage_upload_failed",
      `storage_upload_failed ${response.status}: ${truncate(responseText)}`,
      response.status === 408 || response.status === 429 ||
        response.status >= 500,
      response.status,
    );
  }
  return "uploaded";
}

async function sendTextMessage(
  to: string,
  body: string,
): Promise<Record<string, any>> {
  return await graphJson(`/${mustGetEnv("META_WA_PHONE_NUMBER_ID")}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "text",
      text: { preview_url: true, body },
    }),
  });
}

async function handleGuidanceAction(
  message: NormalizedMessage,
): Promise<boolean> {
  const actionId = message.interactiveId;
  if (!actionId || !message.senderPhone) return false;

  if (actionId.startsWith("sanad_show_operation:")) {
    const token = actionId.slice("sanad_show_operation:".length).trim();
    if (!token) return true;
    const url = `${PUBLIC_APP_BASE_URL}/v/${encodeURIComponent(token)}`;
    await sendTextMessage(
      message.senderPhone,
      `هذه هي العملية التي أرسلتها إلى سند:\n${url}\n\nاعرض رمز QR الموجود داخلها على الكاشير أو الشخص الذي سيتحقق من العملية.`,
    );
    return true;
  }

  if (actionId.startsWith("sanad_business_intro:")) {
    await sendTextMessage(
      message.senderPhone,
      `سند ينظم ما يحدث بعد الدفع الإلكتروني.\n\nعندما يسجل النشاط التجاري حساباته المالية في سند، تصل الإشعارات المطابقة مباشرة إلى وارد المدفوعات الخاص بفريقه، ويمكن للكاشير مراجعتها عبر QR دون استلام هاتف العميل.\n\nتثبيت سند وبدء إعداد النشاط:\nhttps://sanadflow.com/install`,
    );
    return true;
  }

  return false;
}

async function sendUnsupported(to: string): Promise<void> {
  if (!SEND_UNSUPPORTED_REPLY || !to) return;
  await graphJson(`/${mustGetEnv("META_WA_PHONE_NUMBER_ID")}/messages`, {
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
    `${GRAPH_BASE}/${mustGetEnv("META_WA_PHONE_NUMBER_ID")}/media`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${mustGetEnv("META_WA_ACCESS_TOKEN")}`,
      },
      body: form,
      signal: AbortSignal.timeout(20_000),
    },
  );
  const text = await response.text();
  if (!response.ok) {
    throw new PipelineError(
      "meta_qr_upload_failed",
      `meta_qr_upload_failed ${response.status}: ${truncate(text)}`,
      response.status === 408 || response.status === 429 ||
        response.status >= 500,
      response.status,
    );
  }
  const mediaId = cleanText(JSON.parse(text)?.id);
  if (!mediaId) {
    throw new PipelineError(
      "meta_qr_upload_missing_media_id",
      "Meta accepted the QR upload without returning a media ID",
      true,
    );
  }
  return mediaId;
}

async function sendQr(
  to: string,
  mediaId: string,
  verificationUrl: string,
): Promise<MetaMessageSendResponse> {
  return await graphJson<MetaMessageSendResponse>(
    `/${mustGetEnv("META_WA_PHONE_NUMBER_ID")}/messages`,
    {
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
    },
  );
}

async function runQrFlow(params: {
  claimToken: string;
  message: NormalizedMessage;
  verificationUrl: string;
  spans: PendingSpan[];
  webhookStartedAtMs: number;
  intakeMetadata: JsonRecord;
}): Promise<void> {
  const startedAtMs = Date.now();
  if (!SEND_QR_REPLY) {
    const completedAtMs = Date.now();
    await completeIntake({
      messageId: params.message.messageId,
      claimToken: params.claimToken,
      deliveryStatus: "skipped",
      qrMetadata: { reason: "SEND_QR_REPLY=false" },
      spans: [
        ...params.spans,
        pendingSpan({
          stage: "qr_delivery",
          status: "skipped",
          startedAtMs,
          completedAtMs,
          metadata: { reason: "SEND_QR_REPLY=false" },
        }),
        pendingSpan({
          stage: "intake_total",
          status: "success",
          startedAtMs: params.webhookStartedAtMs,
          completedAtMs,
          metadata: params.intakeMetadata,
        }),
      ],
    });
    return;
  }

  const qr = await generateQr(params.verificationUrl);
  const mediaId = await uploadQrToMeta(qr);
  const sendResponse = await sendQr(
    params.message.senderPhone || "",
    mediaId,
    params.verificationUrl,
  );
  const externalMessageId = cleanText(sendResponse?.messages?.[0]?.id);
  const completedAtMs = Date.now();
  const qrMetadata = {
    action: "qr_sent_to_sender",
    generator: "internal:qrcode@1.5.4",
    verification_url: params.verificationUrl,
    meta_media_id: mediaId,
    meta_message_id: externalMessageId,
  };

  // One durable checkpoint records Meta acceptance, the QR event, and all
  // successful-path spans. Database-side exception isolation keeps optional
  // telemetry from turning an accepted QR delivery into a retry.
  await completeIntake({
    messageId: params.message.messageId,
    claimToken: params.claimToken,
    deliveryStatus: "sent",
    externalMessageId,
    qrMetadata,
    spans: [
      ...params.spans,
      pendingSpan({
        stage: "qr_delivery",
        status: "success",
        startedAtMs,
        completedAtMs,
        metadata: {
          generator: "internal:qrcode@1.5.4",
          meta_message_id: externalMessageId,
        },
      }),
      pendingSpan({
        stage: "intake_total",
        status: "success",
        startedAtMs: params.webhookStartedAtMs,
        completedAtMs,
        metadata: params.intakeMetadata,
      }),
    ],
  });
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
  existingClaim?: IntakeClaim,
): Promise<{ status: number; retryAfterSeconds?: number }> {
  if (!message.senderPhone) return { status: 200 };

  const supportedMedia = Boolean(
    message.mediaId &&
      ["image", "document"].includes(message.messageType) &&
      ALLOWED_MIME_TYPES.has(message.mimeType),
  );
  const supportedAssistant = message.messageType === "text" ||
    message.messageType === "interactive" ||
    message.messageType === "button" ||
    (message.messageType === "audio" && Boolean(message.mediaId));
  if (!supportedMedia) {
    await registerInbound(message, supportedAssistant);
    if (await handleGuidanceAction(message)) return { status: 200 };
    if (supportedAssistant) {
      await triggerAssistant(message);
      return { status: 200 };
    }
    await sendUnsupported(message.senderPhone);
    return { status: 200 };
  }

  // The operations trigger is the single source for WhatsApp contact capture
  // and onboarding dispatch. Claiming first prevents duplicate media webhooks
  // from repeating any ancillary database work before idempotency is known.
  const requestedRunId = crypto.randomUUID();
  const claim = existingClaim ||
    await claimIntake(message, requestedRunId, signature.mode);
  if (!claim.claimed) {
    if (claim.reason === "retry_not_due") {
      return {
        status: 503,
        retryAfterSeconds: Math.max(1, Number(claim.retry_after_seconds) || 1),
      };
    }
    return { status: 200 };
  }

  const claimToken = cleanText(claim.claim_token);
  const runId = cleanText(claim.pipeline_run_id) || requestedRunId;
  if (!claimToken) {
    throw new PipelineError(
      "missing_intake_claim_token",
      "The intake claim did not return a claim token",
      true,
    );
  }

  let operationId = cleanText(claim.operation_id);
  try {
    let mediaInfo = (claim.media_metadata || {}) as Record<string, any>;
    let storagePath = cleanText(claim.storage_path);
    let mimeType = cleanText(claim.storage_mime_type);
    let fileName = cleanText(claim.file_original_name);
    let fileSize = Number(claim.file_size) > 0 ? Number(claim.file_size) : null;
    let fileSha256 = cleanText(claim.file_sha256);
    let mediaStartedAtMs: number | null = null;
    let mediaCompletedAtMs: number | null = null;
    let storageStartedAtMs: number | null = null;
    let storageCompletedAtMs: number | null = null;
    let downloadedByteLength = 0;
    let storageUploadResult: "uploaded" | "already_exists" | "resumed" =
      "resumed";

    if (!storagePath) {
      mediaStartedAtMs = Date.now();
      mediaInfo = await fetchMediaInfo(message.mediaId);
      const mediaUrl = cleanText(mediaInfo.url);
      if (!mediaUrl) {
        throw new PipelineError(
          "missing_meta_media_url",
          "Meta media lookup did not return a download URL",
          true,
        );
      }
      const downloaded = await downloadMedia(mediaUrl);
      downloadedByteLength = downloaded.bytes.byteLength;
      mediaCompletedAtMs = Date.now();
      mimeType = (
        cleanText(mediaInfo.mime_type) ||
        cleanText(downloaded.contentType) ||
        message.mimeType
      ).split(";", 1)[0].trim().toLowerCase();
      if (!ALLOWED_MIME_TYPES.has(mimeType)) {
        try {
          await sendUnsupported(message.senderPhone);
        } catch {
          // The durable failure state below is the correctness boundary.
        }
        throw new PipelineError(
          "unsupported_meta_media_type",
          `Unsupported media type returned by Meta: ${mimeType}`,
          false,
          415,
        );
      }

      const extension = extensionFromMime(mimeType);
      fileName = cleanText(message.fileName) ||
        `whatsapp-${
          sanitizePathPart(message.messageId, "document")
        }.${extension}`;
      storagePath = deterministicStoragePath(
        message.senderPhone,
        message.messageId,
        mimeType,
      );
      fileSize = Number(mediaInfo.file_size) > 0
        ? Number(mediaInfo.file_size)
        : downloaded.bytes.byteLength || null;
      fileSha256 = cleanText(mediaInfo.sha256);

      storageStartedAtMs = Date.now();
      storageUploadResult = await uploadStorage(
        storagePath,
        downloaded.bytes,
        mimeType,
      );
      storageCompletedAtMs = Date.now();
      await recordIntakeStorage({
        messageId: message.messageId,
        claimToken,
        storagePath,
        mimeType,
        fileName,
        fileSize,
        fileSha256,
        mediaMetadata: {
          ...mediaInfo,
          downloaded_content_type: cleanText(downloaded.contentType),
          downloaded_byte_length: downloaded.bytes.byteLength,
        },
      });
    }

    if (!storagePath || !mimeType || !fileName) {
      throw new PipelineError(
        "incomplete_storage_checkpoint",
        "The intake storage checkpoint is incomplete",
        false,
      );
    }

    const createStartedAtMs = Date.now();
    let publicToken = cleanText(claim.public_token) || crypto.randomUUID();
    let finalized: FinalizedOperation;
    if (operationId && claim.public_token) {
      finalized = {
        ok: true,
        idempotent: true,
        operation_id: operationId,
        public_token: claim.public_token,
        pipeline_run_id: runId,
      };
    } else {
      finalized = await finalizeIntake(
        message.messageId,
        claimToken,
        operationPayload({
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
        }),
      );
    }
    const createCompletedAtMs = Date.now();
    operationId = finalized.operation_id;
    publicToken = finalized.public_token;
    if (!operationId || !publicToken) {
      throw new PipelineError(
        "incomplete_operation_checkpoint",
        "The intake finalization did not return an operation and public token",
        false,
      );
    }

    const successSpans: PendingSpan[] = [
      pendingSpan({
        stage: "media_lookup_download",
        status: mediaStartedAtMs === null ? "skipped" : "success",
        startedAtMs: mediaStartedAtMs ?? createStartedAtMs,
        completedAtMs: mediaCompletedAtMs ??
          mediaStartedAtMs ?? createStartedAtMs,
        metadata: {
          bytes: downloadedByteLength,
          mime_type: mimeType,
          resumed: mediaStartedAtMs === null,
        },
      }),
      pendingSpan({
        stage: "storage_upload",
        status: storageStartedAtMs === null ? "skipped" : "success",
        startedAtMs: storageStartedAtMs ?? createStartedAtMs,
        completedAtMs: storageCompletedAtMs ??
          storageStartedAtMs ?? createStartedAtMs,
        metadata: {
          bucket: claim.storage_bucket || STORAGE_BUCKET,
          upload_result: storageUploadResult,
          resumed: storageStartedAtMs === null,
        },
      }),
      pendingSpan({
        stage: "operation_create",
        status: finalized.idempotent ? "skipped" : "success",
        startedAtMs: createStartedAtMs,
        completedAtMs: createCompletedAtMs,
        metadata: {
          signature_mode: signature.mode,
          idempotent: finalized.idempotent,
          analysis_job_id: finalized.analysis_job_id || null,
          preview_job_id: finalized.preview_job_id || null,
        },
      }),
    ];

    const verificationUrl = `${PUBLIC_APP_BASE_URL}/v/${publicToken}`;
    await runQrFlow({
      claimToken,
      message,
      verificationUrl,
      spans: successSpans,
      webhookStartedAtMs,
      intakeMetadata: {
        signature_mode: signature.mode,
        analysis_execution: "durable_queue",
        attempt_count: claim.attempt_count || 1,
      },
    });
    return { status: 200 };
  } catch (error) {
    const pipelineError = asPipelineError(error, "whatsapp_intake_failed");
    try {
      const failureStatus = await failIntake({
        messageId: message.messageId,
        claimToken,
        error: pipelineError,
      });
      console.error(JSON.stringify({
        function: FUNCTION_NAME,
        event: "whatsapp_intake_attempt_failed",
        message_id: message.messageId,
        operation_id: operationId,
        pipeline_run_id: runId,
        retryable: pipelineError.retryable,
        failure_status: failureStatus,
        error_code: pipelineError.code,
        error: truncate(pipelineError.message),
      }));
    } catch (checkpointError) {
      console.error(JSON.stringify({
        function: FUNCTION_NAME,
        event: "whatsapp_intake_failure_checkpoint_failed",
        message_id: message.messageId,
        pipeline_run_id: runId,
        error: truncate(
          checkpointError instanceof Error
            ? checkpointError.message
            : checkpointError,
        ),
      }));
    }
    throw pipelineError;
  }
}

async function processWebhook(
  body: unknown,
  webhookStartedAtMs: number,
  signature: SignatureResult,
): Promise<{ status: number; retryAfterSeconds?: number }> {
  const normalized = normalizeWebhook(body);
  if (!normalized.hasMessage) {
    if (normalized.isStatusEvent) {
      await processDeliveryStatuses(normalized.statuses);
    }
    return { status: 200 };
  }
  return await processMessage(normalized, webhookStartedAtMs, signature);
}

async function processRecovery(
  workerToken: string,
  startedAtMs: number,
): Promise<{ status: number; retryAfterSeconds?: number }> {
  const claim = await claimNextIntake(workerToken);
  if (!claim.claimed) return { status: 200 };

  const messageId = cleanText(claim.source_message_id);
  const claimToken = cleanText(claim.claim_token);
  if (!messageId || !claimToken) {
    throw new PipelineError(
      "invalid_recovery_claim",
      "The intake recovery claim is missing its message or claim token",
      false,
    );
  }

  const normalized = normalizeWebhook(claim.webhook_envelope || {});
  if (
    !normalized.hasMessage ||
    normalized.messageId !== messageId ||
    !normalized.senderPhone ||
    !normalized.mediaId
  ) {
    const invalidClaim = new PipelineError(
      "invalid_recovery_webhook",
      "The durable intake webhook cannot be normalized for recovery",
      false,
    );
    try {
      await failIntake({ messageId, claimToken, error: invalidClaim });
    } catch {
      // The original recovery error remains the primary signal.
    }
    throw invalidClaim;
  }

  const signature: SignatureResult = {
    ok: true,
    mode: normalizeSignatureMode(claim.signature_mode),
  };
  try {
    return await processMessage(normalized, startedAtMs, signature, claim);
  } finally {
    await requestIntakeDrain();
  }
}

function verifyChallenge(url: URL): Response {
  const valid = url.searchParams.get("hub.mode") === "subscribe" &&
    url.searchParams.get("hub.verify_token") ===
      mustGetEnv("META_VERIFY_TOKEN") &&
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
  const workerToken = cleanText(req.headers.get("x-sanad-worker-token"));
  if (workerToken) {
    try {
      const outcome = await processRecovery(workerToken, webhookStartedAtMs);
      return textResponse(
        outcome.status === 200 ? "RECOVERY_PROCESSED" : "RECOVERY_RETRY_LATER",
        outcome.status,
        outcome.retryAfterSeconds
          ? { "Retry-After": String(outcome.retryAfterSeconds) }
          : {},
      );
    } catch (error) {
      const pipelineError = asPipelineError(error, "intake_recovery_failed");
      console.error(JSON.stringify({
        function: FUNCTION_NAME,
        event: "intake_recovery_failed",
        error_code: pipelineError.code,
        retryable: pipelineError.retryable,
        error: truncate(pipelineError.message),
      }));
      if (
        pipelineError.code === "supabase_request_failed" &&
        pipelineError.httpStatus === 403
      ) {
        return jsonResponse({ ok: false, error: "invalid_worker_token" }, 403);
      }
      return textResponse(
        pipelineError.retryable ? "RECOVERY_RETRY_LATER" : "RECOVERY_REJECTED",
        pipelineError.retryable ? 503 : 200,
        pipelineError.retryable ? { "Retry-After": "5" } : {},
      );
    }
  }

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

  try {
    const outcome = await processWebhook(body, webhookStartedAtMs, signature);
    return textResponse(
      outcome.status === 200 ? "EVENT_RECEIVED" : "EVENT_RETRY_LATER",
      outcome.status,
      outcome.retryAfterSeconds
        ? { "Retry-After": String(outcome.retryAfterSeconds) }
        : {},
    );
  } catch (error) {
    const pipelineError = asPipelineError(error, "webhook_processing_failed");
    console.error(JSON.stringify({
      function: FUNCTION_NAME,
      event: "webhook_processing_failed",
      error_code: pipelineError.code,
      retryable: pipelineError.retryable,
      error: truncate(pipelineError.message),
    }));
    return textResponse(
      pipelineError.retryable ? "EVENT_RETRY_LATER" : "EVENT_RECEIVED",
      pipelineError.retryable ? 503 : 200,
      pipelineError.retryable ? { "Retry-After": "5" } : {},
    );
  }
});

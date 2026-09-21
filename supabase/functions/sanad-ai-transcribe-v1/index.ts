import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.110.0";
import { cleanText, extractText, geminiInteraction, type Json } from "../_shared/sanad-agent-core.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";
const MODEL = "gemini-3.5-transcribe";
const MAX_AUDIO_BYTES = 4 * 1024 * 1024;
const MAX_RECORDING_MS = 90_000;
const MAX_BASE64_LENGTH = Math.ceil(MAX_AUDIO_BYTES * 4 / 3) + 32;
const BASE_ALLOWED_ORIGINS = [
  "https://app.sanadflow.com",
  "https://localhost",
  "http://localhost",
  "capacitor://localhost",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
];

const CONFIGURED_PREVIEW_ORIGINS = (Deno.env.get("SANAD_VOICE_PREVIEW_ORIGINS") ?? "")
  .split(",")
  .map((value) => value.trim())
  .filter((value) => /^https:\/\/[A-Za-z0-9.-]+(?::\d+)?$/.test(value));

const ALLOWED_ORIGINS = new Set([
  ...BASE_ALLOWED_ORIGINS,
  ...CONFIGURED_PREVIEW_ORIGINS,
]);
const ALLOWED_MIME = new Set([
  "audio/webm",
  "audio/ogg",
  "audio/wav",
  "audio/x-wav",
  "audio/mpeg",
  "audio/mp3",
  "audio/aac",
  "audio/m4a",
  "audio/mp4",
  "audio/opus",
  "audio/flac",
]);

const CUSTOM_VOCABULARY = [
  "سند",
  "إبداع",
  "إبداع سوفت",
  "العمقي",
  "الكريمي",
  "البصيري",
  "باحكم",
  "حضرموت",
  "المكلا",
  "ريال سعودي",
  "ريال يمني",
  "فاتورة",
  "كشف حساب",
  "سند قبض",
  "سند صرف",
];

function isAllowedOrigin(origin: string) {
  return ALLOWED_ORIGINS.has(origin);
}

function corsHeaders(req: Request) {
  const origin = req.headers.get("Origin") || "";
  const allowOrigin = isAllowedOrigin(origin) ? origin : "https://app.sanadflow.com";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function respond(req: Request, data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders(req),
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function voiceError(req: Request, code: string, status: number, requestId?: string) {
  return respond(req, {
    ok: false,
    error: code,
    ...(requestId ? { request_id: requestId } : {}),
  }, status);
}

function publicTranscriptionFailure(error: string): { code: string; status: number } {
  const normalized = error.toLowerCase();
  if (/gemini_429|gemini_5\d\d|network|fetch|upload_start_5\d\d|upload_finalize_5\d\d/.test(normalized)) {
    return { code: "service_unavailable", status: 503 };
  }
  return { code: "transcription_failed", status: 502 };
}

function normalizeMime(value: unknown) {
  const raw = cleanText(value, 120).toLowerCase();
  const base = raw.split(";")[0].trim();
  if (base === "audio/mp4") return "audio/m4a";
  if (base === "audio/x-wav") return "audio/wav";
  return base;
}

function decodeBase64(value: string): Uint8Array {
  const clean = value.replace(/^data:[^;]+;base64,/, "").replace(/\s+/g, "");
  if (!clean || clean.length > MAX_BASE64_LENGTH) throw new Error("audio_too_large");
  let binary = "";
  try {
    binary = atob(clean);
  } catch {
    throw new Error("invalid_audio_base64");
  }
  if (!binary.length || binary.length > MAX_AUDIO_BYTES) throw new Error("audio_too_large");
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function uploadGeminiFile(bytes: Uint8Array, mimeType: string) {
  const start = await fetch("https://generativelanguage.googleapis.com/upload/v1beta/files", {
    method: "POST",
    headers: {
      "x-goog-api-key": GEMINI_API_KEY,
      "X-Goog-Upload-Protocol": "resumable",
      "X-Goog-Upload-Command": "start",
      "X-Goog-Upload-Header-Content-Length": String(bytes.byteLength),
      "X-Goog-Upload-Header-Content-Type": mimeType,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ file: { display_name: "sanad-voice-dictation" } }),
  });
  if (!start.ok) throw new Error(`gemini_upload_start_${start.status}`);
  const uploadUrl = start.headers.get("x-goog-upload-url");
  if (!uploadUrl) throw new Error("gemini_upload_url_missing");

  const upload = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      "Content-Length": String(bytes.byteLength),
      "Content-Type": mimeType,
      "X-Goog-Upload-Offset": "0",
      "X-Goog-Upload-Command": "upload, finalize",
    },
    body: bytes,
  });
  const payload = await upload.json().catch(() => ({})) as Json;
  if (!upload.ok) throw new Error(`gemini_upload_finalize_${upload.status}`);

  const file = payload.file && typeof payload.file === "object" ? payload.file as Json : {};
  const uri = cleanText(file.uri, 1200);
  const name = cleanText(file.name, 300);
  if (!uri || !name) throw new Error("gemini_file_metadata_missing");
  return { uri, name };
}

async function deleteGeminiFile(name: string) {
  if (!/^files\/[A-Za-z0-9._-]+$/.test(name)) return;
  try {
    await fetch(`https://generativelanguage.googleapis.com/v1beta/${name}`, {
      method: "DELETE",
      headers: { "x-goog-api-key": GEMINI_API_KEY },
    });
  } catch {
    // Best effort. Gemini also expires uploaded files automatically.
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST") return voiceError(req, "method_not_allowed", 405);
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY || !GEMINI_API_KEY) {
    return voiceError(req, "voice_service_not_configured", 503);
  }

  const authorization = req.headers.get("Authorization") || "";
  if (!authorization.startsWith("Bearer ")) return voiceError(req, "authentication_required", 401);

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const token = authorization.slice("Bearer ".length).trim();
  const { data: authData, error: authError } = await userClient.auth.getUser(token);
  if (authError || !authData.user) return voiceError(req, "authentication_required", 401);

  let body: Json;
  try {
    body = await req.json() as Json;
  } catch {
    return voiceError(req, "invalid_json", 400);
  }

  const durationMs = Math.max(0, Number(body.duration_ms || 0) || 0);
  if (durationMs > MAX_RECORDING_MS + 1000) {
    return voiceError(req, "recording_too_long", 413);
  }

  const mimeType = normalizeMime(body.mime_type);
  if (!ALLOWED_MIME.has(mimeType) && mimeType !== "audio/m4a") {
    return voiceError(req, "unsupported_audio_type", 415);
  }

  let bytes: Uint8Array;
  try {
    bytes = decodeBase64(cleanText(body.audio_base64, MAX_BASE64_LENGTH));
  } catch (cause) {
    const error = cause instanceof Error ? cause.message : "invalid_audio";
    return voiceError(req, error, error === "audio_too_large" ? 413 : 400);
  }

  const startedAt = Date.now();
  const requestId = crypto.randomUUID();
  let uploadedName = "";
  let interaction: Json | null = null;
  try {
    const uploaded = await uploadGeminiFile(bytes, mimeType);
    uploadedName = uploaded.name;

    interaction = await geminiInteraction({
      model: MODEL,
      input: [{ type: "audio", uri: uploaded.uri, mime_type: mimeType }],
      generation_config: {
        transcription_config: {
          custom_vocabulary: CUSTOM_VOCABULARY,
          mode: "smart",
        },
      },
    }, GEMINI_API_KEY);

    const transcript = cleanText(extractText(interaction), 12000);
    if (!transcript) return voiceError(req, "transcript_empty", 422, requestId);

    const latencyMs = Date.now() - startedAt;
    const usage = interaction?.usage && typeof interaction.usage === "object" ? interaction.usage as Json : {};
    await adminClient.rpc("record_sanad_agent_server_metric_v1",{
      p_user_id:authData.user.id,
      p_thread_id:null,
      p_business_id:null,
      p_request_id:requestId,
      p_scope:"voice_transcription",
      p_status:"completed",
      p_transport:"json",
      p_model:MODEL,
      p_thinking_level:null,
      p_total_latency_ms:latencyMs,
      p_context_load_ms:null,
      p_attachment_context_ms:null,
      p_model_latency_ms:Number(interaction?.__sanad_http_latency_ms || 0) || null,
      p_tool_latency_ms:null,
      p_persistence_ms:null,
      p_tool_calls:0,
      p_failed_tool_calls:0,
      p_retry_count:Number(interaction?.__sanad_retry_count || 0) || 0,
      p_input_tokens:Number(usage.total_input_tokens ?? usage.input_tokens ?? 0) || 0,
      p_cached_tokens:Number(usage.total_cached_tokens ?? usage.cached_tokens ?? 0) || 0,
      p_output_tokens:Number(usage.total_output_tokens ?? usage.output_tokens ?? 0) || 0,
      p_total_tokens:Number(usage.total_tokens ?? 0) || 0,
      p_item_count:1,
      p_byte_count:bytes.byteLength,
      p_error_code:null,
      p_runtime_version:"sanad-voice-v2",
    }).catch(()=>null);

    return respond(req, {
      ok: true,
      request_id: requestId,
      transcript,
      model: MODEL,
      duration_ms: durationMs || null,
      latency_ms: latencyMs,
      mime_type: mimeType,
      byte_count: bytes.byteLength,
    });
  } catch (cause) {
    const error = cause instanceof Error ? cause.message : "transcription_failed";
    console.error("sanad_voice_transcription_failed", {
      user_id: authData.user.id,
      error: cleanText(error, 800),
      mime_type: mimeType,
      byte_length: bytes.byteLength,
    });
    await adminClient.rpc("record_sanad_agent_server_metric_v1",{
      p_user_id:authData.user.id,
      p_thread_id:null,
      p_business_id:null,
      p_request_id:requestId,
      p_scope:"voice_transcription",
      p_status:"failed",
      p_transport:"json",
      p_model:MODEL,
      p_thinking_level:null,
      p_total_latency_ms:Date.now()-startedAt,
      p_context_load_ms:null,
      p_attachment_context_ms:null,
      p_model_latency_ms:Number(interaction?.__sanad_http_latency_ms || 0) || null,
      p_tool_latency_ms:null,
      p_persistence_ms:null,
      p_tool_calls:0,
      p_failed_tool_calls:0,
      p_retry_count:Number(interaction?.__sanad_retry_count || 0) || 0,
      p_input_tokens:0,
      p_cached_tokens:0,
      p_output_tokens:0,
      p_total_tokens:0,
      p_item_count:1,
      p_byte_count:bytes.byteLength,
      p_error_code:publicTranscriptionFailure(error).code,
      p_runtime_version:"sanad-voice-v2",
    }).catch(()=>null);
    const failure = publicTranscriptionFailure(error);
    return voiceError(req, failure.code, failure.status, requestId);
  } finally {
    if (uploadedName) await deleteGeminiFile(uploadedName);
  }
});

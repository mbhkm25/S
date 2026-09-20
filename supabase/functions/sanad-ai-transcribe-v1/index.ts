import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.110.0";
import { cleanText, extractText, geminiInteraction, type Json } from "../_shared/sanad-agent-core.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";
const MODEL = "gemini-3.5-transcribe";
const MAX_AUDIO_BYTES = 4 * 1024 * 1024;
const MAX_BASE64_LENGTH = Math.ceil(MAX_AUDIO_BYTES * 4 / 3) + 32;
const ALLOWED_ORIGINS = new Set([
  "https://app.sanadflow.com",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
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

function corsHeaders(req: Request) {
  const origin = req.headers.get("Origin") || "";
  const allowOrigin = ALLOWED_ORIGINS.has(origin) ? origin : "https://app.sanadflow.com";
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
  if (req.method !== "POST") return respond(req, { ok: false, error: "method_not_allowed" }, 405);
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !GEMINI_API_KEY) {
    return respond(req, { ok: false, error: "voice_service_not_configured" }, 503);
  }

  const authorization = req.headers.get("Authorization") || "";
  if (!authorization.startsWith("Bearer ")) return respond(req, { ok: false, error: "authentication_required" }, 401);

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const token = authorization.slice("Bearer ".length).trim();
  const { data: authData, error: authError } = await userClient.auth.getUser(token);
  if (authError || !authData.user) return respond(req, { ok: false, error: "authentication_required" }, 401);

  let body: Json;
  try {
    body = await req.json() as Json;
  } catch {
    return respond(req, { ok: false, error: "invalid_json" }, 400);
  }

  const mimeType = normalizeMime(body.mime_type);
  if (!ALLOWED_MIME.has(mimeType) && mimeType !== "audio/m4a") {
    return respond(req, { ok: false, error: "unsupported_audio_type" }, 415);
  }

  let bytes: Uint8Array;
  try {
    bytes = decodeBase64(cleanText(body.audio_base64, MAX_BASE64_LENGTH));
  } catch (cause) {
    const error = cause instanceof Error ? cause.message : "invalid_audio";
    return respond(req, { ok: false, error }, error === "audio_too_large" ? 413 : 400);
  }

  const startedAt = Date.now();
  let uploadedName = "";
  try {
    const uploaded = await uploadGeminiFile(bytes, mimeType);
    uploadedName = uploaded.name;

    const interaction = await geminiInteraction({
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
    if (!transcript) return respond(req, { ok: false, error: "transcript_empty" }, 422);

    return respond(req, {
      ok: true,
      transcript,
      model: MODEL,
      duration_ms: Number(body.duration_ms || 0) || null,
      latency_ms: Date.now() - startedAt,
    });
  } catch (cause) {
    const error = cause instanceof Error ? cause.message : "transcription_failed";
    console.error("sanad_voice_transcription_failed", {
      user_id: authData.user.id,
      error: cleanText(error, 800),
      mime_type: mimeType,
      byte_length: bytes.byteLength,
    });
    return respond(req, { ok: false, error: cleanText(error, 800) || "transcription_failed" }, 502);
  } finally {
    if (uploadedName) await deleteGeminiFile(uploadedName);
  }
});

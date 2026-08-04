import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

type PreviewJob = {
  job_id: string;
  operation_id: string;
  source_bucket: string;
  source_path: string;
  source_mime_type: string;
  source_sha256?: string | null;
};

type ServiceClient = ReturnType<typeof createClient>;

const jsonHeaders = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};

function env(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`missing_env_${name}`);
  return value;
}

function reply(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: jsonHeaders });
}

function joinUrl(base: string, path: string): string {
  return `${base.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;
}

function escapeAttribute(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function isWebp(bytes: Uint8Array): boolean {
  if (bytes.byteLength < 12) return false;
  const header = new TextDecoder().decode(bytes.slice(0, 12));
  return header.startsWith("RIFF") && header.slice(8, 12) === "WEBP";
}

function buildPreviewHtml(sourceUrl: string, mimeType: string): string {
  const url = escapeAttribute(sourceUrl);
  const document = mimeType === "application/pdf"
    ? `<object id="document" data="${url}#page=1&toolbar=0&navpanes=0&scrollbar=0&view=FitH" type="application/pdf"><embed src="${url}#page=1&toolbar=0&navpanes=0&scrollbar=0&view=FitH" type="application/pdf"></embed></object>`
    : `<img id="document" src="${url}" alt="Operation document preview">`;

  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#fff}body{display:flex;align-items:center;justify-content:center}object,embed,img{display:block;width:100%;height:100%;border:0;background:#fff;object-fit:contain}</style></head><body>${document}</body></html>`;
}

async function renderWebp(sourceUrl: string, mimeType: string): Promise<Uint8Array> {
  const form = new FormData();
  form.append("files", new Blob([buildPreviewHtml(sourceUrl, mimeType)], { type: "text/html; charset=utf-8" }), "index.html");
  form.append("width", "1240");
  form.append("height", "1754");
  form.append("clip", "true");
  form.append("deviceScaleFactor", "1");
  form.append("format", "webp");
  form.append("omitBackground", "false");
  form.append("optimizeForSpeed", "true");
  form.append("waitDelay", mimeType === "application/pdf" ? "2200ms" : "600ms");

  const result = await fetch(joinUrl(env("GOTENBERG_URL"), "/forms/chromium/screenshot/html"), {
    method: "POST",
    headers: { "X-Gotenberg-Token": env("GOTENBERG_TOKEN") },
    body: form,
    signal: AbortSignal.timeout(25_000),
  });

  if (!result.ok) {
    const detail = (await result.text().catch(() => "")).slice(0, 300);
    throw new Error(`gotenberg_preview_failed_${result.status}_${detail}`);
  }

  const bytes = new Uint8Array(await result.arrayBuffer());
  if (!isWebp(bytes)) throw new Error("gotenberg_preview_invalid_webp");
  if (bytes.byteLength < 4_000) throw new Error("gotenberg_preview_too_small");
  return bytes;
}

async function recordFailure(service: ServiceClient, workerToken: string, job: PreviewJob, message: string): Promise<void> {
  try {
    await service.rpc("fail_operation_media_preview_job", {
      p_worker_token: workerToken,
      p_job_id: job.job_id,
      p_error: message,
    });
  } catch (error) {
    console.error("SANAD preview failure persistence failed", error);
  }
}

async function processJob(service: ServiceClient, workerToken: string, job: PreviewJob) {
  try {
    const { data: signed, error: signedError } = await service.storage.from(job.source_bucket).createSignedUrl(job.source_path, 600);
    if (signedError || !signed?.signedUrl) throw new Error(`source_sign_failed_${signedError?.message || "missing_url"}`);

    const preview = await renderWebp(signed.signedUrl, job.source_mime_type);
    const previewBucket = job.source_bucket || "operation-files";
    const version = (job.source_sha256 || Date.now().toString()).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64) || "source";
    const previewPath = `previews/operations/${job.operation_id}/${version}.webp`;

    const { error: uploadError } = await service.storage.from(previewBucket).upload(previewPath, preview, {
      contentType: "image/webp",
      cacheControl: "31536000",
      upsert: true,
    });
    if (uploadError) throw new Error(`preview_upload_failed_${uploadError.message}`);

    const { data: completed, error: completeError } = await service.rpc("complete_operation_media_preview_job", {
      p_worker_token: workerToken,
      p_job_id: job.job_id,
      p_preview_bucket: previewBucket,
      p_preview_path: previewPath,
      p_preview_size: preview.byteLength,
      p_preview_width: 1240,
      p_preview_height: 1754,
    });
    if (completeError) throw new Error(`preview_commit_failed_${completeError.message}`);
    if (completed !== true) throw new Error("preview_commit_rejected");

    return { ok: true, job_id: job.job_id, operation_id: job.operation_id, bytes: preview.byteLength };
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "preview_generation_failed";
    await recordFailure(service, workerToken, job, message);
    return { ok: false, job_id: job.job_id, operation_id: job.operation_id, error: message };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "GET") return reply({ ok: true, service: "sanad-operation-preview-worker" });
  if (req.method !== "POST") return reply({ ok: false, error: "method_not_allowed" }, 405);

  const workerToken = req.headers.get("x-sanad-worker-token")?.trim() || "";
  if (!workerToken) return reply({ ok: false, error: "missing_worker_token" }, 401);

  try {
    const service = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await service.rpc("claim_operation_media_preview_jobs", {
      p_worker_token: workerToken,
      p_limit: 1,
    });
    if (error) {
      const invalidToken = error.message?.includes("invalid_worker_token");
      return reply({ ok: false, error: invalidToken ? "invalid_worker_token" : "claim_failed" }, invalidToken ? 401 : 500);
    }

    const jobs = Array.isArray(data) ? data as PreviewJob[] : [];
    if (jobs.length === 0) return reply({ ok: true, claimed: 0, completed: 0, failed: 0, results: [] });

    const result = await processJob(service, workerToken, jobs[0]);
    return reply({
      ok: true,
      claimed: 1,
      completed: result.ok ? 1 : 0,
      failed: result.ok ? 0 : 1,
      results: [result],
    });
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : "worker_failed";
    console.error("SANAD operation preview worker failed", cause);
    return reply({ ok: false, error: "worker_failed", detail }, 500);
  }
});

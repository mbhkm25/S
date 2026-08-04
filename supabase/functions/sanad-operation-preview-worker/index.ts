import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

type PreviewJob = {
  job_id: string;
  operation_id: string;
  source_bucket: string;
  source_path: string;
  source_mime_type: string;
  source_sha256?: string | null;
  public_token?: string | null;
};

const jsonHeaders = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};

function env(name: string, fallback?: string): string {
  const value = Deno.env.get(name) || fallback;
  if (!value) throw new Error(`missing_env_${name}`);
  return value;
}

function joinUrl(base: string, path: string): string {
  return `${base.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;
}

function response(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: jsonHeaders });
}

function safeAttr(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function isWebp(bytes: Uint8Array): boolean {
  if (bytes.byteLength < 12) return false;
  const ascii = new TextDecoder().decode(bytes.slice(0, 12));
  return ascii.startsWith("RIFF") && ascii.slice(8, 12) === "WEBP";
}

function previewHtml(sourceUrl: string, mimeType: string): string {
  const url = safeAttr(sourceUrl);
  const isPdf = mimeType === "application/pdf";
  const content = isPdf
    ? `<object id="document" data="${url}#page=1&toolbar=0&navpanes=0&scrollbar=0&view=FitH" type="application/pdf"><embed src="${url}#page=1&toolbar=0&navpanes=0&scrollbar=0&view=FitH" type="application/pdf"></embed></object>`
    : `<img id="document" src="${url}" alt="Operation document preview" />`;

  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<style>
  html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#fff}
  body{display:flex;align-items:center;justify-content:center}
  object,embed,img{display:block;width:100%;height:100%;border:0;background:#fff;object-fit:contain}
</style>
</head>
<body>${content}
<script>
  window.status='loading';
  const element=document.getElementById('document');
  const ready=()=>{window.status='ready'};
  if(element){element.addEventListener('load',ready,{once:true});element.addEventListener('error',ready,{once:true});}
  setTimeout(ready,2200);
</script>
</body>
</html>`;
}

async function screenshotWithHtml(sourceUrl: string, mimeType: string): Promise<Uint8Array> {
  const form = new FormData();
  form.append("files", new Blob([previewHtml(sourceUrl, mimeType)], { type: "text/html; charset=utf-8" }), "index.html");
  form.append("width", "1240");
  form.append("height", "1754");
  form.append("clip", "true");
  form.append("deviceScaleFactor", "1");
  form.append("format", "webp");
  form.append("omitBackground", "false");
  form.append("optimizeForSpeed", "false");
  form.append("waitDelay", mimeType === "application/pdf" ? "2800ms" : "800ms");
  form.append("skipNetworkAlmostIdleEvent", "false");

  const result = await fetch(
    joinUrl(env("GOTENBERG_URL"), "/forms/chromium/screenshot/html"),
    {
      method: "POST",
      headers: { "X-Gotenberg-Token": env("GOTENBERG_TOKEN") },
      body: form,
    },
  );

  if (!result.ok) {
    const detail = (await result.text().catch(() => "")).slice(0, 500);
    throw new Error(`gotenberg_preview_failed_${result.status}_${detail}`);
  }

  const bytes = new Uint8Array(await result.arrayBuffer());
  if (!isWebp(bytes)) throw new Error("gotenberg_preview_invalid_webp");
  if (bytes.byteLength < 4_000) throw new Error("gotenberg_preview_too_small");
  return bytes;
}

async function processJob(
  service: ReturnType<typeof createClient>,
  workerToken: string,
  job: PreviewJob,
): Promise<{ job_id: string; operation_id: string; bytes?: number; ok: boolean; error?: string }> {
  try {
    const { data: signed, error: signedError } = await service.storage
      .from(job.source_bucket)
      .createSignedUrl(job.source_path, 600);
    if (signedError || !signed?.signedUrl) throw new Error(`source_sign_failed_${signedError?.message || "missing_url"}`);

    const preview = await screenshotWithHtml(signed.signedUrl, job.source_mime_type);
    const previewBucket = job.source_bucket || "operation-files";
    const version = (job.source_sha256 || Date.now().toString()).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64) || "source";
    const previewPath = `previews/operations/${job.operation_id}/${version}.webp`;

    const { error: uploadError } = await service.storage
      .from(previewBucket)
      .upload(previewPath, preview, {
        contentType: "image/webp",
        cacheControl: "31536000",
        upsert: true,
      });
    if (uploadError) throw new Error(`preview_upload_failed_${uploadError.message}`);

    const { data: completed, error: completeError } = await service.rpc(
      "complete_operation_media_preview_job",
      {
        p_worker_token: workerToken,
        p_job_id: job.job_id,
        p_preview_bucket: previewBucket,
        p_preview_path: previewPath,
        p_preview_size: preview.byteLength,
        p_preview_width: 1240,
        p_preview_height: 1754,
      },
    );
    if (completeError) throw new Error(`preview_commit_failed_${completeError.message}`);
    if (completed !== true) throw new Error("preview_commit_rejected");

    return { job_id: job.job_id, operation_id: job.operation_id, bytes: preview.byteLength, ok: true };
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "preview_generation_failed";
    await service.rpc("fail_operation_media_preview_job", {
      p_worker_token: workerToken,
      p_job_id: job.job_id,
      p_error: message,
    }).catch(() => undefined);
    return { job_id: job.job_id, operation_id: job.operation_id, ok: false, error: message };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "GET") return response({ ok: true, service: "sanad-operation-preview-worker" });
  if (req.method !== "POST") return response({ ok: false, error: "method_not_allowed" }, 405);

  const workerToken = req.headers.get("x-sanad-worker-token")?.trim() || "";
  if (!workerToken) return response({ ok: false, error: "missing_worker_token" }, 401);

  try {
    const body = await req.json().catch(() => ({}));
    const requestedLimit = Number(body?.limit || 3);
    const limit = Math.max(1, Math.min(Number.isFinite(requestedLimit) ? requestedLimit : 3, 5));
    const service = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data, error } = await service.rpc("claim_operation_media_preview_jobs", {
      p_worker_token: workerToken,
      p_limit: limit,
    });
    if (error) {
      const unauthorized = error.message?.includes("invalid_worker_token");
      return response({ ok: false, error: unauthorized ? "invalid_worker_token" : "claim_failed" }, unauthorized ? 401 : 500);
    }

    const jobs = Array.isArray(data) ? data as PreviewJob[] : [];
    if (jobs.length === 0) return response({ ok: true, claimed: 0, completed: 0, failed: 0, results: [] });

    const results = [] as Awaited<ReturnType<typeof processJob>>[];
    for (const job of jobs) results.push(await processJob(service, workerToken, job));

    return response({
      ok: true,
      claimed: jobs.length,
      completed: results.filter(item => item.ok).length,
      failed: results.filter(item => !item.ok).length,
      results,
    });
  } catch (cause) {
    console.error("SANAD operation preview worker failed", cause);
    return response({ ok: false, error: "worker_failed" }, 500);
  }
});

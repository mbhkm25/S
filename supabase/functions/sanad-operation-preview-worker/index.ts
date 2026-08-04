import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { Image } from "https://deno.land/x/imagescript@1.3.0/mod.ts";

type PreviewJob = {
  job_id: string;
  operation_id: string;
  source_bucket: string;
  source_path: string;
  source_mime_type: string;
  source_sha256?: string | null;
};
type ServiceClient = ReturnType<typeof createClient>;
type PreviewResult = {
  bytes: Uint8Array;
  width: number;
  height: number;
  metadata: Record<string, unknown>;
};

const PIPELINE_VERSION = "content-crop-v3";
const RESPONSE_HEADERS = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };

function env(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`missing_env_${name}`);
  return value;
}
function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: RESPONSE_HEADERS });
}
function isWebp(bytes: Uint8Array): boolean {
  if (bytes.length < 12) return false;
  const header = new TextDecoder().decode(bytes.slice(0, 12));
  return header.startsWith("RIFF") && header.slice(8, 12) === "WEBP";
}
function webpDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  if (!isWebp(bytes) || bytes.length < 30) return null;
  const kind = new TextDecoder().decode(bytes.slice(12, 16));
  if (kind === "VP8X") {
    return {
      width: 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16),
      height: 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16),
    };
  }
  if (kind === "VP8 ") {
    return {
      width: (bytes[26] | (bytes[27] << 8)) & 0x3fff,
      height: (bytes[28] | (bytes[29] << 8)) & 0x3fff,
    };
  }
  return null;
}
function addScreenshotOptions(form: FormData, width: number, height: number): void {
  form.append("width", String(width));
  form.append("height", String(height));
  form.append("clip", "true");
  form.append("deviceScaleFactor", "1");
  form.append("format", "png");
  form.append("omitBackground", "false");
  form.append("optimizeForSpeed", "true");
  form.append("waitDelay", "700ms");
}
async function renderPdfPageOne(sourceUrl: string): Promise<Uint8Array> {
  const form = new FormData();
  form.append("url", `${sourceUrl}#page=1&toolbar=0&navpanes=0&scrollbar=0&view=FitH`);
  addScreenshotOptions(form, 1600, 2200);
  const endpoint = `${env("GOTENBERG_URL").replace(/\/$/, "")}/forms/chromium/screenshot/url`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "X-Gotenberg-Token": env("GOTENBERG_TOKEN") },
    body: form,
    signal: AbortSignal.timeout(26000),
  });
  if (!response.ok) {
    throw new Error(`gotenberg_pdf_render_failed_${response.status}_${(await response.text().catch(() => "")).slice(0, 160)}`);
  }
  const type = response.headers.get("content-type") || "";
  if (!type.includes("image/png")) throw new Error(`gotenberg_pdf_render_unexpected_type_${type || "unknown"}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length < 10000) throw new Error("gotenberg_pdf_render_probably_blank");
  return bytes;
}
function detectContentBounds(image: Image): { x: number; y: number; width: number; height: number; mode: string } {
  const width = image.width;
  const height = image.height;
  const scanLimit = Math.min(height, Math.max(1, Math.round(height * 0.78)));
  const step = width > 1200 ? 3 : 2;
  let minX = width;
  let minY = scanLimit;
  let maxX = -1;
  let maxY = -1;
  let count = 0;

  for (let y = 0; y < scanLimit; y += step) {
    for (let x = 0; x < width; x += step) {
      const rgba = image.getRGBAAt(x, y);
      const r = rgba[0];
      const g = rgba[1];
      const b = rgba[2];
      const a = rgba[3];
      const luminance = (r * 299 + g * 587 + b * 114) / 1000;
      const spread = Math.max(r, g, b) - Math.min(r, g, b);
      if (a > 20 && (luminance < 244 || spread > 16)) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
        count += 1;
      }
    }
  }

  if (count < 100 || maxX <= minX || maxY <= minY) {
    return { x: 0, y: 0, width, height: Math.max(1, Math.round(height * 0.7)), mode: "upper-70-fallback" };
  }

  const detectedWidth = maxX - minX + 1;
  const padding = Math.max(18, Math.round(detectedWidth * 0.025));
  const x = Math.max(0, minX - padding);
  const y = Math.max(0, minY - padding);
  const right = Math.min(width - 1, maxX + padding);
  const bottom = Math.min(scanLimit - 1, maxY + padding);
  return { x, y, width: right - x + 1, height: bottom - y + 1, mode: "content-detected" };
}
async function buildPdfPreview(sourceUrl: string): Promise<PreviewResult> {
  const png = await renderPdfPageOne(sourceUrl);
  const image = await Image.decode(png);
  const originalWidth = image.width;
  const originalHeight = image.height;
  const bounds = detectContentBounds(image);
  image.crop(bounds.x, bounds.y, bounds.width, bounds.height);
  if (image.width > 1400) image.resize(1400, Image.RESIZE_AUTO);
  const bytes = await image.encodeWEBP(84);
  if (!isWebp(bytes)) throw new Error("pdf_preview_encode_invalid_webp");
  return {
    bytes,
    width: image.width,
    height: image.height,
    metadata: {
      source_type: "pdf",
      page: 1,
      mode: bounds.mode,
      render_width: originalWidth,
      render_height: originalHeight,
      crop_x: bounds.x,
      crop_y: bounds.y,
      crop_width: bounds.width,
      crop_height: bounds.height,
      output_width: image.width,
      output_height: image.height,
    },
  };
}
async function buildImagePreview(source: Uint8Array, mime: string): Promise<PreviewResult> {
  if (mime === "image/webp" && isWebp(source)) {
    const dimensions = webpDimensions(source);
    if (!dimensions) throw new Error("source_webp_dimensions_unknown");
    return {
      bytes: source,
      width: dimensions.width,
      height: dimensions.height,
      metadata: { source_type: "image", mode: "preserve-original-webp", original_width: dimensions.width, original_height: dimensions.height },
    };
  }
  const image = await Image.decode(source);
  const originalWidth = image.width;
  const originalHeight = image.height;
  if (image.width > 1600) image.resize(1600, Image.RESIZE_AUTO);
  const bytes = await image.encodeWEBP(84);
  if (!isWebp(bytes)) throw new Error("image_preview_encode_invalid_webp");
  return {
    bytes,
    width: image.width,
    height: image.height,
    metadata: {
      source_type: "image",
      mode: "preserve-bounds",
      original_width: originalWidth,
      original_height: originalHeight,
      output_width: image.width,
      output_height: image.height,
    },
  };
}
async function recordFailure(service: ServiceClient, workerToken: string, job: PreviewJob, message: string): Promise<void> {
  try {
    const { error } = await service.rpc("fail_operation_media_preview_job", {
      p_worker_token: workerToken,
      p_job_id: job.job_id,
      p_error: message.slice(0, 500),
    });
    if (error) console.error("SANAD preview failure record RPC failed", error.message);
  } catch (error) {
    console.error("SANAD preview failure could not be recorded", error);
  }
}
async function processJob(service: ServiceClient, workerToken: string, job: PreviewJob) {
  try {
    const { data: sourceBlob, error: downloadError } = await service.storage.from(job.source_bucket).download(job.source_path);
    if (downloadError || !sourceBlob) throw new Error(`source_download_failed_${downloadError?.message || "missing_blob"}`);
    const source = new Uint8Array(await sourceBlob.arrayBuffer());
    let preview: PreviewResult;

    if (job.source_mime_type === "application/pdf") {
      const { data: signed, error: signError } = await service.storage.from(job.source_bucket).createSignedUrl(job.source_path, 600);
      if (signError || !signed?.signedUrl) throw new Error(`source_sign_failed_${signError?.message || "missing_url"}`);
      preview = await buildPdfPreview(signed.signedUrl);
    } else if (job.source_mime_type.startsWith("image/")) {
      preview = await buildImagePreview(source, job.source_mime_type);
    } else {
      throw new Error(`preview_unsupported_mime_${job.source_mime_type}`);
    }

    const safeVersion = (job.source_sha256 || Date.now().toString()).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64) || "source";
    const previewBucket = job.source_bucket || "operation-files";
    const previewPath = `previews/operations/${job.operation_id}/${safeVersion}-${PIPELINE_VERSION}.webp`;
    const { error: uploadError } = await service.storage.from(previewBucket).upload(previewPath, preview.bytes, {
      contentType: "image/webp",
      cacheControl: "31536000",
      upsert: true,
    });
    if (uploadError) throw new Error(`preview_upload_failed_${uploadError.message}`);

    const { data: completed, error: completionError } = await service.rpc("complete_operation_media_preview_job_v2", {
      p_worker_token: workerToken,
      p_job_id: job.job_id,
      p_preview_bucket: previewBucket,
      p_preview_path: previewPath,
      p_preview_size: preview.bytes.length,
      p_preview_width: preview.width,
      p_preview_height: preview.height,
      p_pipeline_version: PIPELINE_VERSION,
      p_crop_metadata: preview.metadata,
    });
    if (completionError || completed !== true) throw new Error(`preview_commit_rejected_${completionError?.message || "false"}`);
    return { ok: true, job_id: job.job_id, operation_id: job.operation_id, bytes: preview.bytes.length, width: preview.width, height: preview.height, pipeline: PIPELINE_VERSION };
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "preview_generation_failed";
    await recordFailure(service, workerToken, job, message);
    return { ok: false, job_id: job.job_id, operation_id: job.operation_id, error: message };
  }
}

Deno.serve(async (request: Request) => {
  if (request.method === "GET") return json({ ok: true, service: "sanad-operation-preview-worker", pipeline: PIPELINE_VERSION });
  if (request.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
  const workerHeader = request.headers.get("x-sanad-worker-token")?.trim() || "";
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() || "";
  const internalCall = bearer !== "" && bearer === env("SUPABASE_SERVICE_ROLE_KEY");
  try {
    const service = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false, autoRefreshToken: false } });
    let workerToken = workerHeader;
    if (internalCall && !workerToken) {
      const { data, error } = await service.rpc("get_operation_media_preview_worker_token_internal");
      if (error || !data) return json({ ok: false, error: "worker_token_unavailable" }, 500);
      workerToken = String(data);
    }
    if (!workerToken) return json({ ok: false, error: "missing_worker_token" }, 401);
    const { data, error } = await service.rpc("claim_operation_media_preview_jobs", { p_worker_token: workerToken, p_limit: 1 });
    if (error) return json({ ok: false, error: error.message?.includes("invalid_worker_token") ? "invalid_worker_token" : "claim_failed" }, error.message?.includes("invalid_worker_token") ? 401 : 500);
    const jobs = Array.isArray(data) ? data as PreviewJob[] : [];
    if (jobs.length === 0) return json({ ok: true, claimed: 0, completed: 0, failed: 0, results: [] });
    const result = await processJob(service, workerToken, jobs[0]);
    return json({ ok: true, claimed: 1, completed: result.ok ? 1 : 0, failed: result.ok ? 0 : 1, results: [result] });
  } catch (cause) {
    console.error("SANAD operation preview worker failed", cause);
    return json({ ok: false, error: "worker_failed", detail: cause instanceof Error ? cause.message : "worker_failed" }, 500);
  }
});

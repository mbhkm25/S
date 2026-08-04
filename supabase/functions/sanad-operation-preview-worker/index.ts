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
type Bounds = { x: number; y: number; width: number; height: number };
type PreviewResult = { bytes: Uint8Array; width: number; height: number; metadata: Record<string, unknown> };

const PIPELINE_VERSION = "content-crop-v5";
const RESPONSE_HEADERS = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };

function env(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`missing_env_${name}`);
  return value;
}

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: RESPONSE_HEADERS });
}

function isWebp(bytes: Uint8Array) {
  if (bytes.length < 12) return false;
  const header = new TextDecoder().decode(bytes.slice(0, 12));
  return header.startsWith("RIFF") && header.slice(8, 12) === "WEBP";
}

function webpDimensions(bytes: Uint8Array) {
  if (!isWebp(bytes) || bytes.length < 30) return null;
  const kind = new TextDecoder().decode(bytes.slice(12, 16));
  if (kind === "VP8X") return { width: 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16), height: 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16) };
  if (kind === "VP8 ") return { width: (bytes[26] | (bytes[27] << 8)) & 0x3fff, height: (bytes[28] | (bytes[29] << 8)) & 0x3fff };
  return null;
}

async function gotenberg(route: string, form: FormData, timeout = 30000) {
  const response = await fetch(`${env("GOTENBERG_URL").replace(/\/$/, "")}${route}`, {
    method: "POST",
    headers: { "X-Gotenberg-Token": env("GOTENBERG_TOKEN") },
    body: form,
    signal: AbortSignal.timeout(timeout),
  });
  if (!response.ok) throw new Error(`gotenberg_failed_${response.status}_${(await response.text().catch(() => "")).slice(0, 160)}`);
  return new Uint8Array(await response.arrayBuffer());
}

async function renderPdfPageOne(sourceUrl: string) {
  const form = new FormData();
  form.append("url", `${sourceUrl}#page=1&toolbar=0&navpanes=0&scrollbar=0&zoom=page-width`);
  for (const [key, value] of Object.entries({ width: "1600", height: "2200", clip: "true", deviceScaleFactor: "2", format: "png", omitBackground: "false", optimizeForSpeed: "true", waitDelay: "900ms" })) form.append(key, value);
  const bytes = await gotenberg("/forms/chromium/screenshot/url", form, 32000);
  if (bytes.length < 10000 || bytes[0] !== 137 || bytes[1] !== 80) throw new Error("gotenberg_pdf_render_invalid_png");
  return bytes;
}

async function pngToWebp(png: Uint8Array, width: number, height: number) {
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;width:${width}px;height:${height}px;overflow:hidden;background:#fff}img{display:block;width:${width}px;height:${height}px}</style></head><body><img id="source" src="source.png"><script>source.onload=()=>window.__READY__=true</script></body></html>`;
  const form = new FormData();
  form.append("files", new Blob([html], { type: "text/html;charset=utf-8" }), "index.html");
  form.append("files", new Blob([png], { type: "image/png" }), "source.png");
  for (const [key, value] of Object.entries({ width: String(width), height: String(height), clip: "true", deviceScaleFactor: "1", format: "webp", omitBackground: "false", optimizeForSpeed: "true", waitDelay: "30ms", waitForExpression: "window.__READY__ === true", failOnResourceLoadingFailed: "true" })) form.append(key, value);
  const bytes = await gotenberg("/forms/chromium/screenshot/html", form, 20000);
  if (!isWebp(bytes)) throw new Error("webp_encoding_stage_invalid");
  return bytes;
}

function luminance(r: number, g: number, b: number) {
  return (r * 299 + g * 587 + b * 114) / 1000;
}

function hasContent(bitmap: Uint8Array, canvasWidth: number, x: number, y: number) {
  const i = (y * canvasWidth + x) * 4;
  const r = bitmap[i], g = bitmap[i + 1], b = bitmap[i + 2], a = bitmap[i + 3];
  return a > 20 && (luminance(r, g, b) < 238 || Math.max(r, g, b) - Math.min(r, g, b) > 16);
}

function detectWhitePage(image: Image): Bounds {
  const step = image.width > 2400 ? 6 : 4;
  let x0 = image.width, y0 = image.height, x1 = -1, y1 = -1;
  for (let y = 0; y < image.height; y += step) {
    for (let x = 0; x < image.width; x += step) {
      const i = (y * image.width + x) * 4;
      if (image.bitmap[i + 3] > 20 && luminance(image.bitmap[i], image.bitmap[i + 1], image.bitmap[i + 2]) > 210) {
        x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
      }
    }
  }
  if (x1 <= x0 || y1 <= y0) return { x: 0, y: 0, width: image.width, height: image.height };
  const inset = Math.max(4, Math.round(Math.min(x1 - x0, y1 - y0) * 0.004));
  return { x: x0 + inset, y: y0 + inset, width: Math.max(1, x1 - x0 + 1 - inset * 2), height: Math.max(1, y1 - y0 + 1 - inset * 2) };
}

function detectReceiptCrop(image: Image) {
  const page = detectWhitePage(image);
  const step = page.width > 1800 ? 4 : 3;
  const rowStep = Math.max(2, step);
  const minimumRowHits = Math.max(3, Math.round(page.width / step * 0.003));
  let x0 = page.x + page.width - 1, y0 = page.y + page.height - 1, x1 = page.x, y1 = page.y, count = 0;
  const activeRows: number[] = [];

  // v5 scans the complete page. v4 stopped at 55% and could discard totals,
  // beneficiary identifiers, signatures, or the lower half of the receipt.
  for (let y = page.y; y < page.y + page.height; y += rowStep) {
    let rowHits = 0;
    for (let x = page.x; x < page.x + page.width; x += step) {
      if (!hasContent(image.bitmap, image.width, x, y)) continue;
      rowHits += 1; count += 1;
      x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
    }
    if (rowHits >= minimumRowHits) activeRows.push(y);
  }

  const enough = count >= Math.max(180, Math.round(page.width * page.height / 18000));
  if (!enough || activeRows.length < 2 || x1 <= x0 || y1 <= y0) {
    return { crop: page, page, mode: "full-page-safe-fallback", layoutClass: "full_page_receipt", confidence: 0.55, edgeSafetyPassed: true };
  }

  const widthRatio = (x1 - x0 + 1) / page.width;
  const layoutClass = widthRatio >= 0.72 ? "full_width_receipt" : "centered_receipt";
  const horizontalPad = Math.max(14, Math.round(page.width * 0.018));
  const verticalPad = Math.max(18, Math.round(page.height * 0.022));
  let x = layoutClass === "full_width_receipt" ? page.x : Math.max(page.x, x0 - horizontalPad);
  let right = layoutClass === "full_width_receipt" ? page.x + page.width - 1 : Math.min(page.x + page.width - 1, x1 + horizontalPad);
  let y = Math.max(page.y, y0 - verticalPad);
  let bottom = Math.min(page.y + page.height - 1, y1 + verticalPad + Math.round(page.height * 0.035));
  let width = Math.max(1, right - x + 1);
  let height = Math.max(1, bottom - y + 1);

  const probe = Math.max(3, Math.round(Math.min(width, height) * 0.004));
  let edgeHits = 0, probes = 0;
  for (let px = x; px < x + width; px += Math.max(5, step * 2)) {
    for (const py of [y + probe, y + height - 1 - probe]) { probes += 1; if (hasContent(image.bitmap, image.width, px, py)) edgeHits += 1; }
  }
  for (let py = y; py < y + height; py += Math.max(5, step * 2)) {
    for (const px of [x + probe, x + width - 1 - probe]) { probes += 1; if (hasContent(image.bitmap, image.width, px, py)) edgeHits += 1; }
  }
  const edgeSafetyPassed = probes === 0 || edgeHits / probes < 0.12;
  if (!edgeSafetyPassed) { x = page.x; y = page.y; width = page.width; height = page.height; }

  return { crop: { x, y, width, height }, page, mode: edgeSafetyPassed ? "full-content-union" : "full-page-edge-safe-fallback", layoutClass, confidence: edgeSafetyPassed ? 0.94 : 0.78, edgeSafetyPassed };
}

async function buildPdfPreview(sourceUrl: string): Promise<PreviewResult> {
  const image = await Image.decode(await renderPdfPageOne(sourceUrl));
  const renderWidth = image.width, renderHeight = image.height;
  const detected = detectReceiptCrop(image);
  image.crop(detected.crop.x, detected.crop.y, detected.crop.width, detected.crop.height);
  if (image.width > 1600) image.resize(1600, Image.RESIZE_AUTO);
  const bytes = await pngToWebp(await image.encode(3), image.width, image.height);
  return { bytes, width: image.width, height: image.height, metadata: { source_type: "pdf", page: 1, mode: detected.mode, layout_class: detected.layoutClass, crop_confidence: detected.confidence, edge_safety_passed: detected.edgeSafetyPassed, render_width: renderWidth, render_height: renderHeight, page_bounds: detected.page, crop_x: detected.crop.x, crop_y: detected.crop.y, crop_width: detected.crop.width, crop_height: detected.crop.height, output_width: image.width, output_height: image.height } };
}

async function buildImagePreview(source: Uint8Array, mime: string): Promise<PreviewResult> {
  if (mime === "image/webp" && isWebp(source)) {
    const d = webpDimensions(source); if (!d) throw new Error("source_webp_dimensions_unknown");
    return { bytes: source, width: d.width, height: d.height, metadata: { source_type: "image", mode: "preserve-original-webp", original_width: d.width, original_height: d.height } };
  }
  const image = await Image.decode(source);
  const originalWidth = image.width, originalHeight = image.height;
  if (image.width > 1600) image.resize(1600, Image.RESIZE_AUTO);
  const bytes = await pngToWebp(await image.encode(3), image.width, image.height);
  return { bytes, width: image.width, height: image.height, metadata: { source_type: "image", mode: "preserve-bounds", original_width: originalWidth, original_height: originalHeight, output_width: image.width, output_height: image.height } };
}

async function recordFailure(service: ServiceClient, token: string, job: PreviewJob, message: string) {
  await service.rpc("fail_operation_media_preview_job", { p_worker_token: token, p_job_id: job.job_id, p_error: message.slice(0, 500) }).catch(() => null);
}

async function processJob(service: ServiceClient, token: string, job: PreviewJob) {
  try {
    const { data: blob, error: downloadError } = await service.storage.from(job.source_bucket).download(job.source_path);
    if (downloadError || !blob) throw new Error(`source_download_failed_${downloadError?.message || "missing_blob"}`);
    const source = new Uint8Array(await blob.arrayBuffer());
    let preview: PreviewResult;
    if (job.source_mime_type === "application/pdf") {
      const { data: signed, error: signError } = await service.storage.from(job.source_bucket).createSignedUrl(job.source_path, 600);
      if (signError || !signed?.signedUrl) throw new Error(`source_sign_failed_${signError?.message || "missing_url"}`);
      preview = await buildPdfPreview(signed.signedUrl);
    } else if (job.source_mime_type.startsWith("image/")) preview = await buildImagePreview(source, job.source_mime_type);
    else throw new Error(`preview_unsupported_mime_${job.source_mime_type}`);

    const version = (job.source_sha256 || Date.now().toString()).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64) || "source";
    const bucket = job.source_bucket || "operation-files";
    const path = `previews/operations/${job.operation_id}/${version}-${PIPELINE_VERSION}.webp`;
    const { error: uploadError } = await service.storage.from(bucket).upload(path, preview.bytes, { contentType: "image/webp", cacheControl: "31536000", upsert: true });
    if (uploadError) throw new Error(`preview_upload_failed_${uploadError.message}`);
    const { data: completed, error: completionError } = await service.rpc("complete_operation_media_preview_job_v2", { p_worker_token: token, p_job_id: job.job_id, p_preview_bucket: bucket, p_preview_path: path, p_preview_size: preview.bytes.length, p_preview_width: preview.width, p_preview_height: preview.height, p_pipeline_version: PIPELINE_VERSION, p_crop_metadata: preview.metadata });
    if (completionError || completed !== true) throw new Error(`preview_commit_rejected_${completionError?.message || "false"}`);
    return { ok: true, job_id: job.job_id, operation_id: job.operation_id, bytes: preview.bytes.length, width: preview.width, height: preview.height, pipeline: PIPELINE_VERSION };
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "preview_generation_failed";
    await recordFailure(service, token, job, message);
    return { ok: false, job_id: job.job_id, operation_id: job.operation_id, error: message };
  }
}

Deno.serve(async (request: Request) => {
  if (request.method === "GET") return json({ ok: true, service: "sanad-operation-preview-worker", pipeline: PIPELINE_VERSION });
  if (request.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
  const header = request.headers.get("x-sanad-worker-token")?.trim() || "";
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() || "";
  const internal = bearer !== "" && bearer === env("SUPABASE_SERVICE_ROLE_KEY");
  try {
    const service = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false, autoRefreshToken: false } });
    let token = header;
    if (internal && !token) {
      const { data, error } = await service.rpc("get_operation_media_preview_worker_token_internal");
      if (error || !data) return json({ ok: false, error: "worker_token_unavailable" }, 500);
      token = String(data);
    }
    if (!token) return json({ ok: false, error: "missing_worker_token" }, 401);
    const { data, error } = await service.rpc("claim_operation_media_preview_jobs", { p_worker_token: token, p_limit: 1 });
    if (error) return json({ ok: false, error: error.message?.includes("invalid_worker_token") ? "invalid_worker_token" : "claim_failed" }, error.message?.includes("invalid_worker_token") ? 401 : 500);
    const jobs = Array.isArray(data) ? data as PreviewJob[] : [];
    if (!jobs.length) return json({ ok: true, claimed: 0, completed: 0, failed: 0, results: [] });
    const result = await processJob(service, token, jobs[0]);
    return json({ ok: true, claimed: 1, completed: result.ok ? 1 : 0, failed: result.ok ? 0 : 1, results: [result] });
  } catch (cause) {
    return json({ ok: false, error: "worker_failed", detail: cause instanceof Error ? cause.message : "worker_failed" }, 500);
  }
});

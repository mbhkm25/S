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

type Bounds = { x: number; y: number; width: number; height: number };

const PIPELINE_VERSION = "content-crop-v4";
const RESPONSE_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};

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

async function gotenberg(route: string, form: FormData, timeout = 30000): Promise<Uint8Array> {
  const response = await fetch(`${env("GOTENBERG_URL").replace(/\/$/, "")}${route}`, {
    method: "POST",
    headers: { "X-Gotenberg-Token": env("GOTENBERG_TOKEN") },
    body: form,
    signal: AbortSignal.timeout(timeout),
  });
  if (!response.ok) {
    throw new Error(
      `gotenberg_failed_${response.status}_${(await response.text().catch(() => "")).slice(0, 160)}`,
    );
  }
  return new Uint8Array(await response.arrayBuffer());
}

async function renderPdfPageOne(sourceUrl: string): Promise<Uint8Array> {
  const form = new FormData();
  form.append(
    "url",
    `${sourceUrl}#page=1&toolbar=0&navpanes=0&scrollbar=0&zoom=page-width`,
  );
  for (
    const [key, value] of Object.entries({
      width: "1600",
      height: "2200",
      clip: "true",
      deviceScaleFactor: "2",
      format: "png",
      omitBackground: "false",
      optimizeForSpeed: "true",
      waitDelay: "900ms",
    })
  ) form.append(key, value);
  const bytes = await gotenberg("/forms/chromium/screenshot/url", form, 32000);
  if (bytes.length < 10000 || bytes[0] !== 137 || bytes[1] !== 80) {
    throw new Error("gotenberg_pdf_render_invalid_png");
  }
  return bytes;
}

async function pngToWebp(png: Uint8Array, width: number, height: number): Promise<Uint8Array> {
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;padding:0;width:${width}px;height:${height}px;overflow:hidden;background:#fff}img{display:block;width:${width}px;height:${height}px;object-fit:fill}</style></head><body><img id="source" src="source.png"><script>const i=document.getElementById('source');i.onload=()=>window.__SANAD_READY__=true;i.onerror=()=>window.__SANAD_FAILED__=true</script></body></html>`;
  const form = new FormData();
  form.append("files", new Blob([html], { type: "text/html;charset=utf-8" }), "index.html");
  form.append("files", new Blob([png], { type: "image/png" }), "source.png");
  for (
    const [key, value] of Object.entries({
      width: String(width),
      height: String(height),
      clip: "true",
      deviceScaleFactor: "1",
      format: "webp",
      omitBackground: "false",
      optimizeForSpeed: "true",
      waitDelay: "30ms",
      waitForExpression: "window.__SANAD_READY__ === true",
      failOnResourceLoadingFailed: "true",
    })
  ) form.append(key, value);
  const bytes = await gotenberg("/forms/chromium/screenshot/html", form, 20000);
  if (!isWebp(bytes)) throw new Error("webp_encoding_stage_invalid");
  return bytes;
}

function luminance(r: number, g: number, b: number): number {
  return (r * 299 + g * 587 + b * 114) / 1000;
}

function detectWhitePage(image: Image): Bounds {
  const width = image.width;
  const height = image.height;
  const bitmap = image.bitmap;
  const step = width > 2400 ? 6 : 4;
  let x0 = width;
  let y0 = height;
  let x1 = -1;
  let y1 = -1;

  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const index = (y * width + x) * 4;
      const l = luminance(bitmap[index], bitmap[index + 1], bitmap[index + 2]);
      if (bitmap[index + 3] > 20 && l > 210) {
        x0 = Math.min(x0, x);
        y0 = Math.min(y0, y);
        x1 = Math.max(x1, x);
        y1 = Math.max(y1, y);
      }
    }
  }

  if (x1 <= x0 || y1 <= y0) return { x: 0, y: 0, width, height };
  const inset = Math.max(4, Math.round(Math.min(x1 - x0, y1 - y0) * 0.004));
  return {
    x: Math.min(x1, x0 + inset),
    y: Math.min(y1, y0 + inset),
    width: Math.max(1, x1 - x0 + 1 - inset * 2),
    height: Math.max(1, y1 - y0 + 1 - inset * 2),
  };
}

function hasContent(bitmap: Uint8Array, canvasWidth: number, x: number, y: number): boolean {
  const index = (y * canvasWidth + x) * 4;
  const r = bitmap[index];
  const g = bitmap[index + 1];
  const b = bitmap[index + 2];
  const a = bitmap[index + 3];
  const l = luminance(r, g, b);
  const spread = Math.max(r, g, b) - Math.min(r, g, b);
  return a > 20 && (l < 238 || spread > 16);
}

function detectReceiptCrop(image: Image): {
  crop: Bounds;
  page: Bounds;
  mode: string;
  layoutClass: string;
  confidence: number;
  edgeSafetyPassed: boolean;
} {
  const page = detectWhitePage(image);
  const bitmap = image.bitmap;
  const canvasWidth = image.width;
  const scanTop = page.y;
  const initialBottom = Math.min(page.y + page.height - 1, page.y + Math.round(page.height * 0.42));
  const extendedBottom = Math.min(page.y + page.height - 1, page.y + Math.round(page.height * 0.55));
  const step = page.width > 1800 ? 4 : 3;
  const rowStep = Math.max(2, step);
  const activeRows: number[] = [];
  let contentX0 = page.x + page.width - 1;
  let contentY0 = extendedBottom;
  let contentX1 = page.x;
  let contentY1 = page.y;
  let count = 0;

  for (let y = scanTop; y <= extendedBottom; y += rowStep) {
    let rowCount = 0;
    for (let x = page.x; x < page.x + page.width; x += step) {
      if (hasContent(bitmap, canvasWidth, x, y)) {
        rowCount += 1;
        count += 1;
        contentX0 = Math.min(contentX0, x);
        contentY0 = Math.min(contentY0, y);
        contentX1 = Math.max(contentX1, x);
        contentY1 = Math.max(contentY1, y);
      }
    }
    if (rowCount >= Math.max(3, Math.round(page.width / step * 0.004))) activeRows.push(y);
  }

  const enoughContent = count >= Math.max(180, Math.round(page.width * page.height / 16000));
  const lastDenseRow = activeRows.length ? activeRows[activeRows.length - 1] : initialBottom;
  const contentWidth = Math.max(1, contentX1 - contentX0 + 1);
  const widthRatio = contentWidth / page.width;
  const layoutClass = widthRatio >= 0.72 ? "upper_full_width_receipt" : "upper_centered_receipt";
  let mode = "content_union";
  let confidence = enoughContent ? 0.9 : 0.55;

  let x: number;
  let width: number;
  if (layoutClass === "upper_full_width_receipt") {
    const horizontalPad = Math.max(8, Math.round(page.width * 0.01));
    x = Math.max(page.x, page.x + horizontalPad);
    width = Math.max(1, page.width - horizontalPad * 2);
    confidence += 0.05;
  } else {
    const minimumWidth = Math.round(page.width * 0.72);
    const horizontalPad = Math.max(12, Math.round(contentWidth * 0.025));
    x = Math.max(page.x, contentX0 - horizontalPad);
    const right = Math.min(page.x + page.width - 1, contentX1 + horizontalPad);
    width = Math.max(minimumWidth, right - x + 1);
    if (x + width > page.x + page.width) x = page.x + page.width - width;
  }

  let y: number;
  let height: number;
  if (enoughContent && contentY1 > contentY0) {
    const verticalPad = Math.max(10, Math.round(page.height * 0.008));
    y = Math.max(page.y, contentY0 - verticalPad);
    const bottom = Math.min(
      page.y + page.height - 1,
      Math.max(contentY1, lastDenseRow) + verticalPad,
    );
    height = Math.max(1, bottom - y + 1);
  } else {
    mode = "upper-36-conservative-fallback";
    confidence = 0.5;
    x = page.x;
    width = page.width;
    y = page.y;
    height = Math.min(page.height, Math.round(page.height * 0.36));
  }

  if (height > page.height * 0.48 && lastDenseRow <= initialBottom) {
    height = Math.round(page.height * 0.42);
    mode = `${mode}-bounded`;
  }

  const edgeProbe = Math.max(3, Math.round(Math.min(width, height) * 0.004));
  let edgeHits = 0;
  let probes = 0;
  for (let px = x; px < x + width; px += Math.max(5, step * 2)) {
    for (const py of [y + edgeProbe, y + height - 1 - edgeProbe]) {
      probes += 1;
      if (hasContent(bitmap, canvasWidth, px, py)) edgeHits += 1;
    }
  }
  for (let py = y; py < y + height; py += Math.max(5, step * 2)) {
    for (const px of [x + edgeProbe, x + width - 1 - edgeProbe]) {
      probes += 1;
      if (hasContent(bitmap, canvasWidth, px, py)) edgeHits += 1;
    }
  }
  const edgeSafetyPassed = probes === 0 || edgeHits / probes < 0.08;
  if (!edgeSafetyPassed) {
    x = page.x;
    width = page.width;
    y = page.y;
    height = Math.min(page.height, Math.max(height + Math.round(page.height * 0.03), Math.round(page.height * 0.4)));
    mode = "edge-safe-full-width-fallback";
    confidence = Math.min(confidence, 0.72);
  }

  return {
    crop: { x, y, width, height },
    page,
    mode,
    layoutClass,
    confidence: Math.max(0, Math.min(0.99, confidence)),
    edgeSafetyPassed,
  };
}

async function buildPdfPreview(sourceUrl: string): Promise<PreviewResult> {
  const rendered = await renderPdfPageOne(sourceUrl);
  const image = await Image.decode(rendered);
  const renderWidth = image.width;
  const renderHeight = image.height;
  const detected = detectReceiptCrop(image);
  image.crop(
    detected.crop.x,
    detected.crop.y,
    detected.crop.width,
    detected.crop.height,
  );
  if (image.width > 1600) image.resize(1600, Image.RESIZE_AUTO);
  const png = await image.encode(3);
  const bytes = await pngToWebp(png, image.width, image.height);
  return {
    bytes,
    width: image.width,
    height: image.height,
    metadata: {
      source_type: "pdf",
      page: 1,
      mode: detected.mode,
      layout_class: detected.layoutClass,
      crop_confidence: detected.confidence,
      edge_safety_passed: detected.edgeSafetyPassed,
      render_width: renderWidth,
      render_height: renderHeight,
      page_bounds: detected.page,
      crop_x: detected.crop.x,
      crop_y: detected.crop.y,
      crop_width: detected.crop.width,
      crop_height: detected.crop.height,
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
      metadata: {
        source_type: "image",
        mode: "preserve-original-webp",
        original_width: dimensions.width,
        original_height: dimensions.height,
      },
    };
  }
  const image = await Image.decode(source);
  const originalWidth = image.width;
  const originalHeight = image.height;
  if (image.width > 1600) image.resize(1600, Image.RESIZE_AUTO);
  const png = await image.encode(3);
  const bytes = await pngToWebp(png, image.width, image.height);
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

async function recordFailure(
  service: ServiceClient,
  token: string,
  job: PreviewJob,
  message: string,
) {
  try {
    const { error } = await service.rpc("fail_operation_media_preview_job", {
      p_worker_token: token,
      p_job_id: job.job_id,
      p_error: message.slice(0, 500),
    });
    if (error) console.error("preview failure record RPC failed", error.message);
  } catch (error) {
    console.error("preview failure could not be recorded", error);
  }
}

async function processJob(service: ServiceClient, token: string, job: PreviewJob) {
  try {
    const { data: blob, error: downloadError } = await service.storage
      .from(job.source_bucket)
      .download(job.source_path);
    if (downloadError || !blob) {
      throw new Error(`source_download_failed_${downloadError?.message || "missing_blob"}`);
    }
    const source = new Uint8Array(await blob.arrayBuffer());
    let preview: PreviewResult;
    if (job.source_mime_type === "application/pdf") {
      const { data: signed, error: signError } = await service.storage
        .from(job.source_bucket)
        .createSignedUrl(job.source_path, 600);
      if (signError || !signed?.signedUrl) {
        throw new Error(`source_sign_failed_${signError?.message || "missing_url"}`);
      }
      preview = await buildPdfPreview(signed.signedUrl);
    } else if (job.source_mime_type.startsWith("image/")) {
      preview = await buildImagePreview(source, job.source_mime_type);
    } else {
      throw new Error(`preview_unsupported_mime_${job.source_mime_type}`);
    }

    const version = (job.source_sha256 || Date.now().toString())
      .replace(/[^a-zA-Z0-9_-]/g, "")
      .slice(0, 64) || "source";
    const bucket = job.source_bucket || "operation-files";
    const path = `previews/operations/${job.operation_id}/${version}-${PIPELINE_VERSION}.webp`;
    const { error: uploadError } = await service.storage.from(bucket).upload(path, preview.bytes, {
      contentType: "image/webp",
      cacheControl: "31536000",
      upsert: true,
    });
    if (uploadError) throw new Error(`preview_upload_failed_${uploadError.message}`);

    const { data: completed, error: completionError } = await service.rpc(
      "complete_operation_media_preview_job_v2",
      {
        p_worker_token: token,
        p_job_id: job.job_id,
        p_preview_bucket: bucket,
        p_preview_path: path,
        p_preview_size: preview.bytes.length,
        p_preview_width: preview.width,
        p_preview_height: preview.height,
        p_pipeline_version: PIPELINE_VERSION,
        p_crop_metadata: preview.metadata,
      },
    );
    if (completionError || completed !== true) {
      throw new Error(`preview_commit_rejected_${completionError?.message || "false"}`);
    }
    return {
      ok: true,
      job_id: job.job_id,
      operation_id: job.operation_id,
      bytes: preview.bytes.length,
      width: preview.width,
      height: preview.height,
      pipeline: PIPELINE_VERSION,
    };
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "preview_generation_failed";
    await recordFailure(service, token, job, message);
    return {
      ok: false,
      job_id: job.job_id,
      operation_id: job.operation_id,
      error: message,
    };
  }
}

Deno.serve(async (request: Request) => {
  if (request.method === "GET") {
    return json({ ok: true, service: "sanad-operation-preview-worker", pipeline: PIPELINE_VERSION });
  }
  if (request.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  const header = request.headers.get("x-sanad-worker-token")?.trim() || "";
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() || "";
  const internal = bearer !== "" && bearer === env("SUPABASE_SERVICE_ROLE_KEY");

  try {
    const service = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    let token = header;
    if (internal && !token) {
      const { data, error } = await service.rpc("get_operation_media_preview_worker_token_internal");
      if (error || !data) return json({ ok: false, error: "worker_token_unavailable" }, 500);
      token = String(data);
    }
    if (!token) return json({ ok: false, error: "missing_worker_token" }, 401);

    const { data, error } = await service.rpc("claim_operation_media_preview_jobs", {
      p_worker_token: token,
      p_limit: 1,
    });
    if (error) {
      return json(
        { ok: false, error: error.message?.includes("invalid_worker_token") ? "invalid_worker_token" : "claim_failed" },
        error.message?.includes("invalid_worker_token") ? 401 : 500,
      );
    }
    const jobs = Array.isArray(data) ? data as PreviewJob[] : [];
    if (!jobs.length) return json({ ok: true, claimed: 0, completed: 0, failed: 0, results: [] });

    const result = await processJob(service, token, jobs[0]);
    return json({
      ok: true,
      claimed: 1,
      completed: result.ok ? 1 : 0,
      failed: result.ok ? 0 : 1,
      results: [result],
    });
  } catch (cause) {
    console.error("preview worker failed", cause);
    return json(
      {
        ok: false,
        error: "worker_failed",
        detail: cause instanceof Error ? cause.message : "worker_failed",
      },
      500,
    );
  }
});

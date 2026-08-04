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
type RenderedPreview = {
  bytes: Uint8Array;
  width: number | null;
  height: number | null;
  cropMetadata: Record<string, unknown>;
};

const PIPELINE_VERSION = "content-crop-v2";
const jsonHeaders = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };

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
function isWebp(bytes: Uint8Array): boolean {
  if (bytes.byteLength < 12) return false;
  const header = new TextDecoder().decode(bytes.slice(0, 12));
  return header.startsWith("RIFF") && header.slice(8, 12) === "WEBP";
}
function appendOptions(form: FormData, width: number, height: number, clip: boolean, waitDelay = "0ms"): void {
  form.append("width", String(width));
  form.append("height", String(height));
  form.append("clip", String(clip));
  form.append("deviceScaleFactor", "1");
  form.append("format", "webp");
  form.append("omitBackground", "false");
  form.append("optimizeForSpeed", "true");
  form.append("waitDelay", waitDelay);
}
async function gotenberg(route: string, form: FormData, timeout = 24000): Promise<Uint8Array> {
  const response = await fetch(joinUrl(env("GOTENBERG_URL"), route), {
    method: "POST",
    headers: { "X-Gotenberg-Token": env("GOTENBERG_TOKEN") },
    body: form,
    signal: AbortSignal.timeout(timeout),
  });
  if (!response.ok) {
    throw new Error(`gotenberg_preview_failed_${response.status}_${(await response.text().catch(() => "")).slice(0, 200)}`);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!isWebp(bytes)) throw new Error("gotenberg_preview_invalid_webp");
  return bytes;
}
function imageDimensions(bytes: Uint8Array, mime: string): { width: number; height: number } | null {
  try {
    if (mime.includes("png") && bytes.length > 24) {
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      return { width: view.getUint32(16), height: view.getUint32(20) };
    }
    if (mime.includes("jpeg") || mime.includes("jpg")) {
      let cursor = 2;
      while (cursor + 9 < bytes.length) {
        if (bytes[cursor] !== 0xff) { cursor += 1; continue; }
        const marker = bytes[cursor + 1];
        const length = (bytes[cursor + 2] << 8) + bytes[cursor + 3];
        if ([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)) {
          return { height: (bytes[cursor + 5] << 8) + bytes[cursor + 6], width: (bytes[cursor + 7] << 8) + bytes[cursor + 8] };
        }
        if (length < 2) break;
        cursor += 2 + length;
      }
    }
    if (mime.includes("webp") && bytes.length > 30) {
      const kind = new TextDecoder().decode(bytes.slice(12, 16));
      if (kind === "VP8X") {
        return {
          width: 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16),
          height: 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16),
        };
      }
      if (kind === "VP8 ") {
        return { width: (bytes[26] | (bytes[27] << 8)) & 0x3fff, height: (bytes[28] | (bytes[29] << 8)) & 0x3fff };
      }
    }
  } catch {
    return null;
  }
  return null;
}
function exactImageHtml(filename: string, maxWidth: number): string {
  return `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;padding:0;background:transparent;width:max-content;height:max-content;overflow:visible}canvas{display:block}</style></head><body><canvas id="out"></canvas><script>(()=>{const img=new Image();img.onload=()=>{const s=Math.min(1,${maxWidth}/img.naturalWidth),w=Math.max(1,Math.round(img.naturalWidth*s)),h=Math.max(1,Math.round(img.naturalHeight*s)),c=document.getElementById('out');c.width=w;c.height=h;c.style.width=w+'px';c.style.height=h+'px';document.documentElement.style.width=w+'px';document.documentElement.style.height=h+'px';document.body.style.width=w+'px';document.body.style.height=h+'px';c.getContext('2d',{alpha:true}).drawImage(img,0,0,w,h);window.__SANAD_READY__=true};img.onerror=()=>{window.__SANAD_FAILED__=true};img.src='${filename}'})()</script></body></html>`;
}
function cropPdfHtml(filename: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;padding:0;background:#fff;width:max-content;height:max-content;overflow:visible}canvas{display:block;background:#fff}</style></head><body><canvas id="out"></canvas><script>(()=>{const img=new Image();img.onload=()=>{const scan=document.createElement('canvas');scan.width=img.naturalWidth;scan.height=img.naturalHeight;const sx=scan.getContext('2d',{willReadFrequently:true});sx.drawImage(img,0,0);const d=sx.getImageData(0,0,scan.width,scan.height).data,W=scan.width,H=scan.height,step=3;let px0=W,py0=H,px1=-1,py1=-1;for(let y=0;y<H;y+=step)for(let x=0;x<W;x+=step){const i=(y*W+x)*4,l=(d[i]*299+d[i+1]*587+d[i+2]*114)/1000;if(d[i+3]>20&&l>185){px0=Math.min(px0,x);px1=Math.max(px1,x);py0=Math.min(py0,y);py1=Math.max(py1,y)}}if(px1<px0||py1<py0){px0=0;py0=0;px1=W-1;py1=Math.round(H*.7)}const inset=Math.max(4,Math.round(Math.min(px1-px0,py1-py0)*.01));px0=Math.min(px1,px0+inset);py0=Math.min(py1,py0+inset);px1=Math.max(px0,px1-inset);py1=Math.max(py0,py1-inset);let cx0=px1,cy0=py1,cx1=px0,cy1=py0,count=0;for(let y=py0;y<=py1;y+=2)for(let x=px0;x<=px1;x+=2){const i=(y*W+x)*4,r=d[i],g=d[i+1],b=d[i+2],l=(r*299+g*587+b*114)/1000,spread=Math.max(r,g,b)-Math.min(r,g,b);if(l<242||spread>18){cx0=Math.min(cx0,x);cy0=Math.min(cy0,y);cx1=Math.max(cx1,x);cy1=Math.max(cy1,y);count++}}let mode='detected';if(count<120||cx1<=cx0||cy1<=cy0){mode='upper-70-fallback';cx0=px0;cy0=py0;cx1=px1;cy1=Math.min(py1,py0+Math.round((py1-py0)*.7))}const pad=Math.max(18,Math.round((cx1-cx0)*.025));cx0=Math.max(px0,cx0-pad);cy0=Math.max(py0,cy0-pad);cx1=Math.min(px1,cx1+pad);cy1=Math.min(py1,cy1+pad);const cw=Math.max(1,cx1-cx0+1),ch=Math.max(1,cy1-cy0+1),s=Math.min(1,1400/cw),w=Math.max(1,Math.round(cw*s)),h=Math.max(1,Math.round(ch*s)),out=document.getElementById('out');out.width=w;out.height=h;out.style.width=w+'px';out.style.height=h+'px';const ox=out.getContext('2d');ox.fillStyle='#fff';ox.fillRect(0,0,w,h);ox.drawImage(scan,cx0,cy0,cw,ch,0,0,w,h);document.documentElement.style.width=w+'px';document.documentElement.style.height=h+'px';document.body.style.width=w+'px';document.body.style.height=h+'px';window.__SANAD_READY__=true};img.onerror=()=>{window.__SANAD_FAILED__=true};img.src='${filename}'})()</script></body></html>`;
}
async function screenshotHtml(html: string, assets: Array<{ name: string; blob: Blob }>, width: number, height: number): Promise<Uint8Array> {
  const form = new FormData();
  form.append("files", new Blob([html], { type: "text/html; charset=utf-8" }), "index.html");
  for (const asset of assets) form.append("files", asset.blob, asset.name);
  appendOptions(form, width, height, false, "50ms");
  form.append("waitForExpression", "window.__SANAD_READY__ === true");
  form.append("failOnResourceLoadingFailed", "true");
  return gotenberg("/forms/chromium/screenshot/html", form);
}
async function renderImage(sourceBytes: Uint8Array, mime: string): Promise<RenderedPreview> {
  const dimensions = imageDimensions(sourceBytes, mime);
  const maxWidth = 1600;
  const scale = dimensions ? Math.min(1, maxWidth / dimensions.width) : 1;
  const width = dimensions ? Math.max(1, Math.round(dimensions.width * scale)) : maxWidth;
  const height = dimensions ? Math.max(1, Math.round(dimensions.height * scale)) : 1600;
  const extension = mime.includes("png") ? "png" : mime.includes("webp") ? "webp" : "jpg";
  const filename = `source.${extension}`;
  const bytes = await screenshotHtml(exactImageHtml(filename, maxWidth), [{ name: filename, blob: new Blob([sourceBytes], { type: mime }) }], Math.max(320, width), Math.max(320, height));
  return { bytes, width: dimensions ? width : null, height: dimensions ? height : null, cropMetadata: { source_type: "image", mode: "preserve-bounds", original_width: dimensions?.width ?? null, original_height: dimensions?.height ?? null } };
}
async function renderPdf(sourceUrl: string): Promise<RenderedPreview> {
  const first = new FormData();
  first.append("url", `${sourceUrl}#page=1&toolbar=0&navpanes=0&scrollbar=0&view=FitH`);
  appendOptions(first, 1600, 2200, true, "900ms");
  first.append("failOnResourceLoadingFailed", "true");
  const page = await gotenberg("/forms/chromium/screenshot/url", first);
  if (page.byteLength < 10000) throw new Error("gotenberg_pdf_preview_probably_blank");
  const bytes = await screenshotHtml(cropPdfHtml("page.webp"), [{ name: "page.webp", blob: new Blob([page], { type: "image/webp" }) }], 1600, 2200);
  return { bytes, width: null, height: null, cropMetadata: { source_type: "pdf", page: 1, mode: "content-detection-with-upper-70-fallback", render_width: 1600, render_height: 2200 } };
}
async function recordFailure(service: ServiceClient, workerToken: string, job: PreviewJob, message: string): Promise<void> {
  try {
    await service.rpc("fail_operation_media_preview_job", { p_worker_token: workerToken, p_job_id: job.job_id, p_error: message });
  } catch (failureRecordError) {
    console.error("SANAD preview failure could not be recorded", failureRecordError);
  }
}
async function processJob(service: ServiceClient, workerToken: string, job: PreviewJob) {
  try {
    const { data: download, error: downloadError } = await service.storage.from(job.source_bucket).download(job.source_path);
    if (downloadError || !download) throw new Error(`source_download_failed_${downloadError?.message || "missing_blob"}`);
    const sourceBytes = new Uint8Array(await download.arrayBuffer());
    let rendered: RenderedPreview;
    if (job.source_mime_type === "application/pdf") {
      const { data: signed, error: signedError } = await service.storage.from(job.source_bucket).createSignedUrl(job.source_path, 600);
      if (signedError || !signed?.signedUrl) throw new Error(`source_sign_failed_${signedError?.message || "missing_url"}`);
      rendered = await renderPdf(signed.signedUrl);
    } else if (job.source_mime_type.startsWith("image/")) {
      rendered = await renderImage(sourceBytes, job.source_mime_type);
    } else {
      throw new Error(`preview_unsupported_mime_${job.source_mime_type}`);
    }
    const previewBucket = job.source_bucket || "operation-files";
    const version = (job.source_sha256 || Date.now().toString()).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64) || "source";
    const previewPath = `previews/operations/${job.operation_id}/${version}-${PIPELINE_VERSION}.webp`;
    const { error: uploadError } = await service.storage.from(previewBucket).upload(previewPath, rendered.bytes, { contentType: "image/webp", cacheControl: "31536000", upsert: true });
    if (uploadError) throw new Error(`preview_upload_failed_${uploadError.message}`);
    const { data: completed, error: completeError } = await service.rpc("complete_operation_media_preview_job_v2", {
      p_worker_token: workerToken,
      p_job_id: job.job_id,
      p_preview_bucket: previewBucket,
      p_preview_path: previewPath,
      p_preview_size: rendered.bytes.byteLength,
      p_preview_width: rendered.width,
      p_preview_height: rendered.height,
      p_pipeline_version: PIPELINE_VERSION,
      p_crop_metadata: rendered.cropMetadata,
    });
    if (completeError || completed !== true) throw new Error(`preview_commit_rejected_${completeError?.message || "false"}`);
    return { ok: true, job_id: job.job_id, operation_id: job.operation_id, bytes: rendered.bytes.byteLength, pipeline: PIPELINE_VERSION };
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "preview_generation_failed";
    await recordFailure(service, workerToken, job, message);
    return { ok: false, job_id: job.job_id, operation_id: job.operation_id, error: message };
  }
}

Deno.serve(async (request: Request) => {
  if (request.method === "GET") return reply({ ok: true, service: "sanad-operation-preview-worker", pipeline: PIPELINE_VERSION });
  if (request.method !== "POST") return reply({ ok: false, error: "method_not_allowed" }, 405);
  const workerToken = request.headers.get("x-sanad-worker-token")?.trim() || "";
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() || "";
  const internalCall = bearer !== "" && bearer === env("SUPABASE_SERVICE_ROLE_KEY");
  try {
    const service = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false, autoRefreshToken: false } });
    let effectiveToken = workerToken;
    if (internalCall && !effectiveToken) {
      const { data, error } = await service.rpc("get_operation_media_preview_worker_token_internal");
      if (error || !data) return reply({ ok: false, error: "worker_token_unavailable" }, 500);
      effectiveToken = String(data);
    }
    if (!effectiveToken) return reply({ ok: false, error: "missing_worker_token" }, 401);
    const { data, error } = await service.rpc("claim_operation_media_preview_jobs", { p_worker_token: effectiveToken, p_limit: 1 });
    if (error) {
      const invalidToken = error.message?.includes("invalid_worker_token");
      return reply({ ok: false, error: invalidToken ? "invalid_worker_token" : "claim_failed" }, invalidToken ? 401 : 500);
    }
    const jobs = Array.isArray(data) ? data as PreviewJob[] : [];
    if (jobs.length === 0) return reply({ ok: true, claimed: 0, completed: 0, failed: 0, results: [] });
    const result = await processJob(service, effectiveToken, jobs[0]);
    return reply({ ok: true, claimed: 1, completed: result.ok ? 1 : 0, failed: result.ok ? 0 : 1, results: [result] });
  } catch (cause) {
    console.error("SANAD operation preview worker failed", cause);
    return reply({ ok: false, error: "worker_failed", detail: cause instanceof Error ? cause.message : "worker_failed" }, 500);
  }
});

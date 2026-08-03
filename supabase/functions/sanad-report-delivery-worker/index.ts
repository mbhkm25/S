import { createClient } from "npm:@supabase/supabase-js@2";

type Json = Record<string, unknown>;
type DeliveryFormat = "interactive" | "pdf" | "both";

function env(name: string, fallback?: string) {
  const value = Deno.env.get(name) || fallback;
  if (!value) throw new Error(`missing_env_${name}`);
  return value;
}

const SUPABASE_URL = env("SUPABASE_URL").replace(/\/$/, "");
const sb = createClient(SUPABASE_URL, env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
const REPORT_URL_BASE = env("INTERACTIVE_REPORT_BASE_URL", `${SUPABASE_URL}/functions/v1/sanad-interactive-report`).replace(/\/$/, "");
const BUCKET = env("SUPABASE_STORAGE_BUCKET", "operation-files");

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8" } });
}
function requireInternal(req: Request) {
  if (req.headers.get("x-sanad-internal-key") !== env("SANAD_INTERNAL_API_KEY")) throw new Error("unauthorized_internal_request");
}
function phone(value: unknown) {
  let result = String(value || "").replace(/\D/g, "");
  if (result.startsWith("00967")) result = result.slice(2);
  else if (result.startsWith("0967")) result = result.slice(1);
  else if (result.length === 9) result = `967${result}`;
  if (!/^967\d{9}$/.test(result)) throw new Error("invalid_destination_phone");
  return result;
}
function safeName(value: unknown) {
  return String(value || "report").replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 80);
}
function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
async function createEphemeralRenderToken(snapshotId: string) {
  const raw = randomToken();
  const { data, error } = await sb.from("report_access_tokens").insert({
    report_snapshot_id: snapshotId,
    token_hash: await sha256(raw),
    expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
  }).select("id").single();
  if (error || !data) throw new Error(`render_token_create_failed_${error?.message || ""}`);
  return { raw, id: String(data.id) };
}
async function revokeToken(id: string | null) {
  if (!id) return;
  await sb.from("report_access_tokens").update({ status: "revoked", revoked_at: new Date().toISOString() }).eq("id", id);
}
async function renderPdf(url: string) {
  const form = new FormData();
  form.append("url", url);
  form.append("paperWidth", "8.27");
  form.append("paperHeight", "11.69");
  form.append("printBackground", "true");
  form.append("preferCssPageSize", "true");
  const result = await fetch(`${env("GOTENBERG_URL").replace(/\/$/, "")}/forms/chromium/convert/url`, {
    method: "POST",
    headers: { "X-Gotenberg-Token": env("GOTENBERG_TOKEN") },
    body: form,
  });
  if (!result.ok) throw new Error(`gotenberg_render_failed_${result.status}_${(await result.text()).slice(0, 180)}`);
  return new Uint8Array(await result.arrayBuffer());
}
async function sendWhatsApp(payload: Json) {
  const apiVersion = env("WHATSAPP_API_VERSION", "v22.0");
  const result = await fetch(`https://graph.facebook.com/${apiVersion}/${env("WHATSAPP_PHONE_NUMBER_ID")}/messages`, {
    method: "POST",
    headers: { authorization: `Bearer ${env("WHATSAPP_ACCESS_TOKEN")}`, "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await result.json().catch(() => ({}));
  if (!result.ok) throw new Error(`whatsapp_send_failed_${result.status}_${JSON.stringify(body).slice(0, 300)}`);
  return body as Json;
}
async function sendLink(destination: string, url: string, metrics: Json) {
  return sendWhatsApp({
    messaging_product: "whatsapp", to: destination, type: "text",
    text: { preview_url: true, body: `تم إعداد تقرير عملياتك في سند.\n\nعدد العمليات: ${Number(metrics.operations_count || 0)}\nالموثقة: ${Number(metrics.verified_count || 0)}\nعليها ملاحظات: ${Number(metrics.operations_with_notes || 0)}\n\nاضغط لاستعراض التقرير وتصفية عملياته:\n${url}\n\nالرابط خاص بك وصالح لمدة محدودة.` },
  });
}
async function sendDocument(destination: string, url: string, reportId: string) {
  return sendWhatsApp({
    messaging_product: "whatsapp", to: destination, type: "document",
    document: { link: url, filename: `sanad-report-${safeName(reportId)}.pdf`, caption: "تقرير عمليات سند بصيغة PDF" },
  });
}

async function processReport(reportId: string, dryRun: boolean) {
  const { data: request, error: requestError } = await sb.from("report_requests")
    .select("id,destination_phone,delivery_format,status,result_metrics,delivery_attempts")
    .eq("id", reportId).single();
  if (requestError || !request) throw new Error(`report_request_not_found_${requestError?.message || ""}`);
  const format = request.delivery_format as DeliveryFormat;
  if (!["interactive", "pdf", "both"].includes(format)) throw new Error("invalid_delivery_format");

  if (!dryRun) await sb.from("report_requests").update({
    status: "processing", processing_stage: "creating_snapshot",
    processing_started_at: new Date().toISOString(), last_attempt_at: new Date().toISOString(),
  }).eq("id", reportId);

  const { data: artifacts, error: artifactError } = await sb.rpc("create_report_delivery_artifacts", {
    p_report_request_id: reportId, p_link_ttl_days: 30,
  });
  if (artifactError || !artifacts?.ok) throw new Error(`artifact_creation_failed_${artifactError?.message || JSON.stringify(artifacts)}`);

  const interactiveRequired = Boolean(artifacts.interactive_required);
  const pdfRequired = Boolean(artifacts.pdf_required);
  let publicToken = String(artifacts.access_token || "");
  let renderTokenId: string | null = null;
  if (pdfRequired && !publicToken) {
    const temporary = await createEphemeralRenderToken(String(artifacts.snapshot_id));
    publicToken = temporary.raw;
    renderTokenId = temporary.id;
  }
  const renderUrl = publicToken ? `${REPORT_URL_BASE}?token=${encodeURIComponent(publicToken)}` : null;
  const interactiveUrl = interactiveRequired ? renderUrl : null;
  const metrics: Json = {
    snapshot_id: artifacts.snapshot_id,
    operations_count: artifacts.operations_count,
    verified_count: artifacts.verified_count,
    operations_with_notes: artifacts.operations_with_notes,
    delivery_format: format,
    renderer: "shared-interactive-snapshot-v1",
  };

  let pdfPath: string | null = null;
  let signedPdfUrl: string | null = null;
  let pdfBytes = 0;
  try {
    if (pdfRequired) {
      if (!renderUrl) throw new Error("missing_pdf_render_url");
      if (!dryRun) await sb.from("report_requests").update({ pdf_status: "processing", processing_stage: "rendering_pdf" }).eq("id", reportId);
      const pdf = await renderPdf(renderUrl);
      pdfBytes = pdf.byteLength;
      pdfPath = `reports/${reportId}/${Date.now()}-operations.pdf`;
      const { error: uploadError } = await sb.storage.from(BUCKET).upload(pdfPath, pdf, { contentType: "application/pdf", upsert: false });
      if (uploadError) throw new Error(`pdf_upload_failed_${uploadError.message}`);
      const { data: signed, error: signedError } = await sb.storage.from(BUCKET).createSignedUrl(pdfPath, 60 * 60);
      if (signedError || !signed?.signedUrl) throw new Error(`pdf_sign_failed_${signedError?.message || ""}`);
      signedPdfUrl = signed.signedUrl;
    }
  } finally {
    await revokeToken(renderTokenId);
  }

  const destination = phone(request.destination_phone);
  const messageIds: string[] = [];
  if (!dryRun) {
    if (interactiveUrl) {
      const sent = await sendLink(destination, interactiveUrl, metrics);
      const id = String((sent.messages as Array<Json> | undefined)?.[0]?.id || "");
      if (id) messageIds.push(id);
    }
    if (signedPdfUrl) {
      const sent = await sendDocument(destination, signedPdfUrl, reportId);
      const id = String((sent.messages as Array<Json> | undefined)?.[0]?.id || "");
      if (id) messageIds.push(id);
    }
    await sb.from("report_requests").update({
      status: "sent", processing_stage: "completed", processed_at: new Date().toISOString(), sent_at: new Date().toISOString(),
      result_bucket: pdfPath ? BUCKET : null, result_path: pdfPath,
      pdf_status: pdfRequired ? "ready" : "skipped", interactive_status: interactiveRequired ? "ready" : "skipped",
      whatsapp_message_id: messageIds[0] || null, delivery_status: "accepted",
      delivery_attempts: Number(request.delivery_attempts || 0) + 1,
      result_metrics: { ...(request.result_metrics || {}), ...metrics, pdf_bytes: pdfBytes, whatsapp_message_ids: messageIds },
      error_message: null,
    }).eq("id", reportId);
  }

  return {
    ok: true, dry_run: dryRun, report_id: reportId, delivery_format: format,
    interactive_url_created: Boolean(interactiveUrl), pdf_created: Boolean(pdfPath),
    pdf_path: pdfPath, pdf_bytes: pdfBytes, whatsapp_sent: !dryRun,
    message_ids: messageIds, ephemeral_render_token_revoked: Boolean(renderTokenId), metrics,
  };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return response({ ok: false, error: "method_not_allowed" }, 405);
  try {
    requireInternal(req);
    const body = await req.json().catch(() => ({}));
    const reportId = String(body.report_request_id || "");
    if (!/^[0-9a-f-]{36}$/i.test(reportId)) throw new Error("invalid_report_request_id");
    return response(await processReport(reportId, body.dry_run !== false));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return response({ ok: false, error: message }, message === "unauthorized_internal_request" ? 401 : 500);
  }
});
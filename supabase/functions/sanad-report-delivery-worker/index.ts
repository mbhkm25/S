import { createClient } from "npm:@supabase/supabase-js@2";

type Json = Record<string, unknown>;
type DeliveryFormat = "interactive" | "pdf" | "both";

const SUPABASE_URL = mustEnv("SUPABASE_URL").replace(/\/$/, "");
const SERVICE_KEY = mustEnv("SUPABASE_SERVICE_ROLE_KEY");
const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
const INTERNAL_KEY = mustEnv("SANAD_INTERNAL_API_KEY");
const REPORT_URL_BASE = (Deno.env.get("INTERACTIVE_REPORT_BASE_URL") || `${SUPABASE_URL}/functions/v1/sanad-interactive-report`).replace(/\/$/, "");
const BUCKET = Deno.env.get("SUPABASE_STORAGE_BUCKET") || "operation-files";

function mustEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`missing_env_${name}`);
  return value;
}
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8" } });
}
function requireInternal(req: Request) {
  if (req.headers.get("x-sanad-internal-key") !== INTERNAL_KEY) throw new Error("unauthorized_internal_request");
}
function normalizePhone(value: unknown) {
  let phone = String(value || "").replace(/\D/g, "");
  if (phone.startsWith("00967")) phone = phone.slice(2);
  else if (phone.startsWith("0967")) phone = phone.slice(1);
  else if (phone.length === 9) phone = `967${phone}`;
  if (!/^967\d{9}$/.test(phone)) throw new Error("invalid_destination_phone");
  return phone;
}
function safeName(value: unknown) {
  return String(value || "report").replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 80);
}

async function renderUrlToPdf(url: string) {
  const gotenberg = mustEnv("GOTENBERG_URL").replace(/\/$/, "");
  const form = new FormData();
  form.append("url", url);
  form.append("paperWidth", "8.27");
  form.append("paperHeight", "11.69");
  form.append("printBackground", "true");
  form.append("preferCssPageSize", "true");
  const response = await fetch(`${gotenberg}/forms/chromium/convert/url`, {
    method: "POST",
    headers: { "X-Gotenberg-Token": mustEnv("GOTENBERG_TOKEN") },
    body: form,
  });
  if (!response.ok) throw new Error(`gotenberg_render_failed_${response.status}_${(await response.text()).slice(0, 180)}`);
  return new Uint8Array(await response.arrayBuffer());
}

async function whatsapp(payload: Json) {
  const phoneId = mustEnv("WHATSAPP_PHONE_NUMBER_ID");
  const version = Deno.env.get("WHATSAPP_API_VERSION") || "v22.0";
  const response = await fetch(`https://graph.facebook.com/${version}/${phoneId}/messages`, {
    method: "POST",
    headers: { authorization: `Bearer ${mustEnv("WHATSAPP_ACCESS_TOKEN")}`, "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`whatsapp_send_failed_${response.status}_${JSON.stringify(result).slice(0, 300)}`);
  return result as Json;
}

async function sendInteractive(phone: string, url: string, metrics: Json) {
  const count = Number(metrics.operations_count || 0);
  const verified = Number(metrics.verified_count || 0);
  const notes = Number(metrics.operations_with_notes || 0);
  return whatsapp({
    messaging_product: "whatsapp", to: phone, type: "text",
    text: { preview_url: true, body: `تم إعداد تقرير عملياتك في سند.\n\nعدد العمليات: ${count}\nالموثقة: ${verified}\nعليها ملاحظات: ${notes}\n\nاستعرض التقرير وطبّق عوامل التصفية من الرابط:\n${url}\n\nالرابط خاص بك وصالح لمدة محدودة.` },
  });
}

async function sendPdf(phone: string, signedUrl: string, reportId: string) {
  return whatsapp({
    messaging_product: "whatsapp", to: phone, type: "document",
    document: { link: signedUrl, filename: `sanad-report-${safeName(reportId)}.pdf`, caption: "تقرير عمليات سند بصيغة PDF" },
  });
}

async function processReport(reportId: string, dryRun: boolean) {
  const { data: request, error: requestError } = await sb.from("report_requests")
    .select("id,destination_phone,delivery_format,report_title,status,result_metrics")
    .eq("id", reportId).single();
  if (requestError || !request) throw new Error(`report_request_not_found_${requestError?.message || ""}`);
  const format = request.delivery_format as DeliveryFormat;
  if (!["interactive", "pdf", "both"].includes(format)) throw new Error("invalid_delivery_format");

  if (!dryRun) {
    await sb.from("report_requests").update({ status: "processing", processing_stage: "creating_snapshot", processing_started_at: new Date().toISOString(), last_attempt_at: new Date().toISOString() }).eq("id", reportId);
  }

  const { data: artifacts, error: artifactError } = await sb.rpc("create_report_delivery_artifacts", { p_report_request_id: reportId, p_link_ttl_days: 30 });
  if (artifactError || !artifacts?.ok) throw new Error(`artifact_creation_failed_${artifactError?.message || JSON.stringify(artifacts)}`);

  const interactiveRequired = Boolean(artifacts.interactive_required);
  const pdfRequired = Boolean(artifacts.pdf_required);
  const token = String(artifacts.access_token || "");
  const interactiveUrl = interactiveRequired ? `${REPORT_URL_BASE}?token=${encodeURIComponent(token)}` : null;
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
  if (pdfRequired) {
    if (!interactiveUrl) throw new Error("pdf_requires_snapshot_access_url");
    if (!dryRun) await sb.from("report_requests").update({ pdf_status: "processing", processing_stage: "rendering_pdf" }).eq("id", reportId);
    const pdf = await renderUrlToPdf(interactiveUrl);
    pdfBytes = pdf.byteLength;
    pdfPath = `reports/${reportId}/${Date.now()}-operations.pdf`;
    const { error: uploadError } = await sb.storage.from(BUCKET).upload(pdfPath, pdf, { contentType: "application/pdf", upsert: false });
    if (uploadError) throw new Error(`pdf_upload_failed_${uploadError.message}`);
    const { data: signed, error: signedError } = await sb.storage.from(BUCKET).createSignedUrl(pdfPath, 60 * 60);
    if (signedError || !signed?.signedUrl) throw new Error(`pdf_sign_failed_${signedError?.message || ""}`);
    signedPdfUrl = signed.signedUrl;
  }

  const phone = normalizePhone(request.destination_phone);
  const messageIds: string[] = [];
  if (!dryRun) {
    if (interactiveRequired && interactiveUrl) {
      const sent = await sendInteractive(phone, interactiveUrl, metrics);
      const id = String((sent.messages as Array<Json> | undefined)?.[0]?.id || "");
      if (id) messageIds.push(id);
    }
    if (pdfRequired && signedPdfUrl) {
      const sent = await sendPdf(phone, signedPdfUrl, reportId);
      const id = String((sent.messages as Array<Json> | undefined)?.[0]?.id || "");
      if (id) messageIds.push(id);
    }
    await sb.from("report_requests").update({
      status: "sent", processing_stage: "completed", processed_at: new Date().toISOString(), sent_at: new Date().toISOString(),
      result_bucket: pdfPath ? BUCKET : null, result_path: pdfPath,
      pdf_status: pdfRequired ? "ready" : "skipped", interactive_status: interactiveRequired ? "ready" : "skipped",
      whatsapp_message_id: messageIds[0] || null, delivery_status: "accepted", delivery_attempts: Number(request.delivery_attempts || 0) + 1,
      result_metrics: { ...(request.result_metrics || {}), ...metrics, pdf_bytes: pdfBytes, whatsapp_message_ids: messageIds }, error_message: null,
    }).eq("id", reportId);
  }

  return { ok: true, dry_run: dryRun, report_id: reportId, delivery_format: format, interactive_url_created: Boolean(interactiveUrl), pdf_created: Boolean(pdfPath), pdf_path: pdfPath, pdf_bytes: pdfBytes, whatsapp_sent: !dryRun, message_ids: messageIds, metrics };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
  try {
    requireInternal(req);
    const body = await req.json().catch(() => ({}));
    const reportId = String(body.report_request_id || "");
    if (!/^[0-9a-f-]{36}$/i.test(reportId)) throw new Error("invalid_report_request_id");
    const dryRun = body.dry_run !== false;
    return json(await processReport(reportId, dryRun));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json({ ok: false, error: message }, message === "unauthorized_internal_request" ? 401 : 500);
  }
});
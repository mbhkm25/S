import { createClient } from "npm:@supabase/supabase-js@2";
import {
  loadCanonicalReportEntityLogos,
  resolveReportFinancialEntity
} from "../_shared/financialEntityReportAssets.ts";

type Json = Record<string, unknown>;
type ReportRequest = {
  id: string;
  requested_by_user_id: string;
  destination_phone: string;
  report_context: "personal" | "business";
  business_id?: string | null;
  report_title?: string | null;
  report_scope?: string | null;
  date_from?: string | null;
  date_to?: string | null;
  filters?: Json | null;
};
type OperationRow = {
  id?: string | null;
  public_token?: string | null;
  summary?: string | null;
  created_at?: string | null;
  transaction_datetime?: string | null;
  reference_number?: string | null;
  financial_entity?: string | null;
  transaction_type?: string | null;
  amount?: number | string | null;
  currency?: string | null;
  status?: string | null;
  ai_status?: string | null;
  verified_by_name?: string | null;
  linked_by_name?: string | null;
  file_available?: boolean | null;
  file_mime_type?: string | null;
  file_original_name?: string | null;
  original_file_status?: string | null;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-sanad-secret, x-sanad-internal-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};
const numberFormatter = new Intl.NumberFormat("en-US", { numberingSystem: "latn", maximumFractionDigits: 2 });
const integerFormatter = new Intl.NumberFormat("en-US", { numberingSystem: "latn", maximumFractionDigits: 0 });
const dateTimeFormatter = new Intl.DateTimeFormat("en-GB", {
  numberingSystem: "latn", timeZone: "Asia/Aden", year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", hour12: false
});
const dateFormatter = new Intl.DateTimeFormat("en-GB", {
  numberingSystem: "latn", timeZone: "Asia/Aden", year: "numeric", month: "2-digit", day: "2-digit"
});

function respond(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" } });
}
function env(name: string, fallback?: string) {
  const value = Deno.env.get(name) || fallback;
  if (!value) throw new Error(`missing_env_${name}`);
  return value;
}
function requireInternalSecret(req: Request) {
  const modern = Deno.env.get("SANAD_INTERNAL_API_KEY");
  const legacy = Deno.env.get("SANAD_INTERNAL_SECRET");
  if (modern && req.headers.get("x-sanad-internal-key") === modern) return;
  if (!modern && legacy && req.headers.get("x-sanad-secret") === legacy) return;
  throw new Error(modern || legacy ? "unauthorized_internal_request" : "missing_internal_secret_configuration");
}
function safeText(value: unknown, fallback = "—", max = 600) {
  const text = String(value ?? fallback).replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  return (text || fallback).slice(0, max);
}
function esc(value: unknown) {
  return safeText(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}
function attr(value: unknown) { return esc(value); }
function count(value: unknown) { return integerFormatter.format(Number(value || 0)); }
function fmtDate(value?: string | null, short = false) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? safeText(value) : (short ? dateFormatter : dateTimeFormatter).format(date);
}
function fmtAmount(amount: unknown, currency?: string | null) {
  if (amount === null || amount === undefined || amount === "") return "—";
  const number = Number(amount);
  const value = Number.isFinite(number) ? numberFormatter.format(number) : safeText(amount);
  return `${value} ${safeText(currency || "", "")}`.trim();
}
function boolFilter(filters: Json, key: string, fallback: boolean) {
  return typeof filters[key] === "boolean" ? Boolean(filters[key]) : fallback;
}
function statusLabel(value?: string | null) {
  const labels: Record<string, string> = { verified: "موثقة", ready: "جاهزة", stored: "مخزنة", received: "مستلمة", matched: "مطابقة", failed: "فاشلة" };
  return value ? labels[value] || safeText(value) : "—";
}
function aiLabel(value?: string | null) {
  const labels: Record<string, string> = { completed: "التحليل مكتمل", pending: "بانتظار التحليل", running: "التحليل جارٍ", failed: "فشل التحليل" };
  return value ? labels[value] || safeText(value) : "—";
}
function transactionLabel(value?: string | null) {
  const labels: Record<string, string> = { transfer: "تحويل", payment: "دفع", deposit: "إيداع", withdrawal: "سحب" };
  return value ? labels[value] || safeText(value) : "—";
}
function compactSummary(value?: string | null, max = 260) {
  const text = safeText(value, "—", 1200);
  return text.length > max ? `${text.slice(0, max - 1).trim()}…` : text;
}
function joinUrl(base: string, path: string) { return `${base.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`; }
async function remoteImageDataUri(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, { headers: { accept: "image/webp,image/png,image/*" } });
    if (!response.ok) return null;
    const bytes = new Uint8Array(await response.arrayBuffer());
    let binary = "";
    for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
    return `data:${response.headers.get("content-type") || "image/webp"};base64,${btoa(binary)}`;
  } catch { return null; }
}

function buildHtml(payload: Json, appBaseUrl: string, logoDataUri: string | null, entityLogos: Record<string, string>) {
  const request = payload.request as ReportRequest;
  const business = (payload.business || null) as Json | null;
  const operations = Array.isArray(payload.operations) ? payload.operations as OperationRow[] : [];
  const filters = (request.filters || {}) as Json;
  const totalCount = Number(payload.operations_total_count || operations.length);
  const returnedCount = Number(payload.operations_returned_count || operations.length);
  const truncated = Boolean(payload.operations_truncated);
  const verifiedCount = operations.filter((operation) => operation.status === "verified").length;
  const otherCount = operations.length - verifiedCount;
  const includeIcons = boolFilter(filters, "include_entity_icons", true);
  const includeOperationLinks = boolFilter(filters, "include_operation_links", true);
  const includeFileLinks = boolFilter(filters, "include_file_links", true);
  const title = request.report_title || (request.report_context === "business" ? `تقرير عمليات ${safeText(business?.name || "النشاط")}` : "تقرير عمليات سند");

  const rows = operations.map((operation, index) => {
    const entity = resolveReportFinancialEntity(operation.financial_entity);
    const entityName = entity?.nameAr || safeText(operation.financial_entity || "جهة غير محددة");
    const entityLogo = entity ? entityLogos[entity.key] : "";
    const detailUrl = operation.public_token ? `${appBaseUrl.replace(/\/$/, "")}/v/${encodeURIComponent(operation.public_token)}` : null;
    const fileUrl = detailUrl ? `${detailUrl}?openFile=1&src=report_pdf` : null;
    const entityVisual = includeIcons && entityLogo
      ? `<span class="entity-logo-frame"><img src="${attr(entityLogo)}" alt="شعار ${attr(entityName)}"></span>`
      : `<span class="entity-logo-fallback" aria-hidden="true">◆</span>`;
    const detailsAction = includeOperationLinks && detailUrl
      ? `<a class="pdf-action primary" href="${attr(detailUrl)}">تفاصيل</a>` : "";
    const fileAction = includeFileLinks && operation.file_available && fileUrl
      ? `<a class="pdf-action" href="${attr(fileUrl)}">${String(operation.file_mime_type || "").includes("pdf") ? "PDF" : "المستند"}</a>` : "";
    return `<tr>
      <td class="num">${count(index + 1)}</td>
      <td class="date">${esc(fmtDate(operation.transaction_datetime || operation.created_at))}</td>
      <td><div class="entity-cell">${entityVisual}<span>${esc(entityName)}</span></div></td>
      <td><strong>${esc(transactionLabel(operation.transaction_type))}</strong><div class="reference ltr">${esc(operation.reference_number || "—")}</div></td>
      <td class="amount">${esc(fmtAmount(operation.amount, operation.currency))}</td>
      <td><span class="status status-${attr(operation.status || "other")}">${esc(statusLabel(operation.status))}</span><div class="ai-state">${esc(aiLabel(operation.ai_status))}</div></td>
      <td>${esc(operation.verified_by_name || operation.linked_by_name || "—")}</td>
      <td class="actions-cell">${detailsAction}${fileAction || (!detailsAction ? "—" : "")}</td>
      <td class="summary">${esc(compactSummary(operation.summary))}</td>
    </tr>`;
  }).join("");

  const contextRows = request.report_context === "business"
    ? `<tr><th>النشاط</th><td>${esc(business?.name || "—")}</td><th>نوع التقرير</th><td>تقرير عمليات النشاط</td></tr>`
    : `<tr><th>نوع التقرير</th><td>تقرير عمليات شخصي</td><th>النطاق</th><td>${esc(request.report_scope || "all")}</td></tr>`;

  const css = `@page{size:A4;margin:12mm 8mm}*{box-sizing:border-box}body{margin:0;direction:rtl;font-family:Arial,Tahoma,"Noto Sans Arabic",sans-serif;color:#111827;background:#fff;font-size:10px;line-height:1.55;font-variant-numeric:lining-nums tabular-nums}header{display:flex;justify-content:space-between;gap:16px;border-bottom:2px solid #111827;padding-bottom:9px;margin-bottom:12px}.brand-logo{display:block;width:138px;height:58px;object-fit:contain;object-position:right center}.brand h1{margin:0;font-size:24px}.brand p{margin:2px 0 0;color:#4b5563}.meta{direction:ltr;text-align:left;font-size:8px;color:#64748b}.cards{display:grid;grid-template-columns:repeat(3,1fr);gap:7px}.card{border:1px solid #dbe1e8;border-radius:9px;padding:8px;background:#f8fafc}.label{color:#64748b;font-size:8px}.value{font-weight:800;font-size:16px;margin-top:2px}section{margin-top:13px}h2{font-size:13px;margin:0 0 6px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #dbe1e8;padding:4px 5px;vertical-align:top;text-align:right}th{background:#f1f5f9;font-weight:800}.ops{table-layout:fixed;font-size:7.7px}.ops tr{page-break-inside:avoid;break-inside:avoid}.ops th:nth-child(1){width:3%}.ops th:nth-child(2){width:10%}.ops th:nth-child(3){width:12%}.ops th:nth-child(4){width:11%}.ops th:nth-child(5){width:9%}.ops th:nth-child(6){width:10%}.ops th:nth-child(7){width:10%}.ops th:nth-child(8){width:8%}.ops th:nth-child(9){width:27%}.num{text-align:center;direction:ltr}.date{direction:ltr;text-align:left}.ltr,.amount{direction:ltr;text-align:left}.amount{font-weight:800;white-space:nowrap}.entity-cell{display:flex;align-items:center;gap:4px}.entity-logo-frame{width:25px;height:25px;flex:0 0 25px;display:flex;align-items:center;justify-content:center;overflow:hidden;border:1px solid #e5e7eb;border-radius:6px;background:#fff;padding:2px}.entity-logo-frame img{display:block;width:100%;height:100%;object-fit:contain;object-position:center;background:#fff;filter:none;transform:none}.entity-logo-fallback{width:21px;height:21px;flex:0 0 21px;display:grid;place-items:center;border-radius:5px;background:#f1f5f9;color:#94a3b8}.reference{margin-top:2px;color:#64748b;font-size:7px;word-break:break-all}.status{display:inline-block;border-radius:999px;padding:1px 4px;font-weight:800;white-space:nowrap}.status-verified{background:#dcfce7;color:#166534}.status-ready{background:#e0f2fe;color:#075985}.status-failed{background:#fee2e2;color:#991b1b}.status-other{background:#f1f5f9;color:#475569}.ai-state{margin-top:2px;color:#64748b;font-size:6.8px}.actions-cell{text-align:center}.pdf-action{display:block;margin:0 0 3px;border:1px solid #cbd5e1;border-radius:4px;padding:2px 3px;color:#334155;text-decoration:none;white-space:nowrap;background:#fff;font-weight:700}.pdf-action.primary{background:#0f172a;color:#fff;border-color:#0f172a}.summary{word-break:break-word}.empty{text-align:center;padding:15px;color:#64748b}.notice{margin-top:9px;padding:7px;border:1px solid #f0c36d;background:#fff8e6;border-radius:7px}.disclaimer{margin-top:13px;padding-top:8px;border-top:1px solid #dbe1e8;color:#64748b;font-size:8px}.footer{direction:ltr;text-align:left;color:#64748b;font-size:7px;margin-top:6px}`;
  const details = `<section><h2>تفاصيل العمليات</h2><table class="ops"><thead><tr><th>#</th><th>التاريخ</th><th>الجهة</th><th>العملية</th><th>المبلغ</th><th>الحالة</th><th>بواسطة</th><th>الوصول</th><th>الملخص</th></tr></thead><tbody>${rows || `<tr><td colspan="9" class="empty">لا توجد عمليات ضمن نطاق التقرير.</td></tr>`}</tbody></table></section>`;
  const html = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${esc(title)}</title><style>${css}</style></head><body><header><div class="brand">${logoDataUri ? `<img class="brand-logo" src="${attr(logoDataUri)}" alt="SANAD">` : `<h1>سند | SANAD</h1>`}<p>${esc(title)}</p></div><div class="meta"><div>Report ID: ${esc(request.id)}</div><div>Created: ${esc(fmtDate(new Date().toISOString()))}</div><div>Template: operations-v2</div></div></header><section><h2>ملخص العمليات</h2><div class="cards"><div class="card"><div class="label">عدد العمليات</div><div class="value">${count(totalCount)}</div></div><div class="card"><div class="label">الموثقة</div><div class="value">${count(verifiedCount)}</div></div><div class="card"><div class="label">الأخرى</div><div class="value">${count(otherCount)}</div></div></div></section><section><table><tbody>${contextRows}<tr><th>الفترة</th><td>${esc(fmtDate(request.date_from, true))} — ${esc(fmtDate(request.date_to, true))}</td><th>رقم واتساب</th><td class="ltr">${esc(request.destination_phone)}</td></tr></tbody></table></section>${truncated ? `<div class="notice">يعرض التقرير أول ${count(returnedCount)} عملية من أصل ${count(totalCount)} عملية مطابقة للفلاتر.</div>` : ""}${details}<div class="disclaimer">تعرض روابط المستند صفحة العملية الآمنة؛ لا يحتوي هذا التقرير على روابط تخزين مؤقتة أو مسارات داخلية. يعرض التقرير العمليات المسجلة وتفاصيل التحقق منها فقط، ولا يعد كشفًا محاسبيًا.</div><div class="footer">SANAD operations report — ${esc(request.id)}</div></body></html>`;
  return {
    html,
    metrics: {
      report_template_version: "operations-v2",
      operations_count: totalCount,
      returned_count: returnedCount,
      verified_count: verifiedCount,
      other_count: otherCount,
      truncated,
      entity_icons_enabled: includeIcons,
      operation_links_enabled: includeOperationLinks,
      file_links_enabled: includeFileLinks,
      attachment_previews_enabled: false
    }
  };
}

async function renderPdf(html: string) {
  const form = new FormData();
  form.append("files", new Blob([html], { type: "text/html; charset=utf-8" }), "index.html");
  form.append("paperWidth", "8.27"); form.append("paperHeight", "11.69"); form.append("printBackground", "true"); form.append("preferCssPageSize", "true");
  const response = await fetch(joinUrl(env("GOTENBERG_URL"), "/forms/chromium/convert/html"), {
    method: "POST", headers: { "X-Gotenberg-Token": env("GOTENBERG_TOKEN") }, body: form
  });
  if (!response.ok) throw new Error(`gotenberg_render_failed_${response.status}_${(await response.text().catch(() => "")).slice(0, 300)}`);
  return new Uint8Array(await response.arrayBuffer());
}
async function uploadToWhatsapp(pdf: Uint8Array, filename: string) {
  const form = new FormData();
  form.append("messaging_product", "whatsapp"); form.append("type", "application/pdf"); form.append("file", new Blob([pdf], { type: "application/pdf" }), filename);
  const response = await fetch(`https://graph.facebook.com/v20.0/${env("META_WA_PHONE_NUMBER_ID")}/media`, {
    method: "POST", headers: { Authorization: `Bearer ${env("META_WA_ACCESS_TOKEN")}` }, body: form
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.id) throw new Error(`whatsapp_media_upload_failed_${response.status}`);
  return String(data.id);
}
async function sendDocument(to: string, mediaId: string, filename: string, caption: string) {
  const response = await fetch(`https://graph.facebook.com/v20.0/${env("META_WA_PHONE_NUMBER_ID")}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env("META_WA_ACCESS_TOKEN")}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to, type: "document", document: { id: mediaId, filename, caption } })
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`whatsapp_send_failed_${response.status}`);
  const messageId = Array.isArray(data?.messages) && data.messages[0]?.id ? String(data.messages[0].id) : null;
  if (!messageId) throw new Error("whatsapp_send_missing_message_id");
  return data as Json;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return respond({ ok: false, error: "method_not_allowed" }, 405);
  let sb: ReturnType<typeof createClient> | null = null;
  let report: ReportRequest | null = null;
  try {
    requireInternalSecret(req);
    sb = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
    const body = await req.json().catch(() => ({}));
    const requestedId = typeof body?.report_request_id === "string" ? body.report_request_id : null;
    await sb.rpc("requeue_stale_report_requests");
    const { data: claim, error: claimError } = await sb.rpc("claim_report_request", { p_report_request_id: requestedId });
    if (claimError) throw claimError;
    if (!claim) return respond({ ok: true, skipped: true, reason: requestedId ? "report_not_queueable" : "no_queued_report_request" });
    report = claim as ReportRequest;
    if (!report.destination_phone) throw new Error("report_request_missing_destination_phone");

    await sb.from("report_requests").update({ processing_stage: "building_payload_v2", updated_at: new Date().toISOString() }).eq("id", report.id);
    const { data: payload, error: payloadError } = await sb.rpc("get_report_payload_v2", { p_report_request_id: report.id });
    if (payloadError) throw payloadError;
    const appBaseUrl = env("PUBLIC_APP_BASE_URL", "https://app.sanadflow.com");
    const [logoDataUri, entityLogos] = await Promise.all([
      remoteImageDataUri(`${appBaseUrl.replace(/\/+$/, "")}/logo.png`),
      loadCanonicalReportEntityLogos(appBaseUrl)
    ]);
    const { html, metrics } = buildHtml(payload as Json, appBaseUrl, logoDataUri, entityLogos);
    await sb.from("report_requests").update({ processing_stage: "rendering_pdf_v2", updated_at: new Date().toISOString() }).eq("id", report.id);
    const pdf = await renderPdf(html);

    const owner = String(report.requested_by_user_id || "unknown").replace(/[^a-zA-Z0-9_-]/g, "");
    const context = report.report_context === "business" ? "business" : "personal";
    const bucket = env("SUPABASE_STORAGE_BUCKET", "operation-files");
    const path = `reports/${context}/${owner}/${report.id}.pdf`;
    const filename = `sanad-${context}-report-${report.id}.pdf`;
    const { error: uploadError } = await sb.storage.from(bucket).upload(path, pdf, { contentType: "application/pdf", upsert: true });
    if (uploadError) throw uploadError;

    await sb.from("report_requests").update({ status: "ready", processing_stage: "uploading_whatsapp_media", result_bucket: bucket, result_path: path, result_metrics: metrics, processed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", report.id);
    const mediaId = await uploadToWhatsapp(pdf, filename);
    await sb.from("report_requests").update({ processing_stage: "sending_whatsapp", updated_at: new Date().toISOString() }).eq("id", report.id);
    const contextLabel = report.report_context === "business" ? "تقرير عمليات النشاط" : "تقرير عمليات سند";
    const caption = `${contextLabel} جاهز ✅\nعدد العمليات: ${count(metrics.operations_count)}\nالموثقة: ${count(metrics.verified_count)}\n\nسند | SANAD`;
    const whatsapp = await sendDocument(report.destination_phone, mediaId, filename, caption);
    const messageId = Array.isArray(whatsapp?.messages) && (whatsapp.messages[0] as Json)?.id ? String((whatsapp.messages[0] as Json).id) : null;
    const acceptedAt = new Date().toISOString();
    const { error: sentError } = await sb.from("report_requests").update({ status: "sent", processing_stage: "accepted_by_whatsapp", whatsapp_message_id: messageId, delivery_status: "accepted", accepted_at: acceptedAt, sent_at: acceptedAt, last_delivery_event_at: acceptedAt, processed_at: acceptedAt, error_message: null, delivery_error_code: null, delivery_error_message: null, updated_at: acceptedAt }).eq("id", report.id);
    if (sentError) throw sentError;
    return respond({ ok: true, report_id: report.id, status: "accepted", report_template_version: "operations-v2", result_bucket: bucket, result_path: path, metrics, whatsapp_message_id: messageId });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("sanad-v3-process-report-v2 failed", { report_id: report?.id || null, error: message.slice(0, 300) });
    if (sb && report?.id) {
      const failedAt = new Date().toISOString();
      await sb.from("report_requests").update({ status: "failed", processing_stage: "failed", delivery_status: "failed", failed_at: failedAt, last_delivery_event_at: failedAt, delivery_error_message: message.slice(0, 1000), error_message: message.slice(0, 1000), processed_at: failedAt, updated_at: failedAt }).eq("id", report.id);
    }
    return respond({ ok: false, error: message, report_id: report?.id || null }, 500);
  }
});

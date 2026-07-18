import { createClient } from "npm:@supabase/supabase-js@2";

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
  status?: string | null;
  attempt_count?: number | null;
};
type OperationRow = {
  id?: string | null;
  public_token?: string | null;
  relation_type?: string | null;
  summary?: string | null;
  created_at?: string | null;
  transaction_datetime?: string | null;
  verified_at?: string | null;
  reference_number?: string | null;
  financial_entity?: string | null;
  transaction_type?: string | null;
  amount?: number | string | null;
  currency?: string | null;
  status?: string | null;
  ai_status?: string | null;
  verified_by_name?: string | null;
  linked_by_name?: string | null;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-sanad-secret, x-sanad-internal-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const numberFormatter = new Intl.NumberFormat("en-US", { numberingSystem: "latn", maximumFractionDigits: 2 });
const integerFormatter = new Intl.NumberFormat("en-US", { numberingSystem: "latn", maximumFractionDigits: 0 });
const dateTimeFormatter = new Intl.DateTimeFormat("en-GB", {
  numberingSystem: "latn", timeZone: "Asia/Aden", year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", hour12: false,
});
const dateFormatter = new Intl.DateTimeFormat("en-GB", {
  numberingSystem: "latn", timeZone: "Asia/Aden", year: "numeric", month: "2-digit", day: "2-digit",
});

const SANAD_LOGO_DATA_URI = "data:image/webp;base64,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";

async function getSanadLogoDataUri(): Promise<string | null> {
  return SANAD_LOGO_DATA_URI;
}

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
function fmtDate(value?: string | null, short = false) {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? safeText(value) : (short ? dateFormatter : dateTimeFormatter).format(d);
}
function fmtAmount(amount: unknown, currency?: string | null) {
  if (amount === null || amount === undefined || amount === "") return "—";
  const n = Number(amount);
  const value = Number.isFinite(n) ? numberFormatter.format(n) : safeText(amount);
  return `${value} ${safeText(currency || "", "")}`.trim();
}
function count(value: unknown) { return integerFormatter.format(Number(value || 0)); }
function statusLabel(value?: string | null) {
  const m: Record<string, string> = { verified: "موثقة", ready: "جاهزة", stored: "مخزنة", received: "مستلمة", matched: "مطابقة", failed: "فاشلة" };
  return value ? m[value] || safeText(value) : "—";
}
function aiLabel(value?: string | null) {
  const m: Record<string, string> = { completed: "مكتمل", pending: "بانتظار التحليل", running: "قيد التحليل", failed: "فشل التحليل" };
  return value ? m[value] || safeText(value) : "—";
}
function boolFilter(filters: Json, key: string, fallback: boolean) {
  const v = filters[key];
  return typeof v === "boolean" ? v : fallback;
}
function joinUrl(base: string, path: string) { return `${base.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`; }

function distributionCards(items: unknown, labelKey: string, title: string) {
  if (!Array.isArray(items) || !items.length) return "";
  const cards = items.map((item) => {
    const row = item as Json;
    return `<div class="mini"><div class="mini-label">${esc(row[labelKey])}</div><div class="mini-value">${esc(count(row.operations_count))} عملية</div></div>`;
  }).join("");
  return `<section><h2>${esc(title)}</h2><div class="mini-grid">${cards}</div></section>`;
}
function teamTable(items: unknown) {
  if (!Array.isArray(items) || !items.length) return "";
  const rows = items.map((item, index) => {
    const r = item as Json;
    return `<tr><td class="num">${count(index + 1)}</td><td>${esc(r.full_name || "عضو فريق")}</td><td class="num">${count(r.operations_count)}</td><td class="num">${count(r.verified_count)}</td><td class="num">${count(r.pending_count)}</td><td>${esc(fmtDate(r.last_activity_at as string | null))}</td></tr>`;
  }).join("");
  return `<section><h2>أداء أعضاء الفريق</h2><table><thead><tr><th>#</th><th>العضو</th><th>العمليات</th><th>الموثقة</th><th>الأخرى</th><th>آخر نشاط</th></tr></thead><tbody>${rows}</tbody></table></section>`;
}

function buildHtml(payload: Json, baseUrl: string, logoDataUri: string | null) {
  const request = payload.request as ReportRequest;
  const business = (payload.business || null) as Json | null;
  const operations = Array.isArray(payload.operations) ? payload.operations as OperationRow[] : [];
  const filters = (request.filters || {}) as Json;
  const totalCount = Number(payload.operations_total_count || operations.length);
  const returnedCount = Number(payload.operations_returned_count || operations.length);
  const truncated = Boolean(payload.operations_truncated);
  const verifiedCount = operations.filter((o) => o.status === "verified").length;
  const reviewCount = operations.filter((o) => o.status !== "verified").length;
  const includeDetails = boolFilter(filters, "include_details", true);
  const includeTeam = request.report_context === "business" && boolFilter(filters, "include_team_performance", true);
  const includeCurrency = request.report_context === "business" && boolFilter(filters, "include_currency_distribution", true);
  const includeStatus = request.report_context === "business" && boolFilter(filters, "include_status_distribution", true);
  const includeEntity = request.report_context === "business" && boolFilter(filters, "include_entity_distribution", true);
  const title = request.report_title || (request.report_context === "business" ? `تقرير عمليات ${safeText(business?.name || "النشاط")}` : "تقرير عمليات سند");

  const operationRows = operations.map((o, i) => {
    const detailUrl = o.public_token ? `${baseUrl.replace(/\/$/, "")}/v/${o.public_token}` : "—";
    return `<tr><td class="num">${count(i + 1)}</td><td>${esc(fmtDate(o.transaction_datetime || o.created_at))}</td><td class="ltr">${esc(o.reference_number || "—")}</td><td>${esc(o.financial_entity || "—")}</td><td>${esc(o.transaction_type || "—")}</td><td class="amount">${esc(fmtAmount(o.amount, o.currency))}</td><td>${esc(statusLabel(o.status))}</td><td>${esc(aiLabel(o.ai_status))}</td><td>${esc(o.verified_by_name || o.linked_by_name || "—")}</td><td class="summary">${esc(o.summary || detailUrl)}</td></tr>`;
  }).join("");

  const details = includeDetails ? `<section><h2>تفاصيل العمليات</h2><table class="ops"><thead><tr><th>#</th><th>التاريخ</th><th>المرجع</th><th>الجهة</th><th>النوع</th><th>المبلغ</th><th>الحالة</th><th>التحليل</th><th>بواسطة</th><th>الملخص</th></tr></thead><tbody>${operationRows || `<tr><td colspan="10" class="empty">لا توجد عمليات ضمن نطاق التقرير.</td></tr>`}</tbody></table></section>` : "";
  const contextRows = request.report_context === "business" ? `<tr><th>النشاط</th><td>${esc(business?.name || "—")}</td><th>نوع التقرير</th><td>تقرير عمليات النشاط</td></tr>` : `<tr><th>نوع التقرير</th><td>تقرير عمليات شخصي</td><th>النطاق</th><td>${esc(request.report_scope || "all")}</td></tr>`;

  return { html: `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${esc(title)}</title><style>@page{size:A4;margin:13mm 9mm}*{box-sizing:border-box}body{margin:0;direction:rtl;font-family:Arial,Tahoma,"Noto Sans Arabic",sans-serif;color:#111827;background:#fff;font-size:11px;line-height:1.6;font-variant-numeric:lining-nums tabular-nums}header{display:flex;justify-content:space-between;gap:16px;border-bottom:2px solid #111827;padding-bottom:10px;margin-bottom:14px}.brand h1{margin:0;font-size:26px}.brand-logo{display:block;width:145px;height:64px;object-fit:contain;object-position:right center}.brand p{margin:2px 0 0;color:#4b5563}.meta{direction:ltr;text-align:left;font-size:9px;color:#4b5563}.cards{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.card,.mini{border:1px solid #dbe1e8;border-radius:10px;padding:9px;background:#f8fafc}.label,.mini-label{color:#64748b;font-size:9px}.value,.mini-value{font-weight:800;font-size:17px;margin-top:3px}.mini-value{font-size:12px}.mini-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:7px}section{margin-top:15px}h2{font-size:14px;margin:0 0 7px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #dbe1e8;padding:5px 6px;vertical-align:top;text-align:right}th{background:#f1f5f9;font-weight:800}.ops{font-size:8.7px}.ops tr{page-break-inside:avoid}.num{text-align:center;direction:ltr}.ltr,.amount{direction:ltr;text-align:left;white-space:nowrap}.summary{max-width:180px;word-break:break-word}.empty{text-align:center;padding:16px;color:#64748b}.notice{margin-top:10px;padding:8px;border:1px solid #f0c36d;background:#fff8e6;border-radius:8px}.disclaimer{margin-top:15px;padding-top:9px;border-top:1px solid #dbe1e8;color:#64748b;font-size:9px}.footer{direction:ltr;text-align:left;color:#64748b;font-size:8px;margin-top:7px}</style></head><body><header><div class="brand">${logoDataUri ? `<img class="brand-logo" src="${logoDataUri}" alt="SANAD">` : `<h1>سند | SANAD</h1>`}<p>${esc(title)}</p></div><div class="meta"><div>Report ID: ${esc(request.id)}</div><div>Created: ${esc(fmtDate(new Date().toISOString()))}</div></div></header><section><h2>ملخص العمليات</h2><div class="cards"><div class="card"><div class="label">عدد العمليات</div><div class="value">${count(totalCount)}</div></div><div class="card"><div class="label">الموثقة</div><div class="value">${count(verifiedCount)}</div></div><div class="card"><div class="label">الأخرى</div><div class="value">${count(reviewCount)}</div></div></div></section><section><table><tbody>${contextRows}<tr><th>الفترة</th><td>${esc(fmtDate(request.date_from, true))} — ${esc(fmtDate(request.date_to, true))}</td><th>رقم واتساب</th><td class="ltr">${esc(request.destination_phone)}</td></tr></tbody></table></section>${truncated ? `<div class="notice">يعرض التقرير أول ${count(returnedCount)} عملية من أصل ${count(totalCount)} عملية مطابقة للفلاتر.</div>` : ""}${includeCurrency ? distributionCards(payload.currency_distribution, "currency", "توزيع العمليات حسب العملة") : ""}${includeStatus ? distributionCards(payload.status_distribution, "status", "توزيع العمليات حسب الحالة") : ""}${includeEntity ? distributionCards(payload.entity_distribution, "financial_entity", "توزيع العمليات حسب الجهة") : ""}${includeTeam ? teamTable(payload.team_performance) : ""}${details}<div class="disclaimer">يعرض هذا التقرير العمليات المسجلة وتفاصيل التحقق منها فقط. لا يُعد كشفًا محاسبيًا، ولا يتضمن إجماليات مالية أو أرباحًا أو عمولات أو أرصدة، ولا يجمع مبالغ العملات المختلفة.</div><div class="footer">SANAD operations report — ${esc(request.id)}</div></body></html>`, metrics: { operations_count: totalCount, returned_count: returnedCount, verified_count: verifiedCount, other_count: reviewCount, truncated } };
}

async function renderPdf(html: string) {
  const form = new FormData();
  form.append("files", new Blob([html], { type: "text/html; charset=utf-8" }), "index.html");
  form.append("paperWidth", "8.27"); form.append("paperHeight", "11.69"); form.append("printBackground", "true"); form.append("preferCssPageSize", "true");
  const res = await fetch(joinUrl(env("GOTENBERG_URL"), "/forms/chromium/convert/html"), { method: "POST", headers: { "X-Gotenberg-Token": env("GOTENBERG_TOKEN") }, body: form });
  if (!res.ok) throw new Error(`gotenberg_render_failed_${res.status}_${(await res.text().catch(() => "")).slice(0, 300)}`);
  return new Uint8Array(await res.arrayBuffer());
}
async function uploadToWhatsapp(pdf: Uint8Array, filename: string) {
  const form = new FormData(); form.append("messaging_product", "whatsapp"); form.append("type", "application/pdf"); form.append("file", new Blob([pdf], { type: "application/pdf" }), filename);
  const res = await fetch(`https://graph.facebook.com/v20.0/${env("META_WA_PHONE_NUMBER_ID")}/media`, { method: "POST", headers: { Authorization: `Bearer ${env("META_WA_ACCESS_TOKEN")}` }, body: form });
  const data = await res.json().catch(() => null); if (!res.ok || !data?.id) throw new Error(`whatsapp_media_upload_failed_${res.status}`); return String(data.id);
}
async function sendDocument(to: string, mediaId: string, filename: string, caption: string) {
  const res = await fetch(`https://graph.facebook.com/v20.0/${env("META_WA_PHONE_NUMBER_ID")}/messages`, { method: "POST", headers: { Authorization: `Bearer ${env("META_WA_ACCESS_TOKEN")}`, "Content-Type": "application/json" }, body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to, type: "document", document: { id: mediaId, filename, caption } }) });
  const data = await res.json().catch(() => null); if (!res.ok) throw new Error(`whatsapp_send_failed_${res.status}`); const messageId = Array.isArray(data?.messages) && data.messages[0]?.id ? String(data.messages[0].id) : null; if (!messageId) throw new Error("whatsapp_send_missing_message_id"); return data as Json;
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

    await sb.from("report_requests").update({ processing_stage: "building_payload", updated_at: new Date().toISOString() }).eq("id", report.id);
    const { data: payload, error: payloadError } = await sb.rpc("get_report_payload", { p_report_request_id: report.id });
    if (payloadError) throw payloadError;

    const logoDataUri = await getSanadLogoDataUri();
    const { html, metrics } = buildHtml(payload as Json, env("PUBLIC_APP_BASE_URL", "https://app.sanadflow.com"), logoDataUri);
    await sb.from("report_requests").update({ processing_stage: "rendering_pdf", updated_at: new Date().toISOString() }).eq("id", report.id);
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
    const wa = await sendDocument(report.destination_phone, mediaId, filename, caption);
    const messageId = Array.isArray(wa?.messages) && (wa.messages[0] as Json)?.id ? String((wa.messages[0] as Json).id) : null;

    const acceptedAt = new Date().toISOString();
    const { error: sentError } = await sb.from("report_requests").update({ status: "sent", processing_stage: "accepted_by_whatsapp", whatsapp_message_id: messageId, delivery_status: "accepted", accepted_at: acceptedAt, sent_at: acceptedAt, last_delivery_event_at: acceptedAt, delivery_attempts: Number((report as any).delivery_attempts || 0) + 1, processed_at: acceptedAt, error_message: null, delivery_error_code: null, delivery_error_message: null, updated_at: acceptedAt }).eq("id", report.id);
    if (sentError) throw sentError;
    return respond({ ok: true, report_id: report.id, status: "accepted", delivery_status: "accepted", report_context: report.report_context, result_bucket: bucket, result_path: path, destination_phone: report.destination_phone, metrics, whatsapp_message_id: messageId });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("sanad-v3-process-report failed", { report_id: report?.id || null, error: message.slice(0, 300) });
    if (sb && report?.id) { const failedAt = new Date().toISOString(); await sb.from("report_requests").update({ status: "failed", processing_stage: "failed", delivery_status: "failed", failed_at: failedAt, last_delivery_event_at: failedAt, delivery_error_message: message.slice(0, 1000), error_message: message.slice(0, 1000), processed_at: failedAt, updated_at: failedAt }).eq("id", report.id); }
    return respond({ ok: false, error: message, report_id: report?.id || null }, 500);
  }
});

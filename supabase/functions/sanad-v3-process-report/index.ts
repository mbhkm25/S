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

function buildHtml(payload: Json, baseUrl: string) {
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

  return { html: `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${esc(title)}</title><style>@page{size:A4;margin:13mm 9mm}*{box-sizing:border-box}body{margin:0;direction:rtl;font-family:Arial,Tahoma,"Noto Sans Arabic",sans-serif;color:#111827;background:#fff;font-size:11px;line-height:1.6;font-variant-numeric:lining-nums tabular-nums}header{display:flex;justify-content:space-between;gap:16px;border-bottom:2px solid #111827;padding-bottom:10px;margin-bottom:14px}.brand h1{margin:0;font-size:26px}.brand p{margin:2px 0 0;color:#4b5563}.meta{direction:ltr;text-align:left;font-size:9px;color:#4b5563}.cards{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.card,.mini{border:1px solid #dbe1e8;border-radius:10px;padding:9px;background:#f8fafc}.label,.mini-label{color:#64748b;font-size:9px}.value,.mini-value{font-weight:800;font-size:17px;margin-top:3px}.mini-value{font-size:12px}.mini-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:7px}section{margin-top:15px}h2{font-size:14px;margin:0 0 7px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #dbe1e8;padding:5px 6px;vertical-align:top;text-align:right}th{background:#f1f5f9;font-weight:800}.ops{font-size:8.7px}.ops tr{page-break-inside:avoid}.num{text-align:center;direction:ltr}.ltr,.amount{direction:ltr;text-align:left;white-space:nowrap}.summary{max-width:180px;word-break:break-word}.empty{text-align:center;padding:16px;color:#64748b}.notice{margin-top:10px;padding:8px;border:1px solid #f0c36d;background:#fff8e6;border-radius:8px}.disclaimer{margin-top:15px;padding-top:9px;border-top:1px solid #dbe1e8;color:#64748b;font-size:9px}.footer{direction:ltr;text-align:left;color:#64748b;font-size:8px;margin-top:7px}</style></head><body><header><div class="brand"><h1>سند | SANAD</h1><p>${esc(title)}</p></div><div class="meta"><div>Report ID: ${esc(request.id)}</div><div>Created: ${esc(fmtDate(new Date().toISOString()))}</div></div></header><section><h2>ملخص العمليات</h2><div class="cards"><div class="card"><div class="label">عدد العمليات</div><div class="value">${count(totalCount)}</div></div><div class="card"><div class="label">الموثقة</div><div class="value">${count(verifiedCount)}</div></div><div class="card"><div class="label">الأخرى</div><div class="value">${count(reviewCount)}</div></div></div></section><section><table><tbody>${contextRows}<tr><th>الفترة</th><td>${esc(fmtDate(request.date_from, true))} — ${esc(fmtDate(request.date_to, true))}</td><th>رقم واتساب</th><td class="ltr">${esc(request.destination_phone)}</td></tr></tbody></table></section>${truncated ? `<div class="notice">يعرض التقرير أول ${count(returnedCount)} عملية من أصل ${count(totalCount)} عملية مطابقة للفلاتر.</div>` : ""}${includeCurrency ? distributionCards(payload.currency_distribution, "currency", "توزيع العمليات حسب العملة") : ""}${includeStatus ? distributionCards(payload.status_distribution, "status", "توزيع العمليات حسب الحالة") : ""}${includeEntity ? distributionCards(payload.entity_distribution, "financial_entity", "توزيع العمليات حسب الجهة") : ""}${includeTeam ? teamTable(payload.team_performance) : ""}${details}<div class="disclaimer">يعرض هذا التقرير العمليات المسجلة وتفاصيل التحقق منها فقط. لا يُعد كشفًا محاسبيًا، ولا يتضمن إجماليات مالية أو أرباحًا أو عمولات أو أرصدة، ولا يجمع مبالغ العملات المختلفة.</div><div class="footer">SANAD operations report — ${esc(request.id)}</div></body></html>`, metrics: { operations_count: totalCount, returned_count: returnedCount, verified_count: verifiedCount, other_count: reviewCount, truncated } };
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

    const { html, metrics } = buildHtml(payload as Json, env("PUBLIC_APP_BASE_URL", "https://app.sanadflow.com"));
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

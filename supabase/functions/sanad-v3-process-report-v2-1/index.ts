import { createClient } from "npm:@supabase/supabase-js@2";
import {
  loadCanonicalReportEntityLogos,
  resolveReportFinancialEntity,
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
  notes_count?: number | null;
  has_text_note?: boolean | null;
  has_audio_note?: boolean | null;
};

const REPORT_ID = "1162626b-0159-4aea-af50-4dde59f1ffc8";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-sanad-internal-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const nf = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
const intf = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const dtf = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Aden", year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", hour12: false,
});
const df = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Aden", year: "numeric", month: "2-digit", day: "2-digit",
});

function env(name: string, fallback?: string) {
  const value = Deno.env.get(name) || fallback;
  if (!value) throw new Error(`missing_env_${name}`);
  return value;
}
function respond(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
  });
}
function requireInternal(req: Request) {
  const secret = Deno.env.get("SANAD_INTERNAL_API_KEY");
  if (!secret || req.headers.get("x-sanad-internal-key") !== secret) {
    throw new Error("unauthorized_internal_request");
  }
}
function safeText(value: unknown, fallback = "—", max = 600) {
  const text = String(value ?? fallback)
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return (text || fallback).slice(0, max);
}
function escapeHtml(value: unknown) {
  return safeText(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
function escapeAttr(value: unknown) {
  return escapeHtml(value);
}
function imageDataAttr(value: string | null | undefined) {
  if (!value || !/^data:image\/(?:png|jpeg|jpg|webp);base64,[A-Za-z0-9+/=]+$/.test(value)) return "";
  return value.replace(/"/g, "&quot;");
}
function fmtDate(value?: string | null, short = false) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? safeText(value) : (short ? df : dtf).format(date);
}
function fmtAmount(amount: unknown, currency?: string | null) {
  if (amount === null || amount === undefined || amount === "") return "—";
  const numeric = Number(amount);
  const value = Number.isFinite(numeric) ? nf.format(numeric) : safeText(amount);
  return `${value} ${safeText(currency || "", "")}`.trim();
}
function compact(value?: string | null, max = 210) {
  const text = safeText(value, "—", 1200);
  return text.length > max ? `${text.slice(0, max - 1).trim()}…` : text;
}
function transactionLabel(value?: string | null) {
  const labels: Record<string, string> = {
    transfer: "تحويل", payment: "دفع", deposit: "إيداع", withdrawal: "سحب",
  };
  return value ? labels[value] || safeText(value) : "—";
}
function statusLabel(value?: string | null) {
  const labels: Record<string, string> = {
    verified: "موثقة", ready: "جاهزة", stored: "مخزنة", received: "مستلمة", matched: "مطابقة", failed: "فاشلة",
  };
  return value ? labels[value] || safeText(value) : "—";
}
function currencyClass(value?: string | null) {
  const code = String(value || "").toUpperCase();
  if (code === "YER") return "currency-yer";
  if (code === "SAR") return "currency-sar";
  if (code === "AED") return "currency-aed";
  if (code === "USD") return "currency-usd";
  return "currency-other";
}
function noteBadges(operation: OperationRow) {
  if (!operation.notes_count) return '<span class="no-note">—</span>';
  const badges: string[] = [];
  if (operation.has_text_note) badges.push('<span class="note-badge text-note">نص</span>');
  if (operation.has_audio_note) badges.push('<span class="note-badge audio-note">صوت</span>');
  if (!badges.length) badges.push(`<span class="note-badge">${intf.format(operation.notes_count)}</span>`);
  return `<div class="note-stack">${badges.join("")}</div>`;
}
async function fetchImageDataUri(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, { headers: { accept: "image/webp,image/png,image/jpeg,image/*" } });
    const type = response.headers.get("content-type") || "";
    if (!response.ok || !type.startsWith("image/")) return null;
    const bytes = new Uint8Array(await response.arrayBuffer());
    let binary = "";
    for (let offset = 0; offset < bytes.length; offset += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
    }
    return `data:${type};base64,${btoa(binary)}`;
  } catch {
    return null;
  }
}

function buildHtml(payload: Json, appBaseUrl: string, logoData: string | null, entityLogos: Record<string, string>) {
  const request = payload.request as ReportRequest;
  const business = (payload.business || null) as Json | null;
  const operations = Array.isArray(payload.operations) ? payload.operations as OperationRow[] : [];
  const total = Number(payload.operations_total_count || operations.length);
  const verified = operations.filter((operation) => operation.status === "verified").length;
  const withNotes = operations.filter((operation) => Number(operation.notes_count || 0) > 0).length;
  const title = request.report_title || (request.report_context === "business"
    ? `تقرير عمليات ${safeText(business?.name || "النشاط")}`
    : "تقرير عمليات سند");

  const rows = operations.map((operation, index) => {
    const entity = resolveReportFinancialEntity(operation.financial_entity);
    const entityName = entity?.nameAr || safeText(operation.financial_entity || "جهة غير محددة");
    const entityLogo = entity ? entityLogos[entity.key] : "";
    const logoAttr = imageDataAttr(entityLogo);
    const detailUrl = operation.public_token
      ? `${appBaseUrl.replace(/\/$/, "")}/v/${encodeURIComponent(operation.public_token)}`
      : null;
    const fileUrl = detailUrl ? `${detailUrl}?openFile=1&src=report_pdf` : null;
    const entityVisual = logoAttr
      ? `<span class="entity-logo-frame"><img src="${logoAttr}" alt="شعار ${escapeAttr(entityName)}"></span>`
      : `<span class="entity-logo-fallback">${escapeHtml(entityName.slice(0, 1))}</span>`;
    const actions = [
      detailUrl ? `<a class="pdf-action primary" href="${escapeAttr(detailUrl)}">تفاصيل</a>` : "",
      operation.file_available && fileUrl ? `<a class="pdf-action" href="${escapeAttr(fileUrl)}">${String(operation.file_mime_type || "").includes("pdf") ? "PDF" : "المستند"}</a>` : "",
    ].filter(Boolean).join("");
    return `<tr class="${currencyClass(operation.currency)}">
      <td class="num">${intf.format(index + 1)}</td>
      <td class="date">${escapeHtml(fmtDate(operation.transaction_datetime || operation.created_at))}</td>
      <td><div class="entity-cell">${entityVisual}<span>${escapeHtml(entityName)}</span></div></td>
      <td><strong>${escapeHtml(transactionLabel(operation.transaction_type))}</strong><div class="reference">${escapeHtml(operation.reference_number || "—")}</div></td>
      <td class="amount">${escapeHtml(fmtAmount(operation.amount, operation.currency))}</td>
      <td><span class="status status-${escapeAttr(operation.status || "other")}">${escapeHtml(statusLabel(operation.status))}</span><div class="ai-state">${escapeHtml(operation.ai_status || "—")}</div></td>
      <td class="notes-cell">${noteBadges(operation)}</td>
      <td>${escapeHtml(operation.verified_by_name || operation.linked_by_name || "—")}</td>
      <td class="actions-cell">${actions || "—"}</td>
      <td class="summary">${escapeHtml(compact(operation.summary))}</td>
    </tr>`;
  }).join("");

  const brand = imageDataAttr(logoData)
    ? `<img class="brand-logo" src="${imageDataAttr(logoData)}" alt="سند">`
    : `<div class="brand-fallback"><strong>سَند</strong><span>SANAD</span></div>`;

  const css = `
    @page{size:A4 landscape;margin:10mm 7mm}
    *{box-sizing:border-box}
    body{margin:0;direction:rtl;font-family:Arial,Tahoma,"Noto Sans Arabic",sans-serif;color:#111827;background:#fff;font-size:9px;line-height:1.45}
    header{display:flex;justify-content:space-between;align-items:flex-start;gap:18px;border-bottom:2px solid #111827;padding-bottom:9px;margin-bottom:10px}
    .brand{display:flex;align-items:center;gap:12px}.brand-logo{width:150px;height:62px;object-fit:contain;object-position:right center}.brand-fallback{display:flex;align-items:baseline;gap:8px}.brand-fallback strong{font-size:30px}.brand-fallback span{font-size:13px;letter-spacing:2px}.title h1{margin:0;font-size:19px}.title p{margin:2px 0 0;color:#64748b}.meta{direction:ltr;text-align:left;font-size:7px;color:#64748b}
    .cards{display:grid;grid-template-columns:repeat(4,1fr);gap:7px;margin-bottom:8px}.card{border:1px solid #dbe1e8;border-radius:8px;padding:7px;background:#f8fafc}.label{color:#64748b;font-size:7px}.value{font-weight:800;font-size:14px;margin-top:1px}
    .legend{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:7px 0}.legend-title{font-weight:800}.legend-item{display:inline-flex;align-items:center;gap:4px}.swatch{width:12px;height:12px;border:1px solid #d1d5db;border-radius:3px}.swatch.yer{background:#f3f4f6}.swatch.sar{background:#ecfdf3}.swatch.aed{background:#faf4e8}.swatch.usd{background:#eff6ff}
    table{width:100%;border-collapse:collapse}.ops{table-layout:fixed;font-size:7.25px}.ops tr{page-break-inside:avoid;break-inside:avoid}.ops th,.ops td{border:1px solid #dbe1e8;padding:4px;vertical-align:top;text-align:right}.ops th{background:#e9eef5;font-weight:800}.ops th:nth-child(1){width:3%}.ops th:nth-child(2){width:9%}.ops th:nth-child(3){width:11%}.ops th:nth-child(4){width:10%}.ops th:nth-child(5){width:8%}.ops th:nth-child(6){width:8%}.ops th:nth-child(7){width:6%}.ops th:nth-child(8){width:9%}.ops th:nth-child(9){width:7%}.ops th:nth-child(10){width:29%}
    .currency-yer td{background:#f6f7f8}.currency-sar td{background:#f0fbf4}.currency-aed td{background:#fcf7ed}.currency-usd td{background:#f2f7fd}.currency-other td{background:#fff}
    .num{text-align:center;direction:ltr}.date,.amount,.reference{direction:ltr;text-align:left}.amount{font-weight:800;white-space:nowrap}.reference{margin-top:2px;color:#64748b;font-size:6.5px;word-break:break-all}
    .entity-cell{display:flex;align-items:center;gap:5px}.entity-logo-frame{width:28px;height:28px;flex:0 0 28px;display:flex;align-items:center;justify-content:center;border:1px solid #e5e7eb;border-radius:6px;background:#fff;padding:3px;overflow:hidden}.entity-logo-frame img{display:block;width:100%;height:100%;object-fit:contain;object-position:center;filter:none;transform:none}.entity-logo-fallback{width:26px;height:26px;display:grid;place-items:center;border-radius:6px;background:#fff;border:1px solid #dbe1e8;font-weight:800}
    .status{display:inline-block;border-radius:999px;padding:1px 4px;font-weight:800;white-space:nowrap}.status-verified{background:#dcfce7;color:#166534}.status-ready{background:#e0f2fe;color:#075985}.status-failed{background:#fee2e2;color:#991b1b}.status-other{background:#f1f5f9;color:#475569}.ai-state{margin-top:2px;color:#64748b;font-size:6.4px}
    .note-stack{display:flex;gap:3px;justify-content:center;flex-wrap:wrap}.note-badge{display:inline-block;border-radius:999px;padding:1px 4px;font-weight:800;background:#ede9fe;color:#5b21b6}.text-note{background:#e0f2fe;color:#075985}.audio-note{background:#fef3c7;color:#92400e}.no-note{color:#94a3b8}.notes-cell,.actions-cell{text-align:center}
    .pdf-action{display:block;margin:0 0 3px;border:1px solid #cbd5e1;border-radius:4px;padding:2px 3px;color:#334155;text-decoration:none;white-space:nowrap;background:#fff;font-weight:700}.pdf-action.primary{background:#0f172a;color:#fff;border-color:#0f172a}.summary{word-break:break-word}
    .footer{margin-top:7px;padding-top:6px;border-top:1px solid #dbe1e8;color:#64748b;font-size:7px;display:flex;justify-content:space-between}
  `;

  const html = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>${css}</style></head><body>
    <header><div class="brand">${brand}<div class="title"><h1>${escapeHtml(title)}</h1><p>تقرير العمليات المسجلة في سند</p></div></div><div class="meta"><div>Report ID: ${escapeHtml(request.id)}</div><div>Template: operations-v2.1</div><div>Created: ${escapeHtml(fmtDate(new Date().toISOString()))}</div></div></header>
    <div class="cards"><div class="card"><div class="label">عدد العمليات</div><div class="value">${intf.format(total)}</div></div><div class="card"><div class="label">الموثقة</div><div class="value">${intf.format(verified)}</div></div><div class="card"><div class="label">عليها ملاحظات</div><div class="value">${intf.format(withNotes)}</div></div><div class="card"><div class="label">الفترة</div><div class="value" style="font-size:10px">${escapeHtml(fmtDate(request.date_from, true))} — ${escapeHtml(fmtDate(request.date_to, true))}</div></div></div>
    <div class="legend"><span class="legend-title">تمييز العملات:</span><span class="legend-item"><span class="swatch yer"></span>YER</span><span class="legend-item"><span class="swatch sar"></span>SAR</span><span class="legend-item"><span class="swatch aed"></span>AED</span><span class="legend-item"><span class="swatch usd"></span>USD</span></div>
    <table class="ops"><thead><tr><th>#</th><th>التاريخ</th><th>الجهة</th><th>العملية</th><th>المبلغ</th><th>الحالة</th><th>الملاحظات</th><th>بواسطة</th><th>الوصول</th><th>الملخص</th></tr></thead><tbody>${rows || '<tr><td colspan="10">لا توجد عمليات.</td></tr>'}</tbody></table>
    <div class="footer"><span>تعرض الملاحظات وجود ملاحظة فقط دون كشف محتواها. روابط المستند تمر عبر صفحة العملية الآمنة.</span><span>SANAD operations report — ${escapeHtml(request.id)}</span></div>
  </body></html>`;
  return { html, metrics: { report_template_version: "operations-v2.1", operations_count: total, verified_count: verified, operations_with_notes: withNotes } };
}

async function renderPdf(html: string) {
  const form = new FormData();
  form.append("files", new Blob([html], { type: "text/html; charset=utf-8" }), "index.html");
  form.append("paperWidth", "11.69");
  form.append("paperHeight", "8.27");
  form.append("printBackground", "true");
  form.append("preferCssPageSize", "true");
  const response = await fetch(`${env("GOTENBERG_URL").replace(/\/$/, "")}/forms/chromium/convert/html`, {
    method: "POST",
    headers: { "X-Gotenberg-Token": env("GOTENBERG_TOKEN") },
    body: form,
  });
  if (!response.ok) throw new Error(`gotenberg_render_failed_${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return respond({ ok: false, error: "method_not_allowed" }, 405);
  try {
    requireInternal(req);
    const body = await req.json().catch(() => ({}));
    const reportId = typeof body?.report_request_id === "string" ? body.report_request_id : REPORT_ID;
    if (reportId !== REPORT_ID) throw new Error("test_report_not_allowed");
    const sb = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
    const { data: payload, error: payloadError } = await sb.rpc("get_report_payload_v2", { p_report_request_id: reportId });
    if (payloadError) throw payloadError;
    const base = env("PUBLIC_APP_BASE_URL", "https://app.sanadflow.com");
    const [logo, logos] = await Promise.all([
      fetchImageDataUri(`${base.replace(/\/$/, "")}/logo.png`),
      loadCanonicalReportEntityLogos(base),
    ]);
    const { html, metrics } = buildHtml(payload as Json, base, logo, logos);
    const pdf = await renderPdf(html);
    const bucket = env("SUPABASE_STORAGE_BUCKET", "operation-files");
    const path = `reports/testing/operations-v2-1/${reportId}-${Date.now()}.pdf`;
    const { error: uploadError } = await sb.storage.from(bucket).upload(path, pdf, { contentType: "application/pdf", upsert: false });
    if (uploadError) throw uploadError;
    return respond({ ok: true, report_id: reportId, bucket, path, bytes: pdf.byteLength, metrics, whatsapp_sent: false, report_request_mutated: false, logo_loaded: Boolean(logo), entity_logos_loaded: Object.values(logos).filter(Boolean).length });
  } catch (error) {
    return respond({ ok: false, error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
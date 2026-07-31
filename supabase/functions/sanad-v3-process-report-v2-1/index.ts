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

const amountFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
const integerFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const dateTimeFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Aden",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});
const dateFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Aden",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
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
  if (Number.isNaN(date.getTime())) return safeText(value);
  return (short ? dateFormatter : dateTimeFormatter).format(date);
}

function fmtAmount(amount: unknown, currency?: string | null) {
  if (amount === null || amount === undefined || amount === "") return "—";
  const numeric = Number(amount);
  const value = Number.isFinite(numeric) ? amountFormatter.format(numeric) : safeText(amount);
  return `${value} ${safeText(currency || "", "")}`.trim();
}

function compact(value?: string | null, max = 155) {
  const text = safeText(value, "—", 1200);
  return text.length > max ? `${text.slice(0, max - 1).trim()}…` : text;
}

function transactionLabel(value?: string | null) {
  const labels: Record<string, string> = {
    transfer: "تحويل",
    payment: "دفع",
    deposit: "إيداع",
    withdrawal: "سحب",
  };
  return value ? labels[value] || safeText(value) : "—";
}

function statusLabel(value?: string | null) {
  const labels: Record<string, string> = {
    verified: "موثقة",
    ready: "جاهزة",
    stored: "مخزنة",
    received: "مستلمة",
    matched: "مطابقة",
    failed: "فاشلة",
  };
  return value ? labels[value] || safeText(value) : "—";
}

function analysisLabel(value?: string | null) {
  const key = String(value || "").toLowerCase();
  const labels: Record<string, string> = {
    completed: "التحليل مكتمل",
    complete: "التحليل مكتمل",
    pending: "بانتظار التحليل",
    failed: "فشل التحليل",
    processing: "قيد التحليل",
    ready: "جاهز",
  };
  return labels[key] || (value ? safeText(value) : "—");
}

function currencyMeta(value?: string | null) {
  const code = String(value || "").toUpperCase();
  if (code === "YER") return { code: "YER", className: "currency-yer", label: "ريال يمني" };
  if (code === "SAR") return { code: "SAR", className: "currency-sar", label: "ريال سعودي" };
  if (code === "AED") return { code: "AED", className: "currency-aed", label: "درهم إماراتي" };
  if (code === "USD") return { code: "USD", className: "currency-usd", label: "دولار أمريكي" };
  return { code: code || "—", className: "currency-other", label: "عملة أخرى" };
}

function noteBadges(operation: OperationRow) {
  if (!operation.notes_count) return "";
  const badges: string[] = [];
  if (operation.has_text_note) badges.push('<span class="note-badge text-note">ملاحظة نصية</span>');
  if (operation.has_audio_note) badges.push('<span class="note-badge audio-note">ملاحظة صوتية</span>');
  if (!badges.length) badges.push(`<span class="note-badge neutral-note">${integerFormatter.format(operation.notes_count)} ملاحظة</span>`);
  return badges.join("");
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

function buildOperationCard(operation: OperationRow, index: number, appBaseUrl: string, entityLogos: Record<string, string>) {
  const entity = resolveReportFinancialEntity(operation.financial_entity);
  const entityName = entity?.nameAr || safeText(operation.financial_entity || "جهة غير محددة");
  const entityLogo = entity ? entityLogos[entity.key] : "";
  const logoAttr = imageDataAttr(entityLogo);
  const detailUrl = operation.public_token
    ? `${appBaseUrl.replace(/\/$/, "")}/v/${encodeURIComponent(operation.public_token)}`
    : null;
  const fileUrl = detailUrl ? `${detailUrl}?openFile=1&src=report_pdf` : null;
  const currency = currencyMeta(operation.currency);
  const notes = noteBadges(operation);
  const actor = operation.verified_by_name || operation.linked_by_name || "";

  const entityVisual = logoAttr
    ? `<span class="entity-logo-frame"><img src="${logoAttr}" alt="شعار ${escapeAttr(entityName)}"></span>`
    : `<span class="entity-logo-fallback">${escapeHtml(entityName.slice(0, 1))}</span>`;

  const buttons = [
    detailUrl ? `<a class="action-button primary" href="${escapeAttr(detailUrl)}">عرض التفاصيل</a>` : "",
    operation.file_available && fileUrl
      ? `<a class="action-button secondary" href="${escapeAttr(fileUrl)}">${String(operation.file_mime_type || "").includes("pdf") ? "فتح PDF" : "فتح المستند"}</a>`
      : "",
  ].filter(Boolean).join("");

  return `
    <article class="operation-card ${currency.className}">
      <div class="card-accent"></div>
      <div class="card-top">
        <div class="entity-block">
          ${entityVisual}
          <div class="entity-text">
            <div class="entity-name">${escapeHtml(entityName)}</div>
            <div class="entity-date">${escapeHtml(fmtDate(operation.transaction_datetime || operation.created_at))}</div>
          </div>
        </div>
        <div class="sequence-badge">#${integerFormatter.format(index + 1)}</div>
      </div>

      <div class="amount-panel">
        <div class="amount-value">${escapeHtml(fmtAmount(operation.amount, operation.currency))}</div>
        <span class="currency-pill ${currency.className}">${escapeHtml(currency.code)} • ${escapeHtml(currency.label)}</span>
      </div>

      <div class="chip-row">
        <span class="meta-chip strong">${escapeHtml(transactionLabel(operation.transaction_type))}</span>
        <span class="meta-chip ref-chip">المرجع: <bdi>${escapeHtml(operation.reference_number || "—")}</bdi></span>
      </div>

      <div class="status-grid">
        <div class="status-box">
          <div class="status-label">الحالة</div>
          <div class="status-value status-${escapeAttr(operation.status || "other")}">${escapeHtml(statusLabel(operation.status))}</div>
        </div>
        <div class="status-box">
          <div class="status-label">التحليل</div>
          <div class="analysis-value">${escapeHtml(analysisLabel(operation.ai_status))}</div>
        </div>
      </div>

      ${actor ? `<div class="info-row"><span class="info-label">بواسطة</span><span class="info-value">${escapeHtml(actor)}</span></div>` : ""}
      ${notes ? `<div class="info-row stacked"><span class="info-label">الملاحظات</span><div class="notes-wrap">${notes}</div></div>` : ""}

      <div class="summary-block">
        <div class="summary-label">الملخص</div>
        <p class="summary-text">${escapeHtml(compact(operation.summary))}</p>
      </div>

      <div class="actions-row">
        ${buttons || '<span class="no-actions">لا توجد روابط متاحة</span>'}
      </div>
    </article>`;
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

  const cards = operations.map((operation, index) => buildOperationCard(operation, index, appBaseUrl, entityLogos)).join("");

  const brand = imageDataAttr(logoData)
    ? `<img class="brand-logo" src="${imageDataAttr(logoData)}" alt="سند">`
    : `<div class="brand-fallback"><strong>سَند</strong><span>SANAD</span></div>`;

  const css = `
    @page{size:A4 portrait;margin:10mm 8mm}
    *{box-sizing:border-box}
    body{margin:0;direction:rtl;font-family:Arial,Tahoma,"Noto Sans Arabic",sans-serif;color:#111827;background:#ffffff;font-size:11px;line-height:1.5}
    .page{width:100%}
    header{display:flex;justify-content:space-between;align-items:flex-start;gap:14px;border-bottom:2px solid #111827;padding-bottom:10px;margin-bottom:12px}
    .brand-wrap{display:flex;align-items:flex-start;gap:10px;min-width:0}
    .brand-logo{width:108px;height:52px;object-fit:contain;object-position:right center;flex:0 0 auto}
    .brand-fallback{display:flex;flex-direction:column;line-height:1}.brand-fallback strong{font-size:28px}.brand-fallback span{font-size:12px;letter-spacing:1.6px}
    .title-wrap h1{margin:0;font-size:18px;line-height:1.2}.title-wrap p{margin:4px 0 0;color:#64748b;font-size:10px}
    .meta{direction:ltr;text-align:left;font-size:8px;color:#64748b;line-height:1.4;flex:0 0 auto}
    .summary-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-bottom:10px}
    .summary-card{border:1px solid #dbe1e8;border-radius:12px;background:#f8fafc;padding:10px 11px;min-height:68px}
    .summary-label{font-size:10px;color:#64748b;margin-bottom:5px}.summary-value{font-size:18px;font-weight:800;line-height:1.15}.summary-helper{font-size:11px;font-weight:700;line-height:1.35}
    .legend{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px}.legend-item{display:inline-flex;align-items:center;gap:6px;padding:5px 8px;border-radius:999px;border:1px solid #dbe1e8;background:#fff;font-size:10px;color:#334155}.legend-item b{font-size:10px}.legend-swatch{width:12px;height:12px;border-radius:4px;border:1px solid #cbd5e1;flex:0 0 auto}.legend-swatch.currency-yer{background:#f3f4f6}.legend-swatch.currency-sar{background:#ecfdf3}.legend-swatch.currency-aed{background:#faf4e8}.legend-swatch.currency-usd{background:#eff6ff}
    .operations-grid{display:grid;grid-template-columns:1fr;gap:10px}
    .operation-card{position:relative;border:1px solid #dbe1e8;border-radius:16px;background:#fff;padding:12px 12px 10px;overflow:hidden;break-inside:avoid;page-break-inside:avoid}
    .card-accent{position:absolute;inset-inline:0;top:0;height:6px;background:#e5e7eb}.currency-yer .card-accent{background:#9ca3af}.currency-sar .card-accent{background:#86efac}.currency-aed .card-accent{background:#e7c48b}.currency-usd .card-accent{background:#93c5fd}.currency-other .card-accent{background:#d1d5db}
    .currency-yer{background:#fafafa}.currency-sar{background:#f5fdf7}.currency-aed{background:#fffbf4}.currency-usd{background:#f8fbff}.currency-other{background:#ffffff}
    .card-top{display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-top:4px}
    .entity-block{display:flex;gap:9px;align-items:flex-start;min-width:0;flex:1 1 auto}.entity-logo-frame{width:42px;height:42px;flex:0 0 42px;display:flex;align-items:center;justify-content:center;border:1px solid #e5e7eb;border-radius:10px;background:#fff;padding:5px}.entity-logo-frame img{display:block;width:100%;height:100%;object-fit:contain;object-position:center}.entity-logo-fallback{width:42px;height:42px;flex:0 0 42px;display:grid;place-items:center;border:1px solid #dbe1e8;border-radius:10px;background:#fff;font-weight:800}
    .entity-text{min-width:0}.entity-name{font-size:14px;font-weight:800;line-height:1.3}.entity-date{font-size:10px;color:#64748b;margin-top:2px}
    .sequence-badge{display:inline-flex;align-items:center;justify-content:center;padding:4px 8px;border-radius:999px;background:#111827;color:#fff;font-size:10px;font-weight:800;flex:0 0 auto}
    .amount-panel{margin-top:10px;margin-bottom:10px;padding:10px 12px;border-radius:14px;background:#ffffff;border:1px solid #e5e7eb}.amount-value{font-size:20px;font-weight:900;line-height:1.15;margin-bottom:6px}.currency-pill{display:inline-flex;align-items:center;padding:4px 8px;border-radius:999px;font-size:10px;font-weight:800;border:1px solid #d1d5db;background:#fff}.currency-pill.currency-yer{background:#f3f4f6}.currency-pill.currency-sar{background:#ecfdf3}.currency-pill.currency-aed{background:#faf4e8}.currency-pill.currency-usd{background:#eff6ff}
    .chip-row{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px}.meta-chip{display:inline-flex;align-items:center;gap:4px;padding:5px 9px;border-radius:999px;background:#f8fafc;border:1px solid #dbe1e8;color:#334155;font-size:10px}.meta-chip.strong{background:#111827;border-color:#111827;color:#fff;font-weight:800}.ref-chip bdi{direction:ltr}
    .status-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-bottom:8px}.status-box{padding:8px 9px;border-radius:12px;background:#fff;border:1px solid #e5e7eb}.status-label{font-size:9px;color:#64748b;margin-bottom:3px}.status-value,.analysis-value{font-size:11px;font-weight:800;line-height:1.35}.status-verified{color:#166534}.status-ready{color:#075985}.status-failed{color:#991b1b}.status-other{color:#475569}
    .info-row{display:flex;align-items:flex-start;gap:10px;padding:8px 0;border-top:1px dashed #e5e7eb}.info-row.stacked{align-items:flex-start}.info-label{width:68px;flex:0 0 68px;font-size:10px;font-weight:800;color:#475569}.info-value{font-size:11px;font-weight:700;color:#111827;line-height:1.45}.notes-wrap{display:flex;flex-wrap:wrap;gap:6px}.note-badge{display:inline-flex;align-items:center;padding:4px 8px;border-radius:999px;font-size:10px;font-weight:800}.text-note{background:#e0f2fe;color:#075985}.audio-note{background:#fef3c7;color:#92400e}.neutral-note{background:#ede9fe;color:#5b21b6}
    .summary-block{padding-top:8px;border-top:1px dashed #e5e7eb;margin-top:2px}.summary-text{margin:4px 0 0;font-size:11px;line-height:1.6;color:#111827}
    .actions-row{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}.action-button{display:inline-flex;align-items:center;justify-content:center;min-height:40px;padding:9px 12px;border-radius:12px;text-decoration:none;font-size:11px;font-weight:800;border:1px solid #cbd5e1;background:#fff;color:#334155;flex:1 1 160px}.action-button.primary{background:#0f172a;border-color:#0f172a;color:#fff}.action-button.secondary{background:#fff;color:#334155}.no-actions{font-size:10px;color:#94a3b8}
    .footer{margin-top:12px;padding-top:8px;border-top:1px solid #dbe1e8;font-size:8px;color:#64748b;line-height:1.45}
  `;

  const html = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>${css}</style></head><body><div class="page">
    <header>
      <div class="brand-wrap">
        ${brand}
        <div class="title-wrap">
          <h1>${escapeHtml(title)}</h1>
          <p>نسخة محسّنة للجوال أولًا، مصممة لعرض العمليات كبطاقات واضحة وسهلة المراجعة.</p>
        </div>
      </div>
      <div class="meta">
        <div>Report ID: ${escapeHtml(request.id)}</div>
        <div>Template: operations-v2.2-mobile</div>
        <div>Created: ${escapeHtml(fmtDate(new Date().toISOString()))}</div>
      </div>
    </header>

    <section class="summary-grid">
      <div class="summary-card"><div class="summary-label">عدد العمليات</div><div class="summary-value">${integerFormatter.format(total)}</div></div>
      <div class="summary-card"><div class="summary-label">العمليات الموثقة</div><div class="summary-value">${integerFormatter.format(verified)}</div></div>
      <div class="summary-card"><div class="summary-label">عمليات عليها ملاحظات</div><div class="summary-value">${integerFormatter.format(withNotes)}</div></div>
      <div class="summary-card"><div class="summary-label">الفترة</div><div class="summary-helper">${escapeHtml(fmtDate(request.date_from, true))} — ${escapeHtml(fmtDate(request.date_to, true))}</div></div>
    </section>

    <div class="legend">
      <span class="legend-item"><span class="legend-swatch currency-yer"></span><b>YER</b><span>ريال يمني</span></span>
      <span class="legend-item"><span class="legend-swatch currency-sar"></span><b>SAR</b><span>ريال سعودي</span></span>
      <span class="legend-item"><span class="legend-swatch currency-aed"></span><b>AED</b><span>درهم إماراتي</span></span>
      <span class="legend-item"><span class="legend-swatch currency-usd"></span><b>USD</b><span>دولار أمريكي</span></span>
    </div>

    <section class="operations-grid">
      ${cards || '<article class="operation-card"><div class="summary-text">لا توجد عمليات ضمن هذا التقرير.</div></article>'}
    </section>

    <div class="footer">
      <div>تعرض الملاحظات وجود الملاحظة فقط دون كشف محتواها. روابط المستند تمر عبر صفحة العملية الآمنة. أُعدّ هذا القالب لسهولة المراجعة على الهاتف أولًا، مع الحفاظ على قابلية الطباعة.</div>
      <div>SANAD mobile-first operations report — ${escapeHtml(request.id)}</div>
    </div>
  </div></body></html>`;

  return {
    html,
    metrics: {
      report_template_version: "operations-v2.2-mobile",
      operations_count: total,
      verified_count: verified,
      operations_with_notes: withNotes,
      layout_mode: "mobile-first-cards",
    },
  };
}

async function renderPdf(html: string) {
  const form = new FormData();
  form.append("files", new Blob([html], { type: "text/html; charset=utf-8" }), "index.html");
  form.append("paperWidth", "8.27");
  form.append("paperHeight", "11.69");
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

    const supabase = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
      auth: { persistSession: false },
    });

    const { data: payload, error: payloadError } = await supabase.rpc("get_report_payload_v2", {
      p_report_request_id: reportId,
    });
    if (payloadError) throw payloadError;

    const appBaseUrl = env("PUBLIC_APP_BASE_URL", "https://app.sanadflow.com");
    const [logoData, entityLogos] = await Promise.all([
      fetchImageDataUri(`${appBaseUrl.replace(/\/$/, "")}/logo.png`),
      loadCanonicalReportEntityLogos(appBaseUrl),
    ]);

    const { html, metrics } = buildHtml(payload as Json, appBaseUrl, logoData, entityLogos);
    const pdf = await renderPdf(html);

    const bucket = env("SUPABASE_STORAGE_BUCKET", "operation-files");
    const path = `reports/testing/operations-v2-2-mobile/${reportId}-${Date.now()}.pdf`;
    const { error: uploadError } = await supabase.storage.from(bucket).upload(path, pdf, {
      contentType: "application/pdf",
      upsert: false,
    });
    if (uploadError) throw uploadError;

    return respond({
      ok: true,
      report_id: reportId,
      bucket,
      path,
      bytes: pdf.byteLength,
      metrics,
      whatsapp_sent: false,
      report_request_mutated: false,
      logo_loaded: Boolean(logoData),
      entity_logos_loaded: Object.values(entityLogos).filter(Boolean).length,
    });
  } catch (error) {
    return respond({ ok: false, error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
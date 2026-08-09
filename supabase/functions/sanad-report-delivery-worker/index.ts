import { createClient } from "npm:@supabase/supabase-js@2";

type Json = Record<string, unknown>;
type DeliveryFormat = "interactive" | "pdf" | "both";
type Operation = Record<string, unknown>;

function env(name: string, fallback?: string) {
  const value = Deno.env.get(name) || fallback;
  if (!value) throw new Error(`missing_env_${name}`);
  return value;
}
function envAny(names: string[], fallback?: string) {
  for (const name of names) {
    const value = Deno.env.get(name);
    if (value) return value;
  }
  if (fallback) return fallback;
  throw new Error(`missing_env_${names.join("_or_")}`);
}

const SUPABASE_URL = env("SUPABASE_URL").replace(/\/$/, "");
const sb = createClient(SUPABASE_URL, env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
const REPORT_URL_BASE = env("INTERACTIVE_REPORT_BASE_URL", `${SUPABASE_URL}/functions/v1/sanad-interactive-report`).replace(/\/$/, "");
const BUCKET = env("SUPABASE_STORAGE_BUCKET", "operation-files");
const APP_BASE = env("PUBLIC_APP_BASE_URL", "https://app.sanadflow.com").replace(/\/$/, "");
const WA_PHONE_ID = envAny(["WHATSAPP_PHONE_NUMBER_ID", "META_WA_PHONE_NUMBER_ID"]);
const WA_TOKEN = envAny(["WHATSAPP_ACCESS_TOKEN", "META_WA_ACCESS_TOKEN"]);
const WA_API_VERSION = envAny(["WHATSAPP_API_VERSION", "META_GRAPH_VERSION"], "v22.0");

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8" } });
}
function requireInternal(req: Request) {
  if (req.headers.get("x-sanad-internal-key") !== env("SANAD_INTERNAL_API_KEY")) throw new Error("unauthorized_internal_request");
}
function normalizePhone(value: unknown) {
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
function safeText(value: unknown, fallback = "—", max = 600) {
  const text = String(value ?? fallback).replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  return (text || fallback).slice(0, max);
}
function esc(value: unknown) {
  return safeText(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}
function fmtDate(value: unknown, short = false) {
  if (!value) return "—";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return safeText(value);
  return new Intl.DateTimeFormat("en-GB", {
    numberingSystem: "latn",
    timeZone: "Asia/Aden",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    ...(short ? {} : { hour: "2-digit", minute: "2-digit", hour12: false }),
  }).format(date);
}
function fmtOperationDateTime(value: unknown) {
  if (!value) return { date: "—", time: "—" };
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return { date: safeText(value), time: "—" };
  const dateText = new Intl.DateTimeFormat("en-GB", {
    numberingSystem: "latn",
    timeZone: "Asia/Aden",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
  const timeText = new Intl.DateTimeFormat("en-GB", {
    numberingSystem: "latn",
    timeZone: "Asia/Aden",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
  return { date: dateText, time: timeText };
}
function fmtAmountNumber(amount: unknown) {
  const number = Number(amount);
  return Number.isFinite(number)
    ? new Intl.NumberFormat("en-US", { numberingSystem: "latn", maximumFractionDigits: 2 }).format(number)
    : safeText(amount);
}
function currencyLabel(value: unknown) {
  const currency = String(value || "").trim().toUpperCase();
  if (currency === "YER") return "ريال يمني";
  if (currency === "SAR") return "ريال سعودي";
  if (currency === "USD") return "دولار أمريكي";
  return safeText(value || "—");
}
function statusLabel(value: unknown) {
  const labels: Record<string, string> = {
    verified: "موثقة",
    ready: "جاهزة",
    stored: "مخزنة",
    received: "مستلمة",
    matched: "مطابقة",
    failed: "فاشلة",
  };
  const key = String(value || "");
  return labels[key] || safeText(value);
}
function currencyClass(value: unknown) {
  const currency = String(value || "").trim().toUpperCase();
  if (currency === "YER") return "currency-yer";
  if (currency === "SAR") return "currency-sar";
  return "currency-other";
}
function operationSortValue(operation: Operation) {
  const value = Date.parse(String(operation.created_at || ""));
  return Number.isFinite(value) ? value : 0;
}
function generatedSummary(operation: Operation) {
  const entity = safeText(operation.financial_entity || "", "", 100);
  const amount = Number(operation.amount);
  const currency = currencyLabel(operation.currency);
  const beneficiary = safeText(
    operation.resolved_business_name || operation.resolved_account_holder_name || operation.raw_receiver_name || "",
    "",
    120,
  );
  if (entity && Number.isFinite(amount) && amount > 0) {
    const parts = [`عملية مالية بقيمة ${fmtAmountNumber(amount)} ${currency}`];
    if (entity && entity !== "غير معروف") parts.push(`عبر ${entity}`);
    let text = `${parts.join(" ")}.`;
    if (beneficiary) text += ` المستفيد: ${beneficiary}.`;
    return text;
  }
  return "لم يتوفر ملخص تحليلي لهذه العملية؛ راجع الإشعار الأصلي وبيانات العملية.";
}
function operationalSummary(operation: Operation) {
  const sourceSummary = safeText(operation.summary || "", "", 420);
  const base = sourceSummary || generatedSummary(operation);
  const fallback = !sourceSummary;
  const verifiedBy = safeText(operation.verified_by_name || "", "", 120);
  const status = statusLabel(operation.status);
  const stateLine = verifiedBy && String(operation.status || "") === "verified"
    ? `تم توثيقها بواسطة: ${verifiedBy}`
    : verifiedBy
      ? `الحالة: ${status} — بواسطة: ${verifiedBy}`
      : `الحالة: ${status}`;
  return { base, stateLine, fallback };
}
async function remoteImageDataUri(url: string): Promise<string | null> {
  try {
    const result = await fetch(url, { headers: { accept: "image/png,image/jpeg,image/webp,image/*" } });
    if (!result.ok) return null;
    const bytes = new Uint8Array(await result.arrayBuffer());
    let binary = "";
    for (let offset = 0; offset < bytes.length; offset += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
    }
    return `data:${result.headers.get("content-type") || "image/png"};base64,${btoa(binary)}`;
  } catch {
    return null;
  }
}

function buildOfficialPdfHtml(snapshot: any, logoDataUri: string | null) {
  const operations: Operation[] = Array.isArray(snapshot?.payload?.operations)
    ? [...snapshot.payload.operations].sort((a, b) => operationSortValue(b) - operationSortValue(a))
    : [];
  const rows = operations.map((operation, index) => {
    const transactionTiming = fmtOperationDateTime(operation.transaction_datetime);
    const intakeTiming = fmtOperationDateTime(operation.created_at);
    const summary = operationalSummary(operation);
    const reference = safeText(operation.reference_number || "—", "—", 100);
    return `<tr class="${currencyClass(operation.currency)}">
      <td class="num">${index + 1}</td>
      <td class="date-cell">
        <div class="date-block">
          <div class="date-label">وقت العملية</div>
          <div class="date-line"><strong class="latin">${esc(transactionTiming.date)}</strong><span class="time-badge latin">${esc(transactionTiming.time)}</span></div>
        </div>
        <div class="date-block intake-date">
          <div class="date-label">أضيف إلى سند</div>
          <div class="date-line"><strong class="latin">${esc(intakeTiming.date)}</strong><span class="time-badge subtle latin">${esc(intakeTiming.time)}</span></div>
        </div>
      </td>
      <td class="entity-cell">
        <div class="entity-name">${esc(operation.financial_entity || "—")}</div>
        <div class="entity-ref latin">${esc(reference)}</div>
      </td>
      <td class="amount-cell">
        <div class="amount-layout">
          <span class="currency-name">${esc(currencyLabel(operation.currency))}</span>
          <strong class="amount-number latin">${esc(fmtAmountNumber(operation.amount))}</strong>
        </div>
      </td>
      <td class="summary-cell">
        <div class="summary-main${summary.fallback ? " summary-fallback" : ""}">${esc(summary.base)}</div>
        <div class="summary-state">${esc(summary.stateLine)}</div>
      </td>
    </tr>`;
  }).join("");

  const reportId = safeText(snapshot.report_request_id || "", "");
  const period = `${fmtDate(snapshot.date_from, true)} - ${fmtDate(snapshot.date_to, true)}`;
  const createdAt = fmtDate(new Date().toISOString());
  const css = `
    @page{size:A4 portrait;margin:11mm 9mm 12mm}
    *{box-sizing:border-box}
    html,body{margin:0;padding:0}
    body{direction:rtl;font-family:"Noto Sans Arabic","Noto Sans",sans-serif;color:#172033;background:#fff;font-size:11.3px;line-height:1.58;font-variant-numeric:lining-nums tabular-nums}
    .header{display:flex;align-items:flex-start;justify-content:space-between;gap:18px;padding-bottom:8px;margin-bottom:11px}
    .brand{width:38%;display:flex;justify-content:flex-start;align-items:flex-start;min-height:76px}
    .brand img{width:148px;height:78px;object-fit:contain;object-position:right top;display:block}
    .report-title{width:58%;text-align:left;direction:rtl;padding-top:2px}
    .report-title h1{font-size:24px;line-height:1.25;margin:0 0 7px;font-weight:700;color:#111827}
    .report-meta{display:grid;gap:3px;color:#526174;font-size:11.3px}
    .report-meta span{display:block}
    .latin{direction:ltr;unicode-bidi:isolate;font-variant-numeric:lining-nums tabular-nums}
    .summary{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:0 0 11px}
    .card{border:1px solid #dbe2ea;border-radius:9px;padding:8px 9px;background:#fbfcfd;text-align:right}
    .card .label{font-size:10.5px;color:#66758a}
    .card .value{font-size:17px;font-weight:700;margin-top:2px;color:#111827;direction:ltr;unicode-bidi:isolate}
    table{width:100%;border-collapse:collapse;table-layout:fixed;border:1px solid #d7dee7}
    thead{display:table-header-group}
    tbody{display:table-row-group}
    tr{display:table-row;break-inside:avoid;page-break-inside:avoid}
    th,td{display:table-cell;border:1px solid #dce3eb;padding:8px 7px;vertical-align:top;text-align:right;overflow-wrap:anywhere}
    th{background:#edf1f5;font-weight:700;font-size:11px;color:#263244;line-height:1.35;vertical-align:middle}
    td{font-size:10.7px;color:#1f2937;background:#fff}
    th:nth-child(1){width:5%}
    th:nth-child(2){width:21%}
    th:nth-child(3){width:20%}
    th:nth-child(4){width:17%}
    th:nth-child(5){width:37%}
    .num{text-align:center;direction:ltr;font-weight:700;padding-top:10px}
    .date-block{padding:0 0 6px}
    .date-block+.date-block{border-top:1px solid rgba(100,116,139,.22);padding-top:6px}
    .date-label{font-size:8.7px;line-height:1.35;color:#7a8798;margin-bottom:3px;font-weight:700}
    .date-line{display:flex;align-items:center;justify-content:space-between;gap:5px;direction:rtl}
    .date-line strong{font-size:9.7px;white-space:nowrap;color:#1f2937}
    .time-badge{display:inline-block;border:1px solid #111827;border-radius:999px;padding:1px 6px;background:transparent;font-size:9px;line-height:1.45;white-space:nowrap}
    .time-badge.subtle{border-color:#98a2b3;color:#475467}
    .entity-name{font-weight:700;margin-bottom:4px;color:#172033}
    .entity-ref{text-align:left;font-size:9.7px;color:#667085;overflow-wrap:anywhere}
    .amount-layout{display:flex;align-items:flex-start;justify-content:space-between;gap:7px;direction:rtl;width:100%}
    .currency-name{text-align:right;font-weight:600;line-height:1.45;color:#344054}
    .amount-number{text-align:left;font-size:11.4px;font-weight:700;white-space:nowrap;color:#101828}
    .summary-main{font-size:10.6px;line-height:1.55;color:#263244}
    .summary-fallback{color:#475467;font-style:normal}
    .summary-state{margin-top:4px;padding-top:3px;border-top:1px solid rgba(100,116,139,.20);font-size:9.5px;line-height:1.45;color:#667085;font-weight:600}
    tr.currency-yer td{background:#f3faf6}
    tr.currency-sar td{background:#fff9ed}
    tr.currency-yer td:first-child{border-right:3px solid #7bb89a}
    tr.currency-sar td:first-child{border-right:3px solid #d8b56a}
    .empty{text-align:center;padding:18px;color:#64748b;background:#fff!important}
    .footer{margin-top:9px;border-top:1px solid #e2e7ed;padding-top:7px;display:flex;justify-content:space-between;gap:12px;color:#68778a;font-size:9px;line-height:1.45}
    .footer .id{direction:ltr;text-align:left;unicode-bidi:isolate}
  `;

  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>تقرير عمليات سند</title><style>${css}</style></head><body>
    <div class="header">
      <div class="brand">${logoDataUri ? `<img src="${logoDataUri}" alt="SANAD">` : ""}</div>
      <div class="report-title">
        <h1>تقرير عمليات سند</h1>
        <div class="report-meta">
          <span>الفترة: <b class="latin">${esc(period)}</b></span>
          <span>تاريخ إنشاء التقرير: <b class="latin">${esc(createdAt)}</b></span>
        </div>
      </div>
    </div>
    <div class="summary">
      <div class="card"><div class="label">عدد العمليات</div><div class="value">${Number(snapshot.operations_count || operations.length)}</div></div>
      <div class="card"><div class="label">العمليات الموثقة</div><div class="value">${Number(snapshot.verified_count || 0)}</div></div>
      <div class="card"><div class="label">عليها ملاحظات</div><div class="value">${Number(snapshot.operations_with_notes || 0)}</div></div>
    </div>
    <table><thead><tr><th>#</th><th>التاريخ والوقت</th><th>الجهة المالية</th><th>المبلغ</th><th>الملخص</th></tr></thead><tbody>${rows || `<tr><td colspan="5" class="empty">لا توجد عمليات ضمن نطاق هذا التقرير.</td></tr>`}</tbody></table>
    <div class="footer"><span>ترتيب الصفوف يعتمد على وقت إضافة العملية إلى سند، بينما يعرض العمود وقت العملية المستخرج من الإشعار ووقت الإدخال معًا.</span><span class="id">Report ID: ${esc(reportId)}</span></div>
  </body></html>`;
}

function assertPdf(pdf: Uint8Array) {
  const valid = pdf.byteLength >= 5 && pdf[0] === 0x25 && pdf[1] === 0x50 && pdf[2] === 0x44 && pdf[3] === 0x46 && pdf[4] === 0x2d;
  if (!valid) throw new Error("rendered_pdf_invalid_signature");
  if (pdf.byteLength < 5000) throw new Error(`rendered_pdf_suspiciously_small_${pdf.byteLength}`);
}
async function renderStaticPdf(html: string) {
  const form = new FormData();
  form.append("files", new Blob([html], { type: "text/html; charset=utf-8" }), "index.html");
  form.append("paperWidth", "8.27");
  form.append("paperHeight", "11.69");
  form.append("printBackground", "true");
  form.append("preferCssPageSize", "true");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  const started = Date.now();
  try {
    const result = await fetch(`${env("GOTENBERG_URL").replace(/\/$/, "")}/forms/chromium/convert/html`, {
      method: "POST",
      headers: { "X-Gotenberg-Token": env("GOTENBERG_TOKEN") },
      body: form,
      signal: controller.signal,
    });
    if (!result.ok) throw new Error(`gotenberg_static_html_failed_${result.status}_${(await result.text()).slice(0, 300)}`);
    const pdf = new Uint8Array(await result.arrayBuffer());
    assertPdf(pdf);
    return { pdf, renderMs: Date.now() - started };
  } catch (error) {
    if (controller.signal.aborted) throw new Error("gotenberg_static_html_timeout");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function whatsappUploadPdf(pdf: Uint8Array, filename: string) {
  const form = new FormData();
  const buffer = pdf.buffer.slice(pdf.byteOffset, pdf.byteOffset + pdf.byteLength) as ArrayBuffer;
  form.append("messaging_product", "whatsapp");
  form.append("type", "application/pdf");
  form.append("file", new Blob([buffer], { type: "application/pdf" }), filename);
  const result = await fetch(`https://graph.facebook.com/${WA_API_VERSION}/${WA_PHONE_ID}/media`, {
    method: "POST",
    headers: { authorization: `Bearer ${WA_TOKEN}` },
    body: form,
  });
  const body = await result.json().catch(() => ({}));
  if (!result.ok || !body?.id) throw new Error(`whatsapp_media_upload_failed_${result.status}_${JSON.stringify(body).slice(0, 300)}`);
  return String(body.id);
}
async function sendWhatsApp(payload: Json) {
  const result = await fetch(`https://graph.facebook.com/${WA_API_VERSION}/${WA_PHONE_ID}/messages`, {
    method: "POST",
    headers: { authorization: `Bearer ${WA_TOKEN}`, "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await result.json().catch(() => ({}));
  if (!result.ok) throw new Error(`whatsapp_send_failed_${result.status}_${JSON.stringify(body).slice(0, 300)}`);
  return body as Json;
}
async function sendInteractiveLink(to: string, url: string, metrics: Json) {
  return sendWhatsApp({
    messaging_product: "whatsapp",
    to,
    type: "text",
    text: {
      preview_url: true,
      body: `تم إعداد تقرير عملياتك في سند.\n\nعدد العمليات: ${Number(metrics.operations_count || 0)}\nالموثقة: ${Number(metrics.verified_count || 0)}\nعليها ملاحظات: ${Number(metrics.operations_with_notes || 0)}\n\nاضغط لاستعراض التقرير وتصفية عملياته:\n${url}\n\nالرابط خاص بك وصالح لمدة محدودة.`,
    },
  });
}
async function sendPdfDocument(to: string, mediaId: string, filename: string) {
  return sendWhatsApp({
    messaging_product: "whatsapp",
    to,
    type: "document",
    document: { id: mediaId, filename, caption: "تقرير عمليات سند بصيغة PDF" },
  });
}

async function processReport(reportId: string, dryRun: boolean) {
  const { data: request, error: requestError } = await sb.from("report_requests")
    .select("id,destination_phone,delivery_format,status,result_metrics,delivery_attempts")
    .eq("id", reportId).single();
  if (requestError || !request) throw new Error(`report_request_not_found_${requestError?.message || ""}`);

  const format = request.delivery_format as DeliveryFormat;
  if (!["interactive", "pdf", "both"].includes(format)) throw new Error("invalid_delivery_format");
  if (!dryRun) {
    await sb.from("report_requests").update({
      status: "processing",
      processing_stage: "creating_snapshot",
      processing_started_at: new Date().toISOString(),
      last_attempt_at: new Date().toISOString(),
      error_message: null,
      failed_at: null,
      delivery_error_code: null,
      delivery_error_message: null,
    }).eq("id", reportId);
  }

  const { data: artifacts, error: artifactError } = await sb.rpc("create_report_delivery_artifacts", {
    p_report_request_id: reportId,
    p_link_ttl_days: 30,
  });
  if (artifactError || !artifacts?.ok) throw new Error(`artifact_creation_failed_${artifactError?.message || JSON.stringify(artifacts)}`);

  const interactiveRequired = Boolean(artifacts.interactive_required);
  const pdfRequired = Boolean(artifacts.pdf_required);
  const publicToken = String(artifacts.access_token || "");
  const interactiveUrl = interactiveRequired && publicToken
    ? `${REPORT_URL_BASE}?token=${encodeURIComponent(publicToken)}`
    : null;
  if (interactiveRequired && !interactiveUrl) throw new Error("interactive_report_access_token_missing");

  const metrics: Json = {
    snapshot_id: artifacts.snapshot_id,
    operations_count: artifacts.operations_count,
    verified_count: artifacts.verified_count,
    operations_with_notes: artifacts.operations_with_notes,
    delivery_format: format,
    renderer: "official-portrait-operations-v5",
  };

  let pdfPath: string | null = null;
  let pdfBytes = 0;
  let pdf: Uint8Array | null = null;
  let renderMs = 0;
  const filename = `sanad-report-${safeName(reportId)}.pdf`;

  if (pdfRequired) {
    if (!dryRun) await sb.from("report_requests").update({ pdf_status: "processing", processing_stage: "rendering_pdf" }).eq("id", reportId);
    const { data: snapshot, error: snapshotError } = await sb.from("report_snapshots")
      .select("id,report_request_id,title,date_from,date_to,operations_count,verified_count,operations_with_notes,payload")
      .eq("id", String(artifacts.snapshot_id)).single();
    if (snapshotError || !snapshot) throw new Error(`report_snapshot_load_failed_${snapshotError?.message || ""}`);

    const logoDataUri = await remoteImageDataUri(`${APP_BASE}/logo.png`);
    const rendered = await renderStaticPdf(buildOfficialPdfHtml(snapshot, logoDataUri));
    pdf = rendered.pdf;
    renderMs = rendered.renderMs;
    pdfBytes = pdf.byteLength;
    pdfPath = `reports/${reportId}/${Date.now()}-operations.pdf`;
    const { error: uploadError } = await sb.storage.from(BUCKET).upload(pdfPath, pdf, { contentType: "application/pdf", upsert: false });
    if (uploadError) throw new Error(`pdf_upload_failed_${uploadError.message}`);

    metrics.pdf_bytes = pdfBytes;
    metrics.pdf_render_ms = renderMs;
    metrics.pdf_row_count = Array.isArray(snapshot?.payload?.operations) ? snapshot.payload.operations.length : 0;
    if (!dryRun) {
      await sb.from("report_requests").update({
        result_bucket: BUCKET,
        result_path: pdfPath,
        pdf_status: "ready",
        result_metrics: { ...(request.result_metrics || {}), ...metrics },
        processing_stage: "pdf_ready",
      }).eq("id", reportId);
    }
  }

  const destination = normalizePhone(request.destination_phone);
  const messageIds: string[] = [];
  if (!dryRun) {
    if (pdfRequired && pdf) {
      const mediaId = await whatsappUploadPdf(pdf, filename);
      const sent = await sendPdfDocument(destination, mediaId, filename);
      const id = String((sent.messages as Array<Json> | undefined)?.[0]?.id || "");
      if (id) messageIds.push(id);
    }
    if (interactiveUrl) {
      const sent = await sendInteractiveLink(destination, interactiveUrl, metrics);
      const id = String((sent.messages as Array<Json> | undefined)?.[0]?.id || "");
      if (id) messageIds.push(id);
    }

    const now = new Date().toISOString();
    await sb.from("report_requests").update({
      status: "sent",
      processing_stage: "completed",
      processed_at: now,
      sent_at: now,
      result_bucket: pdfPath ? BUCKET : null,
      result_path: pdfPath,
      pdf_status: pdfRequired ? "ready" : "skipped",
      interactive_status: interactiveRequired ? "ready" : "skipped",
      whatsapp_message_id: messageIds[0] || null,
      delivery_status: "accepted",
      accepted_at: now,
      last_delivery_event_at: now,
      delivery_attempts: Number(request.delivery_attempts || 0) + 1,
      result_metrics: { ...(request.result_metrics || {}), ...metrics, whatsapp_message_ids: messageIds },
      error_message: null,
      failed_at: null,
      delivery_error_code: null,
      delivery_error_message: null,
    }).eq("id", reportId);
  }

  return {
    ok: true,
    report_id: reportId,
    pdf_bytes: pdfBytes,
    pdf_path: pdfPath,
    pdf_render_ms: renderMs,
    whatsapp_sent: !dryRun,
    message_ids: messageIds,
    metrics,
  };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return response({ ok: false, error: "method_not_allowed" }, 405);
  let reportId = "";
  try {
    requireInternal(req);
    const body = await req.json().catch(() => ({}));
    reportId = String(body.report_request_id || "");
    if (!/^[0-9a-f-]{36}$/i.test(reportId)) throw new Error("invalid_report_request_id");
    return response(await processReport(reportId, body.dry_run !== false));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/^[0-9a-f-]{36}$/i.test(reportId)) {
      try {
        const { data: current } = await sb.from("report_requests").select("pdf_status").eq("id", reportId).single();
        const preservedPdfStatus = current?.pdf_status === "ready" || current?.pdf_status === "skipped" ? current.pdf_status : "failed";
        const now = new Date().toISOString();
        await sb.from("report_requests").update({
          status: "failed",
          processing_stage: "failed",
          pdf_status: preservedPdfStatus,
          delivery_status: "failed",
          error_message: message.slice(0, 1000),
          delivery_error_message: message.slice(0, 1000),
          failed_at: now,
          updated_at: now,
        }).eq("id", reportId);
      } catch {
        // Best effort only: preserve original error response.
      }
    }
    console.error(JSON.stringify({ function: "sanad-report-delivery-worker", event: "request_failed", report_id: reportId || null, error: message }));
    return response({ ok: false, error: message, report_id: reportId || null }, message === "unauthorized_internal_request" ? 401 : 500);
  }
});
// SANAD Pro Payment Verification V2
// Verifies receipt integrity, AI extraction, duplicate evidence, and WhatsApp outcomes.

type JsonRecord = Record<string, unknown>;

const SUPABASE_URL = mustEnv("SUPABASE_URL");
const SERVICE_KEY = mustEnv("SUPABASE_SERVICE_ROLE_KEY");
const GEMINI_KEY = mustEnv("GEMINI_API_KEY");
const INTERNAL_KEY = mustEnv("SANAD_INTERNAL_API_KEY");
const WA_TOKEN = Deno.env.get("META_WA_ACCESS_TOKEN") || Deno.env.get("WHATSAPP_ACCESS_TOKEN") || "";
const WA_PHONE_ID = Deno.env.get("META_WA_PHONE_NUMBER_ID") || Deno.env.get("WHATSAPP_PHONE_NUMBER_ID") || "";
const GEMINI_MODEL = Deno.env.get("GEMINI_MODEL") || "gemini-2.5-flash";
const SEND_WHATSAPP = (Deno.env.get("SEND_PRO_PAYMENT_WHATSAPP") || "true") !== "false";
const FUNCTION_NAME = "sanad-pro-payment-verify";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-sanad-internal-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function mustEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name}_missing`);
  return value;
}
function clean(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return text && text.toLowerCase() !== "null" ? text : null;
}
function digits(value: unknown): string {
  return String(value ?? "")
    .replace(/[٠-٩]/g, d => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/[۰-۹]/g, d => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)));
}
function normText(value: unknown): string {
  return digits(value).toLowerCase().replace(/[أإآا]/g, "ا").replace(/ة/g, "ه").replace(/[^a-z0-9\u0600-\u06ff]+/g, " ").trim();
}
function normRef(value: unknown): string | null {
  const text = digits(value).replace(/\s+/g, "").trim().toUpperCase();
  return text || null;
}
function normAccount(value: unknown): string | null {
  const text = digits(value).replace(/[^0-9+]/g, "");
  return text || null;
}
function normAmount(value: unknown): number | null {
  const n = Number(digits(value).replace(/,/g, "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? n : null;
}
function normCurrency(value: unknown): string | null {
  const text = normText(value).toUpperCase();
  if (!text) return null;
  if (text.includes("YER") || text.includes("يمني") || text.includes("ريال")) return "YER";
  if (text.includes("SAR") || text.includes("سعودي")) return "SAR";
  if (text.includes("USD") || text.includes("دولار")) return "USD";
  return text;
}
function includesAny(haystack: unknown, values: unknown[]): boolean {
  const h = normText(haystack);
  return values.some(v => {
    const n = normText(v);
    return Boolean(n && h.includes(n));
  });
}
function parseTransferDate(value: unknown): Date | null {
  const raw = digits(value).trim();
  if (!raw) return null;
  const direct = new Date(raw);
  if (!Number.isNaN(direct.getTime())) return direct;
  const match = raw.match(/^(\d{4})[-\/]([0-1]?\d)[-\/]([0-3]?\d)[ T]+([0-2]?\d):([0-5]\d)(?::([0-5]\d))?\s*(AM|PM)?$/i);
  if (!match) return null;
  let hour = Number(match[4]);
  const marker = match[7]?.toUpperCase();
  if (marker === "PM" && hour < 12) hour += 12;
  if (marker === "AM" && hour === 12) hour = 0;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), hour, Number(match[5]), Number(match[6] || 0));
  return Number.isNaN(date.getTime()) ? null : date;
}
function recentDate(value: unknown): boolean {
  const date = parseTransferDate(value);
  if (!date) return false;
  const age = (Date.now() - date.getTime()) / 86400000;
  return age >= -1 && age <= 10;
}
function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" } });
}
function headers(extra: HeadersInit = {}): HeadersInit {
  return { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, ...extra };
}
async function sb<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${SUPABASE_URL}${path}`, { ...init, headers: headers(init.headers || {}) });
  const text = await response.text();
  if (!response.ok) throw new Error(`supabase_${response.status}:${text.slice(0, 500)}`);
  return (text ? JSON.parse(text) : null) as T;
}
async function rpc<T>(name: string, body: JsonRecord): Promise<T> {
  return sb<T>(`/rest/v1/rpc/${name}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}
async function sha256(bytes: Uint8Array | string): Promise<string> {
  const input = typeof bytes === "string" ? new TextEncoder().encode(bytes) : bytes;
  const hash = await crypto.subtle.digest("SHA-256", input);
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, "0")).join("");
}
async function download(bucket: string, path: string): Promise<{bytes: Uint8Array; type: string}> {
  const encoded = encodeURIComponent(path).replace(/%2F/g, "/");
  const response = await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}/${encoded}`, { headers: headers() });
  if (!response.ok) throw new Error(`receipt_download_${response.status}`);
  return { bytes: new Uint8Array(await response.arrayBuffer()), type: response.headers.get("content-type") || "application/octet-stream" };
}
function base64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}
async function gemini(receipt: Uint8Array, mime: string, expected: any): Promise<any> {
  const prompt = `أنت مدقق دفع مالي لسند Pro. استخرج بيانات الإشعار بدقة وأعد JSON فقط. لا تخترع أي قيمة.\nالمتوقع: المبلغ ${expected.amount}، العملة ${expected.currency}، الجهة ${expected.financial_entity || "غير محددة"}، الحساب ${expected.account_number || "غير محدد"}، المستلم ${expected.account_holder_name || "غير محدد"}.\nأعد الحقول: is_payment_receipt, financial_entity, network, amount, currency, receiver_name, receiver_account, sender_name, sender_account, transfer_reference, transfer_datetime, raw_text, summary, confidence, notes.`;
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent?key=${encodeURIComponent(GEMINI_KEY)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }, { inline_data: { mime_type: mime, data: base64(receipt) } }] }],
      generationConfig: { temperature: 0, responseMimeType: "application/json" },
    }),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(`gemini_${response.status}`);
  const text = body?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text || "").join("\n").replace(/```json|```/gi, "").trim();
  if (!text) throw new Error("gemini_empty");
  const parsed = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] || text);
  return {
    is_payment_receipt: parsed.is_payment_receipt === true,
    financial_entity: clean(parsed.financial_entity), network: clean(parsed.network),
    amount: normAmount(parsed.amount), currency: normCurrency(parsed.currency),
    receiver_name: clean(parsed.receiver_name), receiver_account: normAccount(parsed.receiver_account),
    sender_name: clean(parsed.sender_name), sender_account: normAccount(parsed.sender_account),
    transfer_reference: normRef(parsed.transfer_reference), transfer_datetime: clean(parsed.transfer_datetime),
    raw_text: clean(parsed.raw_text), summary: clean(parsed.summary),
    confidence: Math.max(0, Math.min(1, Number(parsed.confidence || 0))), notes: clean(parsed.notes),
    model: GEMINI_MODEL,
  };
}
function reasonLabels(codes: string[]): string[] {
  const labels: Record<string,string> = {
    duplicate_receipt: "صورة الإشعار استُخدمت في طلب سابق",
    duplicate_payment_evidence: "رقم الحوالة أو بيانات الدفع مستخدمة في طلب سابق",
    receipt_hash_mismatch: "بصمة الملف المرفوع لا تطابق الملف الذي أُرسل مع الطلب",
    not_payment_receipt: "الملف لا يبدو إشعار دفع صالحًا",
    missing_transfer_reference: "رقم مرجع الحوالة غير ظاهر",
    amount_mismatch: "مبلغ الإشعار لا يطابق مبلغ الاشتراك",
    currency_mismatch: "عملة الإشعار لا تطابق عملة الاشتراك",
    receiver_account_mismatch: "رقم حساب المستلم لا يطابق الحساب المختار",
    financial_entity_mismatch: "جهة التحويل لا تطابق جهة الإيداع المختارة",
    receiver_name_unclear: "اسم المستلم غير واضح أو غير مطابق",
    missing_or_invalid_transfer_date: "تاريخ الحوالة غير واضح أو خارج المدة المقبولة",
    low_ai_confidence: "درجة وضوح الإشعار غير كافية للموافقة الآلية",
    database_approval_rejected: "تعذر إكمال التفعيل آليًا داخل النظام",
    processing_error: "حدث خطأ تقني أثناء المعالجة الآلية",
  };
  return codes.map(c => labels[c] || c);
}
function normalizePhone(value: unknown): string | null {
  let phone = digits(value).replace(/\D/g, "");
  if (phone.startsWith("00967")) phone = phone.slice(2);
  if (phone.length === 9) phone = `967${phone}`;
  return /^967\d{9}$/.test(phone) ? phone : null;
}
async function whatsapp(toRaw: unknown, body: string): Promise<void> {
  if (!SEND_WHATSAPP || !WA_TOKEN || !WA_PHONE_ID) return;
  const to = normalizePhone(toRaw);
  if (!to) throw new Error("invalid_whatsapp_phone");
  const response = await fetch(`https://graph.facebook.com/v20.0/${WA_PHONE_ID}/messages`, {
    method: "POST", headers: { Authorization: `Bearer ${WA_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to, type: "text", text: { preview_url: false, body } }),
  });
  if (!response.ok) throw new Error(`whatsapp_${response.status}`);
}
async function mark(id: string, status: string, extracted: any, checks: any, reason: string | null) {
  return rpc<any>("admin_mark_pro_payment_request_review", {
    p_payment_request_id: id, p_status: status, p_ai_extracted_json: extracted,
    p_ai_confidence: extracted?.extracted?.confidence ?? extracted?.confidence ?? null,
    p_verification_checks: checks, p_failure_reason: reason,
  });
}
async function notifyReview(payload: any, codes: string[], requestId: string, rejected = false) {
  const reasons = reasonLabels(codes);
  const title = rejected ? "❌ *تعذر اعتماد طلب سند Pro*" : "⚠️ *طلب سند Pro يحتاج مراجعة بشرية*";
  const message = `${title}\n\nلم نترك طلبك معلقًا دون توضيح. سبب التحويل للمراجعة:\n${reasons.map(r => `• ${r}`).join("\n")}\n\n*رقم الطلب:* ${requestId}\nسنراجع الإشعار، وسنبلغك فور اعتماد الدفع أو إذا احتجنا مستندًا أوضح.`;
  await whatsapp(payload.payment_request.user_phone, message);
}
async function process(id: string) {
  const payload = await rpc<any>("admin_get_pro_payment_request_payload", { p_payment_request_id: id });
  if (!payload?.ok) throw new Error("payment_request_not_found");
  const request = payload.payment_request;
  if (["approved", "auto_approved", "rejected", "cancelled"].includes(request.status)) return { ok: true, status: request.status, already_final: true };
  const receiver = payload.expected_receiver || {};
  const expected = {
    amount: Number(request.expected_amount), currency: request.expected_currency,
    financial_entity: receiver.financial_entity, account_number: receiver.account_number,
    account_holder_name: receiver.account_holder_name,
  };
  const file = await download(request.receipt_bucket, request.receipt_path);
  const serverHash = await sha256(file.bytes);
  const hashMatches = !request.receipt_sha256 || request.receipt_sha256 === serverHash;
  const extracted = await gemini(file.bytes, request.receipt_mime_type || file.type, expected);
  const rawText = `${extracted.raw_text || ""} ${extracted.summary || ""}`;
  const metadata = receiver.metadata || {};
  const entityAliases = [receiver.financial_entity, ...(Array.isArray(metadata.verification_entity_aliases) ? metadata.verification_entity_aliases : [])];
  const holderAliases = [receiver.account_holder_name, ...(Array.isArray(metadata.verification_holder_aliases) ? metadata.verification_holder_aliases : [])];
  const checks = {
    receipt_hash_matches: hashMatches,
    is_payment_receipt: extracted.is_payment_receipt,
    has_transfer_reference: Boolean(extracted.transfer_reference),
    amount_matches: Number(extracted.amount) === Number(expected.amount),
    currency_matches: extracted.currency === expected.currency,
    receiver_account_matches: Boolean(expected.account_number) && (extracted.receiver_account === String(expected.account_number) || includesAny(rawText, [expected.account_number])),
    financial_entity_matches: includesAny(`${extracted.financial_entity || ""} ${extracted.network || ""} ${rawText}`, entityAliases),
    receiver_name_reasonable: includesAny(`${extracted.receiver_name || ""} ${rawText}`, holderAliases),
    transfer_date_present_and_recent: recentDate(extracted.transfer_datetime),
    confidence_ok: extracted.confidence >= 0.85,
  };
  const reasons: string[] = [];
  if (!checks.receipt_hash_matches) reasons.push("receipt_hash_mismatch");
  if (!checks.is_payment_receipt) reasons.push("not_payment_receipt");
  if (!checks.has_transfer_reference) reasons.push("missing_transfer_reference");
  if (!checks.amount_matches) reasons.push("amount_mismatch");
  if (!checks.currency_matches) reasons.push("currency_mismatch");
  if (!checks.receiver_account_matches) reasons.push("receiver_account_mismatch");
  if (!checks.financial_entity_matches) reasons.push("financial_entity_mismatch");
  if (!checks.receiver_name_reasonable) reasons.push("receiver_name_unclear");
  if (!checks.transfer_date_present_and_recent) reasons.push("missing_or_invalid_transfer_date");
  if (!checks.confidence_ok) reasons.push("low_ai_confidence");
  const fingerprint = extracted.transfer_reference ? await sha256([extracted.transfer_reference, expected.account_number, extracted.amount, extracted.currency, extracted.transfer_datetime].join("|")) : null;
  const aiPayload = { extracted, expected, server_receipt_sha256: serverHash, validation_version: "pro-v2" };
  if (extracted.transfer_reference) {
    const evidence = await rpc<any>("admin_set_pro_payment_transfer_reference", {
      p_payment_request_id: id, p_transfer_reference: extracted.transfer_reference,
      p_ai_extracted_json: aiPayload, p_ai_confidence: extracted.confidence,
      p_payment_fingerprint: fingerprint,
    });
    if (!evidence?.ok) reasons.unshift(evidence?.reason === "duplicate_payment_evidence" ? "duplicate_payment_evidence" : String(evidence?.reason || "duplicate_payment_evidence"));
  }
  const hardReject = reasons.includes("duplicate_payment_evidence") || reasons.includes("receipt_hash_mismatch") || reasons.includes("not_payment_receipt");
  if (reasons.length) {
    const status = hardReject ? "rejected" : "pending_review";
    await mark(id, status, aiPayload, { ...checks, duplicate_checks_completed: true }, reasons.join(", "));
    await notifyReview(payload, reasons, id, hardReject).catch(() => undefined);
    return { ok: true, status, reasons, checks };
  }
  const approval = await rpc<any>("admin_approve_pro_payment_request", {
    p_payment_request_id: id, p_approval_source: "auto", p_ai_extracted_json: aiPayload,
    p_ai_confidence: extracted.confidence, p_verification_checks: { ...checks, duplicate_checks_completed: true },
    p_note: "Auto approved by SANAD Pro verification v2",
  });
  if (!approval?.ok) {
    await mark(id, "pending_review", aiPayload, { ...checks, database_approval_failed: true }, "database_approval_rejected");
    await notifyReview(payload, ["database_approval_rejected"], id).catch(() => undefined);
    return { ok: true, status: "pending_review", reason: "database_approval_rejected" };
  }
  await whatsapp(request.user_phone, `✅ *تم تفعيل سند Pro*\n\nتم التحقق من الإشعار وعدم استخدامه في طلب سابق، وتفعيل اشتراكك بنجاح.\n\n*المبلغ:* ${Number(expected.amount).toLocaleString("en-US")} ${expected.currency}\n*رقم الحوالة:* ${extracted.transfer_reference}`).catch(() => undefined);
  return { ok: true, status: "auto_approved", subscription_id: approval.subscription_id || null, checks };
}

Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
  if (req.headers.get("x-sanad-internal-key") !== INTERNAL_KEY) return json({ ok: false, error: "unauthorized" }, 401);
  let id: string | null = null;
  try {
    const body = await req.json().catch(() => ({}));
    id = clean(body.payment_request_id || body.paymentRequestId || body.id);
    if (!id) return json({ ok: false, error: "missing_payment_request_id" }, 400);
    return json(await process(id));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (id) {
      try {
        const payload = await rpc<any>("admin_get_pro_payment_request_payload", { p_payment_request_id: id });
        await mark(id, "pending_review", { error: message }, { stage: "processing_error", function: FUNCTION_NAME }, "processing_error");
        await notifyReview(payload, ["processing_error"], id).catch(() => undefined);
      } catch { /* best effort */ }
    }
    return json({ ok: false, error: "payment_verification_failed", payment_request_id: id, message }, 500);
  }
});

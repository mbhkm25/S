import { FormEvent, useEffect, useState } from 'react';
import { CalendarRange, CheckCircle2, Copy, FileText, Loader2, MessageCircle, Printer, Search, Share2, ShoppingCart, Truck } from 'lucide-react';
import {
  getBusinessErpDocumentDetail,
  getBusinessErpDocuments,
  type BusinessErpDocumentDetail,
  type BusinessErpDocumentKind,
  type BusinessErpDocumentSummary,
} from '../../lib/businessAccountingApi';

type Props = { businessId: string };

function fmt(value: unknown) {
  const number = Number(value || 0);
  return new Intl.NumberFormat('ar-YE-u-nu-latn', { maximumFractionDigits: 2 }).format(number);
}

function dateLabel(value?: string | null) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return new Intl.DateTimeFormat('ar-YE-u-nu-latn', { year: 'numeric', month: 'short', day: 'numeric' }).format(d);
}

function currencyLabel(doc: { arabic_code?: string | null; english_code?: string | null; currency_name?: string | null }) {
  return doc.arabic_code || doc.english_code || doc.currency_name || '';
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function documentKindLabel(kind: BusinessErpDocumentKind): string {
  return kind === 'sale' ? 'فاتورة بيع' : 'فاتورة شراء';
}

function buildDocumentSummary(detail: BusinessErpDocumentDetail, kind: BusinessErpDocumentKind): string {
  if (!detail.header) return '';
  const sourceLineTotal = detail.lines.reduce((sum, line) => sum + Number(line.source_total_amount || 0), 0);
  const currency = currencyLabel(detail.header) || 'عملة المصدر';
  const lines = [
    `${documentKindLabel(kind)} — سند`,
    `الطرف: ${detail.header.party_name || '—'}`,
    `رقم المستند: ${detail.header.document_number || detail.header.document_id || '—'}`,
    `التاريخ: ${dateLabel(detail.header.document_date)}`,
    `العملة: ${currency}`,
    `عدد البنود: ${detail.lines.length}`,
    `مجموع قيم البنود من المصدر: ${fmt(sourceLineTotal)} ${currency}`,
  ];
  if (detail.header.payment_method) lines.push(`طريقة الدفع: ${detail.header.payment_method}`);
  if (detail.header.notes) lines.push(`ملاحظات: ${detail.header.notes}`);
  lines.push('', 'المصدر: قراءة من النسخة السحابية لنظام إبداع عبر سند. مجموع البنود ليس استنتاجًا لصافي الفاتورة.');
  return lines.join('\n');
}

function buildPrintableDocumentHtml(detail: BusinessErpDocumentDetail, kind: BusinessErpDocumentKind): string {
  const header = detail.header;
  if (!header) return '';
  const currency = currencyLabel(header) || 'عملة المصدر';
  const sourceLineTotal = detail.lines.reduce((sum, line) => sum + Number(line.source_total_amount || 0), 0);
  const rows = detail.lines.map((line, index) => `
    <tr>
      <td>${index + 1}</td>
      <td>${escapeHtml(line.class_name || line.class_number || line.class_id || '—')}</td>
      <td>${escapeHtml(line.unit_name || '—')}</td>
      <td class="num">${escapeHtml(line.quantity || '—')}</td>
      <td class="num">${escapeHtml(line.unit_price || '—')}</td>
      <td class="num">${escapeHtml(line.line_discount || '—')}</td>
      <td class="num strong">${escapeHtml(line.source_total_amount || '—')}</td>
    </tr>`).join('');

  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(`${documentKindLabel(kind)} - ${header.document_number || header.document_id}`)}</title>
<style>
  @page { size:A4; margin:12mm; }
  * { box-sizing:border-box; }
  body { margin:0; color:#0f172a; font-family:"IBM Plex Sans Arabic",Tahoma,Arial,sans-serif; font-size:11px; direction:rtl; }
  .brand { display:flex; justify-content:space-between; align-items:flex-start; border-bottom:2px solid #0f172a; padding-bottom:10px; margin-bottom:14px; }
  .brand h1 { margin:0; font-size:20px; }
  .muted { color:#64748b; font-size:9px; }
  .meta { display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:12px; }
  .card { border:1px solid #e2e8f0; border-radius:10px; padding:9px 11px; }
  .label { color:#64748b; font-size:9px; margin-bottom:4px; }
  .value { font-weight:700; }
  table { width:100%; border-collapse:collapse; margin-top:10px; }
  th { background:#f1f5f9; color:#475569; padding:7px 6px; border:1px solid #e2e8f0; font-size:9px; text-align:right; }
  td { padding:7px 6px; border:1px solid #e2e8f0; vertical-align:top; }
  .num { direction:ltr; text-align:left; white-space:nowrap; }
  .strong { font-weight:800; }
  .total { margin-top:10px; display:flex; justify-content:flex-end; }
  .total-box { min-width:230px; border:1px solid #cbd5e1; border-radius:10px; padding:10px 12px; }
  .footer { margin-top:14px; padding-top:8px; border-top:1px solid #e2e8f0; color:#64748b; font-size:8px; line-height:1.8; }
  tr { break-inside:avoid; }
</style>
</head>
<body>
  <div class="brand">
    <div><h1>سند | SANAD</h1><div class="muted">${escapeHtml(documentKindLabel(kind))} — قراءة من إبداع</div></div>
    <div style="text-align:left"><strong>#${escapeHtml(header.document_number || header.document_id || '—')}</strong><br><span class="muted">${escapeHtml(dateLabel(header.document_date))}</span></div>
  </div>
  <div class="meta">
    <div class="card"><div class="label">الطرف</div><div class="value">${escapeHtml(header.party_name || '—')}</div></div>
    <div class="card"><div class="label">العملة</div><div class="value">${escapeHtml(currency)}</div></div>
    <div class="card"><div class="label">طريقة الدفع</div><div class="value">${escapeHtml(header.payment_method || '—')}</div></div>
    <div class="card"><div class="label">رقم القيد</div><div class="value">${escapeHtml(header.entry_id || '—')}</div></div>
  </div>
  ${header.notes ? `<div class="card"><div class="label">ملاحظات</div><div class="value">${escapeHtml(header.notes)}</div></div>` : ''}
  <table>
    <thead><tr><th>#</th><th>الصنف</th><th>الوحدة</th><th>الكمية</th><th>سعر الوحدة</th><th>الخصم</th><th>إجمالي المصدر</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="7">لا توجد بنود.</td></tr>'}</tbody>
  </table>
  <div class="total"><div class="total-box"><div class="label">مجموع قيم البنود من المصدر</div><div class="value">${escapeHtml(fmt(sourceLineTotal))} ${escapeHtml(currency)}</div></div></div>
  <div class="footer">
    هذه الوثيقة للقراءة والمشاركة فقط، ومبنية على النسخة السحابية المكتملة المتاحة من نظام إبداع. لا يغيّر سند بيانات إبداع. مجموع قيم البنود هو جمع حقل TotalAmount من المصدر، ولا يمثل بالضرورة صافي الفاتورة بعد الخصومات أو الخدمات أو أي معالجات أخرى ما لم ينص المصدر على ذلك صراحة.
  </div>
  <script>window.addEventListener('load',()=>setTimeout(()=>window.print(),250));</script>
</body>
</html>`;
}

function initialDocumentKind(): BusinessErpDocumentKind {
  return new URLSearchParams(window.location.search).get('document_kind') === 'purchase' ? 'purchase' : 'sale';
}

export default function BusinessErpDocuments({ businessId }: Props) {
  const [kind, setKind] = useState<BusinessErpDocumentKind>(() => initialDocumentKind());
  const [query, setQuery] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [items, setItems] = useState<BusinessErpDocumentSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [selected, setSelected] = useState<BusinessErpDocumentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  const load = async (event?: FormEvent) => {
    event?.preventDefault();
    setLoading(true);
    setError(null);
    setSelected(null);
    try {
      const result = await getBusinessErpDocuments(businessId, kind, {
        query: query.trim(),
        fromDate: fromDate || null,
        toDate: toDate || null,
        limit: 50,
        offset: 0,
      });
      setItems(result.items);
      setTotal(result.total);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'تعذر تحميل المستندات.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [kind, businessId]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const documentId = Number(params.get('document_id') || 0);
    const requestedKind = params.get('document_kind') === 'purchase' ? 'purchase' : 'sale';
    if (!Number.isInteger(documentId) || documentId <= 0) return;

    let alive = true;
    setKind(requestedKind);
    setDetailLoading(true);
    setError(null);
    void getBusinessErpDocumentDetail(businessId, requestedKind, documentId)
      .then((detail) => {
        if (alive) setSelected(detail);
      })
      .catch((caught) => {
        if (alive) setError(caught instanceof Error ? caught.message : 'تعذر فتح المستند المطلوب.');
      })
      .finally(() => {
        if (alive) setDetailLoading(false);
      });
    return () => { alive = false; };
  }, [businessId]);

  const copyDocumentSummary = async () => {
    if (!selected?.header) return;
    try {
      await navigator.clipboard.writeText(buildDocumentSummary(selected, kind));
      setActionNotice('تم نسخ ملخص المستند.');
    } catch {
      setActionNotice('تعذر النسخ تلقائيًا. استخدم المشاركة أو الطباعة.');
    }
  };

  const shareDocument = async () => {
    if (!selected?.header) return;
    const text = buildDocumentSummary(selected, kind);
    try {
      if (navigator.share) {
        await navigator.share({
          title: `${documentKindLabel(kind)} #${selected.header.document_number || selected.header.document_id || ''}`,
          text,
        });
        setActionNotice('تم فتح خيارات المشاركة.');
        return;
      }
      await navigator.clipboard.writeText(text);
      setActionNotice('المشاركة المباشرة غير متاحة؛ تم نسخ الملخص بدلًا منها.');
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === 'AbortError') return;
      setActionNotice('تعذر فتح المشاركة. يمكنك استخدام واتساب أو نسخ الملخص.');
    }
  };

  const shareDocumentWhatsApp = () => {
    if (!selected?.header) return;
    window.open(`https://wa.me/?text=${encodeURIComponent(buildDocumentSummary(selected, kind))}`, '_blank', 'noopener,noreferrer');
  };

  const printDocument = () => {
    if (!selected?.header) return;
    const popup = window.open('', '_blank', 'width=1100,height=850');
    if (!popup) {
      setActionNotice('المتصفح منع نافذة الطباعة. اسمح بالنوافذ المنبثقة ثم أعد المحاولة.');
      return;
    }
    popup.document.open();
    popup.document.write(buildPrintableDocumentHtml(selected, kind));
    popup.document.close();
    setActionNotice('تم تجهيز نسخة الطباعة. اختر «حفظ كملف PDF» عند الحاجة.');
  };

  const openDocument = async (item: BusinessErpDocumentSummary) => {
    setDetailLoading(true);
    setError(null);
    try {
      setSelected(await getBusinessErpDocumentDetail(businessId, kind, item.document_id));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'تعذر تحميل تفاصيل المستند.');
    } finally {
      setDetailLoading(false);
    }
  };

  return (
    <section className="overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white shadow-sm" dir="rtl">
      <div className="p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-violet-50 text-violet-700">
            <FileText className="h-5 w-5" />
          </span>
          <div>
            <span className="text-[10px] font-bold text-violet-700">مستندات إبداع</span>
            <h3 className="mt-0.5 text-sm font-black text-slate-950">المبيعات والمشتريات</h3>
            <p className="mt-1 text-[10px] leading-5 text-slate-500">عرض منظم من النسخة السحابية مع تفاصيل البنود والمصدر المحاسبي، دون تعديل إبداع.</p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <button type="button" onClick={() => setKind('sale')} className={`rounded-2xl px-3 py-3 text-xs font-bold ${kind==='sale'?'bg-slate-950 text-white':'bg-slate-100 text-slate-600'}`}><ShoppingCart className="mx-auto mb-1 h-4 w-4" />المبيعات</button>
          <button type="button" onClick={() => setKind('purchase')} className={`rounded-2xl px-3 py-3 text-xs font-bold ${kind==='purchase'?'bg-slate-950 text-white':'bg-slate-100 text-slate-600'}`}><Truck className="mx-auto mb-1 h-4 w-4" />المشتريات</button>
        </div>

        <form onSubmit={load} className="mt-3 space-y-2">
          <div className="relative">
            <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input value={query} onChange={e=>setQuery(e.target.value)} placeholder="اسم الطرف أو رقم المستند أو البيان" className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pr-10 pl-3 text-xs outline-none" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="rounded-2xl border border-slate-200 p-3"><span className="mb-1 flex items-center gap-1 text-[9px] text-slate-400"><CalendarRange className="h-3 w-3" />من</span><input type="date" value={fromDate} onChange={e=>setFromDate(e.target.value)} className="w-full text-[10px] outline-none" /></label>
            <label className="rounded-2xl border border-slate-200 p-3"><span className="mb-1 flex items-center gap-1 text-[9px] text-slate-400"><CalendarRange className="h-3 w-3" />إلى</span><input type="date" value={toDate} onChange={e=>setToDate(e.target.value)} className="w-full text-[10px] outline-none" /></label>
          </div>
          <button className="w-full rounded-2xl bg-slate-950 py-3 text-xs font-bold text-white">تطبيق البحث</button>
        </form>

        {error && <div className="mt-3 rounded-2xl bg-rose-50 p-3 text-[10px] text-rose-700">{error}</div>}

        <div className="mt-4 flex items-center justify-between text-[9px] text-slate-400"><span>{total} مستند</span><span>إجمالي البنود هو مجموع TotalAmount من المصدر وليس استنتاجًا لصافي الفاتورة</span></div>

        {loading ? <div className="flex min-h-28 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div> : (
          <div className="mt-2 space-y-2">
            {items.map(item=>(
              <button key={item.document_id} type="button" onClick={()=>void openDocument(item)} className="w-full rounded-2xl border border-slate-100 bg-slate-50 p-3 text-right">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <strong className="block truncate text-xs text-slate-900">{item.party_name || 'بدون اسم طرف'}</strong>
                    <span className="mt-1 block text-[9px] text-slate-500">#{item.document_number || item.document_id} · {dateLabel(item.document_date)} · {item.line_count} بند</span>
                  </div>
                  <div className="shrink-0 text-left"><strong className="block text-xs text-slate-900">{fmt(item.source_line_total)}</strong><span className="text-[8px] text-slate-400">{currencyLabel(item)}</span></div>
                </div>
              </button>
            ))}
          </div>
        )}

        {detailLoading && <div className="mt-4 flex items-center justify-center gap-2 text-xs text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />تحميل التفاصيل…</div>}

        {selected?.status==='ok' && selected.header && (
          <div className="mt-5 space-y-3">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="إجراءات المستند">
              <button type="button" onClick={printDocument} className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-slate-950 px-3 text-[10px] font-bold text-white"><Printer className="h-4 w-4" />PDF / طباعة</button>
              <button type="button" onClick={() => void shareDocument()} className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-[10px] font-bold text-slate-700"><Share2 className="h-4 w-4" />مشاركة</button>
              <button type="button" onClick={shareDocumentWhatsApp} className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-emerald-100 bg-emerald-50 px-3 text-[10px] font-bold text-emerald-800"><MessageCircle className="h-4 w-4" />واتساب</button>
              <button type="button" onClick={() => void copyDocumentSummary()} className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 text-[10px] font-bold text-slate-700"><Copy className="h-4 w-4" />نسخ ملخص</button>
            </div>

            {actionNotice && (
              <button type="button" onClick={() => setActionNotice(null)} className="flex w-full items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2.5 text-right text-[10px] leading-5 text-emerald-800">
                <CheckCircle2 className="h-4 w-4 shrink-0" /> {actionNotice}
              </button>
            )}

            <div className="rounded-2xl border border-slate-200 p-3">
            <div className="flex items-start justify-between">
              <div><p className="text-[9px] text-slate-400">المستند</p><strong className="text-xs">{selected.header.party_name || '—'} · #{selected.header.document_number || selected.header.document_id}</strong></div>
              <span className="text-[9px] text-slate-500">{dateLabel(selected.header.document_date)}</span>
            </div>
            <div className="mt-3 overflow-x-auto">
              <table className="min-w-[620px] w-full text-[9px]">
                <thead className="bg-slate-50 text-slate-500"><tr><th className="p-2 text-right">الصنف</th><th className="p-2">الوحدة</th><th className="p-2">الكمية</th><th className="p-2">سعر الوحدة</th><th className="p-2">الإجمالي المصدر</th></tr></thead>
                <tbody>{selected.lines.map(line=><tr key={line.line_id} className="border-t border-slate-100"><td className="p-2">{line.class_name || line.class_number || line.class_id || '—'}</td><td className="p-2 text-center">{line.unit_name || '—'}</td><td className="p-2 text-center">{line.quantity || '—'}</td><td className="p-2 text-center">{line.unit_price || '—'}</td><td className="p-2 text-center font-bold">{line.source_total_amount || '—'}</td></tr>)}</tbody>
              </table>
            </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

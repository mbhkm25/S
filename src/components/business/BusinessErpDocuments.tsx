import { FormEvent, useEffect, useState } from 'react';
import { CalendarRange, FileText, Loader2, Search, ShoppingCart, Truck } from 'lucide-react';
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

export default function BusinessErpDocuments({ businessId }: Props) {
  const [kind, setKind] = useState<BusinessErpDocumentKind>('sale');
  const [query, setQuery] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [items, setItems] = useState<BusinessErpDocumentSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [selected, setSelected] = useState<BusinessErpDocumentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
          <div className="mt-5 rounded-2xl border border-slate-200 p-3">
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
        )}
      </div>
    </section>
  );
}

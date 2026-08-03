import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, FileText, Loader2, MessageSquareText, Music2, Search, ShieldCheck } from 'lucide-react';

type ReportOperation = {
  id?: string | null;
  public_token?: string | null;
  financial_entity?: string | null;
  transaction_datetime?: string | null;
  created_at?: string | null;
  amount?: number | string | null;
  currency?: string | null;
  transaction_type?: string | null;
  reference_number?: string | null;
  status?: string | null;
  ai_status?: string | null;
  summary?: string | null;
  notes_count?: number | null;
  has_text_note?: boolean | null;
  has_audio_note?: boolean | null;
  verified_by_name?: string | null;
  linked_by_name?: string | null;
  file_available?: boolean | null;
  file_mime_type?: string | null;
};

type ReportPayload = {
  ok: boolean;
  error?: string;
  title?: string | null;
  date_from?: string | null;
  date_to?: string | null;
  operations_count?: number;
  verified_count?: number;
  operations_with_notes?: number;
  expires_at?: string | null;
  payload?: {
    operations?: ReportOperation[];
    request?: Record<string, unknown>;
  };
};

type Filter = 'all' | 'YER' | 'SAR' | 'AED' | 'USD' | 'verified' | 'notes';

const API_BASE = (import.meta.env.VITE_PUBLIC_API_BASE_URL || 'https://api.sanadflow.com').replace(/\/$/, '');
const APP_BASE = (import.meta.env.VITE_PUBLIC_APP_BASE_URL || 'https://app.sanadflow.com').replace(/\/$/, '');
const numberFormatter = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
const dateFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Aden', year: 'numeric', month: '2-digit', day: '2-digit',
});
const dateTimeFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Aden', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
});

const entityLogos: Record<string, string> = {
  'العمقي موبايل': 'alamqi-mobile.webp',
  'العمقي': 'alamqi-mobile.webp',
  'البسيري موبايل': 'albasiri-mobile.webp',
  'بي كاش': 'bcash.webp',
  'الكريمي حاسب': 'alkuraimi-hasib.webp',
  'الكريمي سعودي': 'alkuraimi-saudi.webp',
  'الكريمي يمني': 'alkuraimi-yemeni.webp',
  'بن دول صرافة': 'bindawol-exchange.webp',
  'بن دول باي': 'bindawol-pay.webp',
  'القطيبي': 'alqutaibi.webp',
};

function getToken() {
  return window.location.pathname.match(/\/reports\/view\/([^/?#]+)/)?.[1] || '';
}
function formatDate(value?: string | null, withTime = false) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return (withTime ? dateTimeFormatter : dateFormatter).format(date);
}
function transactionType(value?: string | null) {
  return ({ transfer: 'تحويل', payment: 'دفع', deposit: 'إيداع', withdrawal: 'سحب' } as Record<string, string>)[String(value)] || value || 'عملية';
}
function statusLabel(value?: string | null) {
  return ({ verified: 'موثقة', ready: 'جاهزة', stored: 'مخزنة', received: 'مستلمة', matched: 'مطابقة', failed: 'فاشلة' } as Record<string, string>)[String(value)] || value || '—';
}
function analysisLabel(value?: string | null) {
  return ({ completed: 'مكتمل', complete: 'مكتمل', processing: 'قيد التحليل', running: 'قيد التحليل', pending: 'بانتظار التحليل', failed: 'فشل' } as Record<string, string>)[String(value).toLowerCase()] || value || '—';
}
function currencyTone(currency?: string | null) {
  const key = String(currency || '').toUpperCase();
  return key === 'SAR' ? 'border-t-emerald-400 bg-gradient-to-b from-emerald-50/80 to-white'
    : key === 'AED' ? 'border-t-amber-400 bg-gradient-to-b from-amber-50/80 to-white'
    : key === 'USD' ? 'border-t-blue-400 bg-gradient-to-b from-blue-50/80 to-white'
    : 'border-t-slate-400 bg-gradient-to-b from-slate-50 to-white';
}
function entityLogo(entity?: string | null) {
  const name = String(entity || '');
  const exact = entityLogos[name];
  const fuzzy = Object.entries(entityLogos).find(([key]) => name.includes(key) || key.includes(name))?.[1];
  return exact || fuzzy || null;
}

export default function PublicInteractiveReport() {
  const token = useMemo(getToken, []);
  const [data, setData] = useState<ReportPayload | null>(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!token || token.length < 32) {
      setError('رابط التقرير غير صالح.');
      return;
    }
    const controller = new AbortController();
    void fetch(`${API_BASE}/functions/v1/sanad-interactive-report-data?token=${encodeURIComponent(token)}`, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      signal: controller.signal,
    }).then(async response => {
      const result = await response.json().catch(() => null) as ReportPayload | null;
      if (!response.ok || !result?.ok) throw new Error(result?.error || 'report_unavailable');
      setData(result);
    }).catch(err => {
      if (err?.name === 'AbortError') return;
      setError(err instanceof Error && err.message === 'expired' ? 'انتهت صلاحية رابط التقرير.' : 'تعذر فتح التقرير الآن.');
    });
    return () => controller.abort();
  }, [token]);

  const operations = data?.payload?.operations || [];
  const visibleOperations = useMemo(() => operations.filter(operation => {
    const currency = String(operation.currency || '').toUpperCase();
    const matchesFilter = filter === 'all'
      || currency === filter
      || (filter === 'verified' && operation.status === 'verified')
      || (filter === 'notes' && Number(operation.notes_count || 0) > 0);
    if (!matchesFilter) return false;
    const needle = query.trim().toLowerCase();
    if (!needle) return true;
    return [operation.financial_entity, operation.reference_number, operation.amount, operation.currency, operation.summary]
      .some(value => String(value || '').toLowerCase().includes(needle));
  }), [operations, filter, query]);

  if (error) return <ReportState icon={<AlertTriangle className="h-7 w-7" />} title={error} body="تحقق من أحدث رسالة أرسلها سند أو أعد طلب التقرير من التطبيق." />;
  if (!data) return <ReportState icon={<Loader2 className="h-7 w-7 animate-spin" />} title="جارٍ تجهيز التقرير" body="يتم الآن تحميل البيانات والشعارات بأمان." />;

  return (
    <div dir="rtl" className="min-h-screen bg-slate-100 text-slate-950 print:bg-white">
      <main className="mx-auto min-h-screen w-full max-w-3xl bg-white shadow-xl print:max-w-none print:shadow-none">
        <header className="report-header sticky top-0 z-30 border-b border-slate-200 bg-white/95 px-4 py-4 backdrop-blur-xl print:static print:px-0 print:pb-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <img src={`${APP_BASE}/logo.png`} alt="سند" className="h-14 w-20 shrink-0 object-contain object-center print:h-16 print:w-24" />
              <div className="min-w-0">
                <div className="mb-1 flex items-center gap-1.5 text-[10px] font-bold text-emerald-700">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  تقرير صادر من سند
                </div>
                <h1 className="truncate text-xl font-black">{data.title || 'تقرير عمليات سند'}</h1>
                <p className="mt-1 text-xs text-slate-500">ملخص العمليات المسجلة والموثقة في سند</p>
              </div>
            </div>
            <div dir="ltr" className="shrink-0 text-left text-[10px] leading-5 text-slate-500">
              <span>{formatDate(data.date_from)}</span>
              <span className="mx-1">—</span>
              <span>{formatDate(data.date_to)}</span>
            </div>
          </div>
        </header>

        <section className="grid grid-cols-3 gap-2 px-3 py-3 print:px-0">
          <Metric value={data.operations_count ?? operations.length} label="عملية" />
          <Metric value={data.verified_count ?? 0} label="موثقة" />
          <Metric value={data.operations_with_notes ?? 0} label="عليها ملاحظة" />
        </section>

        <section className="report-controls sticky top-[87px] z-20 border-y border-slate-100 bg-white px-3 py-3 print:hidden">
          <div className="relative mb-2">
            <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input value={query} onChange={event => setQuery(event.target.value)} placeholder="ابحث بالمرجع أو الجهة أو المبلغ" className="h-11 w-full rounded-2xl border border-slate-200 bg-slate-50 pr-10 pl-3 text-xs font-medium outline-none focus:border-slate-400" />
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {([
              ['all', 'الكل'], ['YER', 'YER'], ['SAR', 'SAR'], ['AED', 'AED'], ['USD', 'USD'], ['verified', 'الموثقة'], ['notes', 'عليها ملاحظات'],
            ] as Array<[Filter, string]>).map(([value, label]) => (
              <button key={value} type="button" onClick={() => setFilter(value)} className={`shrink-0 rounded-full border px-3 py-2 text-[11px] font-bold transition ${filter === value ? 'border-slate-950 bg-slate-950 text-white' : 'border-slate-200 bg-white text-slate-700'}`}>{label}</button>
            ))}
          </div>
        </section>

        <div className="px-4 py-2 text-[10px] text-slate-500 print:px-0">{visibleOperations.length} عمليات</div>
        <section className="space-y-3 px-3 pb-8 print:px-0">
          {visibleOperations.map((operation, index) => <OperationCard key={operation.id || index} operation={operation} index={index} />)}
        </section>
        <footer className="border-t border-slate-100 px-4 py-5 text-center text-[10px] text-slate-400 print:px-0">
          رابط خاص بالتقرير، صالح حتى {formatDate(data.expires_at)}
        </footer>
      </main>
    </div>
  );
}

function Metric({ value, label }: { value: number; label: string }) {
  return <div className="rounded-2xl border border-slate-200 bg-slate-50 px-2 py-3 text-center"><strong className="text-xl font-black">{value}</strong><span className="mr-1 text-xs text-slate-500">{label}</span></div>;
}

function OperationCard({ operation, index }: { operation: ReportOperation; index: number }) {
  const logo = entityLogo(operation.financial_entity);
  const detailUrl = operation.public_token ? `${APP_BASE}/v/${encodeURIComponent(operation.public_token)}` : null;
  const fileUrl = detailUrl ? `${detailUrl}?openFile=1&src=interactive_report` : null;
  return (
    <article className={`break-inside-avoid overflow-hidden rounded-[22px] border border-slate-200 border-t-4 p-4 shadow-sm print:rounded-xl print:shadow-none ${currencyTone(operation.currency)}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid h-14 w-16 shrink-0 place-items-center rounded-xl border border-slate-200 bg-white p-1.5">
            {logo ? <img src={`${APP_BASE}/assets/financial-entities/${logo}`} alt={`شعار ${operation.financial_entity || ''}`} className="h-full w-full object-contain object-center" /> : <span className="text-lg font-black text-slate-400">{String(operation.financial_entity || 'س').slice(0, 1)}</span>}
          </div>
          <div className="min-w-0">
            <h2 className="truncate text-base font-black">{operation.financial_entity || 'جهة غير محددة'}</h2>
            <time dir="ltr" className="mt-1 block text-[10px] text-slate-500">{formatDate(operation.transaction_datetime || operation.created_at, true)}</time>
          </div>
        </div>
        <span className="rounded-full bg-slate-950 px-3 py-2 text-xs font-black text-white">#{index + 1}</span>
      </div>

      <div className="mt-4 flex items-end justify-between gap-3">
        <div>
          <strong dir="ltr" className="block text-2xl font-black tracking-tight">{numberFormatter.format(Number(operation.amount || 0))} {operation.currency || ''}</strong>
        </div>
        <span className="rounded-full bg-slate-950 px-3 py-1.5 text-[10px] font-bold text-white">{transactionType(operation.transaction_type)}</span>
      </div>
      <div className="mt-2 text-xs text-slate-600">المرجع: <bdi className="font-mono font-bold">{operation.reference_number || '—'}</bdi></div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <State label="الحالة" value={statusLabel(operation.status)} />
        <State label="التحليل" value={analysisLabel(operation.ai_status)} />
      </div>

      {(operation.has_text_note || operation.has_audio_note || operation.verified_by_name || operation.linked_by_name) ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-[10px]">
          {operation.has_text_note ? <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-2.5 py-1.5 font-bold text-sky-800"><MessageSquareText className="h-3.5 w-3.5" />ملاحظة نصية</span> : null}
          {operation.has_audio_note ? <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1.5 font-bold text-amber-800"><Music2 className="h-3.5 w-3.5" />ملاحظة صوتية</span> : null}
          {(operation.verified_by_name || operation.linked_by_name) ? <span className="text-slate-500">بواسطة: {operation.verified_by_name || operation.linked_by_name}</span> : null}
        </div>
      ) : null}

      <div className="mt-4 border-t border-dashed border-slate-200 pt-3">
        <span className="text-[10px] text-slate-500">الملخص</span>
        <p className="mt-1 line-clamp-3 text-xs leading-6 text-slate-800">{operation.summary || '—'}</p>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 print:hidden">
        {detailUrl ? <a href={detailUrl} className="grid min-h-11 place-items-center rounded-xl bg-slate-950 px-3 text-xs font-black text-white">عرض التفاصيل</a> : <span />}
        {operation.file_available && fileUrl ? <a href={fileUrl} className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-3 text-xs font-black text-slate-800"><FileText className="h-4 w-4" />{String(operation.file_mime_type || '').includes('pdf') ? 'فتح PDF' : 'فتح المستند'}</a> : <span />}
      </div>
    </article>
  );
}

function State({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-slate-200 bg-white px-3 py-2.5"><span className="block text-[9px] text-slate-500">{label}</span><strong className="mt-1 block text-xs">{value}</strong></div>;
}

function ReportState({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return <div dir="rtl" className="grid min-h-screen place-items-center bg-slate-100 px-5"><section className="w-full max-w-md rounded-3xl border border-white bg-white p-7 text-center shadow-xl"><div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-slate-100 text-slate-700">{icon}</div><h1 className="mt-4 text-xl font-black">{title}</h1><p className="mt-2 text-sm leading-7 text-slate-500">{body}</p></section></div>;
}

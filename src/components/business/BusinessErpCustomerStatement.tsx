import { FormEvent, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CalendarRange,
  ChevronLeft,
  FileText,
  Loader2,
  Search,
  UserRound,
} from 'lucide-react';
import {
  getBusinessErpCustomerStatement,
  searchBusinessErpCustomers,
  type BusinessErpCustomerCandidate,
  type BusinessErpCustomerStatement,
} from '../../lib/businessAccountingApi';

type Props = { businessId: string };

function money(value: number | null | undefined) {
  return new Intl.NumberFormat('ar-YE-u-nu-latn', { maximumFractionDigits: 2 }).format(Number(value || 0));
}

function dateLabel(value?: string | null) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return new Intl.DateTimeFormat('ar-YE-u-nu-latn', { year: 'numeric', month: 'short', day: 'numeric' }).format(d);
}

function currencyLabel(row: { arabic_code?: string | null; english_code?: string | null; currency_name?: string | null }) {
  return row.arabic_code || row.english_code || row.currency_name || 'عملة';
}

export default function BusinessErpCustomerStatement({ businessId }: Props) {
  const [query, setQuery] = useState('');
  const [candidates, setCandidates] = useState<BusinessErpCustomerCandidate[]>([]);
  const [selected, setSelected] = useState<BusinessErpCustomerCandidate | null>(null);
  const [statement, setStatement] = useState<BusinessErpCustomerStatement | null>(null);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [loadingStatement, setLoadingStatement] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ambiguity = useMemo(
    () => selected && selected.resolution_status !== 'resolved_unique_sale_account',
    [selected]
  );

  const runSearch = async (event?: FormEvent) => {
    event?.preventDefault();
    setLoadingSearch(true);
    setError(null);
    setSelected(null);
    setStatement(null);
    try {
      const result = await searchBusinessErpCustomers(businessId, query.trim(), 50);
      setCandidates(result.items);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'تعذر البحث في العملاء.');
    } finally {
      setLoadingSearch(false);
    }
  };

  const loadStatement = async (candidate: BusinessErpCustomerCandidate) => {
    setSelected(candidate);
    setCandidates([]);
    setLoadingStatement(true);
    setError(null);
    try {
      const result = await getBusinessErpCustomerStatement(
        businessId,
        candidate.account_id,
        fromDate || null,
        toDate || null
      );
      setStatement(result);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'تعذر تحميل كشف الحساب.');
    } finally {
      setLoadingStatement(false);
    }
  };

  return (
    <section className="overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white shadow-sm" dir="rtl">
      <div className="p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
            <FileText className="h-5 w-5" />
          </span>
          <div>
            <span className="text-[10px] font-bold text-emerald-700">قراءة محاسبية موثقة</span>
            <h3 className="mt-0.5 text-sm font-black text-slate-950">كشف حساب العميل</h3>
            <p className="mt-1 text-[10px] leading-5 text-slate-500">
              يبحث سند في النسخة السحابية لإبداع ويعرض الحركة من القيود الأصلية، مع فصل العملات وعدم تخمين الهوية عند وجود أكثر من حساب.
            </p>
          </div>
        </div>

        <form onSubmit={runSearch} className="mt-4 flex gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="اسم العميل أو رقم الحساب أو الجوال"
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pr-10 pl-3 text-xs outline-none focus:border-slate-400"
            />
          </div>
          <button type="submit" disabled={loadingSearch} className="rounded-2xl bg-slate-950 px-4 text-xs font-bold text-white disabled:opacity-50">
            {loadingSearch ? <Loader2 className="h-4 w-4 animate-spin" /> : 'بحث'}
          </button>
        </form>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <label className="rounded-2xl border border-slate-200 bg-white p-3">
            <span className="mb-1 flex items-center gap-1 text-[9px] font-bold text-slate-400"><CalendarRange className="h-3.5 w-3.5" />من تاريخ</span>
            <input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} className="w-full bg-transparent text-[10px] font-bold outline-none" />
          </label>
          <label className="rounded-2xl border border-slate-200 bg-white p-3">
            <span className="mb-1 flex items-center gap-1 text-[9px] font-bold text-slate-400"><CalendarRange className="h-3.5 w-3.5" />إلى تاريخ</span>
            <input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} className="w-full bg-transparent text-[10px] font-bold outline-none" />
          </label>
        </div>

        {error && <div className="mt-4 rounded-2xl border border-rose-100 bg-rose-50 p-3 text-[10px] leading-5 text-rose-700">{error}</div>}

        {candidates.length > 0 && (
          <div className="mt-4 space-y-2">
            {candidates.map((candidate) => (
              <button
                key={`${candidate.account_id}-${candidate.customer_name}`}
                type="button"
                onClick={() => void loadStatement(candidate)}
                className="flex w-full items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-3 text-right"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-slate-700"><UserRound className="h-4 w-4" /></span>
                <span className="min-w-0 flex-1">
                  <strong className="block truncate text-xs text-slate-900">{candidate.customer_name}</strong>
                  <span className="mt-1 block truncate text-[9px] text-slate-500">
                    حساب {candidate.account_number || candidate.account_id} · {candidate.sale_count} فاتورة
                  </span>
                </span>
                {candidate.account_count > 1 && <span className="rounded-full bg-amber-100 px-2 py-1 text-[8px] font-bold text-amber-800">أكثر من حساب</span>}
                <ChevronLeft className="h-4 w-4 text-slate-300" />
              </button>
            ))}
          </div>
        )}

        {loadingStatement && <div className="mt-6 flex min-h-32 items-center justify-center gap-2 text-xs text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />جارٍ بناء كشف الحساب…</div>}

        {selected && ambiguity && (
          <div className="mt-4 flex items-start gap-2 rounded-2xl border border-amber-100 bg-amber-50 p-3 text-[10px] leading-5 text-amber-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>اسم العميل ظهر على أكثر من حساب في إبداع. يعرض سند الحساب الذي اخترته فقط ولا يدمج الحسابات تلقائيًا.</span>
          </div>
        )}

        {statement && !loadingStatement && statement.status === 'ok' && (
          <div className="mt-5 space-y-4">
            <section className="rounded-2xl bg-slate-950 p-4 text-white">
              <p className="text-[9px] font-bold text-white/50">العميل</p>
              <h4 className="mt-1 text-sm font-black">{statement.identity?.customer_name || selected?.customer_name || statement.account?.account_name || 'حساب عميل'}</h4>
              <p className="mt-1 text-[9px] text-white/60">
                حساب {statement.account?.account_number || statement.account?.account_id}
                {statement.identity?.customer_number ? ` · عميل ${statement.identity.customer_number}` : ''}
              </p>
            </section>

            <div className="grid gap-2 sm:grid-cols-2">
              {(statement.totals_by_currency || []).map((total) => (
                <div key={total.currency_id ?? currencyLabel(total)} className="rounded-2xl border border-slate-100 bg-slate-50 p-3">
                  <div className="flex items-center justify-between">
                    <strong className="text-[10px] text-slate-900">{currencyLabel(total)}</strong>
                    <span className="text-[8px] text-slate-400">الرصيد الختامي</span>
                  </div>
                  <p className="mt-2 text-lg font-black text-slate-950">{money(total.closing_balance)}</p>
                  <div className="mt-3 grid grid-cols-3 gap-1 text-center">
                    <div><span className="block text-[8px] text-slate-400">افتتاحي</span><strong className="text-[9px]">{money(total.opening_balance)}</strong></div>
                    <div><span className="block text-[8px] text-slate-400">مدين</span><strong className="text-[9px]">{money(total.debit)}</strong></div>
                    <div><span className="block text-[8px] text-slate-400">دائن</span><strong className="text-[9px]">{money(total.credit)}</strong></div>
                  </div>
                </div>
              ))}
            </div>

            <div className="overflow-x-auto rounded-2xl border border-slate-100">
              <table className="min-w-[760px] w-full border-collapse text-[9px]">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="p-2 text-right">التاريخ</th>
                    <th className="p-2 text-right">المستند</th>
                    <th className="p-2 text-right">البيان</th>
                    <th className="p-2 text-right">العملة</th>
                    <th className="p-2 text-left">مدين</th>
                    <th className="p-2 text-left">دائن</th>
                    <th className="p-2 text-left">الرصيد</th>
                  </tr>
                </thead>
                <tbody>
                  {statement.items.map((item) => (
                    <tr key={item.detail_id} className="border-t border-slate-100">
                      <td className="p-2 whitespace-nowrap">{dateLabel(item.date)}</td>
                      <td className="p-2">
                        <strong className="block text-slate-800">{item.doc_type || 'قيد'}</strong>
                        <span className="text-slate-400">{item.doc_number || item.entry_number || '—'}</span>
                      </td>
                      <td className="max-w-[240px] p-2 text-slate-600">{item.description || '—'}</td>
                      <td className="p-2">{currencyLabel(item)}</td>
                      <td className="p-2 text-left font-bold">{item.debit ? money(item.debit) : '—'}</td>
                      <td className="p-2 text-left font-bold">{item.credit ? money(item.credit) : '—'}</td>
                      <td className="p-2 text-left font-black">{money(item.running_balance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="text-[9px] leading-5 text-slate-400">
              الرصيد محسوب لكل عملة على حدة من قيود إبداع الأصلية. الإشارة السالبة في المصدر فُسرت كمدين والموجبة كدائن وفق الاختبار التجميعي الحي قبل إنشاء هذا العرض.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

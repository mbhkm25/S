import { FormEvent, useEffect, useMemo, useState } from 'react';
import { formatSanadSourceAmount } from '../../utils/sanadSourceDisplay';
import {
  AlertTriangle,
  CalendarRange,
  CheckCircle2,
  ChevronLeft,
  Copy,
  FileText,
  Loader2,
  MessageCircle,
  Printer,
  Search,
  Share2,
  UserRound,
} from 'lucide-react';
import {
  getBusinessErpCustomerStatement,
  searchBusinessErpCustomers,
  type BusinessErpCustomerCandidate,
  type BusinessErpCustomerStatement,
} from '../../lib/businessAccountingApi';

type Props = { businessId: string };

function money(value: number | string | null | undefined) {
  // Match the assistant source formatter: unavailable is NOT zero and never
  // round fractional digits already supplied by the live ERP read contract.
  return formatSanadSourceAmount(value).text;
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

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function customerName(statement: BusinessErpCustomerStatement, selected: BusinessErpCustomerCandidate | null): string {
  return statement.identity?.customer_name || selected?.customer_name || statement.account?.account_name || 'حساب عميل';
}

function statementPeriod(statement: BusinessErpCustomerStatement): string {
  if (!statement.from_date && !statement.to_date) return 'كل الحركة المتاحة';
  return `${statement.from_date ? dateLabel(statement.from_date) : 'البداية'} — ${statement.to_date ? dateLabel(statement.to_date) : 'اليوم'}`;
}

function buildStatementSummary(statement: BusinessErpCustomerStatement, selected: BusinessErpCustomerCandidate | null): string {
  const lines = [
    'كشف حساب عميل — سند',
    `العميل: ${customerName(statement, selected)}`,
    `الحساب: ${statement.account?.account_number || statement.account?.account_id || '—'}`,
    `الفترة: ${statementPeriod(statement)}`,
  ];

  if (statement.identity?.mobile) lines.push(`الجوال: ${statement.identity.mobile}`);
  lines.push('');

  for (const total of statement.totals_by_currency || []) {
    const currency = currencyLabel(total);
    lines.push(
      `${currency}: افتتاحي ${money(total.opening_balance)} | مدين ${money(total.debit)} | دائن ${money(total.credit)} | الرصيد ${money(total.closing_balance)}`
    );
  }

  lines.push('', `عدد الحركات: ${statement.items.length}`, 'المصدر: قراءة من النسخة السحابية لنظام إبداع عبر سند. العملات معروضة كلٌ على حدة.');
  return lines.join('\n');
}

function buildPrintableStatementHtml(statement: BusinessErpCustomerStatement, selected: BusinessErpCustomerCandidate | null): string {
  const totals = (statement.totals_by_currency || []).map((total) => `
    <tr>
      <td>${escapeHtml(currencyLabel(total))}</td>
      <td>${escapeHtml(money(total.opening_balance))}</td>
      <td>${escapeHtml(money(total.debit))}</td>
      <td>${escapeHtml(money(total.credit))}</td>
      <td><strong>${escapeHtml(money(total.closing_balance))}</strong></td>
    </tr>`).join('');

  const rows = statement.items.map((item) => `
    <tr>
      <td>${escapeHtml(dateLabel(item.date))}</td>
      <td>
        <strong>${escapeHtml(item.doc_type || 'قيد')}</strong>
        <small>${escapeHtml(item.doc_number || item.entry_number || '—')}</small>
      </td>
      <td>${escapeHtml(item.description || '—')}</td>
      <td>${escapeHtml(currencyLabel(item))}</td>
      <td class="num">${escapeHtml(item.debit ? money(item.debit) : '—')}</td>
      <td class="num">${escapeHtml(item.credit ? money(item.credit) : '—')}</td>
      <td class="num strong">${escapeHtml(money(item.running_balance))}</td>
    </tr>`).join('');

  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(`كشف حساب - ${customerName(statement, selected)}`)}</title>
<style>
  @page { size: A4; margin: 12mm; }
  * { box-sizing: border-box; }
  body { margin: 0; color: #0f172a; font-family: "IBM Plex Sans Arabic", Tahoma, Arial, sans-serif; font-size: 11px; direction: rtl; }
  .page { width: 100%; }
  .brand { display:flex; align-items:center; justify-content:space-between; border-bottom:2px solid #0f172a; padding-bottom:10px; margin-bottom:14px; }
  .brand h1 { margin:0; font-size:20px; }
  .brand span { color:#64748b; font-size:10px; }
  .identity { display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:12px; }
  .card { border:1px solid #e2e8f0; border-radius:10px; padding:9px 11px; }
  .label { color:#64748b; font-size:9px; margin-bottom:4px; }
  .value { font-weight:700; font-size:11px; }
  table { width:100%; border-collapse:collapse; }
  th { background:#f1f5f9; color:#475569; font-size:9px; text-align:right; padding:7px 6px; border:1px solid #e2e8f0; }
  td { padding:7px 6px; border:1px solid #e2e8f0; vertical-align:top; }
  td small { display:block; color:#94a3b8; margin-top:2px; }
  .num { text-align:left; direction:ltr; white-space:nowrap; }
  .strong { font-weight:800; }
  .summary { margin:12px 0; }
  .summary h2, .movement h2 { font-size:12px; margin:0 0 7px; }
  .movement { margin-top:14px; }
  .footer { margin-top:12px; padding-top:8px; border-top:1px solid #e2e8f0; color:#64748b; line-height:1.8; font-size:8px; }
  @media print { .no-print { display:none !important; } tr { break-inside:avoid; } }
</style>
</head>
<body>
<div class="page">
  <div class="brand">
    <div><h1>سند | SANAD</h1><span>كشف حساب عميل</span></div>
    <div style="text-align:left"><strong>${escapeHtml(customerName(statement, selected))}</strong><br><span>${escapeHtml(statementPeriod(statement))}</span></div>
  </div>

  <div class="identity">
    <div class="card"><div class="label">العميل</div><div class="value">${escapeHtml(customerName(statement, selected))}</div></div>
    <div class="card"><div class="label">رقم الحساب</div><div class="value">${escapeHtml(statement.account?.account_number || statement.account?.account_id || '—')}</div></div>
    <div class="card"><div class="label">رقم العميل</div><div class="value">${escapeHtml(statement.identity?.customer_number || '—')}</div></div>
    <div class="card"><div class="label">الجوال</div><div class="value">${escapeHtml(statement.identity?.mobile || statement.identity?.work_phone || '—')}</div></div>
  </div>

  <section class="summary">
    <h2>ملخص الأرصدة</h2>
    <table>
      <thead><tr><th>العملة</th><th>افتتاحي</th><th>مدين</th><th>دائن</th><th>الرصيد الختامي</th></tr></thead>
      <tbody>${totals || '<tr><td colspan="5">لا توجد أرصدة للفترة المحددة.</td></tr>'}</tbody>
    </table>
  </section>

  <section class="movement">
    <h2>حركة الحساب</h2>
    <table>
      <thead><tr><th>التاريخ</th><th>المستند</th><th>البيان</th><th>العملة</th><th>مدين</th><th>دائن</th><th>الرصيد</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="7">لا توجد حركة للفترة المحددة.</td></tr>'}</tbody>
    </table>
  </section>

  <div class="footer">
    هذا الكشف للقراءة والتوثيق، ومبني على آخر نسخة سحابية مكتملة من بيانات نظام إبداع المتاحة لسند. لا يغيّر سند بيانات إبداع. يتم عرض كل عملة بصورة مستقلة دون دمج أو تحويل ضمني.
  </div>
</div>
<script>window.addEventListener('load',()=>setTimeout(()=>window.print(),250));</script>
</body>
</html>`;
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
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  const ambiguity = useMemo(
    () => selected && selected.resolution_status !== 'resolved_unique_sale_account',
    [selected]
  );

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const accountId = Number(params.get('account_id') || 0);
    if (!Number.isInteger(accountId) || accountId <= 0) return;

    const name = params.get('customer_name')?.trim() || 'حساب عميل';
    let alive = true;
    setLoadingStatement(true);
    setError(null);
    setQuery(name);

    void getBusinessErpCustomerStatement(businessId, accountId, null, null)
      .then((result) => {
        if (!alive) return;
        setSelected({
          customer_name: result.identity?.customer_name || name,
          account_id: accountId,
          sale_count: Number(result.identity?.sale_count || 0),
          account_count: 1,
          account_name: result.account?.account_name || null,
          account_number: result.account?.account_number || null,
          customer_number: result.identity?.customer_number || null,
          mobile: result.identity?.mobile || null,
          work_phone: result.identity?.work_phone || null,
          address: result.identity?.address || null,
          resolution_status: 'resolved_unique_sale_account',
        });
        setStatement(result);
        setCandidates([]);
      })
      .catch((caught) => {
        if (alive) setError(caught instanceof Error ? caught.message : 'تعذر فتح كشف الحساب المطلوب.');
      })
      .finally(() => {
        if (alive) setLoadingStatement(false);
      });

    return () => { alive = false; };
  }, [businessId]);

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

  const copySummary = async () => {
    if (!statement) return;
    try {
      await navigator.clipboard.writeText(buildStatementSummary(statement, selected));
      setActionNotice('تم نسخ ملخص كشف الحساب.');
    } catch {
      setActionNotice('تعذر النسخ تلقائيًا. استخدم المشاركة أو الطباعة.');
    }
  };

  const shareStatement = async () => {
    if (!statement) return;
    const text = buildStatementSummary(statement, selected);
    try {
      if (navigator.share) {
        await navigator.share({ title: `كشف حساب — ${customerName(statement, selected)}`, text });
        setActionNotice('تم فتح خيارات المشاركة.');
        return;
      }
      await navigator.clipboard.writeText(text);
      setActionNotice('المشاركة المباشرة غير متاحة هنا؛ تم نسخ الملخص بدلًا منها.');
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === 'AbortError') return;
      setActionNotice('تعذر فتح المشاركة. يمكنك استخدام واتساب أو نسخ الملخص.');
    }
  };

  const shareWhatsApp = () => {
    if (!statement) return;
    const text = encodeURIComponent(buildStatementSummary(statement, selected));
    window.open(`https://wa.me/?text=${text}`, '_blank', 'noopener,noreferrer');
  };

  const printStatement = () => {
    if (!statement) return;
    const popup = window.open('', '_blank', 'width=1100,height=850');
    if (!popup) {
      setActionNotice('المتصفح منع نافذة الطباعة. اسمح بالنوافذ المنبثقة ثم أعد المحاولة.');
      return;
    }
    popup.document.open();
    popup.document.write(buildPrintableStatementHtml(statement, selected));
    popup.document.close();
    setActionNotice('تم تجهيز نسخة الطباعة. اختر «حفظ كملف PDF» من نافذة الطباعة عند الحاجة.');
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
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="إجراءات كشف الحساب">
              <button type="button" onClick={printStatement} className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-slate-950 px-3 text-[10px] font-bold text-white"><Printer className="h-4 w-4" />PDF / طباعة</button>
              <button type="button" onClick={() => void shareStatement()} className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-[10px] font-bold text-slate-700"><Share2 className="h-4 w-4" />مشاركة</button>
              <button type="button" onClick={shareWhatsApp} className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-emerald-100 bg-emerald-50 px-3 text-[10px] font-bold text-emerald-800"><MessageCircle className="h-4 w-4" />واتساب</button>
              <button type="button" onClick={() => void copySummary()} className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 text-[10px] font-bold text-slate-700"><Copy className="h-4 w-4" />نسخ ملخص</button>
            </div>

            {actionNotice && (
              <button type="button" onClick={() => setActionNotice(null)} className="flex w-full items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2.5 text-right text-[10px] leading-5 text-emerald-800">
                <CheckCircle2 className="h-4 w-4 shrink-0" /> {actionNotice}
              </button>
            )}

            <section className="rounded-2xl bg-slate-950 p-4 text-white">
              <p className="text-[9px] font-bold text-white/50">العميل</p>
              <h4 className="mt-1 text-sm font-black">{statement.identity?.customer_name || selected?.customer_name || statement.account?.account_name || 'حساب عميل'}</h4>
              <p className="mt-1 text-[9px] text-white/60">
                حساب {statement.account?.account_number || statement.account?.account_id}
                {statement.identity?.customer_number ? ` · عميل ${statement.identity.customer_number}` : ''}
              </p>
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[9px] text-white/55">
                <span>الفترة: {statementPeriod(statement)}</span>
                {statement.identity?.mobile ? <span>الجوال: {statement.identity.mobile}</span> : null}
                {statement.identity?.address ? <span>العنوان: {statement.identity.address}</span> : null}
              </div>
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

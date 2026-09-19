import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  CalendarClock,
  CircleDollarSign,
  CreditCard,
  FileText,
  Landmark,
  PiggyBank,
  ReceiptText,
  Target,
  UsersRound,
  WalletCards,
} from 'lucide-react';
import {
  getPersonalFinanceOverview,
  type PersonalFinanceOverviewData,
} from './api/financialApi';

type FinanceDashboard = {
  cashflow_by_currency?: Array<{ currency?: string; income?: number; expense?: number; net?: number }>;
  accounts?: number;
  open_obligations?: Array<{ currency?: string; payable?: number; receivable?: number }>;
  due_soon_count?: number;
  active_budgets?: number;
  active_goals?: number;
};

function basePath(): string {
  const value = import.meta.env.VITE_APP_BASE_PATH || '/';
  return value.endsWith('/') ? value : `${value}/`;
}

function go(path: string) {
  window.location.assign(`${basePath()}${path}`);
}

function formatAmount(value: unknown, currency?: string): string {
  const amount = Number(value || 0);
  const formatted = new Intl.NumberFormat('ar-YE-u-nu-latn', { maximumFractionDigits: 2 }).format(amount);
  if (!currency) return formatted;
  if (currency === 'YER') return `${formatted} ر.ي`;
  if (currency === 'SAR') return `${formatted} ر.س`;
  if (currency === 'USD') return `${formatted} $`;
  return `${formatted} ${currency}`;
}

function formatDate(value?: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('ar-YE-u-nu-latn', { dateStyle: 'medium' }).format(date);
}

function SectionHeader({ eyebrow, title, action }: { eyebrow: string; title: string; action?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3 px-1">
      <div>
        <p className="text-[10px] font-bold text-emerald-700">{eyebrow}</p>
        <h2 className="mt-1 text-base font-black text-slate-950">{title}</h2>
      </div>
      {action}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-center text-[10px] leading-5 text-slate-500">{text}</div>;
}

export default function PersonalFinanceOverview({ dashboard }: { dashboard: FinanceDashboard }) {
  const [overview, setOverview] = useState<PersonalFinanceOverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    void getPersonalFinanceOverview()
      .then((result) => {
        if (!active) return;
        if (result.error) throw new Error(result.error.message || 'تعذر تحميل تفاصيل الموقف المالي.');
        setOverview(result.data);
        setError('');
      })
      .catch((cause) => {
        if (active) setError(cause instanceof Error ? cause.message : 'تعذر تحميل تفاصيل الموقف المالي.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  const balancesByCurrency = useMemo(() => {
    const map = new Map<string, number>();
    for (const account of overview?.balances || []) {
      if (account.system_role || account.status !== 'active') continue;
      const currency = account.currency || '—';
      map.set(currency, (map.get(currency) || 0) + Number(account.balance || 0));
    }
    return [...map.entries()].map(([currency, balance]) => ({ currency, balance }));
  }, [overview]);

  const obligations = overview?.obligations || [];
  const recentTransactions = overview?.recent_transactions || [];
  const budgets = overview?.budgets || [];
  const goals = overview?.goals || [];
  const parties = overview?.parties || [];

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-[1.9rem] bg-[radial-gradient(circle_at_top_right,_rgba(16,185,129,0.22),_transparent_38%),linear-gradient(135deg,#07111f_0%,#0f172a_55%,#13241f_100%)] p-5 text-white shadow-[0_22px_55px_rgba(15,23,42,0.18)] lg:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-bold text-emerald-200">موقفي المالي الآن</p>
            <h2 className="mt-1 text-xl font-black">صورة مالية شخصية موحدة</h2>
            <p className="mt-2 max-w-2xl text-[11px] leading-6 text-slate-300">السيولة والحركة والالتزامات والخطط المالية في مساحة واحدة، مع إبقاء كل عملة مستقلة دون تحويل ضمني.</p>
          </div>
          <button type="button" onClick={() => go('financial/actions')} className="inline-flex items-center gap-2 rounded-2xl bg-white px-4 py-2.5 text-[11px] font-black text-slate-950 shadow-sm">
            <CircleDollarSign className="h-4 w-4" /> إجراء مالي جديد
          </button>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {(dashboard.cashflow_by_currency || []).map((row) => (
            <div key={row.currency || 'currency'} className="rounded-2xl border border-white/10 bg-white/8 p-4 backdrop-blur">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-bold text-slate-300">{row.currency}</span>
                <WalletCards className="h-4 w-4 text-emerald-200" />
              </div>
              <p className="mt-3 text-2xl font-black">{formatAmount(row.net, row.currency)}</p>
              <div className="mt-3 grid grid-cols-2 gap-2 text-[9px] text-slate-300">
                <span>دخل <strong className="block text-white">{formatAmount(row.income, row.currency)}</strong></span>
                <span>مصروف <strong className="block text-white">{formatAmount(row.expense, row.currency)}</strong></span>
              </div>
            </div>
          ))}
          {(dashboard.cashflow_by_currency || []).length === 0 && balancesByCurrency.map((row) => (
            <div key={row.currency} className="rounded-2xl border border-white/10 bg-white/8 p-4 backdrop-blur">
              <span className="text-[10px] font-bold text-slate-300">{row.currency}</span>
              <p className="mt-3 text-2xl font-black">{formatAmount(row.balance, row.currency)}</p>
              <p className="mt-2 text-[9px] text-slate-400">رصيد الحسابات الشخصية النشطة</p>
            </div>
          ))}
        </div>
      </section>

      <section>
        <SectionHeader eyebrow="الوصول السريع" title="أدوات المحاسب الشخصي" />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
          {([
            ['الحسابات', `${dashboard.accounts || 0} حساب`, CreditCard, 'financial/accounts'],
            ['العمليات', 'الدخل والمصروف والتحويلات', ReceiptText, 'financial/transactions'],
            ['الالتزامات', `${obligations.length} مفتوح`, Landmark, 'financial/obligations'],
            ['الميزانيات', `${dashboard.active_budgets || 0} نشطة`, PiggyBank, 'financial/budgets'],
            ['الأهداف', `${dashboard.active_goals || 0} نشط`, Target, 'financial/goals'],
            ['الأطراف', `${parties.length} طرف`, UsersRound, 'financial/parties'],
            ['التقارير', 'تحليل ومشاركة', FileText, 'reports'],
          ] as const).map(([title, subtitle, Icon, path]) => (
            <button key={String(title)} type="button" onClick={() => go(String(path))} className="min-h-[112px] rounded-[1.4rem] border border-slate-200 bg-white p-4 text-right shadow-[0_8px_24px_rgba(15,23,42,0.04)] transition active:scale-[.985]">
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700"><Icon className="h-4.5 w-4.5" /></span>
              <strong className="mt-3 block text-xs font-black text-slate-950">{title}</strong>
              <span className="mt-1 block text-[9px] leading-4 text-slate-500">{subtitle}</span>
            </button>
          ))}
        </div>
      </section>

      {loading ? <div className="rounded-[1.5rem] bg-white p-6 text-center text-xs text-slate-500">جاري تحميل تفاصيل المحاسب الشخصي...</div> : null}
      {error ? <div className="rounded-[1.5rem] border border-rose-100 bg-rose-50 p-4 text-xs leading-6 text-rose-700">{error}</div> : null}

      {!loading && !error ? (
        <>
          <section>
            <SectionHeader eyebrow="حساباتي" title="الأرصدة حسب الحساب" action={<button type="button" onClick={() => go('financial/accounts')} className="text-[10px] font-bold text-emerald-700">عرض الحسابات</button>} />
            {(overview?.balances || []).filter((account) => !account.system_role && account.status === 'active').length ? (
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {(overview?.balances || []).filter((account) => !account.system_role && account.status === 'active').map((account) => (
                  <div key={account.id} className="rounded-[1.45rem] border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-xs font-black text-slate-950">{account.name}</p>
                        <p className="mt-1 text-[9px] text-slate-400">{account.account_type === 'asset' ? 'أصل / محفظة' : account.account_type === 'liability' ? 'التزام' : account.account_type}</p>
                      </div>
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[9px] font-bold text-slate-600">{account.currency}</span>
                    </div>
                    <p className="mt-4 text-xl font-black text-slate-950">{formatAmount(account.balance, account.currency)}</p>
                  </div>
                ))}
              </div>
            ) : <EmptyState text="لا توجد حسابات شخصية بعد. أنشئ حسابًا مثل النقد أو العمقي أو الكريمي ليبدأ سند في بناء موقفك المالي." />}
          </section>

          <div className="grid gap-5 xl:grid-cols-2">
            <section>
              <SectionHeader eyebrow="آخر الحركة" title="العمليات المالية الأخيرة" action={<button type="button" onClick={() => go('financial/transactions')} className="text-[10px] font-bold text-emerald-700">عرض العمليات</button>} />
              <div className="overflow-hidden rounded-[1.5rem] border border-slate-200 bg-white shadow-sm">
                {recentTransactions.length ? recentTransactions.map((item, index) => (
                  <div key={item.id} className={`flex items-center gap-3 p-4 ${index ? 'border-t border-slate-100' : ''}`}>
                    <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${item.transaction_type === 'income' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                      <ReceiptText className="h-4.5 w-4.5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[11px] font-black text-slate-900">{item.description || (item.transaction_type === 'income' ? 'دخل' : 'مصروف')}</p>
                      <p className="mt-1 text-[9px] text-slate-400">{formatDate(item.transaction_at)}{item.party_name ? ` · ${item.party_name}` : ''}</p>
                    </div>
                    <div className="text-left">
                      <p className={`text-xs font-black ${item.transaction_type === 'income' ? 'text-emerald-700' : 'text-slate-900'}`}>{formatAmount(item.amount, item.currency)}</p>
                      <span className="text-[8px] text-slate-400">{item.status}</span>
                    </div>
                  </div>
                )) : <EmptyState text="لم تُسجل عمليات شخصية بعد." />}
              </div>
            </section>

            <section>
              <SectionHeader eyebrow="لي / عليّ" title="الالتزامات المفتوحة" action={<span className="flex items-center gap-1 text-[9px] font-bold text-amber-700"><CalendarClock className="h-3.5 w-3.5" /> {dashboard.due_soon_count || 0} قريبًا</span>} />
              <div className="overflow-hidden rounded-[1.5rem] border border-slate-200 bg-white shadow-sm">
                {obligations.length ? obligations.slice(0, 6).map((item, index) => (
                  <div key={item.id} className={`flex items-center gap-3 p-4 ${index ? 'border-t border-slate-100' : ''}`}>
                    <span className={`rounded-full px-2.5 py-1 text-[9px] font-bold ${item.obligation_type === 'receivable' ? 'bg-sky-50 text-sky-700' : 'bg-amber-50 text-amber-700'}`}>{item.obligation_type === 'receivable' ? 'لي' : 'عليّ'}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[11px] font-black text-slate-900">{item.title}</p>
                      <p className="mt-1 text-[9px] text-slate-400">{item.party_name || 'بدون طرف'} · الاستحقاق {formatDate(item.due_date)}</p>
                    </div>
                    <p className="text-xs font-black text-slate-950">{formatAmount(item.outstanding_amount, item.currency)}</p>
                  </div>
                )) : <EmptyState text="لا توجد التزامات مفتوحة. عندما تسجل ما لك أو ما عليك سيظهر هنا." />}
              </div>
            </section>
          </div>

          <div className="grid gap-5 xl:grid-cols-2">
            <section>
              <SectionHeader eyebrow="خطة الإنفاق" title="الميزانيات النشطة" />
              <div className="space-y-3">
                {budgets.length ? budgets.map((budget) => {
                  const usage = Math.max(0, Number(budget.usage_percent || 0));
                  return (
                    <div key={budget.id} className="rounded-[1.45rem] border border-slate-200 bg-white p-4 shadow-sm">
                      <div className="flex items-center justify-between gap-3">
                        <div><p className="text-[11px] font-black text-slate-950">{budget.name}</p><p className="mt-1 text-[9px] text-slate-400">حتى {formatDate(budget.period_end)}</p></div>
                        <span className="text-[10px] font-black text-slate-700">{usage.toFixed(0)}%</span>
                      </div>
                      <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${budget.is_over_budget ? 'bg-rose-500' : 'bg-emerald-500'}`} style={{ width: `${Math.min(100, usage)}%` }} /></div>
                      <div className="mt-2 flex justify-between text-[9px] text-slate-500"><span>مصروف {formatAmount(budget.spent_amount, budget.currency)}</span><span>المتاح {formatAmount(budget.remaining_amount, budget.currency)}</span></div>
                    </div>
                  );
                }) : <EmptyState text="لا توجد ميزانية نشطة للفترة الحالية." />}
              </div>
            </section>

            <section>
              <SectionHeader eyebrow="أهدافي" title="أهداف الادخار" />
              <div className="space-y-3">
                {goals.length ? goals.slice(0, 6).map((goal) => {
                  const target = Number(goal.target_amount || 0);
                  const current = Number(goal.current_amount || 0);
                  const progress = target > 0 ? Math.min(100, (current / target) * 100) : 0;
                  return (
                    <div key={goal.id} className="rounded-[1.45rem] border border-slate-200 bg-white p-4 shadow-sm">
                      <div className="flex items-center justify-between gap-3"><p className="text-[11px] font-black text-slate-950">{goal.name}</p><Target className="h-4 w-4 text-indigo-600" /></div>
                      <p className="mt-3 text-lg font-black text-slate-950">{formatAmount(current, goal.currency)} <span className="text-[10px] font-bold text-slate-400">من {formatAmount(target, goal.currency)}</span></p>
                      <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-indigo-600" style={{ width: `${progress}%` }} /></div>
                    </div>
                  );
                }) : <EmptyState text="لا توجد أهداف ادخار نشطة." />}
              </div>
            </section>
          </div>

          <section>
            <SectionHeader eyebrow="العلاقات المالية" title="الأشخاص والجهات المرتبطة" action={<span className="text-[9px] font-bold text-slate-400">{parties.length} طرف</span>} />
            {parties.length ? (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {parties.slice(0, 8).map((party) => (
                  <div key={party.id} className="flex items-center gap-3 rounded-[1.3rem] border border-slate-200 bg-white p-4 shadow-sm">
                    <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-sky-50 text-sky-700"><UsersRound className="h-4.5 w-4.5" /></span>
                    <div className="min-w-0"><p className="truncate text-[11px] font-black text-slate-900">{party.display_name}</p><p className="mt-1 text-[9px] text-slate-400">{party.phone || party.party_type || 'طرف مالي'}</p></div>
                  </div>
                ))}
              </div>
            ) : <EmptyState text="لم تضف أطرافًا مالية بعد. الأطراف تساعد على ربط الالتزامات والعمليات بالأشخاص والجهات الصحيحة." />}
          </section>

          <button type="button" onClick={() => go('financial/actions')} className="flex w-full items-center justify-between rounded-[1.5rem] bg-slate-950 px-5 py-4 text-right text-white shadow-lg">
            <span><strong className="block text-sm">فتح الإدارة المالية الكاملة</strong><span className="mt-1 block text-[9px] text-white/60">الحسابات والتصنيفات والأطراف والدخل والمصروف والميزانيات والالتزامات والأهداف.</span></span>
            <ArrowLeft className="h-5 w-5" />
          </button>
        </>
      ) : null}
    </div>
  );
}

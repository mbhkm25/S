import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  CalendarClock,
  CreditCard,
  FileText,
  Landmark,
  Loader2,
  PiggyBank,
  Plus,
  ReceiptText,
  Search,
  Target,
  UsersRound,
  WalletCards,
} from 'lucide-react';
import ProductBottomNav from '../../components/navigation/ProductBottomNav';
import {
  getPersonalBudgets,
  getPersonalFinanceOverview,
  getPersonalGoals,
  getPersonalObligations,
  getPersonalParties,
  getPersonalTransactions,
  type PersonalBudgetListItem,
  type PersonalFinanceBalanceItem,
  type PersonalGoalListItem,
  type PersonalObligationListItem,
  type PersonalPartyListItem,
  type PersonalTransactionListItem,
} from './api/financialApi';

type SectionKey = 'accounts' | 'transactions' | 'obligations' | 'budgets' | 'goals' | 'parties';

type SectionMeta = {
  label: string;
  eyebrow: string;
  description: string;
  icon: typeof WalletCards;
};

const SECTIONS: Record<SectionKey, SectionMeta> = {
  accounts: { label: 'الحسابات', eyebrow: 'المحافظ والأرصدة', description: 'حساباتك الشخصية وأرصدتها الفعلية حسب العملة.', icon: CreditCard },
  transactions: { label: 'العمليات', eyebrow: 'الحركة المالية', description: 'الدخل والمصروف والتسويات والحركات المرحّلة.', icon: ReceiptText },
  obligations: { label: 'الالتزامات', eyebrow: 'لي / عليّ', description: 'المستحقات المفتوحة وما تم تسويته أو بقي منه رصيد.', icon: Landmark },
  budgets: { label: 'الميزانيات', eyebrow: 'خطة الإنفاق', description: 'ميزانيات الفترات والتصنيفات وحدود الصرف.', icon: PiggyBank },
  goals: { label: 'الأهداف', eyebrow: 'الادخار', description: 'أهدافك المالية والتقدم نحو كل هدف.', icon: Target },
  parties: { label: 'الأطراف', eyebrow: 'العلاقات المالية', description: 'الأشخاص والجهات المرتبطة بعملياتك والتزاماتك.', icon: UsersRound },
};

function basePath(): string {
  const value = import.meta.env.VITE_APP_BASE_PATH || '/';
  return value.endsWith('/') ? value : `${value}/`;
}

function go(path: string) {
  window.location.assign(`${basePath()}${path}`);
}

function resolveSection(pathname: string): SectionKey {
  const match = pathname.match(/\/financial\/(accounts|transactions|obligations|budgets|goals|parties)\/?$/);
  return (match?.[1] as SectionKey | undefined) || 'accounts';
}

function formatAmount(value: unknown, currency?: string): string {
  const amount = Number(value || 0);
  const formatted = new Intl.NumberFormat('ar-YE-u-nu-latn', { maximumFractionDigits: 2 }).format(amount);
  if (currency === 'YER') return `${formatted} ر.ي`;
  if (currency === 'SAR') return `${formatted} ر.س`;
  if (currency === 'USD') return `${formatted} $`;
  return [formatted, currency].filter(Boolean).join(' ');
}

function formatDate(value?: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('ar-YE-u-nu-latn', { dateStyle: 'medium' }).format(date);
}

function StatusBadge({ value }: { value: string }) {
  const map: Record<string, string> = {
    active: 'bg-emerald-50 text-emerald-700',
    posted: 'bg-emerald-50 text-emerald-700',
    open: 'bg-amber-50 text-amber-700',
    partial: 'bg-sky-50 text-sky-700',
    settled: 'bg-slate-100 text-slate-600',
    completed: 'bg-emerald-50 text-emerald-700',
    inactive: 'bg-slate-100 text-slate-500',
  };
  return <span className={`rounded-full px-2.5 py-1 text-[9px] font-bold ${map[value] || 'bg-slate-100 text-slate-600'}`}>{value}</span>;
}

function Empty({ text }: { text: string }) {
  return <div className="rounded-[1.5rem] border border-dashed border-slate-200 bg-white px-5 py-10 text-center text-[11px] leading-6 text-slate-500">{text}</div>;
}

export default function PersonalFinanceSectionRoute() {
  const section = useMemo(() => resolveSection(window.location.pathname), []);
  const meta = SECTIONS[section];
  const Icon = meta.icon;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [accounts, setAccounts] = useState<PersonalFinanceBalanceItem[]>([]);
  const [transactions, setTransactions] = useState<PersonalTransactionListItem[]>([]);
  const [obligations, setObligations] = useState<PersonalObligationListItem[]>([]);
  const [budgets, setBudgets] = useState<PersonalBudgetListItem[]>([]);
  const [goals, setGoals] = useState<PersonalGoalListItem[]>([]);
  const [parties, setParties] = useState<PersonalPartyListItem[]>([]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');

    const load = async () => {
      if (section === 'accounts') {
        const result = await getPersonalFinanceOverview();
        if (result.error) throw new Error(result.error.message || 'تعذر تحميل الحسابات.');
        if (active) setAccounts((result.data?.balances || []).filter((item) => !item.system_role));
      } else if (section === 'transactions') {
        const result = await getPersonalTransactions();
        if (result.error) throw new Error(result.error.message || 'تعذر تحميل العمليات.');
        if (active) setTransactions(result.data || []);
      } else if (section === 'obligations') {
        const result = await getPersonalObligations();
        if (result.error) throw new Error(result.error.message || 'تعذر تحميل الالتزامات.');
        if (active) setObligations(result.data || []);
      } else if (section === 'budgets') {
        const result = await getPersonalBudgets();
        if (result.error) throw new Error(result.error.message || 'تعذر تحميل الميزانيات.');
        if (active) setBudgets(result.data || []);
      } else if (section === 'goals') {
        const result = await getPersonalGoals();
        if (result.error) throw new Error(result.error.message || 'تعذر تحميل الأهداف.');
        if (active) setGoals(result.data || []);
      } else {
        const result = await getPersonalParties();
        if (result.error) throw new Error(result.error.message || 'تعذر تحميل الأطراف.');
        if (active) setParties(result.data || []);
      }
    };

    void load()
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : 'تعذر تحميل البيانات.'); })
      .finally(() => { if (active) setLoading(false); });

    return () => { active = false; };
  }, [section]);

  const normalized = query.trim().toLowerCase();
  const visibleTransactions = transactions.filter((item) => !normalized || [item.description, item.category_name, item.party_name, item.reference_code, item.currency].some((value) => String(value || '').toLowerCase().includes(normalized)));
  const visibleObligations = obligations.filter((item) => !normalized || [item.title, item.party_name, item.currency].some((value) => String(value || '').toLowerCase().includes(normalized)));
  const visibleBudgets = budgets.filter((item) => !normalized || [item.name, item.category_name, item.currency].some((value) => String(value || '').toLowerCase().includes(normalized)));
  const visibleGoals = goals.filter((item) => !normalized || [item.name, item.currency].some((value) => String(value || '').toLowerCase().includes(normalized)));
  const visibleParties = parties.filter((item) => !normalized || [item.display_name, item.phone, item.email, item.party_type].some((value) => String(value || '').toLowerCase().includes(normalized)));

  return (
    <div dir="rtl" className="min-h-screen bg-[#F7F7F5] pb-24 font-arabic text-slate-900 lg:pb-8">
      <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-white/95 px-4 py-3 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1440px] items-center gap-3 lg:px-6 lg:pl-32">
          <button type="button" onClick={() => go('financial')} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-700" aria-label="العودة إلى سند المالي">
            <ArrowRight className="h-5 w-5" />
          </button>
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-slate-950 text-white"><Icon className="h-5 w-5" /></span>
          <div className="min-w-0 flex-1">
            <p className="text-[9px] font-bold text-emerald-700">{meta.eyebrow}</p>
            <h1 className="truncate text-base font-black">{meta.label}</h1>
          </div>
          <button type="button" onClick={() => go('financial/actions')} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-slate-950 px-3 text-[10px] font-black text-white">
            <Plus className="h-4 w-4" /> إضافة / إدارة
          </button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1440px] space-y-5 px-4 py-5 lg:px-6 lg:pl-32">
        <section className="rounded-[1.6rem] border border-slate-200 bg-white p-4 shadow-sm lg:p-5">
          <p className="text-[11px] leading-6 text-slate-500">{meta.description}</p>
          <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
            {(Object.keys(SECTIONS) as SectionKey[]).map((key) => {
              const item = SECTIONS[key];
              const ItemIcon = item.icon;
              const selected = key === section;
              return (
                <a key={key} href={`${basePath()}financial/${key}`} className={`flex min-h-11 shrink-0 items-center gap-2 rounded-xl px-3 text-[10px] font-bold transition ${selected ? 'bg-slate-950 text-white' : 'bg-slate-100 text-slate-600'}`}>
                  <ItemIcon className="h-4 w-4" /> {item.label}
                </a>
              );
            })}
          </div>
        </section>

        {section !== 'accounts' && (
          <div className="relative">
            <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="بحث داخل هذه المساحة..." className="w-full rounded-2xl border border-slate-200 bg-white py-3 pr-10 pl-4 text-xs outline-none focus:border-slate-400" />
          </div>
        )}

        {loading ? <div className="flex min-h-56 items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-slate-400" /></div> : null}
        {!loading && error ? <div className="rounded-[1.5rem] border border-rose-100 bg-rose-50 p-5 text-xs leading-6 text-rose-700">{error}</div> : null}

        {!loading && !error && section === 'accounts' && (
          accounts.length ? <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {accounts.map((item) => (
              <article key={item.id} className="rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0"><p className="truncate text-sm font-black">{item.name}</p><p className="mt-1 text-[10px] text-slate-400">{item.account_type === 'asset' ? 'أصل / محفظة' : item.account_type === 'liability' ? 'التزام' : item.account_type}</p></div>
                  <StatusBadge value={item.status} />
                </div>
                <p className="mt-6 text-2xl font-black">{formatAmount(item.balance, item.currency)}</p>
                <p className="mt-1 text-[9px] font-bold text-slate-400">{item.currency}</p>
              </article>
            ))}
          </div> : <Empty text="لا توجد حسابات شخصية بعد. استخدم «إضافة / إدارة» لإنشاء حساب نقد أو بنك أو محفظة." />
        )}

        {!loading && !error && section === 'transactions' && (
          visibleTransactions.length ? <div className="overflow-hidden rounded-[1.5rem] border border-slate-200 bg-white shadow-sm">
            {visibleTransactions.map((item, index) => (
              <article key={item.id} className={`grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center ${index ? 'border-t border-slate-100' : ''}`}>
                <div className="flex min-w-0 items-start gap-3">
                  <span className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${item.transaction_type === 'income' ? 'bg-emerald-50 text-emerald-700' : item.transaction_type === 'expense' ? 'bg-rose-50 text-rose-700' : 'bg-sky-50 text-sky-700'}`}><ReceiptText className="h-4.5 w-4.5" /></span>
                  <div className="min-w-0">
                    <p className="truncate text-[11px] font-black">{item.description || item.transaction_type}</p>
                    <p className="mt-1 text-[9px] leading-5 text-slate-400">{[item.category_name, item.party_name, formatDate(item.transaction_at), item.reference_code].filter(Boolean).join(' · ')}</p>
                  </div>
                </div>
                <div className="flex items-center justify-between gap-3 sm:block sm:text-left">
                  <p className="text-sm font-black">{formatAmount(item.amount, item.currency)}</p>
                  <div className="mt-1 flex items-center gap-2 sm:justify-end"><StatusBadge value={item.status} /><span className="text-[8px] text-slate-400">{item.source || 'manual'}</span></div>
                </div>
              </article>
            ))}
          </div> : <Empty text={query ? 'لا توجد عمليات مطابقة للبحث.' : 'لا توجد عمليات مالية مسجلة بعد.'} />
        )}

        {!loading && !error && section === 'obligations' && (
          visibleObligations.length ? <div className="grid gap-3 lg:grid-cols-2">
            {visibleObligations.map((item) => (
              <article key={item.id} className="rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div><span className={`rounded-full px-2.5 py-1 text-[9px] font-bold ${item.obligation_type === 'receivable' ? 'bg-sky-50 text-sky-700' : 'bg-amber-50 text-amber-700'}`}>{item.obligation_type === 'receivable' ? 'لي' : 'عليّ'}</span><h2 className="mt-3 text-sm font-black">{item.title}</h2><p className="mt-1 text-[9px] text-slate-400">{item.party_name || 'بدون طرف'}</p></div>
                  <StatusBadge value={item.status} />
                </div>
                <div className="mt-5 grid grid-cols-2 gap-3 rounded-2xl bg-slate-50 p-3">
                  <div><p className="text-[9px] text-slate-400">المبلغ الأصلي</p><p className="mt-1 text-xs font-black">{formatAmount(item.original_amount, item.currency)}</p></div>
                  <div><p className="text-[9px] text-slate-400">المتبقي</p><p className="mt-1 text-xs font-black">{formatAmount(item.outstanding_amount, item.currency)}</p></div>
                </div>
                <p className="mt-3 flex items-center gap-2 text-[9px] text-slate-500"><CalendarClock className="h-3.5 w-3.5" /> الاستحقاق {formatDate(item.due_date)}</p>
              </article>
            ))}
          </div> : <Empty text={query ? 'لا توجد التزامات مطابقة للبحث.' : 'لا توجد التزامات مالية مسجلة.'} />
        )}

        {!loading && !error && section === 'budgets' && (
          visibleBudgets.length ? <div className="grid gap-3 lg:grid-cols-2">
            {visibleBudgets.map((item) => (
              <article key={item.id} className="rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between gap-3"><div><h2 className="text-sm font-black">{item.name}</h2><p className="mt-1 text-[9px] text-slate-400">{item.category_name || 'كل المصروفات'}</p></div><StatusBadge value={item.status} /></div>
                <p className="mt-5 text-2xl font-black">{formatAmount(item.amount, item.currency)}</p>
                <p className="mt-3 text-[9px] text-slate-500">{formatDate(item.period_start)} — {formatDate(item.period_end)}</p>
              </article>
            ))}
          </div> : <Empty text={query ? 'لا توجد ميزانيات مطابقة للبحث.' : 'لم تنشئ ميزانية مالية بعد.'} />
        )}

        {!loading && !error && section === 'goals' && (
          visibleGoals.length ? <div className="grid gap-3 lg:grid-cols-2">
            {visibleGoals.map((item) => {
              const progress = item.target_amount > 0 ? Math.min(100, (item.current_amount / item.target_amount) * 100) : 0;
              return (
                <article key={item.id} className="rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex items-start justify-between gap-3"><div><h2 className="text-sm font-black">{item.name}</h2><p className="mt-1 text-[9px] text-slate-400">الهدف {formatDate(item.target_date)}</p></div><StatusBadge value={item.status} /></div>
                  <p className="mt-5 text-lg font-black">{formatAmount(item.current_amount, item.currency)} <span className="text-[10px] text-slate-400">من {formatAmount(item.target_amount, item.currency)}</span></p>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-indigo-600" style={{ width: `${progress}%` }} /></div>
                  <p className="mt-2 text-[9px] font-bold text-slate-500">{progress.toFixed(0)}%</p>
                </article>
              );
            })}
          </div> : <Empty text={query ? 'لا توجد أهداف مطابقة للبحث.' : 'لا توجد أهداف ادخار بعد.'} />
        )}

        {!loading && !error && section === 'parties' && (
          visibleParties.length ? <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {visibleParties.map((item) => (
              <article key={item.id} className="rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between gap-3"><span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-sky-50 text-sky-700"><UsersRound className="h-5 w-5" /></span><StatusBadge value={item.status} /></div>
                <h2 className="mt-4 text-sm font-black">{item.display_name}</h2>
                <p className="mt-1 text-[9px] text-slate-400">{item.party_type || 'طرف مالي'}</p>
                <div className="mt-4 space-y-1 text-[10px] text-slate-600">
                  {item.phone ? <p>{item.phone}</p> : null}
                  {item.email ? <p>{item.email}</p> : null}
                  {item.notes ? <p className="pt-2 text-slate-400">{item.notes}</p> : null}
                </div>
              </article>
            ))}
          </div> : <Empty text={query ? 'لا توجد أطراف مطابقة للبحث.' : 'لم تضف أشخاصًا أو جهات مالية بعد.'} />
        )}

        <a href={`${basePath()}financial`} className="flex items-center justify-between rounded-[1.35rem] border border-slate-200 bg-white px-4 py-3 text-[10px] font-bold text-slate-600 shadow-sm">
          <span className="flex items-center gap-2"><FileText className="h-4 w-4" /> العودة إلى الموقف المالي العام</span>
          <ArrowRight className="h-4 w-4 rotate-180" />
        </a>
      </main>

      <ProductBottomNav activeArea="financial" />
    </div>
  );
}

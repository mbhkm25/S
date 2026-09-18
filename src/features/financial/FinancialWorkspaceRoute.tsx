import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  Bot,
  BriefcaseBusiness,
  CircleDollarSign,
  Landmark,
  Loader2,
  RefreshCw,
  ShieldCheck,
  UserRound,
  WalletCards,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';

type WorkspaceKind = 'financial' | 'commercial' | 'account' | 'ai';

type AccountBusiness = {
  id?: string;
  name?: string;
  slug?: string;
  public_status?: string;
  verification_status?: string;
};

type AccountCenter = {
  profile?: Record<string, unknown>;
  subscription?: Record<string, unknown>;
  notifications?: { unread?: number; total_active?: number };
  devices?: { active_push?: number; last_seen_at?: string | null };
  businesses?: AccountBusiness[];
  finance?: {
    active_accounts?: number;
    active_budgets?: number;
    active_goals?: number;
    open_obligations?: number;
  };
  financial_preferences?: Record<string, unknown>;
};

type FinanceDashboard = {
  cashflow_by_currency?: Array<{ currency?: string; income?: number; expense?: number; net?: number }>;
  accounts?: number;
  open_obligations?: Array<{ currency?: string; payable?: number; receivable?: number }>;
  due_soon_count?: number;
  active_budgets?: number;
  active_goals?: number;
};

type CommercialDashboard = {
  business_id?: string;
  totals_by_currency?: Array<{
    currency?: string;
    sales?: number;
    purchases?: number;
    receipts?: number;
    payments?: number;
    expenses?: number;
  }>;
  receivables_by_currency?: Array<{ currency?: string; outstanding?: number }>;
  payables_by_currency?: Array<{ currency?: string; outstanding?: number }>;
  overdue_count?: number;
};

type AiContext = {
  contract_version?: number;
  access_log_id?: string;
  context?: Record<string, unknown>;
};

const sections: Array<{ kind: WorkspaceKind; path: string; label: string; icon: typeof WalletCards }> = [
  { kind: 'financial', path: 'financial', label: 'سند المالي', icon: WalletCards },
  { kind: 'commercial', path: 'commercial', label: 'سند التجاري', icon: BriefcaseBusiness },
  { kind: 'account', path: 'account-center', label: 'حسابي', icon: UserRound },
  { kind: 'ai', path: 'sanad-ai', label: 'SANAD AI', icon: Bot },
];

function resolveKind(pathname: string): WorkspaceKind {
  if (/\/commercial\/?$/.test(pathname)) return 'commercial';
  if (/\/account-center\/?$/.test(pathname)) return 'account';
  if (/\/sanad-ai\/?$/.test(pathname)) return 'ai';
  return 'financial';
}

function basePath(): string {
  const value = import.meta.env.VITE_APP_BASE_PATH || '/';
  return value.endsWith('/') ? value : `${value}/`;
}

function go(path = '') {
  window.location.assign(`${basePath()}${path}`);
}

function formatAmount(value: unknown, currency?: string): string {
  const amount = Number(value || 0);
  const formatted = new Intl.NumberFormat('ar-YE-u-nu-latn', { maximumFractionDigits: 2 }).format(amount);
  if (!currency) return formatted;
  if (currency === 'YER') return `${formatted} ر.ي`;
  if (currency === 'SAR') return `${formatted} ر.س`;
  return `${formatted} ${currency}`;
}

function ErrorCard({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <section className="rounded-[1.5rem] border border-rose-100 bg-rose-50 p-5 text-right">
      <p className="text-sm font-bold text-rose-900">تعذر تحميل البيانات</p>
      <p className="mt-2 text-xs leading-6 text-rose-700">{message}</p>
      <button onClick={onRetry} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-xs font-bold text-rose-800 shadow-sm">
        <RefreshCw className="h-4 w-4" /> إعادة المحاولة
      </button>
    </section>
  );
}

function StatCard({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-[1.35rem] border border-slate-100 bg-white p-4 shadow-[0_10px_30px_rgba(15,23,42,0.05)]">
      <p className="text-[10px] font-bold text-slate-400">{label}</p>
      <p className="mt-2 text-xl font-black text-slate-950">{value}</p>
      {hint ? <p className="mt-1 text-[10px] leading-5 text-slate-500">{hint}</p> : null}
    </div>
  );
}

export default function FinancialWorkspaceRoute() {
  const kind = useMemo(() => resolveKind(window.location.pathname), []);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [account, setAccount] = useState<AccountCenter | null>(null);
  const [finance, setFinance] = useState<FinanceDashboard | null>(null);
  const [commercial, setCommercial] = useState<CommercialDashboard | null>(null);
  const [ai, setAi] = useState<AiContext | null>(null);
  const [selectedBusinessId, setSelectedBusinessId] = useState<string>('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      if (!sessionData.session?.user) {
        setError('هذه المساحة تتطلب تسجيل الدخول إلى حساب سند.');
        return;
      }

      const { data: accountData, error: accountError } = await supabase.rpc('get_my_account_center_v1');
      if (accountError) throw accountError;
      const nextAccount = (accountData || {}) as AccountCenter;
      setAccount(nextAccount);

      if (kind === 'financial') {
        const { data, error: rpcError } = await supabase.rpc('get_my_finance_dashboard_v1');
        if (rpcError) throw rpcError;
        setFinance((data || {}) as FinanceDashboard);
      }

      if (kind === 'commercial') {
        const businesses = Array.isArray(nextAccount.businesses) ? nextAccount.businesses : [];
        const businessId = selectedBusinessId || businesses.find((item) => item.id)?.id || '';
        setSelectedBusinessId(businessId);
        if (businessId) {
          const { data, error: rpcError } = await supabase.rpc('get_business_commercial_dashboard_v1', { p_business_id: businessId });
          if (rpcError) throw rpcError;
          setCommercial((data || {}) as CommercialDashboard);
        } else {
          setCommercial(null);
        }
      }

      if (kind === 'ai') {
        const { data, error: rpcError } = await supabase.rpc('get_ai_financial_context_v2', {
          p_scope_kind: 'personal',
          p_purpose: 'financial_workspace',
          p_limit: 20,
        });
        if (rpcError) throw rpcError;
        setAi((data || {}) as AiContext);
      }
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'حدث خطأ غير متوقع أثناء تحميل المساحة.';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [kind, selectedBusinessId]);

  useEffect(() => { void load(); }, [load]);

  const current = sections.find((section) => section.kind === kind) || sections[0];
  const CurrentIcon = current.icon;
  const businesses = Array.isArray(account?.businesses) ? account.businesses : [];

  return (
    <div className="min-h-screen bg-[#F7F7F5] text-slate-900 font-arabic" dir="rtl">
      <header className="sticky top-0 z-20 border-b border-slate-200/70 bg-white/95 px-4 py-3 backdrop-blur-md">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3">
          <button onClick={() => go()} className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-700" aria-label="العودة للرئيسية">
            <ArrowRight className="h-5 w-5" />
          </button>
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-slate-950 text-white"><CurrentIcon className="h-5 w-5" /></span>
            <div className="min-w-0">
              <p className="text-[9px] font-bold text-slate-400">مساحات سند</p>
              <h1 className="truncate text-base font-black">{current.label}</h1>
            </div>
          </div>
          <button onClick={() => void load()} className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-slate-500 shadow-sm" aria-label="تحديث">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl space-y-5 px-4 py-5 pb-28">
        <section className="grid grid-cols-4 gap-2 rounded-[1.4rem] bg-white p-2 shadow-sm">
          {sections.map((section) => {
            const Icon = section.icon;
            const active = section.kind === kind;
            return (
              <button key={section.kind} onClick={() => go(section.path)} className={`flex min-h-16 flex-col items-center justify-center gap-1 rounded-[1rem] px-1 text-center transition ${active ? 'bg-slate-950 text-white' : 'text-slate-500'}`}>
                <Icon className="h-4 w-4" />
                <span className="text-[9px] font-bold">{section.label}</span>
              </button>
            );
          })}
        </section>

        {loading ? (
          <div className="flex min-h-60 items-center justify-center rounded-[1.75rem] bg-white"><Loader2 className="h-7 w-7 animate-spin text-slate-400" /></div>
        ) : error ? <ErrorCard message={error} onRetry={() => void load()} /> : null}

        {!loading && !error && kind === 'financial' && finance ? (
          <>
            <section className="rounded-[1.8rem] bg-gradient-to-l from-emerald-100 via-white to-white p-5 shadow-sm">
              <div className="flex items-center gap-3"><CircleDollarSign className="h-6 w-6 text-emerald-700" /><div><p className="text-[10px] font-bold text-emerald-700">ملخصك المالي</p><h2 className="text-lg font-black">صورة مالية موحدة</h2></div></div>
              <div className="mt-5 grid grid-cols-2 gap-3">
                <StatCard label="الحسابات النشطة" value={finance.accounts || 0} />
                <StatCard label="الميزانيات النشطة" value={finance.active_budgets || 0} />
                <StatCard label="أهداف الادخار" value={finance.active_goals || 0} />
                <StatCard label="استحقاقات خلال 7 أيام" value={finance.due_soon_count || 0} />
              </div>
            </section>
            {(finance.cashflow_by_currency || []).map((row) => (
              <section key={row.currency || 'currency'} className="rounded-[1.6rem] bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between"><h3 className="font-black">التدفق النقدي</h3><span className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-bold">{row.currency}</span></div>
                <div className="mt-4 grid grid-cols-3 gap-2 text-center"><StatCard label="دخل" value={formatAmount(row.income, row.currency)} /><StatCard label="مصروف" value={formatAmount(row.expense, row.currency)} /><StatCard label="الصافي" value={formatAmount(row.net, row.currency)} /></div>
              </section>
            ))}
            {(finance.open_obligations || []).map((row) => (
              <section key={`ob-${row.currency}`} className="rounded-[1.6rem] border border-amber-100 bg-amber-50/70 p-5">
                <div className="flex items-center gap-2"><Landmark className="h-5 w-5 text-amber-700" /><h3 className="font-black">الالتزامات المفتوحة — {row.currency}</h3></div>
                <div className="mt-4 grid grid-cols-2 gap-3"><StatCard label="عليك" value={formatAmount(row.payable, row.currency)} /><StatCard label="لك" value={formatAmount(row.receivable, row.currency)} /></div>
              </section>
            ))}
          </>
        ) : null}

        {!loading && !error && kind === 'commercial' ? (
          <>
            <section className="rounded-[1.7rem] bg-white p-5 shadow-sm">
              <div className="flex items-center gap-3"><BriefcaseBusiness className="h-6 w-6 text-sky-700" /><div><p className="text-[10px] font-bold text-sky-700">سند التجاري</p><h2 className="text-lg font-black">مركز النشاط المالي والتجاري</h2></div></div>
              {businesses.length ? (
                <select value={selectedBusinessId} onChange={(event) => setSelectedBusinessId(event.target.value)} className="mt-5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-bold outline-none">
                  {businesses.map((business) => <option key={business.id} value={business.id}>{business.name || 'نشاط بدون اسم'}</option>)}
                </select>
              ) : <p className="mt-4 rounded-xl bg-amber-50 p-4 text-xs leading-6 text-amber-800">لا توجد منشأة مملوكة لهذا الحساب بعد. أنشئ نشاطًا في سند التجاري أولًا.</p>}
            </section>
            {commercial ? (
              <>
                <div className="grid grid-cols-2 gap-3"><StatCard label="فواتير متأخرة" value={commercial.overdue_count || 0} /><StatCard label="المنشأة" value={businesses.find((item) => item.id === selectedBusinessId)?.name || '—'} /></div>
                {(commercial.totals_by_currency || []).map((row) => (
                  <section key={row.currency || 'commercial-currency'} className="rounded-[1.6rem] bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><h3 className="font-black">الحركة التجارية</h3><span className="text-xs font-bold text-slate-500">{row.currency}</span></div><div className="mt-4 grid grid-cols-2 gap-3"><StatCard label="المبيعات" value={formatAmount(row.sales, row.currency)} /><StatCard label="المشتريات" value={formatAmount(row.purchases, row.currency)} /><StatCard label="المقبوضات" value={formatAmount(row.receipts, row.currency)} /><StatCard label="المدفوعات" value={formatAmount(row.payments, row.currency)} /></div></section>
                ))}
                <section className="grid grid-cols-2 gap-3">
                  <div className="rounded-[1.5rem] bg-emerald-50 p-4"><p className="text-[10px] font-bold text-emerald-700">الذمم المدينة</p>{(commercial.receivables_by_currency || []).map((row) => <p key={row.currency} className="mt-2 text-base font-black">{formatAmount(row.outstanding, row.currency)}</p>)}</div>
                  <div className="rounded-[1.5rem] bg-amber-50 p-4"><p className="text-[10px] font-bold text-amber-700">الذمم الدائنة</p>{(commercial.payables_by_currency || []).map((row) => <p key={row.currency} className="mt-2 text-base font-black">{formatAmount(row.outstanding, row.currency)}</p>)}</div>
                </section>
              </>
            ) : null}
          </>
        ) : null}

        {!loading && !error && kind === 'account' && account ? (
          <>
            <section className="rounded-[1.8rem] bg-slate-950 p-5 text-white shadow-[0_20px_50px_rgba(15,23,42,0.18)]">
              <div className="flex items-center gap-3"><UserRound className="h-6 w-6" /><div><p className="text-[10px] font-bold text-white/60">حسابي</p><h2 className="text-lg font-black">مركز الحساب الموحد</h2></div></div>
              <p className="mt-4 text-xs leading-6 text-white/70">الملف، الاشتراك، الأجهزة، الإشعارات، المنشآت والحالة المالية في شاشة واحدة.</p>
            </section>
            <div className="grid grid-cols-2 gap-3"><StatCard label="إشعارات غير مقروءة" value={account.notifications?.unread || 0} /><StatCard label="أجهزة Push النشطة" value={account.devices?.active_push || 0} /><StatCard label="المنشآت" value={businesses.length} /><StatCard label="التزامات مفتوحة" value={account.finance?.open_obligations || 0} /></div>
            <section className="rounded-[1.6rem] bg-white p-5 shadow-sm"><p className="text-[10px] font-bold text-slate-400">الخطة الحالية</p><p className="mt-2 text-lg font-black">{String(account.subscription?.plan_code || 'بدون اشتراك')}</p><p className="mt-1 text-xs text-slate-500">الحالة: {String(account.subscription?.status || 'غير محددة')}</p></section>
          </>
        ) : null}

        {!loading && !error && kind === 'ai' && ai ? (
          <>
            <section className="overflow-hidden rounded-[1.8rem] bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-900 p-5 text-white shadow-[0_20px_50px_rgba(15,23,42,0.2)]">
              <div className="flex items-center gap-3"><Bot className="h-7 w-7 text-indigo-200" /><div><p className="text-[10px] font-bold text-indigo-200">SANAD AI</p><h2 className="text-lg font-black">سياق مالي للقراءة فقط</h2></div></div>
              <p className="mt-4 text-xs leading-6 text-white/70">يقرأ SANAD AI بياناتك ضمن الصلاحيات الحالية، مع تسجيل كل طلب سياق مالي في سجل تدقيق مستقل.</p>
              <div className="mt-4 flex items-center gap-2 rounded-xl bg-white/10 px-3 py-2 text-[10px] font-bold"><ShieldCheck className="h-4 w-4" /> لا ينشئ أو يرحّل عمليات مالية في هذه المرحلة</div>
            </section>
            <div className="grid grid-cols-2 gap-3"><StatCard label="نسخة العقد" value={ai.contract_version || 0} /><StatCard label="Audit ID" value={ai.access_log_id ? 'مسجل' : 'غير مسجل'} /></div>
            <section className="rounded-[1.6rem] bg-white p-5 shadow-sm"><div className="flex items-center gap-2"><CircleDollarSign className="h-5 w-5 text-indigo-700" /><h3 className="font-black">السياق الحالي</h3></div><pre className="mt-4 max-h-80 overflow-auto whitespace-pre-wrap rounded-xl bg-slate-50 p-4 text-left text-[10px] leading-5 text-slate-600" dir="ltr">{JSON.stringify(ai.context || {}, null, 2)}</pre></section>
          </>
        ) : null}
      </main>
    </div>
  );
}

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  Bell,
  Bot,
  BriefcaseBusiness,
  Camera,
  CircleDollarSign,
  Database,
  FileText,
  Landmark,
  Loader2,
  Lock,
  Package,
  QrCode,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  UserRound,
  Users,
  WalletCards,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { openLocalRuntimeSettings } from '../local-first/localRuntimeSettingsEvents';
import PersonalFinanceOverview from './PersonalFinanceOverview';

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

const META: Record<WorkspaceKind, { label: string; eyebrow: string; description: string; icon: typeof WalletCards }> = {
  financial: {
    label: 'سند المالي',
    eyebrow: 'أموالك وعملياتك الشخصية',
    description: 'الإشعارات والعمليات والحسابات والميزانيات والالتزامات في مساحة مالية واحدة.',
    icon: WalletCards,
  },
  commercial: {
    label: 'سند للأعمال',
    eyebrow: 'تشغيل نشاطك التجاري',
    description: 'الإدارة والعمليات والعملاء والكتالوج والفريق والنظام المحاسبي والتقارير.',
    icon: BriefcaseBusiness,
  },
  account: {
    label: 'حسابي',
    eyebrow: 'هويتك وإعداداتك',
    description: 'البيانات الشخصية والأمان والإشعارات والاشتراك والأجهزة فقط، دون خلطها بتشغيل الأعمال أو السجل المالي.',
    icon: UserRound,
  },
  ai: {
    label: 'مساعد سند',
    eyebrow: 'المساعد الذكي',
    description: 'مساعد يفهم سياقك المصرح به ويقرأ البيانات دون أن يصبح سجلًا ماليًا موازيًا.',
    icon: Bot,
  },
};

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

function openDirectCapture() {
  try { sessionStorage.setItem('sanad_direct_capture_once', String(Date.now())); } catch { }
  go('upload');
}

function formatAmount(value: unknown, currency?: string): string {
  const amount = Number(value || 0);
  const formatted = new Intl.NumberFormat('ar-YE-u-nu-latn', { maximumFractionDigits: 2 }).format(amount);
  if (!currency) return formatted;
  if (currency === 'YER') return `${formatted} ر.ي`;
  if (currency === 'SAR') return `${formatted} ر.س`;
  return `${formatted} ${currency}`;
}

function workspaceErrorMessage(cause: unknown, fallback = 'حدث خطأ غير متوقع أثناء تحميل المساحة.'): string {
  if (cause instanceof Error && cause.message) return cause.message;
  if (cause && typeof cause === 'object') {
    const record = cause as Record<string, unknown>;
    const parts = [record.message, record.details, record.hint]
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0);
    if (parts.length) return parts.join(' — ');
    if (typeof record.code === 'string' && record.code.trim()) return `${fallback} (${record.code})`;
  }
  return fallback;
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

function LaunchCard({ title, description, icon: Icon, onClick }: { title: string; description: string; icon: typeof WalletCards; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex min-h-[104px] flex-col items-start justify-between rounded-[1.35rem] border border-slate-200 bg-white p-4 text-right shadow-[0_8px_24px_rgba(15,23,42,0.04)] transition active:scale-[.985]">
      <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-100 text-slate-800"><Icon className="h-4.5 w-4.5" /></span>
      <span className="mt-4">
        <strong className="block text-xs font-black text-slate-950">{title}</strong>
        <span className="mt-1 block text-[9px] leading-5 text-slate-500">{description}</span>
      </span>
    </button>
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

      let nextAccount: AccountCenter | null = null;
      if (kind === 'commercial' || kind === 'account') {
        const { data: accountData, error: accountError } = await supabase.rpc('get_my_account_center_v1');
        if (accountError) throw accountError;
        nextAccount = (accountData || {}) as AccountCenter;
        setAccount(nextAccount);
      }

      if (kind === 'financial') {
        const { data, error: rpcError } = await supabase.rpc('get_my_finance_dashboard_v1');
        if (rpcError) throw rpcError;
        setFinance((data || {}) as FinanceDashboard);
      }

      if (kind === 'commercial') {
        const businesses = Array.isArray(nextAccount?.businesses) ? nextAccount.businesses : [];
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
      setError(workspaceErrorMessage(cause));
    } finally {
      setLoading(false);
    }
  }, [kind, selectedBusinessId]);

  useEffect(() => { void load(); }, [load]);

  const current = META[kind];
  const CurrentIcon = current.icon;
  const businesses = Array.isArray(account?.businesses) ? account.businesses : [];

  return (
    <div className="min-h-screen bg-[#F7F7F5] text-slate-900 font-arabic" dir="rtl">
      <header className="sticky top-0 z-20 border-b border-slate-200/70 bg-white/95 px-4 py-3 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-3 lg:px-6 lg:pl-32">
          <button onClick={() => go()} className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-700" aria-label="العودة">
            <ArrowRight className="h-5 w-5" />
          </button>
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-slate-950 text-white"><CurrentIcon className="h-5 w-5" /></span>
            <div className="min-w-0">
              <p className="text-[9px] font-bold text-slate-400">{current.eyebrow}</p>
              <h1 className="truncate text-base font-black">{current.label}</h1>
            </div>
          </div>
          <button onClick={() => void load()} className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-slate-500 shadow-sm" aria-label="تحديث">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1440px] space-y-5 px-4 py-5 pb-32 lg:px-6 lg:pl-32 lg:pb-10">
        <section className="rounded-[1.6rem] border border-slate-200/70 bg-white px-5 py-4 shadow-sm">
          <p className="text-[11px] leading-6 text-slate-600">{current.description}</p>
        </section>

        {kind === 'financial' ? (
          <section>
            <div className="mb-3 px-1"><p className="text-[10px] font-bold text-emerald-700">أدواتك المالية</p><h2 className="mt-1 text-base font-black">ابدأ من المهمة التي تريدها</h2></div>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
              <LaunchCard title="تصوير إشعار" description="التقط إشعارًا ماليًا وحوّله إلى عملية منظمة." icon={Camera} onClick={openDirectCapture} />
              <LaunchCard title="مسح QR" description="افتح عملية مالية أو تحقق منها عبر رمز QR." icon={QrCode} onClick={() => go('scan-qr')} />
              <LaunchCard title="تحقق من إشعار" description="أدخل رمزًا أو رابطًا وتحقق من العملية دون تصوير جديد." icon={ShieldCheck} onClick={() => go('verify-notice')} />
              <LaunchCard title="عملياتي" description="السجل الشخصي للعمليات والإشعارات السابقة." icon={FileText} onClick={() => go('my-operations')} />
              <LaunchCard title="التقارير" description="أنشئ واقرأ التقارير المالية القابلة للمشاركة." icon={Landmark} onClick={() => go('reports')} />
              <LaunchCard title="الإدارة المالية" description="الحسابات والتصنيفات والأطراف والميزانيات والأهداف." icon={WalletCards} onClick={() => go('financial/actions')} />
              <LaunchCard title="التقاط الإشعارات" description="إعداد الوصول للتطبيقات المالية والتقاط إشعاراتها على Android." icon={Bell} onClick={openLocalRuntimeSettings} />
            </div>
          </section>
        ) : null}

        {kind === 'commercial' ? (
          <section>
            <div className="mb-3 px-1"><p className="text-[10px] font-bold text-sky-700">تشغيل النشاط</p><h2 className="mt-1 text-base font-black">كل ما يخص العمل في مكان واحد</h2></div>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
              <LaunchCard title="إدارة النشاط" description="ملف النشاط وساعات العمل والإعدادات التشغيلية." icon={BriefcaseBusiness} onClick={() => go('business/manage')} />
              <LaunchCard title="كشف حساب عميل" description="ابحث عن العميل واعرض كشفًا قابلًا للطباعة والمشاركة." icon={FileText} onClick={() => go('business/manage?section=accounting&erp=statement')} />
              <LaunchCard title="المبيعات والمشتريات" description="اقرأ مستندات إبداع وبنودها وشاركها أو اطبعها." icon={CircleDollarSign} onClick={() => go('business/manage?section=accounting&erp=documents')} />
              <LaunchCard title="النظام المحاسبي" description="حالة المصدر والنسخة السحابية والربط والمزامنة." icon={Database} onClick={() => go('business/manage?section=accounting')} />
              <LaunchCard title="العملاء والفريق" description="العملاء والأعضاء والأدوار والصلاحيات." icon={Users} onClick={() => go('business/manage?section=customers')} />
              <LaunchCard title="الكتالوج" description="المنتجات والخدمات والوسائط التجارية." icon={Package} onClick={() => go('business/manage?section=catalog')} />
              <LaunchCard title="مجتمع الأعمال" description="استعرض الأنشطة والكتالوجات العامة والتواصل التجاري." icon={Users} onClick={() => go('business-community')} />
            </div>
          </section>
        ) : null}

        {kind === 'account' ? (
          <section>
            <div className="mb-3 px-1"><p className="text-[10px] font-bold text-slate-600">إعداداتك الشخصية</p><h2 className="mt-1 text-base font-black">الحساب والخصوصية والاشتراك</h2></div>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
              <LaunchCard title="بياناتي" description="الاسم والصورة ورقم الجوال والبيانات الشخصية." icon={UserRound} onClick={() => go('profile/personal')} />
              <LaunchCard title="الأمان" description="تسجيل الدخول ووسائل حماية الحساب." icon={Lock} onClick={() => go('profile/security')} />
              <LaunchCard title="الإشعارات" description="مركز التنبيهات وإعدادات الوصول." icon={Bell} onClick={() => go('notifications')} />
              <LaunchCard title="الخطة والاشتراك" description="سند Pro وحالة الاشتراك وطلبات التفعيل." icon={Sparkles} onClick={() => go('profile/subscription')} />
            </div>
          </section>
        ) : null}

        {loading ? (
          <div className="flex min-h-52 items-center justify-center rounded-[1.75rem] bg-white"><Loader2 className="h-7 w-7 animate-spin text-slate-400" /></div>
        ) : error ? <ErrorCard message={error} onRetry={() => void load()} /> : null}

        {!loading && !error && kind === 'financial' && finance ? (
          <PersonalFinanceOverview dashboard={finance} />
        ) : null}

        {!loading && !error && kind === 'commercial' ? (
          <>
            <section className="rounded-[1.7rem] bg-white p-5 shadow-sm">
              <div className="flex items-center gap-3"><BriefcaseBusiness className="h-6 w-6 text-sky-700" /><div><p className="text-[10px] font-bold text-sky-700">سند للأعمال</p><h2 className="text-lg font-black">مركز النشاط المالي والتجاري</h2></div></div>
              {businesses.length ? (
                <select value={selectedBusinessId} onChange={(event) => setSelectedBusinessId(event.target.value)} className="mt-5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-bold outline-none">
                  {businesses.map((business) => <option key={business.id} value={business.id}>{business.name || 'نشاط بدون اسم'}</option>)}
                </select>
              ) : (
                <div className="mt-4 space-y-3 rounded-xl bg-amber-50 p-4 text-xs leading-6 text-amber-800">
                  <p>لا توجد منشأة مملوكة لهذا الحساب بعد.</p>
                  <button type="button" onClick={() => go('business/create')} className="rounded-xl bg-slate-950 px-4 py-2 font-bold text-white">إنشاء نشاط</button>
                </div>
              )}
            </section>
            {commercial ? (
              <>
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-3"><StatCard label="فواتير متأخرة" value={commercial.overdue_count || 0} /><StatCard label="المنشأة" value={businesses.find((item) => item.id === selectedBusinessId)?.name || '—'} /></div>
                {(commercial.totals_by_currency || []).map((row) => (
                  <section key={row.currency || 'commercial-currency'} className="rounded-[1.6rem] bg-white p-5 shadow-sm">
                    <div className="flex items-center justify-between"><h3 className="font-black">الحركة التجارية</h3><span className="text-xs font-bold text-slate-500">{row.currency}</span></div>
                    <div className="mt-4 grid grid-cols-2 gap-3"><StatCard label="المبيعات" value={formatAmount(row.sales, row.currency)} /><StatCard label="المشتريات" value={formatAmount(row.purchases, row.currency)} /><StatCard label="المقبوضات" value={formatAmount(row.receipts, row.currency)} /><StatCard label="المدفوعات" value={formatAmount(row.payments, row.currency)} /></div>
                  </section>
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
              <div className="flex items-center gap-3"><UserRound className="h-6 w-6" /><div><p className="text-[10px] font-bold text-white/60">حسابي</p><h2 className="text-lg font-black">مركز الحساب الشخصي</h2></div></div>
              <p className="mt-4 text-xs leading-6 text-white/70">حسابي يختص بهويتك وإعداداتك واشتراكك وأجهزتك. تشغيل النشاط انتقل إلى سند للأعمال، وإدارة المال انتقلت إلى سند المالي.</p>
            </section>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
              <StatCard label="إشعارات غير مقروءة" value={account.notifications?.unread || 0} />
              <StatCard label="أجهزة Push النشطة" value={account.devices?.active_push || 0} />
            </div>
            <section className="rounded-[1.6rem] bg-white p-5 shadow-sm"><p className="text-[10px] font-bold text-slate-400">الخطة الحالية</p><p className="mt-2 text-lg font-black">{String(account.subscription?.plan_code || 'بدون اشتراك')}</p><p className="mt-1 text-xs text-slate-500">الحالة: {String(account.subscription?.status || 'غير محددة')}</p></section>
          </>
        ) : null}

        {!loading && !error && kind === 'ai' && ai ? (
          <>
            <section className="overflow-hidden rounded-[1.8rem] bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-900 p-5 text-white shadow-[0_20px_50px_rgba(15,23,42,0.2)]">
              <div className="flex items-center gap-3"><Bot className="h-7 w-7 text-indigo-200" /><div><p className="text-[10px] font-bold text-indigo-200">مساعد سند</p><h2 className="text-lg font-black">مساعد يفهم سياقك المصرح به</h2></div></div>
              <p className="mt-4 text-xs leading-6 text-white/70">يقرأ مساعد سند بياناتك ضمن الصلاحيات الحالية مع تسجيل طلبات السياق الحساسة في سجل تدقيق مستقل.</p>
              <div className="mt-4 flex items-center gap-2 rounded-xl bg-white/10 px-3 py-2 text-[10px] font-bold"><ShieldCheck className="h-4 w-4" /> لا ينشئ أو يرحّل عمليات مالية في هذه المرحلة</div>
            </section>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-3"><StatCard label="نسخة العقد" value={ai.contract_version || 0} /><StatCard label="سجل التدقيق" value={ai.access_log_id ? 'مسجل' : 'غير مسجل'} /></div>
          </>
        ) : null}
      </main>
    </div>
  );
}

import { useEffect, useMemo, useState } from 'react';
import type { User as SupabaseUser } from '@supabase/supabase-js';
import {
  ArrowLeft,
  CheckCircle2,
  Download,
  FileSearch,
  Loader2,
  LockKeyhole,
  LogIn,
  QrCode,
  ShieldCheck,
  Smartphone,
  Sparkles,
  UserPlus,
  WalletCards,
} from 'lucide-react';
import App from '../../App';
import Auth from '../../components/Auth';
import ProUpgradeModal from '../../components/ProUpgradeModal';
import { supabase } from '../../lib/supabase';
import type { Profile } from '../../types';

type GateView = 'checking-session' | 'welcome' | 'auth' | 'checking-access' | 'paywall' | 'app' | 'error';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

type AccessUsage = {
  used?: number;
  limit?: number;
  remaining?: number;
  quota_policy?: 'lifetime_once' | 'subscription_period' | string;
  period_end?: string | null;
  plan?: {
    code?: string;
    name?: string;
    is_pro?: boolean;
    price?: number;
    currency?: string;
    duration_days?: number;
    access_limit?: number;
  };
};

type AccessDecision = {
  allowed?: boolean;
  reason?: string;
  will_consume?: boolean;
  usage?: AccessUsage;
};

const OPERATION_PATH_PATTERN = /\/v\/([0-9a-fA-F-]{36})(?:\/|$)/;

function getOperationToken(): string | null {
  return window.location.pathname.match(OPERATION_PATH_PATTERN)?.[1] || null;
}

function isStandalone(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches
    || Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone)
    || Boolean((window as Window & { Capacitor?: unknown }).Capacitor);
}

function formatNumber(value: number | undefined): string {
  return new Intl.NumberFormat('ar-YE').format(Number(value || 0));
}

function formatPrice(value: number | undefined, currency?: string): string {
  const amount = formatNumber(value);
  if ((currency || 'YER').toUpperCase() === 'YER') return `${amount} ريال يمني`;
  return `${amount} ${currency || ''}`.trim();
}

export default function OperationEntryGate() {
  const token = useMemo(getOperationToken, []);
  const [view, setView] = useState<GateView>(token ? 'checking-session' : 'app');
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [usage, setUsage] = useState<AccessUsage | null>(null);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(isStandalone);
  const [showInstallHelp, setShowInstallHelp] = useState(false);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (!token) return;

    const handleInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    const handleInstalled = () => {
      setInstalled(true);
      setInstallPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleInstallPrompt);
    window.addEventListener('appinstalled', handleInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleInstallPrompt);
      window.removeEventListener('appinstalled', handleInstalled);
    };
  }, [token]);

  const checkAccess = async (sessionUser: SupabaseUser) => {
    if (!token) {
      setView('app');
      return;
    }

    setUser(sessionUser);
    setView('checking-access');
    setErrorMessage('');

    const { data, error } = await supabase.rpc('get_operation_entry_decision', {
      p_public_token: token,
    });

    if (error) {
      console.warn('Operation entry decision failed', error);
      setErrorMessage('تعذر التحقق من صلاحية الوصول الآن. تحقق من اتصالك ثم أعد المحاولة.');
      setView('error');
      return;
    }

    const decision = (data || {}) as AccessDecision;
    setUsage(decision.usage || null);

    if (decision.reason === 'access_limit_reached') {
      setView('paywall');
      return;
    }

    // Profile completion, inactive tokens and not-found cases remain delegated to
    // the authenticated details screen, which owns their precise secure messages.
    setView('app');
  };

  useEffect(() => {
    if (!token) return;

    let active = true;

    void supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      if (error) {
        setErrorMessage('تعذر تأكيد جلسة سند. أعد المحاولة بعد التحقق من اتصال الإنترنت.');
        setView('error');
        return;
      }
      if (data.session?.user) {
        void checkAccess(data.session.user);
      } else {
        setView('welcome');
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      if (session?.user) {
        void checkAccess(session.user);
      } else if (view !== 'auth') {
        setUser(null);
        setView('welcome');
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
    // The current gate view is intentionally excluded to avoid recreating the
    // auth subscription while the user moves through the onboarding screens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const handleInstall = async () => {
    if (installed) {
      setView('auth');
      return;
    }

    if (!installPrompt) {
      setShowInstallHelp(true);
      return;
    }

    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === 'accepted') {
      setInstalled(true);
      setInstallPrompt(null);
      setView('auth');
    }
  };

  const handleAuthSuccess = (sessionUser: SupabaseUser, _profile: Profile) => {
    void checkAccess(sessionUser);
  };

  if (!token || view === 'app') return <App />;

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#ecfdf5_0,_#f8fafc_38%,_#f7f7f5_100%)] text-slate-900" dir="rtl">
      <header className="border-b border-white/80 bg-white/85 px-5 py-3 backdrop-blur-xl">
        <div className="mx-auto flex max-w-xl items-center justify-between">
          <img src={`${import.meta.env.BASE_URL}logo.png`} alt="سند" className="h-10 w-auto object-contain" />
          <div className="flex items-center gap-2 rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1.5 text-[11px] font-bold text-emerald-800">
            <ShieldCheck className="h-4 w-4" />
            وصول آمن إلى عملية مالية
          </div>
        </div>
      </header>

      <main className="mx-auto flex min-h-[calc(100vh-69px)] w-full max-w-xl items-center px-4 py-6">
        {view === 'checking-session' || view === 'checking-access' ? (
          <LoadingCard label={view === 'checking-session' ? 'جاري تجهيز رابط العملية...' : 'جاري التحقق من رصيد الوصول...'} />
        ) : null}

        {view === 'welcome' ? (
          <section className="w-full overflow-hidden rounded-[32px] border border-white bg-white shadow-[0_24px_80px_rgba(15,23,42,0.10)]">
            <div className="relative overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950 px-6 pb-8 pt-7 text-white">
              <div className="absolute -left-12 -top-16 h-44 w-44 rounded-full bg-emerald-400/15 blur-3xl" />
              <div className="absolute -bottom-20 -right-10 h-48 w-48 rounded-full bg-cyan-300/10 blur-3xl" />
              <div className="relative">
                <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-bold backdrop-blur">
                  <WalletCards className="h-4 w-4 text-emerald-300" />
                  هذه العملية جاهزة لك داخل سند
                </div>
                <h1 className="text-[28px] font-black leading-[1.45] tracking-tight">
                  افتح إشعار الدفع<br />وتحقق منه بأمان
                </h1>
                <p className="mt-3 max-w-md text-sm leading-7 text-slate-300">
                  شارك معك أحدهم رابط عملية مالية عبر سند. سجّل الدخول لعرض التفاصيل، مراجعة الإشعار، وتسجيل تحققك دون تبادل الهاتف.
                </p>
              </div>
            </div>

            <div className="space-y-6 px-5 py-6 sm:px-7">
              <div className="grid grid-cols-3 gap-2.5">
                <Benefit icon={<FileSearch className="h-5 w-5" />} label="عرض الإشعار" />
                <Benefit icon={<QrCode className="h-5 w-5" />} label="تحقق موثق" />
                <Benefit icon={<LockKeyhole className="h-5 w-5" />} label="خصوصية وأمان" />
              </div>

              <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4 text-xs leading-6 text-emerald-950">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                  <p>
                    يحصل الحساب الجديد على <strong>30 عملية وصول مجانية لمرة واحدة</strong>. لا يُحتسب فتح الرابط إلا عند الوصول إلى عملية جديدة، وإعادة فتح العملية نفسها لا تخصم وصولًا إضافيًا.
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                <button
                  type="button"
                  onClick={handleInstall}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 py-4 text-sm font-black text-white shadow-lg shadow-emerald-600/20 transition hover:bg-emerald-700 active:scale-[0.99]"
                >
                  {installed ? <LogIn className="h-5 w-5" /> : <Download className="h-5 w-5" />}
                  {installed ? 'الدخول إلى سند ومتابعة العملية' : 'تثبيت سند ومتابعة العملية'}
                </button>

                <button
                  type="button"
                  onClick={() => setView('auth')}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-sm font-bold text-slate-800 transition hover:bg-slate-50"
                >
                  <Smartphone className="h-5 w-5 text-slate-500" />
                  المتابعة من المتصفح
                </button>
              </div>

              {showInstallHelp ? (
                <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4 text-xs leading-6 text-amber-900">
                  من قائمة المتصفح اختر <strong>تثبيت التطبيق</strong> أو <strong>إضافة إلى الشاشة الرئيسية</strong>، ثم عد إلى هذا الرابط. يمكنك أيضًا المتابعة الآن من المتصفح دون فقدان العملية.
                </div>
              ) : null}

              <p className="text-center text-[11px] leading-5 text-slate-400">
                لن نعرض بيانات العملية أو ملفها قبل تسجيل الدخول. سيبقى هذا الرابط محفوظًا حتى تكمل التسجيل أو الدخول.
              </p>
            </div>
          </section>
        ) : null}

        {view === 'auth' ? (
          <section className="w-full">
            <button
              type="button"
              onClick={() => setView('welcome')}
              className="mb-3 flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold text-slate-600 hover:bg-white"
            >
              <ArrowLeft className="h-4 w-4 rotate-180" />
              العودة لصفحة العملية
            </button>
            <div className="rounded-[30px] border border-white bg-white p-1 shadow-[0_24px_80px_rgba(15,23,42,0.10)]">
              <div className="mb-1 rounded-2xl bg-emerald-50 px-4 py-3 text-center text-xs font-bold text-emerald-900">
                بعد الدخول أو إنشاء الحساب ستعود تلقائيًا إلى العملية نفسها.
              </div>
              <Auth onAuthSuccess={handleAuthSuccess} />
            </div>
          </section>
        ) : null}

        {view === 'paywall' ? (
          <section className="w-full overflow-hidden rounded-[32px] border border-white bg-white shadow-[0_24px_80px_rgba(15,23,42,0.12)]">
            <div className="bg-gradient-to-br from-slate-950 to-slate-900 px-6 py-7 text-white">
              <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-400/15 text-amber-300">
                <Sparkles className="h-6 w-6" />
              </div>
              <h1 className="text-2xl font-black leading-10">استكملت رصيد الوصول المجاني</h1>
              <p className="mt-2 text-sm leading-7 text-slate-300">
                بقية سند تظل مجانية. يلزم تفعيل سند Pro فقط لمتابعة فتح عمليات مالية جديدة والتحقق منها.
              </p>
            </div>

            <div className="space-y-5 px-5 py-6 sm:px-7">
              <div className="grid grid-cols-3 gap-2.5 text-center">
                <Metric label="المستخدم" value={formatNumber(usage?.used)} />
                <Metric label="المتاح" value={formatNumber(usage?.limit)} />
                <Metric label="المتبقي" value={formatNumber(usage?.remaining)} />
              </div>

              <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 text-sm leading-7 text-slate-700">
                <p className="font-black text-slate-900">{usage?.plan?.name || 'سند Pro'}</p>
                <p>
                  {formatNumber(usage?.plan?.access_limit || usage?.limit)} عملية وصول خلال {formatNumber(usage?.plan?.duration_days || 30)} يومًا
                </p>
                {Number(usage?.plan?.price || 0) > 0 ? (
                  <p className="mt-1 font-bold text-emerald-700">{formatPrice(usage?.plan?.price, usage?.plan?.currency)}</p>
                ) : null}
              </div>

              <button
                type="button"
                onClick={() => setShowUpgrade(true)}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 py-4 text-sm font-black text-white shadow-lg shadow-emerald-600/20 hover:bg-emerald-700"
              >
                <UserPlus className="h-5 w-5" />
                تفعيل سند Pro ومتابعة العملية
              </button>

              <button
                type="button"
                onClick={() => { window.location.href = '/'; }}
                className="w-full rounded-2xl border border-slate-200 px-4 py-3.5 text-sm font-bold text-slate-700 hover:bg-slate-50"
              >
                متابعة استخدام سند مجانًا
              </button>

              <p className="text-center text-[11px] leading-5 text-slate-400">
                العملية الحالية محفوظة. بعد تفعيل الباقة افتح الرابط نفسه وسيكمل سند التدفق تلقائيًا.
              </p>
            </div>

            {showUpgrade && user ? (
              <ProUpgradeModal
                user={user}
                onClose={() => setShowUpgrade(false)}
                onSuccess={() => {
                  setShowUpgrade(false);
                  void checkAccess(user);
                }}
              />
            ) : null}
          </section>
        ) : null}

        {view === 'error' ? (
          <section className="w-full rounded-[30px] border border-rose-100 bg-white p-7 text-center shadow-xl">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-50 text-rose-600">
              <ShieldCheck className="h-7 w-7" />
            </div>
            <h2 className="mt-4 text-xl font-black">تعذر تجهيز رابط العملية</h2>
            <p className="mt-2 text-sm leading-7 text-slate-500">{errorMessage}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-5 w-full rounded-2xl bg-slate-900 px-4 py-3.5 text-sm font-bold text-white"
            >
              إعادة المحاولة
            </button>
          </section>
        ) : null}
      </main>
    </div>
  );
}

function LoadingCard({ label }: { label: string }) {
  return (
    <section className="w-full rounded-[30px] border border-white bg-white p-8 text-center shadow-xl">
      <Loader2 className="mx-auto h-8 w-8 animate-spin text-emerald-600" />
      <p className="mt-4 text-sm font-bold text-slate-600">{label}</p>
    </section>
  );
}

function Benefit({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex min-h-24 flex-col items-center justify-center gap-2 rounded-2xl border border-slate-100 bg-slate-50 px-2 text-center text-[11px] font-bold text-slate-700">
      <span className="text-emerald-600">{icon}</span>
      {label}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50 px-2 py-3">
      <p className="text-lg font-black text-slate-900">{value}</p>
      <p className="mt-1 text-[10px] font-bold text-slate-500">{label}</p>
    </div>
  );
}

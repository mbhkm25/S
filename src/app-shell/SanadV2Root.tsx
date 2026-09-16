import { lazy, Suspense, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { User } from '@supabase/supabase-js';
import { Loader2, UserRound } from 'lucide-react';
import Auth from '../components/Auth';
import MyOperations from '../components/MyOperations';
import UploadNotification from '../components/Upload';
import VerifyNotice from '../components/VerifyNotice';
import OperationEntryGate from '../features/operations/OperationEntryGate';
import { supabase } from '../lib/supabase';
import type { Profile } from '../types';
import AccountHome from '../domains/account/AccountHome';
import AiHome from '../domains/ai/AiHome';
import BusinessHome from '../domains/business/BusinessHome';
import FinancialAccountsPage from '../domains/financial/FinancialAccountsPage';
import FinancialHome from '../domains/financial/FinancialHome';
import FinancialOperationIntakePage from '../domains/financial/FinancialOperationIntakePage';
import PersonalAccountingPage from '../domains/financial/PersonalAccountingPage';
import AppShellV2 from './AppShellV2';
import type { SanadPrimaryDomain } from './domainNavigation';

const Reports = lazy(() => import('../components/Reports'));

type SessionState = 'loading' | 'ready' | 'signed-out' | 'error';

const UNSHELLED_PATTERNS = [
  /^\/v\//,
  /^\/b\//,
  /^\/reports\/view\//,
  /^\/platform-admin(?:\/|$)/,
  /^\/share-intake(?:\/|$)/,
  /^\/auth-action(?:\/|$)/,
  /^\/reset-password(?:\/|$)/,
];

function appBase(): string {
  const configured = import.meta.env.VITE_APP_BASE_PATH || import.meta.env.BASE_URL || '/';
  const start = configured.startsWith('/') ? configured : `/${configured}`;
  return start.endsWith('/') ? start : `${start}/`;
}

function relativePath(): string {
  const base = appBase();
  const baseWithoutSlash = base === '/' ? '' : base.slice(0, -1);
  const pathname = window.location.pathname;
  if (baseWithoutSlash && pathname.startsWith(baseWithoutSlash)) {
    const stripped = pathname.slice(baseWithoutSlash.length);
    return stripped.startsWith('/') ? stripped : `/${stripped}`;
  }
  return pathname || '/';
}

function appUrl(path: string): string {
  const clean = path.startsWith('/') ? path.slice(1) : path;
  return `${appBase()}${clean}`.replace(/\/{2,}/g, '/');
}

function domainForPath(path: string): SanadPrimaryDomain {
  if (path.startsWith('/ai')) return 'ai';
  if (path.startsWith('/business') || path.startsWith('/business-community')) return 'business';
  if (path.startsWith('/account') || path.startsWith('/profile') || path.startsWith('/notifications')) return 'account';
  return 'financial';
}

function isUnshelled(path: string): boolean {
  return UNSHELLED_PATTERNS.some((pattern) => pattern.test(path));
}

export default function SanadV2Root() {
  const [route, setRoute] = useState(() => relativePath());
  const [sessionState, setSessionState] = useState<SessionState>('loading');
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);

  const navigate = useCallback((path: string, replace = false) => {
    const destination = appUrl(path);
    if (replace) window.history.replaceState({}, '', destination);
    else window.history.pushState({}, '', destination);
    setRoute(relativePath());
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, []);

  useEffect(() => {
    const onPop = () => setRoute(relativePath());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  useEffect(() => {
    if (route === '/' || route === '') navigate('/financial', true);
  }, [route, navigate]);

  const loadProfile = useCallback(async (sessionUser: User) => {
    const { data, error } = await supabase.from('profiles').select('*').eq('id', sessionUser.id).maybeSingle();
    if (error) throw error;
    return (data || null) as Profile | null;
  }, []);

  useEffect(() => {
    let active = true;

    const accept = async (sessionUser: User) => {
      try {
        const loadedProfile = await loadProfile(sessionUser);
        if (!active) return;
        setUser(sessionUser);
        setProfile(loadedProfile);
        setSessionError(null);
        setSessionState('ready');
      } catch (error) {
        if (!active) return;
        console.error('[SANAD v2 session profile]', error);
        setUser(sessionUser);
        setProfile(null);
        setSessionError('تعذر تحميل بيانات الحساب حاليًا.');
        setSessionState('error');
      }
    };

    void supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      if (error) {
        setSessionError('تعذر تأكيد جلسة سند.');
        setSessionState('error');
        return;
      }
      if (data.session?.user) void accept(data.session.user);
      else {
        setUser(null);
        setProfile(null);
        setSessionState('signed-out');
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      if (session?.user) void accept(session.user);
      else {
        setUser(null);
        setProfile(null);
        setSessionState('signed-out');
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [loadProfile]);

  const activeDomain = useMemo(() => domainForPath(route), [route]);
  const changeDomain = useCallback((domain: SanadPrimaryDomain) => navigate(`/${domain}`), [navigate]);

  // Public/deep-link surfaces keep their established standalone semantics. Account
  // utilities such as profile and notifications intentionally stay inside AppShellV2.
  if (isUnshelled(route)) return <OperationEntryGate />;

  if (sessionState === 'loading') {
    return <div className="flex min-h-screen items-center justify-center bg-[#F7F7F5] text-slate-500" dir="rtl"><div className="text-center"><Loader2 className="mx-auto mb-3 h-7 w-7 animate-spin" /><p className="text-[12px] font-bold">جاري فتح سند…</p></div></div>;
  }

  if (sessionState === 'signed-out' || !user) {
    return <div className="min-h-screen bg-[#F7F7F5]"><Auth onAuthSuccess={(sessionUser, userProfile) => { setUser(sessionUser); setProfile(userProfile); setSessionState('ready'); }} /></div>;
  }

  if (sessionState === 'error') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F7F7F5] p-5" dir="rtl">
        <section className="w-full max-w-md rounded-[28px] border border-slate-200 bg-white p-6 text-center shadow-sm"><UserRound className="mx-auto h-7 w-7 text-slate-400" /><h1 className="mt-3 text-[16px] font-black text-slate-950">تعذر تجهيز حساب سند</h1><p className="mt-2 text-[12px] leading-6 text-slate-500">{sessionError || 'حاول مرة أخرى بعد التحقق من الاتصال.'}</p><button type="button" onClick={() => window.location.reload()} className="mt-5 rounded-2xl bg-slate-950 px-6 py-3 text-[12px] font-black text-white">إعادة المحاولة</button></section>
      </div>
    );
  }

  const requiresProfile = route === '/financial/add' || route === '/financial/reports';
  if (requiresProfile && !profile) {
    return (
      <AppShellV2 activeDomain="financial" onDomainChange={changeDomain}>
        <div className="mx-auto flex min-h-[70vh] max-w-md items-center px-4" dir="rtl"><section className="w-full rounded-[28px] border border-slate-200 bg-white p-6 text-center shadow-sm"><UserRound className="mx-auto h-7 w-7 text-slate-400" /><h1 className="mt-3 text-[16px] font-black text-slate-950">أكمل ملفك أولًا</h1><p className="mt-2 text-[12px] leading-6 text-slate-500">هذه الخدمة تحتاج بيانات ملف سند الأساسية قبل المتابعة.</p><button type="button" onClick={() => navigate('/profile')} className="mt-5 rounded-2xl bg-slate-950 px-6 py-3 text-[12px] font-black text-white">فتح الملف الشخصي</button></section></div>
      </AppShellV2>
    );
  }

  let content: ReactNode;
  let showBottomNavigation = true;

  if (route === '/financial') content = <FinancialHome onNavigate={navigate} />;
  else if (route === '/financial/accounts') content = <FinancialAccountsPage onBack={() => navigate('/financial')} />;
  else if (route === '/financial/accounting') content = <PersonalAccountingPage onBack={() => navigate('/financial')} onManageAccounts={() => navigate('/financial/accounts')} />;
  else if (route === '/financial/import') content = <FinancialOperationIntakePage onBack={() => navigate('/financial')} onManageAccounts={() => navigate('/financial/accounts')} onOpenOperation={(token) => navigate(`/v/${token}`)} />;
  else if (route === '/financial/operations') content = <MyOperations onNavigateToDetails={(token) => navigate(`/v/${token}`)} />;
  else if (route === '/financial/verify') {
    showBottomNavigation = false;
    content = <VerifyNotice onNavigateToDetails={(token) => navigate(`/v/${token}`)} />;
  } else if (route === '/financial/add' && profile) {
    showBottomNavigation = false;
    content = <UploadNotification user={user} profile={profile} onNavigateToDetails={(token) => navigate(`/v/${token}`)} onNavigate={(page) => {
      if (page === 'my-operations') navigate('/financial/operations');
      else if (page === 'verify-notice' || page === 'scan-qr') navigate('/financial/verify');
      else navigate('/financial');
    }} />;
  } else if (route === '/financial/reports' && profile) content = <Suspense fallback={<RouteLoader />}><Reports profile={profile} standalone /></Suspense>;
  else if (route === '/business') content = <BusinessHome onNavigate={navigate} />;
  else if (route === '/ai') content = <AiHome onNavigate={navigate} />;
  else if (route === '/account') content = <AccountHome user={user} profile={profile} onNavigate={navigate} onSignOut={() => void supabase.auth.signOut()} />;
  else if (route.startsWith('/financial/')) content = <FinancialHome onNavigate={navigate} />;
  else if (route.startsWith('/business') || route.startsWith('/profile') || route.startsWith('/notifications')) content = <OperationEntryGate />;
  else content = <OperationEntryGate />;

  return <AppShellV2 activeDomain={activeDomain} onDomainChange={changeDomain} showBottomNavigation={showBottomNavigation}>{content}</AppShellV2>;
}

function RouteLoader() {
  return <div className="flex min-h-[50vh] items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-slate-400" /></div>;
}

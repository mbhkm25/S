import { lazy, Suspense, useEffect, useState, type FormEvent } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import type { Session } from '@supabase/supabase-js';
import { ArrowLeft, Loader2, LockKeyhole, Mail, ShieldCheck } from 'lucide-react';
import { supabase } from '../../src/lib/supabase';
import { getPublicAppUrl } from '../../src/lib/urlUtils';

const PlatformAdmin = lazy(() => import('../../src/components/admin/PlatformAdmin'));

function FullPageLoader() {
  return <div className="flex min-h-screen items-center justify-center bg-slate-950 text-white"><Loader2 className="h-7 w-7 animate-spin" /></div>;
}

export default function AdminApp() {
  const reduceMotion = useReducedMotion();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [signingIn, setSigningIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setLoading(false);
    }).catch(() => {
      if (active) setLoading(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (active) {
        setSession(nextSession);
        setLoading(false);
      }
    });
    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const returnToApp = (page = 'profile') => {
    const suffix = page === 'profile' ? '/profile' : '/';
    window.location.assign(`${getPublicAppUrl()}${suffix}`);
  };

  const signIn = async (event: FormEvent) => {
    event.preventDefault();
    if (!email.trim() || !password) return;
    setSigningIn(true);
    setAuthError(null);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) throw error;
    } catch {
      setAuthError('تعذر تسجيل الدخول. تحقق من البريد وكلمة المرور وصلاحية حساب الإدارة.');
    } finally {
      setSigningIn(false);
    }
  };

  if (loading) return <FullPageLoader />;

  if (!session) return <main className="flex min-h-screen items-center justify-center bg-slate-950 p-5 font-arabic" dir="rtl">
    <motion.section
      initial={reduceMotion ? false : { opacity: 0, y: 20, scale: .98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      className="w-full max-w-md rounded-[2rem] border border-white/10 bg-white p-6 shadow-2xl"
    >
      <div className="text-center">
        <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-emerald-50 text-emerald-700"><ShieldCheck className="h-8 w-8" /></span>
        <h1 className="mt-5 text-xl font-bold text-slate-950">إدارة سند</h1>
        <p className="mt-2 text-xs leading-6 text-slate-500">تسجيل دخول مستقل للوحة الإدارة. لا يمكن إنشاء حساب جديد من هذا النطاق.</p>
      </div>
      <form onSubmit={signIn} className="mt-6 space-y-3">
        <label className="block space-y-1 text-[10px] font-bold text-slate-600">البريد الإلكتروني<div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3"><Mail className="h-4 w-4 text-slate-400"/><input type="email" value={email} onChange={event=>setEmail(event.target.value)} autoComplete="username" className="min-h-12 min-w-0 flex-1 bg-transparent text-xs outline-none" required /></div></label>
        <label className="block space-y-1 text-[10px] font-bold text-slate-600">كلمة المرور<div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3"><LockKeyhole className="h-4 w-4 text-slate-400"/><input type="password" value={password} onChange={event=>setPassword(event.target.value)} autoComplete="current-password" className="min-h-12 min-w-0 flex-1 bg-transparent text-xs outline-none" required /></div></label>
        {authError&&<p className="rounded-xl bg-rose-50 p-3 text-[10px] leading-5 text-rose-700">{authError}</p>}
        <button disabled={signingIn} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 text-xs font-bold text-white disabled:bg-slate-400">{signingIn?<Loader2 className="h-4 w-4 animate-spin"/>:<ShieldCheck className="h-4 w-4"/>}دخول لوحة الإدارة</button>
      </form>
      <button type="button" onClick={()=>returnToApp('profile')} className="mt-4 flex min-h-11 w-full items-center justify-center gap-2 text-[10px] font-bold text-slate-500"><ArrowLeft className="h-4 w-4"/>العودة إلى تطبيق سند</button>
    </motion.section>
  </main>;

  return <div className="min-h-screen bg-slate-50 font-arabic" dir="rtl">
    <Suspense fallback={<FullPageLoader />}>
      <PlatformAdmin onNavigate={returnToApp} />
    </Suspense>
  </div>;
}

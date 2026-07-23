import { motion, useReducedMotion } from 'motion/react';
import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { ArrowLeft, Loader2, ShieldCheck } from 'lucide-react';
import PlatformAdmin from '../../src/components/admin/PlatformAdmin';
import { supabase } from '../../src/lib/supabase';
import { getPublicAppUrl } from '../../src/lib/urlUtils';

export default function AdminApp() {
  const reduceMotion = useReducedMotion();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

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

  if (loading) return <div className="flex min-h-screen items-center justify-center bg-slate-950 text-white"><Loader2 className="h-7 w-7 animate-spin" /></div>;

  if (!session) return <main className="flex min-h-screen items-center justify-center bg-slate-950 p-5 font-arabic" dir="rtl">
    <motion.section
      initial={reduceMotion ? false : { opacity: 0, y: 20, scale: .98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      className="w-full max-w-md rounded-[2rem] border border-white/10 bg-white p-6 text-center shadow-2xl"
    >
      <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-emerald-50 text-emerald-700"><ShieldCheck className="h-8 w-8" /></span>
      <h1 className="mt-5 text-xl font-bold text-slate-950">إدارة سند</h1>
      <p className="mt-2 text-xs leading-6 text-slate-500">سجّل الدخول أولًا من تطبيق سند، ثم عد إلى لوحة الإدارة المحمية.</p>
      <button type="button" onClick={()=>returnToApp('profile')} className="mt-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 text-xs font-bold text-white"><ArrowLeft className="h-4 w-4"/>الانتقال إلى تسجيل الدخول</button>
    </motion.section>
  </main>;

  return <div className="min-h-screen bg-slate-50 font-arabic" dir="rtl">
    <PlatformAdmin onNavigate={returnToApp} />
  </div>;
}

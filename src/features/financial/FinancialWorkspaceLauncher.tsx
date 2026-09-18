import { useEffect, useState } from 'react';
import { Grid2X2Plus } from 'lucide-react';
import { supabase } from '../../lib/supabase';

function basePath(): string {
  const value = import.meta.env.VITE_APP_BASE_PATH || '/';
  return value.endsWith('/') ? value : `${value}/`;
}

function isHomePath(): boolean {
  const base = basePath();
  const pathname = window.location.pathname;
  return pathname === base || pathname === base.replace(/\/$/, '') || pathname === '/';
}

export default function FinancialWorkspaceLauncher() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let active = true;
    if (!isHomePath()) return;

    void supabase.auth.getSession().then(({ data }) => {
      if (active) setVisible(Boolean(data.session?.user));
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) setVisible(Boolean(session?.user) && isHomePath());
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  if (!visible) return null;

  return (
    <button
      type="button"
      onClick={() => window.location.assign(`${basePath()}financial`)}
      className="fixed bottom-[78px] left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 rounded-full border border-slate-200/80 bg-white/95 px-4 py-2.5 text-[10px] font-black text-slate-800 shadow-[0_12px_32px_rgba(15,23,42,0.14)] backdrop-blur-md active:scale-[0.98]"
      aria-label="فتح مساحات سند"
    >
      <Grid2X2Plus className="h-4 w-4 text-emerald-700" />
      مساحات سند
    </button>
  );
}

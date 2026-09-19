import { useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import type { Profile } from '../types';

interface HomeProps {
  profile: Profile | null;
  onNavigate: (page: string, token?: string) => void;
}

function financialUrl(): string {
  const base = import.meta.env.VITE_APP_BASE_PATH || '/';
  const cleanBase = base.endsWith('/') ? base : `${base}/`;
  return `${cleanBase}financial`;
}

/**
 * The authenticated root is intentionally not a fifth SANAD workspace.
 * It only hands the user into the four-domain product architecture.
 */
export default function Home({ profile: _profile, onNavigate: _onNavigate }: HomeProps) {
  useEffect(() => {
    window.location.replace(financialUrl());
  }, []);

  return (
    <div dir="rtl" className="flex min-h-[52vh] items-center justify-center font-arabic">
      <div className="text-center">
        <Loader2 className="mx-auto h-7 w-7 animate-spin text-emerald-700" />
        <p className="mt-3 text-xs font-bold text-slate-600">جاري فتح سند المالي...</p>
        <p className="mt-1 text-[10px] text-slate-400">الأقسام الأربعة هي واجهة سند الرئيسية.</p>
      </div>
    </div>
  );
}

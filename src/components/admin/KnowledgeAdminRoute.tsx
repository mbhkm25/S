import { useEffect, useState } from 'react';
import { ArrowRight, BookOpen } from 'lucide-react';
import KnowledgeAdminSection from './KnowledgeAdminSection';

function cleanPath(): string {
  return window.location.pathname.replace(/\/+$/, '');
}

function isPlatformAdminPath(path: string): boolean {
  return path.endsWith('/platform-admin') || path.includes('/platform-admin/');
}

function isKnowledgePath(path: string): boolean {
  return path.endsWith('/platform-admin/knowledge');
}

function platformAdminUrl(): string {
  const base = import.meta.env.VITE_APP_BASE_PATH || '/';
  const cleanBase = base.endsWith('/') ? base : `${base}/`;
  return `${cleanBase}platform-admin`;
}

function knowledgeUrl(): string {
  return `${platformAdminUrl()}/knowledge`;
}

export default function KnowledgeAdminRoute() {
  const [path, setPath] = useState(cleanPath);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    const sync = () => setPath(cleanPath());
    window.addEventListener('popstate', sync);
    const originalPush = window.history.pushState.bind(window.history);
    const originalReplace = window.history.replaceState.bind(window.history);
    window.history.pushState = ((...args: Parameters<History['pushState']>) => {
      originalPush(...args);
      sync();
    }) as History['pushState'];
    window.history.replaceState = ((...args: Parameters<History['replaceState']>) => {
      originalReplace(...args);
      sync();
    }) as History['replaceState'];

    return () => {
      window.removeEventListener('popstate', sync);
      window.history.pushState = originalPush;
      window.history.replaceState = originalReplace;
    };
  }, []);

  const openKnowledge = () => {
    window.history.pushState({}, '', knowledgeUrl());
    setPath(cleanPath());
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const closeKnowledge = () => {
    window.history.pushState({}, '', platformAdminUrl());
    setPath(cleanPath());
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (!isPlatformAdminPath(path)) return null;

  if (!isKnowledgePath(path)) {
    return (
      <button
        type="button"
        onClick={openKnowledge}
        className="fixed bottom-24 left-4 z-[70] flex min-h-12 items-center gap-2 rounded-2xl bg-emerald-600 px-4 text-xs font-bold text-white shadow-xl shadow-emerald-900/20 sm:bottom-6"
        aria-label="فتح إدارة المعرفة"
      >
        <BookOpen className="h-4 w-4" />
        إدارة المعرفة
      </button>
    );
  }

  return (
    <div dir="rtl" className="fixed inset-0 z-[85] overflow-y-auto bg-[#f7f8fa]">
      <div className="mx-auto min-h-screen w-full max-w-2xl px-4 pb-12 pt-4 sm:px-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={closeKnowledge}
            className="flex min-h-11 items-center gap-2 rounded-xl bg-white px-4 text-xs font-bold text-slate-700 shadow-sm"
          >
            <ArrowRight className="h-4 w-4" />
            العودة إلى إدارة سند
          </button>
          <div className="text-left">
            <p className="text-[9px] font-bold text-emerald-700">SKMS</p>
            <p className="text-[10px] text-slate-400">مصادر مساعد سند الرسمية</p>
          </div>
        </div>

        {error && (
          <button type="button" onClick={() => setError(null)} className="mb-3 w-full rounded-xl bg-rose-50 p-3 text-right text-xs font-bold text-rose-700">
            {error}
          </button>
        )}
        {success && (
          <button type="button" onClick={() => setSuccess(null)} className="mb-3 w-full rounded-xl bg-emerald-50 p-3 text-right text-xs font-bold text-emerald-700">
            {success}
          </button>
        )}

        <KnowledgeAdminSection setError={setError} setSuccess={setSuccess} />
      </div>
    </div>
  );
}

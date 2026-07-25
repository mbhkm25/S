import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowRight, BookOpen, Loader2, ShieldAlert } from 'lucide-react';
import { getPlatformAdminAccess } from '../../lib/platformAdminApi';
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
  const [accessState, setAccessState] = useState<'idle' | 'checking' | 'allowed' | 'denied'>('idle');
  const [tabBar, setTabBar] = useState<Element | null>(null);

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

  useEffect(() => {
    if (!isPlatformAdminPath(path) || isKnowledgePath(path)) {
      setTabBar(null);
      return;
    }
    const findBar = () => {
      const bars = Array.from(document.querySelectorAll('.platform-admin-console .no-scrollbar'));
      setTabBar(bars.find((element) => element.querySelector('button')) || null);
    };
    findBar();
    const observer = new MutationObserver(findBar);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [path]);

  useEffect(() => {
    if (!isPlatformAdminPath(path)) {
      setAccessState('idle');
      return;
    }

    let active = true;
    setAccessState('checking');
    void getPlatformAdminAccess()
      .then((result) => {
        if (active) setAccessState(result.allowed ? 'allowed' : 'denied');
      })
      .catch(() => {
        if (active) setAccessState('denied');
      });

    return () => { active = false; };
  }, [path]);

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
  if (accessState === 'checking' || accessState === 'idle') {
    return isKnowledgePath(path) ? (
      <div className="fixed inset-0 z-[85] flex items-center justify-center bg-[#f7f8fa]">
        <Loader2 className="h-7 w-7 animate-spin text-slate-400" />
      </div>
    ) : null;
  }

  if (accessState === 'denied') {
    return isKnowledgePath(path) ? (
      <div dir="rtl" className="fixed inset-0 z-[85] flex items-center justify-center bg-[#f7f8fa] p-5">
        <div className="w-full max-w-sm rounded-[1.8rem] bg-white p-6 text-center shadow-xl">
          <ShieldAlert className="mx-auto h-10 w-10 text-rose-400" />
          <h2 className="mt-4 text-base font-bold text-slate-900">إدارة المعرفة محمية</h2>
          <p className="mt-2 text-xs leading-6 text-slate-500">هذا الحساب لا يملك صلاحية مدير منصة سند.</p>
          <button type="button" onClick={closeKnowledge} className="mt-5 min-h-11 w-full rounded-xl bg-slate-950 text-xs font-bold text-white">العودة</button>
        </div>
      </div>
    ) : null;
  }

  if (!isKnowledgePath(path)) {
    return tabBar ? createPortal(
      <button
        type="button"
        onClick={openKnowledge}
        className="flex min-h-11 shrink-0 items-center gap-2 rounded-xl bg-white px-3 text-[11px] font-bold text-slate-500 shadow-sm"
        aria-label="فتح إدارة المعرفة"
      >
        <BookOpen className="h-4 w-4" />
        إدارة المعرفة
      </button>,
      tabBar
    ) : null;
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

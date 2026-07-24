import { useEffect, useState } from 'react';
import type { ComponentProps } from 'react';
import { Power } from 'lucide-react';
import MyBusinessRelationshipsOverview from './business/MyBusinessRelationshipsOverview';
import ProfileV2 from './ProfileV2';

type Props = ComponentProps<typeof ProfileV2>;

function currentView(): 'overview' | 'relationships' | 'other' {
  const path = window.location.pathname.replace(/\/+$/, '');
  if (path.endsWith('/profile/relationships')) return 'relationships';
  if (path.endsWith('/profile') || path === 'profile') return 'overview';
  return 'other';
}

export default function Profile(props: Props) {
  const [view, setView] = useState(currentView);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    const sync = () => setView(currentView());
    const originalPush = window.history.pushState.bind(window.history);
    const originalReplace = window.history.replaceState.bind(window.history);
    window.history.pushState = ((...args: Parameters<History['pushState']>) => { originalPush(...args); sync(); }) as History['pushState'];
    window.history.replaceState = ((...args: Parameters<History['replaceState']>) => { originalReplace(...args); sync(); }) as History['replaceState'];
    window.addEventListener('popstate', sync);
    return () => {
      window.history.pushState = originalPush;
      window.history.replaceState = originalReplace;
      window.removeEventListener('popstate', sync);
    };
  }, []);

  useEffect(() => {
    const rows = Array.from(document.querySelectorAll<HTMLButtonElement>('#profile_view button'));
    rows.forEach((row) => {
      const title = row.querySelector('span.block.text-sm.font-bold')?.textContent?.trim();
      if (title === 'البيانات الشخصية') row.style.display = view === 'overview' ? 'none' : '';
    });
  }, [view]);

  const openRelationships = () => {
    const base = import.meta.env.VITE_APP_BASE_PATH || '/';
    const cleanBase = base.endsWith('/') ? base : `${base}/`;
    window.history.pushState({}, '', `${cleanBase}profile/relationships`);
    setView('relationships');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const backToProfile = () => {
    const base = import.meta.env.VITE_APP_BASE_PATH || '/';
    const cleanBase = base.endsWith('/') ? base : `${base}/`;
    window.history.pushState({}, '', `${cleanBase}profile`);
    setView('overview');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const logout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try { await props.onLogout(); } finally { setLoggingOut(false); }
  };

  if (view === 'relationships') {
    return <MyBusinessRelationshipsOverview mode="page" onNavigate={props.onNavigate} onBack={backToProfile} />;
  }

  return (
    <div className={view === 'overview' ? 'profile-overview-shell' : undefined}>
      <ProfileV2 {...props} />
      {view === 'overview' && (
        <div className="mt-5 space-y-4">
          <MyBusinessRelationshipsOverview mode="summary" onNavigate={props.onNavigate} onBack={openRelationships} />
          <button type="button" disabled={loggingOut} onClick={() => void logout()} className="flex min-h-14 w-full items-center justify-center gap-3 rounded-[1.4rem] bg-rose-50 text-sm font-bold text-rose-600 disabled:opacity-50">
            <Power className="h-5 w-5" />{loggingOut ? 'جاري تسجيل الخروج...' : 'تسجيل الخروج'}
          </button>
        </div>
      )}
      {view === 'overview' && <style>{`.profile-overview-shell #profile_view > div > button.bg-rose-50 { display: none !important; }`}</style>}
    </div>
  );
}

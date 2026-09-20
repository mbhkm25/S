import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import FinancialActionRoute from './FinancialActionRoute';
import FinancialWorkspaceRoute from './FinancialWorkspaceRoute';
import PersonalFinanceSectionRoute from './PersonalFinanceSectionRoute';
import ProductBottomNav from '../../components/navigation/ProductBottomNav';
import ProductAppHeader from '../../components/navigation/ProductAppHeader';
import { NotificationProvider } from '../notifications/NotificationProvider';

function basePath(): string {
  const value = import.meta.env.VITE_APP_BASE_PATH || '/';
  return value.endsWith('/') ? value : `${value}/`;
}

export default function FinancialWorkspaceShell() {
  const pathname = window.location.pathname;
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (active) setUserId(data.session?.user?.id || null);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) setUserId(session?.user?.id || null);
    });
    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const isActionRoute = /\/(financial|commercial)\/actions\/?$/.test(pathname);
  const isPersonalSectionRoute = /\/financial\/(accounts|transactions|obligations|budgets|goals|parties)\/?$/.test(pathname);
  const personal = /\/financial(?:\/|$)/.test(pathname);
  const commercial = /\/commercial(?:\/|$)/.test(pathname);
  const assistant = /\/sanad-ai\/?$/.test(pathname);

  const content = isActionRoute
    ? <FinancialActionRoute />
    : isPersonalSectionRoute
      ? <PersonalFinanceSectionRoute />
      : <FinancialWorkspaceRoute />;

  return (
    <NotificationProvider userId={userId} isAuthenticated={Boolean(userId)}>
      <div className="min-h-screen bg-[#F8F8F6] text-slate-900">
        <ProductAppHeader userId={userId} />
        {content}
        <ProductBottomNav activeArea={assistant ? 'assistant' : personal ? 'financial' : commercial ? 'business' : 'account'} />
        {!isActionRoute && (personal || commercial) ? (
          <button
            type="button"
            onClick={() => window.location.assign(`${basePath()}${commercial ? 'commercial' : 'financial'}/actions`)}
            className="fixed bottom-[86px] left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 rounded-full bg-slate-950 px-5 py-3 text-[11px] font-black text-white shadow-[0_18px_45px_rgba(15,23,42,0.25)] active:scale-[0.98] lg:bottom-6 lg:left-1/2"
            aria-label={commercial ? 'فتح إجراءات سند التجاري' : 'فتح إجراءات سند المالي'}
          >
            <Plus className="h-4 w-4" />
            {commercial ? 'إجراء تجاري جديد' : 'إجراء مالي جديد'}
          </button>
        ) : null}
      </div>
    </NotificationProvider>
  );
}

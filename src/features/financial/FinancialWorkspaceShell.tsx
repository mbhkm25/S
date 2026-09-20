import { lazy, Suspense, useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import ProductBottomNav from '../../components/navigation/ProductBottomNav';
import ProductAppHeader from '../../components/navigation/ProductAppHeader';
import { navigateProduct, subscribeProductNavigation } from '../../lib/productNavigation';
import { NotificationProvider } from '../notifications/NotificationProvider';
import {
  loadFinancialActionRoute,
  loadFinancialWorkspaceRoute,
  loadPersonalFinanceSectionRoute,
} from './productRouteLoaders';

const FinancialActionRoute = lazy(loadFinancialActionRoute);
const FinancialWorkspaceRoute = lazy(loadFinancialWorkspaceRoute);
const PersonalFinanceSectionRoute = lazy(loadPersonalFinanceSectionRoute);

function locationKey(): string {
  return `${window.location.pathname}${window.location.search}`;
}

function RouteFallback() {
  return (
    <div className="mx-auto flex min-h-[45vh] w-full max-w-[1440px] items-center justify-center px-4 text-xs text-slate-400" aria-busy="true">
      جارٍ فتح المساحة…
    </div>
  );
}

export default function FinancialWorkspaceShell() {
  const [routeKey, setRouteKey] = useState(locationKey);
  const [userId, setUserId] = useState<string | null>(null);
  const pathname = routeKey.split('?')[0];

  useEffect(() => subscribeProductNavigation(() => setRouteKey(locationKey())), []);

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
    ? <FinancialActionRoute key={routeKey} />
    : isPersonalSectionRoute
      ? <PersonalFinanceSectionRoute key={routeKey} />
      : <FinancialWorkspaceRoute key={routeKey} />;

  return (
    <NotificationProvider userId={userId} isAuthenticated={Boolean(userId)}>
      <div className="min-h-screen bg-[#F8F8F6] text-slate-900">
        <ProductAppHeader userId={userId} />
        <Suspense fallback={<RouteFallback />}>
          {content}
        </Suspense>
        <ProductBottomNav activeArea={assistant ? 'assistant' : personal ? 'financial' : commercial ? 'business' : 'account'} />
        {!isActionRoute && (personal || commercial) ? (
          <button
            type="button"
            onClick={() => navigateProduct(`${commercial ? 'commercial' : 'financial'}/actions`)}
            onPointerEnter={() => void loadFinancialActionRoute()}
            onFocus={() => void loadFinancialActionRoute()}
            className="fixed bottom-[86px] left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 rounded-full bg-slate-950 px-5 py-3 text-[13px] font-medium text-white shadow-[0_14px_36px_rgba(15,23,42,0.20)] transition active:scale-[0.98] lg:bottom-6 lg:left-1/2"
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

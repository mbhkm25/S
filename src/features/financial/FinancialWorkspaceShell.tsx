import { lazy, Suspense, useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import ProductBottomNav from '../../components/navigation/ProductBottomNav';
import ProductAppHeader from '../../components/navigation/ProductAppHeader';
import UnifiedProductSidebar from '../../components/navigation/UnifiedProductSidebar';
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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try { return window.localStorage.getItem('sanad:unified-sidebar:collapsed:v1') === '1'; } catch { return false; }
  });
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

  useEffect(() => {
    try {
      window.localStorage.setItem('sanad:unified-sidebar:collapsed:v1', sidebarCollapsed ? '1' : '0');
    } catch {
      // Sidebar preference is local-only and must never block the workspace.
    }
  }, [sidebarCollapsed]);

  const isActionRoute = /\/(financial|commercial)\/actions\/?$/.test(pathname);
  const isPersonalSectionRoute = /\/financial\/(accounts|transactions|obligations|budgets|goals|parties)\/?$/.test(pathname);
  const personal = /\/financial(?:\/|$)/.test(pathname);
  const commercial = /\/commercial(?:\/|$)/.test(pathname);
  const assistant = /\/sanad-ai\/?$/.test(pathname);
  const activeArea = assistant ? 'assistant' : personal ? 'financial' : commercial ? 'business' : 'account';

  const content = isActionRoute
    ? <FinancialActionRoute key={routeKey} />
    : isPersonalSectionRoute
      ? <PersonalFinanceSectionRoute key={routeKey} />
      : <FinancialWorkspaceRoute key={routeKey} />;

  return (
    <NotificationProvider userId={userId} isAuthenticated={Boolean(userId)}>
      <div
        data-workspace-mode={assistant ? 'viewport' : 'document'}
        data-product-area={activeArea}
        data-shell-model="unified-sidebar-v1"
        dir="rtl"
        className={assistant
          ? 'sanad-canvas flex h-dvh min-h-0 overflow-hidden'
          : 'sanad-canvas flex min-h-screen'}
      >
        <UnifiedProductSidebar
          activeArea={activeArea}
          collapsed={sidebarCollapsed}
          onCollapsedChange={setSidebarCollapsed}
        />

        <div className={assistant
          ? 'flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden'
          : 'min-w-0 flex-1'}
        >
          <ProductAppHeader userId={userId} />

          {assistant ? (
            <div
              data-workspace-body="viewport"
              className="relative min-h-0 flex-1 overflow-hidden pt-1.5"
            >
              <Suspense fallback={<RouteFallback />}>
                {content}
              </Suspense>
            </div>
          ) : (
            <Suspense fallback={<RouteFallback />}>
              {content}
            </Suspense>
          )}

          <ProductBottomNav
            activeArea={activeArea}
            layoutMode={assistant ? 'viewport' : 'document'}
          />

          {!isActionRoute && (personal || commercial) ? (
            <button
              type="button"
              onClick={() => navigateProduct(`${commercial ? 'commercial' : 'financial'}/actions`)}
              onPointerEnter={() => void loadFinancialActionRoute()}
              onFocus={() => void loadFinancialActionRoute()}
              className="sanad-focus-ring fixed bottom-[calc(var(--sanad-mobile-nav-stack-height)+0.75rem)] left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 rounded-full bg-[var(--sanad-surface-inverse)] px-5 py-3 text-[13px] font-medium text-white shadow-[var(--sanad-shadow-3)] transition active:scale-[0.98] lg:bottom-6"
              aria-label={commercial ? 'فتح إجراءات سند التجاري' : 'فتح إجراءات سند المالي'}
            >
              <Plus className="h-4 w-4" />
              {commercial ? 'إجراء تجاري جديد' : 'إجراء مالي جديد'}
            </button>
          ) : null}
        </div>
      </div>
    </NotificationProvider>
  );
}

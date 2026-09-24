import { lazy, Suspense, useEffect, useState } from 'react';
import { Menu, Plus } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import SanadUnifiedSidebar from '../../components/navigation/SanadUnifiedSidebar';
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
const SanadUnifiedEntryRoute = lazy(() => import('../shell/SanadUnifiedEntryRoute'));
const BusinessCapabilityRoute = lazy(() => import('../shell/BusinessCapabilityRoute'));

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
  const [navigationOpen, setNavigationOpen] = useState(false);
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
  const isUnifiedEntryRoute = /\/(today|library|connections|work\/(?:tasks|approvals|automations))\/?$/.test(pathname);
  const isBusinessCapabilityRoute = /\/business\/manage(?:\/(?:operations|team|profile|whatsapp-catalog|customers))?\/?$/.test(pathname);

  const content = isBusinessCapabilityRoute
    ? <BusinessCapabilityRoute key={routeKey} />
    : isUnifiedEntryRoute
      ? <SanadUnifiedEntryRoute key={routeKey} />
      : isActionRoute
    ? <FinancialActionRoute key={routeKey} />
    : isPersonalSectionRoute
        ? <PersonalFinanceSectionRoute key={routeKey} />
        : <FinancialWorkspaceRoute key={routeKey} />;

  return (
    <NotificationProvider userId={userId} isAuthenticated={Boolean(userId)}>
      <div
        data-workspace-mode={assistant ? 'viewport' : 'document'}
        data-product-area={assistant ? 'assistant' : personal ? 'financial' : commercial || isBusinessCapabilityRoute ? 'business' : 'account'}
        data-sanad-persistent-shell="true"
        className={assistant
          ? 'sanad-canvas relative flex h-dvh min-h-0 overflow-hidden'
          : 'sanad-canvas relative flex min-h-screen items-stretch'}
        dir="rtl"
      >
        <SanadUnifiedSidebar
          userId={userId}
          mobileOpen={navigationOpen}
          onCloseMobile={() => setNavigationOpen(false)}
          viewportMode={assistant}
        />
        <div
          data-sanad-main-column="true"
          className={assistant
            ? 'flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden'
            : 'flex min-h-screen min-w-0 flex-1 flex-col'}
        >
          <div data-sanad-mobile-menu-slot="true" className="flex h-11 shrink-0 items-center justify-start border-b border-[var(--sanad-border-subtle)] bg-[var(--sanad-bg-canvas)] px-3 lg:hidden">
            <button
              type="button"
              onClick={() => setNavigationOpen(true)}
              aria-label="فتح تنقل سند"
              className="sanad-focus-ring flex h-9 w-9 items-center justify-center rounded-[var(--sanad-radius-md)] text-[var(--sanad-text-strong)] hover:bg-[var(--sanad-nav-hover-bg)]"
            >
              <Menu className="h-5 w-5" />
            </button>
          </div>
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
            <main data-unified-shell-body="true" className="relative min-w-0 flex-1">
              <Suspense fallback={<RouteFallback />}>
                {content}
              </Suspense>
            </main>
          )}
          {!isActionRoute && (personal || commercial) ? (
            <button
              type="button"
              onClick={() => navigateProduct(`${commercial ? 'commercial' : 'financial'}/actions`)}
              onPointerEnter={() => void loadFinancialActionRoute()}
              onFocus={() => void loadFinancialActionRoute()}
              className="sanad-focus-ring fixed bottom-6 left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 rounded-full bg-[var(--sanad-surface-inverse)] px-5 py-3 text-[13px] font-medium text-white shadow-[var(--sanad-shadow-3)] transition active:scale-[0.98] lg:bottom-6 lg:left-1/2"
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

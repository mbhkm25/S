import { lazy, Suspense, useEffect, useState } from 'react';
import { Menu, Plus } from 'lucide-react';
import { supabase } from '../../lib/supabase';
// The global sidebar owns participant-aware history and account utilities.
 // Keep it out of the shell's critical entry chunk; Suspense reserves its geometry.
const SanadUnifiedSidebar = lazy(() => import('../../components/navigation/SanadUnifiedSidebar'));
import { navigateProduct, subscribeProductNavigation } from '../../lib/productNavigation';
import { NotificationProvider } from '../notifications/NotificationProvider';
import { SanadAssistantSettingsProvider } from '../shell/SanadAssistantSettingsContext';
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
const SanadProjectWorkspaceRoute = lazy(() => import('../shell/SanadProjectWorkspaceRoute'));

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

  const isProjectRoute = /\\/(financial|commercial)\\/?$/.test(pathname);
  const isActionRoute = /\\/(financial|commercial)\\/actions\\/?$/.test(pathname);
  const isPersonalSectionRoute = /\/financial\/(accounts|transactions|obligations|budgets|goals|parties)\/?$/.test(pathname);
  const personal = /\/financial(?:\/|$)/.test(pathname);
  const commercial = /\/commercial(?:\/|$)/.test(pathname);
  const assistant = /\/sanad-ai\/?$/.test(pathname);
  const isUnifiedEntryRoute = /\\/(today|more|library|connections|work\\/(?:tasks|approvals|automations))\\/?$/.test(pathname);
  const isBusinessCapabilityRoute = /\/business\/manage(?:\/(?:operations|team|profile|whatsapp-catalog|customers))?\/?$/.test(pathname);

  useEffect(() => {
    if (assistant && !new URLSearchParams(window.location.search).has('project')
      && !new URLSearchParams(window.location.search).has('thread')) {
      navigateProduct('today', { replace: true });
    }
  }, [assistant, routeKey]);

  const content = isProjectRoute
    ? <SanadProjectWorkspaceRoute key={routeKey} kind={personal ? 'personal' : 'business'} userId={userId}/>
    : isBusinessCapabilityRoute
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
      <SanadAssistantSettingsProvider userId={userId}>
      <div
        data-workspace-mode={assistant ? 'viewport' : 'document'}
        data-product-area={assistant ? 'assistant' : personal ? 'financial' : commercial || isBusinessCapabilityRoute ? 'business' : 'account'}
        data-sanad-persistent-shell="true"
        className={assistant
          ? 'sanad-canvas relative flex h-dvh min-h-0 overflow-hidden'
          : 'sanad-canvas relative flex min-h-screen items-stretch'}
        dir="rtl"
      >
        <Suspense fallback={
          <div
            aria-hidden="true"
            className="hidden h-dvh shrink-0 border-l border-[var(--sanad-border-subtle)] bg-[var(--sanad-bg-subtle)] lg:block lg:w-[254px]"
          />
        }>
          <SanadUnifiedSidebar
            userId={userId}
            mobileOpen={navigationOpen}
            onCloseMobile={() => setNavigationOpen(false)}
            viewportMode={assistant}
          />
        </Suspense>
        <div
          data-sanad-main-column="true"
          className={assistant
            ? 'flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden'
            : 'flex min-h-screen min-w-0 flex-1 flex-col'}
        >
          <button
            type="button"
            data-sanad-mobile-menu-fab="true"
            onClick={() => setNavigationOpen(true)}
            aria-label="فتح تنقل سند"
            aria-expanded={navigationOpen}
            className="sanad-focus-ring fixed right-2 top-[calc(var(--sanad-safe-top)+0.5rem)] z-[60] flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--sanad-border)] bg-[var(--sanad-surface-1)] text-[var(--sanad-text-strong)] shadow-[var(--sanad-shadow-1)] lg:hidden"
          >
            <Menu className="h-[18px] w-[18px]" />
          </button>
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
            <main data-unified-shell-body="true" className="relative min-w-0 flex-1 max-lg:pt-10">
              <Suspense fallback={<RouteFallback />}>
                {content}
              </Suspense>
            </main>
          )}
          {!isProjectRoute && !isActionRoute && (personal || commercial) ? (
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
      </SanadAssistantSettingsProvider>
    </NotificationProvider>
  );
}

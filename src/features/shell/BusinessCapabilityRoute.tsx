import { lazy, Suspense } from 'react';
import { navigateProduct, productHref } from '../../lib/productNavigation';

const BusinessManage = lazy(() => import('../../components/business/BusinessManage'));
const BusinessOperations = lazy(() => import('../../components/business/BusinessOperations'));
const BusinessTeam = lazy(() => import('../../components/business/BusinessTeam'));
const BusinessProfileEditor = lazy(() => import('../../components/business/BusinessProfileEditor'));
const BusinessWhatsAppCatalog = lazy(() => import('../../components/business/BusinessWhatsAppCatalog'));
const BusinessCustomers = lazy(() => import('../../components/business/BusinessCustomers'));

function navigateLegacyBusiness(page: string, token?: string): void {
  const mapped: Record<string, string> = {
    'business-manage': 'business/manage',
    'business-operations': 'business/manage/operations',
    'business-team': 'business/manage/team',
    'business-manage-profile': 'business/manage/profile',
    'business-whatsapp-catalog': 'business/manage/whatsapp-catalog',
    'business-customers': 'business/manage/customers',
  };

  const target = mapped[page];
  if (target) {
    navigateProduct(target);
    return;
  }

  if (page === 'details' && token) {
    window.location.assign(productHref(`v/${token}`));
    return;
  }

  if (page === 'home') {
    navigateProduct('today');
    return;
  }

  window.location.assign(productHref(page));
}

function RouteFallback() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center text-xs text-[var(--sanad-text-subtle)]" aria-busy="true">
      جارٍ فتح مساحة الأعمال…
    </div>
  );
}

export default function BusinessCapabilityRoute() {
  const path = window.location.pathname.replace(/\/+$/, '');

  let content: React.ReactNode;
  if (path.endsWith('/business/manage/operations')) {
    content = <BusinessOperations onNavigate={navigateLegacyBusiness} />;
  } else if (path.endsWith('/business/manage/team')) {
    content = <BusinessTeam onNavigate={navigateLegacyBusiness} />;
  } else if (path.endsWith('/business/manage/profile')) {
    content = <BusinessProfileEditor onNavigate={navigateLegacyBusiness} />;
  } else if (path.endsWith('/business/manage/whatsapp-catalog')) {
    content = <BusinessWhatsAppCatalog onNavigate={navigateLegacyBusiness} />;
  } else if (path.endsWith('/business/manage/customers')) {
    content = <BusinessCustomers onNavigate={navigateLegacyBusiness} />;
  } else {
    content = <BusinessManage onNavigate={navigateLegacyBusiness} />;
  }

  return (
    <div data-sanad-business-capability-route="true" className="min-w-0 flex-1 bg-[var(--sanad-bg-canvas)]">
      <Suspense fallback={<RouteFallback />}>{content}</Suspense>
    </div>
  );
}

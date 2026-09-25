import { lazy, Suspense } from 'react';
import { navigateProduct, productHref } from '../../lib/productNavigation';
const NotificationCenter = lazy(() => import('../../components/notifications/NotificationCenter'));

/** Real existing notification center inside the same persistent SANAD shell. */
export default function SanadNotificationRoute({ userId }: { userId: string | null }) {
  const onNavigate = (page: string, token?: string) => {
    const map: Record<string, string> = {
      home: 'today',
      notifications: 'notifications',
      'business-manage': 'business/manage',
      'business-operations': 'business/manage/operations',
      'business-team': 'business/manage/team',
      'business-customers': 'business/manage/customers',
      'my-operations': 'my-operations',
      profile: 'profile',
      reports: 'reports',
    };
    if (page === 'details' && token) {
      window.location.assign(productHref(`v/${encodeURIComponent(token)}`));
      return;
    }
    if (map[page]) {
      // Unsupported legacy routes keep their existing application entrypoint.
      if (['my-operations', 'profile', 'reports'].includes(page)) {
        window.location.assign(productHref(map[page]));
      } else {
        navigateProduct(map[page]);
      }
      return;
    }
    window.location.assign(productHref(page));
  };
  return (
    <div data-sanad-notifications-in-shell="true" className="min-w-0 flex-1 bg-[var(--sanad-bg-canvas)] px-2 py-5 sm:px-6">
      <div className="mx-auto w-full max-w-[1120px]">
        <Suspense fallback={<p className="py-10 text-center text-xs text-[var(--sanad-text-muted)]">جارٍ فتح الإشعارات…</p>}>
          <NotificationCenter userId={userId} onNavigate={onNavigate}/>
        </Suspense>
      </div>
    </div>
  );
}

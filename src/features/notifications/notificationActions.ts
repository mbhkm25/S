import { getSafeNavigationTarget, isValidNotificationId } from '../push/pushNavigation';
import { NotificationActionType } from './types';

function safeInboxSurface(value: unknown): 'payment-inbox' | 'payment-inbox-admin' {
  return value === 'payment-inbox-admin' ? 'payment-inbox-admin' : 'payment-inbox';
}

export function handleNotificationAction(
  actionType: NotificationActionType,
  actionPayload: Record<string, unknown>,
  navigateTo: (page: string, token?: string, source?: 'link' | 'qr' | 'search' | 'app') => void,
  onError: (message: string) => void
): boolean {
  try {
    if (actionType === 'business_operations') {
      const businessId = typeof actionPayload.business_id === 'string' && isValidNotificationId(actionPayload.business_id)
        ? actionPayload.business_id : null;
      const surface = safeInboxSurface(actionPayload.inbox_surface);
      const params = new URLSearchParams({ view: surface });
      if (businessId) params.set('business_id', businessId);
      if (typeof actionPayload.inbox_view === 'string') params.set('inbox_view', actionPayload.inbox_view);
      if (typeof actionPayload.payment_inbox_id === 'string' && isValidNotificationId(actionPayload.payment_inbox_id)) {
        params.set('payment_inbox_id', actionPayload.payment_inbox_id);
      }
      window.location.assign(`/business/manage/operations?${params.toString()}`);
      return true;
    }

    const target = getSafeNavigationTarget(actionType, actionPayload);
    if (!target || actionType === 'none') return false;

    if (target.page === 'report-view' && target.token) {
      const base = import.meta.env.VITE_APP_BASE_PATH || '/';
      const cleanBase = base.endsWith('/') ? base : `${base}/`;
      window.location.assign(`${cleanBase}reports/view/${encodeURIComponent(target.token)}`);
      return true;
    }

    if (target.page === 'reports' && target.token) {
      const base = import.meta.env.VITE_APP_BASE_PATH || '/';
      const cleanBase = base.endsWith('/') ? base : `${base}/`;
      window.history.pushState({}, '', `${cleanBase}reports?request=${encodeURIComponent(target.token)}`);
      navigateTo('reports', undefined, 'app');
      return true;
    }

    navigateTo(target.page, target.token, target.source);
    return true;
  } catch {
    onError('تعذر فتح العنصر المرتبط بهذا الإشعار.');
    return false;
  }
}

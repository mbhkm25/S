import { getSafeNavigationTarget } from '../push/pushNavigation';
import { NotificationActionType } from './types';

/**
 * Safely processes and routes notification action intents to the main app navigator.
 * Prevents arbitrary navigation and handles errors gracefully if payload values are missing or malformed.
 * Returns true if navigation was successfully executed, false otherwise.
 */
export function handleNotificationAction(
  actionType: NotificationActionType,
  actionPayload: Record<string, unknown>,
  navigateTo: (page: string, token?: string, source?: 'link' | 'qr' | 'search' | 'app') => void,
  onError: (message: string) => void
): boolean {
  try {
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

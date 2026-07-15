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
    navigateTo(target.page, target.token, target.source);
    return true;
  } catch {
    onError('تعذر فتح العنصر المرتبط بهذا الإشعار.');
    return false;
  }
}

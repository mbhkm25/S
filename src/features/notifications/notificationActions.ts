import { NotificationActionType } from './types';

function getSafeString(payload: Record<string, unknown>, key: string): string | null {
  const val = payload[key];
  if (typeof val !== 'string') return null;
  const trimmed = val.trim();
  if (!trimmed || trimmed.length > 200) return null;
  // Block directory traversal, query, hash, and whitespace/control characters
  if (/[\/\\?#\s\x00-\x1F\x7F]/.test(trimmed)) return null;
  return trimmed;
}

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
  if (!actionType || actionType === 'none') {
    return false;
  }

  try {
    switch (actionType) {
      case 'operation_details': {
        const token = getSafeString(actionPayload, 'public_token') || getSafeString(actionPayload, 'token');
        if (!token) {
          throw new Error();
        }
        navigateTo('details', token, 'app');
        return true;
      }
      case 'reports':
        navigateTo('reports');
        return true;
      case 'business_invitation':
        // Users manage their profile invitations or membership status within the Profile screen.
        navigateTo('profile');
        return true;
      case 'business_manage':
        navigateTo('business-manage');
        return true;
      case 'business_team':
        navigateTo('business-team');
        return true;
      case 'business_operations':
        navigateTo('business-operations');
        return true;
      case 'business_public_profile': {
        const slug = getSafeString(actionPayload, 'business_slug') || getSafeString(actionPayload, 'slug');
        if (!slug) {
          throw new Error();
        }
        navigateTo('public-business-profile', slug);
        return true;
      }
      case 'pro_payment':
      case 'subscription':
        // Route to profile as payment requests & subscriptions are displayed/managed under user profile settings.
        navigateTo('profile');
        return true;
      case 'profile':
        navigateTo('profile');
        return true;
      default:
        throw new Error();
    }
  } catch (err) {
    onError('تعذر فتح العنصر المرتبط بهذا الإشعار.');
    return false;
  }
}

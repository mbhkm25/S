import { supabase } from '../../lib/supabase';
import { 
  NotificationCursor, 
  NotificationListResponse, 
  validateNotificationListResponse 
} from './types';

interface GetNotificationsParams {
  limit?: number;
  cursor?: NotificationCursor | null;
  unreadOnly?: boolean;
  category?: string;
}

function assertSuccessfulMutation(data: unknown, errorMessage: string): void {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error(errorMessage);
  }
  const obj = data as Record<string, unknown>;
  if (obj.ok !== true) {
    throw new Error(errorMessage);
  }
}

export async function getNotifications({
  limit = 20,
  cursor = null,
  unreadOnly = false,
  category
}: GetNotificationsParams): Promise<NotificationListResponse> {
  const finalLimit = Math.min(Math.max(limit, 1), 50);

  const { data, error } = await supabase.rpc('get_my_notifications', {
    p_limit: finalLimit,
    p_before_created_at: cursor ? cursor.created_at : null,
    p_before_id: cursor ? cursor.id : null,
    p_unread_only: unreadOnly,
    p_category: category || null
  });

  if (error) {
    throw new Error('تعذر تحميل الإشعارات.');
  }

  try {
    return validateNotificationListResponse(data);
  } catch (err) {
    throw new Error('تعذر تحميل الإشعارات.');
  }
}

export async function getUnreadCount(): Promise<number> {
  const { data, error } = await supabase.rpc('get_my_unread_notification_count');

  if (error) {
    throw new Error('تعذر تحديث عداد الإشعارات.');
  }

  if (typeof data !== 'number' || !Number.isInteger(data) || data < 0) {
    throw new Error('تعذر تحديث عداد الإشعارات.');
  }

  return data;
}

export async function markNotificationRead(notificationId: string): Promise<void> {
  const { data, error } = await supabase.rpc('mark_notification_read', {
    p_notification_id: notificationId
  });

  if (error) {
    throw new Error('تعذر تحديث حالة الإشعار كـ مقروء.');
  }

  assertSuccessfulMutation(data, 'تعذر تحديث حالة الإشعار كـ مقروء.');
}

export async function markAllNotificationsRead(): Promise<void> {
  const { data, error } = await supabase.rpc('mark_all_notifications_read');

  if (error) {
    throw new Error('تعذر تحديث جميع الإشعارات كمقروءة.');
  }

  assertSuccessfulMutation(data, 'تعذر تحديث جميع الإشعارات كمقروءة.');
}

export async function archiveNotification(notificationId: string): Promise<void> {
  const { data, error } = await supabase.rpc('archive_notification', {
    p_notification_id: notificationId
  });

  if (error) {
    throw new Error('تعذر أرشفة الإشعار المطلوب.');
  }

  assertSuccessfulMutation(data, 'تعذر أرشفة الإشعار المطلوب.');
}

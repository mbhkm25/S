export type PushSupportStatus =
  | 'supported'
  | 'unsupported'
  | 'permission_denied'
  | 'requires_native_push'
  | 'missing_vapid_key'
  | 'unknown';

export type PushPermissionState = NotificationPermission | 'unsupported';

export interface PushSubscriptionPayload {
  endpoint: string;
  p256dh: string;
  auth_secret: string;
  user_agent: string;
  device_label: string;
  platform: 'pwa' | 'web';
}

export interface PushDeviceInfo {
  id: string;
  platform: 'pwa' | 'web';
  device_label: string | null;
  last_seen_at: string | null;
  last_success_at: string | null;
  created_at: string;
}

export interface PushStatusResponse {
  enabled: boolean;
  active_device_count: number;
  devices: PushDeviceInfo[];
}

export interface PushSupportResult {
  status: PushSupportStatus;
  permission: PushPermissionState;
}

export interface PushMutationResult {
  ok: true;
  message: string;
  partial?: boolean;
}

export interface SanadNotificationClickMessage {
  type: 'SANAD_NOTIFICATION_CLICK';
  notificationId: string | null;
  actionType: import('../notifications/types').NotificationActionType;
  actionPayload: Record<string, string>;
}

export interface PushRefreshRequiredMessage {
  type: 'SANAD_PUSH_SUBSCRIPTION_REFRESH_REQUIRED';
}


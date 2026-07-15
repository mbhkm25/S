import { supabase } from '../../lib/supabase';
import { deactivateMyPushSubscription, upsertMyPushSubscription } from './pushApi';
import { PushClientError, normalizePushError } from './pushErrors';
import {
  detectPushSupport,
  getApplicationServerKey,
  getDeviceInfo,
  getReadyServiceWorkerRegistration,
  isCapacitorNativePlatform
} from './pushSupport';
import type { PushMutationResult, PushSubscriptionPayload } from './types';

function arrayBufferToBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function subscriptionToPayload(subscription: PushSubscription): PushSubscriptionPayload {
  const p256dh = subscription.getKey('p256dh');
  const auth = subscription.getKey('auth');
  if (!subscription.endpoint.startsWith('https://') || !p256dh || !auth) {
    throw new PushClientError('subscription_missing_keys');
  }
  const device = getDeviceInfo();
  return {
    endpoint: subscription.endpoint,
    p256dh: arrayBufferToBase64Url(p256dh),
    auth_secret: arrayBufferToBase64Url(auth),
    user_agent: device.userAgent,
    device_label: device.deviceLabel,
    platform: device.platform
  };
}

async function requireSession(): Promise<void> {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.user) throw new PushClientError('not_authenticated');
}

export async function getLocalPushSubscription(): Promise<PushSubscription | null> {
  if (isCapacitorNativePlatform()) return null;
  const registration = await getReadyServiceWorkerRegistration();
  return registration.pushManager.getSubscription();
}

export async function enablePushNotifications(): Promise<PushMutationResult> {
  try {
    const support = await detectPushSupport();
    if (support.status === 'permission_denied') throw new PushClientError('permission_denied');
    if (support.status === 'missing_vapid_key') throw new PushClientError('missing_vapid_key');
    if (support.status !== 'supported') throw new PushClientError('unsupported');
    await requireSession();

    const permission = Notification.permission === 'granted'
      ? 'granted'
      : await Notification.requestPermission();
    if (permission !== 'granted') throw new PushClientError('permission_denied');

    const registration = await getReadyServiceWorkerRegistration();
    let subscription = await registration.pushManager.getSubscription();
    let created = false;
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: getApplicationServerKey()
      });
      created = true;
    }

    try {
      await upsertMyPushSubscription(subscriptionToPayload(subscription));
    } catch (error) {
      if (created) {
        try { await subscription.unsubscribe(); } catch { /* Preserve the original RPC failure. */ }
      }
      throw error;
    }

    return { ok: true, message: 'تم تفعيل إشعارات الجوال.' };
  } catch (error) {
    throw normalizePushError(error);
  }
}

export async function disablePushNotifications(): Promise<PushMutationResult> {
  try {
    if (isCapacitorNativePlatform()) throw new PushClientError('unsupported');
    await requireSession();
    const registration = await getReadyServiceWorkerRegistration();
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) return { ok: true, message: 'إشعارات الجوال معطلة على هذا الجهاز.' };

    await deactivateMyPushSubscription(subscription.endpoint);
    const unsubscribed = await subscription.unsubscribe();
    if (!unsubscribed) {
      return {
        ok: true,
        partial: true,
        message: 'تم تعطيل الإشعارات في الخادم، لكن تعذر حذف الاشتراك من هذا المتصفح.'
      };
    }
    return { ok: true, message: 'تم تعطيل إشعارات الجوال على هذا الجهاز.' };
  } catch (error) {
    throw normalizePushError(error);
  }
}

const syncedUsers = new Set<string>();
const syncingUsers = new Map<string, Promise<void>>();

export async function syncExistingPushSubscription(userId: string, force = false): Promise<void> {
  if (!userId
      || isCapacitorNativePlatform()
      || typeof Notification === 'undefined'
      || Notification.permission !== 'granted') return;
  if (!force && syncedUsers.has(userId)) return;
  const existing = syncingUsers.get(userId);
  if (existing) return existing;
  const sync = (async () => {
    const registration = await getReadyServiceWorkerRegistration();
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) return;
    await upsertMyPushSubscription(subscriptionToPayload(subscription));
    syncedUsers.add(userId);
  })().finally(() => syncingUsers.delete(userId));
  syncingUsers.set(userId, sync);
  return sync;
}

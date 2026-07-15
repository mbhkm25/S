import { Capacitor } from '@capacitor/core';
import { PushClientError } from './pushErrors';
import type { PushSupportResult } from './types';

const READY_TIMEOUT_MS = 5_000;

export function isCapacitorNativePlatform(): boolean {
  if (typeof window === 'undefined') return false;
  return Capacitor.isNativePlatform()
    || window.location.origin.includes('capacitor')
    || window.location.protocol === 'file:';
}

export function isInstalledPwa(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia?.('(display-mode: standalone)').matches
    || ('standalone' in navigator && (navigator as Navigator & { standalone?: boolean }).standalone === true);
}

export function getVapidPublicKey(): string | null {
  const env = (import.meta as ImportMeta & { env?: ImportMetaEnv }).env;
  const value = String(env?.VITE_WEB_PUSH_VAPID_PUBLIC_KEY || '').trim();
  return value || null;
}

export function base64UrlToUint8Array(value: string): Uint8Array {
  const trimmed = value.trim();
  if (!/^[A-Za-z0-9_-]+$/.test(trimmed)) {
    throw new PushClientError('invalid_vapid_key');
  }

  const padding = '='.repeat((4 - (trimmed.length % 4)) % 4);
  let decoded: string;
  try {
    decoded = atob(trimmed.replace(/-/g, '+').replace(/_/g, '/') + padding);
  } catch {
    throw new PushClientError('invalid_vapid_key');
  }

  const bytes = Uint8Array.from(decoded, char => char.charCodeAt(0));
  if (bytes.length !== 65 || bytes[0] !== 4) {
    throw new PushClientError('invalid_vapid_key');
  }
  return bytes;
}

export function getApplicationServerKey(value?: string | null): Uint8Array {
  const key = value === undefined ? getVapidPublicKey() : value;
  if (!key) throw new PushClientError('missing_vapid_key');
  return base64UrlToUint8Array(key);
}

export async function getReadyServiceWorkerRegistration(
  timeoutMs = READY_TIMEOUT_MS
): Promise<ServiceWorkerRegistration> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    throw new PushClientError('service_worker_unavailable');
  }

  let timeoutId: number | undefined;
  try {
    return await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<never>((_, reject) => {
        timeoutId = window.setTimeout(() => reject(new PushClientError('timeout')), timeoutMs);
      })
    ]);
  } finally {
    if (timeoutId !== undefined) window.clearTimeout(timeoutId);
  }
}

export async function detectPushSupport(vapidKey = getVapidPublicKey()): Promise<PushSupportResult> {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return { status: 'unknown', permission: 'unsupported' };
  }
  if (isCapacitorNativePlatform()) {
    return { status: 'requires_native_push', permission: 'unsupported' };
  }
  if (!window.isSecureContext
      || !('serviceWorker' in navigator)
      || !('PushManager' in window)
      || !('Notification' in window)) {
    return { status: 'unsupported', permission: 'unsupported' };
  }
  if (Notification.permission === 'denied') {
    return { status: 'permission_denied', permission: 'denied' };
  }
  if (!vapidKey) {
    return { status: 'missing_vapid_key', permission: Notification.permission };
  }

  try {
    getApplicationServerKey(vapidKey);
    await getReadyServiceWorkerRegistration();
    return { status: 'supported', permission: Notification.permission };
  } catch (error) {
    if (error instanceof PushClientError && error.code === 'invalid_vapid_key') {
      return { status: 'missing_vapid_key', permission: Notification.permission };
    }
    return { status: 'unknown', permission: Notification.permission };
  }
}

export function getDeviceInfo(): { userAgent: string; deviceLabel: string; platform: 'pwa' | 'web' } {
  const ua = navigator.userAgent.slice(0, 1000);
  const os = /Android/i.test(ua) ? 'Android'
    : /iPhone|iPad|iPod/i.test(ua) ? 'iPhone'
    : /Windows/i.test(ua) ? 'Windows'
    : /Macintosh/i.test(ua) ? 'macOS'
    : 'الجهاز';
  const browser = /Edg\//i.test(ua) ? 'Edge'
    : /CriOS|Chrome\//i.test(ua) ? 'Chrome'
    : /Safari\//i.test(ua) ? 'Safari'
    : /Firefox\//i.test(ua) ? 'Firefox'
    : 'المتصفح';
  const pwa = isInstalledPwa();
  return {
    userAgent: ua,
    deviceLabel: `${pwa ? 'PWA' : browser} على ${os}`.slice(0, 160),
    platform: pwa ? 'pwa' : 'web'
  };
}

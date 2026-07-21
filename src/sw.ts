/// <reference lib="webworker" />
declare const self: ServiceWorkerGlobalScope & typeof globalThis;

import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';
import { registerRoute, NavigationRoute } from 'workbox-routing';
import { StaleWhileRevalidate, CacheFirst } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';
import { clientsClaim } from 'workbox-core';
import { isNotificationActionType, type NotificationActionType } from './features/notifications/types';
import {
  buildSafeNotificationPath,
  isValidNotificationId,
  sanitizeActionPayload
} from './features/push/pushNavigation';

const PRODUCTION_ORIGIN = 'https://app.sanadflow.com';
const APP_BASE_PATH = import.meta.env.VITE_APP_BASE_PATH || '/';
const DEFAULT_PUSH_TITLE = 'إشعار جديد من سند';
const DEFAULT_PUSH_BODY = 'لديك تحديث جديد. افتح سند لعرض التفاصيل بأمان.';

interface SafePushData {
  notificationId: string | null;
  title: string;
  body: string;
  actionType: NotificationActionType;
  actionPayload: Record<string, string>;
}

function safePushText(value: unknown, fallback: string, maxLength: number): string {
  if (typeof value !== 'string') return fallback;
  const normalized = value.replace(/[\x00-\x1F\x7F]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!normalized) return fallback;
  return normalized
    .replace(/https?:\/\/\S+/gi, '[رابط محمي]')
    .replace(/\beyJ[A-Za-z0-9._-]+\b/g, '[بيانات محمية]')
    .replace(/\d{6,}/g, '[بيانات محمية]')
    .slice(0, maxLength);
}

function parsePushData(data: PushMessageData | null): SafePushData {
  let raw: unknown = null;
  let fallbackBody = DEFAULT_PUSH_BODY;
  if (data) {
    try {
      raw = data.json();
    } catch {
      try { fallbackBody = safePushText(data.text(), DEFAULT_PUSH_BODY, 180); } catch { /* Use safe fallback. */ }
    }
  }

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {
      notificationId: null,
      title: DEFAULT_PUSH_TITLE,
      body: fallbackBody,
      actionType: 'none',
      actionPayload: {}
    };
  }

  const payload = raw as Record<string, unknown>;
  const actionType = isNotificationActionType(payload.action_type) ? payload.action_type : 'none';
  return {
    notificationId: isValidNotificationId(payload.notification_id) ? payload.notification_id : null,
    title: safePushText(payload.title, DEFAULT_PUSH_TITLE, 80),
    body: safePushText(payload.body, DEFAULT_PUSH_BODY, 180),
    actionType,
    actionPayload: sanitizeActionPayload(actionType, payload.action_payload)
  };
}

// 1. Precache all App Shell files generated during build
precacheAndRoute(self.__WB_MANIFEST || []);

// Cleanup old caches automatically
cleanupOutdatedCaches();

// Keep a new release waiting until the user accepts the update. Once accepted,
// claim all open SANAD windows so Workbox can reload them on the new app shell.
clientsClaim();
self.addEventListener('message', (event: ExtendableMessageEvent) => {
  if (event.data?.type === 'SKIP_WAITING') {
    event.waitUntil(self.skipWaiting());
  }
});

self.addEventListener('push', (event: PushEvent) => {
  const payload = parsePushData(event.data);
  event.waitUntil(self.registration.showNotification(payload.title, {
    body: payload.body,
    icon: '/icon-192.png',
    badge: '/icon-96.png',
    tag: payload.notificationId ? `sanad-notification-${payload.notificationId}` : 'sanad-notification',
    requireInteraction: false,
    data: {
      notificationId: payload.notificationId,
      actionType: payload.actionType,
      actionPayload: payload.actionPayload
    }
  }));
});

self.addEventListener('notificationclick', (event: NotificationEvent) => {
  event.notification.close();
  const rawData: unknown = event.notification.data;
  const data = rawData && typeof rawData === 'object' && !Array.isArray(rawData)
    ? rawData as Record<string, unknown>
    : {};
  const actionType = isNotificationActionType(data.actionType) ? data.actionType : 'none';
  const actionPayload = sanitizeActionPayload(actionType, data.actionPayload);
  const notificationId = isValidNotificationId(data.notificationId) ? data.notificationId : null;
  const internalPath = buildSafeNotificationPath(actionType, actionPayload, notificationId, APP_BASE_PATH);
  const internalUrl = new URL(internalPath, PRODUCTION_ORIGIN).toString();

  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const appWindow = windows.find(client => {
      try { return new URL(client.url).origin === PRODUCTION_ORIGIN; } catch { return false; }
    });
    if (appWindow) {
      appWindow.postMessage({
        type: 'SANAD_NOTIFICATION_CLICK',
        notificationId,
        actionType,
        actionPayload
      });
      await appWindow.focus();
      return;
    }
    await self.clients.openWindow(internalUrl);
  })());
});

self.addEventListener('pushsubscriptionchange', (event: ExtendableEvent) => {
  event.waitUntil((async () => {
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of clients) {
      client.postMessage({ type: 'SANAD_PUSH_SUBSCRIPTION_REFRESH_REQUIRED' });
    }
  })());
});

// IndexedDB Helper for share target
function openShareDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('sanad-share-db', 1);
    request.onupgradeneeded = (e: any) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('shares')) {
        db.createObjectStore('shares', { keyPath: 'id' });
      }
    };
    request.onsuccess = (e: any) => resolve(e.target.result);
    request.onerror = (e: any) => reject(e.target.error);
  });
}

function saveShareData(data: any): Promise<void> {
  return openShareDB().then((db) => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction('shares', 'readwrite');
      const store = tx.objectStore('shares');
      store.put(data);
      tx.oncomplete = () => resolve();
      tx.onerror = (e: any) => reject(tx.error);
    });
  });
}

// 2. Handle PWA Share Target POST request
self.addEventListener('fetch', (event: FetchEvent) => {
  const url = new URL(event.request.url);

  if (event.request.method === 'POST' && url.pathname.endsWith('/share-target')) {
    event.respondWith(
      (async () => {
        try {
          const formData = await event.request.formData();
          const files = formData.getAll('files');
          const title = formData.get('title') || '';
          const text = formData.get('text') || '';
          const sharedUrl = formData.get('url') || '';

          const fileData: any[] = [];
          if (files && files.length > 0) {
            for (const f of files) {
              if ((f as any) instanceof File || (f as any) instanceof Blob) {
                fileData.push({
                  blob: f,
                  name: (f as any).name || 'shared_file',
                  type: (f as any).type,
                  size: (f as any).size
                });
              }
            }
          }

          await saveShareData({
            id: 'latest-share',
            title,
            text,
            url: sharedUrl,
            files: fileData,
            timestamp: Date.now()
          });

          // Redirect to /share-intake using 303 Redirect relative to registration scope
          const redirectUrl = new URL('share-intake', self.registration.scope).toString();
          return Response.redirect(redirectUrl, 303);
        } catch (err) {
          console.error('[SW] Error in share-target handler:', err);
          const redirectUrl = new URL('share-intake?error=1', self.registration.scope).toString();
          return Response.redirect(redirectUrl, 303);
        }
      })()
    );
  }
});

// 3. Runtime Caching policies

// A. Font files (Google Fonts or local fonts) - CacheFirst
registerRoute(
  ({ request, url }) =>
    request.destination === 'font' ||
    url.origin.includes('fonts.gstatic.com') ||
    url.origin.includes('fonts.googleapis.com'),
  new CacheFirst({
    cacheName: 'sanad-fonts-cache',
    plugins: [
      new CacheableResponsePlugin({
        statuses: [0, 200],
      }),
      new ExpirationPlugin({
        maxEntries: 10,
        maxAgeSeconds: 365 * 24 * 60 * 60, // 1 year
      }),
    ],
  })
);

// B. Public business profiles images only (allowlist based) - StaleWhileRevalidate
// GET requests only, destination image, no Authorization, and URL must match public business media folder
registerRoute(
  ({ request, url }) => {
    const isGet = request.method === 'GET';
    const isImage = request.destination === 'image';
    const isPublicBusinessMedia = url.pathname.includes('/storage/v1/object/public/business_media/');
    const hasAuth = request.headers.has('Authorization');
    const isSigned = url.searchParams.has('token') || url.searchParams.has('signature') || url.searchParams.has('Expires');
    const isSensitive = url.pathname.includes('/private/') || url.pathname.includes('/receipts/') || url.pathname.includes('/transactions/');

    return isGet && isImage && isPublicBusinessMedia && !hasAuth && !isSigned && !isSensitive;
  },
  new StaleWhileRevalidate({
    cacheName: 'sanad-public-business-media',
    plugins: [
      new CacheableResponsePlugin({
        statuses: [200],
      }),
      new ExpirationPlugin({
        maxEntries: 50,
        maxAgeSeconds: 30 * 24 * 60 * 60, // 30 days
      }),
    ],
  })
);

// 4. SPA Navigation Fallback (Index.html) - Offline fallback using pre-cached shell
const handler = async (options: any) => {
  const precachedResponse = await caches.match('/index.html');
  return precachedResponse || fetch(options.request);
};

registerRoute(new NavigationRoute(handler, {
  denylist: [
    /^\/(rest|auth|storage)\/v1\//,
    /\.[a-zA-Z0-9]+$/,
  ]
}));

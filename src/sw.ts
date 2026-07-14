/// <reference lib="webworker" />
declare const self: ServiceWorkerGlobalScope & typeof globalThis;

import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';
import { registerRoute, NavigationRoute } from 'workbox-routing';
import { StaleWhileRevalidate, CacheFirst } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';

// 1. Precache all App Shell files generated during build
precacheAndRoute(self.__WB_MANIFEST || []);

// Cleanup old caches automatically
cleanupOutdatedCaches();

// Force immediate activation
self.addEventListener('install', () => {
  self.skipWaiting();
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

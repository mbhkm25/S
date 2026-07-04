const CACHE_NAME = 'sanad-pwa-cache-v1';

// Static files we want to precache initially (relative paths work great!)
const PRECACHE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon.png',
  './icon.svg'
];

// Install Event
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS).catch((err) => {
        console.warn('[SW] Precache failed, will cache on-demand:', err);
      });
    })
  );
});

// Activate Event - Clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('[SW] Clearing old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// IndexedDB setup for sharing files
function openShareDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('sanad-share-db', 1);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('shares')) {
        db.createObjectStore('shares', { keyPath: 'id' });
      }
    };
    request.onsuccess = (e) => resolve(e.target.result);
    request.onerror = (e) => reject(e.target.error);
  });
}

function saveShareData(data) {
  return openShareDB().then((db) => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction('shares', 'readwrite');
      const store = tx.objectStore('shares');
      store.put(data);
      tx.oncomplete = () => resolve();
      tx.onerror = (e) => reject(tx.error);
    });
  });
}

// Fetch Event
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // 0. Handle PWA Share Target POST request
  if (event.request.method === 'POST' && url.pathname.endsWith('/share-target')) {
    event.respondWith(
      (async () => {
        try {
          const formData = await event.request.formData();
          const files = formData.getAll('files');
          const title = formData.get('title') || '';
          const text = formData.get('text') || '';
          const sharedUrl = formData.get('url') || '';

          const fileData = [];
          if (files && files.length > 0) {
            for (const f of files) {
              if (f instanceof File || f instanceof Blob) {
                fileData.push({
                  blob: f,
                  name: f.name || 'shared_file',
                  type: f.type,
                  size: f.size
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

          // Redirect to /app/share-intake using 303 Redirect relative to the registration scope
          const redirectUrl = new URL('share-intake', self.registration.scope).toString();
          return Response.redirect(redirectUrl, 303);
        } catch (err) {
          console.error('[SW] Error in share-target handler:', err);
          const redirectUrl = new URL('share-intake?error=1', self.registration.scope).toString();
          return Response.redirect(redirectUrl, 303);
        }
      })()
    );
    return;
  }

  // 1. Bypass non-GET requests, Supabase API calls, and n8n webhooks
  if (
    event.request.method !== 'GET' ||
    url.hostname.includes('supabase.co') ||
    url.hostname.includes('n8n') ||
    url.pathname.includes('/api/') ||
    url.pathname.includes('/rest/v1/')
  ) {
    return; // Let browser handle it natively
  }

  // 2. Handle navigations (HTML pages) - Network-first with offline fallback
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          // Cache a copy of the index/HTML page
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
          return response;
        })
        .catch(() => {
          // If network fails, try to load from cache
          return caches.match(event.request).then((cachedResponse) => {
            if (cachedResponse) {
              return cachedResponse;
            }
            // Return a simple, elegant Arabic offline page response
            return new Response(
              `<!DOCTYPE html>
              <html lang="ar" dir="rtl">
              <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>غير متصل بالإنترنت | سند</title>
                <style>
                  body {
                    font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                    background-color: #f3f4f6;
                    color: #1f2937;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    height: 100vh;
                    margin: 0;
                    text-align: center;
                    padding: 20px;
                  }
                  .card {
                    background: white;
                    padding: 2rem;
                    border-radius: 1rem;
                    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
                    max-width: 400px;
                  }
                  .icon {
                    font-size: 3rem;
                    color: #9ca3af;
                    margin-bottom: 1rem;
                  }
                  h1 {
                    font-size: 1.5rem;
                    margin-bottom: 0.5rem;
                    color: #111827;
                  }
                  p {
                    color: #6b7280;
                    font-size: 0.875rem;
                    line-height: 1.5;
                  }
                  button {
                    background-color: #059669;
                    color: white;
                    border: none;
                    padding: 0.5rem 1rem;
                    border-radius: 0.375rem;
                    cursor: pointer;
                    margin-top: 1rem;
                    font-weight: 500;
                  }
                </style>
              </head>
              <body>
                <div class="card">
                  <div class="icon">📡</div>
                  <h1>أنت غير متصل بالإنترنت</h1>
                  <p>يرجى التحقق من اتصالك بالشبكة وإعادة المحاولة عند عودة الاتصال.</p>
                  <button onclick="window.location.reload()">إعادة المحاولة</button>
                </div>
              </body>
              </html>`,
              {
                headers: { 'Content-Type': 'text/html; charset=utf-8' }
              }
            );
          });
        })
    );
    return;
  }

  // 3. Handle static assets (Stale-While-Revalidate strategy)
  const isStaticAsset = 
    url.origin === self.location.origin && (
      url.pathname.includes('/assets/') ||
      url.pathname.endsWith('.js') ||
      url.pathname.endsWith('.css') ||
      url.pathname.endsWith('.png') ||
      url.pathname.endsWith('.jpg') ||
      url.pathname.endsWith('.jpeg') ||
      url.pathname.endsWith('.svg') ||
      url.pathname.endsWith('.json') ||
      url.pathname.endsWith('.webmanifest')
    );

  if (isStaticAsset) {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        const fetchPromise = fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
          }
          return networkResponse;
        });
        return cachedResponse || fetchPromise;
      })
    );
  }
});

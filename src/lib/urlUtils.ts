export function getPublicAppUrl(): string {
  const envUrl = import.meta.env.VITE_PUBLIC_APP_URL;

  const isCapacitor = !!(window as any).Capacitor ||
                      window.location.origin.includes('capacitor') ||
                      window.location.origin.startsWith('file:');

  let baseUrl = '';

  if (envUrl) {
    baseUrl = envUrl;
  } else if (!isCapacitor && import.meta.env.DEV) {
    baseUrl = window.location.origin;
  } else {
    baseUrl = 'https://app.sanadflow.com';
  }

  return baseUrl.replace(/\/+$/, '');
}

// كتالوج سند الداخلي جزء أساسي من الملف العام، وليس ميزة تجريبية قابلة للتعطيل.
export const INTERNAL_BUSINESS_CATALOG_ENABLED = true;

export function buildPublicBusinessUrl(slug: string): string {
  const baseUrl = getPublicAppUrl();
  const cleanSlug = encodeURIComponent(String(slug || '').trim().replace(/^\/+|\/+$/g, ''));
  return `${baseUrl}/b/${cleanSlug}`;
}

export function buildPublicProductUrl(slug: string, productId: string): string {
  const baseUrl = getPublicAppUrl();
  const cleanSlug = encodeURIComponent(String(slug || '').trim().replace(/^\/+|\/+$/g, ''));
  const cleanProductId = encodeURIComponent(String(productId || '').trim().replace(/^\/+|\/+$/g, ''));
  return `${baseUrl}/b/${cleanSlug}/p/${cleanProductId}`;
}

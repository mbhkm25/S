const DEFAULT_PUBLIC_APP_URL = 'https://app.sanadflow.com';
const DEFAULT_PLATFORM_ADMIN_URL = 'https://admin.sanadflow.com';

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value == null || value.trim() === '') return fallback;
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

function normalizeUrl(value: string): string {
  return value.trim().replace(/\/+$/, '');
}

export function getPublicAppUrl(): string {
  const configured = String(import.meta.env.VITE_PUBLIC_APP_URL || '').trim();
  const isCapacitor = Boolean((window as Window & { Capacitor?: unknown }).Capacitor)
    || window.location.origin.includes('capacitor')
    || window.location.origin.startsWith('file:');

  if (configured) return normalizeUrl(configured);
  if (!isCapacitor && import.meta.env.DEV) return normalizeUrl(window.location.origin);
  return DEFAULT_PUBLIC_APP_URL;
}

export function getPlatformAdminUrl(): string {
  const configured = String(import.meta.env.VITE_PLATFORM_ADMIN_URL || '').trim();
  if (configured) return normalizeUrl(configured);
  return import.meta.env.PROD ? DEFAULT_PLATFORM_ADMIN_URL : `${getPublicAppUrl()}/platform-admin`;
}

export function isExternalPlatformAdminEnabled(): boolean {
  return getPlatformAdminUrl() !== `${getPublicAppUrl()}/platform-admin`;
}

// الكتالوج الداخلي مفعّل افتراضيًا، ويمكن تعطيله صراحةً فقط عبر متغير البيئة.
export const INTERNAL_BUSINESS_CATALOG_ENABLED = parseBoolean(
  import.meta.env.VITE_INTERNAL_BUSINESS_CATALOG_ENABLED,
  true
);

function cleanSegment(value: string): string {
  return encodeURIComponent(String(value || '').trim().replace(/^\/+|\/+$/g, ''));
}

export function buildPublicBusinessUrl(slug: string): string {
  return `${getPublicAppUrl()}/b/${cleanSegment(slug)}`;
}

export function buildPublicProductUrl(slug: string, productId: string): string {
  return `${buildPublicBusinessUrl(slug)}/p/${cleanSegment(productId)}`;
}

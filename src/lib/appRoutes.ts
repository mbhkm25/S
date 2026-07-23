export type NavigationSource = 'link' | 'qr' | 'search' | 'app';

export type AppPage =
  | 'home'
  | 'upload'
  | 'my-operations'
  | 'profile'
  | 'details'
  | 'verify-notice'
  | 'login'
  | 'reports'
  | 'scan-qr'
  | 'share-intake'
  | 'business-create'
  | 'business-manage'
  | 'business-operations'
  | 'business-team'
  | 'business-manage-profile'
  | 'business-whatsapp-catalog'
  | 'business-community'
  | 'public-business-profile'
  | 'business-customers'
  | 'public-product-detail'
  | 'notifications'
  | 'platform-admin';

export type AppRoute = {
  page: AppPage;
  token?: string;
  productToken?: string;
  source?: NavigationSource;
  profileSection?: string;
  replace?: boolean;
};

function cleanBasePath(value?: string): string {
  const raw = String(value || '/').trim() || '/';
  const withLeading = raw.startsWith('/') ? raw : `/${raw}`;
  return withLeading.endsWith('/') ? withLeading : `${withLeading}/`;
}

function cleanSegment(value: string | undefined): string {
  return encodeURIComponent(String(value || '').trim().replace(/^\/+|\/+$/g, ''));
}

function decodeSegment(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try { return decodeURIComponent(value); } catch { return value; }
}

function relativePath(pathname: string, basePath: string): string {
  const base = cleanBasePath(basePath);
  if (base !== '/' && pathname.startsWith(base)) return pathname.slice(base.length - 1);
  return pathname.startsWith('/') ? pathname : `/${pathname}`;
}

export function parseAppLocation(
  location: Pick<Location, 'pathname' | 'search'>,
  options?: { basePath?: string; internalCatalogEnabled?: boolean }
): AppRoute {
  const path = relativePath(location.pathname, options?.basePath || '/');
  const params = new URLSearchParams(location.search);
  const source = (['link', 'qr', 'search', 'app'].includes(params.get('src') || '')
    ? params.get('src')
    : 'link') as NavigationSource;

  if (/\/platform-admin(?:\/|$)/.test(path)) return { page: 'platform-admin' };
  if (!/\/business\//.test(path) && /\/profile(?:\/|$)/.test(path)) {
    const segments = path.split('/').filter(Boolean);
    const last = segments[segments.length - 1];
    return { page: 'profile', profileSection: last === 'profile' ? undefined : last };
  }
  if (/\/share-intake(?:\/|$)/.test(path)) return { page: 'share-intake' };
  if (/\/notifications(?:\/|$)/.test(path)) return { page: 'notifications' };
  if (/\/reports(?:\/|$)/.test(path)) return { page: 'reports' };
  if (/\/business\/create(?:\/|$)/.test(path)) return { page: 'business-create' };
  if (/\/business\/manage\/operations(?:\/|$)/.test(path)) return { page: 'business-operations' };
  if (/\/business\/manage\/team(?:\/|$)/.test(path)) return { page: 'business-team' };
  if (/\/business\/manage\/profile(?:\/|$)/.test(path)) return { page: 'business-manage-profile' };
  if (/\/business\/manage\/(?:whatsapp-catalog|catalog)(?:\/|$)/.test(path)) return { page: 'business-whatsapp-catalog', replace: /\/catalog(?:\/|$)/.test(path) };
  if (/\/business\/manage\/customers(?:\/|$)/.test(path)) return { page: 'business-customers' };
  if (/\/business\/manage(?:\/|$)/.test(path)) return { page: 'business-manage' };
  if (/\/business-community(?:\/|$)/.test(path)) return { page: 'business-community' };

  const productMatch = path.match(/\/b\/([^/]+)\/p\/([^/]+)/);
  if (productMatch) {
    const token = decodeSegment(productMatch[1]);
    if (options?.internalCatalogEnabled === false) return { page: 'public-business-profile', token, replace: true };
    return { page: 'public-product-detail', token, productToken: decodeSegment(productMatch[2]) };
  }
  const businessMatch = path.match(/\/b\/([^/]+)/);
  if (businessMatch) return { page: 'public-business-profile', token: decodeSegment(businessMatch[1]) };
  const detailsMatch = path.match(/\/v\/([^/]+)/);
  if (detailsMatch) return { page: 'details', token: decodeSegment(detailsMatch[1]), source };
  return { page: 'home' };
}

export function buildAppLocation(route: AppRoute, basePath = '/'): string {
  const base = cleanBasePath(basePath);
  const path = (() => {
    switch (route.page) {
      case 'details': return route.token ? `v/${cleanSegment(route.token)}` : '';
      case 'share-intake': return 'share-intake';
      case 'profile': return route.profileSection ? `profile/${cleanSegment(route.profileSection)}` : 'profile';
      case 'notifications': return 'notifications';
      case 'reports': return 'reports';
      case 'platform-admin': return 'platform-admin';
      case 'business-create': return 'business/create';
      case 'business-manage': return 'business/manage';
      case 'business-operations': return 'business/manage/operations';
      case 'business-team': return 'business/manage/team';
      case 'business-manage-profile': return 'business/manage/profile';
      case 'business-whatsapp-catalog': return 'business/manage/whatsapp-catalog';
      case 'business-customers': return 'business/manage/customers';
      case 'business-community': return 'business-community';
      case 'public-business-profile': return route.token ? `b/${cleanSegment(route.token)}` : '';
      case 'public-product-detail': return route.token && route.productToken ? `b/${cleanSegment(route.token)}/p/${cleanSegment(route.productToken)}` : '';
      default: return '';
    }
  })();
  const query = route.page === 'details' && route.source && route.source !== 'link'
    ? `?src=${route.source}`
    : '';
  return `${base}${path}${query}`;
}

export function writeAppLocation(route: AppRoute, basePath = '/', state: unknown = {}): string {
  const target = buildAppLocation(route, basePath);
  if (route.replace) window.history.replaceState(state, '', target);
  else window.history.pushState(state, '', target);
  return target;
}

export function canonicalizeAppLocation(
  route: AppRoute,
  basePath = '/',
  current = `${window.location.pathname}${window.location.search}`
): boolean {
  const target = buildAppLocation(route, basePath);
  if (target === current) return false;
  window.history.replaceState(window.history.state, '', target);
  return true;
}

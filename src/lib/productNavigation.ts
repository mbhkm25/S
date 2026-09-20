export type ProductArea = 'assistant' | 'financial' | 'business' | 'account';

export const PRODUCT_NAVIGATION_EVENT = 'sanad:product-navigation';

export function productBasePath(): string {
  const value = import.meta.env.VITE_APP_BASE_PATH || '/';
  return value.endsWith('/') ? value : `${value}/`;
}

export function productHref(path: string): string {
  const cleanPath = path.replace(/^\/+/, '');
  return `${productBasePath()}${cleanPath}`;
}

function currentLocationKey(): string {
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

export function navigateProduct(path: string, options: { replace?: boolean } = {}): void {
  const href = productHref(path);
  const nextUrl = new URL(href, window.location.origin);
  const nextKey = `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`;
  if (nextKey === currentLocationKey()) return;

  if (options.replace) window.history.replaceState({}, '', nextKey);
  else window.history.pushState({}, '', nextKey);

  window.dispatchEvent(new CustomEvent(PRODUCT_NAVIGATION_EVENT, {
    detail: { href: nextKey },
  }));
}

export function subscribeProductNavigation(listener: () => void): () => void {
  const sync = () => listener();
  window.addEventListener('popstate', sync);
  window.addEventListener(PRODUCT_NAVIGATION_EVENT, sync);
  return () => {
    window.removeEventListener('popstate', sync);
    window.removeEventListener(PRODUCT_NAVIGATION_EVENT, sync);
  };
}

export function shouldHandleProductLinkClick(event: {
  button: number;
  defaultPrevented: boolean;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}): boolean {
  return !event.defaultPrevented
    && event.button === 0
    && !event.metaKey
    && !event.ctrlKey
    && !event.shiftKey
    && !event.altKey;
}

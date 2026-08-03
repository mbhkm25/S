(() => {
  'use strict';

  const ALLOWED_RETURN_PATHS = new Set([
    '/profile',
    '/profile#business-workspaces',
    '/business/manage'
  ]);

  function normalizedReturnPath() {
    const requested = new URL(window.location.href).searchParams.get('return_to') || '';
    if (!requested.startsWith('/') || requested.startsWith('//')) return '/profile#business-workspaces';
    const decoded = decodeURIComponent(requested);
    return ALLOWED_RETURN_PATHS.has(decoded) ? decoded : '/profile#business-workspaces';
  }

  function applyReturnLink() {
    const link = document.getElementById('paymentInboxBackLink');
    if (link instanceof HTMLAnchorElement) link.href = normalizedReturnPath();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyReturnLink, { once: true });
  } else {
    applyReturnLink();
  }
})();

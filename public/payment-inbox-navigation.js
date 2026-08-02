(() => {
  'use strict';

  const ALLOWED_RETURN_PATHS = new Set([
    '/profile',
    '/profile#business-workspaces',
    '/business/manage',
    '/payment-inbox.html',
    '/payment-inbox-admin.html'
  ]);

  function normalizedReturnPath() {
    const requested = new URL(window.location.href).searchParams.get('return_to') || '';
    const fallback = document.body.classList.contains('admin-mode')
      ? '/payment-inbox.html'
      : '/profile#business-workspaces';
    if (!requested.startsWith('/') || requested.startsWith('//')) return fallback;
    const decoded = decodeURIComponent(requested);
    return ALLOWED_RETURN_PATHS.has(decoded) ? decoded : fallback;
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

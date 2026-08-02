(() => {
  'use strict';

  function restoreNativeTabs() {
    const hero = document.querySelector('.hero.cashier-hero');
    const tabs = hero?.querySelector('.hero-tabs.tabs');
    if (!hero || !tabs) return;

    document.getElementById('paymentInboxTabSwitcher')?.remove();
    tabs.classList.remove('tabs-native-hidden');
    tabs.removeAttribute('aria-hidden');
    tabs.querySelectorAll('[data-status]').forEach(button => {
      if (!button.hasAttribute('data-supervisor-only') || !button.hidden) {
        button.removeAttribute('aria-hidden');
      }
    });
  }

  const observer = new MutationObserver(() => restoreNativeTabs());
  observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'aria-hidden'] });

  document.addEventListener('DOMContentLoaded', restoreNativeTabs, { once: true });
  window.addEventListener('load', restoreNativeTabs, { once: true });
  requestAnimationFrame(restoreNativeTabs);
  setTimeout(restoreNativeTabs, 0);
  setTimeout(restoreNativeTabs, 250);
})();

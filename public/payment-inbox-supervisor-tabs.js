(() => {
  'use strict';

  let contexts = [];

  function activeContext() {
    const businessId = document.getElementById('businessSelect')?.value;
    return contexts.find(item => item.business_id === businessId) || contexts[0] || null;
  }

  function applyVisibility() {
    const context = activeContext();
    const enabled = context?.is_supervisor === true;
    document.body.classList.toggle('payment-inbox-supervisor', enabled);
    document.querySelectorAll('[data-supervisor-only]').forEach(button => {
      button.hidden = !enabled;
      button.classList.toggle('workflow-supervisor-visible', enabled);
      if (!enabled && button.classList.contains('active')) {
        document.querySelector('.tabs [data-status="new"]')?.click();
      }
    });
  }

  function installStyles() {
    if (document.getElementById('paymentInboxSupervisorTabStyles')) return;
    const style = document.createElement('style');
    style.id = 'paymentInboxSupervisorTabStyles';
    style.textContent = `
      [data-supervisor-only][hidden]{display:none!important}
      body:not(.payment-inbox-supervisor) .tab-switcher-option[data-tab-status="team_active"],
      body:not(.payment-inbox-supervisor) .tab-switcher-option[data-tab-status="all"]{display:none!important}
      body.payment-inbox-supervisor .tab-switcher-option[data-tab-status="team_active"],
      body.payment-inbox-supervisor .tab-switcher-option[data-tab-status="all"]{display:grid}
    `;
    document.head.appendChild(style);
  }

  function start() {
    installStyles();
    window.addEventListener('sanad:payment-contexts-v2-loaded', event => {
      contexts = Array.isArray(event.detail?.items) ? event.detail.items : [];
      applyVisibility();
    });
    document.getElementById('businessSelect')?.addEventListener('change', applyVisibility);
    applyVisibility();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();

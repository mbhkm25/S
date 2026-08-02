(() => {
  'use strict';

  const isAdmin = document.body.classList.contains('admin-mode');
  const businessSelect = document.getElementById('businessSelect');
  const adminLink = document.getElementById('paymentInboxAdminLink');
  let contexts = [];
  let adminTabActivated = false;

  function currentBusinessId() {
    return businessSelect?.value || new URL(location.href).searchParams.get('business_id') || '';
  }

  function updateAdminHref() {
    if (!(adminLink instanceof HTMLAnchorElement)) return;
    const businessId = currentBusinessId();
    const params = new URLSearchParams();
    if (businessId) params.set('business_id', businessId);
    params.set('return_to', '/payment-inbox.html');
    adminLink.href = `/payment-inbox-admin.html?${params.toString()}`;
  }

  function activeContext() {
    const id = currentBusinessId();
    return contexts.find(item => item?.business_id === id) || contexts[0] || null;
  }

  function applySupervisorState() {
    const context = activeContext();
    const isSupervisor = Boolean(context?.is_supervisor || context?.is_owner);
    if (adminLink) adminLink.hidden = !isSupervisor;
    updateAdminHref();

    if (isAdmin && context && !isSupervisor) {
      const notice = document.getElementById('notice');
      if (notice) {
        notice.textContent = 'هذه الواجهة مخصصة لمالك النشاط أو المشرف المخول بإدارة وارد المدفوعات.';
        notice.className = 'notice error';
      }
    }
  }

  function readContexts(event) {
    const detail = event?.detail || {};
    const list = Array.isArray(detail.items) ? detail.items
      : Array.isArray(detail.contexts) ? detail.contexts
      : Array.isArray(detail) ? detail
      : [];
    if (list.length) contexts = list;
    applySupervisorState();
  }

  function activateAdminDefaultTab() {
    if (!isAdmin || adminTabActivated || !currentBusinessId()) return;
    const tab = document.querySelector('[data-status="team_active"]');
    if (!(tab instanceof HTMLButtonElement)) return;
    adminTabActivated = true;
    window.setTimeout(() => tab.click(), 100);
  }

  window.addEventListener('sanad:payment-contexts-v2-loaded', event => {
    readContexts(event);
    activateAdminDefaultTab();
  });
  window.addEventListener('sanad:payment-inbox-v2-loaded', () => activateAdminDefaultTab());

  businessSelect?.addEventListener('change', () => {
    applySupervisorState();
    if (isAdmin) {
      adminTabActivated = false;
      activateAdminDefaultTab();
    }
  });

  document.addEventListener('DOMContentLoaded', () => {
    updateAdminHref();
  }, { once: true });
})();

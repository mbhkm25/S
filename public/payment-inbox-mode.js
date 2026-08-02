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
    return contexts.find(item => item?.business_id === id) || null;
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
    if (!isAdmin || adminTabActivated) return;
    const tab = document.querySelector('[data-status="team_active"]');
    if (!(tab instanceof HTMLButtonElement)) return;
    adminTabActivated = true;
    window.setTimeout(() => tab.click(), 250);
  }

  window.addEventListener('sanad:payment-inbox-contexts', readContexts);
  window.addEventListener('sanad:payment-inbox-v2-contexts', readContexts);
  window.addEventListener('sanad:payment-inbox-v2-loaded', event => {
    readContexts(event);
    activateAdminDefaultTab();
  });

  businessSelect?.addEventListener('change', () => {
    applySupervisorState();
    if (isAdmin) {
      adminTabActivated = false;
      activateAdminDefaultTab();
    }
  });

  document.addEventListener('DOMContentLoaded', () => {
    updateAdminHref();
    activateAdminDefaultTab();
  }, { once: true });
})();

(() => {
  'use strict';

  const config = window.SANAD_PUBLIC_API_CONFIG;
  if (!config) return;

  const AUTH_KEY = `sb-${config.projectRef}-auth-token`;
  const SOURCE_LABELS = {
    payment_inbox: 'صندوق المدفوعات',
    qr_details: 'مسح QR',
    direct_link: 'الرابط المباشر',
    operation_details: 'صفحة العملية',
    business_link_after_verification: 'ربط العملية بالنشاط',
    notification: 'الإشعارات',
    admin: 'إجراء إداري',
    system: 'النظام'
  };

  let requestGeneration = 0;
  let observer = null;
  let refreshTimer = null;

  function decodeBase64Url(value) {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4);
    return new TextDecoder().decode(Uint8Array.from(atob(padded), char => char.charCodeAt(0)));
  }

  function unwrapSession(value) {
    if (!value) return null;
    let parsed = value;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      if (typeof parsed !== 'string') break;
      const text = parsed.startsWith('base64-') ? decodeBase64Url(parsed.slice(7)) : parsed;
      try { parsed = JSON.parse(text); } catch { return null; }
    }
    if (!parsed || typeof parsed !== 'object') return null;
    if (parsed.access_token) return parsed;
    if (parsed.currentSession?.access_token) return parsed.currentSession;
    if (parsed.session?.access_token) return parsed.session;
    if (Array.isArray(parsed) && parsed[0]?.access_token) return parsed[0];
    return null;
  }

  function readSession() {
    for (const storage of [localStorage, sessionStorage]) {
      try {
        const direct = unwrapSession(storage.getItem(AUTH_KEY));
        if (direct) return direct;
        const chunks = [];
        for (let index = 0; index < storage.length; index += 1) {
          const key = storage.key(index);
          if (key?.startsWith(`${AUTH_KEY}.`)) chunks.push(key);
        }
        chunks.sort((a, b) => Number(a.split('.').pop()) - Number(b.split('.').pop()));
        if (chunks.length) {
          const session = unwrapSession(chunks.map(key => storage.getItem(key) || '').join(''));
          if (session) return session;
        }
      } catch { /* storage can be unavailable */ }
    }
    return null;
  }

  function esc(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function activeCompletedTab() {
    return document.querySelector('.tabs [data-status="completed"].active') !== null;
  }

  function sourceLabel(source) {
    return SOURCE_LABELS[source] || 'مسار تشغيلي';
  }

  async function loadCompletedItems() {
    if (!activeCompletedTab()) return;
    const businessId = document.getElementById('businessSelect')?.value;
    const session = readSession();
    if (!businessId || !session?.access_token) return;

    const generation = ++requestGeneration;
    const response = await fetch(`${config.apiUrl}/rest/v1/rpc/get_business_payment_inbox`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`
      },
      body: JSON.stringify({
        p_business_id: businessId,
        p_status: 'completed',
        p_limit: 100,
        p_before_created_at: null,
        p_before_id: null
      })
    });
    if (!response.ok || generation !== requestGeneration) return;
    const payload = await response.json();
    const items = Array.isArray(payload?.items) ? payload.items : [];

    items.forEach(item => {
      const card = document.querySelector(`[data-item-id="${CSS.escape(String(item.id))}"]`);
      if (!(card instanceof HTMLElement)) return;
      const existing = card.querySelector('.workflow-completion-state');
      const actor = item.completed_by_name || 'عضو الفريق';
      const source = sourceLabel(item.completed_source || item.last_action_source);
      const html = `<div class="workflow-completion-state"><strong>أكملها ${esc(actor)}</strong><span>عبر ${esc(source)}</span></div>`;
      if (existing) {
        if (existing.outerHTML !== html) existing.outerHTML = html;
        return;
      }
      card.insertAdjacentHTML('beforeend', html);
    });
  }

  function scheduleRefresh() {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => void loadCompletedItems().catch(() => undefined), 80);
  }

  function installStyles() {
    if (document.getElementById('workflowCompletionStyles')) return;
    const style = document.createElement('style');
    style.id = 'workflowCompletionStyles';
    style.textContent = `
      .workflow-completion-state{display:flex;align-items:center;justify-content:space-between;gap:.75rem;margin-top:.75rem;padding:.75rem 1rem;border-radius:1rem;background:#ecfdf5;color:#065f46;font-family:"IBM Plex Sans Arabic",sans-serif}
      .workflow-completion-state strong{font-size:.72rem}
      .workflow-completion-state span{font-size:.62rem;color:#047857}
    `;
    document.head.appendChild(style);
  }

  function start() {
    installStyles();
    document.querySelectorAll('.tabs [data-status], #businessSelect, #refreshButton').forEach(element => {
      element.addEventListener('click', scheduleRefresh);
      element.addEventListener('change', scheduleRefresh);
    });
    const queue = document.getElementById('queueSection');
    if (queue) {
      observer = new MutationObserver(scheduleRefresh);
      observer.observe(queue, { childList: true, subtree: true });
    }
    scheduleRefresh();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();

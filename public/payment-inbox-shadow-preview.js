(() => {
  'use strict';

  const API_URL = window.SANAD_PUBLIC_API_CONFIG?.apiUrl || 'https://api.sanadflow.com';
  const PREVIEW_STATUS = 'shadow_preview';
  const PREVIEW_RPC = 'get_business_payment_shadow_preview';
  const originalFetch = window.fetch.bind(window);
  let lastPreviewCount = 0;
  let decorating = false;

  function isPreviewTabActive() {
    return document.querySelector(`[data-status="${PREVIEW_STATUS}"]`)?.classList.contains('active') === true;
  }

  function updatePreviewTabCount(count) {
    lastPreviewCount = Number.isFinite(Number(count)) ? Number(count) : 0;
    const tab = document.querySelector(`[data-status="${PREVIEW_STATUS}"]`);
    if (!tab) return;
    tab.textContent = lastPreviewCount > 0 ? `تجريبية · ${lastPreviewCount}` : 'تجريبية';
  }

  function parseJsonBody(init) {
    if (!init?.body || typeof init.body !== 'string') return null;
    try { return JSON.parse(init.body); } catch { return null; }
  }

  function matchesPaymentInboxRpc(input) {
    const rawUrl = typeof input === 'string' || input instanceof URL ? String(input) : input?.url;
    if (!rawUrl) return false;
    try {
      const url = new URL(rawUrl, window.location.href);
      return url.origin === API_URL && url.pathname.endsWith('/rest/v1/rpc/get_business_payment_inbox');
    } catch {
      return false;
    }
  }

  window.fetch = async function sanadPaymentPreviewFetch(input, init = undefined) {
    const body = parseJsonBody(init);
    if (!matchesPaymentInboxRpc(input) || body?.p_status !== PREVIEW_STATUS) {
      return originalFetch(input, init);
    }

    const previewResponse = await originalFetch(`${API_URL}/rest/v1/rpc/${PREVIEW_RPC}`, {
      ...(init || {}),
      body: JSON.stringify({
        p_business_id: body.p_business_id,
        p_limit: body.p_limit,
        p_before_created_at: body.p_before_created_at,
        p_before_id: body.p_before_id
      })
    });

    try {
      const payload = await previewResponse.clone().json();
      updatePreviewTabCount(Array.isArray(payload?.items) ? payload.items.length : 0);
    } catch {
      updatePreviewTabCount(0);
    }

    return previewResponse;
  };

  function replaceBadgeText(root, from, to) {
    root.querySelectorAll('.badge').forEach(badge => {
      if (badge.textContent?.trim() === from) badge.textContent = to;
    });
  }

  function decoratePreviewQueue() {
    if (decorating) return;
    decorating = true;
    try {
      const root = document.getElementById('queueSection');
      if (!root) return;

      root.querySelectorAll('.shadow-preview-banner').forEach(node => node.remove());
      root.querySelectorAll('.payment-card').forEach(card => card.classList.remove('shadow-preview-card'));
      root.querySelectorAll('.preview-operation-note').forEach(node => node.remove());

      if (!isPreviewTabActive()) return;

      replaceBadgeText(root, PREVIEW_STATUS, 'تجريبية');
      replaceBadgeText(root, 'shadow', 'ظل');

      const cards = [...root.querySelectorAll('.payment-card')];
      if (!cards.length) {
        const empty = root.querySelector('.empty');
        if (empty) {
          empty.innerHTML = 'لا توجد مطابقات تجريبية لهذا النشاط الآن.<br>تظهر هنا عمليات الظل المطابقة دون أن تدخل التشغيل.';
        }
        return;
      }

      const banner = document.createElement('section');
      banner.className = 'shadow-preview-banner';
      banner.innerHTML = '<strong>مطابقات تجريبية فقط</strong><span>هذه العمليات طابقت حساب النشاط في وضع الظل، لكنها لم تدخل وارد التشغيل ولا يمكن استلامها أو إكمالها.</span>';
      root.prepend(banner);

      cards.forEach(card => {
        card.classList.add('shadow-preview-card');
        const actions = card.querySelector('.card-actions');
        if (!actions) return;
        const note = document.createElement('span');
        note.className = 'preview-operation-note';
        note.textContent = 'غير تشغيلية · بانتظار اجتياز بوابة التوجيه';
        actions.prepend(note);
      });
    } finally {
      decorating = false;
    }
  }

  function boot() {
    const root = document.getElementById('queueSection');
    const tab = document.querySelector(`[data-status="${PREVIEW_STATUS}"]`);
    if (!root || !tab) return;

    tab.addEventListener('click', () => {
      window.setTimeout(decoratePreviewQueue, 0);
    });

    document.querySelectorAll('[data-status]').forEach(otherTab => {
      if (otherTab === tab) return;
      otherTab.addEventListener('click', () => updatePreviewTabCount(lastPreviewCount));
    });

    const observer = new MutationObserver(() => {
      window.requestAnimationFrame(decoratePreviewQueue);
    });
    observer.observe(root, { childList: true, subtree: true, characterData: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();

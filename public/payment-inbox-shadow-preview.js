(() => {
  'use strict';

  const API_URL = window.SANAD_PUBLIC_API_CONFIG?.apiUrl || 'https://api.sanadflow.com';
  const API_ORIGIN = new URL(API_URL).origin;
  const PREVIEW_STATUS = 'shadow_preview';
  const PREVIEW_RPC = 'get_business_payment_shadow_preview';
  const originalFetch = window.fetch.bind(window);
  const previewItems = new Map();
  let lastPreviewCount = 0;
  let decorating = false;

  const GATE_LABELS = Object.freeze({
    policy_disabled: 'السياسة معطلة',
    emergency_stop: 'الإيقاف الطارئ مفعّل',
    rollout_mode_shadow: 'الوضع الحالي ظل فقط',
    benchmark_gate_not_passed: 'Benchmark غير مكتمل',
    match_score_below_policy: 'الدرجة أقل من الحد',
    match_strategy_not_allowed: 'الاستراتيجية غير مسموحة',
    financial_account_not_verified: 'الحساب المالي غير موثّق',
    benchmark_segment_sample_insufficient: 'عينة الجهة والقالب غير كافية',
    no_enabled_rollout_target: 'لا يوجد هدف Canary مفعّل'
  });

  function isPreviewTabActive() {
    return document.querySelector(`[data-status="${PREVIEW_STATUS}"]`)?.classList.contains('active') === true;
  }

  function updatePreviewTabCount(count) {
    lastPreviewCount = Number.isFinite(Number(count)) ? Number(count) : 0;
    const tab = document.querySelector(`[data-status="${PREVIEW_STATUS}"]`);
    if (!tab) return;
    const nextLabel = lastPreviewCount > 0 ? `تجريبية · ${lastPreviewCount}` : 'تجريبية';
    if (tab.textContent !== nextLabel) tab.textContent = nextLabel;
  }

  function rememberPreviewItems(items) {
    previewItems.clear();
    for (const item of Array.isArray(items) ? items : []) {
      if (item?.id) previewItems.set(String(item.id), item);
    }
    updatePreviewTabCount(previewItems.size);
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
      return url.origin === API_ORIGIN && url.pathname.endsWith('/rest/v1/rpc/get_business_payment_inbox');
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
      rememberPreviewItems(payload?.items);
    } catch {
      rememberPreviewItems([]);
    }

    return previewResponse;
  };

  function replaceBadgeText(root, from, to) {
    root.querySelectorAll('.badge').forEach(badge => {
      if (badge.textContent?.trim() === from) badge.textContent = to;
    });
  }

  function clearPreviewDecorations(root) {
    root.querySelector('.shadow-preview-banner')?.remove();
    root.querySelectorAll('.payment-card.shadow-preview-card').forEach(card => card.classList.remove('shadow-preview-card'));
    root.querySelectorAll('.preview-operation-note, .preview-gates').forEach(node => node.remove());
  }

  function renderGateReasons(card, item) {
    if (!item || card.querySelector('.preview-gates')) return;
    const reasons = Array.isArray(item.gate_reasons) ? item.gate_reasons : [];
    const visible = reasons.slice(0, 4);
    if (!visible.length) return;

    const root = document.createElement('div');
    root.className = 'preview-gates';
    root.setAttribute('aria-label', 'أسباب عدم دخول العملية إلى التشغيل');

    visible.forEach(reason => {
      const chip = document.createElement('span');
      chip.textContent = GATE_LABELS[reason] || reason;
      root.append(chip);
    });

    if (reasons.length > visible.length) {
      const more = document.createElement('span');
      more.className = 'more';
      more.textContent = `+${reasons.length - visible.length}`;
      more.title = reasons.slice(visible.length).map(reason => GATE_LABELS[reason] || reason).join('، ');
      root.append(more);
    }

    const facts = card.querySelector('.facts');
    if (facts) facts.insertAdjacentElement('afterend', root);
    else card.append(root);
  }

  function decoratePreviewQueue() {
    if (decorating) return;
    decorating = true;
    try {
      const root = document.getElementById('queueSection');
      if (!root) return;

      if (!isPreviewTabActive()) {
        clearPreviewDecorations(root);
        return;
      }

      replaceBadgeText(root, PREVIEW_STATUS, 'تجريبية');
      replaceBadgeText(root, 'shadow', 'ظل');

      const cards = [...root.querySelectorAll('.payment-card')];
      if (!cards.length) {
        root.querySelector('.shadow-preview-banner')?.remove();
        const empty = root.querySelector('.empty');
        const previewCopy = 'لا توجد مطابقات تجريبية لهذا النشاط الآن.<br>تظهر هنا عمليات الظل المطابقة دون أن تدخل التشغيل.';
        if (empty && empty.innerHTML !== previewCopy) empty.innerHTML = previewCopy;
        return;
      }

      if (!root.querySelector('.shadow-preview-banner')) {
        const banner = document.createElement('section');
        banner.className = 'shadow-preview-banner';
        banner.innerHTML = '<strong>مطابقات تجريبية فقط</strong><span>هذه العمليات طابقت حساب النشاط في وضع الظل، لكنها لم تدخل وارد التشغيل ولا يمكن استلامها أو إكمالها.</span>';
        root.prepend(banner);
      }

      cards.forEach(card => {
        if (!card.classList.contains('shadow-preview-card')) card.classList.add('shadow-preview-card');
        card.dataset.operational = 'false';
        const item = previewItems.get(String(card.dataset.itemId || ''));
        renderGateReasons(card, item);

        const actions = card.querySelector('.card-actions');
        if (!actions || actions.querySelector('.preview-operation-note')) return;
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

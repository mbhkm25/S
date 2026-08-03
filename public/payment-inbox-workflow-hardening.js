(() => {
  'use strict';

  const config = window.SANAD_PUBLIC_API_CONFIG;
  if (!config) return;

  const nativeFetch = window.fetch.bind(window);
  const AUTH_KEY = `sb-${config.projectRef}-auth-token`;
  const itemCache = new Map();
  let currentSession = null;
  let supervisor = false;
  let activeBusinessId = null;
  let observer = null;
  let decorateFrame = 0;

  const VIEW_MAP = Object.freeze({
    new: 'new',
    claimed: 'mine',
    mine: 'mine',
    team_active: 'team_active',
    review_required: 'review',
    review: 'review',
    completed: 'completed',
    all: 'all'
  });

  const ACTION_MAP = Object.freeze({
    claim_business_payment: 'claim_business_payment_v2',
    heartbeat_business_payment_claim: 'heartbeat_business_payment_claim_v2',
    complete_business_payment: 'complete_business_payment_v2',
    release_business_payment: 'release_business_payment_v2',
    reject_business_payment: 'reject_business_payment_v2'
  });

  const EVENT_LABELS = Object.freeze({
    enqueued: 'وصلت إلى وارد المدفوعات',
    claimed: 'استلم العملية',
    claim_renewed: 'مدّد مدة الاستلام',
    claim_conflict: 'محاولة استلام متزامنة',
    released: 'حرر العملية',
    completed: 'أكمل العملية',
    review_required: 'أحالها إلى المراجعة',
    rejected: 'رفض المطابقة',
    cancelled: 'ألغى العملية',
    reassigned: 'أعاد تعيين العملية',
    expired_claim_released: 'انتهت مهلة الاستلام',
    stale_action_rejected: 'رُفض إجراء من بطاقة قديمة'
  });

  const ERROR_LABELS = Object.freeze({
    stale_item: 'تغيّرت العملية على جهاز آخر. تم تحديث البيانات؛ أعد تنفيذ الإجراء.',
    claim_race_lost: 'سبقك عضو آخر إلى استلام العملية.',
    not_claimable: 'لم تعد العملية متاحة للاستلام.',
    payment_not_claimed: 'العملية لم تعد مستلمة. تم تحديث حالتها.',
    payment_not_reassignable: 'لا يمكن إعادة تعيين العملية في حالتها الحالية.',
    payment_not_in_review: 'العملية لم تعد في قسم المراجعة.',
    claim_not_owned_expired_or_stale: 'انتهت مهلة الاستلام أو تغيّرت العملية على جهاز آخر.'
  });

  function rpcName(input) {
    const value = typeof input === 'string' || input instanceof URL ? String(input) : input?.url;
    if (!value) return null;
    try {
      const url = new URL(value, location.href);
      const marker = '/rest/v1/rpc/';
      const index = url.pathname.indexOf(marker);
      return index < 0 ? null : decodeURIComponent(url.pathname.slice(index + marker.length));
    } catch {
      return null;
    }
  }

  function parseBody(init) {
    if (!init?.body || typeof init.body !== 'string') return {};
    try { return JSON.parse(init.body); } catch { return {}; }
  }

  function replaceRpcUrl(input, name) {
    const source = typeof input === 'string' || input instanceof URL ? String(input) : input.url;
    const url = new URL(source, location.href);
    url.pathname = `${url.pathname.slice(0, url.pathname.indexOf('/rest/v1/rpc/'))}/rest/v1/rpc/${name}`;
    return url.toString();
  }

  function jsonResponse(payload, status = 200, original = null) {
    const headers = new Headers(original?.headers || undefined);
    headers.set('Content-Type', 'application/json');
    return new Response(JSON.stringify(payload), { status, statusText: status >= 400 ? 'Conflict' : 'OK', headers });
  }

  function rememberItems(payload) {
    const items = Array.isArray(payload?.items) ? payload.items : [];
    items.forEach(item => {
      if (item?.id) itemCache.set(String(item.id), item);
    });
    if (payload?.viewer) supervisor = payload.viewer.is_supervisor === true;
    window.dispatchEvent(new CustomEvent('sanad:payment-inbox-v2-loaded', { detail: payload }));
  }

  function actionBody(name, body) {
    const item = itemCache.get(String(body.p_inbox_id || ''));
    const expected = item?.row_version ?? null;
    if (name === 'claim_business_payment') {
      return { p_inbox_id: body.p_inbox_id, p_expected_row_version: expected, p_lease_seconds: body.p_lease_seconds || 300, p_source: 'payment_inbox' };
    }
    if (name === 'heartbeat_business_payment_claim') {
      return { p_inbox_id: body.p_inbox_id, p_expected_row_version: expected, p_lease_seconds: body.p_lease_seconds || 300 };
    }
    if (name === 'complete_business_payment') {
      return { p_inbox_id: body.p_inbox_id, p_expected_row_version: expected, p_note: body.p_note || null, p_source: 'payment_inbox' };
    }
    if (name === 'release_business_payment') {
      return { p_inbox_id: body.p_inbox_id, p_expected_row_version: expected, p_reason: body.p_reason, p_source: 'payment_inbox' };
    }
    if (name === 'reject_business_payment') {
      return { p_inbox_id: body.p_inbox_id, p_expected_row_version: expected, p_reason: body.p_reason, p_source: 'admin' };
    }
    return body;
  }

  window.fetch = async function paymentWorkflowFetch(input, init = undefined) {
    const name = rpcName(input);
    if (!name) return nativeFetch(input, init);

    const body = parseBody(init);
    let targetName = name;
    let targetBody = body;

    if (name === 'get_my_business_payment_inbox_contexts') {
      targetName = 'get_my_business_payment_inbox_contexts_v2';
      targetBody = {};
    } else if (name === 'get_business_payment_inbox' && body.p_status !== 'shadow_preview') {
      targetName = 'get_business_payment_inbox_v2';
      targetBody = {
        p_business_id: body.p_business_id,
        p_view: VIEW_MAP[body.p_status] || 'new',
        p_limit: body.p_limit || 50,
        p_before_created_at: body.p_before_created_at || null,
        p_before_id: body.p_before_id || null
      };
      activeBusinessId = body.p_business_id || activeBusinessId;
    } else if (ACTION_MAP[name]) {
      targetName = ACTION_MAP[name];
      targetBody = actionBody(name, body);
    } else {
      return nativeFetch(input, init);
    }

    const response = await nativeFetch(replaceRpcUrl(input, targetName), {
      ...(init || {}),
      body: JSON.stringify(targetBody)
    });

    if (!response.ok) return response;

    let payload;
    try { payload = await response.clone().json(); } catch { return response; }

    if (targetName === 'get_my_business_payment_inbox_contexts_v2') {
      const contexts = Array.isArray(payload?.items) ? payload.items : [];
      const selected = activeBusinessId
        ? contexts.find(item => item.business_id === activeBusinessId)
        : contexts[0];
      supervisor = selected?.is_supervisor === true;
      window.dispatchEvent(new CustomEvent('sanad:payment-contexts-v2-loaded', { detail: payload }));
    }

    if (targetName === 'get_business_payment_inbox_v2') rememberItems(payload);

    if (ACTION_MAP[name]) {
      const changed = payload?.item || payload?.inbox || payload?.workflow?.inbox;
      if (changed?.id) itemCache.set(String(changed.id), changed);
      if (payload?.ok === false && name !== 'claim_business_payment') {
        return jsonResponse({ message: ERROR_LABELS[payload.reason] || 'تغيّرت حالة العملية. حدّث البيانات وحاول مجددًا.', reason: payload.reason }, 409, response);
      }
      if (payload?.ok === false && payload.reason === 'stale_item') {
        return jsonResponse({ message: ERROR_LABELS.stale_item, reason: payload.reason }, 409, response);
      }
    }

    return jsonResponse(payload, 200, response);
  };

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
          const chunked = unwrapSession(chunks.map(key => storage.getItem(key) || '').join(''));
          if (chunked) return chunked;
        }
      } catch { /* storage can be unavailable */ }
    }
    return null;
  }

  async function directRpc(name, body = {}) {
    if (!currentSession) currentSession = readSession();
    if (!currentSession?.access_token) throw new Error('انتهت جلسة الدخول. افتح سند وسجّل الدخول مجددًا.');
    const response = await nativeFetch(`${config.apiUrl}/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: config.anonKey,
        Authorization: `Bearer ${currentSession.access_token}`
      },
      body: JSON.stringify(body)
    });
    const text = await response.text();
    let payload = null;
    try { payload = text ? JSON.parse(text) : null; } catch { payload = text; }
    if (!response.ok) throw new Error(payload?.message || payload?.hint || 'تعذر تنفيذ الإجراء.');
    if (payload?.ok === false) throw new Error(ERROR_LABELS[payload.reason] || 'تغيّرت حالة العملية. حدّث البيانات وحاول مجددًا.');
    return payload;
  }

  function esc(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function formatDate(value) {
    if (!value) return '—';
    try { return new Intl.DateTimeFormat('ar-YE', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)); }
    catch { return '—'; }
  }

  function ensureSupervisorTabs() {
    if (!supervisor) return;
    const tabs = document.querySelector('.tabs');
    if (!tabs) return;
    const claimed = tabs.querySelector('[data-status="claimed"]');
    const shadow = tabs.querySelector('[data-status="shadow_preview"]');
    if (!tabs.querySelector('[data-status="team_active"]')) {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.status = 'team_active';
      button.textContent = 'لدى الفريق';
      claimed?.insertAdjacentElement('afterend', button);
    }
    if (!tabs.querySelector('[data-status="all"]')) {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.status = 'all';
      button.textContent = 'كل العمليات';
      shadow?.insertAdjacentElement('beforebegin', button);
    }
  }

  function modalElements() {
    return {
      modal: document.getElementById('actionModal'),
      title: document.getElementById('modalTitle'),
      body: document.getElementById('modalBody')
    };
  }

  function closeModal() {
    const { modal } = modalElements();
    if (!modal) return;
    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }

  function openModal(title, content) {
    const elements = modalElements();
    if (!elements.modal || !elements.title || !elements.body) return;
    elements.title.textContent = title;
    elements.body.innerHTML = content;
    elements.modal.classList.remove('hidden');
    elements.modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }

  function notifyRefresh() {
    document.getElementById('refreshButton')?.click();
  }

  async function openHistory(item) {
    openModal('سجل العملية', '<section class="workflow-loading">جارٍ تحميل سجل الإجراءات…</section>');
    try {
      const payload = await directRpc('get_business_payment_inbox_events_v2', { p_inbox_id: item.id, p_limit: 100 });
      const events = Array.isArray(payload?.items) ? payload.items : [];
      const body = events.length
        ? `<section class="workflow-timeline">${events.map(event => `<article><span class="workflow-timeline-dot"></span><div><strong>${esc(EVENT_LABELS[event.event_type] || event.event_type)}</strong><p>${esc(event.actor_name || 'النظام')} · ${esc(formatDate(event.created_at))}</p>${event.reason ? `<small>${esc(event.reason)}</small>` : ''}</div></article>`).join('')}</section>`
        : '<section class="workflow-empty">لا توجد أحداث مسجلة لهذه العملية.</section>';
      openModal('سجل العملية', body);
    } catch (error) {
      openModal('سجل العملية', `<section class="workflow-error">${esc(error.message)}</section>`);
    }
  }

  function openReasonAction(item, mode) {
    const configByMode = {
      review: { title: 'إحالة العملية إلى المراجعة', label: 'سبب الإحالة', min: 5, rpc: 'request_business_payment_review_v2', source: 'payment_inbox' },
      release: { title: 'تحرير العملية', label: 'سبب التحرير', min: 3, rpc: 'release_business_payment_v2', source: 'admin' }
    };
    const modeConfig = configByMode[mode];
    openModal(modeConfig.title, `<section class="modal-section"><label>${modeConfig.label}<textarea id="workflowReason" minlength="${modeConfig.min}" placeholder="اكتب سببًا واضحًا"></textarea></label><div class="modal-actions"><button type="button" id="workflowCancel" class="secondary">إلغاء</button><button type="button" id="workflowConfirm" class="primary">تأكيد</button></div></section>`);
    document.getElementById('workflowCancel')?.addEventListener('click', closeModal);
    document.getElementById('workflowConfirm')?.addEventListener('click', async event => {
      const button = event.currentTarget;
      const reason = document.getElementById('workflowReason')?.value?.trim() || '';
      if (reason.length < modeConfig.min) return;
      button.disabled = true;
      try {
        await directRpc(modeConfig.rpc, {
          p_inbox_id: item.id,
          p_expected_row_version: item.row_version,
          p_reason: reason,
          p_source: modeConfig.source
        });
        closeModal();
        notifyRefresh();
      } catch (error) {
        button.disabled = false;
        const field = document.getElementById('workflowReason');
        field?.insertAdjacentHTML('afterend', `<p class="workflow-error">${esc(error.message)}</p>`);
      }
    });
  }

  async function openReassign(item) {
    openModal('إعادة تعيين العملية', '<section class="workflow-loading">جارٍ تحميل أعضاء الفريق…</section>');
    try {
      const payload = await directRpc('get_business_payment_claim_assignees', { p_business_id: item.business_id });
      const members = Array.isArray(payload?.items) ? payload.items : [];
      openModal('إعادة تعيين العملية', `<section class="modal-section"><label>عضو الفريق<select id="workflowAssignee">${members.map(member => `<option value="${esc(member.user_id)}">${esc(member.full_name || 'عضو الفريق')}${member.job_title ? ` — ${esc(member.job_title)}` : ''}</option>`).join('')}</select></label><label>سبب إعادة التعيين<textarea id="workflowReason" minlength="5" placeholder="اكتب سببًا واضحًا"></textarea></label><div class="modal-actions"><button type="button" id="workflowCancel" class="secondary">إلغاء</button><button type="button" id="workflowConfirm" class="primary">إعادة التعيين</button></div></section>`);
      document.getElementById('workflowCancel')?.addEventListener('click', closeModal);
      document.getElementById('workflowConfirm')?.addEventListener('click', async event => {
        const button = event.currentTarget;
        const userId = document.getElementById('workflowAssignee')?.value;
        const reason = document.getElementById('workflowReason')?.value?.trim() || '';
        if (!userId || reason.length < 5) return;
        button.disabled = true;
        try {
          await directRpc('reassign_business_payment_v2', {
            p_inbox_id: item.id,
            p_user_id: userId,
            p_expected_row_version: item.row_version,
            p_reason: reason,
            p_source: 'admin'
          });
          closeModal();
          notifyRefresh();
        } catch (error) {
          button.disabled = false;
          document.getElementById('workflowReason')?.insertAdjacentHTML('afterend', `<p class="workflow-error">${esc(error.message)}</p>`);
        }
      });
    } catch (error) {
      openModal('إعادة تعيين العملية', `<section class="workflow-error">${esc(error.message)}</section>`);
    }
  }

  function addButton(group, label, action, tone = 'secondary') {
    if (group.querySelector(`[data-workflow-action="${action}"]`)) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = tone;
    button.dataset.workflowAction = action;
    button.textContent = label;
    group.appendChild(button);
  }

  function decorateCard(card) {
    const id = card.getAttribute('data-item-id');
    const item = itemCache.get(String(id || ''));
    if (!item) return;
    const group = card.querySelector('.action-group');
    if (!group) return;

    if (item.status === 'claimed') {
      let owner = card.querySelector('.workflow-claim-owner');
      if (!owner) {
        owner = document.createElement('div');
        owner.className = 'workflow-claim-owner';
        card.querySelector('.card-actions')?.insertAdjacentElement('beforebegin', owner);
      }
      owner.innerHTML = `<strong>${item.is_mine ? 'العملية لديك' : `استلمها ${esc(item.claimed_by_name || 'عضو الفريق')}`}</strong><span>تنتهي المهلة ${esc(formatDate(item.claim_expires_at))}</span>`;
    }

    const permissions = item.action_permissions || {};
    if (permissions.can_request_review) addButton(group, 'تحتاج مراجعة', 'review');
    if (permissions.can_reassign) addButton(group, 'إعادة تعيين', 'reassign');
    if (permissions.can_release && !item.is_mine) addButton(group, 'تحرير', 'supervisor-release');
    if (permissions.can_view_history) addButton(group, 'سجل الإجراءات', 'history');

    group.querySelectorAll('[data-workflow-action]').forEach(button => {
      if (button.dataset.workflowBound === 'true') return;
      button.dataset.workflowBound = 'true';
      button.addEventListener('click', event => {
        event.stopPropagation();
        const action = button.dataset.workflowAction;
        if (action === 'history') void openHistory(item);
        else if (action === 'review') openReasonAction(item, 'review');
        else if (action === 'reassign') void openReassign(item);
        else if (action === 'supervisor-release') openReasonAction(item, 'release');
      });
    });
  }

  function scheduleDecorate() {
    cancelAnimationFrame(decorateFrame);
    decorateFrame = requestAnimationFrame(() => {
      ensureSupervisorTabs();
      document.querySelectorAll('#queueSection .payment-card').forEach(decorateCard);
    });
  }

  function installStyles() {
    if (document.getElementById('paymentWorkflowHardeningStyles')) return;
    const style = document.createElement('style');
    style.id = 'paymentWorkflowHardeningStyles';
    style.textContent = `
      .workflow-claim-owner{display:flex;align-items:center;justify-content:space-between;gap:.75rem;padding:.7rem .85rem;border-radius:1rem;background:#eff6ff;color:#1e3a5f;font-family:"IBM Plex Sans Arabic",sans-serif}
      .workflow-claim-owner strong{font-size:.82rem}.workflow-claim-owner span{font-size:.68rem;color:#64748b}
      .workflow-timeline{display:grid;gap:.25rem}.workflow-timeline article{position:relative;display:grid;grid-template-columns:1rem 1fr;gap:.65rem;padding:.75rem 0;border-bottom:1px solid #e8edf3}.workflow-timeline article:last-child{border-bottom:0}.workflow-timeline-dot{width:.7rem;height:.7rem;border-radius:999px;background:#0f766e;margin-top:.3rem;box-shadow:0 0 0 .25rem #ccfbf1}.workflow-timeline strong{font-size:.9rem}.workflow-timeline p{margin:.2rem 0 0;color:#64748b;font-size:.75rem}.workflow-timeline small{display:block;margin-top:.35rem;color:#334155;font-size:.76rem;line-height:1.6}.workflow-loading,.workflow-empty,.workflow-error{padding:1.5rem;text-align:center;font-family:"IBM Plex Sans Arabic",sans-serif}.workflow-error{color:#be123c}.modal-section select{width:100%;min-height:3rem;border:1px solid #d8e0e9;border-radius:.9rem;padding:.65rem .8rem;background:#fff;font-family:"IBM Plex Sans Arabic",sans-serif}
      @media(max-width:480px){.workflow-claim-owner{align-items:flex-start;flex-direction:column;gap:.2rem}.action-group [data-workflow-action]{min-height:2.75rem}}
    `;
    document.head.appendChild(style);
  }

  function start() {
    installStyles();
    const queue = document.getElementById('queueSection');
    if (queue) {
      observer = new MutationObserver(scheduleDecorate);
      observer.observe(queue, { childList: true, subtree: true });
    }
    window.addEventListener('sanad:payment-contexts-v2-loaded', event => {
      const contexts = Array.isArray(event.detail?.items) ? event.detail.items : [];
      activeBusinessId = document.getElementById('businessSelect')?.value || activeBusinessId;
      const context = contexts.find(item => item.business_id === activeBusinessId) || contexts[0];
      supervisor = context?.is_supervisor === true;
      scheduleDecorate();
    });
    window.addEventListener('sanad:payment-inbox-v2-loaded', scheduleDecorate);
    document.getElementById('businessSelect')?.addEventListener('change', event => {
      activeBusinessId = event.target.value;
    });
    scheduleDecorate();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();

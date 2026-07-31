(() => {
  'use strict';

  const API_URL = 'https://api.sanadflow.com';
  const REALTIME_URL = 'wss://api.sanadflow.com/realtime/v1/websocket';
  const PROJECT_REF = 'hudbzlgclghlhazlduas';
  const AUTH_KEY = `sb-${PROJECT_REF}-auth-token`;
  const ACTIVE_BUSINESS_KEY = 'sanad.activeManagedBusinessId';
  const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh1ZGJ6bGdobGhhemxkdWFzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI4NzI3NzEsImV4cCI6MjA5ODQ0ODc1MX0.7qf_M7V4njqiOcEeJp6smL68pndBxRLfXa9SgL8mVwo';

  const STATUS_LABELS = {
    new: 'جديدة', claimed: 'مستلمة', completed: 'مكتملة', released: 'متاحة مجددًا',
    review_required: 'تحتاج مراجعة', rejected: 'مرفوضة', cancelled: 'ملغاة'
  };

  const state = {
    session: null,
    userId: null,
    contexts: [],
    businessId: null,
    status: 'new',
    items: [],
    permissions: {},
    socket: null,
    socketRef: 1,
    socketHeartbeat: null,
    reconnectTimer: null,
    pollTimer: null,
    modalItem: null,
    claimHeartbeat: null,
    loading: false
  };

  const byId = id => document.getElementById(id);
  const notice = byId('notice');
  const modal = byId('actionModal');
  const numberFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
  const dateFormat = new Intl.DateTimeFormat('ar-YE', { dateStyle: 'medium', timeStyle: 'short' });

  function esc(value) {
    return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }

  function formatNumber(value) {
    return value == null || Number.isNaN(Number(value)) ? '—' : numberFormat.format(Number(value));
  }

  function formatDate(value) {
    if (!value) return '—';
    try { return dateFormat.format(new Date(value)); } catch { return '—'; }
  }

  function showNotice(message, tone = 'info') {
    notice.textContent = message;
    notice.className = `notice ${tone}`;
    clearTimeout(showNotice.timer);
    showNotice.timer = setTimeout(() => notice.classList.add('hidden'), 5500);
  }

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

  function readStoredSession() {
    for (const storage of [localStorage, sessionStorage]) {
      try {
        const direct = unwrapSession(storage.getItem(AUTH_KEY));
        if (direct) return direct;
        const keys = [];
        for (let index = 0; index < storage.length; index += 1) {
          const key = storage.key(index);
          if (key?.startsWith(`${AUTH_KEY}.`)) keys.push(key);
        }
        if (keys.length) {
          keys.sort((a, b) => Number(a.split('.').pop()) - Number(b.split('.').pop()));
          const chunked = unwrapSession(keys.map(key => storage.getItem(key) || '').join(''));
          if (chunked) return chunked;
        }
      } catch { /* storage may be unavailable */ }
    }
    return null;
  }

  function userIdFromToken(token) {
    try { return JSON.parse(decodeBase64Url(token.split('.')[1])).sub || null; } catch { return null; }
  }

  async function refreshSession(session) {
    if (!session?.refresh_token) return session;
    const response = await fetch(`${API_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', apikey: ANON_KEY },
      body: JSON.stringify({ refresh_token: session.refresh_token })
    });
    if (!response.ok) return session;
    const refreshed = await response.json();
    return refreshed?.access_token ? refreshed : session;
  }

  async function ensureSession(force = false) {
    if (!state.session) state.session = readStoredSession();
    if (!state.session) throw new Error('سجّل الدخول إلى تطبيق سند أولًا، ثم افتح وارد المدفوعات من إدارة النشاط.');
    const expiresAt = Number(state.session.expires_at || 0) * 1000;
    if (force || (expiresAt && expiresAt < Date.now() + 90_000)) state.session = await refreshSession(state.session);
    state.userId = userIdFromToken(state.session.access_token);
    return state.session;
  }

  async function rpc(name, body = {}, retry = true) {
    const session = await ensureSession();
    const response = await fetch(`${API_URL}/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: ANON_KEY, Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify(body)
    });
    if (response.status === 401 && retry) {
      await ensureSession(true);
      return rpc(name, body, false);
    }
    const text = await response.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    if (!response.ok) throw new Error(data?.message || data?.hint || `تعذر تنفيذ ${name}`);
    return data;
  }

  function statusTone(status) {
    if (status === 'completed') return 'green';
    if (status === 'review_required' || status === 'released') return 'amber';
    if (status === 'rejected' || status === 'cancelled') return 'red';
    return 'blue';
  }

  function badge(label, tone = 'blue') { return `<span class="badge ${tone}">${esc(label)}</span>`; }

  function setConnection(mode, text) {
    const root = byId('connectionState');
    root.className = `connection-pill ${mode}`;
    root.innerHTML = `<span></span>${esc(text)}`;
  }

  function renderContexts() {
    const select = byId('businessSelect');
    select.innerHTML = state.contexts.map(item => `<option value="${esc(item.business_id)}">${esc(item.business_name)}</option>`).join('');
    if (state.businessId) select.value = state.businessId;
  }

  function activeContext() { return state.contexts.find(item => item.business_id === state.businessId) || null; }

  function renderStats() {
    const counts = activeContext()?.counts || {};
    const cards = [
      ['جديدة', counts.new || 0], ['لدي', counts.mine || 0], ['تحتاج مراجعة', counts.review_required || 0], ['مكتملة اليوم', counts.completed_today || 0]
    ];
    byId('statsSection').innerHTML = cards.map(([label, value]) => `<article class="stat"><strong>${formatNumber(value)}</strong><span>${esc(label)}</span></article>`).join('');
  }

  function actionButtons(item) {
    const buttons = [`<a class="secondary" target="_blank" rel="noopener" href="/v/${encodeURIComponent(item.public_token)}?src=app">فتح الإشعار</a>`];
    const mine = item.claimed_by_user_id === state.userId;
    if (['new', 'released'].includes(item.status) && state.permissions.claim) buttons.push(`<button class="primary" data-action="claim" data-id="${esc(item.id)}">استلام العملية</button>`);
    if (item.status === 'claimed' && mine) {
      if (state.permissions.complete) buttons.push(`<button class="primary" data-action="complete" data-id="${esc(item.id)}">إكمال</button>`);
      if (state.permissions.release) buttons.push(`<button class="secondary" data-action="release" data-id="${esc(item.id)}">تحرير</button>`);
    }
    if (item.status === 'review_required' && state.permissions.review) buttons.push(`<button class="danger" data-action="reject" data-id="${esc(item.id)}">رفض المطابقة</button>`);
    return buttons.join('');
  }

  function renderQueue() {
    const root = byId('queueSection');
    if (!state.items.length) {
      root.innerHTML = `<div class="empty">لا توجد عمليات في هذا القسم الآن.<br>ستظهر العمليات الجديدة تلقائيًا عند وصولها.</div>`;
      return;
    }
    root.innerHTML = state.items.map(item => {
      const mine = item.claimed_by_user_id === state.userId;
      const claimText = item.status === 'claimed' ? (mine ? 'مستلمة على جهازك' : `استلمها ${item.claimed_by_name || 'عضو آخر'}`) : null;
      return `<article class="payment-card" data-item-id="${esc(item.id)}">
        <div class="card-head"><div><div class="amount">${formatNumber(item.amount)} <small>${esc(item.currency || '')}</small></div><div class="meta">${esc(item.financial_entity || 'جهة مالية')} · ${formatDate(item.transaction_datetime || item.created_at)}</div></div>
        <div class="badges">${badge(STATUS_LABELS[item.status] || item.status, statusTone(item.status))}${item.source_mode !== 'live' ? badge(item.source_mode, 'amber') : ''}${mine ? badge('لدي', 'green') : ''}</div></div>
        <div class="facts">
          <div class="fact"><span>المستلم</span><strong>${esc(item.receiver_name || '—')}</strong></div>
          <div class="fact"><span>الحساب/النقطة</span><strong>${esc(item.receiver_account || item.merchant_point || '—')}</strong></div>
          <div class="fact"><span>الحساب المالي</span><strong>${esc(item.account_label || item.account_holder_name || '—')}</strong></div>
          <div class="fact"><span>مرجع العملية</span><strong>${esc(item.reference_number || '—')}</strong></div>
        </div>
        <div class="card-actions"><span class="meta">${esc(claimText || item.match_strategy || '')}</span><div class="action-group">${actionButtons(item)}</div></div>
      </article>`;
    }).join('');
    root.querySelectorAll('[data-action]').forEach(button => button.addEventListener('click', () => handleAction(button.dataset.action, button.dataset.id)));
  }

  async function loadContexts() {
    const result = await rpc('get_my_business_payment_inbox_contexts');
    state.contexts = Array.isArray(result?.items) ? result.items : [];
    if (!state.contexts.length) throw new Error('لا يوجد نشاط تملك فيه صلاحية عرض وارد المدفوعات.');
    const requested = new URL(location.href).searchParams.get('business_id');
    const remembered = sessionStorage.getItem(ACTIVE_BUSINESS_KEY);
    const selected = [requested, remembered, state.contexts[0].business_id].find(id => state.contexts.some(item => item.business_id === id));
    state.businessId = selected || state.contexts[0].business_id;
    sessionStorage.setItem(ACTIVE_BUSINESS_KEY, state.businessId);
    renderContexts();
    renderStats();
  }

  async function loadQueue(quiet = false) {
    if (!state.businessId || state.loading) return;
    state.loading = true;
    if (!quiet) byId('queueSection').innerHTML = '<div class="panel loading"><div class="spinner"></div></div>';
    try {
      const result = await rpc('get_business_payment_inbox', {
        p_business_id: state.businessId,
        p_status: state.status,
        p_limit: 100,
        p_before_created_at: null,
        p_before_id: null
      });
      state.items = Array.isArray(result?.items) ? result.items : [];
      state.permissions = result?.permissions || {};
      renderQueue();
      const contexts = await rpc('get_my_business_payment_inbox_contexts');
      state.contexts = Array.isArray(contexts?.items) ? contexts.items : state.contexts;
      renderStats();
    } catch (error) {
      showNotice(error.message || 'تعذر تحميل وارد المدفوعات.', 'error');
      if (!quiet) byId('queueSection').innerHTML = `<div class="empty">${esc(error.message || 'تعذر التحميل.')}</div>`;
    } finally {
      state.loading = false;
      byId('refreshButton').textContent = '↻';
    }
  }

  function itemById(id) { return state.items.find(item => item.id === id) || null; }

  function openModal(item, mode) {
    state.modalItem = item;
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    const titles = { complete: 'إكمال العملية', release: 'تحرير العملية', reject: 'رفض المطابقة' };
    byId('modalTitle').textContent = titles[mode] || 'العملية';
    const needsReason = mode !== 'complete';
    byId('modalBody').innerHTML = `<section class="modal-section"><h3>ملخص العملية</h3><div class="detail-grid">
      <div class="detail-row"><span>المبلغ</span><strong>${formatNumber(item.amount)} ${esc(item.currency || '')}</strong></div>
      <div class="detail-row"><span>الجهة</span><strong>${esc(item.financial_entity || '—')}</strong></div>
      <div class="detail-row"><span>المستلم</span><strong>${esc(item.receiver_name || '—')}</strong></div>
      <div class="detail-row"><span>الحساب</span><strong>${esc(item.receiver_account || item.merchant_point || '—')}</strong></div>
    </div></section>
    <section class="modal-section"><label>${needsReason ? 'السبب' : 'ملاحظة الإكمال'}<textarea id="actionNote" placeholder="${needsReason ? 'اكتب سببًا واضحًا' : 'ملاحظة اختيارية'}"></textarea></label>
      <div class="modal-actions"><button id="cancelAction" class="secondary" type="button">إلغاء</button><button id="confirmAction" class="${mode === 'reject' ? 'danger' : 'primary'}" type="button">تأكيد</button></div>
    </section>`;
    byId('cancelAction').addEventListener('click', closeModal);
    byId('confirmAction').addEventListener('click', () => submitModalAction(mode));
  }

  function stopClaimHeartbeat() {
    clearInterval(state.claimHeartbeat);
    state.claimHeartbeat = null;
  }

  function closeModal() {
    stopClaimHeartbeat();
    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    state.modalItem = null;
  }

  async function submitModalAction(mode) {
    const item = state.modalItem;
    if (!item) return;
    const button = byId('confirmAction');
    const note = byId('actionNote').value.trim();
    if (mode !== 'complete' && note.length < (mode === 'reject' ? 5 : 3)) {
      showNotice('اكتب سببًا واضحًا قبل المتابعة.', 'error');
      return;
    }
    button.disabled = true;
    try {
      if (mode === 'complete') await rpc('complete_business_payment', { p_inbox_id: item.id, p_note: note || null });
      else if (mode === 'release') await rpc('release_business_payment', { p_inbox_id: item.id, p_reason: note });
      else if (mode === 'reject') await rpc('reject_business_payment', { p_inbox_id: item.id, p_reason: note });
      closeModal();
      showNotice(mode === 'complete' ? 'تم إكمال العملية وتسجيل المنفذ.' : 'تم تحديث حالة العملية.', 'success');
      await loadQueue(true);
    } catch (error) {
      showNotice(error.message || 'تعذر تنفيذ الإجراء.', 'error');
    } finally { button.disabled = false; }
  }

  async function handleAction(action, id) {
    const item = itemById(id);
    if (!item) return;
    if (action === 'claim') {
      const button = document.querySelector(`[data-action="claim"][data-id="${CSS.escape(id)}"]`);
      if (button) button.disabled = true;
      try {
        const result = await rpc('claim_business_payment', { p_inbox_id: id, p_lease_seconds: 300 });
        if (!result?.claimed) throw new Error(result?.reason === 'claim_race_lost' ? 'سبقك عضو آخر إلى استلام العملية.' : 'لم تعد العملية متاحة للاستلام.');
        showNotice('تم استلام العملية على جهازك لمدة خمس دقائق قابلة للتجديد.', 'success');
        state.status = 'claimed';
        document.querySelectorAll('[data-status]').forEach(tab => tab.classList.toggle('active', tab.dataset.status === 'claimed'));
        await loadQueue(true);
      } catch (error) { showNotice(error.message || 'تعذر استلام العملية.', 'error'); }
      finally { if (button) button.disabled = false; }
      return;
    }
    openModal(item, action);
    if (item.status === 'claimed' && item.claimed_by_user_id === state.userId) {
      stopClaimHeartbeat();
      state.claimHeartbeat = setInterval(() => rpc('heartbeat_business_payment_claim', { p_inbox_id: item.id, p_lease_seconds: 300 }).catch(() => undefined), 90_000);
    }
  }

  function disconnectRealtime() {
    clearTimeout(state.reconnectTimer);
    clearInterval(state.socketHeartbeat);
    state.socketHeartbeat = null;
    if (state.socket) {
      try { state.socket.close(); } catch { /* noop */ }
      state.socket = null;
    }
  }

  async function connectRealtime() {
    disconnectRealtime();
    if (!state.businessId) return;
    setConnection('connecting', 'اتصال لحظي');
    const session = await ensureSession();
    const socket = new WebSocket(`${REALTIME_URL}?apikey=${encodeURIComponent(ANON_KEY)}&vsn=1.0.0`);
    state.socket = socket;
    socket.addEventListener('open', () => {
      const ref = String(state.socketRef++);
      socket.send(JSON.stringify({
        topic: 'realtime:public:business_payment_inbox', event: 'phx_join', ref,
        payload: { config: { broadcast: { ack: false, self: false }, presence: { key: '' }, postgres_changes: [{ event: '*', schema: 'public', table: 'business_payment_inbox', filter: `business_id=eq.${state.businessId}` }] }, access_token: session.access_token }
      }));
      state.socketHeartbeat = setInterval(() => {
        if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ topic: 'phoenix', event: 'heartbeat', payload: {}, ref: String(state.socketRef++) }));
      }, 25_000);
    });
    socket.addEventListener('message', event => {
      let message;
      try { message = JSON.parse(event.data); } catch { return; }
      if (message.event === 'phx_reply' && message.payload?.status === 'ok') setConnection('online', 'تحديث لحظي');
      if (message.event === 'postgres_changes') void loadQueue(true);
      if (message.event === 'phx_error') setConnection('offline', 'انقطع الاتصال');
    });
    socket.addEventListener('close', () => {
      setConnection('offline', 'إعادة اتصال');
      if (state.businessId) state.reconnectTimer = setTimeout(() => connectRealtime().catch(() => undefined), 3500);
    });
    socket.addEventListener('error', () => setConnection('offline', 'اتصال غير مستقر'));
  }

  function startPollingFallback() {
    clearInterval(state.pollTimer);
    state.pollTimer = setInterval(() => {
      if (document.visibilityState === 'visible') void loadQueue(true);
    }, 15_000);
  }

  function bindEvents() {
    byId('refreshButton').addEventListener('click', () => { byId('refreshButton').textContent = '…'; void loadQueue(); });
    byId('businessSelect').addEventListener('change', async event => {
      state.businessId = event.target.value;
      sessionStorage.setItem(ACTIVE_BUSINESS_KEY, state.businessId);
      renderStats();
      await loadQueue();
      await connectRealtime();
    });
    document.querySelectorAll('[data-status]').forEach(tab => tab.addEventListener('click', async () => {
      state.status = tab.dataset.status;
      document.querySelectorAll('[data-status]').forEach(item => item.classList.toggle('active', item === tab));
      await loadQueue();
    }));
    byId('closeModal').addEventListener('click', closeModal);
    modal.querySelectorAll('[data-close]').forEach(element => element.addEventListener('click', closeModal));
    document.addEventListener('keydown', event => { if (event.key === 'Escape' && !modal.classList.contains('hidden')) closeModal(); });
    window.addEventListener('beforeunload', disconnectRealtime);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        void loadQueue(true);
        if (!state.socket || state.socket.readyState > WebSocket.OPEN) void connectRealtime();
      }
    });
  }

  async function boot() {
    bindEvents();
    try {
      await ensureSession();
      await loadContexts();
      await loadQueue();
      await connectRealtime();
      startPollingFallback();
    } catch (error) {
      setConnection('offline', 'غير متصل');
      showNotice(error.message || 'تعذر بدء وارد المدفوعات.', 'error');
      byId('queueSection').innerHTML = `<div class="empty">${esc(error.message || 'تعذر بدء الصفحة.')}</div>`;
    }
  }

  boot();
})();

(() => {
  'use strict';

  const config = window.SANAD_PUBLIC_API_CONFIG;
  if (!config) return;

  const AUTH_KEY = `sb-${config.projectRef}-auth-token`;
  const items = new Map();
  let isSupervisor = false;
  let currentSession = null;
  let observer = null;
  let frame = 0;

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
          const value = unwrapSession(chunks.map(key => storage.getItem(key) || '').join(''));
          if (value) return value;
        }
      } catch { /* storage may be unavailable */ }
    }
    return null;
  }

  async function rpc(name, body) {
    if (!currentSession) currentSession = readSession();
    if (!currentSession?.access_token) throw new Error('انتهت جلسة الدخول. افتح تطبيق سند وسجّل الدخول مجددًا.');
    const response = await fetch(`${config.apiUrl}/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${currentSession.access_token}`
      },
      body: JSON.stringify(body)
    });
    const text = await response.text();
    let payload = null;
    try { payload = text ? JSON.parse(text) : null; } catch { payload = text; }
    if (!response.ok) throw new Error(payload?.message || payload?.hint || 'تعذر تنفيذ الإجراء.');
    if (payload?.ok === false) {
      const message = payload.reason === 'stale_item'
        ? 'تغيّرت العملية على جهاز آخر. حدّث الصفحة ثم أعد المحاولة.'
        : 'لم تعد العملية في الحالة المتوقعة.';
      throw new Error(message);
    }
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

  function modalElements() {
    return {
      root: document.getElementById('actionModal'),
      title: document.getElementById('modalTitle'),
      body: document.getElementById('modalBody')
    };
  }

  function openModal(title, html) {
    const modal = modalElements();
    if (!modal.root || !modal.title || !modal.body) return;
    modal.title.textContent = title;
    modal.body.innerHTML = html;
    modal.root.classList.remove('hidden');
    modal.root.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }

  function closeModal() {
    const root = document.getElementById('actionModal');
    if (!root) return;
    root.classList.add('hidden');
    root.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }

  async function openResume(item) {
    openModal('إعادة العملية للمعالجة', '<section class="workflow-loading">جارٍ تحميل أعضاء الفريق…</section>');
    try {
      const payload = await rpc('get_business_payment_claim_assignees', { p_business_id: item.business_id });
      const members = Array.isArray(payload?.items) ? payload.items : [];
      if (!members.length) throw new Error('لا يوجد عضو فريق مؤهل لاستلام العملية.');
      openModal('إعادة العملية للمعالجة', `
        <section class="modal-section">
          <p class="workflow-review-help">اختر العضو الذي ستعود إليه العملية. ستظهر مباشرة في تبويب «لدي» عنده لمدة خمس دقائق قابلة للتمديد.</p>
          <label>عضو الفريق
            <select id="reviewResumeAssignee">${members.map(member => `<option value="${esc(member.user_id)}">${esc(member.full_name || 'عضو الفريق')}${member.job_title ? ` — ${esc(member.job_title)}` : ''}</option>`).join('')}</select>
          </label>
          <label>ملاحظة القرار
            <textarea id="reviewResumeNote" placeholder="ما الذي يجب على العضو مراجعته؟"></textarea>
          </label>
          <div class="modal-actions">
            <button type="button" id="reviewResumeCancel" class="secondary">إلغاء</button>
            <button type="button" id="reviewResumeConfirm" class="primary">إعادة للمعالجة</button>
          </div>
        </section>`);
      document.getElementById('reviewResumeCancel')?.addEventListener('click', closeModal);
      document.getElementById('reviewResumeConfirm')?.addEventListener('click', async event => {
        const button = event.currentTarget;
        const userId = document.getElementById('reviewResumeAssignee')?.value;
        const note = document.getElementById('reviewResumeNote')?.value?.trim() || null;
        if (!userId) return;
        button.disabled = true;
        try {
          await rpc('resume_business_payment_review_v2', {
            p_inbox_id: item.id,
            p_expected_row_version: item.row_version,
            p_user_id: userId,
            p_note: note,
            p_source: 'admin'
          });
          closeModal();
          document.getElementById('refreshButton')?.click();
        } catch (error) {
          button.disabled = false;
          document.getElementById('reviewResumeNote')?.insertAdjacentHTML('afterend', `<p class="workflow-error">${esc(error.message)}</p>`);
        }
      });
    } catch (error) {
      openModal('إعادة العملية للمعالجة', `<section class="workflow-error">${esc(error.message)}</section>`);
    }
  }

  function decorate() {
    if (!isSupervisor) return;
    document.querySelectorAll('#queueSection .payment-card').forEach(card => {
      const item = items.get(String(card.getAttribute('data-item-id') || ''));
      if (!item || item.status !== 'review_required') return;
      const group = card.querySelector('.action-group');
      if (!group || group.querySelector('[data-review-resolution="resume"]')) return;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'primary';
      button.dataset.reviewResolution = 'resume';
      button.textContent = 'إعادة للمعالجة';
      button.addEventListener('click', event => {
        event.stopPropagation();
        void openResume(item);
      });
      group.prepend(button);
    });
  }

  function schedule() {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(decorate);
  }

  function installStyles() {
    if (document.getElementById('paymentReviewResolutionStyles')) return;
    const style = document.createElement('style');
    style.id = 'paymentReviewResolutionStyles';
    style.textContent = `
      .workflow-review-help{margin:0 0 .9rem;padding:.8rem 1rem;border-radius:1rem;background:#f0f9ff;color:#0c4a6e;font-size:.8rem;line-height:1.8}
    `;
    document.head.appendChild(style);
  }

  function start() {
    installStyles();
    window.addEventListener('sanad:payment-inbox-v2-loaded', event => {
      const payload = event.detail || {};
      isSupervisor = payload?.viewer?.is_supervisor === true;
      const loaded = Array.isArray(payload?.items) ? payload.items : [];
      loaded.forEach(item => item?.id && items.set(String(item.id), item));
      schedule();
    });
    const queue = document.getElementById('queueSection');
    if (queue) {
      observer = new MutationObserver(schedule);
      observer.observe(queue, { childList: true, subtree: true });
    }
    schedule();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();

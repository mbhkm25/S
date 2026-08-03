(() => {
  'use strict';

  const items = new Map();
  let observer = null;
  let frame = 0;

  function normalize(value) {
    return String(value || '')
      .trim()
      .toLowerCase()
      .replace(/[إأآ]/g, 'ا')
      .replace(/ة/g, 'ه')
      .replace(/ى/g, 'ي')
      .replace(/[\s\-_/.,،؛:]+/g, ' ')
      .trim();
  }

  function esc(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function resolvedName(item) {
    return item.business_name || item.account_holder_name || null;
  }

  function decorateCard(card) {
    const item = items.get(String(card.getAttribute('data-item-id') || ''));
    if (!item) return;

    const trustedName = resolvedName(item);
    if (!trustedName) return;

    let identity = card.querySelector('.operation-identity-panel');
    if (!identity) {
      identity = document.createElement('section');
      identity.className = 'operation-identity-panel';
      const target = card.querySelector('.card-actions') || card.querySelector('.action-group');
      if (target) target.insertAdjacentElement('beforebegin', identity);
      else card.appendChild(identity);
    }

    const rawName = item.receiver_name || null;
    const conflict = Boolean(rawName && normalize(rawName) !== normalize(trustedName));
    const accountLabel = item.account_label || item.account_holder_name || null;

    identity.innerHTML = `
      <div class="operation-identity-heading">
        <span>النشاط المرتبط</span>
        <strong>${esc(trustedName)}</strong>
      </div>
      ${accountLabel && normalize(accountLabel) !== normalize(trustedName)
        ? `<p>الحساب المالي: <b>${esc(accountLabel)}</b></p>`
        : ''}
      ${rawName
        ? `<p class="operation-extracted-name">الاسم المستخرج من الإشعار: <b>${esc(rawName)}</b></p>`
        : ''}
      ${conflict
        ? '<p class="operation-identity-conflict">توجد ملاحظة: القراءة المستخرجة تختلف عن هوية النشاط المرتبطة.</p>'
        : ''}
    `;
  }

  function decorate() {
    document.querySelectorAll('#queueSection .payment-card').forEach(decorateCard);
  }

  function schedule() {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(decorate);
  }

  function installStyles() {
    if (document.getElementById('paymentInboxIdentityStyles')) return;
    const style = document.createElement('style');
    style.id = 'paymentInboxIdentityStyles';
    style.textContent = `
      .operation-identity-panel{display:grid;gap:.4rem;margin:.75rem 0;padding:.8rem .9rem;border:1px solid #dbe5ef;border-radius:1rem;background:#f8fafc;font-family:"IBM Plex Sans Arabic",sans-serif}
      .operation-identity-heading{display:flex;align-items:center;justify-content:space-between;gap:.75rem}
      .operation-identity-heading span{font-size:.68rem;color:#64748b}.operation-identity-heading strong{font-size:.88rem;color:#0f172a}
      .operation-identity-panel p{margin:0;font-size:.7rem;line-height:1.7;color:#64748b}
      .operation-extracted-name b{color:#334155}.operation-identity-conflict{padding:.45rem .6rem;border-radius:.7rem;background:#fff7ed!important;color:#9a3412!important}
      @media(max-width:480px){.operation-identity-heading{align-items:flex-start;flex-direction:column;gap:.15rem}.operation-identity-heading strong{font-size:.92rem}}
    `;
    document.head.appendChild(style);
  }

  function start() {
    installStyles();
    window.addEventListener('sanad:payment-inbox-v2-loaded', event => {
      const loaded = Array.isArray(event.detail?.items) ? event.detail.items : [];
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

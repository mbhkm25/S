(() => {
  'use strict';

  const queue = document.getElementById('queueSection');
  const notice = document.getElementById('notice');
  const itemCache = new Map();
  if (!queue) return;

  const ICONS = {
    eye: '<svg class="action-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="12" r="2.7" stroke="currentColor" stroke-width="1.8"/></svg>',
    claim: '<svg class="action-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3v11m0 0 4-4m-4 4-4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M5 15v3a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    verify: '<svg class="action-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3 5 6v5c0 4.5 2.8 8.2 7 10 4.2-1.8 7-5.5 7-10V6l-7-3Z" stroke="currentColor" stroke-width="1.8"/><path d="m9 12 2 2 4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    file: '<svg class="action-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M7 3h7l4 4v14H7V3Z" stroke="currentColor" stroke-width="1.8"/><path d="M14 3v5h5M10 13h5M10 17h5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>'
  };

  const LOGO_CODE_ALIASES = {
    alomqy_mobile: ['alomqy_mobile', 'alomqy', 'al-omqy'],
    albasiri_mobile: ['albasiri_mobile', 'albasiri', 'basiri'],
    kuraimi_haseb: ['kuraimi_haseb', 'kuraimi', 'alkuraimi'],
    kuraimi_mobile: ['kuraimi_mobile', 'kuraimi', 'alkuraimi'],
    bin_dowal: ['bin_dowal', 'bindawel', 'bin-dawel'],
    bin_dawel: ['bin_dawel', 'bindawel', 'bin-dawel'],
    qutaibi: ['qutaibi', 'alqutaibi'],
    mahadhar: ['mahadhar', 'almahadhar'],
    bcash: ['bcash', 'b-cash'],
    p_cash: ['p_cash', 'pcash'],
    aden_cash: ['aden_cash', 'adencash'],
    am_floos: ['am_floos', 'amfloos']
  };

  function esc(value) {
    return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }

  function normalizeDigits(value) {
    return String(value ?? '')
      .replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
      .replace(/[۰-۹]/g, d => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));
  }

  function itemFor(card) {
    return itemCache.get(String(card.dataset.itemId || '')) || null;
  }

  function installHeaderLayout() {
    const hero = document.querySelector('.hero');
    const context = document.querySelector('.context-panel');
    const tabs = document.querySelector('.tabs');
    if (!hero || hero.classList.contains('cashier-hero')) return;

    hero.classList.add('cashier-hero');
    const copy = hero.querySelector(':scope > div:first-child');
    copy?.classList.add('hero-copy');

    const operations = document.createElement('section');
    operations.className = 'hero-operations';
    operations.setAttribute('aria-label', 'سياق وارد المدفوعات');

    const business = document.createElement('div');
    business.className = 'hero-business';
    if (context) {
      while (context.firstChild) business.appendChild(context.firstChild);
      context.remove();
    }

    if (tabs) {
      tabs.classList.add('hero-tabs');
      operations.append(business, tabs);
    } else {
      operations.append(business);
    }
    hero.appendChild(operations);
  }

  function removePreferences() {
    document.getElementById('paymentInboxCardV2Toolbar')?.remove();
  }

  function logoCandidates(item) {
    const explicit = [item?.financial_entity_logo_url, item?.logo_url, item?.entity_logo_url].filter(Boolean);
    const code = String(item?.financial_entity_code || '').trim().toLowerCase();
    const aliases = LOGO_CODE_ALIASES[code] || [code].filter(Boolean);
    const paths = aliases.flatMap(alias => [
      `/assets/financial-entities/${alias}.png`,
      `/assets/financial_entities/${alias}.png`,
      `/assets/entities/${alias}.png`,
      `/images/financial-entities/${alias}.png`,
      `/logos/${alias}.png`
    ]);
    return [...new Set([...explicit, ...paths])];
  }

  function installLogo(container, item, entityName) {
    container.innerHTML = '';
    container.classList.add('financial-logo-host');
    const wrap = document.createElement('span');
    wrap.className = 'financial-logo-wrap';
    const image = document.createElement('img');
    image.className = 'financial-logo';
    image.alt = `شعار ${entityName}`;
    image.loading = 'lazy';
    const candidates = logoCandidates(item);
    let index = 0;

    const fallback = () => {
      image.remove();
      const text = document.createElement('span');
      text.className = 'financial-logo-fallback';
      text.textContent = String(entityName || 'جهة مالية').split(/\s+/).slice(0, 2).map(word => word[0] || '').join('');
      wrap.appendChild(text);
    };

    image.addEventListener('error', () => {
      index += 1;
      if (index < candidates.length) image.src = candidates[index];
      else fallback();
    });

    if (candidates.length) {
      image.src = candidates[0];
      wrap.appendChild(image);
    } else fallback();
    container.appendChild(wrap);
  }

  function bestOriginalUrl(item) {
    return item?.original_file_url || item?.file_url || item?.signed_file_url || item?.media_url ||
      `/v/${encodeURIComponent(item?.public_token || '')}?src=payment_inbox&open_original=1`;
  }

  function buildMeta(card, item) {
    card.querySelector('.cashier-meta')?.remove();
    const meta = document.createElement('div');
    meta.className = 'cashier-meta';
    const business = item?.resolved_business_name || item?.business_name || item?.account_holder_name || item?.receiver_name;
    const reference = item?.reference_number;
    const point = item?.merchant_point || item?.receiver_account;
    meta.innerHTML = [
      business ? `<span>لدى <strong>${esc(business)}</strong></span>` : '',
      point ? `<span>الحساب/النقطة <strong>${esc(normalizeDigits(point))}</strong></span>` : '',
      reference ? `<span>المرجع <strong>${esc(normalizeDigits(reference))}</strong></span>` : ''
    ].filter(Boolean).join('');
    card.querySelector('.card-actions')?.insertAdjacentElement('beforebegin', meta);
  }

  function waitForClaimSuccess(timeout = 6000) {
    return new Promise(resolve => {
      let settled = false;
      const finish = value => {
        if (settled) return;
        settled = true;
        observer.disconnect();
        clearTimeout(timer);
        resolve(value);
      };
      const observer = new MutationObserver(() => {
        const text = notice?.textContent || '';
        if (text.includes('تم استلام العملية')) finish(true);
        if (notice?.classList.contains('error')) finish(false);
      });
      if (notice) observer.observe(notice, { childList: true, characterData: true, subtree: true, attributes: true });
      const timer = setTimeout(() => finish(false), timeout);
    });
  }

  function rebuildActions(card, item) {
    const group = card.querySelector('.action-group');
    if (!group || !item) return;
    const existingClaim = group.querySelector('[data-action="claim"]');
    const openHref = `/v/${encodeURIComponent(item.public_token)}?src=payment_inbox`;
    const originalHref = bestOriginalUrl(item);
    const canClaim = Boolean(existingClaim);

    const open = `<a class="cashier-open" target="_blank" rel="noopener" href="${esc(openHref)}">${ICONS.eye}<span>فتح الإشعار</span></a>`;
    const claim = canClaim ? `<button class="cashier-claim" type="button" data-cashier-action="claim">${ICONS.claim}<span>استلام العملية</span></button>` : '';
    const claimVerify = canClaim ? `<button class="cashier-claim-verify" type="button" data-cashier-action="claim-verify">${ICONS.verify}<span>استلام وتحقق</span></button>` : '';
    const original = `<a class="cashier-original" target="_blank" rel="noopener" href="${esc(originalHref)}">${ICONS.file}<span>فتح الملف الأصلي</span></a>`;

    if (!canClaim) {
      const preserved = [...group.children]
        .filter(node => node.matches?.('[data-action]:not([data-action="claim"])'))
        .map(node => node.outerHTML)
        .join('');
      group.innerHTML = open + original + preserved;
      return;
    }

    group.innerHTML = open + claim + claimVerify + original;
    group.querySelector('[data-cashier-action="claim"]')?.addEventListener('click', () => existingClaim.click());
    group.querySelector('[data-cashier-action="claim-verify"]')?.addEventListener('click', async event => {
      const button = event.currentTarget;
      button.disabled = true;
      button.setAttribute('aria-busy', 'true');
      const result = waitForClaimSuccess();
      existingClaim.click();
      const claimed = await result;
      if (claimed) window.open(openHref, '_blank', 'noopener');
      else {
        button.disabled = false;
        button.removeAttribute('aria-busy');
      }
    });
  }

  function enhanceCard(card) {
    if (!(card instanceof HTMLElement) || card.dataset.cashierReady === 'true') return;
    const item = itemFor(card);
    if (!item) return;
    card.dataset.cashierReady = 'true';
    card.classList.add('cashier-card');

    const identity = card.querySelector('.card-identity-row');
    const entityName = item.financial_entity || card.querySelector('.entity-name')?.textContent || 'جهة مالية';
    const oldMark = identity?.querySelector('.entity-mark');
    if (oldMark) installLogo(oldMark, item, entityName);
    buildMeta(card, item);
    rebuildActions(card, item);
  }

  function enhanceAll() {
    installHeaderLayout();
    removePreferences();
    queue.querySelectorAll('.payment-card').forEach(enhanceCard);
  }

  window.addEventListener('sanad:payment-inbox-v2-loaded', event => {
    const items = Array.isArray(event.detail?.items) ? event.detail.items : [];
    items.forEach(item => item?.id && itemCache.set(String(item.id), item));
    requestAnimationFrame(enhanceAll);
  });

  const observer = new MutationObserver(() => requestAnimationFrame(enhanceAll));
  observer.observe(document.body, { childList: true, subtree: true });
  document.addEventListener('DOMContentLoaded', enhanceAll, { once: true });
  requestAnimationFrame(enhanceAll);
})();

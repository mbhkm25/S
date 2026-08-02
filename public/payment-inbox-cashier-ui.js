(() => {
  'use strict';

  const queue = document.getElementById('queueSection');
  const notice = document.getElementById('notice');
  if (!queue) return;

  const itemCache = new Map();
  const enhanced = new WeakSet();

  const ICONS = {
    eye: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.7"/></svg>',
    claim: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v11m0 0 4-4m-4 4-4-4M5 16v2a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-2"/></svg>',
    verify: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 5 6v5c0 4.5 2.8 8.2 7 10 4.2-1.8 7-5.5 7-10V6l-7-3Z"/><path d="m9 12 2 2 4-4"/></svg>',
    file: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h7l4 4v14H7V3ZM14 3v5h5M10 13h5M10 17h5"/></svg>',
    complete: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>',
    release: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12a8 8 0 1 0 3-6.25M4 4v5h5"/></svg>'
  };

  const LOGOS = [
    { names: ['العمقي موبايل', 'العمقي'], paths: ['/assets/financial-entities/alamqi-mobile.png', '/assets/financial-entities/alamqi-mobile.webp'] },
    { names: ['البسيري موبايل', 'البسيري'], paths: ['/assets/financial-entities/albasiri-mobile.png', '/assets/financial-entities/albasiri-mobile.webp'] },
    { names: ['بي كاش', 'بيكاش'], paths: ['/assets/financial-entities/bcash.png', '/assets/financial-entities/bcash.webp'] },
    { names: ['الكريمي حاسب', 'حاسب الكريمي'], paths: ['/assets/financial-entities/alkuraimi-hasib.png', '/assets/financial-entities/alkuraimi-hasib.webp'] },
    { names: ['الكريمي سعودي'], paths: ['/assets/financial-entities/alkuraimi-saudi.png', '/assets/financial-entities/alkuraimi-saudi.webp'] },
    { names: ['الكريمي يمني'], paths: ['/assets/financial-entities/alkuraimi-yemeni.png', '/assets/financial-entities/alkuraimi-yemeni.webp'] },
    { names: ['بن دول صرافة'], paths: ['/assets/financial-entities/bindawol-exchange.png', '/assets/financial-entities/bindawol-exchange.webp'] },
    { names: ['بن دول باي'], paths: ['/assets/financial-entities/bindawol-pay.png', '/assets/financial-entities/bindawol-pay.webp'] },
    { names: ['القطيبي', 'بنك القطيبي'], paths: ['/assets/financial-entities/alqutaibi.png', '/assets/financial-entities/alqutaibi.webp'] }
  ];

  const esc = value => String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');

  const latin = value => String(value ?? '')
    .replace(/[٠-٩]/g, digit => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))
    .replace(/[۰-۹]/g, digit => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)));

  function itemFor(card) {
    return itemCache.get(String(card.dataset.itemId || '')) || {};
  }

  function remember(event) {
    const items = Array.isArray(event.detail?.items) ? event.detail.items : [];
    items.forEach(item => item?.id && itemCache.set(String(item.id), item));
    requestAnimationFrame(enhanceAll);
  }

  function textFromFact(card, label) {
    for (const fact of card.querySelectorAll('.fact')) {
      if (fact.querySelector('span')?.textContent?.trim() === label) return fact.querySelector('strong')?.textContent?.trim() || '';
    }
    return '';
  }

  function entityName(card, item) {
    if (item.financial_entity) return String(item.financial_entity);
    const meta = card.querySelector('.card-head .meta')?.textContent || '';
    return meta.split('·')[0]?.trim() || 'جهة مالية';
  }

  function currency(card, item) {
    return String(item.currency || card.querySelector('.amount small')?.textContent || '').trim().toUpperCase() || '—';
  }

  function amount(card, item) {
    if (item.amount != null) return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(Number(item.amount));
    const amountNode = card.querySelector('.amount')?.cloneNode(true);
    amountNode?.querySelector('small')?.remove();
    return latin(amountNode?.textContent?.trim() || '—');
  }

  function arrival(item, card) {
    const value = item.received_at || item.created_at || item.transaction_datetime;
    if (value) {
      const date = new Date(value);
      if (!Number.isNaN(date.getTime())) return new Intl.DateTimeFormat('ar-YE', { hour: '2-digit', minute: '2-digit' }).format(date);
    }
    return card.querySelector('.card-head .meta')?.textContent?.split('·').slice(1).join('·').trim() || 'حديثًا';
  }

  function logoCandidates(item, entity) {
    const explicit = [item.financial_entity_logo_url, item.logo_url, item.entity_logo_url].filter(Boolean);
    const normalized = String(entity).trim();
    const known = LOGOS.find(entry => entry.names.some(name => normalized.includes(name)))?.paths || [];
    return [...new Set([...explicit, ...known])];
  }

  function logoMarkup(item, entity) {
    const candidates = logoCandidates(item, entity);
    if (!candidates.length) return `<span class="financial-logo-fallback">${esc(entity.split(/\s+/).slice(0, 2).map(word => word[0] || '').join(''))}</span>`;
    return `<img class="financial-logo" src="${esc(candidates[0])}" data-logo-candidates="${esc(JSON.stringify(candidates))}" data-logo-index="0" alt="شعار ${esc(entity)}" loading="lazy">`;
  }

  function bindLogoFallback(card) {
    const image = card.querySelector('.financial-logo');
    if (!image) return;
    image.addEventListener('error', () => {
      let candidates = [];
      try { candidates = JSON.parse(image.dataset.logoCandidates || '[]'); } catch { candidates = []; }
      const next = Number(image.dataset.logoIndex || 0) + 1;
      if (next < candidates.length) {
        image.dataset.logoIndex = String(next);
        image.src = candidates[next];
        return;
      }
      const fallback = document.createElement('span');
      fallback.className = 'financial-logo-fallback';
      fallback.textContent = image.alt.replace(/^شعار\s*/, '').split(/\s+/).slice(0, 2).map(word => word[0] || '').join('');
      image.replaceWith(fallback);
    });
  }

  function waitForClaim(timeout = 7000) {
    return new Promise(resolve => {
      const started = Date.now();
      const observer = new MutationObserver(() => {
        const text = notice?.textContent || '';
        if (text.includes('تم استلام العملية')) {
          observer.disconnect();
          resolve(true);
        } else if (text.includes('سبقك') || text.includes('تعذر') || Date.now() - started > timeout) {
          observer.disconnect();
          resolve(false);
        }
      });
      if (notice) observer.observe(notice, { childList: true, subtree: true, characterData: true, attributes: true });
      window.setTimeout(() => { observer.disconnect(); resolve(false); }, timeout);
    });
  }

  function visibleActions(card, item, originalGroup) {
    const originalOpen = originalGroup?.querySelector('a[href*="/v/"]');
    const originalClaim = originalGroup?.querySelector('[data-action="claim"]');
    const token = item.public_token || originalOpen?.href.match(/\/v\/([^?]+)/)?.[1] || '';
    const openHref = originalOpen?.href || `/v/${encodeURIComponent(token)}?src=payment_inbox`;
    const originalHref = item.original_file_url || item.file_url || item.signed_file_url || `${openHref}${openHref.includes('?') ? '&' : '?'}open_original=1`;

    const actions = [
      `<a class="cashier-action cashier-open" target="_blank" rel="noopener" href="${esc(openHref)}">${ICONS.eye}<span>فتح الإشعار</span></a>`
    ];

    if (originalClaim) {
      actions.push(`<button class="cashier-action cashier-claim" type="button" data-cashier-action="claim">${ICONS.claim}<span>استلام العملية</span></button>`);
      actions.push(`<button class="cashier-action cashier-verify" type="button" data-cashier-action="claim-verify">${ICONS.verify}<span>استلام وتحقق</span></button>`);
    } else {
      originalGroup?.querySelectorAll('[data-action]:not([data-action="claim"])').forEach(original => {
        const action = original.dataset.action || '';
        const className = action === 'complete' ? 'cashier-claim' : action === 'reject' ? 'danger' : 'cashier-open';
        const actionIcon = action === 'complete' ? ICONS.complete : ICONS.release;
        actions.push(`<button class="cashier-action ${className}" type="button" data-proxy-action="${esc(action)}">${actionIcon}<span>${esc(original.textContent.trim())}</span></button>`);
      });
    }

    actions.push(`<a class="cashier-action cashier-original" target="_blank" rel="noopener" href="${esc(originalHref)}">${ICONS.file}<span>فتح الملف الأصلي</span></a>`);
    return { markup: actions.join(''), originalClaim, openHref };
  }

  function enhanceCard(card) {
    if (!(card instanceof HTMLElement) || enhanced.has(card)) return;
    const item = itemFor(card);
    const originalGroup = card.querySelector('.action-group');
    if (!originalGroup) return;

    const entity = entityName(card, item);
    const curr = currency(card, item);
    const status = item.status || card.dataset.status || 'new';
    const business = item.resolved_business_name || item.business_name || item.account_holder_name || item.receiver_name || textFromFact(card, 'الحساب المالي') || textFromFact(card, 'المستلم');
    const point = item.merchant_point || item.receiver_account || textFromFact(card, 'الحساب/النقطة');
    const reference = item.reference_number || textFromFact(card, 'مرجع العملية');
    const actionSet = visibleActions(card, item, originalGroup);

    originalGroup.remove();
    card.className = 'payment-card cashier-card';
    card.dataset.status = status;
    card.dataset.currency = curr;
    card.innerHTML = `
      <section class="cashier-main">
        <div class="cashier-entity">
          <span class="financial-logo-wrap">${logoMarkup(item, entity)}</span>
          <span><strong class="entity-name">${esc(entity)}</strong><span class="entity-subtitle">${esc(business || 'عملية مالية واردة')} · ${esc(latin(arrival(item, card)))}</span></span>
        </div>
        <div class="cashier-amount"><span>${esc(amount(card, item))}</span><span class="currency-badge">${esc(curr)}</span></div>
      </section>
      <div class="cashier-meta">
        ${point ? `<span>الحساب/النقطة <strong>${esc(latin(point))}</strong></span>` : ''}
        ${reference ? `<span>المرجع <strong>${esc(latin(reference))}</strong></span>` : ''}
      </div>
      <div class="cashier-actions">${actionSet.markup}</div>
      <div class="cashier-proxies" aria-hidden="true"></div>`;

    card.querySelector('.cashier-proxies')?.appendChild(originalGroup);
    bindLogoFallback(card);

    card.querySelector('[data-cashier-action="claim"]')?.addEventListener('click', () => actionSet.originalClaim?.click());
    card.querySelector('[data-cashier-action="claim-verify"]')?.addEventListener('click', async event => {
      const button = event.currentTarget;
      button.disabled = true;
      button.setAttribute('aria-busy', 'true');
      const result = waitForClaim();
      actionSet.originalClaim?.click();
      if (await result) window.open(actionSet.openHref, '_blank', 'noopener');
      else {
        button.disabled = false;
        button.removeAttribute('aria-busy');
      }
    });

    card.querySelectorAll('[data-proxy-action]').forEach(proxy => {
      proxy.addEventListener('click', () => originalGroup.querySelector(`[data-action="${CSS.escape(proxy.dataset.proxyAction)}"]`)?.click());
    });

    enhanced.add(card);
  }

  function enhanceAll() {
    document.getElementById('paymentInboxTabSwitcher')?.remove();
    document.querySelector('.hero-tabs')?.classList.remove('tabs-native-hidden');
    queue.querySelectorAll('.payment-card').forEach(enhanceCard);
  }

  function installLoadingWatchdog() {
    window.setTimeout(() => {
      const loading = queue.querySelector(':scope > .loading');
      if (!loading) return;
      loading.className = 'empty';
      loading.innerHTML = 'استغرق تحميل العمليات وقتًا أطول من المعتاد.<br><button type="button" id="paymentInboxReload">إعادة المحاولة</button>';
      document.getElementById('paymentInboxReload')?.addEventListener('click', () => location.reload());
    }, 12000);
  }

  window.addEventListener('sanad:payment-inbox-v2-loaded', remember);
  window.addEventListener('sanad:payment-inbox-loaded', remember);

  const observer = new MutationObserver(() => requestAnimationFrame(enhanceAll));
  observer.observe(queue, { childList: true, subtree: false });

  document.addEventListener('DOMContentLoaded', () => {
    enhanceAll();
    installLoadingWatchdog();
  }, { once: true });
  requestAnimationFrame(enhanceAll);
})();

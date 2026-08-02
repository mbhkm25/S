(() => {
  'use strict';

  const queue = document.getElementById('queueSection');
  if (!queue) return;

  const FILTER_ID = 'paymentInboxCardV2Toolbar';
  const STATUS_BY_LABEL = new Map([
    ['جديدة', 'new'],
    ['مستلمة', 'claimed'],
    ['قيد التنفيذ', 'claimed'],
    ['مكتملة', 'completed'],
    ['متاحة مجددًا', 'released'],
    ['تحتاج مراجعة', 'review_required'],
    ['مرفوضة', 'rejected'],
    ['ملغاة', 'cancelled']
  ]);

  function normalizeLatinDigits(value) {
    return String(value || '')
      .replace(/[٠-٩]/g, digit => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))
      .replace(/[۰-۹]/g, digit => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)));
  }

  function compactEntityName(value) {
    const clean = String(value || '').trim();
    if (!clean) return 'جهة';
    const words = clean.split(/\s+/).filter(Boolean);
    return words.slice(0, 2).map(word => word[0]).join('').slice(0, 2).toUpperCase();
  }

  function readCurrency(card) {
    const code = normalizeLatinDigits(card.querySelector('.amount small')?.textContent || '').trim().toUpperCase();
    if (/\bYER\b/.test(code)) return 'YER';
    if (/\bSAR\b/.test(code)) return 'SAR';
    if (/\bUSD\b/.test(code) || /\$/.test(code)) return 'USD';
    return code.replace(/[^A-Z]/g, '').slice(0, 5) || 'OTHER';
  }

  function readAmount(card) {
    const amount = card.querySelector('.amount');
    if (!amount) return 0;
    const clone = amount.cloneNode(true);
    clone.querySelector('small')?.remove();
    const numeric = normalizeLatinDigits(clone.textContent)
      .replace(/[^0-9.,-]/g, '')
      .replace(/,/g, '');
    return Number(numeric) || 0;
  }

  function readEntity(card) {
    const oldMeta = card.querySelector('.card-head .meta');
    const text = String(oldMeta?.textContent || '').trim();
    return text.split('·')[0]?.trim() || 'جهة مالية';
  }

  function readArrival(card) {
    const oldMeta = card.querySelector('.card-head .meta');
    const parts = String(oldMeta?.textContent || '').split('·');
    return parts.slice(1).join('·').trim() || 'وصلت حديثًا';
  }

  function readStatus(card) {
    const badges = [...card.querySelectorAll('.badge')];
    for (const badge of badges) {
      const status = STATUS_BY_LABEL.get(String(badge.textContent || '').trim());
      if (status) return status;
    }
    return 'new';
  }

  function createToolbar() {
    if (document.getElementById(FILTER_ID)) return;
    const toolbar = document.createElement('section');
    toolbar.id = FILTER_ID;
    toolbar.className = 'card-v2-toolbar';
    toolbar.setAttribute('aria-label', 'تصفية وترتيب بطاقات وارد المدفوعات');
    toolbar.innerHTML = `
      <label class="card-v2-control">
        <span>العملة</span>
        <select id="paymentInboxCurrencyFilter" aria-label="تصفية حسب العملة">
          <option value="all">كل العملات</option>
          <option value="YER">الريال اليمني · YER</option>
          <option value="SAR">الريال السعودي · SAR</option>
          <option value="USD">الدولار الأمريكي · USD</option>
          <option value="OTHER">عملات أخرى</option>
        </select>
      </label>
      <label class="card-v2-control">
        <span>الترتيب</span>
        <select id="paymentInboxSortMode" aria-label="ترتيب البطاقات">
          <option value="default">الترتيب التشغيلي</option>
          <option value="amount_desc">الأعلى مبلغًا</option>
          <option value="amount_asc">الأقل مبلغًا</option>
        </select>
      </label>`;
    queue.parentNode?.insertBefore(toolbar, queue);
    toolbar.addEventListener('change', applyFiltersAndSort);
  }

  function enhanceCard(card) {
    if (!(card instanceof HTMLElement) || card.dataset.cardV2Ready === 'true') return;
    card.dataset.cardV2Ready = 'true';
    card.classList.add('card-v2');

    const currency = readCurrency(card);
    const status = readStatus(card);
    const entity = readEntity(card);
    const arrival = readArrival(card);
    const amount = readAmount(card);

    card.dataset.currency = currency;
    card.dataset.status = status;
    card.dataset.amount = String(amount);
    card.setAttribute('aria-label', `عملية مالية بمبلغ ${normalizeLatinDigits(amount)} ${currency}. الحالة ${status}. الجهة ${entity}.`);

    const headMain = card.querySelector('.card-head > div:first-child');
    const oldMeta = card.querySelector('.card-head .meta');
    if (headMain && !headMain.querySelector('.card-identity-row')) {
      const identity = document.createElement('div');
      identity.className = 'card-identity-row';
      identity.innerHTML = `
        <span class="entity-mark" aria-hidden="true">${compactEntityName(entity)}</span>
        <span class="entity-copy">
          <strong class="entity-name">${entity}</strong>
          <span class="arrival-label">${arrival}</span>
        </span>`;
      headMain.insertBefore(identity, headMain.firstChild);
      oldMeta?.remove();
    }

    const facts = card.querySelector('.facts');
    if (facts && !card.querySelector('.card-v2-expand')) {
      facts.id = `facts-${card.dataset.itemId || Math.random().toString(36).slice(2)}`;
      const expand = document.createElement('button');
      expand.type = 'button';
      expand.className = 'card-v2-expand';
      expand.setAttribute('aria-expanded', 'false');
      expand.setAttribute('aria-controls', facts.id);
      expand.textContent = 'عرض البيانات التشغيلية';
      expand.addEventListener('click', () => {
        const expanded = card.classList.toggle('is-expanded');
        expand.setAttribute('aria-expanded', String(expanded));
        expand.textContent = expanded ? 'إخفاء البيانات التشغيلية' : 'عرض البيانات التشغيلية';
      });
      facts.insertAdjacentElement('afterend', expand);
    }

    card.querySelectorAll('.action-group > button').forEach(button => {
      button.addEventListener('click', () => {
        button.setAttribute('aria-busy', 'true');
        button.setAttribute('aria-disabled', 'true');
        button.disabled = true;
      }, { once: true });
    });
  }

  function enhanceAll() {
    queue.classList.add('card-v2-grid');
    createToolbar();
    queue.querySelectorAll('.payment-card').forEach(enhanceCard);
    applyFiltersAndSort();
  }

  function applyFiltersAndSort() {
    const currency = document.getElementById('paymentInboxCurrencyFilter')?.value || 'all';
    const sortMode = document.getElementById('paymentInboxSortMode')?.value || 'default';
    const cards = [...queue.querySelectorAll('.payment-card.card-v2')];

    cards.forEach(card => {
      const matches = currency === 'all'
        || card.dataset.currency === currency
        || (currency === 'OTHER' && !['YER', 'SAR', 'USD'].includes(card.dataset.currency || ''));
      card.hidden = !matches;
    });

    if (sortMode !== 'default') {
      cards.sort((left, right) => {
        const a = Number(left.dataset.amount || 0);
        const b = Number(right.dataset.amount || 0);
        return sortMode === 'amount_desc' ? b - a : a - b;
      }).forEach(card => queue.appendChild(card));
    }
  }

  let scheduled = false;
  const scheduleEnhancement = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      enhanceAll();
    });
  };

  const observer = new MutationObserver(scheduleEnhancement);
  observer.observe(queue, { childList: true, subtree: true });
  document.addEventListener('sanad:payment-inbox-v2-loaded', scheduleEnhancement);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') scheduleEnhancement();
  });

  scheduleEnhancement();
})();

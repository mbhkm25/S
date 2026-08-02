(() => {
  'use strict';

  const queue = document.getElementById('queueSection');
  if (!queue) return;

  const FILTER_ID = 'paymentInboxCardV2Toolbar';
  const itemCache = new Map();
  let countdownTimer = null;

  const STATUS_BY_LABEL = new Map([
    ['جديدة', 'new'], ['مستلمة', 'claimed'], ['قيد التنفيذ', 'claimed'],
    ['مكتملة', 'completed'], ['متاحة مجددًا', 'released'],
    ['تحتاج مراجعة', 'review_required'], ['مرفوضة', 'rejected'], ['ملغاة', 'cancelled']
  ]);

  const STATUS_LABELS = {
    new: 'جديدة', claimed: 'قيد التنفيذ', completed: 'مكتملة', released: 'متاحة مجددًا',
    review_required: 'تحتاج مراجعة', rejected: 'مرفوضة', cancelled: 'ملغاة'
  };

  const SOURCE_LABELS = {
    payment_inbox: 'وارد المدفوعات', qr_details: 'مسح QR', direct_link: 'الرابط المباشر',
    operation_details: 'صفحة العملية', admin: 'إجراء إداري', system: 'النظام'
  };

  function normalizeLatinDigits(value) {
    return String(value || '')
      .replace(/[٠-٩]/g, digit => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))
      .replace(/[۰-۹]/g, digit => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)));
  }

  function esc(value) {
    return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }

  function compactEntityName(value) {
    const words = String(value || '').trim().split(/\s+/).filter(Boolean);
    return (words.slice(0, 2).map(word => word[0]).join('').slice(0, 2) || 'جه').toUpperCase();
  }

  function itemForCard(card) { return itemCache.get(String(card.dataset.itemId || '')) || null; }

  function readCurrency(card) {
    const item = itemForCard(card);
    const raw = item?.currency || card.querySelector('.amount small')?.textContent || '';
    const code = normalizeLatinDigits(raw).trim().toUpperCase();
    if (/\bYER\b/.test(code)) return 'YER';
    if (/\bSAR\b/.test(code)) return 'SAR';
    if (/\bUSD\b/.test(code) || /\$/.test(code)) return 'USD';
    return code.replace(/[^A-Z]/g, '').slice(0, 5) || 'OTHER';
  }

  function readAmount(card) {
    const item = itemForCard(card);
    if (item?.amount != null) return Number(item.amount) || 0;
    const amount = card.querySelector('.amount');
    if (!amount) return 0;
    const clone = amount.cloneNode(true);
    clone.querySelector('small')?.remove();
    return Number(normalizeLatinDigits(clone.textContent).replace(/[^0-9.,-]/g, '').replace(/,/g, '')) || 0;
  }

  function readEntity(card) {
    const item = itemForCard(card);
    if (item?.financial_entity) return String(item.financial_entity);
    return String(card.querySelector('.card-head .meta')?.textContent || '').split('·')[0]?.trim() || 'جهة مالية';
  }

  function readArrival(card) {
    const item = itemForCard(card);
    const value = item?.received_at || item?.created_at;
    if (value) return relativeTime(value, 'وصلت');
    const parts = String(card.querySelector('.card-head .meta')?.textContent || '').split('·');
    return parts.slice(1).join('·').trim() || 'وصلت حديثًا';
  }

  function readStatus(card) {
    const item = itemForCard(card);
    if (item?.status) return item.status;
    for (const badge of card.querySelectorAll('.badge')) {
      const status = STATUS_BY_LABEL.get(String(badge.textContent || '').trim());
      if (status) return status;
    }
    return 'new';
  }

  function relativeTime(value, prefix = '') {
    const timestamp = new Date(value).getTime();
    if (!Number.isFinite(timestamp)) return '—';
    const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
    let text;
    if (seconds < 60) text = 'الآن';
    else if (seconds < 3600) text = `منذ ${Math.floor(seconds / 60)} دقيقة`;
    else if (seconds < 86400) text = `منذ ${Math.floor(seconds / 3600)} ساعة`;
    else text = `منذ ${Math.floor(seconds / 86400)} يوم`;
    return prefix ? `${prefix} ${normalizeLatinDigits(text)}` : normalizeLatinDigits(text);
  }

  function leaseState(item) {
    if (!item?.claim_expires_at || item.status !== 'claimed') return null;
    const seconds = Math.floor((new Date(item.claim_expires_at).getTime() - Date.now()) / 1000);
    if (!Number.isFinite(seconds)) return null;
    if (seconds <= 0) return { tone: 'danger', text: 'انتهت مهلة الاستلام', seconds };
    const minutes = Math.ceil(seconds / 60);
    if (seconds <= 60) return { tone: 'danger', text: `تنتهي خلال ${seconds} ثانية`, seconds };
    if (seconds <= 180) return { tone: 'warning', text: `تنتهي خلال ${minutes} دقائق`, seconds };
    return { tone: 'neutral', text: `متبقي ${minutes} دقائق`, seconds };
  }

  function operationalWarnings(item) {
    const warnings = [];
    if (!item) return warnings;
    if (item.has_name_conflict) warnings.push(['warning', 'تعارض في الاسم']);
    if (item.possible_duplicate || item.is_possible_duplicate) warnings.push(['warning', 'تكرار محتمل']);
    if (item.low_confidence || Number(item.confidence_score ?? 1) < 0.65) warnings.push(['warning', 'ثقة التحليل منخفضة']);
    if (item.status === 'review_required') warnings.push(['review', item.review_reason || item.last_reason || 'تحتاج إلى قرار إشرافي']);
    if (item.last_action_source && item.last_action_source !== 'payment_inbox') warnings.push(['info', `المصدر: ${SOURCE_LABELS[item.last_action_source] || item.last_action_source}`]);
    return warnings.slice(0, 3);
  }

  function createToolbar() {
    if (document.getElementById(FILTER_ID)) return;
    const toolbar = document.createElement('section');
    toolbar.id = FILTER_ID;
    toolbar.className = 'card-v2-toolbar';
    toolbar.setAttribute('aria-label', 'تصفية وترتيب بطاقات وارد المدفوعات');
    toolbar.innerHTML = `
      <label class="card-v2-control"><span>العملة</span><select id="paymentInboxCurrencyFilter" aria-label="تصفية حسب العملة">
        <option value="all">كل العملات</option><option value="YER">الريال اليمني · YER</option>
        <option value="SAR">الريال السعودي · SAR</option><option value="USD">الدولار الأمريكي · USD</option>
        <option value="OTHER">عملات أخرى</option></select></label>
      <label class="card-v2-control"><span>الترتيب</span><select id="paymentInboxSortMode" aria-label="ترتيب البطاقات">
        <option value="operational">الأولوية التشغيلية</option><option value="oldest">الأقدم وصولًا</option>
        <option value="newest">الأحدث وصولًا</option><option value="lease">الأقرب لانتهاء المهلة</option>
        <option value="amount_desc">الأعلى مبلغًا</option><option value="amount_asc">الأقل مبلغًا</option>
      </select></label>
      <p id="paymentInboxVisibleCount" class="card-v2-count" aria-live="polite"></p>`;
    queue.parentNode?.insertBefore(toolbar, queue);
    toolbar.addEventListener('change', applyFiltersAndSort);
  }

  function renderOperationalContext(card, item) {
    card.querySelector('.card-v2-context')?.remove();
    if (!item) return;
    const lease = leaseState(item);
    const assignee = item.claimed_by_name || item.completed_by_name || null;
    const source = item.completed_source || item.last_action_source;
    const context = document.createElement('section');
    context.className = 'card-v2-context';
    context.setAttribute('aria-label', 'الحالة التشغيلية');
    context.innerHTML = `
      ${assignee ? `<div class="assignee-chip"><span class="assignee-avatar" aria-hidden="true">${esc(String(assignee).trim()[0] || 'ع')}</span><span><small>${item.status === 'completed' ? 'أكملها' : 'المسؤول الحالي'}</small><strong>${esc(assignee)}</strong></span></div>` : ''}
      ${lease ? `<span class="lease-chip ${lease.tone}" data-lease-seconds="${lease.seconds}"><span aria-hidden="true">◷</span>${esc(lease.text)}</span>` : ''}
      ${source && item.status === 'completed' ? `<span class="source-chip">${esc(SOURCE_LABELS[source] || source)}</span>` : ''}`;
    const anchor = card.querySelector('.facts') || card.querySelector('.card-actions');
    anchor?.insertAdjacentElement('beforebegin', context);
  }

  function renderWarnings(card, item) {
    card.querySelector('.card-v2-alerts')?.remove();
    const warnings = operationalWarnings(item);
    if (!warnings.length) return;
    const section = document.createElement('section');
    section.className = 'card-v2-alerts';
    section.setAttribute('aria-label', 'تنبيهات العملية');
    section.innerHTML = warnings.map(([tone, text]) => `<span class="card-v2-alert ${tone}">${esc(text)}</span>`).join('');
    const actions = card.querySelector('.card-actions');
    actions?.insertAdjacentElement('beforebegin', section);
  }

  function enhanceCard(card) {
    if (!(card instanceof HTMLElement)) return;
    const item = itemForCard(card);
    card.dataset.cardV2Ready = 'true';
    card.classList.add('card-v2');

    const currency = readCurrency(card);
    const status = readStatus(card);
    const entity = readEntity(card);
    const arrival = readArrival(card);
    const amount = readAmount(card);
    const createdAt = item?.received_at || item?.created_at || null;

    card.dataset.currency = currency;
    card.dataset.status = status;
    card.dataset.amount = String(amount);
    card.dataset.createdAt = createdAt ? String(new Date(createdAt).getTime()) : '0';
    card.dataset.leaseAt = item?.claim_expires_at ? String(new Date(item.claim_expires_at).getTime()) : '0';
    card.setAttribute('aria-label', `عملية مالية بمبلغ ${normalizeLatinDigits(amount)} ${currency}. الحالة ${STATUS_LABELS[status] || status}. الجهة ${entity}.`);

    const headMain = card.querySelector('.card-head > div:first-child');
    const oldMeta = card.querySelector('.card-head .meta');
    let identity = card.querySelector('.card-identity-row');
    if (headMain && !identity) {
      identity = document.createElement('div');
      identity.className = 'card-identity-row';
      headMain.insertBefore(identity, headMain.firstChild);
      oldMeta?.remove();
    }
    if (identity) identity.innerHTML = `<span class="entity-mark" aria-hidden="true">${compactEntityName(entity)}</span><span class="entity-copy"><strong class="entity-name">${esc(entity)}</strong><span class="arrival-label">${esc(arrival)}</span></span>`;

    const facts = card.querySelector('.facts');
    let expand = card.querySelector('.card-v2-expand');
    if (facts && !expand) {
      facts.id = `facts-${card.dataset.itemId || Math.random().toString(36).slice(2)}`;
      expand = document.createElement('button');
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

    renderOperationalContext(card, item);
    renderWarnings(card, item);

    card.querySelectorAll('.action-group > button:not([data-card-v2-bound])').forEach(button => {
      button.dataset.cardV2Bound = 'true';
      button.addEventListener('click', () => {
        button.setAttribute('aria-busy', 'true');
        button.setAttribute('aria-disabled', 'true');
        button.disabled = true;
      }, { once: true });
    });
  }

  function updateCountdowns() {
    queue.querySelectorAll('.payment-card.card-v2').forEach(card => {
      const item = itemForCard(card);
      const chip = card.querySelector('.lease-chip');
      const lease = leaseState(item);
      if (!chip || !lease) return;
      chip.className = `lease-chip ${lease.tone}`;
      chip.innerHTML = `<span aria-hidden="true">◷</span>${esc(lease.text)}`;
      card.dataset.leaseAt = item?.claim_expires_at ? String(new Date(item.claim_expires_at).getTime()) : '0';
    });
  }

  function enhanceAll() {
    queue.classList.add('card-v2-grid');
    queue.setAttribute('aria-live', 'polite');
    createToolbar();
    queue.querySelectorAll('.payment-card').forEach(enhanceCard);
    applyFiltersAndSort();
    if (!countdownTimer) countdownTimer = window.setInterval(updateCountdowns, 15000);
  }

  function operationalRank(card) {
    const status = card.dataset.status;
    const leaseAt = Number(card.dataset.leaseAt || 0);
    if (status === 'claimed' && leaseAt > 0) return leaseAt;
    if (status === 'review_required') return 1;
    if (status === 'new' || status === 'released') return 2;
    return Number.MAX_SAFE_INTEGER;
  }

  function applyFiltersAndSort() {
    const currency = document.getElementById('paymentInboxCurrencyFilter')?.value || 'all';
    const sortMode = document.getElementById('paymentInboxSortMode')?.value || 'operational';
    const cards = [...queue.querySelectorAll('.payment-card.card-v2')];
    let visibleCount = 0;

    cards.forEach(card => {
      const matches = currency === 'all' || card.dataset.currency === currency || (currency === 'OTHER' && !['YER', 'SAR', 'USD'].includes(card.dataset.currency || ''));
      card.hidden = !matches;
      if (matches) visibleCount += 1;
    });

    const comparators = {
      operational: (a, b) => operationalRank(a) - operationalRank(b) || Number(a.dataset.createdAt || 0) - Number(b.dataset.createdAt || 0),
      oldest: (a, b) => Number(a.dataset.createdAt || 0) - Number(b.dataset.createdAt || 0),
      newest: (a, b) => Number(b.dataset.createdAt || 0) - Number(a.dataset.createdAt || 0),
      lease: (a, b) => (Number(a.dataset.leaseAt || Number.MAX_SAFE_INTEGER) || Number.MAX_SAFE_INTEGER) - (Number(b.dataset.leaseAt || Number.MAX_SAFE_INTEGER) || Number.MAX_SAFE_INTEGER),
      amount_desc: (a, b) => Number(b.dataset.amount || 0) - Number(a.dataset.amount || 0),
      amount_asc: (a, b) => Number(a.dataset.amount || 0) - Number(b.dataset.amount || 0)
    };
    cards.sort(comparators[sortMode] || comparators.operational).forEach(card => queue.appendChild(card));
    const count = document.getElementById('paymentInboxVisibleCount');
    if (count) count.textContent = `يعرض ${normalizeLatinDigits(visibleCount)} من ${normalizeLatinDigits(cards.length)} عملية`;
  }

  function rememberPayload(payload) {
    const items = Array.isArray(payload?.items) ? payload.items : [];
    itemCache.clear();
    items.forEach(item => { if (item?.id) itemCache.set(String(item.id), item); });
  }

  let scheduled = false;
  const scheduleEnhancement = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => { scheduled = false; enhanceAll(); });
  };

  new MutationObserver(scheduleEnhancement).observe(queue, { childList: true, subtree: true });
  document.addEventListener('sanad:payment-inbox-v2-loaded', event => {
    rememberPayload(event.detail || {});
    scheduleEnhancement();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') { updateCountdowns(); scheduleEnhancement(); }
  });

  scheduleEnhancement();
})();

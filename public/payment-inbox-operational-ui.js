(() => {
  'use strict';

  const ENTITY_DEFINITIONS = [
    { key: 'alamqi', names: ['العمقي موبايل','العمقي','alomqy','alamqi'], logo: '/assets/financial-entities/alamqi-mobile.webp', accent: '#1677c8', soft: '#e8f4ff' },
    { key: 'albasiri', names: ['البسيري موبايل','البسيري','albasiri'], logo: '/assets/financial-entities/albasiri-mobile.webp', accent: '#12815b', soft: '#e9f8f1' },
    { key: 'bcash', names: ['بي كاش','بيكاش','bcash'], logo: '/assets/financial-entities/bcash.webp', accent: '#6d4bd1', soft: '#f1edff' },
    { key: 'kuraimi-hasib', names: ['الكريمي حاسب','حاسب الكريمي'], logo: '/assets/financial-entities/alkuraimi-hasib.webp', accent: '#6b4aa4', soft: '#f3edfb' },
    { key: 'kuraimi-saudi', names: ['الكريمي سعودي','الكريمي ريال سعودي'], logo: '/assets/financial-entities/alkuraimi-saudi.webp', accent: '#b57a08', soft: '#fff5d9' },
    { key: 'kuraimi-yemeni', names: ['الكريمي يمني','الكريمي ريال يمني'], logo: '/assets/financial-entities/alkuraimi-yemeni.webp', accent: '#c48a09', soft: '#fff7dc' },
    { key: 'bindawol-exchange', names: ['بن دول صرافة','بن دول صرافه'], logo: '/assets/financial-entities/bindawol-exchange.webp', accent: '#078a91', soft: '#e6f8f8' },
    { key: 'bindawol-pay', names: ['بن دول باي','bindawol pay'], logo: '/assets/financial-entities/bindawol-pay.webp', accent: '#006c84', soft: '#e7f6fa' },
    { key: 'alqutaibi', names: ['القطيبي','بنك القطيبي'], logo: '/assets/financial-entities/alqutaibi.webp', accent: '#d36d1d', soft: '#fff0e4' }
  ];

  const TAB_META = {
    new: ['جديدة','عمليات متاحة للاستلام'],
    claimed: ['لدي','العمليات المرتبطة بك'],
    review_required: ['تحتاج مراجعة','عمليات تتطلب قرارًا'],
    completed: ['مكتملة','ما أُنجز اليوم'],
    shadow_preview: ['تجريبية','مطابقات غير تشغيلية']
  };

  const normalize = value => String(value || '').trim().toLowerCase()
    .replace(/[إأآ]/g,'ا').replace(/ة/g,'ه').replace(/ى/g,'ي').replace(/\s+/g,' ');

  function entityFor(text) {
    const candidate = normalize(text);
    return ENTITY_DEFINITIONS.find(entity => entity.names.some(name => candidate.includes(normalize(name)))) || {
      key: 'other', names: [], logo: null, accent: '#64748b', soft: '#f1f5f9'
    };
  }

  function esc(value) {
    return String(value ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
  }

  function statCounts() {
    const counts = {};
    document.querySelectorAll('#statsSection .stat').forEach(stat => {
      const label = stat.querySelector('span')?.textContent?.trim();
      const value = stat.querySelector('strong')?.textContent?.trim() || '0';
      if (label) counts[label] = value;
    });
    return counts;
  }

  function tabCount(status, button, counts) {
    if (status === 'new') return counts['جديدة'] || '0';
    if (status === 'claimed') return counts['لدي'] || '0';
    if (status === 'review_required') return counts['تحتاج مراجعة'] || '0';
    if (status === 'completed') return counts['مكتملة اليوم'] || '0';
    const raw = button.textContent || '';
    const match = raw.match(/(\d+)/);
    return match?.[1] || button.dataset.count || '0';
  }

  function decorateTabs() {
    const counts = statCounts();
    const buttons = [...document.querySelectorAll('.tabs [data-status]')];
    buttons.forEach((button, index) => {
      const status = button.dataset.status;
      const [title, hint] = TAB_META[status] || [button.textContent.trim(),''];
      const count = tabCount(status, button, counts);
      button.dataset.count = count;
      const next = `<span class="tab-title">${esc(title)}</span><span class="tab-count">${esc(count)}</span><span class="tab-hint">${esc(hint)}</span>`;
      if (button.innerHTML !== next) button.innerHTML = next;
      button.style.order = button.classList.contains('active') ? '0' : String(index + 1);
    });
  }

  function factMap(card) {
    const result = {};
    card.querySelectorAll('.fact').forEach(fact => {
      const label = fact.querySelector('span')?.textContent?.trim();
      const value = fact.querySelector('strong')?.textContent?.trim();
      if (label) result[label] = value || '—';
    });
    return result;
  }

  function entityText(card) {
    const meta = card.querySelector('.card-head .meta')?.textContent || '';
    return meta.split('·')[0].trim() || 'جهة مالية';
  }

  function addLogo(card, entity, label) {
    let logo = card.querySelector(':scope > .entity-logo');
    if (!logo) {
      logo = document.createElement('span');
      logo.className = 'entity-logo';
      card.prepend(logo);
    }
    const html = entity.logo
      ? `<img src="${esc(entity.logo)}" alt="شعار ${esc(label)}" loading="lazy" decoding="async">`
      : `<span class="entity-logo-fallback">${esc(label.slice(0,1) || 'س')}</span>`;
    if (logo.innerHTML !== html) logo.innerHTML = html;
  }

  function compactActions(card) {
    const group = card.querySelector('.action-group');
    if (!group) return;
    const buttons = [...group.children];
    buttons.forEach((button, index) => button.classList.toggle('tertiary-action', index > 1));
  }

  function decorateCard(card) {
    const label = entityText(card);
    const entity = entityFor(label);
    card.style.setProperty('--entity-accent', entity.accent);
    card.style.setProperty('--entity-soft', entity.soft);
    card.dataset.entityKey = entity.key;
    addLogo(card, entity, label);
    compactActions(card);
    card.setAttribute('tabindex','0');
    card.setAttribute('role','button');
    card.setAttribute('aria-label',`فتح تفاصيل عملية ${label}`);
    if (card.dataset.operationalUiBound === 'true') return;
    card.dataset.operationalUiBound = 'true';
    const open = event => {
      if (event.target.closest('a,button,textarea,input,select,summary')) return;
      openDetails(card, entity, label);
    };
    card.addEventListener('click', open);
    card.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        openDetails(card, entity, label);
      }
    });
  }

  function detailFact(label, value) {
    return `<div class="detail-fact"><span>${esc(label)}</span><strong>${esc(value || '—')}</strong></div>`;
  }

  function openDetails(card, entity, entityLabel) {
    const modal = document.getElementById('actionModal');
    const body = document.getElementById('modalBody');
    const title = document.getElementById('modalTitle');
    if (!modal || !body || !title) return;
    const facts = factMap(card);
    const amount = card.querySelector('.amount')?.textContent?.trim() || '—';
    const date = card.querySelector('.card-head .meta')?.textContent?.split('·').slice(1).join('·').trim() || '—';
    const status = card.querySelector('.badges .badge')?.textContent?.trim() || 'عملية';
    const originalActions = [...card.querySelectorAll('.action-group > *')];
    const actionMarkup = originalActions.slice(0,2).map((action,index) => {
      const label = action.textContent.trim();
      const tone = action.classList.contains('primary') ? 'primary' : action.classList.contains('danger') ? 'danger' : 'secondary';
      return `<button type="button" class="${tone}" data-proxy-action="${index}">${esc(label)}</button>`;
    }).join('');
    const extraFacts = Object.entries(facts).filter(([label]) => !['المستلم','الحساب/النقطة'].includes(label));
    const previewReasons = [...card.querySelectorAll('.preview-gates span')].map(node => node.getAttribute('title') || node.textContent.trim()).filter(Boolean);

    modal.classList.add('operation-detail-sheet');
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden','false');
    document.body.style.overflow = 'hidden';
    title.textContent = 'تفاصيل العملية';
    body.innerHTML = `<section class="modal-section" style="--entity-accent:${esc(entity.accent)};--entity-soft:${esc(entity.soft)}">
      <div class="detail-hero">
        <span class="entity-logo">${entity.logo ? `<img src="${esc(entity.logo)}" alt="شعار ${esc(entityLabel)}">` : `<span class="entity-logo-fallback">${esc(entityLabel.slice(0,1))}</span>`}</span>
        <div><div class="detail-entity">${esc(entityLabel)}</div><div class="meta">${esc(date)}</div></div>
        <div><div class="detail-amount">${esc(amount)}</div><span class="badge blue detail-status">${esc(status)}</span></div>
      </div>
      <div class="detail-facts">
        ${detailFact('المستلم',facts['المستلم'])}
        ${detailFact('الحساب أو النقطة',facts['الحساب/النقطة'])}
        ${extraFacts.map(([label,value]) => detailFact(label,value)).join('')}
      </div>
      ${actionMarkup ? `<div class="detail-actions">${actionMarkup}</div>` : ''}
      ${(previewReasons.length || extraFacts.length) ? `<details class="detail-extra"><summary>معلومات إضافية</summary><div class="detail-extra-content">${previewReasons.length ? `<strong>أسباب عدم التشغيل:</strong><br>${previewReasons.map(esc).join('، ')}` : 'يمكن فتح الإشعار لعرض المستند والبيانات الكاملة.'}</div></details>` : ''}
    </section>`;
    body.querySelectorAll('[data-proxy-action]').forEach(button => {
      button.addEventListener('click', () => {
        const action = originalActions[Number(button.dataset.proxyAction)];
        closeDetails();
        action?.click();
      });
    });
  }

  function closeDetails() {
    const modal = document.getElementById('actionModal');
    if (!modal?.classList.contains('operation-detail-sheet')) return false;
    modal.classList.remove('operation-detail-sheet');
    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden','true');
    document.body.style.overflow = '';
    return true;
  }

  function decorate() {
    decorateTabs();
    document.querySelectorAll('#queueSection .payment-card').forEach(decorateCard);
  }

  function boot() {
    const root = document.getElementById('queueSection');
    const tabs = document.querySelector('.tabs');
    const stats = document.getElementById('statsSection');
    if (!root || !tabs) return;
    document.getElementById('closeModal')?.addEventListener('click', event => {
      if (closeDetails()) event.stopImmediatePropagation();
    }, true);
    document.querySelector('#actionModal [data-close]')?.addEventListener('click', event => {
      if (closeDetails()) event.stopImmediatePropagation();
    }, true);
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') closeDetails();
    }, true);
    const observer = new MutationObserver(() => requestAnimationFrame(decorate));
    observer.observe(root,{childList:true,subtree:true});
    observer.observe(tabs,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['class']});
    if (stats) observer.observe(stats,{childList:true,subtree:true,characterData:true});
    decorate();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();
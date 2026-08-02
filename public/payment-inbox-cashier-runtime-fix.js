(() => {
  'use strict';

  const queue = document.getElementById('queueSection');
  const notice = document.getElementById('notice');
  if (!queue) return;

  const items = new Map();
  const icon = {
    eye: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.6"/></svg>',
    claim: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v11m0 0 4-4m-4 4-4-4M5 16v2a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-2"/></svg>',
    verify: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 5 6v5c0 4.5 2.8 8.2 7 10 4.2-1.8 7-5.5 7-10V6l-7-3Z"/><path d="m9 12 2 2 4-4"/></svg>',
    file: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h7l4 4v14H7V3ZM14 3v5h5M10 13h5M10 17h5"/></svg>'
  };

  const aliases = {
    alomqy_mobile: ['alomqy_mobile','alomqy','al-omqy'],
    albasiri_mobile: ['albasiri_mobile','albasiri','basiri'],
    kuraimi_haseb: ['kuraimi_haseb','kuraimi','alkuraimi'],
    kuraimi_mobile: ['kuraimi_mobile','kuraimi','alkuraimi'],
    bin_dowal: ['bin_dowal','bin_dawel','bindawel'],
    bin_dawel: ['bin_dawel','bin_dowal','bindawel'],
    qutaibi: ['qutaibi','alqutaibi'], mahadhar: ['mahadhar','almahadhar'],
    bcash: ['bcash','b-cash'], p_cash: ['p_cash','pcash'],
    aden_cash: ['aden_cash','adencash'], am_floos: ['am_floos','amfloos']
  };

  const esc = value => String(value ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
  const latin = value => String(value ?? '').replace(/[٠-٩]/g,d=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/[۰-۹]/g,d=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));

  function remember(payload) {
    const list = Array.isArray(payload?.items) ? payload.items : [];
    list.forEach(item => item?.id && items.set(String(item.id), item));
    requestAnimationFrame(enhanceAll);
  }

  function logoPaths(item) {
    const code = String(item?.financial_entity_code || '').toLowerCase();
    const codes = aliases[code] || [code].filter(Boolean);
    const explicit = [item?.financial_entity_logo_url,item?.logo_url,item?.entity_logo_url].filter(Boolean);
    return [...new Set([...explicit,...codes.flatMap(name => [
      `/assets/financial-entities/${name}.png`, `/assets/financial_entities/${name}.png`,
      `/assets/entities/${name}.png`, `/images/financial-entities/${name}.png`, `/logos/${name}.png`
    ])])];
  }

  function addLogo(card, item, entity) {
    const target = card.querySelector('.entity-mark, .financial-logo-wrap');
    if (!target || target.dataset.logoReady === 'true') return;
    target.dataset.logoReady = 'true';
    target.className = 'financial-logo-wrap';
    target.innerHTML = '';
    const candidates = logoPaths(item);
    if (!candidates.length) {
      target.innerHTML = `<span class="financial-logo-fallback">${esc(entity.split(/\s+/).slice(0,2).map(x=>x[0]||'').join(''))}</span>`;
      return;
    }
    const img = document.createElement('img');
    img.className = 'financial-logo';
    img.alt = `شعار ${entity}`;
    img.loading = 'lazy';
    let index = 0;
    img.onerror = () => {
      index += 1;
      if (index < candidates.length) img.src = candidates[index];
      else target.innerHTML = `<span class="financial-logo-fallback">${esc(entity.split(/\s+/).slice(0,2).map(x=>x[0]||'').join(''))}</span>`;
    };
    img.src = candidates[0];
    target.appendChild(img);
  }

  function waitForClaim(timeout=6500) {
    return new Promise(resolve => {
      const started = Date.now();
      const observer = new MutationObserver(() => {
        const text = notice?.textContent || '';
        if (text.includes('تم استلام العملية')) { observer.disconnect(); resolve(true); }
        else if (text.includes('تعذر') || text.includes('سبقك') || Date.now()-started>timeout) { observer.disconnect(); resolve(false); }
      });
      if (notice) observer.observe(notice,{childList:true,subtree:true,characterData:true,attributes:true});
      setTimeout(()=>{ observer.disconnect(); resolve(false); },timeout);
    });
  }

  function rebuildActions(card, item) {
    const group = card.querySelector('.action-group');
    if (!group || group.dataset.cashierActions === 'true') return;
    const oldOpen = group.querySelector('a[href*="/v/"]');
    const oldClaim = group.querySelector('[data-action="claim"]');
    const token = item?.public_token || oldOpen?.href.match(/\/v\/([^?]+)/)?.[1] || '';
    const openHref = oldOpen?.href || `/v/${encodeURIComponent(token)}?src=payment_inbox`;
    const originalHref = item?.original_file_url || item?.file_url || item?.signed_file_url || `${openHref}${openHref.includes('?')?'&':'?'}open_original=1`;
    const preserved = [...group.children].filter(node => node !== oldOpen && node !== oldClaim && node.matches?.('[data-action]')).map(node=>node.outerHTML).join('');

    group.dataset.cashierActions = 'true';
    group.innerHTML = `
      <a class="cashier-open" target="_blank" rel="noopener" href="${esc(openHref)}">${icon.eye}<span>فتح الإشعار</span></a>
      ${oldClaim ? `<button class="cashier-claim" type="button">${icon.claim}<span>استلام العملية</span></button><button class="cashier-claim-verify" type="button">${icon.verify}<span>استلام وتحقق</span></button>` : ''}
      <a class="cashier-original" target="_blank" rel="noopener" href="${esc(originalHref)}">${icon.file}<span>فتح الملف الأصلي</span></a>
      ${oldClaim ? '' : preserved}`;

    group.querySelector('.cashier-claim')?.addEventListener('click',()=>oldClaim.click());
    group.querySelector('.cashier-claim-verify')?.addEventListener('click',async event=>{
      const button=event.currentTarget; button.disabled=true; button.setAttribute('aria-busy','true');
      const result=waitForClaim(); oldClaim.click();
      if (await result) window.open(openHref,'_blank','noopener');
      else { button.disabled=false; button.removeAttribute('aria-busy'); }
    });
  }

  function compactMeta(card,item) {
    if (card.querySelector('.cashier-meta')) return;
    const business=item?.resolved_business_name||item?.business_name||item?.account_holder_name||item?.receiver_name;
    const point=item?.merchant_point||item?.receiver_account;
    const reference=item?.reference_number;
    if (!business && !point && !reference) return;
    const meta=document.createElement('div'); meta.className='cashier-meta';
    meta.innerHTML=[business?`<span>لدى <strong>${esc(business)}</strong></span>`:'',point?`<span>الحساب/النقطة <strong>${esc(latin(point))}</strong></span>`:'',reference?`<span>المرجع <strong>${esc(latin(reference))}</strong></span>`:''].filter(Boolean).join('');
    card.querySelector('.card-actions')?.insertAdjacentElement('beforebegin',meta);
  }

  function enhance(card) {
    if (!(card instanceof HTMLElement)) return;
    const item=items.get(String(card.dataset.itemId||''))||{};
    card.classList.add('cashier-card');
    const entity=item.financial_entity||card.querySelector('.entity-name')?.textContent?.trim()||card.querySelector('.card-head .meta')?.textContent?.split('·')[0]?.trim()||'جهة مالية';
    addLogo(card,item,entity);
    compactMeta(card,item);
    rebuildActions(card,item);
  }

  function enhanceAll() {
    document.getElementById('paymentInboxCardV2Toolbar')?.remove();
    queue.querySelectorAll('.payment-card').forEach(enhance);
  }

  window.addEventListener('sanad:payment-inbox-v2-loaded',event=>remember(event.detail));
  window.addEventListener('sanad:payment-inbox-loaded',event=>remember(event.detail));
  const observer=new MutationObserver(()=>requestAnimationFrame(enhanceAll));
  observer.observe(queue,{childList:true,subtree:true});
  document.addEventListener('DOMContentLoaded',enhanceAll,{once:true});
  requestAnimationFrame(enhanceAll);
})();

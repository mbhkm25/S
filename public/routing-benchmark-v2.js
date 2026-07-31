(() => {
  'use strict';

  const API_URL = 'https://api.sanadflow.com';
  const PROJECT_REF = 'hudbzlgclghlhazlduas';
  const AUTH_KEY = `sb-${PROJECT_REF}-auth-token`;
  const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh1ZGJ6bGdobGhhemxkdWFzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI4NzI3NzEsImV4cCI6MjA5ODQ0ODc3MX0.mQvUtmAwmRXPdMJdynPemP56PSeONMUpw_k0rz_pUag';

  const ENTITY_LABELS = {
    alomqy_mobile: 'العمقي موبايل', albusaery_mobile: 'البسيري موبايل',
    bcash_wallet: 'محفظة بي كاش', kuraimi_sar: 'الكريمي سعودي',
    kuraimi_yer: 'الكريمي يمني', kuraimi_haseb: 'الكريمي حاسب',
    bin_dowal_exchange: 'بن دول صرافة', bin_dowal_pay: 'بن دول باي',
    m_floos: 'أم فلوس', aden_cash: 'عدن كاش', alqutaibi: 'القطيبي',
    almehdar: 'المحضار', other: 'جهة أخرى', unknown: 'غير معروف'
  };

  const TEMPLATE_LABELS = {
    single_receipt: 'إيصال مفرد', transaction_list: 'قائمة عمليات',
    account_history: 'سجل حساب', wallet_receipt: 'إيصال محفظة',
    transfer_receipt: 'إيصال تحويل', statement: 'كشف', unknown: 'غير معروف'
  };

  const STATUS_LABELS = {
    pending: 'بانتظار الإجراء', in_review: 'قيد المراجعة', reviewed: 'حقيقة نهائية',
    excluded: 'مستبعدة', skipped: 'متجاوزة', insufficient_data: 'بيانات غير كافية',
    no_match: 'لا توجد مطابقة', ambiguous: 'ملتبسة',
    low_confidence_match: 'مطابقة ضعيفة', probable_match: 'مطابقة محتملة',
    high_confidence_match: 'مطابقة مرتفعة', error: 'خطأ'
  };

  const STAGE_LABELS = {
    awaiting_primary: 'الحكم الأول', awaiting_secondary: 'الحكم الثاني المستقل',
    awaiting_adjudication: 'حسم التعارض', finalized: 'حقيقة نهائية'
  };

  const VERDICT_LABELS = {
    correct: 'صحيح', incorrect: 'غير صحيح', unreviewable: 'لا يمكن الحكم',
    correct_match: 'المطابقة صحيحة', wrong_match: 'المطابقة خاطئة',
    correct_abstention: 'الامتناع صحيح', missed_match: 'فاتته مطابقة صحيحة',
    ambiguous_case: 'الحالة ملتبسة فعلًا'
  };

  const FIELD_LABELS = {
    document_verdict: 'قابلية المستند للمراجعة', entity_verdict: 'الجهة المالية',
    template_verdict: 'القالب', direction_verdict: 'الاتجاه',
    selected_operation_verdict: 'اختيار العملية', identifier_roles_verdict: 'أدوار المعرّفات',
    routing_verdict: 'حكم التوجيه', corrected_financial_entity_code: 'تصحيح الجهة',
    corrected_document_template: 'تصحيح القالب', corrected_transaction_direction: 'تصحيح الاتجاه',
    corrected_selected_operation_position: 'تصحيح موضع العملية', corrected_account_id: 'الحساب الصحيح'
  };

  const ERROR_OPTIONS = [
    ['wrong_entity', 'تصنيف الجهة خاطئ'], ['wrong_template', 'نوع القالب خاطئ'],
    ['wrong_direction', 'اتجاه العملية خاطئ'], ['wrong_selected_operation', 'اختيار العملية خاطئ'],
    ['sender_receiver_swapped', 'عكس المرسل والمستلم'],
    ['document_account_misused', 'خلط حساب رأس الشاشة'],
    ['merchant_point_missing', 'نقطة حاسب مفقودة'],
    ['merchant_point_false', 'نقطة حاسب مستخرجة خطأ'],
    ['wrong_identifier_role', 'دور المعرّف خاطئ'],
    ['wrong_account_match', 'الحساب المرشح خاطئ'], ['should_abstain', 'كان يجب الامتناع'],
    ['poor_image', 'جودة الملف لا تسمح بالحكم'], ['other', 'خطأ آخر']
  ];

  const state = {
    session: null,
    access: null,
    overview: null,
    activeCaseId: null,
    activeDetail: null,
    claimedCase: false,
    correctedAccountId: null,
    accountResults: [],
    reviewerCandidates: [],
    loading: false
  };

  const byId = (id) => document.getElementById(id);
  const notice = byId('notice');
  const modal = byId('caseModal');
  const caseBody = byId('caseBody');
  const numberFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
  const percentFormat = new Intl.NumberFormat('en-US', { style: 'percent', maximumFractionDigits: 1 });
  const dateFormat = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', hour12: true });

  function esc(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }

  function formatDate(value) {
    if (!value) return '—';
    try { return dateFormat.format(new Date(value)); } catch { return '—'; }
  }

  function formatNumber(value) {
    return value == null || Number.isNaN(Number(value)) ? '—' : numberFormat.format(Number(value));
  }

  function formatPercent(value) {
    return value == null || Number.isNaN(Number(value)) ? '—' : percentFormat.format(Number(value));
  }

  function showNotice(message, tone = 'info') {
    notice.textContent = message;
    notice.className = `notice ${tone}`;
    window.clearTimeout(showNotice.timer);
    showNotice.timer = window.setTimeout(() => notice.classList.add('hidden'), 7000);
  }

  function decodeBase64Url(value) {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4);
    const binary = atob(padded);
    return new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)));
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
    for (const storage of [window.localStorage, window.sessionStorage]) {
      try {
        const direct = unwrapSession(storage.getItem(AUTH_KEY));
        if (direct) return direct;
        const keys = [];
        for (let index = 0; index < storage.length; index += 1) {
          const key = storage.key(index);
          if (key?.startsWith(`${AUTH_KEY}.`)) keys.push(key);
        }
        keys.sort((a, b) => Number(a.split('.').pop()) - Number(b.split('.').pop()));
        const chunked = unwrapSession(keys.map((key) => storage.getItem(key) || '').join(''));
        if (chunked) return chunked;
      } catch { /* Browser storage may be unavailable. */ }
    }
    return null;
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

  async function ensureSession(forceRefresh = false) {
    if (!state.session) state.session = readStoredSession();
    if (!state.session) throw new Error('لا توجد جلسة دخول. سجّل الدخول إلى تطبيق سند أولًا.');
    const expiresAt = Number(state.session.expires_at || 0) * 1000;
    if (forceRefresh || (expiresAt && expiresAt < Date.now() + 90_000)) {
      state.session = await refreshSession(state.session);
    }
    return state.session;
  }

  async function rpc(name, body = {}, retry = true) {
    const session = await ensureSession(false);
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
    if (!response.ok) throw new Error(data?.message || data?.hint || data?.error_description || `تعذر تنفيذ ${name}`);
    return data;
  }

  function badge(value, tone) {
    const computed = tone || (
      ['reviewed', 'finalized', 'high_confidence_match', 'correct_match', 'consensus'].includes(value) ? 'green' :
      ['error', 'wrong_match'].includes(value) ? 'red' :
      ['pending', 'in_review', 'probable_match', 'ambiguous', 'awaiting_adjudication'].includes(value) ? 'amber' : 'blue'
    );
    const label = STATUS_LABELS[value] || STAGE_LABELS[value] || VERDICT_LABELS[value] || value || '—';
    return `<span class="badge ${computed}">${esc(label)}</span>`;
  }

  function stageTone(stage) {
    if (stage === 'awaiting_primary') return 'primary';
    if (stage === 'awaiting_secondary') return 'secondary';
    if (stage === 'awaiting_adjudication') return 'adjudication';
    return 'finalized';
  }

  function blockedReasonLabel(code) {
    return {
      independent_secondary_reviewer_required: 'أنت سجلت الحكم الأول؛ يجب أن يسجل الحكم الثاني شخص آخر.',
      independent_adjudicator_required: 'شاركت في أحد الحكمين؛ يجب أن يحسم التعارض شخص ثالث.',
      primary_reviewer_permission_required: 'صلاحيتك لا تشمل تسجيل الأحكام.',
      secondary_reviewer_permission_required: 'صلاحيتك لا تشمل الحكم الثاني.',
      adjudicator_permission_required: 'صلاحيتك لا تشمل حسم التعارض.',
      benchmark_case_finalized: 'هذه الحالة أصبحت حقيقة نهائية.'
    }[code] || 'هذه المرحلة غير متاحة لهذا الحساب.';
  }

  function renderGate(gate) {
    const reasons = Object.values(gate?.block_reasons || {}).filter(Boolean);
    byId('gateSection').className = 'gate-card blocked';
    byId('gateSection').innerHTML = `
      <div class="gate-title">
        <div><h2>التوجيه الحقيقي محظور تقنيًا</h2><p>لا تُحتسب الحالة إلا بعد اتفاق مراجعين مستقلين أو حسم محكّم مستقل. هذه الصفحة للقياس فقط.</p></div>
        <span class="block-badge">HARD BLOCK</span>
      </div>
      <div class="policy-grid">
        <div class="policy-item"><strong>${formatNumber(gate?.minimum_contract_v2_reviews)}</strong><span>الحد الأدنى لعينة v2 النهائية</span></div>
        <div class="policy-item"><strong>${formatPercent(gate?.minimum_routing_precision)}</strong><span>دقة التوجيه المطلوبة</span></div>
        <div class="policy-item"><strong>${formatPercent(gate?.minimum_routing_recall)}</strong><span>الاستدعاء المطلوب</span></div>
        <div class="policy-item"><strong>${formatPercent(gate?.maximum_false_positive_rate)}</strong><span>أقصى خطأ إيجابي</span></div>
      </div>
      <div class="gate-reasons">${reasons.map((reason) => `<div class="gate-reason">${esc(reason)}</div>`).join('')}</div>`;
  }

  function renderReviewerCapacity(access, gate) {
    const root = byId('reviewerCapacitySection');
    root.className = 'panel';
    root.innerHTML = `
      <div class="section-heading"><div><h2>سعة فريق المراجعة</h2><p>الاستقلال يُفرض داخل قاعدة البيانات، لا بالواجهة فقط.</p></div>${badge(access?.reviewer_role || 'غير معيّن')}</div>
      <div class="capacity-grid">
        <div class="capacity-item"><strong>${formatNumber(access?.active_reviewer_count)}</strong><span>حسابات تستطيع تسجيل الأحكام</span></div>
        <div class="capacity-item"><strong>${formatNumber(access?.active_adjudicator_count)}</strong><span>حسابات تستطيع حسم التعارض</span></div>
        <div class="capacity-item"><strong>${formatNumber(state.overview?.stats?.awaiting_secondary)}</strong><span>تنتظر حكمًا ثانيًا مستقلًا</span></div>
        <div class="capacity-item"><strong>${formatNumber(state.overview?.stats?.awaiting_adjudication)}</strong><span>تنتظر محكّمًا مستقلًا</span></div>
      </div>
      <div class="capacity-note">السعة العددية لا تكفي وحدها: محكّم الحالة لا يجوز أن يكون صاحب الحكم الأول أو الثاني. ${gate?.reviewer_capacity_met && gate?.adjudicator_capacity_met ? 'السعة الأساسية متوفرة.' : 'عيّن مراجعين إضافيين قبل بدء القياس الفعلي.'}</div>`;
  }

  function renderStats(stats) {
    const cards = [
      ['إجمالي الحالات', stats.total_cases, 'كل تشغيلات الظل'],
      ['عقد v2 الفعلي', stats.contract_v2_cases, 'الحالات المؤهلة للقياس'],
      ['تنتظر الحكم الأول', stats.awaiting_primary, 'لم يصدر حكم مستقل بعد'],
      ['تنتظر الحكم الثاني', stats.awaiting_secondary, 'الحكم الأول مخفي عن المراجع الثاني'],
      ['تنتظر التحكيم', stats.awaiting_adjudication, 'ظهر تعارض بين الحكمين'],
      ['حقائق نهائية', stats.finalized_cases, `${formatNumber(stats.consensus_cases)} اتفاق / ${formatNumber(stats.adjudicated_cases)} تحكيم`],
      ['دقة المطابقات', formatPercent(stats.routing_precision), `${formatNumber(stats.correct_matches)} صحيحة / ${formatNumber(stats.wrong_matches)} خاطئة`],
      ['الجاهزية', 'محظور', 'يلزم قرار إطلاق منفصل بعد اكتمال القياس']
    ];
    byId('statsSection').innerHTML = cards.map(([label, value, hint], index) => `
      <article class="stat-card ${index === 7 ? 'emphasis' : ''}">
        <div class="value">${esc(value)}</div><div class="label">${esc(label)}</div><div class="hint">${esc(hint)}</div>
      </article>`).join('');
  }

  function renderEntityOptions(breakdown) {
    const select = byId('entityFilter');
    const current = select.value;
    const codes = [...new Set((breakdown || []).map((item) => item.financial_entity_code).filter(Boolean))];
    select.innerHTML = '<option value="">كل الجهات</option>' + codes.map((code) => `<option value="${esc(code)}">${esc(ENTITY_LABELS[code] || code)}</option>`).join('');
    if (codes.includes(current)) select.value = current;
  }

  function currentFilters() {
    return {
      p_status: byId('statusFilter').value || null,
      p_cohort: byId('cohortFilter').value || null,
      p_entity_code: byId('entityFilter').value || null,
      p_template: byId('templateFilter').value || null,
      p_limit: 100,
      p_offset: 0
    };
  }

  function visibleQueue(queue) {
    const stage = byId('stageFilter').value;
    return stage ? (queue || []).filter((item) => item.review_stage === stage) : (queue || []);
  }

  function renderQueue(queue) {
    const items = visibleQueue(queue);
    byId('queueCount').textContent = formatNumber(items.length);
    const root = byId('queueSection');
    if (!items.length) {
      root.innerHTML = '<div class="empty-state">لا توجد حالات مطابقة للفلاتر الحالية.<br>عند وصول إشعارات جديدة بعقد v2 ستُضاف تلقائيًا.</div>';
      return;
    }
    root.innerHTML = items.map((item) => {
      const isFinal = item.review_stage === 'finalized' || item.status === 'reviewed';
      const canOpen = isFinal || item.can_claim || (item.status === 'in_review' && item.claimed_by_user_id === state.session?.user?.id);
      const action = isFinal ? 'عرض الحقيقة النهائية' : item.review_stage === 'awaiting_adjudication' ? 'حسم التعارض' : item.review_stage === 'awaiting_secondary' ? 'تسجيل الحكم الثاني' : 'تسجيل الحكم الأول';
      return `
        <article class="case-card ${canOpen ? '' : 'ineligible'}">
          <div class="case-card-head">
            <div><h3>${esc(ENTITY_LABELS[item.financial_entity_code] || item.financial_entity || 'جهة غير معروفة')}</h3>
              <p class="case-meta">${esc(TEMPLATE_LABELS[item.document_template] || item.document_template || 'قالب غير معروف')} · ${esc(item.cohort === 'contract_v2_live' ? 'عقد v2 فعلي' : 'خط أساس قديم')} · ${formatDate(item.operation_created_at)}</p></div>
            <div class="badges">${badge(item.review_stage)}${badge(item.shadow_status)}</div>
          </div>
          <div class="case-main">
            <div class="fact"><span>المبلغ</span><strong>${formatNumber(item.amount)} ${esc(item.currency || '')}</strong></div>
            <div class="fact"><span>الاتجاه</span><strong>${esc(item.transaction_direction || 'unknown')}</strong></div>
            <div class="fact"><span>استراتيجية المطابقة</span><strong>${esc(item.match_strategy || 'امتناع')}</strong></div>
            <div class="fact"><span>النشاط المرشح</span><strong>${esc(item.matched_business_name || 'لا يوجد')}</strong></div>
          </div>
          ${!canOpen && item.eligibility_reason ? `<div class="eligibility-note">${esc(blockedReasonLabel(item.eligibility_reason))}</div>` : ''}
          <div class="case-footer"><span class="case-score">score ${item.match_score == null ? '—' : formatNumber(item.match_score)}</span>
            <button type="button" class="primary-button" data-open-case="${esc(item.id)}" data-final="${isFinal ? '1' : '0'}" ${canOpen ? '' : 'disabled'}>${esc(action)}</button>
          </div>
        </article>`;
    }).join('');
    root.querySelectorAll('[data-open-case]').forEach((button) => {
      button.addEventListener('click', () => openCase(button.dataset.openCase, button.dataset.final === '1'));
    });
  }

  function renderBreakdown(rows) {
    const root = byId('breakdownSection');
    if (!rows?.length) { root.innerHTML = '<div class="empty-state">لا توجد بيانات تفصيلية بعد.</div>'; return; }
    root.innerHTML = `<table><thead><tr><th>الجهة</th><th>القالب</th><th>الحالات</th><th>نهائية</th><th>صحيحة</th><th>خاطئة</th><th>فائتة</th><th>الدقة</th></tr></thead><tbody>${rows.map((row) => `
      <tr><td>${esc(ENTITY_LABELS[row.financial_entity_code] || row.financial_entity_code)}</td><td>${esc(TEMPLATE_LABELS[row.document_template] || row.document_template)}</td>
      <td>${formatNumber(row.total_cases)}</td><td>${formatNumber(row.reviewed_cases)}</td><td>${formatNumber(row.correct_matches)}</td><td>${formatNumber(row.wrong_matches)}</td><td>${formatNumber(row.missed_matches)}</td><td>${formatPercent(row.precision)}</td></tr>`).join('')}</tbody></table>`;
  }

  async function loadOverview(quiet = false) {
    if (state.loading) return;
    state.loading = true;
    byId('refreshButton').textContent = '…';
    try {
      if (!quiet || !state.access) {
        state.access = await rpc('get_my_routing_benchmark_access', {});
        if (!state.access?.allowed) throw new Error('الحساب الحالي غير معيّن كمراجع Benchmark.');
      }
      state.overview = await rpc('platform_admin_get_routing_benchmark_overview', currentFilters());
      state.access = state.overview.access || state.access;
      renderGate(state.overview.gate || {});
      renderReviewerCapacity(state.access || {}, state.overview.gate || {});
      renderStats(state.overview.stats || {});
      renderEntityOptions(state.overview.breakdown || []);
      renderQueue(state.overview.queue || []);
      renderBreakdown(state.overview.breakdown || []);
      if (state.access?.is_platform_admin) {
        byId('reviewerAdminSection').classList.remove('hidden');
        if (!state.reviewerCandidates.length) await searchReviewerCandidates();
      }
    } catch (error) {
      showNotice(error.message || 'تعذر تحميل مركز Benchmark.', 'error');
      byId('queueSection').innerHTML = `<div class="empty-state">${esc(error.message || 'تعذر التحميل.')}</div>`;
    } finally {
      state.loading = false;
      byId('refreshButton').textContent = '↻';
    }
  }

  function renderReviewerCandidates() {
    const root = byId('reviewerCandidates');
    if (!state.reviewerCandidates.length) { root.innerHTML = '<div class="empty-state">لا توجد نتائج.</div>'; return; }
    root.innerHTML = state.reviewerCandidates.map((item) => `
      <article class="reviewer-card">
        <div class="reviewer-card-head"><div><h3>${esc(item.full_name || 'مستخدم سند')}</h3><p dir="ltr">${esc(item.phone || '—')}</p></div>${badge(item.global_role === 'platform_admin' ? 'مدير المنصة' : (item.reviewer_status === 'active' ? 'مراجع فعّال' : 'غير معيّن'), item.reviewer_status === 'active' ? 'green' : 'blue')}</div>
        <div class="reviewer-controls">
          <label>الدور<select data-reviewer-role="${esc(item.user_id)}"><option value="reviewer" ${item.reviewer_role === 'reviewer' ? 'selected' : ''}>مراجع</option><option value="adjudicator" ${item.reviewer_role === 'adjudicator' ? 'selected' : ''}>محكّم</option><option value="both" ${item.reviewer_role === 'both' ? 'selected' : ''}>مراجع ومحكّم</option></select></label>
          <label>الحالة<select data-reviewer-status="${esc(item.user_id)}"><option value="active" ${item.reviewer_status === 'active' ? 'selected' : ''}>فعّال</option><option value="inactive" ${item.reviewer_status === 'inactive' ? 'selected' : ''}>متوقف</option></select></label>
          <button class="primary-button" type="button" data-save-reviewer="${esc(item.user_id)}">حفظ</button>
        </div>
      </article>`).join('');
    root.querySelectorAll('[data-save-reviewer]').forEach((button) => button.addEventListener('click', () => saveReviewer(button.dataset.saveReviewer)));
  }

  async function searchReviewerCandidates() {
    if (!state.access?.is_platform_admin) return;
    const button = byId('searchReviewersButton');
    button.disabled = true;
    button.textContent = 'جارٍ البحث…';
    try {
      const result = await rpc('platform_admin_search_routing_benchmark_reviewer_candidates', {
        p_query: byId('reviewerSearch').value.trim() || null, p_limit: 40
      });
      state.reviewerCandidates = result?.results || [];
      renderReviewerCandidates();
    } catch (error) { showNotice(error.message || 'تعذر البحث عن المراجعين.', 'error'); }
    finally { button.disabled = false; button.textContent = 'بحث'; }
  }

  async function saveReviewer(userId) {
    const reason = byId('reviewerAdminReason').value.trim();
    if (reason.length < 5) { showNotice('اكتب سببًا واضحًا لتعيين المراجع.', 'error'); return; }
    const role = document.querySelector(`[data-reviewer-role="${CSS.escape(userId)}"]`)?.value;
    const status = document.querySelector(`[data-reviewer-status="${CSS.escape(userId)}"]`)?.value;
    const button = document.querySelector(`[data-save-reviewer="${CSS.escape(userId)}"]`);
    button.disabled = true;
    try {
      await rpc('platform_admin_set_routing_benchmark_reviewer', { p_user_id: userId, p_reviewer_role: role, p_status: status, p_reason: reason });
      showNotice('تم تحديث دور المراجع وتسجيل الإجراء.', 'success');
      await searchReviewerCandidates();
      await loadOverview(true);
    } catch (error) { showNotice(error.message || 'تعذر حفظ دور المراجع.', 'error'); }
    finally { button.disabled = false; }
  }

  function detailRow(label, value) {
    return `<div class="detail-row"><span>${esc(label)}</span><strong>${value == null || value === '' ? '—' : esc(value)}</strong></div>`;
  }

  function renderCandidates(detail) {
    const candidates = detail.candidates || [];
    if (!candidates.length) return '<div class="empty-state">الخوارزمية امتنعت ولم تُرجع مرشحًا.</div>';
    return `<div class="candidate-list">${candidates.map((candidate, index) => `
      <article class="candidate ${index === 0 ? 'top' : ''}"><div class="candidate-head"><div><h4>${esc(candidate.business_name || 'نشاط غير معروف')}</h4><p>${esc(candidate.account_label || candidate.account_holder_name || 'حساب مالي')} · ${esc(candidate.strategy || candidate.evidence?.[0]?.source_role || '')}</p></div><span class="score-pill">${formatNumber(candidate.score)}</span></div></article>`).join('')}</div>`;
  }

  function stageStrip(progress) {
    const stage = progress?.stage || 'awaiting_primary';
    const descriptions = {
      awaiting_primary: 'سجّل حكمًا مستقلًا بعد فتح الإشعار الفعلي. لن يصبح حكمك حقيقة نهائية منفردًا.',
      awaiting_secondary: 'هذه مراجعة عمياء. الحكم الأول مخفي بالكامل حتى لا يؤثر في قرارك.',
      awaiting_adjudication: 'يوجد تعارض بين حكمين مستقلين. قارن مواضع الاختلاف ثم أصدر الحقيقة النهائية.',
      finalized: 'اكتملت المراجعة المستقلة وأصبحت النتيجة جزءًا من مؤشرات Benchmark.'
    };
    return `<div class="stage-strip ${stageTone(stage)}"><h3>${esc(STAGE_LABELS[stage] || stage)}</h3><p>${esc(descriptions[stage])}</p>
      <div class="stage-progress"><div class="stage-step ${progress?.primary_submitted ? 'done' : stage === 'awaiting_primary' ? 'current' : ''}">1 · الحكم الأول</div><div class="stage-step ${progress?.secondary_submitted ? 'done' : stage === 'awaiting_secondary' ? 'current' : ''}">2 · الحكم الثاني</div><div class="stage-step ${stage === 'finalized' ? 'done' : stage === 'awaiting_adjudication' ? 'current' : ''}">3 · اتفاق أو تحكيم</div></div></div>`;
  }

  function voteValue(label, value) {
    return `<div class="vote-value"><span>${esc(label)}</span><strong>${esc(VERDICT_LABELS[value] || ENTITY_LABELS[value] || TEMPLATE_LABELS[value] || value || '—')}</strong></div>`;
  }

  function renderVotes(detail) {
    const votes = detail.visible_votes || [];
    if (!votes.length) return '';
    const disputed = new Set(detail.review_progress?.disagreement_fields || []);
    return `<section class="detail-section"><div class="section-heading"><div><h3>الحكمان المستقلان</h3><p>تظهر هذه المقارنة للمحكّم أو بعد إغلاق الحالة فقط.</p></div></div>
      <div class="disagreement-list">${[...disputed].map((field) => `<span class="disagreement-chip">${esc(FIELD_LABELS[field] || field)}</span>`).join('')}</div>
      <div class="vote-grid" style="margin-top:10px">${votes.map((vote) => `
        <article class="vote-card ${disputed.size ? 'disputed' : ''}"><div class="vote-card-head"><div><h4>الحكم ${vote.vote_order}</h4><p>${esc(vote.reviewer_name || 'مراجع مستقل')} · ${formatDate(vote.created_at)}</p></div>${badge(vote.routing_verdict)}</div>
          <div class="vote-summary">${voteValue('المستند', vote.document_verdict)}${voteValue('الجهة', vote.entity_verdict)}${voteValue('القالب', vote.template_verdict)}${voteValue('الاتجاه', vote.direction_verdict)}${voteValue('اختيار العملية', vote.selected_operation_verdict)}${voteValue('المعرّفات', vote.identifier_roles_verdict)}</div>
          ${detail.review_progress?.stage === 'awaiting_adjudication' ? `<button type="button" class="secondary-button" style="width:100%;margin-top:10px" data-use-vote="${esc(vote.id)}">استخدام الحكم ${vote.vote_order} كنقطة بداية</button>` : ''}
        </article>`).join('')}</div></section>`;
  }

  function verdictSelect(id, label, current = 'correct') {
    return `<label>${esc(label)}<select id="${id}"><option value="correct" ${current === 'correct' ? 'selected' : ''}>صحيح</option><option value="incorrect" ${current === 'incorrect' ? 'selected' : ''}>غير صحيح</option><option value="unreviewable" ${current === 'unreviewable' ? 'selected' : ''}>لا يمكن الحكم</option></select></label>`;
  }

  function optionList(map, selected) {
    return Object.entries(map).map(([code, label]) => `<option value="${esc(code)}" ${selected === code ? 'selected' : ''}>${esc(label)}</option>`).join('');
  }

  function defaultDecision(detail) {
    const stage = detail.review_progress?.stage;
    if (stage === 'awaiting_adjudication' && detail.visible_votes?.length) return detail.visible_votes[0];
    return detail.current_review || {};
  }

  function reviewForm(detail) {
    const operation = detail.operation || {};
    const progress = detail.review_progress || {};
    const current = defaultDecision(detail);
    const old = Number(operation.analysis_contract_version || 0) < 2;
    const submitLabel = progress.stage === 'awaiting_adjudication' ? 'حفظ الحقيقة المحسومة' : progress.stage === 'awaiting_secondary' ? 'حفظ الحكم الثاني' : 'حفظ الحكم الأول';
    return `
      ${progress.blind_secondary_review ? '<div class="blind-warning"><strong>مراجعة عمياء:</strong> لن يعرض لك النظام الحكم الأول أو صاحبه. سجّل قرارك من الإشعار والبيانات فقط.</div>' : ''}
      <form id="reviewForm" class="detail-section">
        <h3>${esc(submitLabel)}</h3>
        <div class="review-grid">
          ${verdictSelect('documentVerdict', 'هل المستند مالي وقابل للتحليل؟', current.document_verdict || 'correct')}
          ${verdictSelect('entityVerdict', 'تصنيف الجهة المالية', current.entity_verdict || 'correct')}
          ${verdictSelect('templateVerdict', 'نوع القالب', current.template_verdict || (old ? 'unreviewable' : 'correct'))}
          ${verdictSelect('directionVerdict', 'اتجاه العملية', current.direction_verdict || (old ? 'unreviewable' : 'correct'))}
          ${verdictSelect('selectedOperationVerdict', 'اختيار العملية الصحيحة', current.selected_operation_verdict || 'correct')}
          ${verdictSelect('identifierRolesVerdict', 'أدوار الحسابات والمعرّفات', current.identifier_roles_verdict || (old ? 'unreviewable' : 'correct'))}
          <label>حكم التوجيه<select id="routingVerdict">
            ${[['correct_match','المطابقة صحيحة'],['wrong_match','المطابقة خاطئة'],['correct_abstention','الامتناع صحيح'],['missed_match','فاتته مطابقة صحيحة'],['ambiguous_case','الحالة ملتبسة فعلًا'],['unreviewable','لا يمكن الحكم']].map(([value,label]) => `<option value="${value}" ${current.routing_verdict === value ? 'selected' : ''}>${label}</option>`).join('')}
          </select></label>
        </div>
        <div class="correction-box"><h4>التصحيحات المرجعية عند الخطأ</h4><div class="review-grid">
          <label>الجهة الصحيحة<select id="correctedEntity"><option value="">—</option>${optionList(ENTITY_LABELS, current.corrected_financial_entity_code)}</select></label>
          <label>القالب الصحيح<select id="correctedTemplate"><option value="">—</option>${optionList(TEMPLATE_LABELS, current.corrected_document_template)}</select></label>
          <label>الاتجاه الصحيح<select id="correctedDirection"><option value="">—</option><option value="incoming" ${current.corrected_transaction_direction === 'incoming' ? 'selected' : ''}>واردة</option><option value="outgoing" ${current.corrected_transaction_direction === 'outgoing' ? 'selected' : ''}>صادرة</option><option value="internal" ${current.corrected_transaction_direction === 'internal' ? 'selected' : ''}>داخلية</option><option value="unknown" ${current.corrected_transaction_direction === 'unknown' ? 'selected' : ''}>غير معروف</option></select></label>
          <label>موضع العملية الصحيح<input id="correctedPosition" type="number" min="1" max="100" value="${esc(current.corrected_selected_operation_position || '')}" /></label>
        </div></div>
        <div class="correction-box"><h4>الحساب الصحيح عند وجود مطابقة خاطئة أو فائتة</h4><div class="review-grid"><label>بحث الحساب<input id="accountSearch" placeholder="اسم النشاط أو صاحب الحساب أو المعرّف" /></label><label>الجهة<select id="accountEntity"><option value="">كل الجهات</option>${optionList(ENTITY_LABELS, operation.financial_entity_code)}</select></label></div><button id="searchAccountsButton" type="button" class="secondary-button" style="margin-top:9px;width:100%">بحث الحسابات</button><div id="accountResults" class="account-results"></div></div>
        <div class="correction-box"><h4>رموز الخطأ</h4><div class="checkbox-grid">${ERROR_OPTIONS.map(([value,label]) => `<label class="checkbox-item"><input type="checkbox" name="errorCode" value="${esc(value)}" ${(current.error_codes || []).includes(value) ? 'checked' : ''}>${esc(label)}</label>`).join('')}</div></div>
        <label style="margin-top:12px">ملاحظات المراجع<textarea id="reviewerNotes" placeholder="اشرح موضع الخطأ أو سبب الامتناع">${esc(current.reviewer_notes || '')}</textarea></label>
        <label style="margin-top:10px">سبب تسجيل الحكم<textarea id="reviewReason" required placeholder="سبب واضح لا يقل عن 5 أحرف">${esc(progress.stage === 'awaiting_adjudication' ? 'حسم تعارض بين حكمين مستقلين' : progress.stage === 'awaiting_secondary' ? 'تسجيل الحكم الثاني المستقل' : 'تسجيل الحكم الأول المستقل')}</textarea></label>
        <div class="form-actions"><button id="cancelReviewButton" type="button" class="secondary-button">إغلاق دون حفظ</button><button id="submitReviewButton" type="submit" class="primary-button">${esc(submitLabel)}</button></div>
      </form>`;
  }

  function renderFinalReview(detail) {
    const review = detail.current_review;
    if (!review) return '<div class="empty-state">لا توجد حقيقة نهائية مرتبطة بالحالة.</div>';
    return `<section class="detail-section final-truth"><div class="section-heading"><div><h3>الحقيقة النهائية</h3><p>${review.resolution_method === 'consensus' ? 'اتفاق مراجعين مستقلين' : review.resolution_method === 'adjudicated' ? 'حسم محكّم مستقل' : 'حكم قديم قبل المراجعة الثنائية'} · ${formatDate(review.created_at)}</p></div>${badge(review.routing_verdict)}</div>
      <div class="detail-grid" style="margin-top:12px">${detailRow('المستند', VERDICT_LABELS[review.document_verdict])}${detailRow('الجهة', VERDICT_LABELS[review.entity_verdict])}${detailRow('القالب', VERDICT_LABELS[review.template_verdict])}${detailRow('الاتجاه', VERDICT_LABELS[review.direction_verdict])}${detailRow('اختيار العملية', VERDICT_LABELS[review.selected_operation_verdict])}${detailRow('أدوار المعرّفات', VERDICT_LABELS[review.identifier_roles_verdict])}${detailRow('طريقة الحسم', review.resolution_method)}${detailRow('المحكّم', review.adjudicator_name)}</div></section>`;
  }

  function renderAccountResults() {
    const root = byId('accountResults');
    if (!root) return;
    if (!state.accountResults.length) { root.innerHTML = '<div class="empty-state">ابحث عند الحاجة إلى تصحيح المطابقة.</div>'; return; }
    root.innerHTML = state.accountResults.map((account) => {
      const identifiers = (account.identifiers || []).slice(0, 3).map((item) => `${item.type}: ${item.value}${item.currency ? ` (${item.currency})` : ''}`).join(' · ');
      return `<button type="button" class="account-option ${state.correctedAccountId === account.account_id ? 'selected' : ''}" data-account-id="${esc(account.account_id)}"><strong>${esc(account.business_name)} — ${esc(account.account_label || account.account_holder_name || 'حساب مالي')}</strong><span>${esc(ENTITY_LABELS[account.financial_entity_code] || account.financial_entity_name || account.financial_entity_code)} · ${esc(identifiers || 'لا توجد معرّفات ظاهرة')}</span></button>`;
    }).join('');
    root.querySelectorAll('[data-account-id]').forEach((button) => button.addEventListener('click', () => { state.correctedAccountId = button.dataset.accountId; renderAccountResults(); }));
  }

  function renderCaseDetail(detail) {
    const operation = detail.operation || {};
    const run = detail.shadow_run || {};
    const progress = detail.review_progress || {};
    const old = Number(operation.analysis_contract_version || 0) < 2;
    state.accountResults = detail.account_options || [];
    state.correctedAccountId = defaultDecision(detail).corrected_account_id || null;
    byId('caseStageEyebrow').textContent = STAGE_LABELS[progress.stage] || 'حالة Benchmark';

    const blocked = !progress.can_submit && progress.stage !== 'finalized'
      ? `<div class="blocked-review">${esc(blockedReasonLabel(progress.blocked_reason))}</div>` : '';

    caseBody.innerHTML = `
      ${stageStrip(progress)}
      ${old ? '<div class="legacy-warning"><strong>خط أساس قديم:</strong> لا يُحتسب دليل إطلاق، واستخدم «لا يمكن الحكم» للحقول غير الموجودة في العقد القديم.</div>' : ''}
      ${blocked}
      <section class="detail-section"><div class="section-heading"><div><h3>الإشعار والعملية</h3><p>افتح الملف الفعلي قبل تسجيل أي حكم.</p></div><a class="secondary-button" target="_blank" rel="noopener" href="/v/${esc(operation.public_token)}?src=app">فتح الإشعار ↗</a></div>
        <div class="detail-grid" style="margin-top:12px">${detailRow('الجهة', operation.financial_entity)}${detailRow('القالب', TEMPLATE_LABELS[operation.document_template] || operation.document_template)}${detailRow('نوع العملية', operation.transaction_type)}${detailRow('الاتجاه', operation.transaction_direction)}${detailRow('المبلغ', operation.amount == null ? null : `${formatNumber(operation.amount)} ${operation.currency || ''}`)}${detailRow('المرجع', operation.reference_number)}${detailRow('المرسل', operation.sender_name)}${detailRow('حساب المرسل', operation.sender_account)}${detailRow('المستلم', operation.receiver_name)}${detailRow('حساب المستلم', operation.receiver_account)}${detailRow('حساب رأس المستند', operation.document_account)}${detailRow('الحساب الدائن', operation.credited_account)}${detailRow('الحساب المدين', operation.debited_account)}${detailRow('نقطة حاسب/التاجر', operation.merchant_point)}${detailRow('عملية من قائمة', operation.multiple_operations_present ? `نعم · الموضع ${operation.selected_operation_position || '—'}` : 'لا')}</div>
      </section>
      <section class="detail-section"><h3>قرار المطابقة الظلية</h3><div class="detail-grid">${detailRow('الحالة', STATUS_LABELS[run.status] || run.status)}${detailRow('الدرجة', run.match_score)}${detailRow('الاستراتيجية', run.match_strategy)}${detailRow('النشاط المرشح', detail.matched_business?.name)}${detailRow('الحساب المرشح', detail.matched_account?.account_label || detail.matched_account?.account_holder_name)}${detailRow('عدد المرشحين', run.candidate_count)}</div><div style="margin-top:12px">${renderCandidates(detail)}</div></section>
      ${renderVotes(detail)}
      ${progress.stage === 'finalized' ? renderFinalReview(detail) : progress.can_submit ? reviewForm(detail) : ''}`;

    if (byId('reviewForm')) {
      renderAccountResults();
      byId('searchAccountsButton').addEventListener('click', searchAccounts);
      byId('reviewForm').addEventListener('submit', submitReview);
      byId('cancelReviewButton').addEventListener('click', closeModal);
      caseBody.querySelectorAll('[data-use-vote]').forEach((button) => button.addEventListener('click', () => applyVoteToForm(button.dataset.useVote)));
    }
  }

  function applyVoteToForm(voteId) {
    const vote = state.activeDetail?.visible_votes?.find((item) => item.id === voteId);
    if (!vote) return;
    const values = {
      documentVerdict: vote.document_verdict, entityVerdict: vote.entity_verdict,
      templateVerdict: vote.template_verdict, directionVerdict: vote.direction_verdict,
      selectedOperationVerdict: vote.selected_operation_verdict,
      identifierRolesVerdict: vote.identifier_roles_verdict, routingVerdict: vote.routing_verdict,
      correctedEntity: vote.corrected_financial_entity_code || '',
      correctedTemplate: vote.corrected_document_template || '',
      correctedDirection: vote.corrected_transaction_direction || '',
      correctedPosition: vote.corrected_selected_operation_position || ''
    };
    Object.entries(values).forEach(([id, value]) => { if (byId(id)) byId(id).value = value; });
    state.correctedAccountId = vote.corrected_account_id || null;
    renderAccountResults();
    showNotice('تم تحميل الحكم كنقطة بداية. راجعه مستقلًا قبل الحفظ.', 'info');
  }

  async function searchAccounts() {
    const button = byId('searchAccountsButton');
    button.disabled = true; button.textContent = 'جارٍ البحث…';
    try {
      const result = await rpc('platform_admin_search_routing_benchmark_accounts', {
        p_query: byId('accountSearch').value.trim() || null,
        p_entity_code: byId('accountEntity').value || null,
        p_limit: 100
      });
      state.accountResults = result?.results || [];
      renderAccountResults();
    } catch (error) { showNotice(error.message || 'تعذر البحث عن الحسابات.', 'error'); }
    finally { button.disabled = false; button.textContent = 'بحث الحسابات'; }
  }

  async function openCase(caseId, readOnly = false) {
    state.activeCaseId = caseId;
    state.activeDetail = null;
    state.correctedAccountId = null;
    state.claimedCase = false;
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    caseBody.innerHTML = '<div class="loading-block"><div class="loader"></div></div>';
    try {
      if (!readOnly) {
        await rpc('platform_admin_claim_routing_benchmark_case', { p_case_id: caseId });
        state.claimedCase = true;
      }
      const detail = await rpc('platform_admin_get_routing_benchmark_case', { p_case_id: caseId });
      state.activeDetail = detail;
      renderCaseDetail(detail);
    } catch (error) {
      caseBody.innerHTML = `<div class="empty-state">${esc(error.message || 'تعذر فتح الحالة.')}</div>`;
      showNotice(error.message || 'تعذر فتح الحالة.', 'error');
    }
  }

  async function releaseActiveCase() {
    const caseId = state.activeCaseId;
    if (!caseId || !state.claimedCase) return;
    try { await rpc('platform_admin_release_routing_benchmark_case', { p_case_id: caseId }); } catch { /* Claim expires safely. */ }
    state.claimedCase = false;
  }

  async function closeModal() {
    await releaseActiveCase();
    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    state.activeCaseId = null;
    state.activeDetail = null;
    state.correctedAccountId = null;
  }

  async function submitReview(event) {
    event.preventDefault();
    const button = byId('submitReviewButton');
    const routingVerdict = byId('routingVerdict').value;
    const reason = byId('reviewReason').value.trim();
    if (reason.length < 5) { showNotice('اكتب سببًا واضحًا لا يقل عن 5 أحرف.', 'error'); return; }
    if (['wrong_match', 'missed_match'].includes(routingVerdict) && !state.correctedAccountId) {
      showNotice('اختر الحساب الصحيح عند الحكم بوجود مطابقة خاطئة أو فائتة.', 'error'); return;
    }
    button.disabled = true; button.textContent = 'جارٍ الحفظ…';
    const errorCodes = [...document.querySelectorAll('input[name="errorCode"]:checked')].map((input) => input.value);
    try {
      const result = await rpc('platform_admin_review_routing_benchmark_case', {
        p_case_id: state.activeCaseId,
        p_document_verdict: byId('documentVerdict').value,
        p_entity_verdict: byId('entityVerdict').value,
        p_template_verdict: byId('templateVerdict').value,
        p_direction_verdict: byId('directionVerdict').value,
        p_selected_operation_verdict: byId('selectedOperationVerdict').value,
        p_identifier_roles_verdict: byId('identifierRolesVerdict').value,
        p_routing_verdict: routingVerdict,
        p_corrected_financial_entity_code: byId('entityVerdict').value === 'incorrect' ? byId('correctedEntity').value || null : null,
        p_corrected_document_template: byId('templateVerdict').value === 'incorrect' ? byId('correctedTemplate').value || null : null,
        p_corrected_transaction_direction: byId('directionVerdict').value === 'incorrect' ? byId('correctedDirection').value || null : null,
        p_corrected_selected_operation_position: byId('selectedOperationVerdict').value === 'incorrect' && byId('correctedPosition').value ? Number(byId('correctedPosition').value) : null,
        p_corrected_account_id: state.correctedAccountId || null,
        p_error_codes: errorCodes,
        p_reviewer_notes: byId('reviewerNotes').value.trim() || null,
        p_reason: reason
      });
      state.claimedCase = false;
      const messages = {
        awaiting_secondary: 'سُجل الحكم الأول. الحالة تنتظر مراجعًا ثانيًا مستقلًا، ولن يرى حكمك.',
        awaiting_adjudication: 'سُجل الحكم الثاني وظهر تعارض. الحالة تنتظر محكّمًا مستقلًا.',
        finalized: result.resolution_method === 'consensus' ? 'اتفق الحكمان المستقلان وأصبحت الحالة حقيقة نهائية.' : 'حُسم التعارض وأصبحت الحالة حقيقة نهائية.'
      };
      showNotice(`${messages[result.review_stage] || 'تم حفظ الحكم.'} التوجيه الحقيقي ما زال محظورًا.`, 'success');
      modal.classList.add('hidden');
      modal.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
      state.activeCaseId = null;
      state.activeDetail = null;
      await loadOverview(true);
    } catch (error) { showNotice(error.message || 'تعذر حفظ الحكم.', 'error'); }
    finally { button.disabled = false; button.textContent = 'حفظ الحكم'; }
  }

  function bindEvents() {
    byId('refreshButton').addEventListener('click', () => loadOverview(true));
    ['statusFilter', 'cohortFilter', 'entityFilter', 'templateFilter'].forEach((id) => byId(id).addEventListener('change', () => loadOverview(true)));
    byId('stageFilter').addEventListener('change', () => renderQueue(state.overview?.queue || []));
    byId('searchReviewersButton').addEventListener('click', searchReviewerCandidates);
    byId('reviewerSearch').addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); searchReviewerCandidates(); } });
    byId('closeModalButton').addEventListener('click', closeModal);
    modal.querySelectorAll('[data-close-modal]').forEach((element) => element.addEventListener('click', closeModal));
    document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !modal.classList.contains('hidden')) closeModal(); });
  }

  async function boot() {
    bindEvents();
    try {
      await ensureSession();
      await loadOverview(false);
    } catch (error) {
      showNotice(error.message || 'تعذر بدء مركز Benchmark.', 'error');
      byId('gateSection').innerHTML = `<div class="empty-state">${esc(error.message || 'تعذر بدء الصفحة.')}</div>`;
      byId('reviewerCapacitySection').classList.add('hidden');
      byId('queueSection').innerHTML = '<div class="empty-state">سجّل الدخول بحساب مراجع معيّن، ثم أعد تحميل الصفحة.</div>';
    }
  }

  boot();
})();

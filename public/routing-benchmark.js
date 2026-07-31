(() => {
  'use strict';

  const API_URL = 'https://api.sanadflow.com';
  const PROJECT_REF = 'hudbzlgclghlhazlduas';
  const AUTH_KEY = `sb-${PROJECT_REF}-auth-token`;
  const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh1ZGJ6bGdjbGdobGhhemxkdWFzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI4NzI3NzEsImV4cCI6MjA5ODQ0ODc3MX0.mQvUtmAwmRXPdMJdynPemP56PSeONMUpw_k0rz_pUag';

  const ENTITY_LABELS = {
    alomqy_mobile: 'العمقي موبايل',
    albusaery_mobile: 'البسيري موبايل',
    bcash_wallet: 'محفظة بي كاش',
    kuraimi_sar: 'الكريمي سعودي',
    kuraimi_yer: 'الكريمي يمني',
    kuraimi_haseb: 'الكريمي حاسب',
    bin_dowal_exchange: 'بن دول صرافة',
    bin_dowal_pay: 'بن دول باي',
    m_floos: 'أم فلوس',
    aden_cash: 'عدن كاش',
    alqutaibi: 'القطيبي',
    almehdar: 'المحضار',
    other: 'جهة أخرى',
    unknown: 'غير معروف'
  };

  const TEMPLATE_LABELS = {
    single_receipt: 'إيصال مفرد',
    transaction_list: 'قائمة عمليات',
    account_history: 'سجل حساب',
    wallet_receipt: 'إيصال محفظة',
    transfer_receipt: 'إيصال تحويل',
    statement: 'كشف',
    unknown: 'غير معروف'
  };

  const STATUS_LABELS = {
    pending: 'بانتظار المراجعة',
    in_review: 'قيد المراجعة',
    reviewed: 'تمت مراجعتها',
    excluded: 'مستبعدة',
    skipped: 'متجاوزة',
    insufficient_data: 'بيانات غير كافية',
    no_match: 'لا توجد مطابقة',
    ambiguous: 'ملتبسة',
    low_confidence_match: 'مطابقة ضعيفة',
    probable_match: 'مطابقة محتملة',
    high_confidence_match: 'مطابقة مرتفعة',
    error: 'خطأ'
  };

  const VERDICT_LABELS = {
    correct: 'صحيح',
    incorrect: 'غير صحيح',
    unreviewable: 'لا يمكن الحكم',
    correct_match: 'المطابقة صحيحة',
    wrong_match: 'المطابقة خاطئة',
    correct_abstention: 'الامتناع صحيح',
    missed_match: 'فاتته مطابقة صحيحة',
    ambiguous_case: 'الحالة ملتبسة فعلًا',
    unreviewable_routing: 'لا يمكن الحكم'
  };

  const ERROR_OPTIONS = [
    ['wrong_entity', 'تصنيف الجهة خاطئ'],
    ['wrong_template', 'نوع القالب خاطئ'],
    ['wrong_direction', 'اتجاه العملية خاطئ'],
    ['wrong_selected_operation', 'اختيار العملية خاطئ'],
    ['sender_receiver_swapped', 'عكس المرسل والمستلم'],
    ['document_account_misused', 'خلط حساب رأس الشاشة'],
    ['merchant_point_missing', 'نقطة حاسب مفقودة'],
    ['merchant_point_false', 'نقطة حاسب مستخرجة خطأ'],
    ['wrong_identifier_role', 'دور المعرّف خاطئ'],
    ['wrong_account_match', 'الحساب المرشح خاطئ'],
    ['should_abstain', 'كان يجب الامتناع'],
    ['poor_image', 'جودة الملف لا تسمح بالحكم'],
    ['other', 'خطأ آخر']
  ];

  const state = {
    session: null,
    overview: null,
    activeCaseId: null,
    activeDetail: null,
    correctedAccountId: null,
    accountResults: [],
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
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
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
    showNotice.timer = window.setTimeout(() => notice.classList.add('hidden'), 6000);
  }

  function decodeBase64Url(value) {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4);
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
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
    const stores = [window.localStorage, window.sessionStorage];
    for (const storage of stores) {
      try {
        const exact = storage.getItem(AUTH_KEY);
        const session = unwrapSession(exact);
        if (session) return session;

        const chunkKeys = [];
        for (let index = 0; index < storage.length; index += 1) {
          const key = storage.key(index);
          if (key?.startsWith(`${AUTH_KEY}.`)) chunkKeys.push(key);
        }
        if (chunkKeys.length) {
          chunkKeys.sort((a, b) => Number(a.split('.').pop()) - Number(b.split('.').pop()));
          const joined = chunkKeys.map((key) => storage.getItem(key) || '').join('');
          const chunkedSession = unwrapSession(joined);
          if (chunkedSession) return chunkedSession;
        }
      } catch {
        // Hardened/private browser storage may be unavailable.
      }
    }
    return null;
  }

  async function refreshSession(session) {
    if (!session?.refresh_token) return session;
    const response = await fetch(`${API_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: ANON_KEY },
      body: JSON.stringify({ refresh_token: session.refresh_token })
    });
    if (!response.ok) return session;
    const refreshed = await response.json();
    return refreshed?.access_token ? refreshed : session;
  }

  async function ensureSession(forceRefresh = false) {
    if (!state.session) state.session = readStoredSession();
    if (!state.session) throw new Error('لا توجد جلسة دخول. افتح تطبيق سند وسجّل الدخول بحساب مدير المنصة أولًا.');
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
      headers: {
        'Content-Type': 'application/json',
        apikey: ANON_KEY,
        Authorization: `Bearer ${session.access_token}`
      },
      body: JSON.stringify(body)
    });

    if (response.status === 401 && retry) {
      await ensureSession(true);
      return rpc(name, body, false);
    }

    const text = await response.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    if (!response.ok) {
      const message = data?.message || data?.hint || data?.error_description || `تعذر تنفيذ ${name}`;
      throw new Error(message);
    }
    return data;
  }

  function badge(value, tone) {
    const computed = tone || (
      ['reviewed', 'high_confidence_match', 'correct_match'].includes(value) ? 'green' :
      ['error', 'wrong_match'].includes(value) ? 'red' :
      ['pending', 'in_review', 'probable_match', 'ambiguous'].includes(value) ? 'amber' : 'blue'
    );
    return `<span class="badge ${computed}">${esc(STATUS_LABELS[value] || VERDICT_LABELS[value] || value || '—')}</span>`;
  }

  function renderGate(gate) {
    const reasons = Object.values(gate?.block_reasons || {}).filter(Boolean);
    byId('gateSection').className = 'gate-card blocked';
    byId('gateSection').innerHTML = `
      <div class="gate-title">
        <div><h2>التوجيه الحقيقي محظور تقنيًا</h2><p>هذه الصفحة تقيس الدقة فقط. لا توجد وظيفة تفعيل، ولا يمكن لنتيجة Benchmark إنشاء رابط نشاط أو إشعار كاشير.</p></div>
        <span class="block-badge">HARD BLOCK</span>
      </div>
      <div class="policy-grid">
        <div class="policy-item"><strong>${formatNumber(gate?.minimum_contract_v2_reviews)}</strong><span>الحد الأدنى لعينة v2</span></div>
        <div class="policy-item"><strong>${formatPercent(gate?.minimum_routing_precision)}</strong><span>دقة التوجيه المطلوبة</span></div>
        <div class="policy-item"><strong>${formatPercent(gate?.minimum_routing_recall)}</strong><span>الاستدعاء المطلوب</span></div>
        <div class="policy-item"><strong>${formatPercent(gate?.maximum_false_positive_rate)}</strong><span>أقصى خطأ إيجابي</span></div>
      </div>
      <div class="gate-reasons">${reasons.map((reason) => `<div class="gate-reason">${esc(reason)}</div>`).join('')}</div>
    `;
  }

  function renderStats(stats) {
    const cards = [
      ['إجمالي الحالات', stats.total_cases, 'كل تشغيلات الظل المسجلة'],
      ['عقد v2 الفعلي', stats.contract_v2_cases, 'الحالات المؤهلة للقياس التشغيلي'],
      ['بانتظار المراجعة', stats.pending_cases, 'لم تُسجل لها حقيقة بشرية'],
      ['تمت مراجعتها', stats.reviewed_cases, 'الأحكام الحالية فقط'],
      ['دقة المطابقات', formatPercent(stats.routing_precision), `${formatNumber(stats.correct_matches)} صحيحة / ${formatNumber(stats.wrong_matches)} خاطئة`],
      ['استدعاء المطابقات', formatPercent(stats.routing_recall), `${formatNumber(stats.missed_matches)} مطابقة فائتة`],
      ['الخطأ الإيجابي', formatPercent(stats.false_positive_rate), 'أخطر مقياس قبل التفعيل'],
      ['الجاهزية', 'محظور', 'حتى بعد اجتياز المؤشرات يلزم قرار إطلاق منفصل']
    ];
    byId('statsSection').innerHTML = cards.map(([label, value, hint], index) => `
      <article class="stat-card ${index === 7 ? 'emphasis' : ''}">
        <div class="value">${esc(value)}</div><div class="label">${esc(label)}</div><div class="hint">${esc(hint)}</div>
      </article>
    `).join('');
  }

  function renderEntityOptions(breakdown) {
    const select = byId('entityFilter');
    const current = select.value;
    const codes = [...new Set((breakdown || []).map((item) => item.financial_entity_code).filter(Boolean))];
    select.innerHTML = '<option value="">كل الجهات</option>' + codes.map((code) => `<option value="${esc(code)}">${esc(ENTITY_LABELS[code] || code)}</option>`).join('');
    if (codes.includes(current)) select.value = current;
  }

  function caseStatusTone(status) {
    if (status === 'reviewed') return 'green';
    if (status === 'pending' || status === 'in_review') return 'amber';
    if (status === 'excluded') return 'red';
    return 'blue';
  }

  function renderQueue(queue) {
    byId('queueCount').textContent = formatNumber(queue.length);
    const root = byId('queueSection');
    if (!queue.length) {
      root.innerHTML = '<div class="empty-state">لا توجد حالات مطابقة للفلاتر الحالية.<br>عند وصول إشعارات جديدة بعقد v2 ستُضاف تلقائيًا إلى الطابور.</div>';
      return;
    }
    root.innerHTML = queue.map((item) => `
      <article class="case-card">
        <div class="case-card-head">
          <div>
            <h3>${esc(ENTITY_LABELS[item.financial_entity_code] || item.financial_entity || 'جهة غير معروفة')}</h3>
            <p class="case-meta">${esc(TEMPLATE_LABELS[item.document_template] || item.document_template || 'قالب غير معروف')} · ${esc(item.cohort === 'contract_v2_live' ? 'عقد v2 فعلي' : 'خط أساس قديم')} · ${formatDate(item.operation_created_at)}</p>
          </div>
          <div class="badges">${badge(item.status, caseStatusTone(item.status))}${badge(item.shadow_status)}</div>
        </div>
        <div class="case-main">
          <div class="fact"><span>المبلغ</span><strong>${formatNumber(item.amount)} ${esc(item.currency || '')}</strong></div>
          <div class="fact"><span>اتجاه العملية</span><strong>${esc(item.transaction_direction || 'unknown')}</strong></div>
          <div class="fact"><span>استراتيجية المطابقة</span><strong>${esc(item.match_strategy || 'امتناع')}</strong></div>
          <div class="fact"><span>النشاط المرشح</span><strong>${esc(item.matched_business_name || 'لا يوجد')}</strong></div>
        </div>
        <div class="case-footer">
          <span class="case-score">score ${item.match_score == null ? '—' : formatNumber(item.match_score)}</span>
          <button type="button" class="primary-button" data-open-case="${esc(item.id)}">${item.review_id ? 'فتح المراجعة' : 'ابدأ المراجعة'}</button>
        </div>
      </article>
    `).join('');

    root.querySelectorAll('[data-open-case]').forEach((button) => {
      button.addEventListener('click', () => openCase(button.dataset.openCase));
    });
  }

  function renderBreakdown(rows) {
    const root = byId('breakdownSection');
    if (!rows?.length) {
      root.innerHTML = '<div class="empty-state">لا توجد بيانات تفصيلية بعد.</div>';
      return;
    }
    root.innerHTML = `<table><thead><tr><th>الجهة</th><th>القالب</th><th>الحالات</th><th>المراجعة</th><th>صحيحة</th><th>خاطئة</th><th>فائتة</th><th>الدقة</th></tr></thead><tbody>${rows.map((row) => `
      <tr>
        <td>${esc(ENTITY_LABELS[row.financial_entity_code] || row.financial_entity_code)}</td>
        <td>${esc(TEMPLATE_LABELS[row.document_template] || row.document_template)}</td>
        <td>${formatNumber(row.total_cases)}</td><td>${formatNumber(row.reviewed_cases)}</td>
        <td>${formatNumber(row.correct_matches)}</td><td>${formatNumber(row.wrong_matches)}</td>
        <td>${formatNumber(row.missed_matches)}</td><td>${formatPercent(row.precision)}</td>
      </tr>`).join('')}</tbody></table>`;
  }

  async function verifyAdmin() {
    const access = await rpc('get_my_platform_admin_access', {});
    if (!access?.allowed) throw new Error('الحساب الحالي لا يملك صلاحية مدير المنصة.');
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

  async function loadOverview(quiet = false) {
    if (state.loading) return;
    state.loading = true;
    byId('refreshButton').textContent = '…';
    try {
      if (!quiet) await verifyAdmin();
      const overview = await rpc('platform_admin_get_routing_benchmark_overview', currentFilters());
      state.overview = overview;
      renderGate(overview.gate || {});
      renderStats(overview.stats || {});
      renderEntityOptions(overview.breakdown || []);
      renderQueue(overview.queue || []);
      renderBreakdown(overview.breakdown || []);
    } catch (error) {
      showNotice(error.message || 'تعذر تحميل مركز Benchmark.', 'error');
      byId('queueSection').innerHTML = `<div class="empty-state">${esc(error.message || 'تعذر التحميل.')}</div>`;
    } finally {
      state.loading = false;
      byId('refreshButton').textContent = '↻';
    }
  }

  function detailRow(label, value) {
    return `<div class="detail-row"><span>${esc(label)}</span><strong>${value == null || value === '' ? '—' : esc(value)}</strong></div>`;
  }

  function renderCandidates(detail) {
    const candidates = detail.candidates || [];
    if (!candidates.length) return '<div class="empty-state">الخوارزمية امتنعت ولم تُرجع مرشحًا.</div>';
    return `<div class="candidate-list">${candidates.map((candidate, index) => `
      <article class="candidate ${index === 0 ? 'top' : ''}">
        <div class="candidate-head"><div><h4>${esc(candidate.business_name || 'نشاط غير معروف')}</h4><p>${esc(candidate.account_label || candidate.account_holder_name || 'حساب مالي')} · ${esc(candidate.strategy || candidate.evidence?.[0]?.source_role || '')}</p></div><span class="score-pill">${formatNumber(candidate.score)}</span></div>
      </article>`).join('')}</div>`;
  }

  function verdictSelect(id, label, current = 'correct') {
    return `<label>${esc(label)}<select id="${id}">
      <option value="correct" ${current === 'correct' ? 'selected' : ''}>صحيح</option>
      <option value="incorrect" ${current === 'incorrect' ? 'selected' : ''}>غير صحيح</option>
      <option value="unreviewable" ${current === 'unreviewable' ? 'selected' : ''}>لا يمكن الحكم</option>
    </select></label>`;
  }

  function entityOptions(selected) {
    return Object.entries(ENTITY_LABELS).map(([code, label]) => `<option value="${esc(code)}" ${selected === code ? 'selected' : ''}>${esc(label)}</option>`).join('');
  }

  function templateOptions(selected) {
    return Object.entries(TEMPLATE_LABELS).map(([code, label]) => `<option value="${esc(code)}" ${selected === code ? 'selected' : ''}>${esc(label)}</option>`).join('');
  }

  function renderAccountResults() {
    const root = byId('accountResults');
    if (!root) return;
    if (!state.accountResults.length) {
      root.innerHTML = '<div class="empty-state">ابحث باسم النشاط أو صاحب الحساب أو رقم المعرّف عند الحاجة إلى تصحيح المطابقة.</div>';
      return;
    }
    root.innerHTML = state.accountResults.map((account) => {
      const identifiers = (account.identifiers || []).slice(0, 3).map((item) => `${item.type}: ${item.value}${item.currency ? ` (${item.currency})` : ''}`).join(' · ');
      return `<button type="button" class="account-option ${state.correctedAccountId === account.account_id ? 'selected' : ''}" data-account-id="${esc(account.account_id)}"><strong>${esc(account.business_name)} — ${esc(account.account_label || account.account_holder_name || 'حساب مالي')}</strong><span>${esc(ENTITY_LABELS[account.financial_entity_code] || account.financial_entity_name || account.financial_entity_code)} · ${esc(identifiers || 'لا توجد معرّفات ظاهرة')}</span></button>`;
    }).join('');
    root.querySelectorAll('[data-account-id]').forEach((button) => {
      button.addEventListener('click', () => {
        state.correctedAccountId = button.dataset.accountId;
        renderAccountResults();
      });
    });
  }

  function renderCaseDetail(detail) {
    const operation = detail.operation || {};
    const run = detail.shadow_run || {};
    const review = detail.current_review || {};
    const old = operation.analysis_contract_version < 2;
    state.accountResults = detail.account_options || [];
    state.correctedAccountId = review.corrected_account_id || null;

    caseBody.innerHTML = `
      ${old ? '<div class="legacy-warning"><strong>خط أساس قديم:</strong> هذه العملية لم تُحلل بعقد v2 الكامل. استخدم «لا يمكن الحكم» للحقول التي لم تكن موجودة، ولا تعتبرها دليل جاهزية للتوجيه.</div>' : ''}
      <section class="detail-section">
        <div class="section-heading"><div><h3>الإشعار والعملية</h3><p>افتح الملف الفعلي أولًا، ثم قارن الصورة بهذه القيم.</p></div><a class="secondary-button" target="_blank" rel="noopener" href="/v/${esc(operation.public_token)}?src=app">فتح الإشعار ↗</a></div>
        <div class="detail-grid" style="margin-top:12px">
          ${detailRow('الجهة', operation.financial_entity)}
          ${detailRow('القالب', TEMPLATE_LABELS[operation.document_template] || operation.document_template)}
          ${detailRow('نوع العملية', operation.transaction_type)}
          ${detailRow('الاتجاه', operation.transaction_direction)}
          ${detailRow('المبلغ', operation.amount == null ? null : `${formatNumber(operation.amount)} ${operation.currency || ''}`)}
          ${detailRow('المرجع', operation.reference_number)}
          ${detailRow('المرسل', operation.sender_name)}
          ${detailRow('حساب المرسل', operation.sender_account)}
          ${detailRow('المستلم', operation.receiver_name)}
          ${detailRow('حساب المستلم', operation.receiver_account)}
          ${detailRow('حساب رأس المستند', operation.document_account)}
          ${detailRow('الحساب الدائن', operation.credited_account)}
          ${detailRow('الحساب المدين', operation.debited_account)}
          ${detailRow('نقطة حاسب/التاجر', operation.merchant_point)}
          ${detailRow('عملية من قائمة', operation.multiple_operations_present ? `نعم · الموضع ${operation.selected_operation_position || '—'}` : 'لا')}
        </div>
      </section>

      <section class="detail-section">
        <h3>قرار المطابقة الظلية</h3>
        <div class="detail-grid">
          ${detailRow('الحالة', STATUS_LABELS[run.status] || run.status)}
          ${detailRow('الدرجة', run.match_score)}
          ${detailRow('الاستراتيجية', run.match_strategy)}
          ${detailRow('النشاط المرشح', detail.matched_business?.name)}
          ${detailRow('الحساب المرشح', detail.matched_account?.account_label || detail.matched_account?.account_holder_name)}
          ${detailRow('عدد المرشحين', run.candidate_count)}
        </div>
        <div style="margin-top:12px">${renderCandidates(detail)}</div>
      </section>

      <form id="reviewForm" class="detail-section">
        <h3>الحكم البشري</h3>
        <div class="review-grid">
          ${verdictSelect('documentVerdict', 'هل المستند مالي وقابل للتحليل؟', review.document_verdict || 'correct')}
          ${verdictSelect('entityVerdict', 'تصنيف الجهة المالية', review.entity_verdict || 'correct')}
          ${verdictSelect('templateVerdict', 'نوع القالب', review.template_verdict || (old ? 'unreviewable' : 'correct'))}
          ${verdictSelect('directionVerdict', 'اتجاه العملية', review.direction_verdict || (old ? 'unreviewable' : 'correct'))}
          ${verdictSelect('selectedOperationVerdict', 'اختيار العملية الصحيحة', review.selected_operation_verdict || 'correct')}
          ${verdictSelect('identifierRolesVerdict', 'أدوار الحسابات والمعرّفات', review.identifier_roles_verdict || (old ? 'unreviewable' : 'correct'))}
          <label>حكم التوجيه النهائي<select id="routingVerdict">
            ${[
              ['correct_match','المطابقة صحيحة'],['wrong_match','المطابقة خاطئة'],
              ['correct_abstention','الامتناع صحيح'],['missed_match','فاتته مطابقة صحيحة'],
              ['ambiguous_case','الحالة ملتبسة فعلًا'],['unreviewable','لا يمكن الحكم']
            ].map(([value,label]) => `<option value="${value}" ${review.routing_verdict === value ? 'selected' : ''}>${label}</option>`).join('')}
          </select></label>
        </div>

        <div class="correction-box">
          <h4>التصحيح المرجعي عند وجود خطأ</h4>
          <div class="review-grid">
            <label>الجهة الصحيحة<select id="correctedEntity"><option value="">بدون تصحيح</option>${entityOptions(review.corrected_financial_entity_code || operation.financial_entity_code)}</select></label>
            <label>القالب الصحيح<select id="correctedTemplate"><option value="">بدون تصحيح</option>${templateOptions(review.corrected_document_template || operation.document_template)}</select></label>
            <label>الاتجاه الصحيح<select id="correctedDirection"><option value="">بدون تصحيح</option>${['incoming','outgoing','internal','unknown'].map((value) => `<option value="${value}" ${review.corrected_transaction_direction === value ? 'selected' : ''}>${value}</option>`).join('')}</select></label>
            <label>موضع العملية الصحيح<input id="correctedPosition" type="number" min="1" max="100" value="${esc(review.corrected_selected_operation_position || '')}" placeholder="مثال: 1" /></label>
          </div>
          <div class="review-grid" style="margin-top:10px">
            <label>بحث الحساب الصحيح<input id="accountSearch" placeholder="اسم النشاط، صاحب الحساب، أو الرقم" /></label>
            <label>تصفية الجهة<select id="accountEntity"><option value="">كل الجهات</option>${entityOptions(review.corrected_financial_entity_code || operation.financial_entity_code)}</select></label>
          </div>
          <button id="searchAccountsButton" type="button" class="secondary-button" style="margin-top:9px">بحث الحسابات</button>
          <div id="accountResults" class="account-results"></div>
        </div>

        <div style="margin-top:13px"><p style="margin:0 0 8px;font-size:9px;font-weight:850;color:#475569">رموز الخطأ</p><div class="checkbox-grid">${ERROR_OPTIONS.map(([value,label]) => `<label class="checkbox-item"><input type="checkbox" name="errorCode" value="${value}" ${(review.error_codes || []).includes(value) ? 'checked' : ''}/><span>${esc(label)}</span></label>`).join('')}</div></div>
        <label style="margin-top:12px">ملاحظات المراجع<textarea id="reviewerNotes" placeholder="اشرح موضع الخطأ أو سبب الامتناع">${esc(review.reviewer_notes || '')}</textarea></label>
        <label style="margin-top:10px">سبب الإجراء الإداري<textarea id="reviewReason" required placeholder="سبب واضح لا يقل عن 5 أحرف">${esc(review.id ? 'تحديث الحكم المرجعي للحالة' : 'تسجيل حكم بشري لحالة Benchmark')}</textarea></label>
        <div class="form-actions"><button id="cancelReviewButton" type="button" class="secondary-button">إغلاق دون حفظ</button><button id="submitReviewButton" type="submit" class="primary-button">حفظ الحكم</button></div>
      </form>
    `;

    renderAccountResults();
    byId('searchAccountsButton').addEventListener('click', searchAccounts);
    byId('reviewForm').addEventListener('submit', submitReview);
    byId('cancelReviewButton').addEventListener('click', closeModal);
  }

  async function searchAccounts() {
    const button = byId('searchAccountsButton');
    button.disabled = true;
    button.textContent = 'جارٍ البحث…';
    try {
      const result = await rpc('platform_admin_search_routing_benchmark_accounts', {
        p_query: byId('accountSearch').value.trim() || null,
        p_entity_code: byId('accountEntity').value || null,
        p_limit: 100
      });
      state.accountResults = result?.results || [];
      renderAccountResults();
    } catch (error) {
      showNotice(error.message || 'تعذر البحث عن الحسابات.', 'error');
    } finally {
      button.disabled = false;
      button.textContent = 'بحث الحسابات';
    }
  }

  async function openCase(caseId) {
    state.activeCaseId = caseId;
    state.activeDetail = null;
    state.correctedAccountId = null;
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    caseBody.innerHTML = '<div class="loading-block"><div class="loader"></div></div>';
    try {
      await rpc('platform_admin_claim_routing_benchmark_case', { p_case_id: caseId });
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
    if (!caseId || state.activeDetail?.case?.status === 'reviewed') return;
    try { await rpc('platform_admin_release_routing_benchmark_case', { p_case_id: caseId }); } catch { /* claim expires safely */ }
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
    if (reason.length < 5) {
      showNotice('اكتب سببًا إداريًا واضحًا لا يقل عن 5 أحرف.', 'error');
      return;
    }
    if (['wrong_match', 'missed_match'].includes(routingVerdict) && !state.correctedAccountId) {
      showNotice('اختر الحساب الصحيح عند الحكم بوجود مطابقة خاطئة أو فائتة.', 'error');
      return;
    }

    button.disabled = true;
    button.textContent = 'جارٍ الحفظ…';
    const errorCodes = [...document.querySelectorAll('input[name="errorCode"]:checked')].map((input) => input.value);
    try {
      await rpc('platform_admin_review_routing_benchmark_case', {
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
      state.activeDetail.case.status = 'reviewed';
      showNotice('تم حفظ الحكم المرجعي وتحديث مؤشرات Benchmark. التوجيه الحقيقي ما زال محظورًا.', 'success');
      modal.classList.add('hidden');
      modal.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
      state.activeCaseId = null;
      state.activeDetail = null;
      await loadOverview(true);
    } catch (error) {
      showNotice(error.message || 'تعذر حفظ الحكم.', 'error');
    } finally {
      button.disabled = false;
      button.textContent = 'حفظ الحكم';
    }
  }

  function bindEvents() {
    byId('refreshButton').addEventListener('click', () => loadOverview(true));
    ['statusFilter', 'cohortFilter', 'entityFilter', 'templateFilter'].forEach((id) => {
      byId(id).addEventListener('change', () => loadOverview(true));
    });
    byId('closeModalButton').addEventListener('click', closeModal);
    modal.querySelectorAll('[data-close-modal]').forEach((element) => element.addEventListener('click', closeModal));
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !modal.classList.contains('hidden')) closeModal();
    });
  }

  async function boot() {
    bindEvents();
    try {
      await ensureSession();
      await loadOverview(false);
    } catch (error) {
      showNotice(error.message || 'تعذر بدء مركز Benchmark.', 'error');
      byId('gateSection').innerHTML = `<div class="empty-state">${esc(error.message || 'تعذر بدء الصفحة.')}</div>`;
      byId('queueSection').innerHTML = '<div class="empty-state">افتح تطبيق سند وسجّل الدخول بحساب مدير المنصة، ثم أعد تحميل هذه الصفحة.</div>';
    }
  }

  boot();
})();

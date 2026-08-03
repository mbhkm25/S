(() => {
  'use strict';

  const API_URL = 'https://api.sanadflow.com';
  const PROJECT_REF = 'hudbzlgclghlhazlduas';
  const AUTH_KEY = `sb-${PROJECT_REF}-auth-token`;
  const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh1ZGJ6bGdobGhhemxkdWFzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI4NzI3NzEsImV4cCI6MjA5ODQ0ODc3MX0.mQvUtmAwmRXPdMJdynPemP56PSeONMUpw_k0rz_pUag';

  const REASON_LABELS = {
    policy_disabled: 'السياسة معطلة',
    emergency_stop: 'الإيقاف الطارئ مفعّل',
    rollout_mode_shadow: 'الوضع الحالي ظل فقط',
    benchmark_gate_not_passed: 'بوابة Benchmark غير مجتازة',
    analysis_contract_too_old: 'عقد التحليل أقدم من المطلوب',
    analysis_not_completed: 'التحليل غير مكتمل',
    possible_fraud: 'اشتباه يستوجب الامتناع',
    missing_matched_business_or_account: 'لا يوجد نشاط وحساب محسومان',
    candidate_count_not_one: 'عدد المرشحين ليس واحدًا',
    match_score_below_policy: 'درجة المطابقة دون الحد',
    shadow_status_not_allowed: 'حالة الظل غير مسموحة',
    match_strategy_not_allowed: 'استراتيجية المطابقة غير مسموحة',
    blocked_operation_warning: 'تحذير تشغيلي محظور',
    financial_account_not_found: 'الحساب المالي غير موجود',
    financial_account_business_conflict: 'الحساب لا يتبع النشاط المرشح',
    financial_account_inactive: 'الحساب المالي غير نشط',
    financial_account_routing_disabled: 'التوجيه معطل للحساب',
    financial_account_not_verified: 'الحساب المالي غير موثّق',
    benchmark_segment_sample_insufficient: 'عينة الجهة والقالب غير كافية',
    no_enabled_rollout_target: 'لا يوجد هدف مفعّل في قائمة السماح',
    global_daily_cap_reached: 'السقف اليومي العام مكتمل',
    business_daily_cap_reached: 'سقف النشاط اليومي مكتمل',
    target_daily_cap_reached: 'سقف الهدف اليومي مكتمل',
    operation_linked_to_different_business: 'العملية مرتبطة بنشاط آخر',
    existing_business_link_unlinked: 'يوجد فك ارتباط سابق',
    evaluation_error: 'خطأ داخلي في التقييم'
  };

  const state = {
    session: null,
    overview: null,
    accountResults: [],
    selectedAccount: null,
    editingTargetId: null,
    loading: false
  };

  const byId = id => document.getElementById(id);
  const notice = byId('notice');
  const numberFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
  const percentFormat = new Intl.NumberFormat('en-US', { style: 'percent', maximumFractionDigits: 2 });
  const dateFormat = new Intl.DateTimeFormat('ar-YE', { dateStyle: 'medium', timeStyle: 'short' });

  function esc(value) {
    return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }

  function formatNumber(value) {
    return value == null || Number.isNaN(Number(value)) ? '—' : numberFormat.format(Number(value));
  }

  function formatPercent(value) {
    return value == null || Number.isNaN(Number(value)) ? '—' : percentFormat.format(Number(value));
  }

  function formatDate(value) {
    if (!value) return '—';
    try { return dateFormat.format(new Date(value)); } catch { return '—'; }
  }

  function showNotice(message, tone = 'info') {
    notice.textContent = message;
    notice.className = `notice ${tone}`;
    clearTimeout(showNotice.timer);
    showNotice.timer = setTimeout(() => notice.classList.add('hidden'), 6000);
  }

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
        if (chunks.length) {
          chunks.sort((a, b) => Number(a.split('.').pop()) - Number(b.split('.').pop()));
          const session = unwrapSession(chunks.map(key => storage.getItem(key) || '').join(''));
          if (session) return session;
        }
      } catch { /* private storage may be unavailable */ }
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

  async function ensureSession(force = false) {
    if (!state.session) state.session = readSession();
    if (!state.session) throw new Error('سجّل الدخول إلى سند بحساب مدير المنصة أولًا.');
    const expiresAt = Number(state.session.expires_at || 0) * 1000;
    if (force || (expiresAt && expiresAt < Date.now() + 90_000)) state.session = await refreshSession(state.session);
    return state.session;
  }

  async function rpc(name, body = {}, retry = true) {
    const session = await ensureSession();
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
    let data;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    if (!response.ok) throw new Error(data?.message || data?.hint || `تعذر تنفيذ ${name}`);
    return data;
  }

  function checkedValues(name) {
    return [...document.querySelectorAll(`input[name="${name}"]:checked`)].map(input => input.value);
  }

  function setChecks(name, values) {
    const set = new Set(Array.isArray(values) ? values : []);
    document.querySelectorAll(`input[name="${name}"]`).forEach(input => { input.checked = set.has(input.value); });
  }

  function renderGate(gate, policy) {
    const reasons = [];
    if (gate.activation_hard_block) reasons.push('حظر Benchmark المرجعي مفعّل');
    if (!gate.metrics_pass) reasons.push('مؤشرات الدقة والعينة لم تجتز السياسة');
    if (!policy.enabled) reasons.push('سياسة التوجيه معطلة');
    if (policy.emergency_stop) reasons.push('الإيقاف الطارئ مفعّل');
    if (policy.rollout_mode === 'shadow') reasons.push('وضع التشغيل ظل فقط');
    const ready = Boolean(gate.allowed && policy.enabled && !policy.emergency_stop && policy.rollout_mode !== 'shadow');
    const root = byId('gateSection');
    root.className = `gate-card ${ready ? 'ready' : 'blocked'}`;
    root.innerHTML = `<div class="gate-head"><div><h2>${ready ? 'التوجيه التدريجي متاح' : 'التوجيه الحقيقي محظور'}</h2><p>حتى عند جاهزية السياسة، كل عملية تُفحص منفردة مقابل الحساب والهدف والسقف والتحذيرات.</p></div><span class="hard-badge">${ready ? 'READY' : 'HARD BLOCK'}</span></div>
      <div class="gate-reasons">${reasons.map(reason => `<div class="gate-reason">${esc(reason)}</div>`).join('') || '<div class="gate-reason">جميع البوابات مجتازة</div>'}</div>
      <div class="gate-reasons">
        <div class="gate-reason">عينة v2: ${formatNumber(gate.contract_v2_reviews)} / ${formatNumber(gate.minimum_contract_v2_reviews)}</div>
        <div class="gate-reason">أدنى قطاع: ${formatNumber(gate.minimum_reviewed_segment)} / ${formatNumber(gate.minimum_reviews_per_entity_template)}</div>
        <div class="gate-reason">Precision: ${formatPercent(gate.routing_precision)}</div>
        <div class="gate-reason">Recall: ${formatPercent(gate.routing_recall)}</div>
      </div>`;
    byId('benchmarkBlockButton').textContent = gate.activation_hard_block ? 'رفع حظر Benchmark' : 'إعادة حظر Benchmark';
    byId('benchmarkBlockButton').disabled = gate.activation_hard_block && !gate.metrics_pass;
    byId('policyEnabled').disabled = !gate.allowed;
  }

  function renderStats(counts) {
    const cards = [
      ['الأهداف المفعّلة', counts.enabled_targets || 0],
      ['قرارات مرفوضة', counts.denied || 0],
      ['تم توجيهها', counts.enqueued || 0],
      ['روابط تلقائية', counts.auto_links || 0],
      ['صندوق Canary/Live', counts.payment_inbox_items || 0],
      ['أخطاء التقييم', counts.errors || 0],
      ['توجيهات اليوم', counts.enqueued_today || 0],
      ['إجمالي القرارات', counts.total || 0]
    ];
    byId('statsSection').innerHTML = cards.map(([label, value]) => `<article class="stat"><strong>${formatNumber(value)}</strong><span>${esc(label)}</span></article>`).join('');
  }

  function renderPolicy(policy) {
    byId('policyVersion').textContent = `v${policy.policy_version || 1}`;
    byId('rolloutMode').value = policy.rollout_mode || 'shadow';
    byId('minimumScore').value = policy.minimum_match_score ?? 99.5;
    byId('globalCap').value = policy.global_daily_cap ?? 10;
    byId('businessCap').value = policy.default_business_daily_cap ?? 3;
    byId('requireVerified').checked = policy.require_verified_financial_account !== false;
    byId('emergencyStop').checked = policy.emergency_stop !== false;
    byId('policyEnabled').checked = policy.enabled === true;
    setChecks('shadowStatus', policy.allowed_shadow_statuses);
    setChecks('strategy', policy.allowed_match_strategies);
  }

  function badge(text, tone = '') { return `<span class="badge ${tone}">${esc(text)}</span>`; }

  function renderTargets(targets) {
    byId('targetsCount').textContent = formatNumber(targets.length);
    const root = byId('targetsSection');
    if (!targets.length) {
      root.innerHTML = '<div class="empty">لا توجد أهداف بعد. ابحث عن حساب مالي وأضفه معطلًا إلى أن تكتمل بوابة القياس.</div>';
      return;
    }
    root.innerHTML = targets.map(target => `<article class="target-card">
      <div class="target-head"><div><strong>${esc(target.business_name)} — ${esc(target.account_label || target.account_holder_name || 'حساب مالي')}</strong><p>${esc(target.financial_entity_code || '—')} · ${esc(target.match_strategy || 'أي استراتيجية مسموحة')} · سقف ${formatNumber(target.daily_cap)} يوميًا</p></div>
      <div class="badges">${badge(target.rollout_mode, 'amber')}${badge(target.enabled ? 'مفعّل' : 'معطّل', target.enabled ? 'green' : '')}${badge(target.account_verification_status || '—', target.account_verification_status === 'verified' ? 'green' : 'red')}</div></div>
      <p>التوجيه للحساب: ${target.account_routing_enabled ? 'مفعّل' : 'معطّل'} · الحالة: ${esc(target.account_status || '—')} · آخر تحديث ${formatDate(target.updated_at)}</p>
      <div class="target-actions"><button class="secondary" data-edit-target="${esc(target.id)}">تعديل</button>${target.enabled ? `<button class="danger" data-disable-target="${esc(target.id)}">تعطيل</button>` : ''}</div>
    </article>`).join('');
    root.querySelectorAll('[data-edit-target]').forEach(button => button.addEventListener('click', () => editTarget(button.dataset.editTarget)));
    root.querySelectorAll('[data-disable-target]').forEach(button => button.addEventListener('click', () => disableTarget(button.dataset.disableTarget)));
  }

  function renderDecisions(decisions) {
    const root = byId('decisionsSection');
    if (!decisions.length) {
      root.innerHTML = '<div class="empty">لا توجد قرارات تشغيل بعد. ستُسجل القرارات مع تشغيلات الظل الجديدة.</div>';
      return;
    }
    root.innerHTML = `<table><thead><tr><th>الوقت</th><th>النشاط</th><th>الحالة</th><th>الدرجة</th><th>الاستراتيجية</th><th>الحواجز</th></tr></thead><tbody>${decisions.map(item => `<tr>
      <td>${formatDate(item.last_evaluated_at)}</td><td>${esc(item.business_name || '—')}</td><td>${esc(item.decision_status)}</td><td>${formatNumber(item.match_score)}</td><td>${esc(item.match_strategy || '—')}</td>
      <td>${(item.gate_reasons || []).map(reason => esc(REASON_LABELS[reason] || reason)).join('، ') || '—'}</td></tr>`).join('')}</tbody></table>`;
  }

  function renderAccountResults() {
    const root = byId('accountResults');
    if (!state.accountResults.length) {
      root.innerHTML = '<div class="empty">ابحث عن الحساب المالي المراد إدخاله في قائمة السماح.</div>';
      return;
    }
    root.innerHTML = state.accountResults.map(account => {
      const identifiers = (account.identifiers || []).slice(0, 3).map(item => `${item.type}: ${item.value}`).join(' · ');
      return `<button type="button" class="account-option" data-account="${esc(account.financial_account_id)}"><strong>${esc(account.business_name)} — ${esc(account.account_label || account.account_holder_name || 'حساب مالي')}</strong><span>${esc(account.financial_entity_name || account.financial_entity_code)} · ${esc(identifiers || 'بدون معرّفات')} · ${esc(account.verification_status)} · التوجيه ${account.routing_enabled ? 'مفعّل' : 'معطّل'}</span></button>`;
    }).join('');
    root.querySelectorAll('[data-account]').forEach(button => button.addEventListener('click', () => selectAccount(button.dataset.account)));
  }

  function selectAccount(accountId) {
    state.selectedAccount = state.accountResults.find(item => item.financial_account_id === accountId) || null;
    if (!state.selectedAccount) return;
    byId('selectedAccount').classList.remove('hidden');
    byId('selectedAccount').innerHTML = `<strong>${esc(state.selectedAccount.business_name)} — ${esc(state.selectedAccount.account_label || state.selectedAccount.account_holder_name || 'حساب مالي')}</strong><br>${esc(state.selectedAccount.financial_entity_name || state.selectedAccount.financial_entity_code)} · ${esc(state.selectedAccount.verification_status)} · التوجيه ${state.selectedAccount.routing_enabled ? 'مفعّل' : 'معطّل'}`;
    byId('targetEnabled').disabled = state.selectedAccount.verification_status !== 'verified' || !state.selectedAccount.routing_enabled || state.selectedAccount.status !== 'active';
    if (byId('targetEnabled').disabled) byId('targetEnabled').checked = false;
  }

  function editTarget(targetId) {
    const target = state.overview.targets.find(item => item.id === targetId);
    if (!target) return;
    state.editingTargetId = target.id;
    state.selectedAccount = {
      business_id: target.business_id,
      business_name: target.business_name,
      financial_account_id: target.financial_account_id,
      account_label: target.account_label,
      account_holder_name: target.account_holder_name,
      financial_entity_code: target.financial_entity_code,
      financial_entity_name: target.financial_entity_code,
      verification_status: target.account_verification_status,
      routing_enabled: target.account_routing_enabled,
      status: target.account_status,
      identifiers: []
    };
    byId('targetMode').value = target.rollout_mode;
    byId('targetCap').value = target.daily_cap;
    byId('targetStrategy').value = target.match_strategy || 'receiver_account';
    byId('targetEnabled').checked = target.enabled;
    byId('targetNotes').value = target.notes || '';
    selectAccountFromState();
    byId('targetReason').focus();
    window.scrollTo({ top: byId('selectedAccount').offsetTop - 100, behavior: 'smooth' });
  }

  function selectAccountFromState() {
    if (!state.selectedAccount) return;
    byId('selectedAccount').classList.remove('hidden');
    byId('selectedAccount').innerHTML = `<strong>${esc(state.selectedAccount.business_name)} — ${esc(state.selectedAccount.account_label || state.selectedAccount.account_holder_name || 'حساب مالي')}</strong><br>${esc(state.selectedAccount.financial_entity_name || state.selectedAccount.financial_entity_code)} · ${esc(state.selectedAccount.verification_status)}`;
    byId('targetEnabled').disabled = state.selectedAccount.verification_status !== 'verified' || !state.selectedAccount.routing_enabled || state.selectedAccount.status !== 'active';
  }

  async function loadOverview(quiet = false) {
    if (state.loading) return;
    state.loading = true;
    byId('refreshButton').textContent = '…';
    try {
      const overview = await rpc('platform_admin_get_financial_routing_rollout_overview');
      state.overview = overview;
      renderGate(overview.benchmark_gate || {}, overview.policy || {});
      renderStats(overview.counts || {});
      renderPolicy(overview.policy || {});
      renderTargets(overview.targets || []);
      renderDecisions(overview.recent_decisions || []);
    } catch (error) {
      showNotice(error.message || 'تعذر تحميل مركز التفعيل.', 'error');
      if (!quiet) byId('gateSection').innerHTML = `<div class="empty">${esc(error.message || 'تعذر التحميل.')}</div>`;
    } finally {
      state.loading = false;
      byId('refreshButton').textContent = '↻';
    }
  }

  async function savePolicy(event) {
    event.preventDefault();
    const reason = byId('policyReason').value.trim();
    if (reason.length < 10) return showNotice('اكتب سببًا إداريًا لا يقل عن 10 أحرف.', 'error');
    const statuses = checkedValues('shadowStatus');
    const strategies = checkedValues('strategy');
    if (!statuses.length || !strategies.length) return showNotice('اختر حالة ظل واستراتيجية واحدة على الأقل.', 'error');
    const button = byId('savePolicyButton');
    button.disabled = true;
    try {
      await rpc('platform_admin_update_financial_routing_rollout_policy', {
        p_enabled: byId('policyEnabled').checked,
        p_emergency_stop: byId('emergencyStop').checked,
        p_rollout_mode: byId('rolloutMode').value,
        p_minimum_match_score: Number(byId('minimumScore').value),
        p_allowed_shadow_statuses: statuses,
        p_allowed_match_strategies: strategies,
        p_global_daily_cap: Number(byId('globalCap').value),
        p_default_business_daily_cap: Number(byId('businessCap').value),
        p_require_verified_financial_account: byId('requireVerified').checked,
        p_reason: reason
      });
      byId('policyReason').value = '';
      showNotice('تم حفظ السياسة. ستظل قاعدة البيانات صاحبة القرار النهائي لكل عملية.', 'success');
      await loadOverview(true);
    } catch (error) { showNotice(error.message || 'تعذر حفظ السياسة.', 'error'); }
    finally { button.disabled = false; }
  }

  async function emergencyStop() {
    const reason = byId('policyReason').value.trim();
    if (reason.length < 10) return showNotice('اكتب سبب الإيقاف في حقل سبب التعديل.', 'error');
    if (!confirm('تفعيل الإيقاف الطارئ وتعطيل السياسة فورًا؟')) return;
    const button = byId('emergencyButton');
    button.disabled = true;
    try {
      await rpc('platform_admin_emergency_stop_financial_routing', { p_reason: reason });
      showNotice('تم تفعيل الإيقاف الطارئ وتعطيل التوجيه.', 'success');
      await loadOverview(true);
    } catch (error) { showNotice(error.message || 'تعذر تنفيذ الإيقاف.', 'error'); }
    finally { button.disabled = false; }
  }

  async function toggleBenchmarkBlock() {
    const reason = byId('policyReason').value.trim();
    if (reason.length < 10) return showNotice('اكتب سبب الإجراء في حقل سبب التعديل.', 'error');
    const current = state.overview?.benchmark_gate?.activation_hard_block !== false;
    const button = byId('benchmarkBlockButton');
    button.disabled = true;
    try {
      await rpc('platform_admin_set_routing_benchmark_hard_block', { p_hard_block: !current, p_reason: reason });
      showNotice(current ? 'تم رفع الحظر المرجعي بعد تحقق الخادم.' : 'تمت إعادة حظر التفعيل المرجعي.', 'success');
      await loadOverview(true);
    } catch (error) { showNotice(error.message || 'تعذر تحديث حظر Benchmark.', 'error'); }
    finally { button.disabled = false; }
  }

  async function searchAccounts() {
    const button = byId('searchAccountsButton');
    button.disabled = true;
    try {
      const result = await rpc('platform_admin_search_financial_routing_target_accounts', {
        p_query: byId('accountSearch').value.trim() || null,
        p_limit: 100
      });
      state.accountResults = result?.results || [];
      renderAccountResults();
    } catch (error) { showNotice(error.message || 'تعذر البحث عن الحسابات.', 'error'); }
    finally { button.disabled = false; }
  }

  async function saveTarget() {
    if (!state.selectedAccount) return showNotice('اختر حسابًا ماليًا أولًا.', 'error');
    const reason = byId('targetReason').value.trim();
    if (reason.length < 10) return showNotice('اكتب سببًا إداريًا لا يقل عن 10 أحرف.', 'error');
    const button = byId('saveTargetButton');
    button.disabled = true;
    try {
      await rpc('platform_admin_upsert_financial_routing_rollout_target', {
        p_target_id: state.editingTargetId,
        p_business_id: state.selectedAccount.business_id,
        p_financial_account_id: state.selectedAccount.financial_account_id,
        p_financial_entity_code: state.selectedAccount.financial_entity_code,
        p_match_strategy: byId('targetStrategy').value,
        p_rollout_mode: byId('targetMode').value,
        p_enabled: byId('targetEnabled').checked,
        p_daily_cap: Number(byId('targetCap').value),
        p_valid_from: null,
        p_valid_until: null,
        p_notes: byId('targetNotes').value.trim() || null,
        p_reason: reason
      });
      state.editingTargetId = null;
      state.selectedAccount = null;
      byId('selectedAccount').classList.add('hidden');
      byId('targetReason').value = '';
      byId('targetNotes').value = '';
      byId('targetEnabled').checked = false;
      showNotice('تم حفظ هدف قائمة السماح.', 'success');
      await loadOverview(true);
    } catch (error) { showNotice(error.message || 'تعذر حفظ الهدف.', 'error'); }
    finally { button.disabled = false; }
  }

  async function disableTarget(targetId) {
    const reason = prompt('اكتب سبب تعطيل الهدف (10 أحرف على الأقل):')?.trim() || '';
    if (reason.length < 10) return showNotice('لم يتم التعطيل: السبب غير كافٍ.', 'error');
    try {
      await rpc('platform_admin_disable_financial_routing_rollout_target', { p_target_id: targetId, p_reason: reason });
      showNotice('تم تعطيل الهدف.', 'success');
      await loadOverview(true);
    } catch (error) { showNotice(error.message || 'تعذر تعطيل الهدف.', 'error'); }
  }

  function bindEvents() {
    byId('refreshButton').addEventListener('click', () => loadOverview(true));
    byId('policyForm').addEventListener('submit', savePolicy);
    byId('emergencyButton').addEventListener('click', emergencyStop);
    byId('benchmarkBlockButton').addEventListener('click', toggleBenchmarkBlock);
    byId('searchAccountsButton').addEventListener('click', searchAccounts);
    byId('saveTargetButton').addEventListener('click', saveTarget);
    byId('accountSearch').addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); void searchAccounts(); } });
  }

  async function boot() {
    bindEvents();
    try {
      await ensureSession();
      await loadOverview();
    } catch (error) {
      showNotice(error.message || 'تعذر بدء مركز التفعيل.', 'error');
      byId('gateSection').innerHTML = `<div class="empty">${esc(error.message || 'تعذر بدء الصفحة.')}</div>`;
    }
  }

  boot();
})();

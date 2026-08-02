(() => {
  'use strict';

  const nativeFetch = window.fetch.bind(window);
  const RPC_MARKER = '/rest/v1/rpc/';

  const LEGACY_ACTIONS = Object.freeze({
    claim_business_payment_v2: 'claim_business_payment',
    heartbeat_business_payment_claim_v2: 'heartbeat_business_payment_claim',
    complete_business_payment_v2: 'complete_business_payment',
    release_business_payment_v2: 'release_business_payment',
    reject_business_payment_v2: 'reject_business_payment'
  });

  function rpcName(input) {
    const value = typeof input === 'string' || input instanceof URL ? String(input) : input?.url;
    if (!value) return null;
    try {
      const url = new URL(value, location.href);
      const index = url.pathname.indexOf(RPC_MARKER);
      return index < 0 ? null : decodeURIComponent(url.pathname.slice(index + RPC_MARKER.length));
    } catch {
      return null;
    }
  }

  function replaceRpc(input, name) {
    const source = typeof input === 'string' || input instanceof URL ? String(input) : input.url;
    const url = new URL(source, location.href);
    const index = url.pathname.indexOf(RPC_MARKER);
    url.pathname = `${url.pathname.slice(0, index)}${RPC_MARKER}${name}`;
    return url.toString();
  }

  function parseBody(init) {
    if (!init?.body || typeof init.body !== 'string') return {};
    try { return JSON.parse(init.body); } catch { return {}; }
  }

  function isMissingFunction(payload, response) {
    const message = String(payload?.message || payload?.hint || '').toLowerCase();
    return response.status === 404
      || payload?.code === 'PGRST202'
      || message.includes('could not find the function')
      || message.includes('schema cache');
  }

  async function readPayload(response) {
    try { return await response.clone().json(); } catch { return null; }
  }

  function legacyRequest(name, body) {
    if (name === 'get_my_business_payment_inbox_contexts_v2') {
      return { name: 'get_my_business_payment_inbox_contexts', body: {} };
    }

    if (name === 'get_business_payment_inbox_v2') {
      const view = body.p_view || 'new';
      const status = view === 'mine' ? 'claimed'
        : view === 'review' ? 'review_required'
        : ['team_active', 'all'].includes(view) ? 'claimed'
        : view;
      return {
        name: 'get_business_payment_inbox',
        body: {
          p_business_id: body.p_business_id,
          p_status: status,
          p_limit: body.p_limit || 100,
          p_before_created_at: body.p_before_created_at || null,
          p_before_id: body.p_before_id || null
        }
      };
    }

    if (LEGACY_ACTIONS[name]) {
      const legacyName = LEGACY_ACTIONS[name];
      const payload = { p_inbox_id: body.p_inbox_id };
      if (legacyName === 'claim_business_payment') payload.p_lease_seconds = body.p_lease_seconds || 300;
      if (legacyName === 'heartbeat_business_payment_claim') payload.p_lease_seconds = body.p_lease_seconds || 300;
      if (legacyName === 'complete_business_payment') payload.p_note = body.p_note || null;
      if (legacyName === 'release_business_payment' || legacyName === 'reject_business_payment') {
        payload.p_reason = body.p_reason || 'تم الإجراء من واجهة التوافق المؤقتة';
      }
      return { name: legacyName, body: payload };
    }

    return null;
  }

  window.fetch = async function paymentInboxCompatibilityFetch(input, init = undefined) {
    const name = rpcName(input);
    if (!name || (!name.endsWith('_v2') && !LEGACY_ACTIONS[name])) {
      return nativeFetch(input, init);
    }

    const firstResponse = await nativeFetch(input, init);
    if (firstResponse.ok) return firstResponse;

    const firstPayload = await readPayload(firstResponse);
    if (!isMissingFunction(firstPayload, firstResponse)) return firstResponse;

    const fallback = legacyRequest(name, parseBody(init));
    if (!fallback) return firstResponse;

    document.documentElement.dataset.paymentInboxCompatibility = 'legacy';
    window.dispatchEvent(new CustomEvent('sanad:payment-inbox-legacy-fallback', {
      detail: { missing_rpc: name, fallback_rpc: fallback.name }
    }));

    return nativeFetch(replaceRpc(input, fallback.name), {
      ...(init || {}),
      body: JSON.stringify(fallback.body)
    });
  };
})();

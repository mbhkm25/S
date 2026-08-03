(() => {
  'use strict';

  const API_ORIGIN = 'https://api.sanadflow.com';
  const REQUEST_TIMEOUT_MS = 12000;
  const originalFetch = window.fetch.bind(window);

  function isSanadApiRequest(input) {
    const raw = typeof input === 'string' || input instanceof URL ? String(input) : input?.url;
    if (!raw) return false;
    try {
      return new URL(raw, window.location.href).origin === API_ORIGIN;
    } catch {
      return false;
    }
  }

  function timeoutResponse(message) {
    return new Response(JSON.stringify({
      message,
      code: 'sanad_request_timeout'
    }), {
      status: 504,
      statusText: 'Gateway Timeout',
      headers: { 'Content-Type': 'application/json' }
    });
  }

  window.fetch = async function sanadPaymentInboxFetchGuard(input, init = undefined) {
    if (!isSanadApiRequest(input)) return originalFetch(input, init);

    const controller = new AbortController();
    const inheritedSignal = init?.signal;
    const timer = window.setTimeout(() => controller.abort('sanad_payment_inbox_timeout'), REQUEST_TIMEOUT_MS);

    if (inheritedSignal) {
      if (inheritedSignal.aborted) controller.abort(inheritedSignal.reason);
      else inheritedSignal.addEventListener('abort', () => controller.abort(inheritedSignal.reason), { once: true });
    }

    try {
      return await originalFetch(input, { ...(init || {}), signal: controller.signal });
    } catch (error) {
      if (controller.signal.aborted) {
        const raw = typeof input === 'string' || input instanceof URL ? String(input) : input?.url || '';
        const isRefresh = raw.includes('/auth/v1/token');
        const message = isRefresh
          ? 'تعذر تحديث جلسة سند خلال المهلة المحددة. سيُستخدم رمز الدخول الحالي إن كان لا يزال صالحًا.'
          : 'تعذر الاتصال بخادم سند خلال 12 ثانية. تحقق من الإنترنت أو من إمكانية الوصول إلى api.sanadflow.com.';
        console.error('[SANAD Payment Inbox] request timeout', { url: raw, isRefresh });
        return timeoutResponse(message);
      }
      throw error;
    } finally {
      window.clearTimeout(timer);
    }
  };

  window.SANAD_PAYMENT_INBOX_NETWORK_GUARD = Object.freeze({
    apiOrigin: API_ORIGIN,
    timeoutMs: REQUEST_TIMEOUT_MS
  });
})();
(() => {
  'use strict';

  const API_ORIGIN = 'https://api.sanadflow.com';
  const REALTIME_ORIGIN = 'wss://api.sanadflow.com';
  const PROJECT_REF = 'hudbzlgclghlhazlduas';
  const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh1ZGJ6bGdjbGdobGhhemxkdWFzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI4NzI3NzEsImV4cCI6MjA5ODQ0ODc3MX0.mQvUtmAwmRXPdMJdynPemP56PSeONMUpw_k0rz_pUag';

  function matchesOrigin(value, origin) {
    try {
      return new URL(String(value), window.location.href).origin === origin;
    } catch {
      return false;
    }
  }

  const nativeFetch = window.fetch.bind(window);
  window.fetch = function sanadFetch(input, init = undefined) {
    const requestUrl = typeof input === 'string' || input instanceof URL
      ? String(input)
      : input?.url;

    if (!matchesOrigin(requestUrl, API_ORIGIN)) {
      return nativeFetch(input, init);
    }

    const headers = new Headers(input instanceof Request ? input.headers : undefined);
    if (init?.headers) {
      new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    }
    headers.set('apikey', ANON_KEY);

    return nativeFetch(input, { ...(init || {}), headers });
  };

  const NativeWebSocket = window.WebSocket;
  function SanadWebSocket(url, protocols) {
    let normalizedUrl = String(url);
    try {
      const parsed = new URL(normalizedUrl);
      if (parsed.origin === REALTIME_ORIGIN) {
        parsed.searchParams.set('apikey', ANON_KEY);
        normalizedUrl = parsed.toString();
      }
    } catch {
      // Let the native constructor report malformed URLs.
    }

    return protocols === undefined
      ? new NativeWebSocket(normalizedUrl)
      : new NativeWebSocket(normalizedUrl, protocols);
  }

  SanadWebSocket.prototype = NativeWebSocket.prototype;
  Object.setPrototypeOf(SanadWebSocket, NativeWebSocket);
  window.WebSocket = SanadWebSocket;

  window.SANAD_PUBLIC_API_CONFIG = Object.freeze({
    apiUrl: API_ORIGIN,
    realtimeUrl: REALTIME_ORIGIN,
    projectRef: PROJECT_REF,
    anonKey: ANON_KEY
  });
})();

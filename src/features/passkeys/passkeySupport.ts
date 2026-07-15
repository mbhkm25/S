import { Capacitor } from '@capacitor/core';
import { supabase } from '../../lib/supabase';
import type { PasskeySupportResult } from './types';

interface PasskeyEnvironment {
  isBrowser: boolean;
  isNativeRuntime: boolean;
  isSecureContext: boolean;
  hasValidOrigin: boolean;
  hasCredentialsApi: boolean;
  hasPublicKeyCredential: boolean;
  hasPlatformAuthenticatorProbe: boolean;
  hasClientApi: boolean;
  probePlatformAuthenticator: () => Promise<boolean>;
}

export const PASSKEY_PROBE_TIMEOUT_MS = 4000;

function probePlatformAuthenticator(
  probe: () => Promise<boolean>,
  timeoutMs: number,
): Promise<PasskeySupportResult> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: PasskeySupportResult) => {
      if (settled) return;
      settled = true;
      globalThis.clearTimeout(timeoutId);
      resolve(result);
    };
    const timeoutId = globalThis.setTimeout(() => {
      finish({ status: 'unknown', reason: 'probe_timeout' });
    }, timeoutMs);

    Promise.resolve()
      .then(probe)
      .then((available) => finish(available
        ? { status: 'supported', reason: 'available' }
        : { status: 'unsupported', reason: 'no_platform_authenticator' }))
      .catch(() => finish({ status: 'unknown', reason: 'probe_failed' }));
  });
}

export function evaluatePasskeySupport(
  environment: PasskeyEnvironment,
  timeoutMs = PASSKEY_PROBE_TIMEOUT_MS,
): Promise<PasskeySupportResult> {
  if (!environment.isBrowser) {
    return Promise.resolve({ status: 'unknown', reason: 'server_render' });
  }

  if (environment.isNativeRuntime) {
    return Promise.resolve({ status: 'requires_native_bridge', reason: 'native_runtime' });
  }

  if (!environment.isSecureContext || !environment.hasValidOrigin) {
    return Promise.resolve({ status: 'unsupported', reason: 'insecure_origin' });
  }

  if (!environment.hasClientApi) {
    return Promise.resolve({ status: 'unsupported', reason: 'missing_client_api' });
  }

  if (
    !environment.hasCredentialsApi ||
    !environment.hasPublicKeyCredential ||
    !environment.hasPlatformAuthenticatorProbe
  ) {
    return Promise.resolve({ status: 'unsupported', reason: 'missing_webauthn' });
  }

  return probePlatformAuthenticator(environment.probePlatformAuthenticator, timeoutMs);
}

function isNativeRuntime(): boolean {
  if (Capacitor.isNativePlatform()) return true;
  const origin = window.location.origin;
  return origin.startsWith('capacitor:') || origin.startsWith('file:');
}

function hasValidWebAuthnOrigin(): boolean {
  if (window.location.protocol === 'https:') return true;
  const hostname = window.location.hostname;
  return window.location.protocol === 'http:' && (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '[::1]' ||
    hostname === '::1'
  );
}

export function isPasskeyClientApiAvailable(): boolean {
  return typeof supabase.auth.signInWithPasskey === 'function' &&
    typeof supabase.auth.registerPasskey === 'function' &&
    typeof supabase.auth.passkey?.list === 'function';
}

export function isPasskeySupported(): Promise<PasskeySupportResult> {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return evaluatePasskeySupport({
      isBrowser: false,
      isNativeRuntime: false,
      isSecureContext: false,
      hasValidOrigin: false,
      hasCredentialsApi: false,
      hasPublicKeyCredential: false,
      hasPlatformAuthenticatorProbe: false,
      hasClientApi: false,
      probePlatformAuthenticator: async () => false,
    });
  }

  const publicKeyCredential = window.PublicKeyCredential;
  return evaluatePasskeySupport({
    isBrowser: true,
    isNativeRuntime: isNativeRuntime(),
    isSecureContext: window.isSecureContext,
    hasValidOrigin: hasValidWebAuthnOrigin(),
    hasCredentialsApi: Boolean(
      navigator.credentials &&
      typeof navigator.credentials.create === 'function' &&
      typeof navigator.credentials.get === 'function',
    ),
    hasPublicKeyCredential: typeof publicKeyCredential === 'function',
    hasPlatformAuthenticatorProbe:
      typeof publicKeyCredential?.isUserVerifyingPlatformAuthenticatorAvailable === 'function',
    hasClientApi: isPasskeyClientApiAvailable(),
    probePlatformAuthenticator: () =>
      publicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable(),
  });
}

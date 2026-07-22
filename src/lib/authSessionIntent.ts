const EXPLICIT_SIGN_OUT_KEY = 'sanad:explicit-sign-out:v1';
const MANUAL_AUTH_ATTEMPT_KEY = 'sanad:manual-auth-attempt:v1';

function getStorage(type: 'localStorage' | 'sessionStorage'): Storage | null {
  if (typeof window === 'undefined') return null;

  try {
    return window[type];
  } catch {
    return null;
  }
}

export function hasExplicitSignOutIntent(): boolean {
  return getStorage('localStorage')?.getItem(EXPLICIT_SIGN_OUT_KEY) === '1';
}

export function markExplicitSignOutIntent(): void {
  getStorage('localStorage')?.setItem(EXPLICIT_SIGN_OUT_KEY, '1');
}

export function clearExplicitSignOutIntent(): void {
  getStorage('localStorage')?.removeItem(EXPLICIT_SIGN_OUT_KEY);
}

export function hasManualAuthAttempt(): boolean {
  return getStorage('sessionStorage')?.getItem(MANUAL_AUTH_ATTEMPT_KEY) === '1';
}

export function markManualAuthAttempt(): void {
  getStorage('sessionStorage')?.setItem(MANUAL_AUTH_ATTEMPT_KEY, '1');
}

export function clearManualAuthAttempt(): void {
  getStorage('sessionStorage')?.removeItem(MANUAL_AUTH_ATTEMPT_KEY);
}

import { useEffect, useRef, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { CheckCircle2, Fingerprint, Loader2, X } from 'lucide-react';
import { listCurrentUserPasskeys, registerCurrentUserPasskey } from './passkeyApi';
import { isPasskeySupported } from './passkeySupport';
import { isPasskeyRequestCurrent } from './requestGuards';

export const DISMISSAL_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

interface PasskeyEnrollmentPromptProps {
  user: User;
  onDone: () => void;
}

interface DismissalStorage {
  getItem(key: string): string | null;
  removeItem(key: string): void;
}

export function dismissalKey(userId: string) {
  return `sanad:passkey-enrollment-dismissed:${userId}`;
}

export function readDismissalTimestamp(
  storage: DismissalStorage,
  userId: string,
  now = Date.now(),
): number {
  const key = dismissalKey(userId);
  try {
    const raw = storage.getItem(key);
    if (raw === null) return 0;
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0 || value > now) {
      storage.removeItem(key);
      return 0;
    }
    return value;
  } catch {
    return 0;
  }
}

export default function PasskeyEnrollmentPrompt({ user, onDone }: PasskeyEnrollmentPromptProps) {
  const [visible, setVisible] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const generationRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const registeringRef = useRef(false);
  const onDoneRef = useRef(onDone);
  const activeUserIdRef = useRef(user.id);
  activeUserIdRef.current = user.id;
  const mountedRef = useRef(true);

  const isRequestCurrent = (requestUserId: string, requestGeneration: number) =>
    isPasskeyRequestCurrent({
      mounted: mountedRef.current,
      activeUserId: activeUserIdRef.current,
      requestUserId,
      currentGeneration: generationRef.current,
      requestGeneration,
    });

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      generationRef.current += 1;
      abortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  useEffect(() => {
    const requestUserId = user.id;
    const requestGeneration = ++generationRef.current;
    abortRef.current?.abort();
    registeringRef.current = false;
    setVisible(false);
    setRegistering(false);
    setMessage(null);
    setSuccess(false);

    const dismissedAt = readDismissalTimestamp(localStorage, requestUserId);
    if (!user.email_confirmed_at || Date.now() - dismissedAt < DISMISSAL_WINDOW_MS) {
      if (isRequestCurrent(requestUserId, requestGeneration)) onDoneRef.current();
      return () => { generationRef.current += 1; };
    }

    void (async () => {
      const support = await isPasskeySupported();
      if (!isRequestCurrent(requestUserId, requestGeneration)) return;
      if (support.status !== 'supported') {
        onDoneRef.current();
        return;
      }

      try {
        const passkeys = await listCurrentUserPasskeys();
        if (!isRequestCurrent(requestUserId, requestGeneration)) return;
        if (passkeys.length === 0) setVisible(true);
        else onDoneRef.current();
      } catch {
        if (isRequestCurrent(requestUserId, requestGeneration)) onDoneRef.current();
      }
    })();

    return () => {
      generationRef.current += 1;
      abortRef.current?.abort();
    };
  }, [user.email_confirmed_at, user.id]);

  const dismiss = () => {
    if (registeringRef.current || !mountedRef.current) return;
    const requestUserId = user.id;
    if (activeUserIdRef.current !== requestUserId) return;
    try {
      localStorage.setItem(dismissalKey(requestUserId), String(Date.now()));
    } catch {
      // The preference is non-essential; private browsing may reject storage.
    }
    setVisible(false);
    onDoneRef.current();
  };

  const register = async () => {
    if (registeringRef.current) return;
    const requestUserId = user.id;
    const requestGeneration = generationRef.current;
    if (!isRequestCurrent(requestUserId, requestGeneration)) return;

    registeringRef.current = true;
    setRegistering(true);
    setMessage(null);
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      await registerCurrentUserPasskey(controller.signal);
      if (!isRequestCurrent(requestUserId, requestGeneration)) return;
      await listCurrentUserPasskeys();
      if (!isRequestCurrent(requestUserId, requestGeneration)) return;
      setSuccess(true);
      setMessage('تم تفعيل الدخول بالبصمة.');
      window.setTimeout(() => {
        if (isRequestCurrent(requestUserId, requestGeneration)) {
          setVisible(false);
          onDoneRef.current();
        }
      }, 1400);
    } catch (error) {
      if (isRequestCurrent(requestUserId, requestGeneration)) {
        setMessage(error instanceof Error ? error.message : 'تعذر تفعيل الدخول بالبصمة.');
      }
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      registeringRef.current = false;
      if (isRequestCurrent(requestUserId, requestGeneration)) setRegistering(false);
    }
  };

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-slate-950/45 flex items-end sm:items-center justify-center p-3" role="dialog" aria-modal="true" aria-labelledby="passkey-enrollment-title">
      <div className="w-full max-w-sm max-h-[calc(100dvh-1.5rem)] overflow-y-auto rounded-3xl bg-white p-5 shadow-2xl" dir="rtl">
        <div className="flex items-start justify-between gap-3">
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center">
            {success ? <CheckCircle2 className="w-6 h-6" /> : <Fingerprint className="w-6 h-6" />}
          </div>
          <button type="button" aria-label="إغلاق" disabled={registering} onClick={dismiss} className="w-11 h-11 rounded-xl flex items-center justify-center text-slate-500 hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-slate-500 disabled:opacity-50"><X className="w-5 h-5" /></button>
        </div>
        <h2 id="passkey-enrollment-title" className="text-lg font-bold text-slate-900 mt-4">فعّل الدخول السريع</h2>
        <p className="text-sm text-slate-600 leading-7 mt-2">استخدم بصمة الإصبع أو قفل جهازك للدخول إلى سند دون كتابة البريد وكلمة المرور في كل مرة.</p>
        <p className="text-xs text-slate-500 leading-6 mt-2">قد يظهر رمز PIN أو قفل الجهاز بدل البصمة حسب إعدادات جهازك.</p>
        {message && <div role="status" className={`mt-4 rounded-xl border p-3 text-xs ${success ? 'border-emerald-100 bg-emerald-50 text-emerald-700' : 'border-rose-100 bg-rose-50 text-rose-700'}`}>{message}</div>}
        <div className="grid gap-2 mt-5">
          <button type="button" disabled={registering || success} onClick={register} className="w-full min-h-12 rounded-xl bg-slate-950 text-white text-sm font-bold flex items-center justify-center gap-2 focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:opacity-60">
            {registering && <Loader2 className="w-5 h-5 animate-spin" />}
            {registering ? 'جاري التفعيل...' : 'تفعيل الآن'}
          </button>
          <button type="button" disabled={registering || success} onClick={dismiss} className="w-full min-h-12 rounded-xl text-slate-600 text-sm font-bold hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-slate-500 disabled:opacity-50">ليس الآن</button>
        </div>
      </div>
    </div>
  );
}

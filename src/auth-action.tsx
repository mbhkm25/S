import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AlertCircle, CheckCircle2, Loader2, MailCheck, ShieldCheck } from 'lucide-react';
import { clearPersistedSupabaseSession, supabase } from './lib/supabase';
import './index.css';

type ActionState = 'checking' | 'success' | 'invalid';
type EmailAction = 'signup' | 'email_change' | 'invite' | 'magiclink' | 'email' | 'unknown';

const PENDING_EMAIL_KEY = 'sanad_pending_confirmation_email';
const ACTION_TIMEOUT_MS = 8_000;

function getAppUrl(): string {
  const base = import.meta.env.VITE_APP_BASE_PATH || '/';
  const normalizedBase = base.startsWith('/') ? base : `/${base}`;
  return `${window.location.origin}${normalizedBase}`;
}

function readParameters(): URLSearchParams {
  const url = new URL(window.location.href);
  const combined = new URLSearchParams(url.search);
  const hash = url.hash.startsWith('#') ? url.hash.slice(1) : url.hash;
  const hashParams = new URLSearchParams(hash);
  hashParams.forEach((value, key) => {
    if (!combined.has(key)) combined.set(key, value);
  });
  return combined;
}

function normalizeAction(value: string | null): EmailAction {
  if (value === 'signup' || value === 'email_change' || value === 'invite' || value === 'magiclink' || value === 'email') {
    return value;
  }
  return 'unknown';
}

function actionCopy(action: EmailAction): { title: string; success: string } {
  switch (action) {
    case 'signup':
    case 'email':
      return {
        title: 'تأكيد البريد الإلكتروني',
        success: 'تم تأكيد بريدك الإلكتروني بنجاح. ارجع إلى تطبيق سند وسجّل الدخول باستخدام بريدك وكلمة المرور.',
      };
    case 'email_change':
      return {
        title: 'تأكيد تغيير البريد',
        success: 'تم تأكيد عنوان البريد الجديد. ارجع إلى تطبيق سند وسجّل الدخول من جديد باستخدام البريد المحدّث.',
      };
    case 'invite':
      return {
        title: 'قبول الدعوة',
        success: 'تم قبول الدعوة بنجاح. ارجع إلى تطبيق سند وسجّل الدخول لإكمال إعداد الحساب.',
      };
    case 'magiclink':
      return {
        title: 'التحقق من رابط الدخول',
        success: 'تم التحقق من الرابط. حفاظًا على أمان الحساب، ارجع إلى تطبيق سند وسجّل الدخول من داخله.',
      };
    default:
      return {
        title: 'التحقق من إجراء الحساب',
        success: 'تم تنفيذ الإجراء بنجاح. ارجع إلى تطبيق سند وسجّل الدخول من جديد.',
      };
  }
}

function cleanActionUrl(): void {
  window.history.replaceState({}, document.title, window.location.pathname);
}

async function endTemporaryBrowserSession(): Promise<void> {
  try {
    await supabase.auth.signOut({ scope: 'local' });
  } finally {
    clearPersistedSupabaseSession();
  }
}

function EmailActionPage() {
  const parameters = useMemo(readParameters, []);
  const action = useMemo(
    () => normalizeAction(parameters.get('action') || parameters.get('type')),
    [parameters],
  );
  const copy = useMemo(() => actionCopy(action), [action]);
  const [state, setState] = useState<ActionState>('checking');
  const [message, setMessage] = useState('جاري التحقق من رابط البريد...');

  useEffect(() => {
    let mounted = true;
    let settled = false;
    let timeoutId: number | undefined;

    const finishSuccess = async () => {
      if (!mounted || settled) return;
      settled = true;
      sessionStorage.removeItem(PENDING_EMAIL_KEY);
      await endTemporaryBrowserSession();
      if (!mounted) return;
      cleanActionUrl();
      setMessage(copy.success);
      setState('success');
    };

    const finishError = async (reason?: string | null) => {
      if (!mounted || settled) return;
      settled = true;
      await endTemporaryBrowserSession();
      if (!mounted) return;
      cleanActionUrl();
      setMessage(reason || 'رابط الإجراء غير صالح أو انتهت صلاحيته. اطلب رسالة جديدة من داخل تطبيق سند.');
      setState('invalid');
    };

    const errorDescription = parameters.get('error_description');
    const errorCode = parameters.get('error_code') || parameters.get('error');
    const hasAuthEvidence = Boolean(
      parameters.get('code')
      || parameters.get('access_token')
      || parameters.get('refresh_token')
      || parameters.get('token_hash')
      || errorCode
      || errorDescription
    );
    if (errorCode || errorDescription) {
      void finishError(errorDescription);
      return () => {
        mounted = false;
      };
    }

    if (!hasAuthEvidence) {
      void finishError('لا يمكن فتح صفحة التأكيد مباشرة. استخدم الرابط الموجود في رسالة سند المرسلة إلى بريدك.');
      return () => {
        mounted = false;
      };
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted || settled) return;
      if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION' || event === 'USER_UPDATED') && session?.user) {
        void finishSuccess();
      }
    });

    const initialize = async () => {
      try {
        const authorizationCode = parameters.get('code');
        if (authorizationCode) {
          const { data, error } = await supabase.auth.exchangeCodeForSession(authorizationCode);
          if (error) {
            await finishError(error.message);
            return;
          }
          if (data.session) {
            await finishSuccess();
            return;
          }
        }

        const { data: { session }, error } = await supabase.auth.getSession();
        if (error) {
          await finishError(error.message);
          return;
        }
        if (session?.user) {
          await finishSuccess();
          return;
        }

        timeoutId = window.setTimeout(() => {
          void finishError();
        }, ACTION_TIMEOUT_MS);
      } catch (error) {
        await finishError(error instanceof Error ? error.message : null);
      }
    };

    void initialize();

    return () => {
      mounted = false;
      if (timeoutId) window.clearTimeout(timeoutId);
      subscription.unsubscribe();
    };
  }, [copy.success, parameters]);

  return (
    <main className="min-h-screen bg-[#F7F7F5] px-4 py-10 text-slate-800" dir="rtl">
      <section className="mx-auto w-full max-w-md rounded-3xl border border-slate-100 bg-white p-6 text-center shadow-xl md:p-10">
        <img src={`${import.meta.env.BASE_URL}logo.png`} alt="شعار سند" className="mx-auto h-12 object-contain" />
        <h1 className="mt-5 text-2xl font-bold text-slate-900">{copy.title}</h1>

        {state === 'checking' && (
          <div className="mt-7 rounded-2xl bg-slate-50 p-6 text-slate-600">
            <Loader2 className="mx-auto h-9 w-9 animate-spin text-emerald-600" />
            <p className="mt-4 text-sm leading-7">{message}</p>
          </div>
        )}

        {state === 'success' && (
          <div className="mt-7 rounded-2xl border border-emerald-100 bg-emerald-50 p-6 text-emerald-800">
            <CheckCircle2 className="mx-auto h-11 w-11" />
            <p className="mt-4 font-bold">تم الإجراء بنجاح</p>
            <p className="mt-2 text-sm leading-7">{message}</p>
          </div>
        )}

        {state === 'invalid' && (
          <div className="mt-7 rounded-2xl border border-rose-100 bg-rose-50 p-6 text-rose-800">
            <AlertCircle className="mx-auto h-11 w-11" />
            <p className="mt-4 font-bold">تعذر إكمال الإجراء</p>
            <p className="mt-2 text-sm leading-7">{message}</p>
          </div>
        )}

        {state !== 'checking' && (
          <div className="mt-6 space-y-3">
            <div className="flex items-start gap-3 rounded-2xl bg-slate-50 p-4 text-right text-xs leading-6 text-slate-600">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
              <span>لم نُبقِ جلسة دخول داخل متصفح البريد. أغلق هذه الصفحة، ثم افتح تطبيق سند وسجّل الدخول من جديد.</span>
            </div>
            <a
              href={getAppUrl()}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-3.5 text-sm font-bold text-white transition hover:bg-slate-800"
            >
              <MailCheck className="h-5 w-5" />
              فتح صفحة تسجيل الدخول
            </a>
          </div>
        )}
      </section>
    </main>
  );
}

createRoot(document.getElementById('auth-action-root')!).render(
  <React.StrictMode>
    <EmailActionPage />
  </React.StrictMode>,
);

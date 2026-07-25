import React, { useEffect, useMemo, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { AlertCircle, CheckCircle2, Eye, EyeOff, Loader2, Lock } from 'lucide-react';
import { supabase } from './lib/supabase';
import './index.css';

type RecoveryState = 'checking' | 'ready' | 'invalid' | 'success';

function getAppUrl(): string {
  const base = import.meta.env.VITE_APP_BASE_PATH || '/';
  const normalizedBase = base.startsWith('/') ? base : `/${base}`;
  return `${window.location.origin}${normalizedBase}`;
}

function clearRecoveryParameters(): void {
  const cleanUrl = `${window.location.pathname}`;
  window.history.replaceState({}, document.title, cleanUrl);
}

function ResetPasswordPage() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [recoveryState, setRecoveryState] = useState<RecoveryState>('checking');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const passwordChecks = useMemo(() => ({
    minimumLength: password.length >= 8,
    hasLetter: /[A-Za-z]/.test(password),
    hasNumber: /\d/.test(password),
    matches: password.length > 0 && password === confirmPassword,
  }), [password, confirmPassword]);

  const isPasswordValid = passwordChecks.minimumLength
    && passwordChecks.hasLetter
    && passwordChecks.hasNumber
    && passwordChecks.matches;

  useEffect(() => {
    let mounted = true;
    let resolved = false;

    const acceptRecoverySession = () => {
      if (!mounted || resolved) return;
      resolved = true;
      clearRecoveryParameters();
      setError(null);
      setRecoveryState('ready');
    };

    const rejectRecoveryLink = () => {
      if (!mounted || resolved) return;
      resolved = true;
      setError('رابط تعيين كلمة المرور غير صالح أو انتهت صلاحيته. اطلب رسالة جديدة من شاشة تسجيل الدخول.');
      setRecoveryState('invalid');
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      if ((event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') && session) {
        acceptRecoverySession();
      }
    });

    const initialize = async () => {
      try {
        const url = new URL(window.location.href);
        const authorizationCode = url.searchParams.get('code');

        if (authorizationCode) {
          const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(authorizationCode);
          if (!exchangeError && data.session) {
            acceptRecoverySession();
            return;
          }
        }

        // Supports the implicit hash flow as well as a session that Supabase has
        // already restored through detectSessionInUrl.
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        if (!sessionError && session) {
          acceptRecoverySession();
          return;
        }

        // Give detectSessionInUrl a brief opportunity to process recovery tokens
        // before classifying the link as invalid.
        window.setTimeout(rejectRecoveryLink, 2500);
      } catch {
        rejectRecoveryLink();
      }
    };

    void initialize();

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);

    if (!isPasswordValid) {
      setError('اختر كلمة مرور من 8 أحرف على الأقل، وتحتوي على حرف ورقم، ثم تأكد من تطابقها.');
      return;
    }

    setLoading(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });

    if (updateError) {
      setLoading(false);
      setError('تعذر حفظ كلمة المرور الجديدة. قد تكون صلاحية الرابط انتهت؛ اطلب رابطًا جديدًا ثم أعد المحاولة.');
      return;
    }

    // Recovery creates a temporary authenticated session. End it after the
    // password change so the user explicitly signs in using the new password.
    await supabase.auth.signOut({ scope: 'local' });
    setLoading(false);
    setRecoveryState('success');

    window.setTimeout(() => {
      window.location.replace(getAppUrl());
    }, 2200);
  };

  return (
    <main className="min-h-screen bg-[#F7F7F5] px-4 py-10 text-slate-800" dir="rtl">
      <section className="mx-auto w-full max-w-md rounded-3xl border border-slate-100 bg-white p-6 shadow-xl md:p-10">
        <div className="mb-7 text-center">
          <img src={`${import.meta.env.BASE_URL}logo.png`} alt="شعار سند" className="mx-auto h-12 object-contain" />
          <h1 className="mt-4 text-2xl font-bold text-slate-900">تعيين كلمة مرور جديدة</h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">أدخل كلمة مرور جديدة وآمنة لحسابك في سند.</p>
        </div>

        {recoveryState === 'checking' && (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-slate-600">
            <Loader2 className="h-5 w-5 animate-spin" />
            جاري التحقق من رابط الاستعادة...
          </div>
        )}

        {recoveryState === 'invalid' && (
          <div className="space-y-4">
            <StatusMessage message={error || 'تعذر استخدام رابط الاستعادة.'} />
            <a href={getAppUrl()} className="flex w-full items-center justify-center rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-700 transition hover:bg-slate-50">
              العودة وطلب رابط جديد
            </a>
          </div>
        )}

        {recoveryState === 'success' && (
          <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-5 text-center text-emerald-800">
            <CheckCircle2 className="mx-auto h-10 w-10" />
            <p className="mt-3 font-bold">تم تعيين كلمة المرور الجديدة بنجاح</p>
            <p className="mt-1 text-sm leading-6">سيتم تحويلك إلى تسجيل الدخول لاستخدام كلمة المرور الجديدة.</p>
          </div>
        )}

        {recoveryState === 'ready' && (
          <form onSubmit={handleSubmit} className="space-y-5">
            {error && <StatusMessage message={error} />}

            <PasswordInput label="كلمة المرور الجديدة" value={password} onChange={setPassword} autoComplete="new-password" />
            <PasswordInput label="تأكيد كلمة المرور الجديدة" value={confirmPassword} onChange={setConfirmPassword} autoComplete="new-password" />

            <div className="rounded-2xl bg-slate-50 p-4 text-xs leading-6 text-slate-600">
              <PasswordRule met={passwordChecks.minimumLength}>8 أحرف على الأقل</PasswordRule>
              <PasswordRule met={passwordChecks.hasLetter}>تحتوي على حرف واحد على الأقل</PasswordRule>
              <PasswordRule met={passwordChecks.hasNumber}>تحتوي على رقم واحد على الأقل</PasswordRule>
              <PasswordRule met={passwordChecks.matches}>كلمتا المرور متطابقتان</PasswordRule>
            </div>

            <button
              type="submit"
              disabled={loading || !isPasswordValid}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3.5 font-bold text-white shadow-lg shadow-emerald-600/10 transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-300"
            >
              {loading && <Loader2 className="h-5 w-5 animate-spin" />}
              حفظ كلمة المرور الجديدة
            </button>
          </form>
        )}
      </section>
    </main>
  );
}

function StatusMessage({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-rose-100 bg-rose-50 p-4 text-sm leading-6 text-rose-800">
      <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
      <span>{message}</span>
    </div>
  );
}

function PasswordRule({ met, children }: { met: boolean; children: ReactNode }) {
  return (
    <div className={`flex items-center gap-2 ${met ? 'text-emerald-700' : 'text-slate-500'}`}>
      <span className={`h-2 w-2 rounded-full ${met ? 'bg-emerald-500' : 'bg-slate-300'}`} />
      <span>{children}</span>
    </div>
  );
}

function PasswordInput({
  label,
  value,
  onChange,
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: 'new-password';
}) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-medium text-slate-700">{label}</label>
      <div className="relative">
        <Lock className="pointer-events-none absolute right-3.5 top-3.5 h-4 w-4 text-slate-400" />
        <input
          type={visible ? 'text' : 'password'}
          minLength={8}
          required
          value={value}
          onChange={event => onChange(event.target.value)}
          autoComplete={autoComplete}
          className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-11 pr-10 text-left text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500"
          dir="ltr"
          placeholder="••••••••"
        />
        <button
          type="button"
          onClick={() => setVisible(current => !current)}
          className="absolute left-3 top-2.5 flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-white hover:text-slate-700"
          aria-label={visible ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
        >
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}

createRoot(document.getElementById('reset-password-root')!).render(
  <React.StrictMode>
    <ResetPasswordPage />
  </React.StrictMode>
);

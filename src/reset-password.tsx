import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AlertCircle, CheckCircle2, Loader2, Lock } from 'lucide-react';
import { supabase } from './lib/supabase';
import './index.css';

function ResetPasswordPage() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    let mounted = true;

    const initialize = async () => {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (!mounted) return;
      if (sessionError || !session) {
        setError('رابط الاستعادة غير صالح أو انتهت صلاحيته. اطلب رابطًا جديدًا من شاشة تسجيل الدخول.');
      }
      setReady(true);
    };

    void initialize();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      if (event === 'PASSWORD_RECOVERY' && session) {
        setError(null);
        setReady(true);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    if (password.length < 6) {
      setError('يجب أن تتكون كلمة المرور من 6 أحرف على الأقل.');
      return;
    }
    if (password !== confirmPassword) {
      setError('كلمتا المرور غير متطابقتين.');
      return;
    }

    setLoading(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (updateError) {
      setError('تعذر تحديث كلمة المرور. اطلب رابط استعادة جديدًا ثم أعد المحاولة.');
      return;
    }

    setSuccess(true);
    window.setTimeout(() => {
      const base = import.meta.env.VITE_APP_BASE_PATH || '/';
      window.location.replace(base);
    }, 1800);
  };

  return (
    <main className="min-h-screen bg-[#F7F7F5] px-4 py-10 text-slate-800">
      <section className="mx-auto w-full max-w-md rounded-3xl border border-slate-100 bg-white p-6 shadow-xl md:p-10">
        <div className="mb-7 text-center">
          <img src={`${import.meta.env.BASE_URL}logo.png`} alt="شعار سند" className="mx-auto h-12 object-contain" />
          <h1 className="mt-4 text-2xl font-bold text-slate-900">إنشاء كلمة مرور جديدة</h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">اختر كلمة مرور جديدة لحسابك في سند.</p>
        </div>

        {!ready ? (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-slate-600"><Loader2 className="h-5 w-5 animate-spin" />جاري التحقق من الرابط...</div>
        ) : success ? (
          <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-5 text-center text-emerald-800">
            <CheckCircle2 className="mx-auto h-9 w-9" />
            <p className="mt-3 font-bold">تم تحديث كلمة المرور بنجاح.</p>
            <p className="mt-1 text-sm">سيتم تحويلك إلى التطبيق لتسجيل الدخول.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            {error && <div className="flex items-start gap-3 rounded-xl border border-rose-100 bg-rose-50 p-4 text-sm text-rose-800"><AlertCircle className="mt-0.5 h-5 w-5 shrink-0" /><span>{error}</span></div>}
            <PasswordInput label="كلمة المرور الجديدة" value={password} onChange={setPassword} />
            <PasswordInput label="تأكيد كلمة المرور" value={confirmPassword} onChange={setConfirmPassword} />
            <button type="submit" disabled={loading || !!error && !password} className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3.5 font-bold text-white disabled:bg-emerald-300">
              {loading && <Loader2 className="h-5 w-5 animate-spin" />}
              حفظ كلمة المرور الجديدة
            </button>
          </form>
        )}
      </section>
    </main>
  );
}

function PasswordInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-medium text-slate-700">{label}</label>
      <div className="relative">
        <Lock className="pointer-events-none absolute right-3.5 top-3.5 h-4 w-4 text-slate-400" />
        <input type="password" minLength={6} required value={value} onChange={event => onChange(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-4 pr-10 text-left text-sm outline-none focus:ring-2 focus:ring-emerald-500" dir="ltr" placeholder="••••••" />
      </div>
    </div>
  );
}

createRoot(document.getElementById('reset-password-root')!).render(
  <React.StrictMode>
    <ResetPasswordPage />
  </React.StrictMode>
);

import React, { useEffect, useMemo, useState } from 'react';
import type { User as SupabaseUser } from '@supabase/supabase-js';
import { AlertCircle, Camera, CheckCircle2, Loader2, Lock, Mail, Phone, User } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Profile } from '../types';
import { parseYemeniLocalPhone } from '../lib/digits';
import { isValidYemenLocalPhone, normalizeYemenPhone } from '../lib/profileUtils';
import { isYemenGovernorate, YEMEN_GOVERNORATES } from '../constants/yemenGovernorates';
import PasskeySignInButton from '../features/passkeys/PasskeySignInButton';
import { logAuthDiagnostic } from '../lib/authDiagnostics';
import { uploadUserAvatar } from '../lib/userAvatar';
import { clearManualAuthAttempt, markManualAuthAttempt } from '../lib/authSessionIntent';

interface AuthProps {
  onAuthSuccess: (sessionUser: SupabaseUser, userProfile: Profile) => void;
}

type AuthView = 'sign-in' | 'sign-up' | 'forgot-password';
type SignInMethod = 'phone' | 'email';

const INTERNAL_AUTH_EMAIL_DOMAIN = 'users.sanadflow.com';

function getAppRootUrl(): string {
  const base = import.meta.env.VITE_APP_BASE_PATH || import.meta.env.BASE_URL || '/';
  const cleanBase = base.startsWith('/') ? base : `/${base}`;
  const root = `${window.location.origin}${cleanBase}`;
  return root.endsWith('/') ? root : `${root}/`;
}

function getEmailActionUrl(action: 'signup' | 'email_change' | 'invite' | 'magiclink'): string {
  const url = new URL('auth-action.html', getAppRootUrl());
  url.searchParams.set('action', action);
  return url.toString();
}

function buildInternalAuthEmail(localPhone: string): string {
  return `${normalizeYemenPhone(localPhone)}@${INTERNAL_AUTH_EMAIL_DOMAIN}`;
}

export default function Auth({ onAuthSuccess }: AuthProps) {
  const [view, setView] = useState<AuthView>('sign-in');
  const [signInMethod, setSignInMethod] = useState<SignInMethod>('phone');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [governorate, setGovernorate] = useState('');
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const isSignUp = view === 'sign-up';
  const pendingEmail = useMemo(() => email.trim().toLowerCase(), [email]);
  const internalAuthEmail = useMemo(
    () => isValidYemenLocalPhone(phone) ? buildInternalAuthEmail(phone) : '',
    [phone]
  );

  useEffect(() => {
    if (!avatarFile) {
      setAvatarPreview('');
      return;
    }
    const url = URL.createObjectURL(avatarFile);
    setAvatarPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [avatarFile]);

  const resetMessages = () => {
    setErrorMessage(null);
    setSuccessMessage(null);
  };

  const switchView = (next: AuthView) => {
    resetMessages();
    setView(next);
  };

  const getArabicErrorMessage = (err: unknown): string => {
    const details = typeof err === 'object' && err !== null ? err as { message?: unknown; name?: unknown } : {};
    const msg = typeof details.message === 'string' ? details.message : '';
    const errorName = typeof details.name === 'string' ? details.name : '';
    const lower = msg.toLowerCase();
    const isSystemError = msg.includes('Database error saving new user') || lower.includes('row-level security') || lower.includes('rls') || msg.includes('database_error');

    logAuthDiagnostic(isSystemError ? 'database_error' : 'auth_flow', err);

    if (isSystemError) return 'تعذر إنشاء ملف المستخدم في قاعدة سند. يرجى المحاولة لاحقًا أو التواصل مع الدعم.';
    if (msg.includes('duplicate key') || lower.includes('already registered') || lower.includes('already_registered') || msg.includes('user_already_exists')) {
      return isSignUp ? 'رقم الجوال مسجل بالفعل. جرّب تسجيل الدخول.' : 'هذا الحساب مسجل بالفعل.';
    }
    if (msg.includes('Password should be at least') || lower.includes('password_too_short')) return 'كلمة المرور قصيرة جدًا. يجب أن تتكون من 6 أحرف على الأقل.';
    if (msg.includes('Invalid login credentials') || lower.includes('invalid_credentials')) {
      return signInMethod === 'phone' ? 'رقم الجوال أو كلمة المرور غير صحيحة.' : 'البريد الإلكتروني أو كلمة المرور غير صحيحة.';
    }
    if (msg.includes('Email not confirmed') || lower.includes('email_not_confirmed') || lower.includes('email not confirmed')) return 'هذا الحساب غير مفعّل بعد. تواصل مع دعم سند إذا استمرت المشكلة.';
    if (lower.includes('rate limit')) return 'تمت محاولات كثيرة خلال وقت قصير. انتظر قليلًا ثم أعد المحاولة.';
    if (msg.includes('Failed to fetch') || errorName === 'TypeError') return 'تعذر الاتصال بخادم سند. تحقق من الإنترنت ثم أعد المحاولة.';
    return msg || 'تعذر إتمام العملية حاليًا. يرجى المحاولة مرة أخرى.';
  };

  const ensureProfileExists = async (user: SupabaseUser) => {
    const { data: profile, error: fetchError } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle();
    if (fetchError) {
      logAuthDiagnostic('profile_fetch_failed', fetchError);
      throw fetchError;
    }
    if (profile) return profile as Profile;

    const { data: newProfile, error: insertError } = await supabase.from('profiles').upsert({
      id: user.id,
      full_name: user.user_metadata?.full_name || fullName || 'مستخدم سند',
      phone: user.user_metadata?.phone || (phone ? normalizeYemenPhone(phone) : null),
      governorate: user.user_metadata?.governorate || governorate || null,
      status: 'active',
      updated_at: new Date().toISOString()
    }, { onConflict: 'id' }).select().single();

    if (insertError) throw insertError;
    return newProfile as Profile;
  };

  const handleForgotPassword = async (event: React.FormEvent) => {
    event.preventDefault();
    resetMessages();
    if (!pendingEmail) {
      setErrorMessage('أدخل بريد الحساب السابق أولًا.');
      return;
    }
    setLoading(true);
    try {
      const recoveryUrl = new URL('reset-password.html', getAppRootUrl());
      recoveryUrl.searchParams.set('action', 'recovery');
      const { error } = await supabase.auth.resetPasswordForEmail(pendingEmail, { redirectTo: recoveryUrl.toString() });
      if (error) throw error;
      setSuccessMessage('إذا كان البريد مرتبطًا بحساب في سند، فستصلك رسالة لاستعادة كلمة المرور.');
    } catch (error) {
      setErrorMessage(getArabicErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  const handleAuthSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    resetMessages();

    if (!password) return setErrorMessage('يرجى إدخال كلمة المرور.');

    if (isSignUp) {
      if (!fullName.trim()) return setErrorMessage('يرجى كتابة الاسم الكامل.');
      if (!phone) return setErrorMessage('يرجى إدخال رقم الجوال.');
      if (!isValidYemenLocalPhone(phone)) return setErrorMessage(phone.length !== 9 ? 'رقم الجوال يجب أن يتكون من 9 أرقام.' : 'رقم الجوال اليمني يجب أن يبدأ بالرقم 7.');
      if (!isYemenGovernorate(governorate)) return setErrorMessage('يرجى اختيار المحافظة.');
    } else if (signInMethod === 'phone') {
      if (!phone) return setErrorMessage('يرجى إدخال رقم الجوال.');
      if (!isValidYemenLocalPhone(phone)) return setErrorMessage('أدخل رقم جوال يمني صحيحًا من 9 أرقام.');
    } else if (!pendingEmail) {
      return setErrorMessage('يرجى إدخال البريد الإلكتروني.');
    }

    const authEmail = isSignUp || signInMethod === 'phone' ? internalAuthEmail : pendingEmail;
    if (!authEmail) return setErrorMessage('تعذر تجهيز بيانات الدخول. تحقق من رقم الجوال.');

    setLoading(true);
    try {
      markManualAuthAttempt();
      if (isSignUp) {
        const { data: authData, error } = await supabase.auth.signUp({
          email: authEmail,
          password,
          options: {
            emailRedirectTo: getEmailActionUrl('signup'),
            data: {
              full_name: fullName.trim(),
              phone: normalizeYemenPhone(phone),
              governorate,
              auth_identifier: 'phone_internal_email_v1'
            }
          }
        });
        if (error) throw error;
        if (!authData.user) throw new Error('لم نتمكن من إتمام التسجيل، يرجى المحاولة لاحقًا.');
        if (!authData.session) {
          clearManualAuthAttempt();
          throw new Error('تم إنشاء الحساب لكن إعدادات التفعيل الحالية منعت بدء الجلسة تلقائيًا. تواصل مع دعم سند.');
        }

        let userProfile = await ensureProfileExists(authData.user);
        if (avatarFile) {
          const avatarPath = await uploadUserAvatar(authData.user.id, avatarFile);
          const { data: updatedProfile, error: avatarError } = await supabase.from('profiles').update({
            avatar_path: avatarPath,
            updated_at: new Date().toISOString()
          }).eq('id', authData.user.id).select().single();
          if (avatarError) throw avatarError;
          userProfile = updatedProfile as Profile;
        }
        onAuthSuccess(authData.user, userProfile);
      } else {
        const { data: authData, error } = await supabase.auth.signInWithPassword({ email: authEmail, password });
        if (error) throw error;
        if (!authData.user) throw new Error('فشل تسجيل الدخول، لم يتم العثور على المستخدم.');
        const userProfile = await ensureProfileExists(authData.user);
        onAuthSuccess(authData.user, userProfile);
      }
    } catch (error) {
      clearManualAuthAttempt();
      logAuthDiagnostic('authentication_failed', error);
      setErrorMessage(getArabicErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  const brandHeader = (
    <div className="text-center mb-7" id="auth_header">
      <div className="inline-flex items-center justify-center bg-white p-4 rounded-3xl border border-slate-100 shadow-sm mb-4">
        <img src={`${import.meta.env.BASE_URL}logo.png`} alt="شعار سند" className="h-12 object-contain" />
      </div>
      <h2 className="text-2xl font-bold text-slate-900 tracking-tight">سند | SANAD</h2>
      <p className="text-slate-500 text-sm mt-2">
        {view === 'sign-up' ? 'أنشئ حسابك بخطوات بسيطة' : view === 'forgot-password' ? 'استعادة الوصول إلى حساب سابق' : 'سجل دخولك إلى سند'}
      </p>
    </div>
  );

  return (
    <div className="flex flex-col items-center justify-center min-h-[85vh] px-4 py-8" id="auth_container">
      <div className="w-full max-w-md bg-white rounded-3xl border border-slate-100 shadow-xl p-6 md:p-10 transition-all duration-300">
        {brandHeader}

        {errorMessage && <div className="flex items-start gap-3 bg-rose-50 border border-rose-100 text-rose-800 p-4 rounded-xl mb-5 text-sm" id="auth_error"><AlertCircle className="w-5 h-5 shrink-0 text-rose-600 mt-0.5" /><span>{errorMessage}</span></div>}
        {successMessage && <div className="flex items-start gap-3 bg-emerald-50 border border-emerald-100 text-emerald-800 p-4 rounded-xl mb-5 text-sm" id="auth_success"><CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-600 mt-0.5" /><span>{successMessage}</span></div>}

        {view === 'forgot-password' ? (
          <form onSubmit={handleForgotPassword} className="space-y-5">
            <p className="text-sm leading-6 text-slate-600">هذه الاستعادة مخصصة للحسابات السابقة التي كانت تستخدم البريد الإلكتروني.</p>
            <EmailField email={email} setEmail={setEmail} />
            <button type="submit" disabled={loading} className="w-full rounded-xl bg-emerald-600 px-4 py-3.5 font-bold text-white disabled:bg-emerald-300 flex items-center justify-center gap-2">{loading && <Loader2 className="h-5 w-5 animate-spin" />}إرسال رابط الاستعادة</button>
            <button type="button" onClick={() => switchView('sign-in')} className="w-full text-sm font-bold text-emerald-700">العودة إلى تسجيل الدخول</button>
          </form>
        ) : (
          <>
            {!isSignUp && <PasskeySignInButton onError={(message) => setErrorMessage(message || null)} />}
            <form onSubmit={handleAuthSubmit} className="space-y-5" id="auth_form">
              {isSignUp && (
                <>
                  <div className="flex items-center gap-4 rounded-2xl bg-slate-50 p-4">
                    <label className="relative flex h-16 w-16 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-2xl bg-white text-slate-500 shadow-sm">
                      {avatarPreview ? <img src={avatarPreview} alt="معاينة صورة البروفايل" className="h-full w-full object-cover" /> : <Camera className="h-6 w-6" />}
                      <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(event) => setAvatarFile(event.target.files?.[0] || null)} />
                    </label>
                    <div><p className="text-xs font-bold text-slate-800">صورة البروفايل <span className="font-normal text-slate-400">(اختيارية)</span></p><p className="mt-1 text-[10px] leading-5 text-slate-500">يمكنك إضافتها لاحقًا من حسابي.</p></div>
                  </div>
                  <TextField label="الاسم الكامل" value={fullName} setValue={setFullName} icon={<User className="h-4 w-4" />} placeholder="محمد بن عبد الله" />
                </>
              )}

              {(isSignUp || signInMethod === 'phone') && <PhoneField phone={phone} setPhone={setPhone} />}

              {isSignUp && (
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-slate-700">المحافظة</label>
                  <select value={governorate} onChange={event => setGovernorate(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-emerald-500">
                    <option value="">اختر المحافظة</option>
                    {YEMEN_GOVERNORATES.map(item => <option key={item} value={item}>{item}</option>)}
                  </select>
                </div>
              )}

              {!isSignUp && signInMethod === 'email' && <EmailField email={email} setEmail={setEmail} />}
              <PasswordField label="كلمة المرور" value={password} setValue={setPassword} />

              {!isSignUp && (
                <div className="flex items-center justify-between gap-3 text-xs">
                  <button
                    type="button"
                    onClick={() => {
                      resetMessages();
                      setSignInMethod(current => current === 'phone' ? 'email' : 'phone');
                    }}
                    className="font-bold text-emerald-700"
                  >
                    {signInMethod === 'phone' ? 'لدي حساب سابق بالبريد' : 'الدخول برقم الجوال'}
                  </button>
                  {signInMethod === 'email' && <button type="button" onClick={() => switchView('forgot-password')} className="font-bold text-emerald-700">نسيت كلمة المرور؟</button>}
                </div>
              )}

              {isSignUp && <div className="rounded-xl bg-emerald-50 px-4 py-3 text-xs leading-6 text-emerald-800">لا تحتاج إلى بريد إلكتروني. سنستخدم رقم جوالك لتسجيل الدخول، ثم يطلب سند توثيق الرقم عبر واتساب.</div>}

              <button type="submit" disabled={loading} id="auth_submit_btn" className="w-full rounded-xl bg-emerald-600 px-4 py-3.5 font-bold text-white shadow-lg shadow-emerald-600/10 disabled:bg-emerald-300 flex items-center justify-center gap-2">{loading && <Loader2 className="h-5 w-5 animate-spin" />}{isSignUp ? 'إنشاء الحساب' : 'تسجيل الدخول'}</button>
            </form>
            <div className="mt-8 border-t border-slate-100 pt-6 text-center"><button type="button" onClick={() => switchView(isSignUp ? 'sign-in' : 'sign-up')} className="text-sm font-bold text-emerald-700">{isSignUp ? 'لديك حساب بالفعل؟ سجل الدخول الآن' : 'ليس لديك حساب؟ أنشئ حسابًا جديدًا'}</button></div>
          </>
        )}
      </div>
    </div>
  );
}

function PhoneField({ phone, setPhone }: { phone: string; setPhone: (value: string) => void }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-medium text-slate-700">رقم الجوال</label>
      <div className="flex overflow-hidden rounded-xl border border-slate-200 bg-slate-50 focus-within:ring-2 focus-within:ring-emerald-500">
        <div className="relative min-w-0 flex-1">
          <Phone className="pointer-events-none absolute right-3.5 top-3.5 h-4 w-4 text-slate-400" />
          <input type="tel" required value={phone} inputMode="numeric" onChange={event => setPhone(parseYemeniLocalPhone(event.target.value).slice(0, 9))} className="w-full bg-transparent py-3 pl-3.5 pr-10 text-left font-mono text-sm outline-none" placeholder="771234567" dir="ltr" />
        </div>
        <span className="border-r border-slate-200 bg-slate-100 px-3.5 py-3 font-mono text-sm" dir="ltr">+967</span>
      </div>
    </div>
  );
}

function EmailField({ email, setEmail }: { email: string; setEmail: (value: string) => void }) {
  return <div className="space-y-1.5"><label className="block text-xs font-medium text-slate-700">البريد الإلكتروني</label><div className="relative"><Mail className="pointer-events-none absolute right-3.5 top-3.5 h-4 w-4 text-slate-400" /><input type="email" required value={email} onChange={event => setEmail(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-4 pr-10 text-left text-sm outline-none focus:ring-2 focus:ring-emerald-500" placeholder="name@example.com" dir="ltr" /></div></div>;
}

function PasswordField({ label, value, setValue }: { label: string; value: string; setValue: (value: string) => void }) {
  return <div className="space-y-1.5"><label className="block text-xs font-medium text-slate-700">{label}</label><div className="relative"><Lock className="pointer-events-none absolute right-3.5 top-3.5 h-4 w-4 text-slate-400" /><input type="password" required minLength={6} value={value} onChange={event => setValue(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-4 pr-10 text-left text-sm outline-none focus:ring-2 focus:ring-emerald-500" placeholder="••••••" dir="ltr" /></div></div>;
}

function TextField({ label, value, setValue, icon, placeholder }: { label: string; value: string; setValue: (value: string) => void; icon: React.ReactNode; placeholder: string }) {
  return <div className="space-y-1.5"><label className="block text-xs font-medium text-slate-700">{label}</label><div className="relative"><span className="pointer-events-none absolute right-3.5 top-3.5 text-slate-400">{icon}</span><input type="text" required value={value} onChange={event => setValue(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-4 pr-10 text-sm outline-none focus:ring-2 focus:ring-emerald-500" placeholder={placeholder} /></div></div>;
}

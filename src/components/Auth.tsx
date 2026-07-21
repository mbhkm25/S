import React, { useEffect, useState } from 'react';
import type { User as SupabaseUser } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { Lock, Mail, User, AlertCircle, CheckCircle2, Loader2, Sparkles, Camera } from 'lucide-react';
import { Profile } from '../types';
import { parseYemeniLocalPhone } from '../lib/digits';
import { isValidYemenLocalPhone, normalizeYemenPhone } from '../lib/profileUtils';
import { isYemenGovernorate, YEMEN_GOVERNORATES } from '../constants/yemenGovernorates';
import PasskeySignInButton from '../features/passkeys/PasskeySignInButton';
import { logAuthDiagnostic } from '../lib/authDiagnostics';
import { uploadUserAvatar } from '../lib/userAvatar';

interface AuthProps {
  onAuthSuccess: (sessionUser: SupabaseUser, userProfile: Profile) => void;
}

export default function Auth({ onAuthSuccess }: AuthProps) {
  const [isSignUp, setIsSignUp] = useState(false);
  
  // Form fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [governorate, setGovernorate] = useState('');
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState('');
  
  // Status states
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!avatarFile) {
      setAvatarPreview('');
      return;
    }
    const url = URL.createObjectURL(avatarFile);
    setAvatarPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [avatarFile]);

  // Translate standard Supabase auth/db errors to friendly Arabic
  const getArabicErrorMessage = (err: unknown): string => {
    const details = typeof err === 'object' && err !== null
      ? err as { message?: unknown; name?: unknown }
      : {};
    const msg = typeof details.message === 'string' ? details.message : '';
    const errorName = typeof details.name === 'string' ? details.name : '';
    
    // Distinguish between critical database/system errors and standard user authentication errors
    const isSystemError = msg.includes('Database error saving new user') || 
                          msg.toLowerCase().includes('row-level security') || 
                          msg.toLowerCase().includes('rls') || 
                          msg.includes('database_error');
                          
    if (isSystemError) {
      logAuthDiagnostic('database_error', err);
    } else {
      logAuthDiagnostic('auth_flow', err);
    }
    
    if (isSystemError) {
      return 'تعذر إنشاء ملف المستخدم في قاعدة سند. يرجى المحاولة لاحقًا أو التواصل مع الدعم.';
    }
    if (msg.includes('duplicate key') || msg.toLowerCase().includes('already registered') || msg.toLowerCase().includes('already_registered') || msg.includes('user_already_exists')) {
      return 'البريد الإلكتروني مسجل بالفعل، يرجى تسجيل الدخول.';
    }
    if (msg.includes('Password should be at least') || msg.toLowerCase().includes('password_too_short')) {
      return 'كلمة المرور قصيرة جدًا. يجب أن تتكون من 6 أحرف على الأقل.';
    }
    if (msg.includes('Invalid login credentials') || msg.toLowerCase().includes('invalid_credentials')) {
      return 'بيانات الدخول غير صحيحة، يرجى التحقق من البريد وكلمة المرور.';
    }
    if (msg.includes('Email not confirmed') || msg.toLowerCase().includes('email_not_confirmed') || msg.toLowerCase().includes('email not confirmed')) {
      return 'يرجى تأكيد بريدك الإلكتروني أولًا عن طريق الرابط المرسل إليك.';
    }
    if (msg.includes('Failed to fetch') || errorName === 'TypeError') {
      logAuthDiagnostic('network_error', err);
      return 'فشل الاتصال بالخادم الآمن لسند. يرجى التحقق من اتصالك بالإنترنت وتأكيد صحة تهيئة مفاتيح Supabase في لوحة الإعدادات.';
    }
    return msg || 'تعذر إتمام العملية حاليًا. يرجى المحاولة مرة أخرى.';
  };

  // Helper to ensure profile exists
  const ensureProfileExists = async (user: SupabaseUser) => {
    try {
      const { data: profile, error: fetchError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();

      if (fetchError) {
        logAuthDiagnostic('profile_fetch_fallback', fetchError);
      }

      if (!profile) {
        // Profile does not exist, insert/upsert it
        const userFullName = user.user_metadata?.full_name || fullName || 'مستخدم سند';
        const userPhone = user.user_metadata?.phone || (phone ? normalizeYemenPhone(phone) : '');
        const userGovernorate = user.user_metadata?.governorate || governorate || null;
        
        const { data: newProfile, error: insertError } = await supabase
          .from('profiles')
          .upsert({
            id: user.id,
            full_name: userFullName,
            phone: userPhone,
            governorate: userGovernorate,
            status: 'active',
            profile_completed_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .select()
          .single();

        if (insertError) {
          throw insertError;
        }
        return newProfile as Profile;
      }
      
      return profile as Profile;
    } catch (err: unknown) {
      logAuthDiagnostic('profile_ensure_failed', err);
      throw new Error('تعذر إنشاء ملف المستخدم في قاعدة سند. أعد المحاولة.');
    }
  };

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    // Validation
    if (!email || !password) {
      setErrorMessage('يرجى ملء البريد الإلكتروني وكلمة المرور.');
      setLoading(false);
      return;
    }

    if (isSignUp) {
      if (!fullName) {
        setErrorMessage('يرجى كتابة الاسم الكامل.');
        setLoading(false);
        return;
      }
      if (!phone) {
        setErrorMessage('يرجى إدخال رقم الجوال.');
        setLoading(false);
        return;
      }
      if (!isValidYemenLocalPhone(phone)) {
        setErrorMessage(phone.length !== 9 ? 'رقم الجوال يجب أن يتكون من 9 أرقام.' : 'رقم الجوال اليمني يجب أن يبدأ بالرقم 7.');
        setLoading(false);
        return;
      }
      if (!isYemenGovernorate(governorate)) {
        setErrorMessage('يرجى اختيار المحافظة');
        setLoading(false);
        return;
      }
      if (password !== confirmPassword) {
        setErrorMessage('كلمتا المرور غير متطابقتين.');
        setLoading(false);
        return;
      }
    }

    try {
      if (isSignUp) {
        // Build clean email redirection URL for PWA route deployment
        const base = import.meta.env.VITE_APP_BASE_PATH || import.meta.env.BASE_URL || '/';
        const cleanBase = base.startsWith('/') ? base : `/${base}`;
        const baseUrl = window.location.origin + cleanBase;
        const cleanRedirectUrl = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;

        // Sign up
        const { data: authData, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: cleanRedirectUrl,
            data: {
              full_name: fullName,
              phone: normalizeYemenPhone(phone),
              governorate
            }
          }
        });

        if (signUpError) throw signUpError;

        if (!authData.user) {
          throw new Error('لم نتمكن من إتمام التسجيل، يرجى المحاولة لاحقاً.');
        }

        // 4. Handle Email Confirmation state
        if (authData.user && !authData.session) {
          setSuccessMessage('تم إنشاء الحساب بنجاح! يرجى التحقق من بريدك الإلكتروني لتأكيد الحساب، ثم تسجيل الدخول.');
          setLoading(false);
          // Auto switch to sign-in view after 6 seconds
          setTimeout(() => {
            setIsSignUp(false);
            setSuccessMessage(null);
          }, 6000);
          return;
        }

        // If session is active immediately, ensure profile and trigger auth success
        if (authData.session) {
          let userProfile = await ensureProfileExists(authData.user);
          if (avatarFile) {
            const avatarPath = await uploadUserAvatar(authData.user.id, avatarFile);
            const { data: updatedProfile, error: avatarError } = await supabase
              .from('profiles')
              .update({ avatar_path: avatarPath, updated_at: new Date().toISOString() })
              .eq('id', authData.user.id)
              .select()
              .single();
            if (avatarError) throw avatarError;
            userProfile = updatedProfile as Profile;
          }
          setSuccessMessage('تم إنشاء الحساب بنجاح!');
          
          setTimeout(() => {
            onAuthSuccess(authData.user, userProfile!);
          }, 1200);
        }

      } else {
        // Sign in
        const { data: authData, error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password
        });

        if (signInError) throw signInError;

        if (!authData.user) {
          throw new Error('فشل تسجيل الدخول، لم يتم العثور على المستخدم.');
        }

        // Fetch / Ensure profile exists
        const userProfile = await ensureProfileExists(authData.user);
        onAuthSuccess(authData.user, userProfile!);
      }
    } catch (err: unknown) {
      logAuthDiagnostic('authentication_failed', err);
      setErrorMessage(getArabicErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[85vh] px-4 py-8" id="auth_container">
      <div className="w-full max-w-md bg-white rounded-3xl border border-slate-100 shadow-xl p-8 md:p-10 transition-all duration-300">
        
        {/* Brand Header */}
        <div className="text-center mb-8" id="auth_header">
          <div className="inline-flex items-center justify-center bg-white p-4 rounded-3xl border border-slate-100 shadow-sm mb-4">
            <img 
              src={`${import.meta.env.BASE_URL}logo.png`} 
              alt="سند للتحقق" 
              className="h-12 object-contain" 
              onError={(e) => {
                // If logo.png fails, fall back to showing the icon/Sparkles styling
                e.currentTarget.style.display = 'none';
                const parent = e.currentTarget.parentElement;
                if (parent) {
                  parent.className = "inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-emerald-50 mb-4 text-emerald-600 animate-pulse";
                  // Render a Sparkles icon style inside
                  parent.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-8 h-8"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275Z"/><path d="m5 3 1 2.5L8.5 6 6 7 5 9.5 4 7 1.5 6 4 5Z"/><path d="m19 17 1 2.5 2.5.5-2.5 1-1 2.5-1-2.5-2.5-1 2.5-1Z"/></svg>';
                }
              }}
            />
          </div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">سند للتحقق | SANAD Verify</h2>
          <p className="text-slate-500 text-sm mt-2">
            {isSignUp ? 'أنشئ حسابك الشخصي الموثق للبدء' : 'سجل دخولك للوصول إلى إشعاراتك المالية'}
          </p>
        </div>

        {/* Info alerts */}
        {errorMessage && (
          <div className="flex items-start gap-3 bg-rose-50 border border-rose-100 text-rose-800 p-4 rounded-xl mb-6 text-sm" id="auth_error">
            <AlertCircle className="w-5 h-5 shrink-0 text-rose-600 mt-0.5" />
            <span>{errorMessage}</span>
          </div>
        )}

        {successMessage && (
          <div className="flex items-start gap-3 bg-emerald-50 border border-emerald-100 text-emerald-800 p-4 rounded-xl mb-6 text-sm" id="auth_success">
            <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-600 mt-0.5" />
            <span>{successMessage}</span>
          </div>
        )}

        {!isSignUp && (
          <PasskeySignInButton
            onError={(message) => setErrorMessage(message || null)}
          />
        )}

        {/* Auth Form */}
        <form onSubmit={handleAuthSubmit} className="space-y-5" id="auth_form">
          {isSignUp && (
            <>
              <div className="flex items-center gap-4 rounded-2xl bg-slate-50 p-4">
                <label className="relative flex h-16 w-16 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-2xl bg-white text-slate-500 shadow-sm">
                  {avatarPreview ? <img src={avatarPreview} alt="معاينة صورة البروفايل" className="h-full w-full object-cover" /> : <Camera className="h-6 w-6" />}
                  <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(event) => setAvatarFile(event.target.files?.[0] || null)} />
                </label>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-slate-800">صورة البروفايل <span className="font-normal text-slate-400">(اختيارية)</span></p>
                  <p className="mt-1 text-[10px] leading-5 text-slate-500">يمكنك تخطيها وإضافتها لاحقًا من حسابي.</p>
                  {avatarFile && <button type="button" onClick={() => setAvatarFile(null)} className="mt-1 text-[10px] font-bold text-rose-600">إزالة الصورة</button>}
                </div>
              </div>

              {/* Full Name */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-700 block">الاسم الكامل</label>
                <div className="relative">
                  <span className="absolute inset-y-0 right-0 flex items-center pr-3.5 pointer-events-none text-slate-400">
                    <User className="w-4 h-4" />
                  </span>
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="w-full pr-10 pl-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all"
                    placeholder="محمد بن عبد الله"
                  />
                </div>
              </div>

              {/* Phone Number */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-700 block">رقم الجوال</label>
                <div className="flex rounded-xl border border-slate-200 bg-slate-50 overflow-hidden focus-within:ring-2 focus-within:ring-emerald-500 focus-within:border-emerald-500">
                  <input
                    type="tel"
                    required
                    value={phone}
                    inputMode="numeric"
                    onChange={(e) => setPhone(parseYemeniLocalPhone(e.target.value).slice(0, 9))}
                    className="min-w-0 flex-1 px-3.5 py-3 bg-transparent text-slate-900 text-sm focus:outline-none text-left font-mono"
                    placeholder="771234567"
                    dir="ltr"
                  />
                  <span className="bg-slate-100 border-r border-slate-200 px-3.5 py-3 text-sm text-slate-600 font-mono select-none" dir="ltr">+967</span>
                </div>
                <p className="text-[10px] text-slate-400">أدخل رقم الجوال المكوّن من 9 أرقام</p>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-700 block">المحافظة</label>
                <select
                  required
                  value={governorate}
                  onChange={(e) => setGovernorate(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                >
                  <option value="">اختر المحافظة</option>
                  {YEMEN_GOVERNORATES.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </div>
            </>
          )}

          {/* Email */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-700 block">البريد الإلكتروني</label>
            <div className="relative">
              <span className="absolute inset-y-0 right-0 flex items-center pr-3.5 pointer-events-none text-slate-400">
                <Mail className="w-4 h-4" />
              </span>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pr-10 pl-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all text-left"
                placeholder="name@example.com"
                dir="ltr"
              />
            </div>
          </div>

          {/* Password */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-700 block">كلمة المرور</label>
            <div className="relative">
              <span className="absolute inset-y-0 right-0 flex items-center pr-3.5 pointer-events-none text-slate-400">
                <Lock className="w-4 h-4" />
              </span>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pr-10 pl-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all text-left"
                placeholder="••••••"
                dir="ltr"
              />
            </div>
          </div>

          {/* Confirm Password (Sign Up Only) */}
          {isSignUp && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-700 block">تأكيد كلمة المرور</label>
              <div className="relative">
                <span className="absolute inset-y-0 right-0 flex items-center pr-3.5 pointer-events-none text-slate-400">
                  <Lock className="w-4 h-4" />
                </span>
                <input
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full pr-10 pl-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all text-left"
                  placeholder="••••••"
                  dir="ltr"
                />
              </div>
            </div>
          )}

          {/* Action Button */}
          <button
            type="submit"
            disabled={loading}
            id="auth_submit_btn"
            className="w-full mt-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white font-medium py-3.5 px-4 rounded-xl shadow-lg shadow-emerald-600/10 hover:shadow-emerald-600/20 active:scale-[0.98] transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            {loading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>يرجى الانتظار...</span>
              </>
            ) : (
              <span>{isSignUp ? 'إنشاء حساب جديد' : 'تسجيل الدخول'}</span>
            )}
          </button>
        </form>

        {/* Toggle Screen */}
        <div className="mt-8 text-center border-t border-slate-100 pt-6">
          <button
            type="button"
            id="auth_toggle_btn"
            onClick={() => {
              setIsSignUp(!isSignUp);
              setErrorMessage(null);
              setSuccessMessage(null);
            }}
            className="text-emerald-600 hover:text-emerald-700 font-medium text-sm focus:outline-none"
          >
            {isSignUp ? 'لديك حساب بالفعل؟ سجل الدخول الآن' : 'ليس لديك حساب؟ أنشئ حساباً جديداً'}
          </button>
        </div>

      </div>
    </div>
  );
}

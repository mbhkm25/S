import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { Profile } from '../types';
import { User, Phone, AlertCircle, Loader2, CheckCircle, ShieldAlert } from 'lucide-react';
import { toLatinDigits, parseYemeniLocalPhone } from '../lib/digits';
import { normalizeYemenPhone, isValidYemenLocalPhone } from '../lib/profileUtils';

interface ProfileCompletionGateModalProps {
  isOpen: boolean;
  profile: Profile | null;
  onClose: () => void;
  onSuccess: () => void;
  refreshProfile: () => Promise<Profile | null>;
}

export default function ProfileCompletionGateModal({ isOpen, profile, onClose, onSuccess, refreshProfile }: ProfileCompletionGateModalProps) {
  const [fullName, setFullName] = useState(profile?.full_name || '');
  const [localPhone, setLocalPhone] = useState(profile?.phone ? parseYemeniLocalPhone(profile.phone) : '');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Sync state if profile is loaded late
  React.useEffect(() => {
    if (profile) {
      if (!fullName) setFullName(profile.full_name || '');
      if (!localPhone && profile.phone) setLocalPhone(parseYemeniLocalPhone(profile.phone));
    }
  }, [profile]);

  if (!isOpen) return null;

  const isNameMissing = !profile?.full_name || !profile.full_name.trim();
  const isPhoneMissing = !profile?.phone || parseYemeniLocalPhone(profile.phone).length !== 9;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const updatePayload: any = {};

    if (isNameMissing) {
      const name = fullName.trim();
      if (!name) {
        setError('الاسم الكامل مطلوب.');
        return;
      }
      if (name.length < 3) {
        setError('يجب أن يتكون الاسم الكامل من 3 أحرف على الأقل.');
        return;
      }
      updatePayload.full_name = name;
    }

    if (isPhoneMissing) {
      const cleanPhone = toLatinDigits(localPhone.trim());
      if (!cleanPhone) {
        setError('رقم الهاتف مطلوب.');
        return;
      }
      if (!isValidYemenLocalPhone(cleanPhone)) {
        setError('رقم الهاتف يجب أن يتكون من 9 أرقام يمنية صالحة (مثال: 777634971).');
        return;
      }
      updatePayload.phone = normalizeYemenPhone(cleanPhone);
    }

    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        throw new Error('لم يتم العثور على جلسة مستخدم نشطة. يرجى تسجيل الدخول.');
      }

      updatePayload.id = session.user.id;
      updatePayload.profile_completed_at = new Date().toISOString();
      updatePayload.updated_at = new Date().toISOString();

      // Upsert directly to profiles table to bypass RPC governorate constraints
      const { error: updateError } = await supabase
        .from('profiles')
        .upsert(updatePayload);

      if (updateError) throw updateError;

      setSuccess(true);
      await refreshProfile();
      
      setTimeout(() => {
        setSuccess(false);
        onSuccess();
      }, 1000);
    } catch (err: any) {
      console.error('upsert error in gate:', err);
      setError(err.message || 'فشل حفظ البيانات الشخصية، يرجى إعادة المحاولة.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" id="profile_gate_modal">
      <div className="flex min-h-screen items-center justify-center px-4 pt-4 pb-20 text-center sm:block sm:p-0">
        
        {/* Backdrop overlay */}
        <div 
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity" 
          onClick={onClose} 
        />

        {/* Center alignment spacer */}
        <span className="hidden sm:inline-block sm:h-screen sm:align-middle" aria-hidden="true">&#8203;</span>

        {/* Modal panel container */}
        <div 
          className="inline-block w-full max-w-md transform overflow-hidden rounded-3xl bg-white p-6 text-right align-middle shadow-2xl transition-all sm:my-8 sm:align-middle"
          dir="rtl"
        >
          {/* Header */}
          <div className="text-center space-y-2 mb-4">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-amber-50 text-amber-500 border border-amber-100">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-bold text-slate-950 font-arabic">تحديث الملف والبيانات الأساسية</h3>
            <p className="text-xs text-rose-600 font-arabic font-medium bg-rose-50/80 px-3 py-1.5 rounded-xl border border-rose-100/50 leading-relaxed">
              لإتمام هذا الإجراء داخل سند، أكمل بياناتك الأساسية أولاً.
            </p>
          </div>

          {success ? (
            <div className="py-10 text-center space-y-2 animate-fade-in">
              <CheckCircle className="w-12 h-12 text-emerald-500 mx-auto animate-bounce" />
              <p className="text-xs font-bold text-emerald-800 font-arabic">تم تفعيل حسابك بنجاح!</p>
              <p className="text-[10px] text-slate-400 font-arabic">جاري توجيهك لإتمام الإجراء المالي الموثق...</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="p-3 bg-rose-50 border border-rose-100 text-rose-800 text-xs rounded-xl flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-500 mt-0.5" />
                  <span className="leading-snug">{error}</span>
                </div>
              )}

              {/* Input: Name */}
              {isNameMissing && (
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-slate-500 block font-arabic">الاسم الكامل</label>
                  <div className="relative">
                    <input
                      type="text"
                      value={fullName}
                      onChange={(e) => {
                        setFullName(e.target.value);
                        setError(null);
                      }}
                      placeholder="اكتب اسمك الكامل"
                      className="w-full text-right text-xs px-3.5 py-3 rounded-2xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-slate-400 outline-none transition-all"
                      required
                    />
                    <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">
                      <User className="w-4 h-4" />
                    </div>
                  </div>
                </div>
              )}

              {/* Input: Phone Number */}
              {isPhoneMissing && (
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-slate-500 block font-arabic">رقم الهاتف (اليمن)</label>
                  <div className="relative flex rounded-2xl border border-slate-200 bg-slate-50 overflow-hidden focus-within:bg-white focus-within:border-slate-400 transition-all">
                    <input
                      type="text"
                      value={localPhone}
                      onChange={(e) => {
                        setLocalPhone(toLatinDigits(e.target.value).replace(/\D/g, '').substring(0, 9));
                        setError(null);
                      }}
                      dir="ltr"
                      placeholder="777634971"
                      className="flex-1 text-left text-xs px-3.5 py-3 bg-transparent outline-none border-none font-mono text-slate-800"
                      required
                    />
                    <span className="bg-slate-100 border-r border-slate-200 px-3 py-3 text-xs text-slate-500 font-mono flex items-center select-none" dir="ltr">
                      +967
                    </span>
                  </div>
                  <p className="text-[9px] text-slate-400 font-arabic mt-1">اكتب الـ 9 أرقام اليمنية مباشرة بدون مفتاح الدولة.</p>
                </div>
              )}

              {/* Action buttons */}
              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white font-bold py-3 px-4 rounded-2xl transition-all cursor-pointer text-xs font-arabic flex items-center justify-center gap-1"
                >
                  {saving ? (
                    <Loader2 className="w-4 h-4 animate-spin text-white" />
                  ) : (
                    <span>تأكيد وحفظ</span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-2xl transition-all cursor-pointer text-xs font-arabic"
                >
                  إلغاء
                </button>
              </div>
            </form>
          )}

        </div>
      </div>
    </div>
  );
}

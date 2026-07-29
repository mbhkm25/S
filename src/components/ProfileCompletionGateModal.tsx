import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle, Loader2, MapPin, Phone, ShieldAlert, User } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Profile } from '../types';
import { parseYemeniLocalPhone, toLatinDigits } from '../lib/digits';
import { isValidYemenLocalPhone, normalizeYemenPhone } from '../lib/profileUtils';
import { isYemenGovernorate, YEMEN_GOVERNORATES } from '../constants/yemenGovernorates';

interface ProfileCompletionGateModalProps {
  isOpen: boolean;
  profile: Profile | null;
  onClose: () => void;
  onSuccess: () => void;
  refreshProfile: () => Promise<Profile | null>;
}

export default function ProfileCompletionGateModal({
  isOpen,
  profile,
  onClose,
  onSuccess,
  refreshProfile
}: ProfileCompletionGateModalProps) {
  const effectivePhone = profile?.phone || profile?.pending_phone || '';
  const [fullName, setFullName] = useState(profile?.full_name || '');
  const [localPhone, setLocalPhone] = useState(effectivePhone ? parseYemeniLocalPhone(effectivePhone) : '');
  const [governorate, setGovernorate] = useState(profile?.governorate || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!profile) return;
    setFullName(profile.full_name || '');
    setLocalPhone(profile.phone || profile.pending_phone ? parseYemeniLocalPhone(profile.phone || profile.pending_phone || '') : '');
    setGovernorate(profile.governorate || '');
  }, [profile?.id, profile?.full_name, profile?.phone, profile?.pending_phone, profile?.governorate]);

  const missing = useMemo(() => ({
    name: !profile?.full_name?.trim(),
    phone: !effectivePhone || !/^7\d{8}$/.test(parseYemeniLocalPhone(effectivePhone)),
    governorate: !profile?.governorate?.trim()
  }), [effectivePhone, profile?.full_name, profile?.governorate]);

  if (!isOpen) return null;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    const name = fullName.trim();
    const cleanPhone = toLatinDigits(localPhone).replace(/\D/g, '');

    if (missing.name && name.length < 3) return setError('اكتب الاسم الكامل من 3 أحرف على الأقل.');
    if (missing.phone && !isValidYemenLocalPhone(cleanPhone)) return setError('أدخل رقم جوال يمني صحيحًا من 9 أرقام.');
    if (missing.governorate && !isYemenGovernorate(governorate)) return setError('اختر المحافظة.');

    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) throw new Error('لم يتم العثور على جلسة مستخدم نشطة.');

      const profilePatch: Record<string, unknown> = {};
      if (missing.name) profilePatch.full_name = name;
      if (missing.governorate) profilePatch.governorate = governorate;

      if (Object.keys(profilePatch).length > 0) {
        const { error: updateError } = await supabase
          .from('profiles')
          .update(profilePatch)
          .eq('id', session.user.id);
        if (updateError) throw updateError;
      }

      if (missing.phone) {
        const { data, error: phoneError } = await supabase.rpc('request_my_phone_verification', {
          p_phone: normalizeYemenPhone(cleanPhone)
        });
        if (phoneError) throw phoneError;
        if (data?.ok === false) throw new Error(data?.reason || 'تعذر حفظ رقم الجوال.');
      }

      const refreshed = await refreshProfile();
      if (!refreshed) throw new Error('تم الحفظ، لكن تعذر تحديث الملف الآن.');

      setSuccess(true);
      window.setTimeout(() => {
        setSuccess(false);
        onSuccess();
      }, 700);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'فشل حفظ البيانات الأساسية.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" id="profile_gate_modal">
      <div className="flex min-h-screen items-center justify-center px-4 py-8 text-center">
        <button type="button" aria-label="إغلاق" className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />
        <section className="relative w-full max-w-md rounded-3xl bg-white p-6 text-right shadow-2xl" dir="rtl">
          <div className="mb-5 text-center">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-amber-100 bg-amber-50 text-amber-600">
              <ShieldAlert className="h-6 w-6" />
            </span>
            <h3 className="mt-3 text-sm font-bold text-slate-950">إكمال البيانات الناقصة فقط</h3>
            <p className="mt-2 text-xs leading-6 text-slate-500">لن يطلب سند أي بيانات سبق أن أدخلتها عند إنشاء الحساب. يظهر هنا فقط الحقل المفقود فعليًا.</p>
          </div>

          {success ? (
            <div className="py-10 text-center">
              <CheckCircle className="mx-auto h-12 w-12 text-emerald-500" />
              <p className="mt-3 text-xs font-bold text-emerald-800">تم حفظ البيانات ومتابعة الإجراء.</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && <div className="flex items-start gap-2 rounded-xl border border-rose-100 bg-rose-50 p-3 text-xs text-rose-800"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><span>{error}</span></div>}

              {missing.name && <Field label="الاسم الكامل" icon={<User className="h-4 w-4" />}><input value={fullName} onChange={(e) => setFullName(e.target.value)} className="w-full bg-transparent text-xs outline-none" placeholder="اكتب اسمك الكامل" /></Field>}

              {missing.phone && <div className="space-y-1.5"><label className="block text-[11px] font-bold text-slate-600">رقم الجوال</label><div className="flex overflow-hidden rounded-2xl border border-slate-200 bg-slate-50"><input dir="ltr" value={localPhone} onChange={(e) => setLocalPhone(toLatinDigits(e.target.value).replace(/\D/g, '').slice(0, 9))} className="min-w-0 flex-1 bg-transparent px-3 py-3 text-left font-mono text-xs outline-none" placeholder="777634971" /><span className="flex items-center gap-1 border-r border-slate-200 bg-slate-100 px-3 text-xs text-slate-500"><Phone className="h-4 w-4" />+967</span></div><p className="text-[9px] text-slate-400">سيُحفظ الرقم عبر مسار التحقق الرسمي، وليس كتعديل مباشر على الهوية.</p></div>}

              {missing.governorate && <Field label="المحافظة" icon={<MapPin className="h-4 w-4" />}><select value={governorate} onChange={(e) => setGovernorate(e.target.value)} className="w-full bg-transparent text-xs outline-none"><option value="">اختر المحافظة</option>{YEMEN_GOVERNORATES.map((item) => <option key={item} value={item}>{item}</option>)}</select></Field>}

              <div className="flex gap-2 pt-2">
                <button type="submit" disabled={saving} className="flex min-h-12 flex-1 items-center justify-center rounded-2xl bg-emerald-600 text-xs font-bold text-white disabled:bg-slate-300">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'حفظ ومتابعة'}</button>
                <button type="button" onClick={onClose} className="min-h-12 rounded-2xl bg-slate-100 px-5 text-xs font-bold text-slate-700">إلغاء</button>
              </div>
            </form>
          )}
        </section>
      </div>
    </div>
  );
}

function Field({ label, icon, children }: { label: string; icon: React.ReactNode; children: React.ReactNode }) {
  return <label className="block space-y-1.5"><span className="block text-[11px] font-bold text-slate-600">{label}</span><span className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-slate-400">{children}{icon}</span></label>;
}

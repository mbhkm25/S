import React, { useEffect, useState } from 'react';
import { createBusinessProfile, getBusinessCommunityContext } from '../../lib/businessApi';
import { ArrowRight, Store, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';

interface BusinessCreateProps {
  onNavigate: (page: string) => void;
}

const GOVERNORATES = [
  'صنعاء', 'عدن', 'تعز', 'الحديدة', 'حضرموت', 'إب', 'ذمار', 'أبين', 'صعدة', 'حجة',
  'عمران', 'البيضاء', 'الضالع', 'المحويت', 'شبوة', 'المهرة', 'مأرب', 'الجوف', 'ريمة', 'سقطرى'
];

function createPendingSlug(): string {
  const randomPart = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID().replace(/-/g, '').slice(0, 16)
    : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  return `pending-${randomPart}`;
}

export default function BusinessCreate({ onNavigate }: BusinessCreateProps) {
  const [name, setName] = useState('');
  const [governorate, setGovernorate] = useState('');
  const [city, setCity] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [checkingRegistration, setCheckingRegistration] = useState(true);
  const [registrationOpen, setRegistrationOpen] = useState(true);

  useEffect(() => {
    let active = true;
    void getBusinessCommunityContext()
      .then((context) => { if (active) setRegistrationOpen(context.registration_open); })
      .catch(() => { if (active) setRegistrationOpen(false); })
      .finally(() => { if (active) setCheckingRegistration(false); });
    return () => { active = false; };
  }, []);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim() || !governorate || !city.trim() || !whatsapp.trim()) {
      setError('يرجى ملء جميع الحقول المطلوبة.');
      return;
    }

    const cleanWhatsapp = whatsapp.trim().replace(/\+/g, '');
    if (!/^967\d{9}$/.test(cleanWhatsapp)) {
      setError('رقم الواتساب يجب أن يكون بالصيغة الدولية اليمنية (9677xxxxxxxx).');
      return;
    }

    setError(null);
    setLoading(true);
    try {
      await createBusinessProfile({
        p_name: name.trim(),
        p_slug: createPendingSlug(),
        p_governorate: governorate,
        p_city: city.trim(),
        p_whatsapp: cleanWhatsapp,
        p_description: description.trim() || null,
        p_category_id: null,
        p_logo_path: null
      });
      setSuccess(true);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : '';
      setError(message.includes('business_registration_closed')
        ? 'تسجيل الأنشطة متوقف مؤقتًا.'
        : message || 'حدث خطأ أثناء إنشاء الملف التجاري.');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return <div className="space-y-6 rounded-3xl border border-slate-200/60 bg-white p-6 text-center font-arabic animate-fade-in">
      <div className="inline-flex h-14 w-14 items-center justify-center rounded-full border border-emerald-100 bg-emerald-50 text-emerald-600"><CheckCircle2 className="h-7 w-7" /></div>
      <div className="space-y-2">
        <h2 className="text-lg font-bold text-slate-950">تم إرسال نشاطك للمراجعة</h2>
        <p className="px-2 text-xs leading-relaxed text-slate-500">ستراجع إدارة سند بيانات النشاط وتختار رابط ملفه العام قبل الاعتماد والنشر. يمكنك البدء في تجهيز بيانات النشاط وفريق العمل أثناء المراجعة.</p>
      </div>
      <button onClick={() => onNavigate('business-manage')} className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#111111] px-4 py-3.5 text-xs font-bold text-white shadow-sm transition-all hover:bg-black"><span>الانتقال إلى إدارة النشاط</span><ArrowRight className="h-4 w-4 rotate-180" /></button>
    </div>;
  }

  if (checkingRegistration) return <div className="flex min-h-[45vh] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>;

  if (!registrationOpen) return <div className="rounded-3xl border border-slate-200/60 bg-white p-7 text-center font-arabic shadow-sm" dir="rtl"><Store className="mx-auto h-10 w-10 text-slate-300" /><h1 className="mt-4 text-base font-bold text-slate-900">تسجيل الأنشطة متوقف مؤقتًا</h1><p className="mt-2 text-xs leading-6 text-slate-500">سنفتح التسجيل مجددًا بعد اكتمال التجهيزات الحالية.</p><button onClick={() => onNavigate('business-community')} className="mt-5 min-h-11 w-full rounded-xl bg-slate-950 text-xs font-bold text-white">العودة لمجتمع الأعمال</button></div>;

  return <div className="space-y-5 font-arabic" dir="rtl">
    <div className="mb-1 flex items-center gap-2">
      <button onClick={() => onNavigate('profile')} className="rounded-xl border border-slate-200/60 bg-white p-2 transition-all hover:bg-slate-50"><ArrowRight className="h-4 w-4" /></button>
      <div><h1 className="text-sm font-bold text-slate-900">إنشاء نشاط تجاري جديد</h1><p className="text-[10px] text-slate-500">سجل نشاطك التجاري للتوثيق والتحقق</p></div>
    </div>

    <form onSubmit={handleSubmit} className="space-y-4 rounded-3xl border border-slate-200/60 bg-white p-5 shadow-sm">
      {error && <div className="flex items-start gap-2 rounded-xl border border-rose-100 bg-rose-50 p-3 text-xs text-rose-800"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><span>{error}</span></div>}

      <label className="block space-y-1 text-[11px] font-bold text-slate-700">اسم النشاط التجاري <span className="text-rose-500">*</span><div className="relative"><Store className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input required value={name} onChange={(event) => setName(event.target.value)} placeholder="مثال: سوبرماركت الأمانة" className="w-full rounded-xl border border-slate-200/80 bg-slate-50 py-3 pl-3 pr-9 text-right text-xs outline-none transition-all focus:border-slate-400 focus:bg-white" /></div></label>

      <div className="rounded-2xl border border-sky-100 bg-sky-50/70 p-3 text-[10px] leading-5 text-sky-800"><strong className="block text-[11px]">رابط الملف العام</strong><span>لا تحتاج إلى اختيار رابط الآن. ستختار إدارة سند رابطًا احترافيًا وفريدًا أثناء مراجعة النشاط، وقد تتواصل معك للتأكيد عند الحاجة.</span></div>

      <div className="grid grid-cols-2 gap-3">
        <label className="space-y-1 text-[11px] font-bold text-slate-700">المحافظة <span className="text-rose-500">*</span><select required value={governorate} onChange={(event) => setGovernorate(event.target.value)} className="w-full rounded-xl border border-slate-200/80 bg-slate-50 px-3 py-3 text-right text-xs outline-none focus:border-slate-400 focus:bg-white"><option value="">اختر المحافظة...</option>{GOVERNORATES.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
        <label className="space-y-1 text-[11px] font-bold text-slate-700">المدينة / المنطقة <span className="text-rose-500">*</span><input required value={city} onChange={(event) => setCity(event.target.value)} placeholder="مثال: حي الروضة" className="w-full rounded-xl border border-slate-200/80 bg-slate-50 px-3 py-3 text-right text-xs outline-none focus:border-slate-400 focus:bg-white" /></label>
      </div>

      <label className="block space-y-1 text-[11px] font-bold text-slate-700">رقم واتساب النشاط <span className="text-rose-500">*</span><input type="tel" required value={whatsapp} onChange={(event) => setWhatsapp(event.target.value)} placeholder="مثال: 967777123456" dir="ltr" className="w-full rounded-xl border border-slate-200/80 bg-slate-50 px-3 py-3 text-left font-mono text-xs outline-none focus:border-slate-400 focus:bg-white" /><span className="block text-[9px] font-normal text-slate-400">اكتب الرقم بالصيغة الدولية اليمنية بدون رمز + أو أصفار إضافية.</span></label>

      <label className="block space-y-1 text-[11px] font-bold text-slate-700">وصف مختصر للنشاط <span className="font-normal text-slate-400">(اختياري)</span><textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={3} placeholder="اكتب وصفًا مختصرًا لما يقدمه نشاطك..." className="w-full resize-none rounded-xl border border-slate-200/80 bg-slate-50 px-3 py-2 text-right text-xs outline-none focus:border-slate-400 focus:bg-white" /></label>

      <button type="submit" disabled={loading} className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#111111] px-4 py-3.5 text-xs font-bold text-white shadow-sm transition-all hover:bg-black disabled:cursor-not-allowed disabled:opacity-50">{loading && <Loader2 className="h-4 w-4 animate-spin" />}{loading ? 'جارٍ إرسال الطلب...' : 'إرسال النشاط للمراجعة'}</button>
    </form>
  </div>;
}

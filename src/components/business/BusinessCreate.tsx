import React, { useState } from 'react';
import { createBusinessProfile } from '../../lib/businessApi';
import { ArrowRight, Store, Loader2, CheckCircle2, AlertTriangle, Link2 } from 'lucide-react';

interface BusinessCreateProps {
  onNavigate: (page: string) => void;
}

const GOVERNORATES = [
  'صنعاء', 'عدن', 'تعز', 'الحديدة', 'حضرموت', 'إب', 'ذمار', 'أبين', 'صعدة', 'حجة', 
  'عمران', 'البيضاء', 'الضالع', 'المحويت', 'شبوة', 'المهرة', 'مأرب', 'الجوف', 'ريمة', 'سقطرى'
];

export default function BusinessCreate({ onNavigate }: BusinessCreateProps) {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [governorate, setGovernorate] = useState('');
  const [city, setCity] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [description, setDescription] = useState('');
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !governorate || !city || !whatsapp) {
      setError('يرجى ملء جميع الحقول المطلوبة.');
      return;
    }

    // Validate WhatsApp number format: 967XXXXXXXXX
    const cleanWhatsapp = whatsapp.trim().replace(/\+/g, '');
    const phoneRegex = /^967\d{9}$/;
    if (!phoneRegex.test(cleanWhatsapp)) {
      setError('رقم الواتساب يجب أن يكون بالصيغة الدولية اليمنية (9677xxxxxxxx).');
      return;
    }

    // Auto-generate slug if empty
    const finalSlug = slug.trim() 
      ? slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-')
      : name.trim().replace(/\s+/g, '-').replace(/[^a-zA-Z0-9\u0600-\u06FF-]/g, '').toLowerCase();

    if (!finalSlug) {
      setError('يرجى كتابة الاسم اللاتيني (Slug) المناسب للرابط.');
      return;
    }

    setLoading(false);
    setError(null);
    setLoading(true);

    try {
      await createBusinessProfile({
        p_name: name.trim(),
        p_slug: finalSlug,
        p_governorate: governorate,
        p_city: city.trim(),
        p_whatsapp: cleanWhatsapp,
        p_description: description.trim() || null,
        p_category_id: null, // Left optional in this phase
        p_logo_path: null
      });
      setSuccess(true);
    } catch (err: any) {
      setError(err.message || 'حدث خطأ أثناء إنشاء الملف التجاري.');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="bg-white rounded-3xl border border-slate-200/60 p-6 text-center space-y-6 animate-fade-in font-arabic">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-100">
          <CheckCircle2 className="w-7 h-7" />
        </div>

        <div className="space-y-2">
          <h2 className="text-lg font-bold text-slate-950">تم إرسال نشاطك للمراجعة</h2>
          <p className="text-xs text-slate-500 leading-relaxed px-2">
            ستقوم إدارة سند بمراجعة البيانات ثم نشر النشاط في مجتمع الأعمال. يمكنك البدء في إدارة العمليات وفريق العمل مباشرة.
          </p>
        </div>

        <div className="pt-2">
          <button
            onClick={() => onNavigate('business-manage')}
            className="w-full bg-[#111111] hover:bg-black text-white text-xs font-bold py-3.5 px-4 rounded-xl transition-all shadow-sm flex items-center justify-center gap-2"
          >
            <span>الانتقال إلى إدارة النشاط</span>
            <ArrowRight className="w-4 h-4 rotate-180" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 font-arabic" dir="rtl">
      {/* Header */}
      <div className="flex items-center gap-2 mb-1">
        <button 
          onClick={() => onNavigate('profile')} 
          className="p-2 bg-white rounded-xl border border-slate-200/60 hover:bg-slate-50 transition-all"
        >
          <ArrowRight className="w-4 h-4" />
        </button>
        <div>
          <h1 className="text-sm font-bold text-slate-900">إنشاء نشاط تجاري جديد</h1>
          <p className="text-[10px] text-slate-500">سجل متجرك أو شركتك للتوثيق والتحقق</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-3xl border border-slate-200/60 p-5 space-y-4 shadow-sm">
        {error && (
          <div className="p-3 bg-rose-50 border border-rose-100 rounded-xl text-xs text-rose-800 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Business Name */}
        <div className="space-y-1">
          <label className="text-[11px] font-bold text-slate-700 block">اسم النشاط التجاري <span className="text-rose-500">*</span></label>
          <div className="relative">
            <span className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400">
              <Store className="w-4 h-4" />
            </span>
            <input
              type="text"
              required
              placeholder="مثال: سوبرماركت الأمانة"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full text-xs bg-slate-50 border border-slate-200/80 rounded-xl py-3 pl-3 pr-9 focus:outline-none focus:border-slate-400 focus:bg-white transition-all text-right"
            />
          </div>
        </div>

        {/* Slug / Link identifier */}
        <div className="space-y-1">
          <label className="text-[11px] font-bold text-slate-700 block">معرف الرابط الفريد (Slug) <span className="text-slate-400 font-normal">(اختياري)</span></label>
          <div className="relative">
            <span className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400">
              <Link2 className="w-4 h-4" />
            </span>
            <input
              type="text"
              placeholder="مثال: al-amana-store"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              className="w-full text-xs bg-slate-50 border border-slate-200/80 rounded-xl py-3 pl-3 pr-9 focus:outline-none focus:border-slate-400 focus:bg-white transition-all text-left font-mono"
              dir="ltr"
            />
          </div>
          <p className="text-[9px] text-slate-400 leading-normal">
            سيتم استخدامه في رابط متجرك العام: <code className="font-mono bg-slate-100 px-1 py-0.5 rounded text-[8px]">/b/slug</code>
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {/* Governorate */}
          <div className="space-y-1">
            <label className="text-[11px] font-bold text-slate-700 block">المحافظة <span className="text-rose-500">*</span></label>
            <select
              required
              value={governorate}
              onChange={(e) => setGovernorate(e.target.value)}
              className="w-full text-xs bg-slate-50 border border-slate-200/80 rounded-xl py-3 px-3 focus:outline-none focus:border-slate-400 focus:bg-white transition-all text-right"
            >
              <option value="">اختر المحافظة...</option>
              {GOVERNORATES.map(gov => (
                <option key={gov} value={gov}>{gov}</option>
              ))}
            </select>
          </div>

          {/* City */}
          <div className="space-y-1">
            <label className="text-[11px] font-bold text-slate-700 block">المدينة / المنطقة <span className="text-rose-500">*</span></label>
            <input
              type="text"
              required
              placeholder="مثال: حي الروضة"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className="w-full text-xs bg-slate-50 border border-slate-200/80 rounded-xl py-3 px-3 focus:outline-none focus:border-slate-400 focus:bg-white transition-all text-right"
            />
          </div>
        </div>

        {/* WhatsApp Business Phone */}
        <div className="space-y-1">
          <label className="text-[11px] font-bold text-slate-700 block">رقم واتساب النشاط <span className="text-rose-500">*</span></label>
          <input
            type="tel"
            required
            placeholder="مثال: 967777123456"
            value={whatsapp}
            onChange={(e) => setWhatsapp(e.target.value)}
            className="w-full text-xs bg-slate-50 border border-slate-200/80 rounded-xl py-3 px-3 focus:outline-none focus:border-slate-400 focus:bg-white transition-all text-left font-mono"
            dir="ltr"
          />
          <p className="text-[9px] text-slate-400">يرجى كتابة رقم الهاتف بالصيغة الدولية اليمنية، بدون رمز + أو أصفار إضافية.</p>
        </div>

        {/* Description */}
        <div className="space-y-1">
          <label className="text-[11px] font-bold text-slate-700 block">وصف مختصر للنشاط <span className="text-slate-400 font-normal">(اختياري)</span></label>
          <textarea
            placeholder="اكتب وصفًا للخدمات التي يقدمها متجرك..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="w-full text-xs bg-slate-50 border border-slate-200/80 rounded-xl py-2 px-3 focus:outline-none focus:border-slate-400 focus:bg-white transition-all text-right resize-none"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-[#111111] hover:bg-black text-white text-xs font-bold py-3.5 px-4 rounded-xl transition-all shadow-sm flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>جاري إرسال الطلب...</span>
            </>
          ) : (
            <span>تسجيل وإرسال للمراجعة</span>
          )}
        </button>
      </form>
    </div>
  );
}

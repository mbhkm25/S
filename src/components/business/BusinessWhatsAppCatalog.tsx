import { FormEvent, useEffect, useState } from 'react';
import { AlertCircle, ArrowRight, BookOpen, CheckCircle, ExternalLink, Loader2, Save } from 'lucide-react';
import { BusinessProfile, getUserBusinessContexts, updateBusinessProfile } from '../../lib/businessApi';

interface BusinessWhatsAppCatalogProps {
  onNavigate: (page: string) => void;
}

export default function BusinessWhatsAppCatalog({ onNavigate }: BusinessWhatsAppCatalogProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [business, setBusiness] = useState<BusinessProfile | null>(null);
  const [catalogUrl, setCatalogUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const contexts = await getUserBusinessContexts();
      const current = contexts.owned_businesses?.[0] || null;
      if (!current) {
        throw new Error('فقط مالك النشاط التجاري يمكنه تعديل رابط كتالوج واتساب.');
      }
      setBusiness(current);
      setCatalogUrl((current as any).whatsapp_catalog_url || '');
    } catch (err: any) {
      setError(err.message || 'فشل في تحميل بيانات كتالوج واتساب.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const isValidCatalogUrl = (value: string) => {
    if (!value) return true;
    try {
      const url = new URL(value);
      return url.protocol === 'https:' || url.protocol === 'http:';
    } catch {
      return false;
    }
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!business) return;

    const cleanUrl = catalogUrl.trim();
    setError(null);
    setSuccess(null);

    if (!isValidCatalogUrl(cleanUrl)) {
      setError('أدخل رابطا صحيحا يبدأ بـ https:// أو اترك الحقل فارغا لإزالة الرابط.');
      return;
    }

    setSaving(true);
    try {
      await updateBusinessProfile({
        p_business_id: business.id,
        p_name: business.name,
        p_tagline: (business as any).tagline || null,
        p_description: business.description || null,
        p_category_id: business.category_id || null,
        p_governorate: business.governorate,
        p_city: business.city,
        p_whatsapp: business.whatsapp || null,
        p_address_text: (business as any).address_text || null,
        p_cover_image_path: (business as any).cover_image_path || null,
        p_profile_image_path: (business as any).profile_image_path || business.logo_path || null,
        p_gallery_paths: Array.isArray((business as any).gallery_paths) ? (business as any).gallery_paths : null,
        p_whatsapp_catalog_url: cleanUrl || null
      });

      setSuccess(cleanUrl ? 'تم حفظ رابط كتالوج واتساب بنجاح.' : 'تم إزالة رابط كتالوج واتساب من الملف العام.');
      await loadData();
    } catch (err: any) {
      setError(err.message || 'تعذر حفظ رابط كتالوج واتساب. حاول مرة أخرى.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 space-y-3 font-arabic">
        <Loader2 className="w-6 h-6 text-slate-800 animate-spin" />
        <span className="text-xs text-slate-500">جاري تحميل رابط كتالوج واتساب...</span>
      </div>
    );
  }

  return (
    <div className="space-y-4 font-arabic text-right" dir="rtl">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onNavigate('business-manage')}
          className="p-2 bg-white rounded-lg border border-slate-200 hover:bg-slate-50 transition-all"
          aria-label="رجوع"
        >
          <ArrowRight className="w-4 h-4" />
        </button>
        <div>
          <h1 className="text-lg font-bold text-slate-950 leading-tight">كتالوج واتساب</h1>
          <p className="text-[11px] text-slate-500">مسار مستقل لإضافة رابط الكتالوج فقط</p>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-rose-50 border border-rose-100 text-rose-800 text-xs rounded-lg flex items-start gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-500 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="p-3 bg-emerald-50 border border-emerald-100 text-emerald-800 text-xs rounded-lg flex items-start gap-2">
          <CheckCircle className="w-4 h-4 shrink-0 text-emerald-600 mt-0.5" />
          <span>{success}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="bg-white rounded-lg border border-slate-200 shadow-sm p-4 space-y-4">
        <div className="flex items-start gap-3 pb-3 border-b border-slate-100">
          <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-100 flex items-center justify-center shrink-0">
            <BookOpen className="w-5 h-5" />
          </div>
          <div className="space-y-1">
            <h2 className="text-sm font-bold text-slate-950">{business?.name || 'النشاط التجاري'}</h2>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              ألصق رابط كتالوج واتساب بزنس ليظهر زر الكتالوج في الملف العام للنشاط. هذه الصفحة لا تعدل بيانات الملف أو الوسائط.
            </p>
          </div>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="whatsappCatalogUrl" className="text-[11px] font-bold text-slate-600 block">رابط كتالوج واتساب بزنس</label>
          <input
            id="whatsappCatalogUrl"
            type="text"
            inputMode="url"
            value={catalogUrl}
            onChange={(event) => setCatalogUrl(event.target.value)}
            className="w-full bg-slate-50 border border-slate-200 focus:border-slate-400 focus:bg-white px-3 py-3 rounded-lg text-xs text-slate-900 font-mono outline-none transition-all text-left"
            placeholder="https://wa.me/c/967..."
            dir="ltr"
          />
          <p className="text-[10px] text-slate-400 leading-relaxed">
            اترك الحقل فارغا ثم احفظ لإزالة رابط الكتالوج من الملف العام.
          </p>
        </div>

        {catalogUrl.trim() && isValidCatalogUrl(catalogUrl.trim()) && (
          <a
            href={catalogUrl.trim()}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-[11px] font-bold text-emerald-700 hover:text-emerald-800"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>فتح الرابط للتأكد</span>
          </a>
        )}

        <button
          type="submit"
          disabled={saving || !business}
          className="w-full bg-slate-900 hover:bg-black text-white text-xs font-bold py-3 px-4 rounded-lg transition-all shadow-sm flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          <span>حفظ رابط الكتالوج</span>
        </button>
      </form>
    </div>
  );
}

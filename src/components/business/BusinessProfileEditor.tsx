import React, { useState, useEffect } from 'react';
import { 
  getUserBusinessContexts, 
  updateBusinessProfile, 
  setBusinessProfileMedia,
  uploadBusinessMedia,
  getBusinessMediaSignedUrl,
  BusinessProfile 
} from '../../lib/businessApi';
import { toLatinDigits } from '../../lib/digits';
import { 
  ArrowRight, Save, Loader2, AlertCircle, CheckCircle, 
  UploadCloud, Image, Trash2, Shield, Eye, Settings, MapPin, Plus
} from 'lucide-react';

const GOVERNORATES = [
  'صنعاء', 'عدن', 'حضرموت', 'تعز', 'إب', 'الحديدة', 'ذمار', 'شبوة', 
  'المهرة', 'مأرب', 'الجوف', 'صعدة', 'حجة', 'عمران', 'البيضاء', 
  'لحج', 'أبين', 'الضالع', 'ريمة', 'سقطرى', 'المحويت'
];

interface BusinessProfileEditorProps {
  onNavigate: (page: string) => void;
}

export default function BusinessProfileEditor({ onNavigate }: BusinessProfileEditorProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingField, setUploadingField] = useState<'cover' | 'profile' | 'gallery' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [business, setBusiness] = useState<BusinessProfile | null>(null);

  // Form Fields
  const [name, setName] = useState('');
  const [tagline, setTagline] = useState('');
  const [description, setDescription] = useState('');
  const [governorate, setGovernorate] = useState('');
  const [city, setCity] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [addressText, setAddressText] = useState('');
  const [whatsappCatalogUrl, setWhatsappCatalogUrl] = useState('');
  
  // Media States
  const [profileImagePath, setProfileImagePath] = useState('');
  const [profilePreview, setProfilePreview] = useState('');
  
  const [coverImagePath, setCoverImagePath] = useState('');
  const [coverPreview, setCoverPreview] = useState('');
  
  const [galleryPaths, setGalleryPaths] = useState<string[]>([]);
  const [galleryPreviews, setGalleryPreviews] = useState<string[]>([]);
  
  const [resubmitReview, setResubmitReview] = useState(false);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const contexts = await getUserBusinessContexts();
      const current = contexts.owned_businesses?.[0];
      if (!current) {
        throw new Error('فقط مالك النشاط التجاري يمكنه تعديل الملف التعريفي.');
      }
      setBusiness(current);

      setName(current.name || '');
      setTagline((current as any).tagline || '');
      setDescription(current.description || '');
      setGovernorate(current.governorate || '');
      setCity(current.city || '');
      setWhatsapp(toLatinDigits(current.whatsapp || ''));
      setAddressText((current as any).address_text || '');
      setWhatsappCatalogUrl((current as any).whatsapp_catalog_url || '');
      
      // Load current cover & profile preview URLs
      const profilePath = current.logo_path || '';
      setProfileImagePath(profilePath);
      if (profilePath) {
        const signUrl = await getBusinessMediaSignedUrl(profilePath);
        setProfilePreview(signUrl);
      } else {
        setProfilePreview('');
      }

      const coverPath = (current as any).cover_image_path || '';
      setCoverImagePath(coverPath);
      if (coverPath) {
        const signUrl = await getBusinessMediaSignedUrl(coverPath);
        setCoverPreview(signUrl);
      } else {
        setCoverPreview('');
      }

      const gallery = (current as any).gallery_paths;
      if (Array.isArray(gallery) && gallery.length > 0) {
        setGalleryPaths(gallery);
        const previews = await Promise.all(gallery.map(path => getBusinessMediaSignedUrl(path)));
        setGalleryPreviews(previews.filter(Boolean));
      } else {
        setGalleryPaths([]);
        setGalleryPreviews([]);
      }
    } catch (err: any) {
      setError(err.message || 'فشل في تحميل بيانات النشاط التجاري.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: 'cover' | 'profile' | 'gallery') => {
    const files = e.target.files;
    if (!files || files.length === 0 || !business) return;

    setUploadingField(type);
    setError(null);

    try {
      const file = files[0];
      const result = await uploadBusinessMedia({
        businessId: business.id,
        assetType: type,
        file
      });

      if (type === 'cover') {
        setCoverImagePath(result.path);
        setCoverPreview(result.signedUrl);
      } else if (type === 'profile') {
        setProfileImagePath(result.path);
        setProfilePreview(result.signedUrl);
      } else if (type === 'gallery') {
        if (galleryPaths.length >= 3) {
          throw new Error('يمكنك إضافة حتى 3 صور فقط في معرض الصور.');
        }
        setGalleryPaths(prev => [...prev, result.path]);
        setGalleryPreviews(prev => [...prev, result.signedUrl]);
      }
    } catch (err: any) {
      setError(err.message || 'فشل رفع الصورة. حاول مرة أخرى.');
    } finally {
      setUploadingField(null);
    }
  };

  const handleRemoveGalleryItem = (indexToRemove: number) => {
    setGalleryPaths(prev => prev.filter((_, idx) => idx !== indexToRemove));
    setGalleryPreviews(prev => prev.filter((_, idx) => idx !== indexToRemove));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!business) return;

    setSaving(true);
    setError(null);
    setSuccess(null);

    const cleanWhatsapp = toLatinDigits(whatsapp.trim());
    if (cleanWhatsapp && !/^967\d{9}$/.test(cleanWhatsapp)) {
      setError('رقم الواتساب غير صالح. يجب أن يبدأ بـ 967 متبوعاً بـ 9 أرقام.');
      setSaving(false);
      return;
    }

    try {
      // 1. Update text metadata fields
      await updateBusinessProfile({
        p_business_id: business.id,
        p_name: name.trim(),
        p_tagline: tagline.trim() || null,
        p_description: description.trim() || null,
        p_governorate: governorate,
        p_city: city.trim(),
        p_whatsapp: cleanWhatsapp || null,
        p_address_text: addressText.trim() || null,
        p_whatsapp_catalog_url: whatsappCatalogUrl.trim() || null
      });

      // 2. Update Media linkages via dedicated RPC
      await setBusinessProfileMedia({
        p_business_id: business.id,
        p_cover_image_path: coverImagePath || null,
        p_profile_image_path: profileImagePath || null,
        p_gallery_paths: galleryPaths.length > 0 ? galleryPaths : null,
        p_resubmit_review: resubmitReview
      });

      setSuccess('تم حفظ الملف التعريفي والوسائط بنجاح.');
      setResubmitReview(false);
      await loadData();
    } catch (err: any) {
      setError(err.message || 'تعذر حفظ البيانات. حاول مرة أخرى.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 space-y-3 font-arabic">
        <Loader2 className="w-6 h-6 text-slate-800 animate-spin" />
        <span className="text-xs text-slate-500">جاري تحميل محرر الملف...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 font-arabic text-right min-h-screen bg-slate-50/50 pb-12" dir="rtl">
      {/* Visual Workspace Header */}
      <div className="bg-slate-900 text-white p-6 rounded-b-[2rem] shadow-md space-y-4">
        <div className="flex items-center gap-3">
          <button 
            type="button"
            onClick={() => onNavigate('business-manage')} 
            className="p-2 bg-white/10 hover:bg-white/20 rounded-xl transition-all border border-white/5 text-white"
          >
            <ArrowRight className="w-4 h-4" />
          </button>
          <div>
            <span className="text-[9px] bg-emerald-500/20 text-emerald-300 font-bold px-2 py-0.5 rounded border border-emerald-500/30 uppercase tracking-wider block w-max mb-1">مساحة الأعمال</span>
            <h1 className="text-sm font-bold leading-tight">الملف التعريفي والهوية البصرية</h1>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 space-y-5">
        {error && (
          <div className="p-3 bg-rose-50 border border-rose-100 text-rose-800 text-xs rounded-2xl flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-500 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="p-3 bg-emerald-50 border border-emerald-100 text-emerald-800 text-xs rounded-2xl flex items-start gap-2 animate-scale-up">
            <CheckCircle className="w-4 h-4 shrink-0 text-emerald-600 mt-0.5" />
            <span>{success}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Section: Visual Branding */}
          <div className="bg-white rounded-3xl border border-slate-200/80 p-5 space-y-5 shadow-xs">
            <div className="flex items-center gap-2 pb-2.5 border-b border-slate-100">
              <Image className="w-4.5 h-4.5 text-slate-700" />
              <h2 className="text-xs font-bold text-slate-900">الهوية البصرية للنشاط</h2>
            </div>

            {/* Cover Image Upload */}
            <div className="space-y-2">
              <label className="text-[11px] font-bold text-slate-500 block">صورة الغلاف (أفقية، بحد أقصى 10MB)</label>
              <div className="relative h-32 bg-slate-50 rounded-2xl border border-dashed border-slate-300 overflow-hidden flex items-center justify-center group transition-all hover:bg-slate-100/50">
                {coverPreview ? (
                  <>
                    <img src={coverPreview} alt="Cover Preview" className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <span className="text-white text-[10px] font-bold">تغيير صورة الغلاف</span>
                    </div>
                  </>
                ) : (
                  <div className="text-center space-y-1 p-4">
                    <UploadCloud className="w-8 h-8 text-slate-400 mx-auto" />
                    <p className="text-[10px] text-slate-500">انقر هنا لرفع صورة الغلاف</p>
                  </div>
                )}
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleFileUpload(e, 'cover')}
                  className="absolute inset-0 opacity-0 cursor-pointer"
                  disabled={uploadingField !== null}
                />
                {uploadingField === 'cover' && (
                  <div className="absolute inset-0 bg-white/80 flex items-center justify-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin text-slate-800" />
                    <span className="text-[10px] text-slate-700 font-bold">جاري الرفع...</span>
                  </div>
                )}
              </div>
            </div>

            {/* Profile Logo Upload & Info Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-[11px] font-bold text-slate-500 block">شعار النشاط / صورة البروفايل</label>
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-2xl bg-slate-50 border border-dashed border-slate-300 flex items-center justify-center shrink-0 overflow-hidden relative group">
                    {profilePreview ? (
                      <img src={profilePreview} alt="Logo Preview" className="w-full h-full object-cover" />
                    ) : (
                      <Image className="w-6 h-6 text-slate-400" />
                    )}
                    {uploadingField === 'profile' && (
                      <div className="absolute inset-0 bg-white/80 flex items-center justify-center">
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-800" />
                      </div>
                    )}
                  </div>
                  <div className="space-y-1.5 flex-1 relative">
                    <button
                      type="button"
                      className="bg-slate-900 hover:bg-black text-white text-[10px] font-bold py-2 px-3 rounded-lg transition-all relative overflow-hidden flex items-center gap-1.5"
                    >
                      <UploadCloud className="w-3.5 h-3.5" />
                      <span>اختر الشعار</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => handleFileUpload(e, 'profile')}
                        className="absolute inset-0 opacity-0 cursor-pointer"
                        disabled={uploadingField !== null}
                      />
                    </button>
                    <p className="text-[9px] text-slate-400">تظهر للعملاء في نتائج البحث والتحقق</p>
                  </div>
                </div>
              </div>

              {/* Gallery List (up to 3) */}
              <div className="space-y-2">
                <label className="text-[11px] font-bold text-slate-500 block">معرض صور النشاط ({toLatinDigits(galleryPaths.length)}/3)</label>
                <div className="flex gap-2">
                  {galleryPreviews.map((url, index) => (
                    <div key={index} className="w-14 h-14 rounded-xl bg-slate-100 border border-slate-200 relative group overflow-hidden shadow-2xs">
                      <img src={url} alt="Gallery" className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => handleRemoveGalleryItem(index)}
                        className="absolute inset-0 bg-red-600/80 text-white opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                      >
                        <Trash2 className="w-4.5 h-4.5" />
                      </button>
                    </div>
                  ))}

                  {galleryPaths.length < 3 && (
                    <div className="w-14 h-14 rounded-xl border border-dashed border-slate-350 hover:bg-slate-50 flex items-center justify-center cursor-pointer relative">
                      {uploadingField === 'gallery' ? (
                        <Loader2 className="w-4 h-4 animate-spin text-slate-500" />
                      ) : (
                        <Plus className="w-5 h-5 text-slate-400" />
                      )}
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => handleFileUpload(e, 'gallery')}
                        className="absolute inset-0 opacity-0 cursor-pointer"
                        disabled={uploadingField !== null}
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Section: Text Metadata Details */}
          <div className="bg-white rounded-3xl border border-slate-200/80 p-5 space-y-4 shadow-xs">
            <div className="flex items-center gap-2 pb-2.5 border-b border-slate-100">
              <Settings className="w-4.5 h-4.5 text-slate-700" />
              <h2 className="text-xs font-bold text-slate-900">البيانات التعريفية للنشاط</h2>
            </div>

            {/* Input: Name */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-500 block">اسم النشاط التجاري</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 focus:border-slate-400 focus:bg-white px-3 py-2.5 rounded-xl text-xs text-slate-850 outline-none transition-all"
                placeholder="مثال: بقالة الأمانة، كافيه الفخامة"
              />
            </div>

            {/* Input: Tagline */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-500 block">شعار النشاط / العبارة الترويجية (Tagline)</label>
              <input
                type="text"
                value={tagline}
                onChange={(e) => setTagline(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 focus:border-slate-400 focus:bg-white px-3 py-2.5 rounded-xl text-xs text-slate-850 outline-none transition-all"
                placeholder="عبارة مختصرة تلخص ما تقدمه"
              />
            </div>

            {/* Input: Description */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-500 block">الوصف التفصيلي</label>
              <textarea
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 focus:border-slate-400 focus:bg-white px-3 py-2.5 rounded-xl text-xs text-slate-850 outline-none transition-all resize-none"
                placeholder="اكتب نبذة تفصيلية عن الخدمات والمنتجات التي تقدمها..."
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              {/* Governorate Dropdown */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-500 block">المحافظة</label>
                <select
                  value={governorate}
                  onChange={(e) => setGovernorate(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 focus:border-slate-400 focus:bg-white px-3 py-2.5 rounded-xl text-xs text-slate-850 outline-none transition-all cursor-pointer"
                >
                  <option value="">اختر المحافظة...</option>
                  {GOVERNORATES.map((gov) => (
                    <option key={gov} value={gov}>{gov}</option>
                  ))}
                </select>
              </div>

              {/* City */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-500 block">المدينة / المديرية</label>
                <input
                  type="text"
                  required
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 focus:border-slate-400 focus:bg-white px-3 py-2.5 rounded-xl text-xs text-slate-850 outline-none transition-all"
                  placeholder="مثال: المنصورة، حدة"
                />
              </div>
            </div>

            {/* Input: WhatsApp */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-500 block">رقم الواتساب الخاص بالنشاط</label>
              <input
                type="text"
                required
                value={whatsapp}
                onChange={(e) => setWhatsapp(toLatinDigits(e.target.value))}
                className="w-full bg-slate-50 border border-slate-200 focus:border-slate-400 focus:bg-white px-3 py-2.5 rounded-xl text-xs text-slate-850 font-mono outline-none transition-all text-left"
                placeholder="967777777777"
                dir="ltr"
              />
            </div>

            {/* Input: WhatsApp Catalog URL */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-500 block">رابط كتالوج واتساب بزنس</label>
              <input
                type="text"
                value={whatsappCatalogUrl}
                onChange={(e) => setWhatsappCatalogUrl(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 focus:border-slate-400 focus:bg-white px-3 py-2.5 rounded-xl text-xs text-slate-850 font-mono outline-none transition-all text-left"
                placeholder="https://wa.me/c/967..."
                dir="ltr"
              />
              <p className="text-[9px] text-slate-400 font-arabic">
                ألصق رابط كتالوج واتساب بزنس الخاص بنشاطك. سيظهر للزوار داخل ملفك التجاري في سند.
              </p>
            </div>

            {/* Input: Address text */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-500 block">العنوان النصي المفصل</label>
              <div className="relative">
                <input
                  type="text"
                  value={addressText}
                  onChange={(e) => setAddressText(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 focus:border-slate-400 focus:bg-white px-3 py-2.5 rounded-xl text-xs text-slate-850 outline-none transition-all pr-8"
                  placeholder="مثال: شارع التسعين، بجانب سوبرماركت القمة"
                />
                <MapPin className="w-4 h-4 text-slate-400 absolute right-2.5 top-3" />
              </div>
            </div>
          </div>

          {/* Resubmit Review check */}
          {business?.public_status === 'suspended' && (
            <div className="p-3.5 bg-amber-50 border border-amber-100 rounded-2xl flex items-start gap-2.5">
              <input
                type="checkbox"
                id="resubmitReview"
                checked={resubmitReview}
                onChange={(e) => setResubmitReview(e.target.checked)}
                className="mt-1 border-slate-350 rounded focus:ring-amber-500 h-4 w-4 cursor-pointer"
              />
              <label htmlFor="resubmitReview" className="text-[10px] text-amber-900 leading-normal cursor-pointer select-none">
                <strong>إعادة إرسال الملف للتوثيق:</strong> حدد هذا الخيار لإرسال التحديثات لمديري النظام لإعادة مراجعة نشاطك المعلق.
              </label>
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={saving || uploadingField !== null}
            className="w-full bg-slate-900 hover:bg-black text-white text-xs font-bold py-3.5 px-4 rounded-2xl transition-all shadow-md flex items-center justify-center gap-1.5 disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            <span>حفظ وحفظ التغييرات الهوية</span>
          </button>
        </form>
      </div>
    </div>
  );
}

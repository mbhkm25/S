import { useEffect, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { ArrowRight, Image as ImageIcon, Loader2, Save, UploadCloud } from 'lucide-react';
import {
  getBusinessMediaSignedUrl,
  getUserBusinessContexts,
  setBusinessProfileMedia,
  updateBusinessProfile,
  uploadBusinessMedia,
  type BusinessProfile
} from '../../lib/businessApi';
import {
  getActiveManagedBusinessId,
  getBusinessManagementProfile,
  rememberActiveManagedBusiness,
  type ManagementBusinessProfile
} from '../../lib/businessManagementApi';

interface Props {
  onNavigate: (page: string) => void;
}

type UploadingField = 'cover' | 'profile' | null;

type Draft = {
  name: string;
  tagline: string;
  description: string;
  governorate: string;
  city: string;
  whatsapp: string;
  address: string;
  facebook: string;
  instagram: string;
  twitter: string;
  website: string;
};

const EMPTY_DRAFT: Draft = {
  name: '', tagline: '', description: '', governorate: '', city: '', whatsapp: '',
  address: '', facebook: '', instagram: '', twitter: '', website: ''
};

function normalizeUrl(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function draftFromBusiness(business: ManagementBusinessProfile): Draft {
  return {
    name: business.name || '',
    tagline: business.display_tagline || '',
    description: business.description || '',
    governorate: business.governorate || '',
    city: business.city || '',
    whatsapp: business.whatsapp || '',
    address: business.address_text || '',
    facebook: business.contact_links?.facebook || '',
    instagram: business.contact_links?.instagram || '',
    twitter: business.contact_links?.twitter || business.contact_links?.x || '',
    website: business.contact_links?.website || ''
  };
}

export default function BusinessVisualBrandingEditor({ onNavigate }: Props) {
  const [business, setBusiness] = useState<ManagementBusinessProfile | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [loading, setLoading] = useState(true);
  const [savingMedia, setSavingMedia] = useState(false);
  const [savingDetails, setSavingDetails] = useState(false);
  const [uploading, setUploading] = useState<UploadingField>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [profilePath, setProfilePath] = useState('');
  const [profilePreview, setProfilePreview] = useState('');
  const [coverPath, setCoverPath] = useState('');
  const [coverPreview, setCoverPreview] = useState('');

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const contexts = await getUserBusinessContexts();
      const preferredId = getActiveManagedBusinessId();
      const contextBusiness = (preferredId
        ? contexts.owned_businesses.find((item) => item.id === preferredId)
        : null) || contexts.owned_businesses[0] || null;
      if (!contextBusiness) throw new Error('لا يوجد نشاط مملوك لتعديل بياناته.');
      rememberActiveManagedBusiness(contextBusiness.id);

      const current = await getBusinessManagementProfile(contextBusiness.id);
      setBusiness(current);
      setDraft(draftFromBusiness(current));

      const currentProfilePath = current.profile_image_path || current.logo_path || '';
      const currentCoverPath = current.cover_image_path || '';
      setProfilePath(currentProfilePath);
      setCoverPath(currentCoverPath);

      const [profileUrl, coverUrl] = await Promise.all([
        currentProfilePath ? getBusinessMediaSignedUrl(currentProfilePath) : Promise.resolve(''),
        currentCoverPath ? getBusinessMediaSignedUrl(currentCoverPath) : Promise.resolve('')
      ]);
      setProfilePreview(profileUrl);
      setCoverPreview(coverUrl);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'تعذر تحميل بيانات النشاط.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const updateDraft = (key: keyof Draft, value: string) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const upload = async (event: ChangeEvent<HTMLInputElement>, type: Exclude<UploadingField, null>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !business) return;
    setUploading(type);
    setError(null);
    setSuccess(null);
    try {
      const result = await uploadBusinessMedia({ businessId: business.id, assetType: type, file });
      if (type === 'profile') {
        setProfilePath(result.path);
        setProfilePreview(result.signedUrl);
      } else {
        setCoverPath(result.path);
        setCoverPreview(result.signedUrl);
      }
      setSuccess('تم رفع الصورة. اضغط حفظ الصور لتطبيقها على الملف العام.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'تعذر رفع الصورة.');
    } finally {
      setUploading(null);
    }
  };

  const saveMedia = async (event: FormEvent) => {
    event.preventDefault();
    if (!business) return;
    setSavingMedia(true);
    setError(null);
    setSuccess(null);
    try {
      await setBusinessProfileMedia({
        p_business_id: business.id,
        p_cover_image_path: coverPath || null,
        p_profile_image_path: profilePath || null,
        p_gallery_paths: null,
        p_resubmit_review: false
      });
      setSuccess('تم حفظ صورة البروفايل وصورة الغلاف، وستظهران في الملف العام.');
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'تعذر حفظ الصور.');
    } finally {
      setSavingMedia(false);
    }
  };

  const saveDetails = async (event: FormEvent) => {
    event.preventDefault();
    if (!business) return;
    if (!draft.name.trim() || !draft.governorate.trim() || !draft.city.trim()) {
      setError('اسم النشاط والمحافظة والمدينة بيانات أساسية يجب أن تبقى مكتملة.');
      return;
    }
    setSavingDetails(true);
    setError(null);
    setSuccess(null);
    try {
      await updateBusinessProfile({
        p_business_id: business.id,
        p_name: draft.name.trim(),
        p_tagline: draft.tagline.trim() || null,
        p_description: draft.description.trim() || null,
        p_governorate: draft.governorate.trim(),
        p_city: draft.city.trim(),
        p_whatsapp: draft.whatsapp.trim() || null,
        p_address_text: draft.address.trim() || null,
        p_contact_links: {
          facebook: normalizeUrl(draft.facebook),
          instagram: normalizeUrl(draft.instagram),
          twitter: normalizeUrl(draft.twitter),
          website: normalizeUrl(draft.website)
        }
      });
      setSuccess('تم حفظ بيانات الهوية والتواصل، وستنعكس مباشرة في الملف العام.');
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'تعذر حفظ بيانات الهوية والتواصل.');
    } finally {
      setSavingDetails(false);
    }
  };

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-7 w-7 animate-spin" /></div>;

  const fields: Array<{ key: keyof Draft; label: string; type: string; hint: string }> = [
    { key: 'name', label: 'اسم النشاط', type: 'text', hint: 'يظهر في رأس الملف العام ونتائج مجتمع الأعمال.' },
    { key: 'tagline', label: 'العبارة التعريفية', type: 'text', hint: 'تظهر أسفل اسم النشاط في الملف العام.' },
    { key: 'governorate', label: 'المحافظة', type: 'text', hint: 'تظهر ضمن موقع النشاط في الملف العام.' },
    { key: 'city', label: 'المدينة', type: 'text', hint: 'تظهر ضمن موقع النشاط في الملف العام.' },
    { key: 'whatsapp', label: 'رقم واتساب', type: 'tel', hint: 'يُستخدم في زر التواصل والاستفسار.' },
    { key: 'address', label: 'العنوان التفصيلي', type: 'text', hint: 'يظهر داخل بطاقة الهوية التجارية.' },
    { key: 'facebook', label: 'رابط فيسبوك', type: 'text', hint: 'اختياري؛ يظهر داخل بطاقة الهوية التجارية.' },
    { key: 'instagram', label: 'رابط إنستغرام', type: 'text', hint: 'اختياري؛ يظهر داخل بطاقة الهوية التجارية.' },
    { key: 'twitter', label: 'رابط X / تويتر', type: 'text', hint: 'اختياري؛ يظهر داخل بطاقة الهوية التجارية.' },
    { key: 'website', label: 'الموقع الإلكتروني', type: 'text', hint: 'اختياري؛ يظهر داخل بطاقة الهوية التجارية.' }
  ];

  return (
    <div className="min-h-screen bg-slate-50/60 pb-16 font-arabic text-right" dir="rtl">
      <header className="sticky top-0 z-40 flex items-center gap-3 border-b border-slate-200 bg-white/95 px-2 py-2.5 backdrop-blur sm:px-4">
        <button onClick={() => onNavigate('business-manage')} className="rounded-xl border border-slate-200 p-2.5" aria-label="العودة"><ArrowRight className="h-4 w-4" /></button>
        <div className="min-w-0 flex-1"><h1 className="truncate text-sm font-bold">الهوية البصرية والبيانات العامة</h1><p className="text-[10px] text-slate-400">{business?.name}</p></div>
      </header>

      <main className="mx-auto w-full max-w-2xl space-y-4 px-2 py-3 sm:px-3">
        {error && <div className="rounded-2xl border border-rose-100 bg-rose-50 p-3 text-xs text-rose-700">{error}</div>}
        {success && <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-3 text-xs text-emerald-700">{success}</div>}

        <form onSubmit={saveMedia} className="space-y-4">
          <section className="rounded-3xl border border-slate-200 bg-white p-4 sm:p-5">
            <div className="mb-3"><h2 className="text-sm font-bold">صورة الغلاف</h2><p className="mt-1 text-[10px] leading-5 text-slate-500">تملأ خلفية الواجهة الافتتاحية التي تحتوي على زري استعراض الملف والارتباط بالنشاط.</p></div>
            <label className="relative block aspect-[16/7] cursor-pointer overflow-hidden rounded-2xl border border-dashed border-slate-300 bg-slate-100">
              {coverPreview ? <img src={coverPreview} alt="معاينة صورة الغلاف" className="h-full w-full object-cover" /> : <span className="flex h-full flex-col items-center justify-center gap-2 text-xs text-slate-400"><UploadCloud className="h-7 w-7" />رفع صورة غلاف أفقية</span>}
              <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => void upload(event, 'cover')} className="absolute inset-0 opacity-0" disabled={uploading !== null} />
              {uploading === 'cover' && <span className="absolute inset-0 flex items-center justify-center bg-white/80"><Loader2 className="h-5 w-5 animate-spin" /></span>}
            </label>
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-4 sm:p-5">
            <div className="mb-3"><h2 className="text-sm font-bold">صورة البروفايل / شعار النشاط</h2><p className="mt-1 text-[10px] leading-5 text-slate-500">تظهر فوق الغلاف وفي نتائج مجتمع الأعمال. لأفضل مظهر استخدم شعارًا بصيغة PNG بخلفية شفافة، أو شعارًا واضحًا على خلفية بيضاء.</p></div>
            <div className="flex items-center gap-4">
              <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-3xl border border-slate-200 bg-white">{profilePreview ? <img src={profilePreview} alt="معاينة صورة البروفايل" className="h-full w-full object-contain p-2" /> : <ImageIcon className="h-8 w-8 text-slate-300" />}</div>
              <label className="relative flex cursor-pointer items-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-xs font-bold text-white"><UploadCloud className="h-4 w-4" />اختيار صورة<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => void upload(event, 'profile')} className="absolute inset-0 opacity-0" disabled={uploading !== null} /></label>
              {uploading === 'profile' && <Loader2 className="h-5 w-5 animate-spin" />}
            </div>
          </section>

          <button disabled={savingMedia || uploading !== null} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-900 p-3.5 text-xs font-bold text-white disabled:bg-slate-300">{savingMedia ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}حفظ الصور</button>
        </form>

        <form onSubmit={saveDetails} className="grid gap-3 rounded-3xl border border-slate-200 bg-white p-4 sm:grid-cols-2 sm:p-5">
          <div className="sm:col-span-2"><h2 className="text-sm font-bold">الهوية النصية والتواصل</h2><p className="mt-1 text-[10px] leading-5 text-slate-500">الروابط الاجتماعية اختيارية. يمكنك إضافة رابط فيسبوك وحده دون الحاجة إلى تعبئة بقية الروابط.</p></div>
          {fields.map((field) => <label key={field.key} className="space-y-1.5 text-[10px] font-bold text-slate-600"><span>{field.label}</span><input type={field.type} value={draft[field.key]} onChange={(event) => updateDraft(field.key, event.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs outline-none focus:border-slate-400" /><span className="block font-normal leading-4 text-slate-400">{field.hint}</span></label>)}
          <label className="space-y-1.5 text-[10px] font-bold text-slate-600 sm:col-span-2"><span>وصف النشاط</span><textarea value={draft.description} onChange={(event) => updateDraft('description', event.target.value)} rows={5} maxLength={4000} className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs leading-6 outline-none focus:border-slate-400" /><span className="block font-normal text-slate-400">يظهر داخل بطاقة الهوية التجارية في الملف العام.</span></label>
          <button disabled={savingDetails} className="flex items-center justify-center gap-2 rounded-2xl bg-slate-900 p-3.5 text-xs font-bold text-white disabled:bg-slate-300 sm:col-span-2">{savingDetails ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}حفظ بيانات الهوية والتواصل</button>
        </form>
      </main>
    </div>
  );
}

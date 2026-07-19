import { useEffect, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { ArrowRight, Image as ImageIcon, Loader2, Save, Trash2, UploadCloud } from 'lucide-react';
import {
  getBusinessMediaSignedUrl,
  getUserBusinessContexts,
  setBusinessProfileMedia,
  uploadBusinessMedia,
  type BusinessProfile
} from '../../lib/businessApi';
import { getActiveManagedBusinessId, rememberActiveManagedBusiness } from '../../lib/businessManagementApi';

interface Props {
  onNavigate: (page: string) => void;
}

type UploadingField = 'cover' | 'profile' | 'gallery' | null;

export default function BusinessVisualBrandingEditor({ onNavigate }: Props) {
  const [business, setBusiness] = useState<BusinessProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<UploadingField>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [profilePath, setProfilePath] = useState('');
  const [profilePreview, setProfilePreview] = useState('');
  const [coverPath, setCoverPath] = useState('');
  const [coverPreview, setCoverPreview] = useState('');
  const [galleryPaths, setGalleryPaths] = useState<string[]>([]);
  const [galleryPreviews, setGalleryPreviews] = useState<string[]>([]);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const contexts = await getUserBusinessContexts();
      const preferredId = getActiveManagedBusinessId();
      const current = (preferredId
        ? contexts.owned_businesses.find((item) => item.id === preferredId)
        : null) || contexts.owned_businesses[0] || null;
      if (!current) throw new Error('لا يوجد نشاط مملوك لتعديل هويته البصرية.');
      rememberActiveManagedBusiness(current.id);
      setBusiness(current);

      const currentProfilePath = (current as BusinessProfile & { profile_image_path?: string | null }).profile_image_path || current.logo_path || '';
      const currentCoverPath = (current as BusinessProfile & { cover_image_path?: string | null }).cover_image_path || '';
      const currentGallery = (current as BusinessProfile & { gallery_paths?: string[] | null }).gallery_paths || [];

      setProfilePath(currentProfilePath);
      setCoverPath(currentCoverPath);
      setGalleryPaths(Array.isArray(currentGallery) ? currentGallery : []);

      const [profileUrl, coverUrl, galleryUrls] = await Promise.all([
        currentProfilePath ? getBusinessMediaSignedUrl(currentProfilePath) : Promise.resolve(''),
        currentCoverPath ? getBusinessMediaSignedUrl(currentCoverPath) : Promise.resolve(''),
        Promise.all((Array.isArray(currentGallery) ? currentGallery : []).map((path) => getBusinessMediaSignedUrl(path)))
      ]);
      setProfilePreview(profileUrl);
      setCoverPreview(coverUrl);
      setGalleryPreviews(galleryUrls);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'تعذر تحميل الهوية البصرية.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const upload = async (event: ChangeEvent<HTMLInputElement>, type: Exclude<UploadingField, null>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !business) return;
    if (type === 'gallery' && galleryPaths.length >= 3) {
      setError('الحد الأعلى لمعرض النشاط هو 3 صور.');
      return;
    }
    setUploading(type);
    setError(null);
    setSuccess(null);
    try {
      const result = await uploadBusinessMedia({ businessId: business.id, assetType: type, file });
      if (type === 'profile') {
        setProfilePath(result.path);
        setProfilePreview(result.signedUrl);
      } else if (type === 'cover') {
        setCoverPath(result.path);
        setCoverPreview(result.signedUrl);
      } else {
        setGalleryPaths((current) => [...current, result.path]);
        setGalleryPreviews((current) => [...current, result.signedUrl]);
      }
      setSuccess('تم رفع الصورة. اضغط حفظ لتطبيقها على الملف العام.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'تعذر رفع الصورة.');
    } finally {
      setUploading(null);
    }
  };

  const removeGallery = (index: number) => {
    setGalleryPaths((current) => current.filter((_, itemIndex) => itemIndex !== index));
    setGalleryPreviews((current) => current.filter((_, itemIndex) => itemIndex !== index));
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!business) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await setBusinessProfileMedia({
        p_business_id: business.id,
        p_cover_image_path: coverPath || null,
        p_profile_image_path: profilePath || null,
        p_gallery_paths: galleryPaths.length ? galleryPaths : null,
        p_resubmit_review: false
      });
      setSuccess('تم حفظ صورة البروفايل وصورة الغلاف، وستظهران في الملف العام.');
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'تعذر حفظ الهوية البصرية.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-7 w-7 animate-spin" /></div>;

  return (
    <div className="min-h-screen bg-slate-50/60 pb-16 font-arabic text-right" dir="rtl">
      <header className="sticky top-0 z-40 flex items-center gap-3 border-b border-slate-200 bg-white/95 px-2 py-2.5 backdrop-blur sm:px-4">
        <button onClick={() => onNavigate('business-manage')} className="rounded-xl border border-slate-200 p-2.5" aria-label="العودة"><ArrowRight className="h-4 w-4" /></button>
        <div className="min-w-0 flex-1"><h1 className="truncate text-sm font-bold">الهوية البصرية</h1><p className="text-[10px] text-slate-400">{business?.name}</p></div>
      </header>

      <main className="mx-auto w-full max-w-2xl space-y-4 px-0.5 py-3 sm:px-3">
        {error && <div className="mx-1 rounded-2xl border border-rose-100 bg-rose-50 p-3 text-xs text-rose-700">{error}</div>}
        {success && <div className="mx-1 rounded-2xl border border-emerald-100 bg-emerald-50 p-3 text-xs text-emerald-700">{success}</div>}

        <form onSubmit={save} className="space-y-4">
          <section className="border-y border-slate-200 bg-white p-3 sm:rounded-3xl sm:border sm:p-5">
            <div className="mb-3"><h2 className="text-sm font-bold">صورة الغلاف</h2><p className="mt-1 text-[10px] text-slate-500">تملأ خلفية الواجهة الافتتاحية التي تحتوي على زري استعراض الملف والارتباط بالنشاط.</p></div>
            <label className="relative block aspect-[16/7] cursor-pointer overflow-hidden rounded-2xl border border-dashed border-slate-300 bg-slate-100">
              {coverPreview ? <img src={coverPreview} alt="معاينة صورة الغلاف" className="h-full w-full object-cover" /> : <span className="flex h-full flex-col items-center justify-center gap-2 text-xs text-slate-400"><UploadCloud className="h-7 w-7" />رفع صورة غلاف أفقية</span>}
              <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => void upload(event, 'cover')} className="absolute inset-0 opacity-0" disabled={uploading !== null} />
              {uploading === 'cover' && <span className="absolute inset-0 flex items-center justify-center bg-white/80"><Loader2 className="h-5 w-5 animate-spin" /></span>}
            </label>
          </section>

          <section className="border-y border-slate-200 bg-white p-3 sm:rounded-3xl sm:border sm:p-5">
            <div className="mb-3"><h2 className="text-sm font-bold">صورة البروفايل / شعار النشاط</h2><p className="mt-1 text-[10px] text-slate-500">تظهر فوق الغلاف في الواجهة الافتتاحية، وفي نتائج مجتمع الأعمال.</p></div>
            <div className="flex items-center gap-4">
              <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-3xl border border-slate-200 bg-slate-100">{profilePreview ? <img src={profilePreview} alt="معاينة صورة البروفايل" className="h-full w-full object-cover" /> : <ImageIcon className="h-8 w-8 text-slate-300" />}</div>
              <label className="relative flex cursor-pointer items-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-xs font-bold text-white"><UploadCloud className="h-4 w-4" />اختيار صورة<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => void upload(event, 'profile')} className="absolute inset-0 opacity-0" disabled={uploading !== null} /></label>
              {uploading === 'profile' && <Loader2 className="h-5 w-5 animate-spin" />}
            </div>
          </section>

          <section className="border-y border-slate-200 bg-white p-3 sm:rounded-3xl sm:border sm:p-5">
            <div className="mb-3"><h2 className="text-sm font-bold">معرض صور النشاط</h2><p className="mt-1 text-[10px] text-slate-500">حتى 3 صور إضافية للملف العام.</p></div>
            <div className="flex flex-wrap gap-2">
              {galleryPreviews.map((url, index) => <div key={`${url}-${index}`} className="relative h-20 w-20 overflow-hidden rounded-2xl bg-slate-100"><img src={url} alt="صورة من معرض النشاط" className="h-full w-full object-cover" /><button type="button" onClick={() => removeGallery(index)} className="absolute left-1 top-1 rounded-lg bg-white/90 p-1.5 text-rose-600"><Trash2 className="h-3.5 w-3.5" /></button></div>)}
              {galleryPaths.length < 3 && <label className="relative flex h-20 w-20 cursor-pointer items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50"><UploadCloud className="h-5 w-5 text-slate-400" /><input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => void upload(event, 'gallery')} className="absolute inset-0 opacity-0" disabled={uploading !== null} /></label>}
            </div>
          </section>

          <button disabled={saving || uploading !== null} className="mx-1 flex w-[calc(100%-0.5rem)] items-center justify-center gap-2 rounded-2xl bg-slate-900 p-3.5 text-xs font-bold text-white disabled:bg-slate-300">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}حفظ الهوية البصرية</button>
        </form>
      </main>
    </div>
  );
}

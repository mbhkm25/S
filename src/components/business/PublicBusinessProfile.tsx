import { useState, useEffect } from 'react';
import { 
  getPublicBusinessProfile, joinBusinessAsCustomer, 
  getBusinessMediaSignedUrl,
  PublicBusinessDetail
} from '../../lib/businessApi';
import { 
  ArrowRight, Store, MapPin, MessageSquare, 
  UserCheck, Loader2, AlertCircle, RefreshCw, CheckCircle2,
  ShieldCheck
} from 'lucide-react';
import { toLatinDigits, formatYemeniDisplay } from '../../lib/digits';

interface PublicBusinessProfileProps {
  slug: string;
  onNavigate: (page: string) => void;
}

export default function PublicBusinessProfile({ slug, onNavigate }: PublicBusinessProfileProps) {
  const [loading, setLoading] = useState(true);
  const [linking, setLinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [profile, setProfile] = useState<PublicBusinessDetail | null>(null);
  const [linkedSuccess, setLinkedSuccess] = useState(false);

  // Resolved Signed Media URLs
  const [logoUrl, setLogoUrl] = useState('');
  const [coverUrl, setCoverUrl] = useState('');
  const [galleryUrls, setGalleryUrls] = useState<string[]>([]);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getPublicBusinessProfile(slug);
      setProfile(data);

      // Resolve profile & cover signed URLs
      const profilePath = (data as any).profile_image_path || (data as any).logo_path || data.logo_url || '';
      if (profilePath) {
        const sign = await getBusinessMediaSignedUrl(profilePath);
        setLogoUrl(sign);
      } else {
        setLogoUrl('');
      }

      const coverPath = (data as any).cover_image_path || '';
      if (coverPath) {
        const sign = await getBusinessMediaSignedUrl(coverPath);
        setCoverUrl(sign);
      } else {
        setCoverUrl('');
      }

      const gallery = (data as any).gallery_paths || [];
      if (Array.isArray(gallery) && gallery.length > 0) {
        const signs = await Promise.all(gallery.map(p => getBusinessMediaSignedUrl(p)));
        setGalleryUrls(signs.filter(Boolean));
      } else {
        setGalleryUrls([]);
      }
    } catch (err: any) {
      setError(err.message || 'فشل في تحميل الملف التجاري.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [slug]);

  const handleJoinAsCustomer = async () => {
    if (!profile) return;
    setLinking(true);
    setError(null);
    try {
      await joinBusinessAsCustomer(profile.id, 'profile');
      setLinkedSuccess(true);
    } catch (err: any) {
      setError(err.message || 'فشل الارتباط بالنشاط التجاري.');
    } finally {
      setLinking(false);
    }
  };


  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 space-y-3 font-arabic">
        <Loader2 className="w-6 h-6 text-slate-800 animate-spin" />
        <span className="text-xs text-slate-500">جاري تحميل ملف النشاط التجاري...</span>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="bg-white rounded-3xl border border-slate-200/60 p-5 space-y-4 shadow-sm font-arabic text-center">
        <AlertCircle className="w-10 h-10 text-rose-500 mx-auto" />
        <div className="space-y-1">
          <h2 className="text-sm font-bold text-slate-900">حدث خطأ أثناء تحميل الملف التجاري</h2>
          <p className="text-xs text-slate-500">{error || 'لم يتم العثور على الملف التجاري المطلوب.'}</p>
        </div>
        <button
          onClick={loadData}
          className="inline-flex items-center gap-1.5 text-xs text-slate-700 hover:text-black font-bold border border-slate-200 hover:bg-slate-50 px-4 py-2 rounded-xl transition-all"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>إعادة المحاولة</span>
        </button>
      </div>
    );
  }

  const isVerified = profile.verification_status === 'verified';
  const tagline = (profile as any).tagline || '';
  return (
    <div className="space-y-5 font-arabic text-right pb-10" dir="rtl">
      {/* Header */}
      <div className="flex items-center gap-2">
        <button 
          onClick={() => onNavigate('business-community')} 
          className="p-2 bg-white rounded-xl border border-slate-200/60 hover:bg-slate-50 transition-all"
        >
          <ArrowRight className="w-4 h-4" />
        </button>
        <div>
          <h1 className="text-sm font-bold text-slate-900">{profile.name}</h1>
          <p className="text-[10px] text-slate-500">تفاصيل النشاط والخدمات الموثقة بسند</p>
        </div>
      </div>

      {/* Profile Cover & Header Section */}
      <div className="bg-white rounded-3xl border border-slate-200/60 shadow-sm overflow-hidden">
        {/* Cover image container */}
        <div className="h-36 bg-slate-105 relative">
          {coverUrl ? (
            <img src={coverUrl} alt="Cover" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full bg-gradient-to-r from-slate-900 via-slate-850 to-slate-950 flex items-center justify-center">
              <span className="text-[10px] text-slate-400 tracking-widest font-mono uppercase">Sanad Certified Business</span>
            </div>
          )}
          {isVerified && (
            <div className="absolute top-3 left-3 bg-slate-950/80 text-white border border-slate-750 px-2.5 py-0.5 rounded-full text-[8px] font-bold backdrop-blur-xs flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>موثق بالكامل</span>
            </div>
          )}
        </div>

        {/* Profile Details Container */}
        <div className="px-5 pb-5 pt-1.5 relative space-y-4">
          {/* Logo overlay */}
          <div className="absolute -top-10 right-5 w-16 h-16 rounded-2xl bg-white p-1 border border-slate-200/80 shadow-md overflow-hidden">
            {logoUrl ? (
              <img src={logoUrl} alt="Logo" className="w-full h-full object-cover rounded-xl" />
            ) : (
              <div className="w-full h-full bg-slate-900 text-white flex items-center justify-center font-bold text-lg rounded-xl">
                {profile.name.slice(0, 1)}
              </div>
            )}
          </div>

          {/* Spacer for logo */}
          <div className="h-6" />

          {/* Business Details */}
          <div className="space-y-1">
            <h2 className="text-sm font-bold text-slate-950 leading-tight">{profile.name}</h2>
            {tagline && (
              <p className="text-[10px] text-slate-500 leading-snug">{tagline}</p>
            )}
            <div className="flex items-center gap-1 text-[10px] text-slate-400">
              <MapPin className="w-3 h-3 text-slate-300" />
              <span>{profile.city}، {profile.governorate}</span>
            </div>
          </div>

          {profile.description && (
            <p className="text-xs text-slate-600 leading-relaxed pt-1.5 border-t border-slate-100">{profile.description}</p>
          )}

          {/* Grid Metadata */}
          <div className="grid grid-cols-2 gap-4 bg-slate-50 p-3 rounded-2xl border border-slate-150 text-[10px]">
            <div className="space-y-0.5">
              <span className="text-slate-400 block font-arabic">تصنيف النشاط</span>
              <span className="font-bold text-slate-800 font-arabic">{profile.category_name || 'أعمال وخدمات مالية'}</span>
            </div>
            <div className="space-y-0.5">
              <span className="text-slate-400 block font-arabic">حساب واتساب الشريك</span>
              <span className="font-bold text-slate-800 font-mono" dir="ltr">{toLatinDigits(formatYemeniDisplay(profile.whatsapp))}</span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-2 pt-2 border-t border-slate-100">
            {linkedSuccess ? (
              <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-2xl text-[10px] text-emerald-800 font-bold flex items-center justify-center gap-1.5 animate-scale-up">
                <CheckCircle2 className="w-4.5 h-4.5 text-emerald-600" />
                <span>تم الارتباط بنجاح كعميل مسجل للنشاط.</span>
              </div>
            ) : (
              <button
                onClick={handleJoinAsCustomer}
                disabled={linking}
                className="w-full bg-[#111111] hover:bg-black text-white text-xs font-bold py-3 px-4 rounded-xl transition-all shadow-sm flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                {linking ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <UserCheck className="w-4 h-4" />
                    <span>الارتباط كعميل مسجل</span>
                  </>
                )}
              </button>
            )}

            <div className="flex gap-2">
              {profile.whatsapp && (
                <a
                  href={`https://wa.me/${profile.whatsapp}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full bg-emerald-50 hover:bg-emerald-100 border border-emerald-100 text-emerald-700 text-xs font-bold py-2.5 px-4 rounded-xl transition-all flex items-center justify-center gap-1.5 animate-scale-up"
                >
                  <MessageSquare className="w-4 h-4" />
                  <span>تواصل عبر واتساب</span>
                </a>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* WhatsApp Catalog Section */}
      {profile.whatsapp_catalog_url && (
        <div className="bg-white rounded-3xl border border-slate-200/60 p-5 shadow-sm space-y-4">
          <div className="flex items-center gap-2.5 pb-3 border-b border-slate-100">
            <div className="w-9 h-9 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-700 border border-emerald-100/50">
              <Store className="w-4 h-4" />
            </div>
            <div className="text-right flex-1">
              <h3 className="text-xs font-bold text-slate-900 font-arabic">كتالوج واتساب بزنس</h3>
              <p className="text-[10px] text-slate-400 font-arabic leading-normal mt-0.5">استعرض المنتجات والخدمات مباشرة عبر كتالوج واتساب بزنس الخاص بالنشاط.</p>
            </div>
          </div>
          
          <a
            href={profile.whatsapp_catalog_url}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full bg-emerald-600 hover:bg-emerald-750 text-white text-xs font-bold py-3.5 px-4 rounded-xl transition-all flex items-center justify-center gap-2"
          >
            <span>عرض الكتالوج على واتساب</span>
          </a>
        </div>
      )}

      {/* Gallery Section */}
      {galleryUrls && galleryUrls.length > 0 && (
        <div className="bg-white rounded-3xl border border-slate-200/60 p-5 shadow-sm space-y-3">
          <h3 className="text-xs font-bold text-slate-900 font-arabic pb-1 border-b border-slate-100">معرض الصور</h3>
          <div className="grid grid-cols-3 gap-2">
            {galleryUrls.map((url: string, idx: number) => (
              <div key={idx} className="h-20 bg-slate-50 border border-slate-100 rounded-xl overflow-hidden shadow-2xs">
                <img src={url} alt={`Gallery ${idx}`} className="w-full h-full object-cover" />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

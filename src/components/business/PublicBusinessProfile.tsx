import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import {
  getPublicBusinessProfile,
  joinBusinessAsCustomer,
  getBusinessMediaSignedUrl,
  getUserBusinessContexts,
  updateBusinessProfile,
  PublicBusinessDetail
} from '../../lib/businessApi';
import { INTERNAL_BUSINESS_CATALOG_ENABLED } from '../../lib/urlUtils';
import {
  ArrowRight,
  Store,
  MapPin,
  MessageSquare,
  UserCheck,
  Loader2,
  AlertCircle,
  RefreshCw,
  CheckCircle2,
  ShieldCheck,
  ShoppingBag,
  Wrench,
  Clock,
  Globe,
  Copy,
  Facebook,
  Instagram,
  Twitter,
  Plus,
  Send,
  AlertTriangle,
  Image as ImageIcon
} from 'lucide-react';

interface PublicBusinessProfileProps {
  slug: string;
  onNavigate: (page: string, token?: string) => void;
  initialTab?: TabType;
}

type TabType = 'overview' | 'products' | 'services' | 'financial' | 'complaints';

// Sub-component for product card to comply with React Hooks Rules
function PublicProductCardItem({
  prod,
  businessSlug,
  onNavigate
}: {
  prod: any;
  businessSlug: string;
  onNavigate: (page: string, token?: string) => void;
  key?: any;
}) {
  const [imgUrl, setImgUrl] = useState('');

  useEffect(() => {
    let active = true;
    if (prod.image_path) {
      getBusinessMediaSignedUrl(prod.image_path).then((url) => {
        if (active) setImgUrl(url);
      });
    } else {
      setImgUrl('');
    }
    return () => {
      active = false;
    };
  }, [prod.image_path]);

  return (
    <button
      onClick={() => onNavigate('public-product-detail', `${businessSlug}/${prod.id}`)}
      className="w-full bg-white border border-slate-200/80 rounded-2xl overflow-hidden text-right transition-all flex flex-col hover:border-slate-350 active:scale-[0.98] shadow-3xs hover:shadow-2xs text-slate-800"
    >
      <div className="w-full aspect-square bg-slate-50 border-b border-slate-100 relative shrink-0">
        {imgUrl ? (
          <img
            src={imgUrl}
            alt={prod.name}
            className="w-full h-full object-cover object-center"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <ImageIcon className="w-6 h-6 text-slate-300" />
          </div>
        )}
      </div>

      <div className="p-3 flex-1 flex flex-col justify-between space-y-1.5 w-full min-w-0">
        <div className="space-y-0.5 min-w-0">
          <h4 className="text-xs font-bold text-slate-900 line-clamp-2 leading-tight">
            {prod.name}
          </h4>
          {prod.description && (
            <p className="text-[10px] text-slate-450 line-clamp-1 leading-normal">
              {prod.description}
            </p>
          )}
        </div>

        <div className="flex items-baseline justify-between gap-1 flex-wrap pt-0.5 border-t border-slate-50 w-full">
          <span className="text-xs font-extrabold text-indigo-700 font-mono">
            {prod.price ? `${prod.price}` : 'السعر عند الطلب'}
          </span>
        </div>
      </div>
    </button>
  );
}

// Sub-component for service card to comply with React Hooks Rules
function PublicServiceCardItem({ serv, whatsapp }: { serv: any; whatsapp: string; key?: any }) {
  const [imgUrl, setImgUrl] = useState('');

  useEffect(() => {
    let active = true;
    if (serv.image_path) {
      getBusinessMediaSignedUrl(serv.image_path).then((url) => {
        if (active) setImgUrl(url);
      });
    } else {
      setImgUrl('');
    }
    return () => {
      active = false;
    };
  }, [serv.image_path]);

  const rawMsg = `مرحباً، أود طلب الخدمة: ${serv.name} المعروضة في صفحتكم على سند.`;
  const requestUrl = `https://wa.me/${whatsapp}?text=${encodeURIComponent(rawMsg)}`;

  return (
    <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-2xl flex gap-3 shadow-2xs hover:border-slate-350 transition-all">
      <div className="w-16 h-16 rounded-xl bg-white border border-slate-200 shrink-0 overflow-hidden shadow-3xs flex items-center justify-center">
        {imgUrl ? (
          <img src={imgUrl} alt={serv.name} className="w-full h-full object-cover" />
        ) : (
          <ImageIcon className="w-5 h-5 text-slate-350" />
        )}
      </div>

      <div className="flex-1 space-y-1 text-right min-w-0 flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-slate-900 truncate">{serv.name}</h4>
            {serv.price && <span className="text-[9px] font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded shrink-0">{serv.price}</span>}
          </div>
          <p className="text-[10px] text-slate-550 line-clamp-1">{serv.description}</p>
        </div>

        <div className="pt-2 flex justify-end">
          <a
            href={requestUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1 bg-[#111111] text-white rounded-lg hover:bg-black text-[9px] font-bold transition-all shadow-sm"
          >
            <Wrench className="w-3 h-3" />
            <span>طلب الخدمة الآن</span>
          </a>
        </div>
      </div>
    </div>
  );
}

export default function PublicBusinessProfile({ slug, onNavigate, initialTab }: PublicBusinessProfileProps) {
  const [loading, setLoading] = useState(true);
  const [linking, setLinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [profile, setProfile] = useState<PublicBusinessDetail | null>(null);
  const [linkedSuccess, setLinkedSuccess] = useState(false);
  const [isCustomer, setIsCustomer] = useState(false);

  // Resolved Signed Media URLs
  const [logoUrl, setLogoUrl] = useState('');
  const [coverUrl, setCoverUrl] = useState('');
  const [galleryUrls, setGalleryUrls] = useState<string[]>([]);

  // Tabs
  const [activeTab, setActiveTab] = useState<TabType>(
    initialTab === 'products' && !INTERNAL_BUSINESS_CATALOG_ENABLED ? 'overview' : (initialTab || 'overview')
  );

  useEffect(() => {
    if (initialTab) {
      if (initialTab === 'products' && !INTERNAL_BUSINESS_CATALOG_ENABLED) {
        setActiveTab('overview');
      } else {
        setActiveTab(initialTab);
      }
    }
  }, [initialTab]);

  // Working Status
  const [openStatus, setOpenStatus] = useState<{ open: boolean; text: string } | null>(null);

  // Complaint form states
  const [visitorName, setVisitorName] = useState('');
  const [visitorPhone, setVisitorPhone] = useState('');
  const [complaintText, setComplaintText] = useState('');
  const [localComplaints, setLocalComplaints] = useState<any[]>([]);

  const DAYS_AR: Record<string, string> = {
    saturday: 'السبت',
    sunday: 'الأحد',
    monday: 'الاثنين',
    tuesday: 'الثلاثاء',
    wednesday: 'الأربعاء',
    thursday: 'الخميس',
    friday: 'الجمعة'
  };

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getPublicBusinessProfile(slug);

      const mergedProfile = data;
      setProfile(mergedProfile);

      const contexts = await getUserBusinessContexts().catch(() => null);
      setIsCustomer(!!contexts?.customer_businesses?.find((biz: any) => biz.id === mergedProfile.id));

      // Resolve profile & cover signed URLs
      const profilePath = (mergedProfile as any).profile_image_path || (mergedProfile as any).logo_path || mergedProfile.logo_url || '';
      if (profilePath) {
        const sign = await getBusinessMediaSignedUrl(profilePath);
        setLogoUrl(sign);
      } else {
        setLogoUrl('');
      }

      const coverPath = (mergedProfile as any).cover_image_path || '';
      if (coverPath) {
        const sign = await getBusinessMediaSignedUrl(coverPath);
        setCoverUrl(sign);
      } else {
        setCoverUrl('');
      }

      const gallery = (mergedProfile as any).gallery_paths || [];
      if (Array.isArray(gallery) && gallery.length > 0) {
        const signs = await Promise.all(gallery.map(p => getBusinessMediaSignedUrl(p)));
        setGalleryUrls(signs.filter(Boolean));
      } else {
        setGalleryUrls([]);
      }

      // Check Opening Status
      const hours = (mergedProfile as any).working_hours;
      if (hours && typeof hours === 'object' && Object.keys(hours).length > 0) {
        const status = checkOpeningStatus(hours);
        setOpenStatus(status);
      }

      // Load local complaints history from localStorage
      const cached = localStorage.getItem(`local_complaints_${mergedProfile.id}`);
      if (cached) {
        setLocalComplaints(JSON.parse(cached));
      }

    } catch (err: any) {
      setError(err.message || 'فشل في تحميل الملف التجاري.');
      setIsCustomer(false);
    } finally {
      setLoading(false);
    }
  };

  const checkOpeningStatus = (hours: any) => {
    const daysEn = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const now = new Date();
    const dayName = daysEn[now.getDay()];
    const todayHours = hours[dayName];

    if (!todayHours || todayHours.closed) return { open: false, text: 'مغلق حالياً' };

    const currentTimeStr = now.toTimeString().slice(0, 5); // "HH:MM"
    const { open, close } = todayHours;

    if (currentTimeStr >= open && currentTimeStr <= close) {
      return { open: true, text: `مفتوح الآن (حتى ${close})` };
    }
    return { open: false, text: `مغلق حالياً (يفتح عند ${open})` };
  };

  useEffect(() => {
    loadData();
  }, [slug]);

  const handleJoinBusiness = async () => {
    if (!profile) return;
    setLinking(true);
    setError(null);
    try {
      await joinBusinessAsCustomer(profile.id, 'public_profile');
      setLinkedSuccess(true);
      setIsCustomer(true);
    } catch (err: any) {
      setError(err.message || 'فشل الارتباط بالنشاط التجاري.');
    } finally {
      setLinking(false);
    }
  };

  // Submit Complaint via WhatsApp Prefilled Text & Log in Database / localStorage
  const handleComplaintSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;

    const messageText = complaintText.trim();
    const name = visitorName.trim();
    const phone = visitorPhone.trim();

    if (!messageText || !name || !phone) return;

    // 1. Submit to database via RPC submit_business_complaint
    try {
      const { data: rpcData, error: rpcErr } = await supabase.rpc('submit_business_complaint', {
        p_business_id: profile.id,
        p_name: name,
        p_phone: phone,
        p_text: messageText
      });

      if (rpcErr) {
        console.warn('RPC submit_business_complaint failed, fallback to local storage only:', rpcErr);
      }
    } catch (dbErr) {
      console.warn('Database complaint submission failed:', dbErr);
    }

    // 2. Save to local storage complaint log
    const newComplaint = {
      id: `local_comp_${Date.now()}`,
      name,
      phone,
      text: messageText,
      created_at: new Date().toISOString(),
      status: 'pending'
    };

    const updated = [newComplaint, ...localComplaints];
    setLocalComplaints(updated);
    localStorage.setItem(`local_complaints_${profile.id}`, JSON.stringify(updated));

    // 3. Construct WhatsApp message
    const waText = `مرحباً، أود تقديم شكوى بخصوص المعاملات مع نشاطكم التجاري.\n\nالاسم: ${name}\nالهاتف: ${phone}\nالشكوى:\n${messageText}`;
    const cleanPhone = profile.whatsapp || '';
    const whatsappUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(waText)}`;

    // Reset inputs
    setComplaintText('');
    setVisitorName('');
    setVisitorPhone('');
    setSuccess('تم تسجيل الشكوى وإرسالها للمالك عبر واتساب بزنس.');
    setTimeout(() => setSuccess(null), 5000);

    // Open WhatsApp
    window.open(whatsappUrl, '_blank');
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-3 font-arabic text-right">
        <Loader2 className="w-6 h-6 text-slate-800 animate-spin" />
        <span className="text-xs text-slate-500">جاري تحميل ملف العمل...</span>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="max-w-md mx-auto my-12 p-6 bg-white border border-slate-200/60 rounded-3xl text-center space-y-4 font-arabic text-right">
        <AlertTriangle className="w-8 h-8 text-rose-500 mx-auto" />
        <p className="text-xs text-slate-600">{error || 'لم يتم العثور على هذا النشاط التجاري.'}</p>
        <button
          onClick={() => onNavigate('business-community')}
          className="inline-flex items-center gap-1.5 text-xs text-indigo-700 font-bold hover:underline"
        >
          <ArrowRight className="w-4 h-4" />
          <span>الرجوع لدليل مجتمع الأعمال</span>
        </button>
      </div>
    );
  }

  const products = profile.profile_sections?.products || [];
  const services = profile.profile_sections?.services || [];
  const financialAccounts = profile.profile_sections?.financial_accounts || [];
  const socials = (profile as any).contact_links || {};

  return (
    <div className="min-h-screen bg-slate-50/45 pb-16 font-arabic text-right" dir="rtl">
      {/* Upper Cover photo with glass effect */}
      <div className="relative h-48 md:h-64 bg-slate-200 overflow-hidden border-b border-slate-200/50">
        {coverUrl ? (
          <img src={coverUrl} alt="Cover" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full bg-gradient-to-r from-slate-100 to-slate-200" />
        )}

        {/* Back navigation */}
        <button
          onClick={() => onNavigate('business-community')}
          className="absolute top-4 right-4 p-2 bg-white/80 hover:bg-white backdrop-blur-md border border-slate-200/50 rounded-xl transition-all shadow-sm"
        >
          <ArrowRight className="w-4 h-4 text-slate-800" />
        </button>

        {/* Live working hours badge */}
        {openStatus && (
          <div className="absolute bottom-4 right-4">
            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold shadow-md border ${
              openStatus.open
                ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
                : 'bg-rose-50 text-rose-700 border-rose-100'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${openStatus.open ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
              <span>{openStatus.text}</span>
            </span>
          </div>
        )}
      </div>

      <div className="max-w-4xl mx-auto px-4 -mt-16 relative z-10 space-y-6">
        {/* Profile Card Info */}
        <div className="bg-white border border-slate-200/60 rounded-3xl p-6 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row items-center sm:items-start justify-between gap-4 text-center sm:text-right">
            <div className="flex flex-col sm:flex-row items-center gap-4">
              {/* Logo wrapper */}
              <div className="w-24 h-24 rounded-2xl bg-white border border-slate-200/80 overflow-hidden shadow-sm shrink-0 flex items-center justify-center -mt-20">
                {logoUrl ? (
                  <img src={logoUrl} alt={profile.name} className="w-full h-full object-cover" />
                ) : (
                  <Store className="w-8 h-8 text-slate-400" />
                )}
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-center sm:justify-start gap-1.5">
                  <h1 className="text-base font-bold text-slate-900 leading-tight">{profile.name}</h1>
                  {profile.verification_status === 'verified' && (
                    <ShieldCheck className="w-4.5 h-4.5 text-emerald-600 shrink-0" />
                  )}
                </div>
                <p className="text-[11px] text-slate-500">
                  {profile.category_name || 'خدمات وأعمال عامة'}
                </p>
                <div className="flex items-center justify-center sm:justify-start gap-1 text-[10px] text-slate-400">
                  <MapPin className="w-3.5 h-3.5 text-slate-350" />
                  <span>{profile.city}، {profile.governorate}</span>
                </div>
              </div>
            </div>

            {/* Link Customer CTA */}
            <div className="shrink-0 w-full sm:w-auto">
              {isCustomer ? (
                <div className="bg-emerald-50 text-emerald-700 border border-emerald-100/60 px-4 py-2.5 rounded-2xl text-[10px] font-bold flex items-center justify-center gap-2 shadow-3xs">
                  <UserCheck className="w-4.5 h-4.5 text-emerald-600" />
                  <span>أنت مرتبط بهذا النشاط التجاري</span>
                </div>
              ) : (
                <button
                  onClick={handleJoinBusiness}
                  disabled={linking}
                  className="w-full bg-slate-900 hover:bg-black text-white text-[10px] font-bold py-2.5 px-5 rounded-2xl transition-all shadow-sm flex items-center justify-center gap-1.5"
                >
                  {linking ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                  <span>ارتباط كعميل مع هذا النشاط</span>
                </button>
              )}
            </div>
          </div>

          <p className="text-xs text-slate-655 leading-relaxed pt-2 border-t border-slate-100">
            {profile.description || 'شريك التحقق المالي المعزز عبر منصة سند.'}
          </p>

          {/* Social Media Link Buttons (NEW) */}
          {(socials.facebook || socials.instagram || socials.twitter || socials.website || profile.whatsapp || profile.whatsapp_catalog_url) && (
            <div className="flex flex-wrap gap-2 pt-3 border-t border-slate-100 justify-center sm:justify-start">
              {socials.facebook && (
                <a
                  href={socials.facebook}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 border border-slate-200 text-slate-700 hover:text-blue-600 hover:bg-white rounded-xl text-[10px] font-bold transition-all"
                >
                  <Facebook className="w-3.5 h-3.5 text-blue-600 fill-blue-600" />
                  <span>فيسبوك</span>
                </a>
              )}
              {socials.instagram && (
                <a
                  href={socials.instagram}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 border border-slate-200 text-slate-700 hover:text-pink-600 hover:bg-white rounded-xl text-[10px] font-bold transition-all"
                >
                  <Instagram className="w-3.5 h-3.5 text-pink-600" />
                  <span>إنستغرام</span>
                </a>
              )}
              {socials.twitter && (
                <a
                  href={socials.twitter}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 border border-slate-200 text-slate-700 hover:text-sky-500 hover:bg-white rounded-xl text-[10px] font-bold transition-all"
                >
                  <Twitter className="w-3.5 h-3.5 text-sky-500 fill-sky-500" />
                  <span>تويتر / X</span>
                </a>
              )}
              {socials.website && (
                <a
                  href={socials.website}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 border border-slate-200 text-slate-700 hover:text-indigo-600 hover:bg-white rounded-xl text-[10px] font-bold transition-all"
                >
                  <Globe className="w-3.5 h-3.5 text-slate-650" />
                  <span>الموقع الإلكتروني</span>
                </a>
              )}
              {profile.whatsapp && (
                <a
                  href={`https://wa.me/${profile.whatsapp}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 border border-emerald-100 text-emerald-700 hover:bg-emerald-100/70 rounded-xl text-[10px] font-bold transition-all"
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  <span>تواصل سريع</span>
                </a>
              )}
              {profile.whatsapp_catalog_url && (
                <a
                  href={profile.whatsapp_catalog_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 border border-emerald-100 text-emerald-700 hover:bg-emerald-100/70 rounded-xl text-[10px] font-bold transition-all"
                >
                  <ShoppingBag className="w-3.5 h-3.5" />
                  <span>كتالوج واتساب</span>
                </a>
              )}
            </div>
          )}
        </div>

        {/* Tab Buttons Navigation */}
        <div className="bg-white/80 backdrop-blur-md border border-slate-200/50 rounded-2xl p-2 flex overflow-x-auto no-scrollbar gap-1 shadow-2xs">
          {[
            { id: 'overview', label: 'لوحة النشاط والمعلومات', icon: Store },
            { id: 'products', label: 'كتالوج المنتجات المعروضة', icon: ShoppingBag },
            { id: 'services', label: 'الخدمات المتاحة للطلب', icon: Wrench },
            { id: 'financial', label: 'الحسابات المالية للتحويل', icon: Globe },
            { id: 'complaints', label: 'صندوق الشكاوى والملاحظات', icon: AlertTriangle }
          ].filter(tab => tab.id !== 'products' || INTERNAL_BUSINESS_CATALOG_ENABLED).map((tab) => {
            const Icon = tab.icon;
            const isSelected = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as TabType)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-bold transition-all shrink-0 ${
                  isSelected
                    ? 'bg-slate-900 text-white shadow-sm'
                    : 'text-slate-600 hover:bg-slate-100/80 hover:text-slate-900'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Status messages */}
        {success && (
          <div className="p-3 bg-emerald-50 border border-emerald-100 text-emerald-800 text-[11px] rounded-2xl flex items-center gap-2 animate-scale-up">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>{success}</span>
          </div>
        )}

        {/* TAB: OVERVIEW */}
        {activeTab === 'overview' && (
          <div className="space-y-6 animate-fade-in">
            {/* Gallery Section */}
            {galleryUrls.length > 0 && (
              <div className="bg-white border border-slate-200/60 rounded-3xl p-5 shadow-xs space-y-3">
                <h3 className="text-xs font-bold text-slate-900">معرض صور النشاط التجاري</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {galleryUrls.map((url, i) => (
                    <div key={i} className="aspect-video bg-slate-100 rounded-xl overflow-hidden border border-slate-200 shadow-3xs hover:opacity-90 transition-all cursor-pointer">
                      <img src={url} alt={`gallery-${i}`} className="w-full h-full object-cover" />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Working Hours detail */}
            <div className="bg-white border border-slate-200/60 rounded-3xl p-5 shadow-xs space-y-3">
              <h3 className="text-xs font-bold text-slate-900 flex items-center gap-2">
                <Clock className="w-4 h-4 text-slate-700" />
                <span>مواعيد وساعات العمل الأسبوعية</span>
              </h3>

              {profile.working_hours && Object.keys(profile.working_hours).length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                  {Object.entries(profile.working_hours).map(([day, val]: [string, any]) => (
                    <div key={day} className="flex justify-between items-center bg-slate-50 border border-slate-200/50 p-2.5 rounded-xl text-xs">
                      <span className="font-bold text-slate-950">{DAYS_AR[day]}</span>
                      {val.closed ? (
                        <span className="text-[10px] text-slate-400 bg-slate-100 px-2 py-0.5 rounded border border-slate-200/50 font-bold">عطلة نهاية الأسبوع</span>
                      ) : (
                        <span className="font-mono text-slate-700" dir="ltr">{val.open} - {val.close}</span>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[10px] text-slate-400">لم يتم تحديد مواعيد العمل بعد.</p>
              )}
            </div>
          </div>
        )}

        {/* TAB: PRODUCTS */}
        {activeTab === 'products' && INTERNAL_BUSINESS_CATALOG_ENABLED && (
          <div className="space-y-6 animate-fade-in">
            <div className="bg-white border border-slate-200/60 rounded-3xl p-5 shadow-xs space-y-4">
              <div className="pb-3 border-b border-slate-100 flex items-center justify-between">
                <h3 className="text-xs font-bold text-slate-900">كتالوج السلع والمنتجات</h3>
                {(profile as any).whatsapp_catalog_url && (
                  <a
                    href={(profile as any).whatsapp_catalog_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-700 border border-emerald-150 rounded-xl text-[9px] font-bold"
                  >
                    <span>تصفح الكاتلوج على واتساب</span>
                  </a>
                )}
              </div>

              {products.length === 0 ? (
                <div className="p-12 text-center text-slate-400 text-xs">لا توجد منتجات مسجلة حالياً.</div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 px-1">
                  {products.map((prod: any) => (
                    <PublicProductCardItem
                      key={prod.id}
                      prod={prod}
                      businessSlug={profile.slug}
                      onNavigate={onNavigate}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB: SERVICES */}
        {activeTab === 'services' && (
          <div className="space-y-6 animate-fade-in">
            <div className="bg-white border border-slate-200/60 rounded-3xl p-5 shadow-xs space-y-4">
              <h3 className="text-xs font-bold text-slate-900 pb-3 border-b border-slate-100">قائمة الخدمات والحلول المتاحة</h3>

              {services.length === 0 ? (
                <div className="p-12 text-center text-slate-400 text-xs">لا توجد خدمات مسجلة حالياً.</div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {services.map((serv: any) => (
                    <PublicServiceCardItem key={serv.id} serv={serv} whatsapp={profile.whatsapp || ''} />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB: FINANCIAL ACCOUNTS */}
        {activeTab === 'financial' && (
          <div className="space-y-6 animate-fade-in">
            <div className="bg-white border border-slate-200/60 rounded-3xl p-5 shadow-xs space-y-4">
              <div>
                <h3 className="text-xs font-bold text-slate-900">الحسابات المصرفية ومحافظ الدفع المعتمدة</h3>
                <p className="text-[9px] text-slate-400">انقر على زر نسخ رقم الحساب لتسهيل عملية التحويل المالي والسداد</p>
              </div>

              {financialAccounts.length === 0 ? (
                <div className="p-12 text-center text-slate-450 text-xs">لا يوجد حسابات مالية مسجلة للتحويل حالياً.</div>
              ) : (
                <div className="space-y-4 pt-2">
                  {financialAccounts.map((acc: any) => (
                    <div key={acc.id} className="p-4 bg-slate-50 border border-slate-200/80 rounded-2xl space-y-3 text-right">
                      <div className="flex items-center justify-between border-b border-slate-200/50 pb-2">
                        <h4 className="text-xs font-bold text-slate-900">{acc.name}</h4>
                        <span className="text-[9px] bg-slate-200 text-slate-700 font-bold px-2.5 py-0.5 rounded-full">
                          {acc.is_multicurrency ? 'حساب متعدد العملات' : 'حساب موحد'}
                        </span>
                      </div>

                      {!acc.is_multicurrency ? (
                        <div className="flex items-center justify-between bg-white px-3 py-2.5 rounded-xl border border-slate-200/60 font-mono text-xs shadow-3xs">
                          <span className="text-slate-800 font-bold">{acc.account_number}</span>
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(acc.account_number);
                              setSuccess(`تم نسخ رقم حساب ${acc.name}!`);
                              setTimeout(() => setSuccess(null), 2000);
                            }}
                            className="p-1.5 text-slate-500 hover:text-black hover:bg-slate-100 rounded-lg transition-all"
                            title="نسخ رقم الحساب"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
                          {['YER', 'SAR', 'USD'].map((cur) => {
                            const accNum = acc.accounts?.[cur];
                            if (!accNum) return null;
                            return (
                              <div key={cur} className="bg-white p-3 rounded-xl border border-slate-200/60 flex items-center justify-between gap-2.5 font-mono text-[10px] shadow-3xs">
                                <div className="space-y-0.5 min-w-0">
                                  <span className="text-[8px] bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded font-bold">{cur}</span>
                                  <span className="text-slate-800 font-bold block pt-0.5">{accNum}</span>
                                </div>
                                <button
                                  onClick={() => {
                                    navigator.clipboard.writeText(accNum);
                                    setSuccess(`تم نسخ رقم حساب ${acc.name} بالـ ${cur}!`);
                                    setTimeout(() => setSuccess(null), 2000);
                                  }}
                                  className="p-1 text-slate-550 hover:text-black hover:bg-slate-100 rounded transition-all shrink-0"
                                >
                                  <Copy className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB: COMPLAINTS */}
        {activeTab === 'complaints' && (
          <div className="space-y-6 animate-fade-in">
            {/* Submit form */}
            <div className="bg-white border border-slate-200/60 rounded-3xl p-5 shadow-xs space-y-4">
              <div className="pb-3 border-b border-slate-100">
                <h3 className="text-xs font-bold text-slate-900">تقديم شكوى أو ملاحظة</h3>
                <p className="text-[10px] text-slate-400">أرسل ملاحظتك مباشرة للمالك لتسجيلها ومتابعتها بخصوص المعاملات المالية المربوطة</p>
              </div>

              <form onSubmit={handleComplaintSubmit} className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500">اسم مقدم الشكوى الثنائي</label>
                    <input
                      type="text"
                      required
                      value={visitorName}
                      onChange={(e) => setVisitorName(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 focus:border-slate-400 px-3 py-2 rounded-xl text-xs outline-none"
                      placeholder="اسمك الكامل"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500">رقم الهاتف للتواصل</label>
                    <input
                      type="tel"
                      required
                      value={visitorPhone}
                      onChange={(e) => setVisitorPhone(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 focus:border-slate-400 px-3 py-2 rounded-xl text-xs font-mono text-left outline-none"
                      placeholder="967..."
                      dir="ltr"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500">نص الشكوى أو الملاحظة بالتفصيل</label>
                  <textarea
                    rows={3}
                    required
                    value={complaintText}
                    onChange={(e) => setComplaintText(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 focus:border-slate-400 px-3 py-2 rounded-xl text-xs outline-none resize-none"
                    placeholder="اكتب ملاحظتك أو رقم المعاملة المعنية هنا..."
                  />
                </div>

                <div className="flex justify-end pt-2 border-t border-slate-100">
                  <button
                    type="submit"
                    className="bg-slate-900 text-white text-[10px] font-bold py-2.5 px-5 rounded-xl hover:bg-black transition-all shadow-sm flex items-center gap-1.5"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>إرسال ومتابعة عبر واتساب</span>
                  </button>
                </div>
              </form>
            </div>

            {/* Local complaints log */}
            {localComplaints.length > 0 && (
              <div className="bg-white border border-slate-200/60 rounded-3xl p-5 shadow-xs space-y-3">
                <h3 className="text-xs font-bold text-slate-900">سجل شكاواك السابقة المسجلة محلياً في هذا المتصفح</h3>
                <div className="space-y-3 pt-1">
                  {localComplaints.map((comp: any) => (
                    <div key={comp.id} className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-slate-800">{comp.name}</span>
                        <span className="text-[8px] bg-amber-50 text-amber-700 border border-amber-100 px-2 py-0.5 rounded-full font-bold">
                          {comp.status === 'resolved' ? 'تم الحل' : 'قيد المتابعة مع الإدارة'}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-600 leading-relaxed">{comp.text}</p>
                      <span className="text-[8px] text-slate-400 font-mono block text-left">
                        {new Date(comp.created_at).toLocaleString('ar-YE-u-nu-latn', { dateStyle: 'short', numberingSystem: 'latn' })}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}

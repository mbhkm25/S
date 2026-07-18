import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Clock,
  ExternalLink,
  Globe,
  Image as ImageIcon,
  Loader2,
  MapPin,
  MessageCircle,
  Package,
  Phone,
  Plus,
  ShieldCheck,
  Store,
  UserCheck
} from 'lucide-react';
import {
  getBusinessMediaSignedUrl,
  getPublicBusinessProfile,
  getUserBusinessContexts,
  joinBusinessAsCustomer,
  type PublicBusinessDetail
} from '../../lib/businessApi';
import { toLatinDigits } from '../../lib/digits';

interface PublicBusinessProfileProps {
  slug: string;
  onNavigate: (page: string, token?: string) => void;
  initialTab?: 'overview' | 'products' | 'services' | 'financial' | 'complaints';
}

type ProfileSection = 'overview' | 'catalog' | 'hours' | 'contact';
type ProfileMode = 'intro' | 'details';

type CatalogItem = {
  id: string;
  item_type: 'product' | 'service' | 'digital' | 'offer' | 'subscription' | 'other' | string;
  title: string;
  description?: string | null;
  price?: number | null;
  currency?: string | null;
  image_paths?: string[] | null;
  status?: string;
  is_featured?: boolean;
  availability_status?: 'available' | 'on_request' | 'unavailable' | string;
  contact_action?: 'whatsapp' | 'call' | 'none' | string;
};

type ExtendedPublicBusinessDetail = PublicBusinessDetail & {
  working_hours?: Record<string, { open?: string; close?: string; closed?: boolean }> | null;
  contact_links?: Record<string, string | null> | null;
  profile_sections?: {
    services?: unknown[];
    reviews?: unknown[];
  } | null;
  catalog_items?: CatalogItem[];
  latitude?: number | null;
  longitude?: number | null;
};

const DAYS: Array<{ key: string; label: string }> = [
  { key: 'saturday', label: 'السبت' },
  { key: 'sunday', label: 'الأحد' },
  { key: 'monday', label: 'الاثنين' },
  { key: 'tuesday', label: 'الثلاثاء' },
  { key: 'wednesday', label: 'الأربعاء' },
  { key: 'thursday', label: 'الخميس' },
  { key: 'friday', label: 'الجمعة' }
];

const SECTION_META: Array<{ id: ProfileSection; label: string; description: string }> = [
  { id: 'overview', label: 'نظرة عامة', description: 'التعريف بالنشاط وأبرز ما يقدمه' },
  { id: 'catalog', label: 'الكتالوج', description: 'العناصر الرئيسية المتاحة للاستفسار' },
  { id: 'hours', label: 'ساعات العمل', description: 'مواعيد الدوام الأسبوعية' },
  { id: 'contact', label: 'التواصل والموقع', description: 'وسائل التواصل والعنوان' }
];

function normalizeInitialSection(initialTab?: PublicBusinessProfileProps['initialTab']): ProfileSection {
  if (initialTab === 'products' || initialTab === 'services') return 'catalog';
  if (initialTab === 'financial' || initialTab === 'complaints') return 'contact';
  return 'overview';
}

function normalizeWhatsapp(phone?: string | null) {
  return toLatinDigits(phone || '').replace(/\D/g, '');
}

function itemTypeLabel(type: string) {
  const labels: Record<string, string> = {
    product: 'منتج',
    service: 'خدمة',
    digital: 'رقمي',
    offer: 'عرض',
    subscription: 'اشتراك',
    other: 'عنصر'
  };
  return labels[type] || 'عنصر';
}

function availabilityLabel(status?: string) {
  if (status === 'unavailable') return 'غير متاح حاليًا';
  if (status === 'on_request') return 'متاح عند الطلب';
  return 'متاح';
}

function priceLabel(item: CatalogItem) {
  if (item.price === null || item.price === undefined) return 'السعر عند الطلب';
  const value = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(item.price);
  return `${value}${item.currency ? ` ${item.currency}` : ''}`;
}

function CatalogItemCard({
  item,
  businessSlug,
  businessName,
  whatsapp,
  onNavigate
}: {
  item: CatalogItem;
  businessSlug: string;
  businessName: string;
  whatsapp: string;
  onNavigate: (page: string, token?: string) => void;
}) {
  const [imageUrl, setImageUrl] = useState('');

  useEffect(() => {
    let active = true;
    const path = Array.isArray(item.image_paths) ? item.image_paths[0] : null;
    if (!path) {
      setImageUrl('');
      return;
    }
    void getBusinessMediaSignedUrl(path).then((url) => {
      if (active) setImageUrl(url || '');
    });
    return () => {
      active = false;
    };
  }, [item.image_paths]);

  const message = `مرحبًا، أريد الاستفسار عن ${item.title} المعروض في كتالوج ${businessName} على سند.`;
  const whatsappUrl = whatsapp ? `https://wa.me/${whatsapp}?text=${encodeURIComponent(message)}` : '';

  return (
    <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <button
        type="button"
        onClick={() => onNavigate('public-product-detail', `${businessSlug}/${item.id}`)}
        className="block w-full text-right"
      >
        <div className="relative aspect-[4/3] w-full bg-slate-100">
          {imageUrl ? (
            <img src={imageUrl} alt={item.title} className="h-full w-full object-cover" loading="lazy" />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <ImageIcon className="h-8 w-8 text-slate-300" />
            </div>
          )}
          <div className="absolute right-2 top-2 flex gap-1.5">
            {item.is_featured && (
              <span className="rounded-full bg-slate-950/85 px-2 py-1 text-[9px] font-bold text-white backdrop-blur">مميز</span>
            )}
            <span className="rounded-full bg-white/90 px-2 py-1 text-[9px] font-bold text-slate-700 backdrop-blur">
              {itemTypeLabel(item.item_type)}
            </span>
          </div>
        </div>
        <div className="space-y-2 p-3">
          <div>
            <h3 className="line-clamp-1 text-xs font-bold text-slate-950">{item.title}</h3>
            {item.description && <p className="mt-1 line-clamp-2 text-[10px] leading-5 text-slate-500">{item.description}</p>}
          </div>
          <div className="flex items-center justify-between gap-2 border-t border-slate-100 pt-2">
            <span className="text-[10px] font-bold text-slate-900">{priceLabel(item)}</span>
            <span className={`text-[9px] font-bold ${item.availability_status === 'unavailable' ? 'text-rose-600' : 'text-emerald-700'}`}>
              {availabilityLabel(item.availability_status)}
            </span>
          </div>
        </div>
      </button>
      {item.contact_action !== 'none' && whatsappUrl && (
        <a
          href={whatsappUrl}
          target="_blank"
          rel="noreferrer"
          className="flex items-center justify-center gap-2 border-t border-slate-100 px-3 py-3 text-[10px] font-bold text-emerald-700"
        >
          <MessageCircle className="h-4 w-4" />
          استفسار عن العنصر
        </a>
      )}
    </article>
  );
}

export default function PublicBusinessProfile({ slug, onNavigate, initialTab }: PublicBusinessProfileProps) {
  const [loading, setLoading] = useState(true);
  const [linking, setLinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<ExtendedPublicBusinessDetail | null>(null);
  const [logoUrl, setLogoUrl] = useState('');
  const [coverUrl, setCoverUrl] = useState('');
  const [galleryUrls, setGalleryUrls] = useState<string[]>([]);
  const [isCustomer, setIsCustomer] = useState(false);
  const [mode, setMode] = useState<ProfileMode>(initialTab ? 'details' : 'intro');
  const [section, setSection] = useState<ProfileSection>(normalizeInitialSection(initialTab));
  const [sectionMenuOpen, setSectionMenuOpen] = useState(false);

  useEffect(() => {
    if (!initialTab) return;
    setSection(normalizeInitialSection(initialTab));
    setMode('details');
  }, [initialTab]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await getPublicBusinessProfile(slug) as ExtendedPublicBusinessDetail;
        if (!active) return;
        setProfile(data);

        const contexts = await getUserBusinessContexts().catch(() => null);
        if (active) {
          setIsCustomer(Boolean(contexts?.customer_businesses?.some((business) => business.id === data.id)));
        }

        const profilePath = data.profile_image_path || data.logo_path || data.logo_url || '';
        const coverPath = data.cover_image_path || '';
        const gallery = Array.isArray(data.gallery_paths) ? data.gallery_paths : [];
        const [resolvedLogo, resolvedCover, resolvedGallery] = await Promise.all([
          profilePath ? getBusinessMediaSignedUrl(profilePath) : Promise.resolve(''),
          coverPath ? getBusinessMediaSignedUrl(coverPath) : Promise.resolve(''),
          Promise.all(gallery.slice(0, 6).map((path) => getBusinessMediaSignedUrl(path)))
        ]);
        if (!active) return;
        setLogoUrl(resolvedLogo || '');
        setCoverUrl(resolvedCover || '');
        setGalleryUrls(resolvedGallery.filter(Boolean));
      } catch (caught) {
        if (active) setError(caught instanceof Error ? caught.message : 'تعذر تحميل الملف العام للنشاط.');
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [slug]);

  const catalogItems = useMemo(() => Array.isArray(profile?.catalog_items) ? profile.catalog_items.slice(0, 10) : [], [profile?.catalog_items]);
  const featuredItems = useMemo(() => {
    const featured = catalogItems.filter((item) => item.is_featured);
    return (featured.length > 0 ? featured : catalogItems).slice(0, 6);
  }, [catalogItems]);

  const currentSection = SECTION_META.find((item) => item.id === section) || SECTION_META[0];
  const whatsapp = normalizeWhatsapp(profile?.whatsapp);
  const socials = profile?.contact_links || {};

  const handleJoin = async () => {
    if (!profile || isCustomer) return;
    setLinking(true);
    setError(null);
    try {
      await joinBusinessAsCustomer(profile.id, 'public_profile');
      setIsCustomer(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'تعذر الارتباط بالنشاط.');
    } finally {
      setLinking(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 font-arabic">
        <Loader2 className="h-7 w-7 animate-spin text-slate-800" />
        <p className="text-xs text-slate-500">جاري تحميل الملف العام...</p>
      </div>
    );
  }

  if (!profile || error) {
    return (
      <div className="mx-auto my-12 max-w-md rounded-3xl border border-slate-200 bg-white p-6 text-center font-arabic">
        <p className="text-xs leading-6 text-slate-600">{error || 'لم يتم العثور على النشاط.'}</p>
        <button onClick={() => onNavigate('business-community')} className="mt-4 inline-flex items-center gap-2 text-xs font-bold text-slate-900">
          <ArrowRight className="h-4 w-4" /> العودة إلى دليل الأعمال
        </button>
      </div>
    );
  }

  if (mode === 'intro') {
    return (
      <div className="min-h-screen bg-slate-950 p-3 font-arabic" dir="rtl">
        <div className="relative mx-auto min-h-[calc(100dvh-1.5rem)] max-w-xl overflow-hidden rounded-[2rem] bg-slate-800 shadow-2xl">
          {coverUrl ? (
            <img src={coverUrl} alt={profile.name} className="absolute inset-0 h-full w-full object-cover" />
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-slate-700 via-slate-800 to-slate-950" />
          )}
          <div className="absolute inset-0 bg-gradient-to-b from-slate-950/10 via-slate-950/15 to-slate-950/95" />
          <button
            type="button"
            onClick={() => onNavigate('business-community')}
            className="absolute right-4 top-4 z-10 rounded-2xl bg-white/90 p-3 text-slate-900 shadow-lg backdrop-blur"
            aria-label="العودة"
          >
            <ArrowRight className="h-5 w-5" />
          </button>

          <div className="absolute inset-x-0 bottom-0 z-10 space-y-5 p-6 text-white sm:p-8">
            <div className="flex items-end gap-4">
              <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-3xl border border-white/20 bg-white/95 shadow-xl">
                {logoUrl ? <img src={logoUrl} alt={profile.name} className="h-full w-full object-cover" /> : <Store className="h-8 w-8 text-slate-500" />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h1 className="truncate text-2xl font-bold">{profile.name}</h1>
                  {profile.verification_status === 'verified' && <ShieldCheck className="h-5 w-5 shrink-0 text-emerald-300" />}
                </div>
                <p className="mt-1 text-xs text-white/75">{profile.display_tagline || profile.category_name || 'نشاط تجاري على سند'}</p>
                <div className="mt-2 flex items-center gap-1.5 text-[11px] text-white/65">
                  <MapPin className="h-4 w-4" />
                  <span>{profile.city}، {profile.governorate}</span>
                </div>
              </div>
            </div>

            <p className="max-w-lg text-sm leading-7 text-white/85">{profile.description || 'اكتشف معلومات النشاط والعناصر والخدمات وطرق التواصل المتاحة.'}</p>

            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => void handleJoin()}
                disabled={isCustomer || linking}
                className="flex items-center justify-center gap-2 rounded-2xl bg-white px-4 py-3.5 text-xs font-bold text-slate-950 disabled:bg-emerald-100 disabled:text-emerald-800"
              >
                {linking ? <Loader2 className="h-4 w-4 animate-spin" /> : isCustomer ? <UserCheck className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                {isCustomer ? 'مرتبط بالنشاط' : 'الارتباط كعميل'}
              </button>
              <button
                type="button"
                onClick={() => setMode('details')}
                className="flex items-center justify-center gap-2 rounded-2xl border border-white/25 bg-white/10 px-4 py-3.5 text-xs font-bold text-white backdrop-blur"
              >
                استعراض الملف
                <ExternalLink className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-20 font-arabic text-right" dir="rtl">
      <div className="mx-auto max-w-5xl">
        <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 px-3 py-3 backdrop-blur sm:px-5">
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => setMode('intro')} className="rounded-xl border border-slate-200 p-2.5 text-slate-700" aria-label="العودة إلى الغلاف">
              <ArrowRight className="h-4 w-4" />
            </button>
            <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-white">
              {logoUrl ? <img src={logoUrl} alt={profile.name} className="h-full w-full object-cover" /> : <Store className="h-5 w-5 text-slate-400" />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <h1 className="truncate text-sm font-bold text-slate-950">{profile.name}</h1>
                {profile.verification_status === 'verified' && <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-600" />}
              </div>
              <p className="mt-0.5 truncate text-[10px] text-slate-500">{profile.city}، {profile.governorate}</p>
            </div>
            {whatsapp && (
              <a href={`https://wa.me/${whatsapp}`} target="_blank" rel="noreferrer" className="rounded-xl bg-emerald-50 p-2.5 text-emerald-700" aria-label="واتساب">
                <MessageCircle className="h-5 w-5" />
              </a>
            )}
          </div>
        </header>

        <main className="space-y-5 px-2 py-4 sm:px-5">
          {error && <div className="rounded-2xl border border-rose-100 bg-rose-50 p-3 text-xs text-rose-700">{error}</div>}

          <section className="rounded-2xl border border-slate-200 bg-white">
            <button
              type="button"
              onClick={() => setSectionMenuOpen((value) => !value)}
              className="flex w-full items-center gap-3 px-4 py-3.5 text-right"
              aria-expanded={sectionMenuOpen}
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
                <Store className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[9px] font-bold text-slate-400">قسم الملف العام</p>
                <p className="mt-0.5 text-sm font-bold text-slate-950">{currentSection.label}</p>
              </div>
              {sectionMenuOpen ? <ChevronUp className="h-5 w-5 text-slate-400" /> : <ChevronDown className="h-5 w-5 text-slate-400" />}
            </button>
            {sectionMenuOpen && (
              <div className="grid gap-1 border-t border-slate-100 p-2 sm:grid-cols-2">
                {SECTION_META.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setSection(item.id);
                      setSectionMenuOpen(false);
                    }}
                    className={`rounded-xl px-3 py-3 text-right ${section === item.id ? 'bg-slate-900 text-white' : 'hover:bg-slate-50'}`}
                  >
                    <p className="text-xs font-bold">{item.label}</p>
                    <p className={`mt-1 text-[9px] ${section === item.id ? 'text-white/65' : 'text-slate-400'}`}>{item.description}</p>
                  </button>
                ))}
              </div>
            )}
          </section>

          {section === 'overview' && (
            <div className="space-y-5">
              <section className="border-y border-slate-200 bg-white px-3 py-5 sm:rounded-2xl sm:border sm:px-5">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-bold text-slate-950">{profile.name}</h2>
                  {profile.verification_status === 'verified' && <span className="rounded-full bg-emerald-50 px-2 py-1 text-[9px] font-bold text-emerald-700">نشاط موثّق</span>}
                </div>
                <p className="mt-2 text-xs leading-7 text-slate-600">{profile.description || 'لم يضف النشاط وصفًا تفصيليًا بعد.'}</p>
                <div className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-100 pt-4 text-[10px]">
                  <div><span className="block text-slate-400">التصنيف</span><strong className="mt-1 block text-slate-800">{profile.category_name || 'عام'}</strong></div>
                  <div><span className="block text-slate-400">الموقع</span><strong className="mt-1 block text-slate-800">{profile.city}، {profile.governorate}</strong></div>
                </div>
                <div className="mt-4">
                  {isCustomer ? (
                    <div className="flex items-center justify-center gap-2 rounded-2xl bg-emerald-50 px-4 py-3 text-xs font-bold text-emerald-700">
                      <UserCheck className="h-4 w-4" /> أنت مرتبط بهذا النشاط التجاري
                    </div>
                  ) : (
                    <button onClick={() => void handleJoin()} disabled={linking} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-xs font-bold text-white">
                      {linking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} الارتباط كعميل
                    </button>
                  )}
                </div>
              </section>

              {featuredItems.length > 0 && (
                <section className="space-y-3">
                  <div className="flex items-center justify-between px-2 sm:px-0">
                    <div>
                      <h2 className="text-sm font-bold text-slate-950">عناصر مختارة من الكتالوج</h2>
                      <p className="mt-1 text-[10px] text-slate-400">أبرز ما يقدمه النشاط</p>
                    </div>
                    <button type="button" onClick={() => setSection('catalog')} className="text-[10px] font-bold text-slate-700">عرض الكل</button>
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {featuredItems.map((item) => (
                      <CatalogItemCard key={item.id} item={item} businessSlug={profile.slug} businessName={profile.name} whatsapp={whatsapp} onNavigate={onNavigate} />
                    ))}
                  </div>
                </section>
              )}

              {galleryUrls.length > 0 && (
                <section className="space-y-3">
                  <h2 className="px-2 text-sm font-bold text-slate-950 sm:px-0">صور من النشاط</h2>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {galleryUrls.map((url, index) => <img key={`${url}-${index}`} src={url} alt={`${profile.name} ${index + 1}`} className="aspect-square w-full rounded-2xl object-cover" loading="lazy" />)}
                  </div>
                </section>
              )}
            </div>
          )}

          {section === 'catalog' && (
            <section className="space-y-3">
              <div className="px-2 sm:px-0">
                <h2 className="text-sm font-bold text-slate-950">كتالوج النشاط</h2>
                <p className="mt-1 text-[10px] leading-5 text-slate-400">حتى 10 عناصر رئيسية يختارها النشاط لعرضها لعملائه.</p>
              </div>
              {catalogItems.length === 0 ? (
                <div className="border-y border-slate-200 bg-white py-12 text-center sm:rounded-2xl sm:border">
                  <Package className="mx-auto h-8 w-8 text-slate-300" />
                  <p className="mt-3 text-xs text-slate-500">لم ينشر النشاط عناصر في الكتالوج بعد.</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                  {catalogItems.map((item) => (
                    <CatalogItemCard key={item.id} item={item} businessSlug={profile.slug} businessName={profile.name} whatsapp={whatsapp} onNavigate={onNavigate} />
                  ))}
                </div>
              )}
            </section>
          )}

          {section === 'hours' && (
            <section className="border-y border-slate-200 bg-white sm:rounded-2xl sm:border">
              <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-4">
                <Clock className="h-5 w-5 text-slate-600" />
                <div><h2 className="text-sm font-bold text-slate-950">ساعات العمل الأسبوعية</h2><p className="mt-1 text-[10px] text-slate-400">المواعيد التي حددها النشاط</p></div>
              </div>
              <div className="divide-y divide-slate-100 px-4">
                {DAYS.map(({ key, label }) => {
                  const day = profile.working_hours?.[key];
                  const closed = !day || day.closed;
                  return (
                    <div key={key} className="flex items-center justify-between py-3.5 text-xs">
                      <span className="font-bold text-slate-800">{label}</span>
                      <span className={closed ? 'text-slate-400' : 'font-mono text-slate-700'}>{closed ? 'مغلق' : `${toLatinDigits(day.open || '')} — ${toLatinDigits(day.close || '')}`}</span>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {section === 'contact' && (
            <div className="space-y-4">
              <section className="divide-y divide-slate-100 border-y border-slate-200 bg-white sm:rounded-2xl sm:border">
                <div className="flex items-start gap-3 px-4 py-4">
                  <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-slate-500" />
                  <div><p className="text-xs font-bold text-slate-900">العنوان</p><p className="mt-1 text-[11px] leading-5 text-slate-500">{profile.address_text || `${profile.city}، ${profile.governorate}`}</p></div>
                </div>
                {whatsapp && (
                  <a href={`https://wa.me/${whatsapp}`} target="_blank" rel="noreferrer" className="flex items-center gap-3 px-4 py-4">
                    <MessageCircle className="h-5 w-5 text-emerald-600" />
                    <div className="flex-1"><p className="text-xs font-bold text-slate-900">واتساب</p><p className="mt-1 font-mono text-[11px] text-slate-500" dir="ltr">+{whatsapp}</p></div>
                    <ExternalLink className="h-4 w-4 text-slate-300" />
                  </a>
                )}
                {profile.whatsapp_catalog_url && (
                  <a href={profile.whatsapp_catalog_url} target="_blank" rel="noreferrer" className="flex items-center gap-3 px-4 py-4">
                    <Package className="h-5 w-5 text-slate-600" />
                    <div className="flex-1"><p className="text-xs font-bold text-slate-900">كتالوج واتساب</p><p className="mt-1 text-[10px] text-slate-400">فتح الكتالوج الخارجي للنشاط</p></div>
                    <ExternalLink className="h-4 w-4 text-slate-300" />
                  </a>
                )}
                {socials.website && (
                  <a href={socials.website} target="_blank" rel="noreferrer" className="flex items-center gap-3 px-4 py-4">
                    <Globe className="h-5 w-5 text-slate-600" />
                    <div className="flex-1"><p className="text-xs font-bold text-slate-900">الموقع الإلكتروني</p><p className="mt-1 truncate text-[10px] text-slate-400">{socials.website}</p></div>
                    <ExternalLink className="h-4 w-4 text-slate-300" />
                  </a>
                )}
                {profile.whatsapp && (
                  <a href={`tel:+${whatsapp}`} className="flex items-center gap-3 px-4 py-4">
                    <Phone className="h-5 w-5 text-slate-600" />
                    <div className="flex-1"><p className="text-xs font-bold text-slate-900">اتصال</p><p className="mt-1 text-[10px] text-slate-400">الاتصال برقم النشاط</p></div>
                  </a>
                )}
              </section>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight, BriefcaseBusiness, CalendarDays, Clock, Copy, ExternalLink, Facebook,
  Globe2, Instagram, Loader2, MapPin, MessageCircle, Package, Phone, Share2,
  ShieldCheck, Store, UserCheck, Utensils, WalletCards
} from 'lucide-react';
import {
  getBusinessMediaSignedUrl, getPublicBusinessProfile, getUserBusinessContexts,
  joinBusinessAsCustomer, type PublicBusinessDetail
} from '../../lib/businessApi';
import { normalizeCatalogSettings, type CatalogDisplaySettings, type DeliveryServiceSettings } from '../../lib/businessCatalogExperience';
import type { BusinessPrimaryAction, BusinessProfileMode, BusinessPublicSection } from '../../lib/businessManagementApi';
import {
  BUSINESS_DAYS,
  getBusinessOpenStatus,
  normalizeBusinessWorkingHours,
  workingDaySummary,
  type BusinessWorkingHours
} from '../../lib/businessWorkingHours';
import { toLatinDigits } from '../../lib/digits';
import PublicCatalogOrderExperience, { type PublicOrderCatalogItem } from './PublicCatalogOrderExperience';

interface Props {
  slug: string;
  onNavigate: (page: string, token?: string) => void;
  initialTab?: 'overview' | 'products' | 'services' | 'financial' | 'complaints';
}

type Mode = 'intro' | 'details';
type ViewSection = 'overview' | 'catalog' | 'hours' | 'financial' | 'contact' | 'about';
type FinancialAccount = { id: string; name: string; is_multicurrency: boolean; account_number?: string | null; accounts?: Record<string, string | null> | null };
type ContactLinks = { website?: string | null; facebook?: string | null; instagram?: string | null; twitter?: string | null; x?: string | null };
type Profile = PublicBusinessDetail & {
  display_tagline?: string | null;
  address_text?: string | null;
  contact_links?: ContactLinks | null;
  catalog_items?: PublicOrderCatalogItem[];
  profile_sections?: { financial_accounts?: FinancialAccount[] };
  working_hours?: BusinessWorkingHours | null;
  horizontal_cover_image_path?: string | null;
  cover_image_path?: string | null;
  profile_image_path?: string | null;
  logo_path?: string | null;
  profile_mode?: BusinessProfileMode;
  primary_action?: BusinessPrimaryAction;
  primary_action_label?: string | null;
  enabled_sections?: BusinessPublicSection[];
  featured_item_ids?: string[];
  catalog_display_settings?: CatalogDisplaySettings;
  delivery_service_settings?: DeliveryServiceSettings;
};

const MODE_COPY: Record<BusinessProfileMode, { content: string; singular: string; icon: typeof Package }> = {
  products: { content: 'المنتجات', singular: 'منتج', icon: Package },
  services: { content: 'الخدمات', singular: 'خدمة', icon: BriefcaseBusiness },
  appointments: { content: 'الخدمات', singular: 'خدمة', icon: CalendarDays },
  menu: { content: 'القائمة', singular: 'عنصر', icon: Utensils },
  portfolio: { content: 'أعمالنا', singular: 'عمل', icon: BriefcaseBusiness },
  custom: { content: 'العناصر', singular: 'عنصر', icon: Store }
};

const ACTION_LABELS: Record<BusinessPrimaryAction, string> = {
  whatsapp: 'تواصل عبر واتساب',
  call: 'اتصل بنا',
  browse: 'استعرض المحتوى',
  request_service: 'اطلب خدمة',
  request_booking: 'اطلب موعدًا',
  request_quote: 'اطلب عرض سعر'
};

function phone(value?: string | null) { return toLatinDigits(value || '').replace(/\D/g, ''); }
function normalizeHref(value: string) { return /^https?:\/\//i.test(value) ? value : `https://${value}`; }

export default function PublicBusinessProfileV3({ slug, onNavigate, initialTab }: Props) {
  const reduceMotion = useReducedMotion();
  const params = new URLSearchParams(window.location.search);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>(params.get('view') === 'details' || (initialTab && initialTab !== 'overview') ? 'details' : 'intro');
  const [section, setSection] = useState<ViewSection>(initialTab === 'financial' ? 'financial' : 'overview');
  const [linked, setLinked] = useState(false);
  const [linking, setLinking] = useState(false);
  const [logo, setLogo] = useState('');
  const [cover, setCover] = useState('');
  const [horizontalCover, setHorizontalCover] = useState('');
  const [images, setImages] = useState<Record<string, string>>({});

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const data = await getPublicBusinessProfile(slug) as Profile;
        if (!active) return;
        setProfile(data);
        setLoading(false);
        void getUserBusinessContexts().then(contexts => {
          if (active) setLinked(Boolean(contexts.customer_businesses?.some(item => item.id === data.id)));
        }).catch(() => {});
        const catalog = Array.isArray(data.catalog_items) ? data.catalog_items : [];
        const featuredIds = (data.featured_item_ids || []).slice(0, 2);
        const imageIds = new Set([...catalog.slice(0, 6).map(item => item.id), ...featuredIds]);
        const [l, c, h] = await Promise.all([
          data.profile_image_path || data.logo_path ? getBusinessMediaSignedUrl(data.profile_image_path || data.logo_path || '') : '',
          data.cover_image_path ? getBusinessMediaSignedUrl(data.cover_image_path) : '',
          data.horizontal_cover_image_path ? getBusinessMediaSignedUrl(data.horizontal_cover_image_path) : ''
        ]);
        if (active) { setLogo(l); setCover(c); setHorizontalCover(h); }
        const entries = await Promise.all(catalog.filter(item => imageIds.has(item.id)).map(async item => [item.id, item.image_paths?.[0] ? await getBusinessMediaSignedUrl(item.image_paths[0]) : ''] as const));
        if (active) setImages(Object.fromEntries(entries));
      } catch (caught) {
        if (active) {
          setLoadError(caught instanceof Error ? caught.message : 'تعذر تحميل الملف العام.');
          setLoading(false);
        }
      }
    })();
    return () => { active = false; };
  }, [slug]);

  const catalog = useMemo(() => profile?.catalog_items || [], [profile]);
  const accounts = profile?.profile_sections?.financial_accounts || [];
  const profileMode = profile?.profile_mode || 'products';
  const copy = MODE_COPY[profileMode];
  const normalizedHours = useMemo(() => normalizeBusinessWorkingHours(profile?.working_hours), [profile?.working_hours]);
  const enabled = new Set(profile?.enabled_sections?.length ? profile.enabled_sections : ['overview', 'catalog', 'hours', 'financial', 'contact']);
  const whatsapp = phone(profile?.whatsapp);
  const links = profile?.contact_links || {};
  const status = getBusinessOpenStatus(normalizedHours);
  const catalogSettings = normalizeCatalogSettings(profile?.catalog_display_settings);
  const featured = useMemo(() => {
    const ids = (profile?.featured_item_ids || []).slice(0, 2);
    const chosen = ids.map(id => catalog.find(item => item.id === id)).filter(Boolean) as PublicOrderCatalogItem[];
    return (chosen.length ? chosen : catalog.slice(0, 2)).slice(0, 2);
  }, [catalog, profile?.featured_item_ids]);
  const tabs = ([
    { id: 'overview', label: 'الرئيسية', show: true },
    { id: 'catalog', label: copy.content, show: enabled.has('catalog') || enabled.has('services') || enabled.has('portfolio') },
    { id: 'hours', label: 'الدوام', show: enabled.has('hours') && Boolean(profile?.working_hours) },
    { id: 'financial', label: 'الحسابات', show: enabled.has('financial') && accounts.length > 0 },
    { id: 'contact', label: 'التواصل', show: enabled.has('contact') },
    { id: 'about', label: 'نبذة', show: enabled.has('about') }
  ] satisfies Array<{ id: ViewSection; label: string; show: boolean }>).filter(item => item.show);

  const leave = () => window.history.length > 1 ? window.history.back() : onNavigate('profile');
  const setView = (nextMode: Mode, nextSection: ViewSection = 'overview') => {
    setMode(nextMode); setSection(nextSection);
    const url = new URL(window.location.href);
    if (nextMode === 'intro') { url.searchParams.delete('view'); url.searchParams.delete('section'); }
    else { url.searchParams.set('view', 'details'); url.searchParams.set('section', nextSection); }
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}`);
    window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
  };
  const selectSection = (next: ViewSection) => {
    setSection(next);
    const url = new URL(window.location.href);
    url.searchParams.set('view', 'details');
    url.searchParams.set('section', next);
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}`);
    window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
  };
  const openItem = (id: string) => onNavigate('public-product-detail', `${profile?.slug}/${id}`);
  const join = async () => {
    if (!profile || linked) return;
    setLinking(true); setActionError(null);
    try { await joinBusinessAsCustomer(profile.id, 'public_profile'); setLinked(true); }
    catch (caught) { setActionError(caught instanceof Error ? caught.message : 'تعذر متابعة النشاط.'); }
    finally { setLinking(false); }
  };
  const share = async () => { try { if (navigator.share) await navigator.share({ title: profile?.name, url: window.location.href }); else await navigator.clipboard.writeText(window.location.href); } catch {} };
  const primary = () => {
    if (!profile) return;
    const action = profile.primary_action || 'whatsapp';
    if (action === 'browse') { setView('details', 'catalog'); return; }
    if (action === 'call' && whatsapp) { window.location.href = `tel:+${whatsapp}`; return; }
    if (whatsapp) {
      const text = encodeURIComponent(action === 'request_booking' ? 'مرحبًا، أريد طلب موعد.' : action === 'request_quote' ? 'مرحبًا، أريد طلب عرض سعر.' : action === 'request_service' ? 'مرحبًا، أريد طلب خدمة.' : 'مرحبًا، أرغب في الاستفسار.');
      window.open(`https://wa.me/${whatsapp}?text=${text}`, '_blank', 'noopener,noreferrer');
    }
  };

  if (loading) return <div className="min-h-screen bg-slate-100 p-3"><div className="mx-auto max-w-xl animate-pulse overflow-hidden rounded-[2rem] bg-white"><div className="h-[52vh] bg-slate-200"/><div className="space-y-3 p-5"><div className="h-8 w-2/3 rounded bg-slate-200"/><div className="h-4 rounded bg-slate-100"/><div className="h-12 rounded-2xl bg-slate-200"/></div></div></div>;
  if (!profile || loadError) return <div className="mx-auto my-12 max-w-sm rounded-[2rem] bg-white p-6 text-center shadow-sm"><p className="text-xs">{loadError || 'النشاط غير موجود.'}</p><button onClick={leave} className="mt-4 text-xs font-bold">العودة</button></div>;

  if (mode === 'intro') return <motion.div initial={reduceMotion ? false : { opacity: 0 }} animate={{ opacity: 1 }} className="min-h-screen bg-white p-2 font-arabic" dir="rtl"><motion.div initial={reduceMotion ? false : { opacity: 0, scale: .985 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: .35 }} className="relative mx-auto min-h-[calc(100dvh-16px)] max-w-xl overflow-hidden rounded-[1.85rem] bg-slate-800 shadow-[0_24px_70px_rgba(15,23,42,.18)]">{cover ? <motion.img initial={reduceMotion ? false : { scale: 1.04 }} animate={{ scale: 1 }} transition={{ duration: 1.2, ease: [.22, 1, .36, 1] }} src={cover} alt={profile.name} fetchPriority="high" className="absolute inset-0 h-full w-full object-cover"/> : <div className="absolute inset-0 bg-gradient-to-br from-slate-600 via-slate-800 to-emerald-950"/>}<div className="absolute inset-0 bg-gradient-to-b from-slate-950/10 via-slate-950/5 to-slate-950/95"/><div className="absolute inset-x-0 top-0 z-10 flex justify-between p-4"><motion.button whileTap={reduceMotion ? undefined : { scale: .94 }} onClick={leave} className="rounded-2xl bg-white/90 p-3 text-slate-800 shadow-lg"><ArrowRight className="h-5 w-5"/></motion.button><motion.button whileTap={reduceMotion ? undefined : { scale: .94 }} onClick={() => void share()} className="rounded-2xl bg-white/90 p-3 text-slate-800 shadow-lg"><Share2 className="h-5 w-5"/></motion.button></div><motion.div initial={reduceMotion ? false : { opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .12, duration: .45 }} className="absolute inset-x-0 bottom-0 z-10 space-y-4 p-5 pb-[calc(6rem+env(safe-area-inset-bottom))] text-white"><div className="flex items-end gap-4"><div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-3xl bg-white p-2 shadow-xl">{logo ? <img src={logo} alt="" className="h-full w-full object-contain"/> : <Store className="h-8 w-8 text-slate-500"/>}</div><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><h1 className="truncate text-2xl font-bold">{profile.name}</h1>{profile.verification_status === 'verified' && <ShieldCheck className="h-5 w-5 text-emerald-300"/>}</div><p className="mt-1 text-xs text-white/75">{profile.display_tagline || profile.category_name || 'نشاط تجاري'}</p><div className="mt-2 flex flex-wrap gap-2 text-[10px] text-white/75"><span className="rounded-full bg-white/10 px-2.5 py-1">{profile.city}، {profile.governorate}</span><span className={`rounded-full px-2.5 py-1 ${status.open ? 'bg-emerald-400/20 text-emerald-100' : 'bg-white/10'}`}>{status.label}</span></div></div></div><p className="line-clamp-2 text-sm leading-7 text-white/85">{profile.description || 'تعرّف على النشاط وخدماته وطرق التواصل معه.'}</p><div className="grid grid-cols-2 gap-3"><motion.button whileTap={reduceMotion ? undefined : { scale: .98 }} onClick={primary} className="rounded-2xl bg-white p-3.5 text-xs font-bold text-slate-950 shadow-lg">{profile.primary_action_label || ACTION_LABELS[profile.primary_action || 'whatsapp']}</motion.button><motion.button whileTap={reduceMotion ? undefined : { scale: .98 }} onClick={() => setView('details', 'overview')} className="rounded-2xl bg-white/15 p-3.5 text-xs font-bold backdrop-blur">المزيد عن النشاط</motion.button></div><button onClick={() => void join()} disabled={linked || linking} className="flex w-full items-center justify-center gap-2 rounded-2xl border border-white/20 bg-black/10 p-3 text-[10px] font-bold backdrop-blur disabled:text-emerald-200">{linking ? <Loader2 className="h-4 w-4 animate-spin"/> : <UserCheck className="h-4 w-4"/>}{linked ? 'تتابع هذا النشاط' : 'متابعة النشاط'}</button>{actionError && <p className="text-[10px] text-rose-200">{actionError}</p>}</motion.div></motion.div></motion.div>;

  const social = [
    links.website && { label: 'الموقع', href: normalizeHref(links.website), Icon: Globe2 },
    links.facebook && { label: 'فيسبوك', href: normalizeHref(links.facebook), Icon: Facebook },
    links.instagram && { label: 'إنستغرام', href: normalizeHref(links.instagram), Icon: Instagram },
    (links.twitter || links.x) && { label: 'X', href: normalizeHref(links.twitter || links.x || ''), Icon: ExternalLink }
  ].filter(Boolean) as Array<{ label: string; href: string; Icon: typeof Globe2 }>;

  const sectionContent = section === 'overview' ? <>
    <motion.section initial={reduceMotion ? false : { opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="overflow-hidden rounded-[1.9rem] border border-slate-200/80 bg-white shadow-[0_18px_48px_rgba(15,23,42,.10)]">
      <div className="relative aspect-[16/8.6] overflow-hidden bg-slate-900 sm:aspect-[16/7]">
        {horizontalCover ? <motion.img initial={reduceMotion ? false : { scale: 1.025 }} animate={{ scale: 1 }} transition={{ duration: .8, ease: [.22, 1, .36, 1] }} src={horizontalCover} alt={`غلاف ${profile.name}`} className="h-full w-full object-cover"/> : <div className="h-full w-full bg-gradient-to-br from-slate-700 via-slate-900 to-emerald-950"/>}
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/55 via-transparent to-slate-950/5"/>
        <div className="absolute bottom-3 left-3 rounded-full border border-white/20 bg-slate-950/45 px-3 py-1.5 text-[9px] font-bold text-white backdrop-blur-md">{profile.category_name || 'نشاط تجاري'}</div>
      </div>
      <div className="relative px-4 pb-4 pt-11 sm:px-5 sm:pb-5">
        <motion.div initial={reduceMotion ? false : { opacity: 0, y: 10, scale: .96 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ delay: .08, duration: .32 }} className="absolute right-4 top-0 flex h-[4.75rem] w-[4.75rem] -translate-y-1/2 items-center justify-center overflow-hidden rounded-[1.45rem] border-4 border-white bg-white p-2 shadow-[0_12px_28px_rgba(15,23,42,.18)] sm:right-5">
          {logo ? <img src={logo} alt={`شعار ${profile.name}`} className="h-full w-full object-contain"/> : <Store className="h-8 w-8 text-slate-400"/>}
        </motion.div>
        <div className="pr-[5.4rem] sm:pr-[5.7rem]">
          <div className="flex min-w-0 items-center gap-2"><h2 className="truncate text-xl font-bold text-slate-950">{profile.name}</h2>{profile.verification_status === 'verified' && <ShieldCheck className="h-5 w-5 shrink-0 text-emerald-500"/>}</div>
          <p className="mt-1 truncate text-[11px] font-medium text-slate-500">{profile.display_tagline || profile.category_name || 'نشاط تجاري'}</p>
        </div>
        <div className="mt-4 flex flex-wrap gap-2 text-[9px] font-bold"><span className={`rounded-full px-3 py-1.5 ${status.open ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{status.label}</span><span className="rounded-full bg-slate-100 px-3 py-1.5 text-slate-600">{profile.city}، {profile.governorate}</span></div>
        <p className="mt-4 line-clamp-3 text-xs leading-7 text-slate-600">{profile.description || 'لا يوجد وصف منشور لهذا النشاط.'}</p>
        <div className="mt-4 grid gap-2 sm:grid-cols-2"><button onClick={primary} className="min-h-12 rounded-2xl bg-emerald-500 px-4 text-xs font-bold text-white shadow-[0_8px_20px_rgba(16,185,129,.22)] active:scale-[.99]">{profile.primary_action_label || ACTION_LABELS[profile.primary_action || 'whatsapp']}</button><button onClick={() => selectSection('contact')} className="min-h-12 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-xs font-bold text-slate-800 active:scale-[.99]">التواصل والموقع</button></div>
      </div>
    </motion.section>
    {featured.length > 0 && <section className="space-y-3"><div className="flex items-end justify-between"><div><h2 className="text-base font-bold">{catalogSettings.featured_section_title || `مختارات من ${copy.content}`}</h2><p className="text-[10px] text-slate-500">أبرز ما يقدمه النشاط</p></div><button onClick={() => selectSection('catalog')} className="text-[10px] font-bold text-emerald-700">عرض الجميع</button></div><PublicCatalogOrderExperience business={profile} items={featured} images={images} itemLabel={copy.singular} onOpenItem={openItem}/></section>}
    <section className="grid gap-3 sm:grid-cols-2"><motion.article whileInView={reduceMotion ? undefined : { y: [8, 0], opacity: [0, 1] }} viewport={{ once: true }} className="rounded-3xl bg-white p-4 shadow-sm"><div className="flex items-center gap-2"><Clock className="h-5 w-5 text-emerald-600"/><h3 className="text-sm font-bold">الدوام اليوم</h3></div><p className="mt-3 text-xs text-slate-600">{status.label}</p><p className="mt-1 text-[9px] text-slate-400">{status.periodsLabel}</p></motion.article><motion.article whileInView={reduceMotion ? undefined : { y: [8, 0], opacity: [0, 1] }} viewport={{ once: true }} className="rounded-3xl bg-white p-4 shadow-sm"><div className="flex items-center gap-2"><MapPin className="h-5 w-5 text-emerald-600"/><h3 className="text-sm font-bold">الموقع</h3></div><p className="mt-3 text-xs leading-6 text-slate-600">{profile.address_text || `${profile.city}، ${profile.governorate}`}</p></motion.article></section>
  </> : section === 'catalog' ? <section className="space-y-3"><div><h2 className="text-base font-bold">{copy.content}</h2><p className="mt-1 text-[10px] text-slate-500">العناصر المنشورة والمتاحة</p></div>{catalog.length ? <PublicCatalogOrderExperience business={profile} items={catalog} images={images} itemLabel={copy.singular} onOpenItem={openItem}/> : <p className="rounded-3xl bg-white p-8 text-center text-xs text-slate-400">لا توجد عناصر منشورة حاليًا.</p>}</section> : section === 'hours' ? <section className="rounded-3xl bg-white p-4 shadow-sm"><div className="flex items-center gap-2 pb-3"><Clock className="h-5 w-5"/><div><h2 className="text-sm font-bold">ساعات العمل والدوام</h2><p className="mt-1 text-[9px] text-slate-500">{status.label}</p></div></div><div className="space-y-1">{BUSINESS_DAYS.map(([key, label]) => { const value = normalizedHours[key]; return <div key={key} className="flex items-start justify-between gap-3 rounded-xl px-2 py-3 text-xs even:bg-slate-50"><strong>{label}</strong><span className="text-left text-[10px] leading-5 text-slate-500">{workingDaySummary(value)}</span></div>; })}</div></section> : section === 'financial' ? <section className="space-y-3"><div className="flex items-center gap-2"><WalletCards className="h-5 w-5"/><h2 className="text-sm font-bold">الحسابات المالية</h2></div>{accounts.map(account => <article key={account.id} className="rounded-3xl bg-white p-4 shadow-sm"><h3 className="text-xs font-bold">{account.name}</h3>{account.is_multicurrency ? <div className="mt-3 space-y-2">{Object.entries(account.accounts || {}).filter(([, value]) => value).map(([key, value]) => <div key={key} className="flex items-center justify-between rounded-xl bg-slate-50 p-3 text-xs"><span>{key}</span><strong>{value}</strong><button onClick={() => void navigator.clipboard.writeText(String(value))}><Copy className="h-4 w-4 text-slate-400"/></button></div>)}</div> : <div className="mt-3 flex items-center gap-2 rounded-xl bg-slate-50 p-3 text-xs"><strong className="flex-1 text-left">{account.account_number}</strong><button onClick={() => void navigator.clipboard.writeText(account.account_number || '')}><Copy className="h-4 w-4 text-slate-400"/></button></div>}</article>)}</section> : section === 'contact' ? <section className="space-y-3"><article className="rounded-3xl bg-white p-4 shadow-sm"><h2 className="text-sm font-bold">التواصل والموقع</h2><p className="mt-3 flex items-start gap-2 text-xs leading-6 text-slate-600"><MapPin className="mt-1 h-4 w-4 shrink-0 text-emerald-600"/>{profile.address_text || `${profile.city}، ${profile.governorate}`}</p><div className="mt-4 grid grid-cols-2 gap-2">{whatsapp && <a href={`https://wa.me/${whatsapp}`} className="flex items-center justify-center gap-2 rounded-2xl bg-emerald-50 p-3 text-xs font-bold text-emerald-700"><MessageCircle className="h-4 w-4"/>واتساب</a>}{whatsapp && <a href={`tel:+${whatsapp}`} className="flex items-center justify-center gap-2 rounded-2xl bg-slate-100 p-3 text-xs font-bold"><Phone className="h-4 w-4"/>اتصال</a>}</div>{social.length > 0 && <div className="mt-3 grid grid-cols-2 gap-2">{social.map(({ label, href, Icon }) => <a key={label} href={href} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-2xl border border-slate-200 p-3 text-xs font-bold"><Icon className="h-4 w-4"/>{label}</a>)}</div>}</article></section> : <section className="rounded-3xl bg-white p-5 shadow-sm"><h2 className="text-base font-bold">عن {profile.name}</h2><p className="mt-3 text-xs leading-7 text-slate-600">{profile.description || 'لا توجد نبذة منشورة.'}</p></section>;

  return <motion.div initial={reduceMotion ? false : { opacity: 0 }} animate={{ opacity: 1 }} className="min-h-screen bg-[#f5f6f8] pb-20 font-arabic" dir="rtl"><header className="sticky top-0 z-30 flex items-center gap-3 border-b border-slate-200 bg-white/95 p-3 backdrop-blur"><button onClick={() => setView('intro')} className="rounded-xl bg-slate-100 p-2.5"><ArrowRight className="h-4 w-4"/></button><div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-2xl bg-white p-1.5 shadow-sm">{logo ? <img src={logo} alt="" className="h-full w-full object-contain"/> : <Store className="h-5 w-5"/>}</div><div className="min-w-0 flex-1"><h1 className="truncate text-sm font-bold">{profile.name}</h1><p className="text-[10px] text-slate-500">{status.label}</p></div><button onClick={() => void share()} className="rounded-xl bg-slate-100 p-2.5"><Share2 className="h-4 w-4"/></button></header><nav className="sticky top-[68px] z-20 overflow-x-auto border-b border-slate-200 bg-white px-2"><div className="mx-auto flex min-w-max max-w-5xl gap-1">{tabs.map(tab => <button key={tab.id} onClick={() => selectSection(tab.id)} className={`relative px-4 py-3 text-[11px] font-bold ${section === tab.id ? 'text-emerald-700' : 'text-slate-500'}`}>{tab.label}{section === tab.id && <motion.span layoutId="business-profile-active-tab" className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-emerald-600"/>}</button>)}</div></nav><main className="mx-auto max-w-5xl space-y-4 px-2 py-3 sm:px-3"><AnimatePresence mode="wait" initial={false}><motion.div key={section} initial={reduceMotion ? false : { opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={reduceMotion ? { opacity: 0 } : { opacity: 0, x: -12 }} transition={{ duration: reduceMotion ? 0 : .22 }} className="space-y-4">{sectionContent}</motion.div></AnimatePresence></main></motion.div>;
}

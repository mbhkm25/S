import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight, BriefcaseBusiness, CalendarDays, Clock, Copy, ExternalLink, Facebook,
  Globe2, Image as ImageIcon, Instagram, Loader2, MapPin, MessageCircle, Package,
  Phone, Share2, ShieldCheck, Store, UserCheck, Utensils, WalletCards
} from 'lucide-react';
import {
  getBusinessMediaSignedUrl, getPublicBusinessProfile, getUserBusinessContexts,
  joinBusinessAsCustomer, type PublicBusinessDetail
} from '../../lib/businessApi';
import { toLatinDigits } from '../../lib/digits';
import type {
  BusinessPrimaryAction, BusinessProfileMode, BusinessPublicSection
} from '../../lib/businessManagementApi';

interface Props {
  slug: string;
  onNavigate: (page: string, token?: string) => void;
  initialTab?: 'overview' | 'products' | 'services' | 'financial' | 'complaints';
}
type Mode = 'intro' | 'details';
type CatalogItem = {
  id:string; title:string; description?:string|null; item_type?:string; price?:number|null; currency?:string|null;
  image_paths?:string[]|null; is_featured?:boolean; availability_status?:string; features?:Array<string|number|boolean|null|{legacy_price_text?:string|null}>|null;
};
type FinancialAccount = {id:string;name:string;is_multicurrency:boolean;account_number?:string|null;accounts?:Record<string,string|null>|null};
type ContactLinks = {website?:string|null;facebook?:string|null;instagram?:string|null;twitter?:string|null;x?:string|null};
type Profile = PublicBusinessDetail & {
  display_tagline?:string|null;address_text?:string|null;contact_links?:ContactLinks|null;catalog_items?:CatalogItem[];
  profile_sections?:{financial_accounts?:FinancialAccount[]};working_hours?:Record<string,{open?:string;close?:string;closed?:boolean}>;
  horizontal_cover_image_path?:string|null;cover_image_path?:string|null;profile_image_path?:string|null;logo_path?:string|null;
  profile_mode?:BusinessProfileMode;primary_action?:BusinessPrimaryAction;primary_action_label?:string|null;
  enabled_sections?:BusinessPublicSection[];featured_item_ids?:string[];
};
type ViewSection = 'overview'|'catalog'|'hours'|'financial'|'contact'|'about';

const DAYS=[['saturday','السبت'],['sunday','الأحد'],['monday','الاثنين'],['tuesday','الثلاثاء'],['wednesday','الأربعاء'],['thursday','الخميس'],['friday','الجمعة']] as const;
const MODE_COPY:Record<BusinessProfileMode,{content:string;singular:string;icon:typeof Package}> = {
  products:{content:'المنتجات',singular:'منتج',icon:Package},
  services:{content:'الخدمات',singular:'خدمة',icon:BriefcaseBusiness},
  appointments:{content:'الخدمات',singular:'خدمة',icon:CalendarDays},
  menu:{content:'القائمة',singular:'عنصر',icon:Utensils},
  portfolio:{content:'أعمالنا',singular:'عمل',icon:BriefcaseBusiness},
  custom:{content:'العناصر',singular:'عنصر',icon:Store}
};
const ACTION_LABELS:Record<BusinessPrimaryAction,string>={
  whatsapp:'تواصل عبر واتساب',call:'اتصل بنا',browse:'استعرض المحتوى',
  request_service:'اطلب خدمة',request_booking:'اطلب موعدًا',request_quote:'اطلب عرض سعر'
};

function phone(value?:string|null){return toLatinDigits(value||'').replace(/\D/g,'');}
function normalizeHref(value:string){return /^https?:\/\//i.test(value)?value:`https://${value}`;}
function priceLabel(item:CatalogItem){
  if(item.price!=null)return `${new Intl.NumberFormat('en-US',{maximumFractionDigits:2}).format(item.price)}${item.currency?` ${item.currency}`:''}`;
  const legacy=item.features?.find(v=>Boolean(v&&typeof v==='object'&&'legacy_price_text' in v)) as {legacy_price_text?:string|null}|undefined;
  return legacy?.legacy_price_text?.trim()||'السعر عند الطلب';
}
function currentDayKey(){const keys=['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];return keys[new Date().getDay()];}
function openStatus(hours?:Profile['working_hours']){
  const h=hours?.[currentDayKey()];if(!h||h.closed)return {open:false,label:'مغلق اليوم'};
  const now=new Date();const current=now.getHours()*60+now.getMinutes();
  const [oh,om]=(h.open||'00:00').split(':').map(Number);const [ch,cm]=(h.close||'23:59').split(':').map(Number);
  const isOpen=current>=oh*60+om&&current<=ch*60+cm;
  return {open:isOpen,label:isOpen?`مفتوح الآن · حتى ${h.close||''}`:`مغلق الآن · ${h.open||''} - ${h.close||''}`};
}

export default function PublicBusinessProfileV2({slug,onNavigate,initialTab}:Props){
  const params=new URLSearchParams(window.location.search);
  const [profile,setProfile]=useState<Profile|null>(null);const [loading,setLoading]=useState(true);const [error,setError]=useState<string|null>(null);
  const [mode,setMode]=useState<Mode>(params.get('view')==='details'||(initialTab&&initialTab!=='overview')?'details':'intro');
  const [section,setSection]=useState<ViewSection>(initialTab==='financial'?'financial':'overview');
  const [linked,setLinked]=useState(false);const [linking,setLinking]=useState(false);
  const [logo,setLogo]=useState('');const [cover,setCover]=useState('');const [horizontalCover,setHorizontalCover]=useState('');
  const [images,setImages]=useState<Record<string,string>>({});

  useEffect(()=>{let active=true;(async()=>{setLoading(true);setError(null);try{
    const data=await getPublicBusinessProfile(slug) as Profile;if(!active)return;setProfile(data);setLoading(false);
    void getUserBusinessContexts().then(c=>{if(active)setLinked(Boolean(c.customer_businesses?.some(b=>b.id===data.id)));}).catch(()=>{});
    const catalog=Array.isArray(data.catalog_items)?data.catalog_items:[];
    const [l,c,h]=await Promise.all([
      data.profile_image_path||data.logo_path?getBusinessMediaSignedUrl(data.profile_image_path||data.logo_path||''):'',
      data.cover_image_path?getBusinessMediaSignedUrl(data.cover_image_path):'',
      data.horizontal_cover_image_path?getBusinessMediaSignedUrl(data.horizontal_cover_image_path):''
    ]);
    if(active){setLogo(l);setCover(c);setHorizontalCover(h);}
    const entries=await Promise.all(catalog.slice(0,6).map(async item=>[item.id,item.image_paths?.[0]?await getBusinessMediaSignedUrl(item.image_paths[0]):''] as const));
    if(active)setImages(Object.fromEntries(entries));
  }catch(e){if(active){setError(e instanceof Error?e.message:'تعذر تحميل الملف العام.');setLoading(false);}}})();return()=>{active=false};},[slug]);

  const catalog=useMemo(()=>profile?.catalog_items||[],[profile]);
  const accounts=profile?.profile_sections?.financial_accounts||[];
  const profileMode=profile?.profile_mode||'products';const copy=MODE_COPY[profileMode];
  const enabled=new Set(profile?.enabled_sections?.length?profile.enabled_sections:['overview','catalog','hours','financial','contact']);
  const whatsapp=phone(profile?.whatsapp);const links=profile?.contact_links||{};const status=openStatus(profile?.working_hours);
  const featured=useMemo(()=>{const ids=profile?.featured_item_ids||[];const selected=ids.map(id=>catalog.find(x=>x.id===id)).filter(Boolean) as CatalogItem[];return (selected.length?selected:catalog.filter(x=>x.is_featured)).slice(0,3);},[catalog,profile?.featured_item_ids]);
  const tabs = ([
    {id:'overview',label:'الرئيسية',show:true},
    {id:'catalog',label:copy.content,show:enabled.has('catalog')||enabled.has('services')||enabled.has('portfolio')},
    {id:'hours',label:'الدوام',show:enabled.has('hours')&&Boolean(profile?.working_hours)},
    {id:'financial',label:'الحسابات',show:enabled.has('financial')&&accounts.length>0},
    {id:'contact',label:'التواصل',show:enabled.has('contact')},
    {id:'about',label:'نبذة',show:enabled.has('about')}
  ] satisfies Array<{id:ViewSection;label:string;show:boolean}>).filter(item=>item.show);

  const leave=()=>window.history.length>1?window.history.back():onNavigate('profile');
  const setView=(nextMode:Mode,nextSection:ViewSection='overview')=>{setMode(nextMode);setSection(nextSection);const u=new URL(window.location.href);if(nextMode==='intro'){u.searchParams.delete('view');u.searchParams.delete('section');}else{u.searchParams.set('view','details');u.searchParams.set('section',nextSection);}window.history.replaceState(window.history.state,'',`${u.pathname}${u.search}`);window.scrollTo(0,0);};
  const openItem=(id:string)=>onNavigate('public-product-detail',`${profile?.slug}/${id}`);
  const join=async()=>{if(!profile||linked)return;setLinking(true);try{await joinBusinessAsCustomer(profile.id,'public_profile');setLinked(true);}catch(e){setError(e instanceof Error?e.message:'تعذر متابعة النشاط.');}finally{setLinking(false);}};
  const share=async()=>{try{if(navigator.share)await navigator.share({title:profile?.name,url:window.location.href});else await navigator.clipboard.writeText(window.location.href);}catch{}};
  const primary=()=>{if(!profile)return;const action=profile.primary_action||'whatsapp';
    if(action==='browse'){setView('details','catalog');return;}
    if(action==='call'&&whatsapp){window.location.href=`tel:+${whatsapp}`;return;}
    if(whatsapp){const text=encodeURIComponent(action==='request_booking'?'مرحبًا، أريد طلب موعد.':action==='request_quote'?'مرحبًا، أريد طلب عرض سعر.':action==='request_service'?'مرحبًا، أريد طلب خدمة.':'مرحبًا، أرغب في الاستفسار.');window.open(`https://wa.me/${whatsapp}?text=${text}`,'_blank','noopener,noreferrer');}
  };

  if(loading)return <div className="min-h-screen bg-slate-100 p-3"><div className="mx-auto max-w-xl animate-pulse overflow-hidden rounded-[2rem] bg-white"><div className="h-[52vh] bg-slate-200"/><div className="space-y-3 p-5"><div className="h-8 w-2/3 rounded bg-slate-200"/><div className="h-4 rounded bg-slate-100"/><div className="h-12 rounded-2xl bg-slate-200"/></div></div></div>;
  if(!profile||error)return <div className="mx-auto my-12 max-w-sm rounded-[2rem] bg-white p-6 text-center shadow-sm"><p className="text-xs">{error||'النشاط غير موجود.'}</p><button onClick={leave} className="mt-4 text-xs font-bold">العودة</button></div>;

  if(mode==='intro')return <div className="min-h-screen bg-white p-2 font-arabic" dir="rtl"><div className="relative mx-auto min-h-[calc(100dvh-16px)] max-w-xl overflow-hidden rounded-[1.85rem] bg-slate-800 shadow-[0_24px_70px_rgba(15,23,42,.18)]">
    {cover?<img src={cover} alt={profile.name} fetchPriority="high" className="absolute inset-0 h-full w-full object-cover"/>:<div className="absolute inset-0 bg-gradient-to-br from-slate-600 via-slate-800 to-emerald-950"/>}
    <div className="absolute inset-0 bg-gradient-to-b from-slate-950/10 via-slate-950/5 to-slate-950/95"/>
    <div className="absolute inset-x-0 top-0 z-10 flex justify-between p-4"><button onClick={leave} className="rounded-2xl bg-white/90 p-3 text-slate-800 shadow-lg"><ArrowRight className="h-5 w-5"/></button><button onClick={()=>void share()} className="rounded-2xl bg-white/90 p-3 text-slate-800 shadow-lg"><Share2 className="h-5 w-5"/></button></div>
    <div className="absolute inset-x-0 bottom-0 z-10 space-y-4 p-5 text-white">
      <div className="flex items-end gap-4"><div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-3xl bg-white p-2 shadow-xl">{logo?<img src={logo} alt="" className="h-full w-full object-contain"/>:<Store className="h-8 w-8 text-slate-500"/>}</div><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><h1 className="truncate text-2xl font-bold">{profile.name}</h1>{profile.verification_status==='verified'&&<ShieldCheck className="h-5 w-5 text-emerald-300"/>}</div><p className="mt-1 text-xs text-white/75">{profile.display_tagline||profile.category_name||'نشاط تجاري'}</p><div className="mt-2 flex flex-wrap gap-2 text-[10px] text-white/75"><span className="rounded-full bg-white/10 px-2.5 py-1">{profile.city}، {profile.governorate}</span><span className={`rounded-full px-2.5 py-1 ${status.open?'bg-emerald-400/20 text-emerald-100':'bg-white/10'}`}>{status.label}</span></div></div></div>
      <p className="line-clamp-3 text-sm leading-7 text-white/85">{profile.description||'تعرّف على النشاط وخدماته وطرق التواصل معه.'}</p>
      <div className="grid grid-cols-2 gap-3"><button onClick={primary} className="rounded-2xl bg-white p-3.5 text-xs font-bold text-slate-950 shadow-lg">{profile.primary_action_label||ACTION_LABELS[profile.primary_action||'whatsapp']}</button><button onClick={()=>setView('details','overview')} className="rounded-2xl bg-white/15 p-3.5 text-xs font-bold backdrop-blur">المزيد عن النشاط</button></div>
      <button onClick={()=>void join()} disabled={linked||linking} className="flex w-full items-center justify-center gap-2 rounded-2xl border border-white/20 bg-black/10 p-3 text-[10px] font-bold backdrop-blur disabled:text-emerald-200">{linking?<Loader2 className="h-4 w-4 animate-spin"/>:<UserCheck className="h-4 w-4"/>}{linked?'تتابع هذا النشاط':'متابعة النشاط'}</button>
    </div>
  </div></div>;

  const social=[
    links.website&&{label:'الموقع',href:normalizeHref(links.website),Icon:Globe2},
    links.facebook&&{label:'فيسبوك',href:normalizeHref(links.facebook),Icon:Facebook},
    links.instagram&&{label:'إنستغرام',href:normalizeHref(links.instagram),Icon:Instagram},
    (links.twitter||links.x)&&{label:'X',href:normalizeHref(links.twitter||links.x||''),Icon:ExternalLink}
  ].filter(Boolean) as Array<{label:string;href:string;Icon:typeof Globe2}>;

  return <div className="min-h-screen bg-[#f5f6f8] pb-20 font-arabic" dir="rtl">
    <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-slate-200 bg-white/95 p-3 backdrop-blur"><button onClick={()=>setView('intro')} className="rounded-xl bg-slate-100 p-2.5"><ArrowRight className="h-4 w-4"/></button><div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-2xl bg-white p-1.5 shadow-sm">{logo?<img src={logo} alt="" className="h-full w-full object-contain"/>:<Store className="h-5 w-5"/>}</div><div className="min-w-0 flex-1"><h1 className="truncate text-sm font-bold">{profile.name}</h1><p className="text-[10px] text-slate-500">{status.label}</p></div><button onClick={()=>void share()} className="rounded-xl bg-slate-100 p-2.5"><Share2 className="h-4 w-4"/></button></header>
    <nav className="sticky top-[68px] z-20 overflow-x-auto border-b border-slate-200 bg-white px-2"><div className="mx-auto flex min-w-max max-w-5xl gap-1">{tabs.map(t=><button key={t.id} onClick={()=>setSection(t.id)} className={`border-b-2 px-4 py-3 text-[11px] font-bold ${section===t.id?'border-emerald-600 text-emerald-700':'border-transparent text-slate-500'}`}>{t.label}</button>)}</div></nav>
    <main className="mx-auto max-w-5xl space-y-4 px-2 py-3 sm:px-3">
      {section==='overview'&&<>
        <section className="overflow-hidden rounded-[1.75rem] bg-slate-950 text-white shadow-lg">{horizontalCover&&<div className="aspect-[16/7]"><img src={horizontalCover} alt="" className="h-full w-full object-cover"/></div>}<div className="p-5"><div className="flex items-center gap-2"><h2 className="text-xl font-bold">{profile.name}</h2>{profile.verification_status==='verified'&&<ShieldCheck className="h-5 w-5 text-emerald-300"/>}</div><p className="mt-2 text-xs leading-7 text-white/75">{profile.description||'لا يوجد وصف منشور لهذا النشاط.'}</p><div className="mt-4 grid gap-2 sm:grid-cols-2"><button onClick={primary} className="rounded-2xl bg-emerald-400 p-3 text-xs font-bold text-emerald-950">{profile.primary_action_label||ACTION_LABELS[profile.primary_action||'whatsapp']}</button><button onClick={()=>setSection('contact')} className="rounded-2xl bg-white/10 p-3 text-xs font-bold">التواصل والموقع</button></div></div></section>
        {featured.length>0&&<section className="space-y-3"><div className="flex items-end justify-between"><div><h2 className="text-base font-bold">مختارات من {copy.content}</h2><p className="text-[10px] text-slate-500">أبرز ما يقدمه النشاط</p></div><button onClick={()=>setSection('catalog')} className="text-[10px] font-bold text-emerald-700">عرض الجميع</button></div><div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{featured.map(item=><article key={item.id} className="overflow-hidden rounded-[1.5rem] bg-white shadow-sm"><button onClick={()=>openItem(item.id)} className="w-full text-right"><div className="aspect-[4/3] bg-slate-100">{images[item.id]?<img src={images[item.id]} alt="" loading="lazy" className="h-full w-full object-cover"/>:<div className="flex h-full items-center justify-center"><ImageIcon className="h-7 w-7 text-slate-300"/></div>}</div><div className="p-3"><h3 className="line-clamp-1 text-xs font-bold">{item.title}</h3><p className="mt-2 text-[11px] font-bold">{priceLabel(item)}</p></div></button></article>)}</div></section>}
        <section className="grid gap-3 sm:grid-cols-2"><article className="rounded-3xl bg-white p-4 shadow-sm"><div className="flex items-center gap-2"><Clock className="h-5 w-5 text-emerald-600"/><h3 className="text-sm font-bold">الدوام اليوم</h3></div><p className="mt-3 text-xs text-slate-600">{status.label}</p></article><article className="rounded-3xl bg-white p-4 shadow-sm"><div className="flex items-center gap-2"><MapPin className="h-5 w-5 text-emerald-600"/><h3 className="text-sm font-bold">الموقع</h3></div><p className="mt-3 text-xs leading-6 text-slate-600">{profile.address_text||`${profile.city}، ${profile.governorate}`}</p></article></section>
      </>}

      {section==='catalog'&&<section className="space-y-3"><div><h2 className="text-base font-bold">{copy.content}</h2><p className="mt-1 text-[10px] text-slate-500">العناصر المنشورة والمتاحة</p></div>{catalog.length?<div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{catalog.map(item=><article key={item.id} className="overflow-hidden rounded-[1.5rem] bg-white shadow-sm"><button onClick={()=>openItem(item.id)} className="w-full text-right"><div className="aspect-[4/3] bg-slate-100">{images[item.id]?<img src={images[item.id]} alt="" loading="lazy" className="h-full w-full object-cover"/>:<div className="flex h-full items-center justify-center"><ImageIcon className="h-8 w-8 text-slate-300"/></div>}</div><div className="space-y-2 p-3"><span className="text-[9px] text-slate-400">{item.item_type||copy.singular}</span><h3 className="line-clamp-1 text-xs font-bold">{item.title}</h3>{item.description&&<p className="line-clamp-2 text-[10px] leading-5 text-slate-500">{item.description}</p>}<p className="text-[11px] font-bold">{priceLabel(item)}</p></div></button></article>)}</div>:<p className="rounded-3xl bg-white p-8 text-center text-xs text-slate-400">لا توجد عناصر منشورة حاليًا.</p>}</section>}

      {section==='hours'&&<section className="rounded-3xl bg-white p-4 shadow-sm"><div className="flex items-center gap-2 pb-3"><Clock className="h-5 w-5"/><h2 className="text-sm font-bold">ساعات العمل</h2></div><div className="space-y-1">{DAYS.map(([key,label])=>{const h=profile.working_hours?.[key];return <div key={key} className="flex justify-between rounded-xl px-2 py-3 text-xs even:bg-slate-50"><strong>{label}</strong><span className="text-slate-500">{!h||h.closed?'مغلق':`${h.open||'--'} - ${h.close||'--'}`}</span></div>})}</div></section>}

      {section==='financial'&&<section className="space-y-3"><div className="flex items-center gap-2"><WalletCards className="h-5 w-5"/><h2 className="text-sm font-bold">الحسابات المالية</h2></div>{accounts.map(a=><article key={a.id} className="rounded-3xl bg-white p-4 shadow-sm"><h3 className="text-xs font-bold">{a.name}</h3>{a.is_multicurrency?<div className="mt-3 space-y-2">{Object.entries(a.accounts||{}).filter(([,v])=>v).map(([k,v])=><div key={k} className="flex items-center justify-between rounded-xl bg-slate-50 p-3 text-xs"><span>{k}</span><strong>{v}</strong><button onClick={()=>void navigator.clipboard.writeText(String(v))}><Copy className="h-4 w-4 text-slate-400"/></button></div>)}</div>:<div className="mt-3 flex items-center gap-2 rounded-xl bg-slate-50 p-3 text-xs"><strong className="flex-1 text-left">{a.account_number}</strong><button onClick={()=>void navigator.clipboard.writeText(a.account_number||'')}><Copy className="h-4 w-4 text-slate-400"/></button></div>}</article>)}</section>}

      {section==='contact'&&<section className="space-y-3"><article className="rounded-3xl bg-white p-4 shadow-sm"><h2 className="text-sm font-bold">التواصل والموقع</h2><p className="mt-3 flex items-start gap-2 text-xs leading-6 text-slate-600"><MapPin className="mt-1 h-4 w-4 shrink-0 text-emerald-600"/>{profile.address_text||`${profile.city}، ${profile.governorate}`}</p><div className="mt-4 grid grid-cols-2 gap-2">{whatsapp&&<a href={`https://wa.me/${whatsapp}`} className="flex items-center justify-center gap-2 rounded-2xl bg-emerald-50 p-3 text-xs font-bold text-emerald-700"><MessageCircle className="h-4 w-4"/>واتساب</a>} {whatsapp&&<a href={`tel:+${whatsapp}`} className="flex items-center justify-center gap-2 rounded-2xl bg-slate-100 p-3 text-xs font-bold"><Phone className="h-4 w-4"/>اتصال</a>}</div>{social.length>0&&<div className="mt-3 grid grid-cols-2 gap-2">{social.map(({label,href,Icon})=><a key={label} href={href} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-2xl border border-slate-200 p-3 text-xs font-bold"><Icon className="h-4 w-4"/>{label}</a>)}</div>}</article></section>}

      {section==='about'&&<section className="rounded-3xl bg-white p-5 shadow-sm"><h2 className="text-base font-bold">عن {profile.name}</h2><p className="mt-3 text-xs leading-7 text-slate-600">{profile.description||'لا توجد نبذة منشورة.'}</p></section>}
    </main>
  </div>;
}

import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight, ChevronDown, Clock, ExternalLink, Facebook, Globe2,
  Image as ImageIcon, Instagram, Loader2, MapPin, MessageCircle,
  Package, ShieldCheck, Store, UserCheck, WalletCards
} from 'lucide-react';
import {
  getBusinessMediaSignedUrl, getPublicBusinessProfile, getUserBusinessContexts,
  joinBusinessAsCustomer, type PublicBusinessDetail
} from '../../lib/businessApi';
import { toLatinDigits } from '../../lib/digits';

interface Props {
  slug: string;
  onNavigate: (page: string, token?: string) => void;
  initialTab?: 'overview' | 'products' | 'services' | 'financial' | 'complaints';
}

type Mode = 'intro' | 'details';
type Section = 'catalog' | 'hours' | 'accounts';
type FeatureValue = string | number | boolean | null | { legacy_price_text?: string | null };
type CatalogItem = {
  id:string; title:string; description?:string|null; item_type?:string; price?:number|null; currency?:string|null;
  image_paths?:string[]|null; is_featured?:boolean; availability_status?:string; contact_action?:string; features?:FeatureValue[]|null;
};
type FinancialAccount = { id:string; name:string; is_multicurrency:boolean; account_number?:string|null; accounts?:Record<string,string|null>|null };
type ContactLinks = { website?:string|null; facebook?:string|null; instagram?:string|null; twitter?:string|null; x?:string|null };
type Profile = PublicBusinessDetail & {
  display_tagline?:string|null; address_text?:string|null; contact_links?:ContactLinks|null; catalog_items?:CatalogItem[];
  profile_sections?:{financial_accounts?:FinancialAccount[]}; working_hours?:Record<string,{open?:string;close?:string;closed?:boolean}>;
  horizontal_cover_image_path?:string|null;
};

const DAYS = [['saturday','السبت'],['sunday','الأحد'],['monday','الإثنين'],['tuesday','الثلاثاء'],['wednesday','الأربعاء'],['thursday','الخميس'],['friday','الجمعة']] as const;
const SECTIONS: Array<{id:Section;label:string}> = [
  {id:'catalog',label:'الكتالوج'}, {id:'hours',label:'ساعات العمل'}, {id:'accounts',label:'الحسابات المالية'}
];

function phone(value?:string|null){ return toLatinDigits(value||'').replace(/\D/g,''); }
function normalizeHref(value:string){ return /^https?:\/\//i.test(value) ? value : `https://${value}`; }
function legacyPrice(item: CatalogItem) {
  const feature = item.features?.find((value): value is { legacy_price_text?: string | null } => Boolean(value && typeof value === 'object' && 'legacy_price_text' in value));
  return feature?.legacy_price_text?.trim() || '';
}
function priceLabel(item:CatalogItem){
  if(item.price!=null) return `${new Intl.NumberFormat('en-US',{maximumFractionDigits:2}).format(item.price)}${item.currency?` ${item.currency}`:''}`;
  return legacyPrice(item) || 'السعر عند الطلب';
}
function setProfileView(view:'intro'|'details',section?:Section){
  const url=new URL(window.location.href);
  if(view==='intro'){url.searchParams.delete('view');url.searchParams.delete('section');}
  else{url.searchParams.set('view','details');url.searchParams.set('section',section||'catalog');}
  window.history.replaceState(window.history.state,'',`${url.pathname}${url.search}${url.hash}`);
}

export default function PublicBusinessProfileV2({slug,onNavigate,initialTab}:Props){
  const params=new URLSearchParams(window.location.search);
  const requestedDetails=params.get('view')==='details';
  const requestedSection=params.get('section') as Section|null;
  const [profile,setProfile]=useState<Profile|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState<string|null>(null);
  const [mode,setMode]=useState<Mode>(requestedDetails||(initialTab&&initialTab!=='overview')?'details':'intro');
  const [section,setSection]=useState<Section>(requestedSection&&SECTIONS.some(x=>x.id===requestedSection)?requestedSection:initialTab==='financial'?'accounts':'catalog');
  const [menu,setMenu]=useState(false);
  const [linked,setLinked]=useState(false);
  const [linking,setLinking]=useState(false);
  const [logo,setLogo]=useState('');
  const [cover,setCover]=useState('');
  const [horizontalCover,setHorizontalCover]=useState('');
  const [images,setImages]=useState<Record<string,string>>({});

  useEffect(()=>{
    let active=true;
    (async()=>{
      setLoading(true);setError(null);
      try{
        const data=await getPublicBusinessProfile(slug) as Profile;
        if(!active)return;
        setProfile(data);
        const contexts=await getUserBusinessContexts().catch(()=>null);
        if(active)setLinked(Boolean(contexts?.customer_businesses?.some(b=>b.id===data.id)));
        const catalog=Array.isArray(data.catalog_items)?data.catalog_items:[];
        const [entries,l,c,h]=await Promise.all([
          Promise.all(catalog.map(async item=>[item.id,item.image_paths?.[0]?await getBusinessMediaSignedUrl(item.image_paths[0]):''] as const)),
          data.profile_image_path||data.logo_path?getBusinessMediaSignedUrl(data.profile_image_path||data.logo_path||''):Promise.resolve(''),
          data.cover_image_path?getBusinessMediaSignedUrl(data.cover_image_path):Promise.resolve(''),
          data.horizontal_cover_image_path?getBusinessMediaSignedUrl(data.horizontal_cover_image_path):Promise.resolve('')
        ]);
        if(active){setLogo(l);setCover(c);setHorizontalCover(h);setImages(Object.fromEntries(entries));}
      }catch(e){if(active)setError(e instanceof Error?e.message:'تعذر تحميل الملف العام.');}
      finally{if(active)setLoading(false);}
    })();
    return()=>{active=false};
  },[slug]);

  const catalog=useMemo(()=>profile?.catalog_items?.slice(0,10)||[],[profile]);
  const accounts=profile?.profile_sections?.financial_accounts||[];
  const whatsapp=phone(profile?.whatsapp);
  const links=profile?.contact_links||{};
  const socialLinks=[
    links.website&&{label:'الموقع الإلكتروني',href:normalizeHref(links.website),Icon:Globe2},
    links.facebook&&{label:'فيسبوك',href:normalizeHref(links.facebook),Icon:Facebook},
    links.instagram&&{label:'إنستغرام',href:normalizeHref(links.instagram),Icon:Instagram},
    (links.twitter||links.x)&&{label:'X',href:normalizeHref(links.twitter||links.x||''),Icon:ExternalLink}
  ].filter(Boolean) as Array<{label:string;href:string;Icon:typeof Globe2}>;

  const join=async()=>{if(!profile||linked)return;setLinking(true);try{await joinBusinessAsCustomer(profile.id,'public_profile');setLinked(true);}catch(e){setError(e instanceof Error?e.message:'تعذر الارتباط بالنشاط.');}finally{setLinking(false);}};
  const leave=()=>window.history.length>1?window.history.back():onNavigate('profile');
  const openDetails=(next:Section)=>{setMode('details');setSection(next);setProfileView('details',next);window.scrollTo(0,0)};
  const backToIntro=()=>{setMode('intro');setMenu(false);setProfileView('intro');window.scrollTo(0,0)};
  const selectSection=(next:Section)=>{setSection(next);setMenu(false);setProfileView('details',next)};
  const openItem=(id:string)=>{setProfileView('details','catalog');onNavigate('public-product-detail',`${profile?.slug}/${id}`)};

  if(loading)return <div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="h-7 w-7 animate-spin"/></div>;
  if(!profile||error)return <div className="mx-auto my-12 max-w-sm rounded-[2rem] bg-white p-6 text-center shadow-sm"><p className="text-xs">{error||'النشاط غير موجود.'}</p><button onClick={leave} className="mt-4 text-xs font-bold">العودة</button></div>;

  if(mode==='intro')return <div className="min-h-screen bg-white p-2 font-arabic sm:p-3" dir="rtl"><div className="relative mx-auto min-h-[calc(100dvh-16px)] max-w-xl overflow-hidden rounded-[1.75rem] bg-slate-200 shadow-[0_24px_70px_rgba(15,23,42,0.16)] sm:min-h-[calc(100dvh-24px)] sm:rounded-[2rem]">
    {cover?<img src={cover} alt={profile.name} fetchPriority="high" decoding="async" className="absolute inset-0 h-full w-full object-cover"/>:<div className="absolute inset-0 bg-gradient-to-br from-slate-300 to-slate-600"/>}<div className="absolute inset-0 bg-gradient-to-b from-transparent via-slate-950/5 to-slate-950/90"/>
    <button onClick={leave} className="absolute right-4 top-4 z-10 rounded-2xl bg-white/92 p-3 text-slate-800 shadow-lg"><ArrowRight className="h-5 w-5"/></button>
    <div className="absolute inset-x-0 bottom-0 z-10 space-y-4 p-5 text-white sm:p-6">
      <div className="flex items-end gap-4"><div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-3xl bg-white p-2 shadow-xl">{logo?<img src={logo} decoding="async" className="h-full w-full object-contain"/>:<Store className="h-8 w-8 text-slate-500"/>}</div><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><h1 className="truncate text-2xl font-bold">{profile.name}</h1>{profile.verification_status==='verified'&&<ShieldCheck className="h-5 w-5 text-emerald-300"/>}</div><p className="mt-1 text-xs text-white/75">{profile.display_tagline||profile.category_name||'نشاط تجاري'}</p><div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-white/70"><span className="flex items-center gap-1"><Package className="h-3.5 w-3.5"/>{profile.category_name||'عام'}</span><span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5"/>{profile.city}، {profile.governorate}</span>{catalog.length>0&&<span>{catalog.length} عناصر</span>}</div></div></div>
      <p className="line-clamp-3 text-sm leading-7 text-white/88">{profile.description||'استعرض معلومات النشاط وعناصر الكتالوج وطرق التواصل.'}</p>
      <div className="grid grid-cols-2 gap-3"><button onClick={()=>void join()} disabled={linked||linking} className="flex items-center justify-center gap-2 rounded-2xl bg-white p-3.5 text-xs font-bold text-slate-950 shadow-lg disabled:bg-emerald-100 disabled:text-emerald-800">{linking?<Loader2 className="h-4 w-4 animate-spin"/>:<UserCheck className="h-4 w-4"/>}{linked?'مرتبط بالنشاط':'الارتباط كعميل'}</button><button onClick={()=>openDetails('catalog')} className="flex items-center justify-center gap-2 rounded-2xl bg-white/14 p-3.5 text-xs font-bold backdrop-blur">استعراض الملف<ExternalLink className="h-4 w-4"/></button></div>
    </div>
  </div></div>;

  return <div className="min-h-screen bg-[#f7f8fa] pb-16 font-arabic" dir="rtl"><header className="sticky top-0 z-30 mx-1 flex items-center gap-3 rounded-b-2xl bg-white/95 p-3 shadow-[0_1px_16px_rgba(15,23,42,0.05)] backdrop-blur sm:mx-2"><button onClick={backToIntro} className="rounded-xl bg-slate-100 p-2.5"><ArrowRight className="h-4 w-4"/></button><div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-2xl bg-white p-1.5 shadow-sm">{logo?<img src={logo} decoding="async" className="h-full w-full object-contain"/>:<Store className="h-5 w-5"/>}</div><div className="min-w-0 flex-1"><h1 className="truncate text-sm font-bold">{profile.name}</h1><p className="text-[10px] text-slate-500">{profile.category_name||'عام'} · {profile.city}، {profile.governorate}</p></div>{whatsapp&&<a href={`https://wa.me/${whatsapp}`} className="rounded-xl bg-emerald-50 p-2.5 text-emerald-700"><MessageCircle className="h-5 w-5"/></a>}</header>
    <main className="mx-auto max-w-5xl space-y-4 px-2 py-3 sm:px-3">
      <section className="overflow-hidden rounded-[1.65rem] bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950 text-white shadow-[0_16px_42px_rgba(15,23,42,0.16)]">
        {horizontalCover&&<div className="aspect-[16/7] w-full bg-slate-800"><img src={horizontalCover} alt={`غلاف ${profile.name}`} fetchPriority="high" decoding="async" className="h-full w-full object-cover"/></div>}
        <div className="p-5">
          <div className="flex items-center gap-2"><h2 className="text-lg font-bold">{profile.name}</h2>{profile.verification_status==='verified'&&<ShieldCheck className="h-4 w-4 text-emerald-300"/>}</div>
          <p className="mt-1 text-xs text-white/65">{profile.display_tagline||profile.category_name||'نشاط تجاري'}</p>
          <p className="mt-4 text-xs leading-7 text-white/82">{profile.description||'لا يوجد وصف منشور لهذا النشاط.'}</p>
          <div className="mt-4 grid gap-2 text-[10px] text-white/72 sm:grid-cols-2"><p className="flex items-start gap-2"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300"/>{profile.address_text||`${profile.city}، ${profile.governorate}`}</p><p className="flex items-center gap-2"><Package className="h-4 w-4 text-emerald-300"/>{profile.category_name||'تصنيف عام'} · {catalog.length} عناصر منشورة</p></div>
          {(socialLinks.length>0||whatsapp)&&<div className="mt-4 flex flex-wrap gap-2">{whatsapp&&<a href={`https://wa.me/${whatsapp}`} className="flex items-center gap-1.5 rounded-full bg-emerald-400/15 px-3 py-2 text-[10px] font-bold text-emerald-200"><MessageCircle className="h-3.5 w-3.5"/>واتساب</a>}{socialLinks.map(({label,href,Icon})=><a key={label} href={href} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-2 text-[10px] font-bold"><Icon className="h-3.5 w-3.5"/>{label}</a>)}</div>}
        </div>
      </section>
      <section className="rounded-[1.65rem] bg-white shadow-[0_10px_30px_rgba(15,23,42,0.05)]"><button onClick={()=>setMenu(v=>!v)} className="flex w-full items-center gap-3 p-4"><Store className="h-5 w-5"/><div className="flex-1 text-right"><span className="block text-[9px] text-slate-400">قسم الملف العام</span><strong className="text-sm">{SECTIONS.find(x=>x.id===section)?.label}</strong></div><ChevronDown className={`h-5 w-5 transition-transform ${menu?'rotate-180':''}`}/></button>{menu&&<div className="grid grid-cols-3 gap-2 px-3 pb-3">{SECTIONS.map(x=><button key={x.id} onClick={()=>selectSection(x.id)} className={`rounded-xl p-3 text-[10px] font-bold ${section===x.id?'bg-slate-900 text-white':'bg-slate-50 text-slate-700'}`}>{x.label}</button>)}</div>}</section>
      {section==='catalog'&&<section className="space-y-3"><div><h2 className="text-base font-bold">كتالوج النشاط</h2><p className="mt-1 text-[10px] text-slate-500">العناصر والخدمات والعروض المنشورة</p></div>{catalog.length?<div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{catalog.map(item=><article key={item.id} className="overflow-hidden rounded-[1.5rem] bg-white shadow-[0_10px_28px_rgba(15,23,42,0.06)]"><button onClick={()=>openItem(item.id)} className="w-full text-right"><div className="aspect-[4/3] bg-slate-100">{images[item.id]?<img src={images[item.id]} loading="lazy" decoding="async" className="h-full w-full object-cover"/>:<div className="flex h-full items-center justify-center"><ImageIcon className="h-8 w-8 text-slate-300"/></div>}</div><div className="space-y-2 p-3"><span className="text-[9px] text-slate-400">{item.item_type||'عنصر'}</span><h3 className="line-clamp-1 text-xs font-bold">{item.title}</h3>{item.description&&<p className="line-clamp-2 text-[10px] leading-5 text-slate-500">{item.description}</p>}<p className="text-[11px] font-bold text-slate-900">{priceLabel(item)}</p></div></button></article>)}</div>:<p className="rounded-[1.5rem] bg-white p-8 text-center text-xs text-slate-400 shadow-sm">لا توجد عناصر منشورة.</p>}</section>}
      {section==='hours'&&<section className="rounded-[1.75rem] bg-white p-4 shadow-[0_10px_30px_rgba(15,23,42,0.05)]"><div className="flex gap-2 pb-3"><Clock className="h-5 w-5"/><h2 className="text-sm font-bold">ساعات العمل</h2></div><div className="space-y-1">{DAYS.map(([key,label])=>{const h=profile.working_hours?.[key];return <div key={key} className="flex justify-between rounded-xl px-2 py-3 text-xs even:bg-slate-50"><strong>{label}</strong><span className="text-slate-500">{!h||h.closed?'مغلق':`${h.open||'--'} - ${h.close||'--'}`}</span></div>})}</div></section>}
      {section==='accounts'&&<section className="space-y-3"><div className="flex items-center gap-2"><WalletCards className="h-5 w-5"/><h2 className="text-sm font-bold">الحسابات المالية</h2></div>{accounts.length?accounts.map(a=><article key={a.id} className="rounded-[1.5rem] bg-white p-4 shadow-[0_10px_28px_rgba(15,23,42,0.05)]"><h3 className="text-xs font-bold">{a.name}</h3>{a.is_multicurrency?<div className="mt-3 space-y-2">{Object.entries(a.accounts||{}).filter(([,v])=>v).map(([k,v])=><div key={k} className="flex justify-between rounded-xl bg-slate-50 p-3 text-xs"><span>{k}</span><strong>{v}</strong></div>)}</div>:<p className="mt-3 rounded-xl bg-slate-50 p-3 text-left text-xs">{a.account_number}</p>}</article>):<p className="rounded-[1.5rem] bg-white p-8 text-center text-xs text-slate-400 shadow-sm">لا توجد حسابات مالية منشورة.</p>}</section>}
    </main></div>;
}

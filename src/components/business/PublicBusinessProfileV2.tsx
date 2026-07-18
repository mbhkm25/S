import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, ChevronDown, Clock, ExternalLink, Image as ImageIcon, Loader2, MapPin, MessageCircle, Package, ShieldCheck, Store, UserCheck, WalletCards } from 'lucide-react';
import { getBusinessMediaSignedUrl, getPublicBusinessProfile, getUserBusinessContexts, joinBusinessAsCustomer, type PublicBusinessDetail } from '../../lib/businessApi';
import { toLatinDigits } from '../../lib/digits';

interface Props {
  slug: string;
  onNavigate: (page: string, token?: string) => void;
  initialTab?: 'overview' | 'products' | 'services' | 'financial' | 'complaints';
}
type Mode = 'intro' | 'details';
type Section = 'catalog' | 'overview' | 'hours' | 'accounts' | 'contact';
type CatalogItem = { id:string; title:string; description?:string|null; item_type?:string; price?:number|null; currency?:string|null; image_paths?:string[]|null; is_featured?:boolean; availability_status?:string; contact_action?:string };
type FinancialAccount = { id:string; name:string; is_multicurrency:boolean; account_number?:string|null; accounts?:Record<string,string|null>|null };
type Profile = PublicBusinessDetail & { display_tagline?:string|null; address_text?:string|null; contact_links?:Record<string,string|null>|null; catalog_items?:CatalogItem[]; profile_sections?:{financial_accounts?:FinancialAccount[]}; working_hours?:Record<string,{open?:string;close?:string;closed?:boolean}> };

const DAYS = [['saturday','السبت'],['sunday','الأحد'],['monday','الاثنين'],['tuesday','الثلاثاء'],['wednesday','الأربعاء'],['thursday','الخميس'],['friday','الجمعة']] as const;
const SECTIONS: Array<{id:Section;label:string}> = [
  {id:'catalog',label:'الكتالوج'},{id:'overview',label:'نظرة عامة'},{id:'hours',label:'ساعات العمل'},{id:'accounts',label:'الحسابات المالية'},{id:'contact',label:'التواصل والموقع'}
];
function phone(value?:string|null){return toLatinDigits(value||'').replace(/\D/g,'');}
function price(item:CatalogItem){return item.price==null?'السعر عند الطلب':`${new Intl.NumberFormat('en-US',{maximumFractionDigits:2}).format(item.price)}${item.currency?` ${item.currency}`:''}`;}

export default function PublicBusinessProfileV2({slug,onNavigate,initialTab}:Props){
  const [profile,setProfile]=useState<Profile|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState<string|null>(null);
  const [mode,setMode]=useState<Mode>(initialTab&&initialTab!=='overview'?'details':'intro');
  const [section,setSection]=useState<Section>(initialTab==='financial'?'accounts':initialTab==='products'||initialTab==='services'?'catalog':'overview');
  const [menu,setMenu]=useState(false);
  const [linked,setLinked]=useState(false);
  const [linking,setLinking]=useState(false);
  const [logo,setLogo]=useState('');
  const [cover,setCover]=useState('');
  const [images,setImages]=useState<Record<string,string>>({});

  useEffect(()=>{let active=true;(async()=>{setLoading(true);setError(null);try{
    const data=await getPublicBusinessProfile(slug) as Profile;if(!active)return;setProfile(data);
    const contexts=await getUserBusinessContexts().catch(()=>null);if(active)setLinked(Boolean(contexts?.customer_businesses?.some(b=>b.id===data.id)));
    const catalog=Array.isArray(data.catalog_items)?data.catalog_items:[];
    const entries=await Promise.all(catalog.map(async item=>[item.id,item.image_paths?.[0]?await getBusinessMediaSignedUrl(item.image_paths[0]):''] as const));
    const [l,c]=await Promise.all([data.profile_image_path||data.logo_path?getBusinessMediaSignedUrl(data.profile_image_path||data.logo_path||''):Promise.resolve(''),data.cover_image_path?getBusinessMediaSignedUrl(data.cover_image_path):Promise.resolve('')]);
    if(active){setLogo(l);setCover(c);setImages(Object.fromEntries(entries));}
  }catch(e){if(active)setError(e instanceof Error?e.message:'تعذر تحميل الملف العام.');}finally{if(active)setLoading(false);}})();return()=>{active=false};},[slug]);

  const catalog=useMemo(()=>profile?.catalog_items?.slice(0,10)||[],[profile]);
  const accounts=profile?.profile_sections?.financial_accounts||[];
  const whatsapp=phone(profile?.whatsapp);
  const join=async()=>{if(!profile||linked)return;setLinking(true);try{await joinBusinessAsCustomer(profile.id,'public_profile');setLinked(true);}catch(e){setError(e instanceof Error?e.message:'تعذر الارتباط بالنشاط.');}finally{setLinking(false);}};
  const leave=()=>window.history.length>1?window.history.back():onNavigate('business-community');

  if(loading)return <div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="h-7 w-7 animate-spin"/></div>;
  if(!profile||error)return <div className="mx-auto my-12 max-w-sm rounded-3xl border bg-white p-6 text-center"><p className="text-xs">{error||'النشاط غير موجود.'}</p><button onClick={leave} className="mt-4 text-xs font-bold">العودة</button></div>;

  if(mode==='intro')return <div className="min-h-screen bg-white p-3 font-arabic" dir="rtl"><div className="relative mx-auto min-h-[calc(100dvh-24px)] max-w-xl overflow-hidden rounded-[2rem] bg-slate-900 shadow-xl">
    {cover?<img src={cover} alt={profile.name} className="absolute inset-0 h-full w-full object-cover"/>:<div className="absolute inset-0 bg-gradient-to-br from-slate-500 to-slate-950"/>}<div className="absolute inset-0 bg-gradient-to-b from-transparent via-slate-950/10 to-slate-950/90"/>
    <button onClick={leave} className="absolute right-4 top-4 z-10 rounded-2xl bg-white/90 p-3"><ArrowRight className="h-5 w-5"/></button>
    <div className="absolute inset-x-0 bottom-0 z-10 space-y-5 p-6 text-white"><div className="flex items-end gap-4"><div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-3xl bg-white">{logo?<img src={logo} className="h-full w-full object-cover"/>:<Store className="h-8 w-8 text-slate-500"/>}</div><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><h1 className="truncate text-2xl font-bold">{profile.name}</h1>{profile.verification_status==='verified'&&<ShieldCheck className="h-5 w-5 text-emerald-300"/>}</div><p className="mt-1 text-xs text-white/70">{profile.display_tagline||profile.category_name}</p><p className="mt-2 flex items-center gap-1 text-[11px] text-white/65"><MapPin className="h-4 w-4"/>{profile.city}، {profile.governorate}</p></div></div><p className="text-sm leading-7 text-white/85">{profile.description||'استعرض معلومات النشاط وعناصر الكتالوج وطرق التواصل.'}</p><div className="grid grid-cols-2 gap-3"><button onClick={()=>void join()} disabled={linked||linking} className="flex items-center justify-center gap-2 rounded-2xl bg-white p-3.5 text-xs font-bold text-slate-950 disabled:bg-emerald-100 disabled:text-emerald-800">{linking?<Loader2 className="h-4 w-4 animate-spin"/>:<UserCheck className="h-4 w-4"/>}{linked?'مرتبط بالنشاط':'الارتباط كعميل'}</button><button onClick={()=>{setMode('details');setSection(catalog.length?'catalog':'overview');window.scrollTo(0,0)}} className="flex items-center justify-center gap-2 rounded-2xl border border-white/25 bg-white/10 p-3.5 text-xs font-bold">استعراض الملف<ExternalLink className="h-4 w-4"/></button></div></div>
  </div></div>;

  return <div className="min-h-screen bg-slate-50 pb-16 font-arabic" dir="rtl"><header className="sticky top-0 z-30 flex items-center gap-3 border-b bg-white/95 p-3 backdrop-blur"><button onClick={()=>setMode('intro')} className="rounded-xl border p-2.5"><ArrowRight className="h-4 w-4"/></button><div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-2xl border bg-white">{logo?<img src={logo} className="h-full w-full object-cover"/>:<Store className="h-5 w-5"/>}</div><div className="min-w-0 flex-1"><h1 className="truncate text-sm font-bold">{profile.name}</h1><p className="text-[10px] text-slate-500">{profile.city}، {profile.governorate}</p></div>{whatsapp&&<a href={`https://wa.me/${whatsapp}`} className="rounded-xl bg-emerald-50 p-2.5 text-emerald-700"><MessageCircle className="h-5 w-5"/></a>}</header>
    <main className="mx-auto max-w-5xl space-y-4 p-3"><section className="rounded-2xl border bg-white"><button onClick={()=>setMenu(v=>!v)} className="flex w-full items-center gap-3 p-4"><Store className="h-5 w-5"/><div className="flex-1 text-right"><span className="block text-[9px] text-slate-400">قسم الملف العام</span><strong className="text-sm">{SECTIONS.find(x=>x.id===section)?.label}</strong></div><ChevronDown className="h-5 w-5"/></button>{menu&&<div className="grid grid-cols-2 gap-2 border-t p-2">{SECTIONS.map(x=><button key={x.id} onClick={()=>{setSection(x.id);setMenu(false)}} className={`rounded-xl p-3 text-xs font-bold ${section===x.id?'bg-slate-900 text-white':'bg-slate-50'}`}>{x.label}</button>)}</div>}</section>
    {section==='catalog'&&<section className="space-y-3"><h2 className="text-sm font-bold">كتالوج النشاط</h2>{catalog.length?<div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{catalog.map(item=><article key={item.id} className="overflow-hidden rounded-2xl border bg-white"><button onClick={()=>onNavigate('public-product-detail',`${profile.slug}/${item.id}`)} className="w-full text-right"><div className="aspect-[4/3] bg-slate-100">{images[item.id]?<img src={images[item.id]} className="h-full w-full object-cover"/>:<div className="flex h-full items-center justify-center"><ImageIcon className="h-8 w-8 text-slate-300"/></div>}</div><div className="p-3"><h3 className="text-xs font-bold">{item.title}</h3><p className="mt-2 text-[10px] font-bold">{price(item)}</p></div></button></article>)}</div>:<p className="rounded-2xl border bg-white p-8 text-center text-xs text-slate-400">لا توجد عناصر منشورة.</p>}</section>}
    {section==='overview'&&<section className="rounded-2xl border bg-white p-5"><h2 className="text-lg font-bold">{profile.name}</h2><p className="mt-3 text-xs leading-7 text-slate-600">{profile.description||'لا يوجد وصف.'}</p><div className="mt-4 grid grid-cols-2 gap-3 border-t pt-4 text-xs"><div><span className="text-slate-400">التصنيف</span><strong className="mt-1 block">{profile.category_name||'عام'}</strong></div><div><span className="text-slate-400">الموقع</span><strong className="mt-1 block">{profile.city}، {profile.governorate}</strong></div></div></section>}
    {section==='hours'&&<section className="rounded-2xl border bg-white"><div className="flex gap-2 border-b p-4"><Clock className="h-5 w-5"/><h2 className="text-sm font-bold">ساعات العمل</h2></div><div className="divide-y px-4">{DAYS.map(([key,label])=>{const h=profile.working_hours?.[key];return <div key={key} className="flex justify-between py-3 text-xs"><strong>{label}</strong><span className="text-slate-500">{!h||h.closed?'مغلق':`${h.open||'--'} - ${h.close||'--'}`}</span></div>})}</div></section>}
    {section==='accounts'&&<section className="space-y-3"><div className="flex items-center gap-2"><WalletCards className="h-5 w-5"/><h2 className="text-sm font-bold">الحسابات المالية</h2></div>{accounts.length?accounts.map(a=><article key={a.id} className="rounded-2xl border bg-white p-4"><h3 className="text-xs font-bold">{a.name}</h3>{a.is_multicurrency?<div className="mt-3 space-y-2">{Object.entries(a.accounts||{}).filter(([,v])=>v).map(([k,v])=><div key={k} className="flex justify-between rounded-xl bg-slate-50 p-3 text-xs"><span>{k}</span><strong className="font-mono">{v}</strong></div>)}</div>:<p className="mt-3 rounded-xl bg-slate-50 p-3 text-left font-mono text-xs">{a.account_number}</p>}</article>):<p className="rounded-2xl border bg-white p-8 text-center text-xs text-slate-400">لا توجد حسابات مالية منشورة.</p>}</section>}
    {section==='contact'&&<section className="space-y-3 rounded-2xl border bg-white p-5"><h2 className="text-sm font-bold">التواصل والموقع</h2><p className="flex items-start gap-2 text-xs text-slate-600"><MapPin className="h-4 w-4"/>{profile.address_text||`${profile.city}، ${profile.governorate}`}</p>{whatsapp&&<a href={`https://wa.me/${whatsapp}`} className="flex justify-center gap-2 rounded-2xl bg-emerald-600 p-3 text-xs font-bold text-white"><MessageCircle className="h-4 w-4"/>تواصل عبر واتساب</a>}</section>}
    </main></div>;
}

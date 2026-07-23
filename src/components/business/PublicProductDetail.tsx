import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight, Check, Copy, Image as ImageIcon, Loader2,
  MessageCircle, Package, Share2, ShieldCheck
} from 'lucide-react';
import { getBusinessMediaSignedUrl, getPublicBusinessProfile } from '../../lib/businessApi';
import { formatCatalogPrice, normalizeCatalogSettings, type CatalogDisplaySettings } from '../../lib/businessCatalogExperience';
import { buildPublicProductUrl } from '../../lib/urlUtils';

type FeatureValue = string | number | boolean | null | { legacy_price_text?: string | null };
interface PublicProductDetailProps {
  businessSlug: string;
  productId: string;
  onNavigate: (page: string, token?: string) => void;
}
type CatalogItem = {
  id:string; title:string; description?:string|null; item_type?:string; price?:number|null;
  currency?:string|null; image_paths?:string[]|null; availability_status?:string;
  contact_action?:string; features?:FeatureValue[]|null; is_featured?:boolean;
};
type PublicProfile = {
  name:string;whatsapp?:string|null;category_name?:string|null;city?:string|null;governorate?:string|null;
  verification_status?:string|null;catalog_items?:CatalogItem[];catalog_display_settings?:CatalogDisplaySettings|null;
};

function availabilityLabel(value?:string){if(value==='unavailable')return'غير متاح حاليًا';if(value==='on_request')return'متاح عند الطلب';return'متاح';}
function typeLabel(value?:string){return({product:'منتج',service:'خدمة',digital:'عنصر رقمي',offer:'عرض',subscription:'اشتراك',other:'عنصر'} as Record<string,string>)[value||'']||'عنصر كتالوج';}
function legacyPrice(item:CatalogItem){const feature=item.features?.find((value):value is {legacy_price_text?:string|null}=>Boolean(value&&typeof value==='object'&&'legacy_price_text'in value));return feature?.legacy_price_text?.trim()||'';}

export default function PublicProductDetail({businessSlug,productId,onNavigate}:PublicProductDetailProps){
  const [loading,setLoading]=useState(true);const [error,setError]=useState<string|null>(null);
  const [profile,setProfile]=useState<PublicProfile|null>(null);const [item,setItem]=useState<CatalogItem|null>(null);
  const [imageUrls,setImageUrls]=useState<string[]>([]);const [activeImage,setActiveImage]=useState(0);
  const [shareStatus,setShareStatus]=useState<'idle'|'copied'|'failed'>('idle');

  useEffect(()=>{let active=true;(async()=>{setLoading(true);setError(null);setActiveImage(0);try{
    const decodedSlug=decodeURIComponent(businessSlug);const decodedProductId=decodeURIComponent(productId);
    const business=await getPublicBusinessProfile(decodedSlug) as PublicProfile;if(!active)return;
    const items=Array.isArray(business.catalog_items)?business.catalog_items:[];const found=items.find(candidate=>candidate.id===decodedProductId)||null;
    if(!found){setProfile(business);setError('لم يتم العثور على العنصر المطلوب في كتالوج النشاط.');return;}
    setProfile(business);setItem(found);const paths=Array.isArray(found.image_paths)?found.image_paths.filter(Boolean):[];
    const urls=(await Promise.all(paths.map(path=>getBusinessMediaSignedUrl(path).catch(()=>'')))).filter(Boolean);if(active)setImageUrls(urls);
  }catch(caught){if(active)setError(caught instanceof Error?caught.message:'تعذر تحميل تفاصيل العنصر.');}
  finally{if(active)setLoading(false);}})();return()=>{active=false};},[businessSlug,productId]);

  const settings=useMemo(()=>normalizeCatalogSettings(profile?.catalog_display_settings),[profile?.catalog_display_settings]);
  const itemUrl=buildPublicProductUrl(businessSlug,productId);
  const displayedPrice=item?formatCatalogPrice(item.price,item.currency,settings.price_display,legacyPrice(item)||settings.missing_price_label):'';
  const whatsappUrl=useMemo(()=>{
    if(!profile||!item||item.contact_action==='none'||item.availability_status==='unavailable')return'';
    const phone=String(profile.whatsapp||'').replace(/\D/g,'');if(!phone)return'';
    const priceLine=settings.show_prices?`\n${displayedPrice}`:'';
    const message=`مرحبًا، أريد الاستفسار عن ${item.title} المعروض في كتالوج ${profile.name} على سند.${priceLine}\n${itemUrl}`;
    return`https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
  },[displayedPrice,item,itemUrl,profile,settings.show_prices]);

  const copyText=async(text:string)=>{try{if(navigator.clipboard?.writeText)await navigator.clipboard.writeText(text);else{const area=document.createElement('textarea');area.value=text;area.style.position='fixed';area.style.opacity='0';document.body.appendChild(area);area.select();document.execCommand('copy');area.remove();}setShareStatus('copied');window.setTimeout(()=>setShareStatus('idle'),2200);}catch{setShareStatus('failed');window.setTimeout(()=>setShareStatus('idle'),2200);}};
  const handleShare=async()=>{if(!item)return;try{if(navigator.share){await navigator.share({title:item.title,text:`شاهد ${item.title} من كتالوج ${profile?.name||'النشاط'} على سند`,url:itemUrl});return;}}catch(caught){if(caught instanceof DOMException&&caught.name==='AbortError')return;}await copyText(itemUrl);};
  const goBack=()=>{if(window.history.length>1)window.history.back();else onNavigate('public-business-profile',businessSlug);};

  if(loading)return<div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-slate-800"/></div>;
  if(!item||error)return<div className="mx-auto my-12 max-w-sm rounded-[2rem] bg-white p-6 text-center font-arabic shadow-sm" dir="rtl"><p className="text-xs leading-6 text-slate-600">{error||'لم يتم العثور على العنصر.'}</p><button onClick={goBack} className="mt-4 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-bold text-white">العودة إلى النشاط</button></div>;

  const currentImage=imageUrls[activeImage]||'';
  return <div className="min-h-screen bg-[#f7f8fa] pb-24 font-arabic text-right" dir="rtl">
    <header className="sticky top-0 z-40 flex items-center justify-between bg-white/95 px-2 py-3 shadow-[0_1px_16px_rgba(15,23,42,0.05)] backdrop-blur sm:px-3"><button onClick={goBack} className="rounded-xl bg-slate-100 p-2.5 text-slate-700" aria-label="العودة"><ArrowRight className="h-4 w-4"/></button><h1 className="max-w-[58%] truncate text-xs font-bold text-slate-950">{item.title}</h1><button onClick={()=>void handleShare()} className="rounded-xl bg-slate-100 p-2.5 text-slate-700" aria-label="مشاركة">{shareStatus==='copied'?<Check className="h-4 w-4 text-emerald-600"/>:shareStatus==='failed'?<Copy className="h-4 w-4 text-rose-600"/>:<Share2 className="h-4 w-4"/>}</button></header>
    {shareStatus!=='idle'&&<div className={`fixed left-1/2 top-20 z-50 -translate-x-1/2 rounded-full px-4 py-2 text-[10px] font-bold text-white shadow-lg ${shareStatus==='copied'?'bg-emerald-600':'bg-rose-600'}`}>{shareStatus==='copied'?'تم نسخ رابط العنصر':'تعذر نسخ الرابط'}</div>}
    <main className="w-full space-y-3 px-0.5 py-3 sm:px-3 lg:px-5"><section className="overflow-hidden border-y border-slate-200 bg-white sm:rounded-[2rem] sm:border sm:shadow-[0_16px_44px_rgba(15,23,42,0.07)]"><div className="aspect-[4/3] bg-slate-100">{currentImage?<img src={currentImage} alt={item.title} fetchPriority="high" decoding="async" className="h-full w-full object-cover"/>:<div className="flex h-full items-center justify-center"><ImageIcon className="h-12 w-12 text-slate-300"/></div>}</div>{imageUrls.length>1&&<div className="flex gap-2 overflow-x-auto px-3 py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">{imageUrls.map((url,index)=><button key={url} type="button" onClick={()=>setActiveImage(index)} className={`h-16 w-20 shrink-0 overflow-hidden rounded-xl border-2 ${activeImage===index?'border-slate-900':'border-transparent'}`}><img src={url} alt={`${item.title} ${index+1}`} loading="lazy" decoding="async" className="h-full w-full object-cover"/></button>)}</div>}<div className="space-y-5 p-4 sm:p-5"><div className="flex items-start justify-between gap-4"><div className="min-w-0 flex-1"><p className="text-[10px] text-slate-400">{typeLabel(item.item_type)}</p><h2 className="mt-1 text-xl font-bold text-slate-950">{item.title}</h2></div><span className={`rounded-full px-3 py-1.5 text-[9px] font-bold ${item.availability_status==='unavailable'?'bg-rose-50 text-rose-700':'bg-emerald-50 text-emerald-700'}`}>{availabilityLabel(item.availability_status)}</span></div>{settings.show_prices&&<div className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3"><span className="text-[10px] font-bold text-slate-400">السعر</span><strong className="text-sm font-bold text-slate-950">{displayedPrice}</strong></div>}{item.description?<p className="whitespace-pre-line text-xs leading-7 text-slate-600">{item.description}</p>:<p className="text-xs text-slate-400">لم يضف النشاط وصفًا تفصيليًا لهذا العنصر بعد.</p>}<div className="grid grid-cols-2 gap-2 text-[10px]"><div className="rounded-2xl bg-slate-50 p-3"><span className="text-slate-400">النوع</span><strong className="mt-1 block">{typeLabel(item.item_type)}</strong></div><div className="rounded-2xl bg-slate-50 p-3"><span className="text-slate-400">التوفر</span><strong className="mt-1 block">{availabilityLabel(item.availability_status)}</strong></div></div></div></section><section className="border-y border-slate-200 bg-white p-4 sm:rounded-[1.5rem] sm:border sm:shadow-[0_10px_28px_rgba(15,23,42,0.05)]"><button onClick={()=>onNavigate('public-business-profile',businessSlug)} className="flex w-full items-center gap-3 text-right"><Package className="h-5 w-5 text-slate-600"/><div><p className="text-xs font-bold text-slate-900">من كتالوج {profile?.name}</p><p className="mt-1 text-[10px] text-slate-400">{profile?.category_name||'نشاط تجاري'} · {profile?.city}، {profile?.governorate}</p></div>{profile?.verification_status==='verified'&&<ShieldCheck className="mr-auto h-5 w-5 text-emerald-600"/>}</button></section></main>
    {whatsappUrl&&<div className="fixed inset-x-0 bottom-0 z-40 bg-white/95 px-2 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-[0_-8px_30px_rgba(15,23,42,0.06)] backdrop-blur sm:px-3"><a href={whatsappUrl} target="_blank" rel="noreferrer" className="flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-900 py-3.5 text-xs font-bold text-white"><MessageCircle className="h-5 w-5"/>استفسار عبر واتساب</a></div>}
  </div>;
}

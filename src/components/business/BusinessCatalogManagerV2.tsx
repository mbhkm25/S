import { useEffect, useMemo, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import {
  AlertCircle, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, ChevronUp,
  ExternalLink, EyeOff, ImagePlus, Loader2, Package, Pencil, Plus, Save, Star, Trash2
} from 'lucide-react';
import { getUserBusinessContexts, updateBusinessProfile, type BusinessProfile } from '../../lib/businessApi';
import {
  getBusinessCatalog, MAX_CATALOG_IMAGES, resolveCatalogImageUrl, uploadCatalogItemImage,
  upsertBusinessCatalogItem, type BusinessCatalogAvailability, type BusinessCatalogItem,
  type BusinessCatalogItemStatus, type BusinessCatalogItemType
} from '../../lib/businessCatalogApi';
import { getActiveManagedBusinessId, rememberActiveManagedBusiness } from '../../lib/businessManagementApi';
import { toLatinDigits } from '../../lib/digits';

interface Props { businessId?: string }
type ImageDraft = { path: string; url: string };
type EditorState = {
  itemId: string | null; title: string; description: string; itemType: BusinessCatalogItemType;
  price: string; currency: ''|'YER'|'SAR'|'USD'; status: BusinessCatalogItemStatus;
  isFeatured: boolean; availabilityStatus: BusinessCatalogAvailability; displayOrder: string;
  images: ImageDraft[];
};

const EMPTY_EDITOR: EditorState = {
  itemId:null,title:'',description:'',itemType:'product',price:'',currency:'',status:'active',
  isFeatured:false,availabilityStatus:'available',displayOrder:'100',images:[]
};
const TYPE_LABELS: Record<BusinessCatalogItemType,string> = {
  product:'منتج',service:'خدمة',digital:'رقمي',offer:'عرض',subscription:'اشتراك',other:'عنصر آخر'
};

function statusLabel(item: BusinessCatalogItem) {
  if (item.status==='hidden') return 'مخفي';
  if (item.status==='draft') return 'مسودة';
  if (item.status==='archived') return 'مؤرشف';
  return 'منشور';
}
function priceLabel(item: BusinessCatalogItem) {
  if (item.price==null) return 'السعر عند الطلب';
  return `${new Intl.NumberFormat('en-US',{maximumFractionDigits:2}).format(item.price)}${item.currency?` ${item.currency}`:''}`;
}

export default function BusinessCatalogManagerV2({ businessId: providedBusinessId }: Props) {
  const [loading,setLoading]=useState(true);
  const [savingItem,setSavingItem]=useState(false);
  const [uploading,setUploading]=useState(false);
  const [savingExternal,setSavingExternal]=useState(false);
  const [business,setBusiness]=useState<BusinessProfile|null>(null);
  const [items,setItems]=useState<BusinessCatalogItem[]>([]);
  const [thumbs,setThumbs]=useState<Record<string,string>>({});
  const [editorOpen,setEditorOpen]=useState(false);
  const [advancedOpen,setAdvancedOpen]=useState(false);
  const [externalOpen,setExternalOpen]=useState(false);
  const [editor,setEditor]=useState<EditorState>(EMPTY_EDITOR);
  const [catalogUrl,setCatalogUrl]=useState('');
  const [error,setError]=useState<string|null>(null);
  const [success,setSuccess]=useState<string|null>(null);

  const activeCount=useMemo(()=>items.filter(x=>x.status==='active').length,[items]);
  const featuredCount=useMemo(()=>items.filter(x=>x.status==='active'&&x.is_featured).length,[items]);

  const resolveBusiness=async()=>{
    const contexts=await getUserBusinessContexts();
    const preferred=providedBusinessId||getActiveManagedBusinessId();
    const current=(preferred?contexts.owned_businesses.find(x=>x.id===preferred):null)||contexts.owned_businesses[0]||null;
    if(!current) throw new Error('فقط مالك النشاط يمكنه إدارة الكتالوج.');
    rememberActiveManagedBusiness(current.id);
    return current;
  };

  const hydrateThumbs=async(nextItems:BusinessCatalogItem[])=>{
    const entries=await Promise.all(nextItems.map(async item=>[
      item.id,item.image_paths[0]?await resolveCatalogImageUrl(item.image_paths[0]):''
    ] as const));
    setThumbs(Object.fromEntries(entries));
  };

  const loadData=async()=>{
    setLoading(true);setError(null);
    try{
      const current=await resolveBusiness();
      const nextItems=await getBusinessCatalog(current.id,true);
      setBusiness(current);setCatalogUrl(current.whatsapp_catalog_url||'');setItems(nextItems);
      await hydrateThumbs(nextItems);
    }catch(e){setError(e instanceof Error?e.message:'تعذر تحميل الكتالوج.');}
    finally{setLoading(false);}
  };
  useEffect(()=>{void loadData();},[providedBusinessId]);

  const openNew=()=>{setEditor(EMPTY_EDITOR);setAdvancedOpen(false);setEditorOpen(true);setError(null);setSuccess(null);};
  const openEdit=async(item:BusinessCatalogItem)=>{
    setError(null);setSuccess(null);setAdvancedOpen(false);
    const images=await Promise.all(item.image_paths.map(async path=>({path,url:await resolveCatalogImageUrl(path)})));
    setEditor({
      itemId:item.id,title:item.title,description:item.description||'',itemType:item.item_type,
      price:item.price==null?'':String(item.price),currency:item.currency||'',status:item.status,
      isFeatured:item.is_featured,availabilityStatus:item.availability_status,
      displayOrder:String(item.display_order??100),images
    });
    setEditorOpen(true);
  };

  const uploadImages=async(event:ChangeEvent<HTMLInputElement>)=>{
    if(!business) return;
    const selected=Array.from(event.target.files||[]);
    event.target.value='';
    if(!selected.length) return;
    const remaining=MAX_CATALOG_IMAGES-editor.images.length;
    if(remaining<=0){setError(`الحد الأعلى هو ${MAX_CATALOG_IMAGES} صور لكل عنصر.`);return;}
    if(selected.length>remaining){setError(`يمكن إضافة ${remaining} صور فقط قبل بلوغ الحد الأعلى.`);return;}
    setUploading(true);setError(null);
    try{
      const uploaded:ImageDraft[]=[];
      for(let index=0;index<selected.length;index+=1){
        const result=await uploadCatalogItemImage(business.id,selected[index],editor.images.length+index+1);
        uploaded.push({path:result.path,url:result.signedUrl});
      }
      setEditor(current=>({...current,images:[...current.images,...uploaded]}));
      setSuccess(`تم رفع ${uploaded.length} صورة. احفظ العنصر لتثبيت التغييرات.`);
    }catch(e){setError(e instanceof Error?e.message:'تعذر رفع الصور.');}
    finally{setUploading(false);}
  };

  const removeImage=(index:number)=>setEditor(current=>({...current,images:current.images.filter((_,i)=>i!==index)}));
  const moveImage=(index:number,direction:-1|1)=>setEditor(current=>{
    const target=index+direction;
    if(target<0||target>=current.images.length) return current;
    const images=[...current.images];
    [images[index],images[target]]=[images[target],images[index]];
    return {...current,images};
  });

  const saveItem=async(event:FormEvent<HTMLFormElement>)=>{
    event.preventDefault();if(!business||!editor.title.trim()) return;
    setSavingItem(true);setError(null);setSuccess(null);
    try{
      const price=editor.price?Number(toLatinDigits(editor.price)):null;
      if(price!=null&&!Number.isFinite(price)) throw new Error('قيمة السعر غير صحيحة.');
      const displayOrder=Number(toLatinDigits(editor.displayOrder||'100'));
      await upsertBusinessCatalogItem({
        businessId:business.id,itemId:editor.itemId,itemType:editor.itemType,title:editor.title,
        description:editor.description||null,price,currency:editor.currency||null,
        imagePaths:editor.images.map(x=>x.path),status:editor.status,
        displayOrder:Number.isFinite(displayOrder)?displayOrder:100,isFeatured:editor.isFeatured,
        availabilityStatus:editor.availabilityStatus,contactAction:'whatsapp'
      });
      const next=await getBusinessCatalog(business.id,true);
      setItems(next);await hydrateThumbs(next);setEditor(EMPTY_EDITOR);setEditorOpen(false);
      setSuccess(editor.itemId?'تم تحديث العنصر وصوره.':'تمت إضافة العنصر وصوره.');
    }catch(e){setError(e instanceof Error?e.message:'تعذر حفظ العنصر.');}
    finally{setSavingItem(false);}
  };

  const toggleItem=async(item:BusinessCatalogItem)=>{
    if(!business) return;setError(null);setSuccess(null);
    try{
      await upsertBusinessCatalogItem({businessId:business.id,itemId:item.id,itemType:item.item_type,title:item.title,
        description:item.description,price:item.price,currency:item.currency,imagePaths:item.image_paths,
        status:item.status==='active'?'hidden':'active',displayOrder:item.display_order,isFeatured:item.is_featured,
        availabilityStatus:item.availability_status,contactAction:item.contact_action});
      const next=await getBusinessCatalog(business.id,true);setItems(next);await hydrateThumbs(next);
      setSuccess(item.status==='active'?'تم إخفاء العنصر.':'تم نشر العنصر.');
    }catch(e){setError(e instanceof Error?e.message:'تعذر تحديث حالة العنصر.');}
  };

  const validUrl=(value:string)=>{if(!value)return true;try{const url=new URL(value);return ['https:','http:'].includes(url.protocol);}catch{return false;}};
  const saveExternal=async(event:FormEvent<HTMLFormElement>)=>{
    event.preventDefault();if(!business)return;const clean=catalogUrl.trim();
    if(!validUrl(clean)){setError('أدخل رابطًا صحيحًا يبدأ بـ https:// أو اتركه فارغًا.');return;}
    setSavingExternal(true);setError(null);
    try{await updateBusinessProfile({p_business_id:business.id,p_whatsapp_catalog_url:clean||null});setSuccess(clean?'تم حفظ رابط كتالوج واتساب.':'تمت إزالة رابط كتالوج واتساب.');}
    catch(e){setError(e instanceof Error?e.message:'تعذر حفظ رابط كتالوج واتساب.');}
    finally{setSavingExternal(false);}
  };

  if(loading)return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin"/></div>;

  return <div className="space-y-4 font-arabic text-right" dir="rtl">
    <header className="flex items-start justify-between gap-3 px-1"><div className="min-w-0"><h2 className="text-lg font-bold text-slate-950">كتالوج النشاط</h2><p className="mt-1 text-[11px] text-slate-500">أضف حتى 6 صور لكل عنصر. الصورة الأولى هي الصورة الرئيسية.</p></div><button type="button" onClick={openNew} className="flex shrink-0 items-center gap-1.5 rounded-xl bg-slate-900 px-3 py-2.5 text-[10px] font-bold text-white"><Plus className="h-4 w-4"/>عنصر جديد</button></header>
    {error&&<div className="flex gap-2 rounded-2xl border border-rose-100 bg-rose-50 p-3 text-xs text-rose-700"><AlertCircle className="h-4 w-4 shrink-0"/>{error}</div>}
    {success&&<div className="flex gap-2 rounded-2xl border border-emerald-100 bg-emerald-50 p-3 text-xs text-emerald-700"><CheckCircle2 className="h-4 w-4 shrink-0"/>{success}</div>}
    <div className="grid grid-cols-3 gap-2"><div className="rounded-2xl bg-white p-3 text-center"><strong className="block text-lg">{items.length}</strong><span className="text-[9px] text-slate-400">كل العناصر</span></div><div className="rounded-2xl bg-white p-3 text-center"><strong className="block text-lg">{activeCount}</strong><span className="text-[9px] text-slate-400">المنشورة</span></div><div className="rounded-2xl bg-white p-3 text-center"><strong className="block text-lg">{featuredCount}</strong><span className="text-[9px] text-slate-400">المميزة</span></div></div>

    {editorOpen&&<form onSubmit={saveItem} className="grid gap-3 border-y border-slate-200 bg-white px-3 py-4 sm:grid-cols-2 sm:rounded-2xl sm:border">
      <div className="sm:col-span-2"><label className="mb-1 block text-[10px] font-bold text-slate-600">اسم العنصر</label><input value={editor.title} onChange={e=>setEditor(s=>({...s,title:e.target.value}))} maxLength={120} required className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs"/></div>
      <div className="sm:col-span-2"><label className="mb-1 block text-[10px] font-bold text-slate-600">الوصف</label><textarea value={editor.description} onChange={e=>setEditor(s=>({...s,description:e.target.value}))} rows={4} maxLength={4000} className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs"/></div>
      <select value={editor.itemType} onChange={e=>setEditor(s=>({...s,itemType:e.target.value as BusinessCatalogItemType}))} className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs">{Object.entries(TYPE_LABELS).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select>
      <select value={editor.availabilityStatus} onChange={e=>setEditor(s=>({...s,availabilityStatus:e.target.value as BusinessCatalogAvailability}))} className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs"><option value="available">متاح</option><option value="on_request">عند الطلب</option><option value="unavailable">غير متاح</option></select>
      <input value={editor.price} onChange={e=>setEditor(s=>({...s,price:toLatinDigits(e.target.value).replace(/[^0-9.]/g,'')}))} placeholder="السعر" inputMode="decimal" className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-left font-mono text-xs" dir="ltr"/>
      <select value={editor.currency} onChange={e=>setEditor(s=>({...s,currency:e.target.value as EditorState['currency']}))} className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs"><option value="">بدون عملة</option><option value="YER">YER</option><option value="SAR">SAR</option><option value="USD">USD</option></select>

      <section className="space-y-3 rounded-2xl border border-slate-200 p-3 sm:col-span-2"><div className="flex items-center justify-between gap-3"><div><h3 className="text-xs font-bold">صور العنصر</h3><p className="mt-1 text-[9px] text-slate-400">{editor.images.length} من {MAX_CATALOG_IMAGES} · الصورة الأولى رئيسية</p></div><label className={`flex cursor-pointer items-center gap-2 rounded-xl px-3 py-2 text-[10px] font-bold ${uploading||editor.images.length>=MAX_CATALOG_IMAGES?'bg-slate-100 text-slate-400':'bg-slate-900 text-white'}`}><input type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={uploading||editor.images.length>=MAX_CATALOG_IMAGES} onChange={uploadImages} className="hidden"/>{uploading?<Loader2 className="h-4 w-4 animate-spin"/>:<ImagePlus className="h-4 w-4"/>}إضافة صور</label></div>
      {editor.images.length>0&&<div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{editor.images.map((image,index)=><article key={image.path} className="overflow-hidden rounded-xl border border-slate-200"><div className="relative aspect-[4/3] bg-slate-100">{image.url?<img src={image.url} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover"/>:<div className="flex h-full items-center justify-center"><Loader2 className="h-5 w-5 animate-spin"/></div>}{index===0&&<span className="absolute right-2 top-2 rounded-full bg-slate-950/80 px-2 py-1 text-[8px] font-bold text-white">رئيسية</span>}</div><div className="flex items-center justify-center gap-1 p-2"><button type="button" disabled={index===0} onClick={()=>moveImage(index,-1)} className="rounded-lg border p-1.5 disabled:opacity-30" aria-label="تقديم الصورة"><ChevronRight className="h-3.5 w-3.5"/></button><button type="button" disabled={index===editor.images.length-1} onClick={()=>moveImage(index,1)} className="rounded-lg border p-1.5 disabled:opacity-30" aria-label="تأخير الصورة"><ChevronLeft className="h-3.5 w-3.5"/></button><button type="button" onClick={()=>removeImage(index)} className="rounded-lg border p-1.5 text-rose-600" aria-label="إزالة الصورة"><Trash2 className="h-3.5 w-3.5"/></button></div></article>)}</div>}
      </section>

      <button type="button" onClick={()=>setAdvancedOpen(v=>!v)} className="flex items-center justify-between rounded-xl bg-slate-50 p-3 text-xs font-bold sm:col-span-2"><span>خيارات النشر والترتيب</span>{advancedOpen?<ChevronUp className="h-4 w-4"/>:<ChevronDown className="h-4 w-4"/>}</button>
      {advancedOpen&&<div className="grid gap-3 rounded-xl border border-slate-100 p-3 sm:col-span-2 sm:grid-cols-2"><label className="space-y-1 text-[10px] font-bold text-slate-600">حالة النشر<select value={editor.status} onChange={e=>setEditor(s=>({...s,status:e.target.value as BusinessCatalogItemStatus}))} className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs"><option value="active">منشور</option><option value="draft">مسودة</option><option value="hidden">مخفي</option></select></label><label className="space-y-1 text-[10px] font-bold text-slate-600">أولوية الظهور<input value={editor.displayOrder} onChange={e=>setEditor(s=>({...s,displayOrder:toLatinDigits(e.target.value).replace(/\D/g,'')}))} inputMode="numeric" className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-left font-mono text-xs" dir="ltr"/><span className="block font-normal text-slate-400">الرقم الأصغر يظهر أولًا. 100 هو الترتيب الافتراضي.</span></label><label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs font-bold sm:col-span-2"><input type="checkbox" checked={editor.isFeatured} onChange={e=>setEditor(s=>({...s,isFeatured:e.target.checked}))}/><Star className="h-4 w-4 text-amber-500"/>عنصر مميز</label></div>}
      <div className="flex gap-2 sm:col-span-2"><button type="button" onClick={()=>setEditorOpen(false)} className="flex-1 rounded-xl border p-3 text-xs">إلغاء</button><button disabled={savingItem||uploading||!editor.title.trim()} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-slate-900 p-3 text-xs font-bold text-white disabled:bg-slate-300">{savingItem?<Loader2 className="h-4 w-4 animate-spin"/>:<Save className="h-4 w-4"/>}حفظ</button></div>
    </form>}

    <section className="divide-y divide-slate-100 border-y border-slate-200 bg-white sm:rounded-2xl sm:border">{items.length===0?<div className="py-12 text-center"><Package className="mx-auto h-8 w-8 text-slate-300"/><p className="mt-3 text-xs text-slate-400">لا توجد عناصر.</p></div>:items.map(item=><article key={item.id} className="flex items-center gap-3 px-3 py-3.5"><div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-slate-100">{thumbs[item.id]?<img src={thumbs[item.id]} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover"/>:item.is_featured?<Star className="h-5 w-5 text-amber-500"/>:<Package className="h-5 w-5 text-slate-600"/>}</div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="truncate text-xs font-bold">{item.title}</h3><span className={`rounded-full px-2 py-0.5 text-[8px] font-bold ${item.status==='active'?'bg-emerald-50 text-emerald-700':'bg-slate-100 text-slate-500'}`}>{statusLabel(item)}</span></div><p className="mt-1 text-[9px] text-slate-400">{TYPE_LABELS[item.item_type]} · {priceLabel(item)} · {item.image_paths.length} صور</p></div><button onClick={()=>void openEdit(item)} className="rounded-xl border border-slate-200 p-2"><Pencil className="h-4 w-4"/></button><button onClick={()=>void toggleItem(item)} className="rounded-xl border border-slate-200 p-2"><EyeOff className="h-4 w-4"/></button></article>)}</section>

    <section className="rounded-2xl border border-slate-200 bg-white"><button type="button" onClick={()=>setExternalOpen(v=>!v)} className="flex w-full items-center gap-3 px-4 py-4 text-right"><Package className="h-5 w-5 text-emerald-600"/><div className="flex-1"><h3 className="text-xs font-bold">كتالوج واتساب الخارجي</h3><p className="mt-1 text-[10px] text-slate-400">رابط اختياري بجانب كتالوج سند</p></div>{externalOpen?<ChevronUp className="h-4 w-4"/>:<ChevronDown className="h-4 w-4"/>}</button>{externalOpen&&<form onSubmit={saveExternal} className="space-y-3 border-t border-slate-100 p-4"><input value={catalogUrl} onChange={e=>setCatalogUrl(e.target.value)} placeholder="https://wa.me/c/967..." dir="ltr" className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-left font-mono text-xs"/>{catalogUrl.trim()&&validUrl(catalogUrl.trim())&&<a href={catalogUrl.trim()} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700"><ExternalLink className="h-3.5 w-3.5"/>فتح الرابط</a>}<button disabled={savingExternal} className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 p-3 text-xs font-bold text-white">{savingExternal?<Loader2 className="h-4 w-4 animate-spin"/>:<Save className="h-4 w-4"/>}حفظ الرابط</button></form>}</section>
  </div>;
}

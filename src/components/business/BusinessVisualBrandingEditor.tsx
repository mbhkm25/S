import { useEffect, useMemo, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { ArrowRight, Check, Eye, Image as ImageIcon, Loader2, Save, UploadCloud } from 'lucide-react';
import {
  getBusinessMediaSignedUrl,
  getUserBusinessContexts,
  updateBusinessProfile,
  uploadBusinessMedia
} from '../../lib/businessApi';
import {
  getActiveManagedBusinessId,
  getBusinessManagementProfile,
  rememberActiveManagedBusiness,
  setBusinessPublicProfileSettings,
  type BusinessPrimaryAction,
  type BusinessProfileMode,
  type BusinessPublicSection,
  type ManagementBusinessProfile
} from '../../lib/businessManagementApi';
import { supabase } from '../../lib/supabase';
import { buildPublicBusinessUrl } from '../../lib/urlUtils';
import BusinessCatalogExperienceSettings from './BusinessCatalogExperienceSettings';

interface Props { onNavigate: (page: string, token?: string) => void; }
type UploadingField = 'cover' | 'horizontal-cover' | 'profile' | null;
type Draft = {
  name:string; tagline:string; description:string; governorate:string; city:string;
  whatsapp:string; address:string; facebook:string; instagram:string; twitter:string; website:string;
};

const EMPTY_DRAFT: Draft = {name:'',tagline:'',description:'',governorate:'',city:'',whatsapp:'',address:'',facebook:'',instagram:'',twitter:'',website:''};
const MODE_OPTIONS: Array<{id:BusinessProfileMode;title:string;description:string;sections:BusinessPublicSection[];action:BusinessPrimaryAction}> = [
  {id:'products',title:'بيع المنتجات',description:'متجر أو نشاط يعرض منتجات وأسعارًا.',sections:['overview','catalog','hours','financial','contact'],action:'browse'},
  {id:'services',title:'تقديم الخدمات',description:'مكتب أو مهني يقدم خدمات حسب الطلب.',sections:['overview','services','hours','contact'],action:'request_service'},
  {id:'appointments',title:'المواعيد والحجوزات',description:'عيادة أو صالون أو استشارات.',sections:['overview','services','appointments','hours','contact'],action:'request_booking'},
  {id:'menu',title:'مطعم أو مقهى',description:'قائمة طعام ومشروبات وعروض.',sections:['overview','catalog','offers','hours','location','contact'],action:'browse'},
  {id:'portfolio',title:'الأعمال والخبرات',description:'شركة أو محترف يعرض أعماله وخدماته.',sections:['overview','portfolio','about','contact'],action:'request_quote'},
  {id:'custom',title:'نشاط آخر',description:'ملف مرن يركز على التعريف والتواصل.',sections:['overview','about','contact'],action:'whatsapp'}
];
const ACTION_OPTIONS: Array<{id:BusinessPrimaryAction;label:string}> = [
  {id:'whatsapp',label:'تواصل عبر واتساب'}, {id:'call',label:'اتصل بنا'}, {id:'browse',label:'استعرض المحتوى'},
  {id:'request_service',label:'اطلب خدمة'}, {id:'request_booking',label:'اطلب موعدًا'}, {id:'request_quote',label:'اطلب عرض سعر'}
];

function normalizeLink(value:string){const v=value.trim();return v?(/^https?:\/\//i.test(v)?v:`https://${v}`):null;}
function draftFromBusiness(b:ManagementBusinessProfile):Draft{return {
  name:b.name||'',tagline:b.display_tagline||'',description:b.description||'',governorate:b.governorate||'',city:b.city||'',
  whatsapp:b.whatsapp||'',address:b.address_text||'',facebook:String(b.contact_links?.facebook||''),instagram:String(b.contact_links?.instagram||''),
  twitter:String(b.contact_links?.twitter||b.contact_links?.x||''),website:String(b.contact_links?.website||'')
};}

export default function BusinessVisualBrandingEditor({onNavigate}:Props){
  const [business,setBusiness]=useState<ManagementBusinessProfile|null>(null);
  const [loading,setLoading]=useState(true); const [saving,setSaving]=useState(false);
  const [uploading,setUploading]=useState<UploadingField>(null);
  const [error,setError]=useState<string|null>(null); const [success,setSuccess]=useState<string|null>(null);
  const [draft,setDraft]=useState<Draft>(EMPTY_DRAFT);
  const [profilePath,setProfilePath]=useState(''); const [profilePreview,setProfilePreview]=useState('');
  const [coverPath,setCoverPath]=useState(''); const [coverPreview,setCoverPreview]=useState('');
  const [horizontalCoverPath,setHorizontalCoverPath]=useState(''); const [horizontalCoverPreview,setHorizontalCoverPreview]=useState('');
  const [mode,setMode]=useState<BusinessProfileMode>('products'); const [action,setAction]=useState<BusinessPrimaryAction>('whatsapp');
  const [actionLabel,setActionLabel]=useState(''); const [sections,setSections]=useState<BusinessPublicSection[]>(['overview','catalog','hours','financial','contact']);

  const modeMeta=useMemo(()=>MODE_OPTIONS.find(item=>item.id===mode)||MODE_OPTIONS[0],[mode]);

  const load=async()=>{setLoading(true);setError(null);try{
    const contexts=await getUserBusinessContexts(); const preferred=getActiveManagedBusinessId();
    const context=(preferred?contexts.owned_businesses.find(item=>item.id===preferred):null)||contexts.owned_businesses[0]||null;
    if(!context)throw new Error('لا يوجد نشاط مملوك لتعديل بياناته.');
    rememberActiveManagedBusiness(context.id);
    const full=await getBusinessManagementProfile(context.id);
    setBusiness(full);setDraft(draftFromBusiness(full));setMode(full.profile_mode||'products');setAction(full.primary_action||'whatsapp');
    setActionLabel(full.primary_action_label||'');setSections(full.enabled_sections?.length?full.enabled_sections:['overview','catalog','hours','financial','contact']);
    const profile=full.profile_image_path||full.logo_path||'';const cover=full.cover_image_path||'';const horizontal=full.horizontal_cover_image_path||'';
    setProfilePath(profile);setCoverPath(cover);setHorizontalCoverPath(horizontal);
    const [p,c,h]=await Promise.all([profile?getBusinessMediaSignedUrl(profile):'',cover?getBusinessMediaSignedUrl(cover):'',horizontal?getBusinessMediaSignedUrl(horizontal):'']);
    setProfilePreview(p);setCoverPreview(c);setHorizontalCoverPreview(h);
  }catch(caught){setError(caught instanceof Error?caught.message:'تعذر تحميل بيانات النشاط.');}finally{setLoading(false);}};
  useEffect(()=>{void load();},[]);

  const chooseMode=(next:BusinessProfileMode)=>{const meta=MODE_OPTIONS.find(item=>item.id===next)!;setMode(next);setAction(meta.action);setSections(meta.sections);};
  const upload=async(event:ChangeEvent<HTMLInputElement>,type:UploadingField)=>{const file=event.target.files?.[0];event.target.value='';if(!file||!business||!type)return;
    setUploading(type);setError(null);setSuccess(null);try{const result=await uploadBusinessMedia({businessId:business.id,assetType:type==='profile'?'profile':'cover',file,imageVariant:type==='profile'?'logo':type,altText:type==='horizontal-cover'?'غلاف أفقي للملف العام':null});
      if(type==='profile'){setProfilePath(result.path);setProfilePreview(result.signedUrl);}else if(type==='cover'){setCoverPath(result.path);setCoverPreview(result.signedUrl);}else{setHorizontalCoverPath(result.path);setHorizontalCoverPreview(result.signedUrl);}setSuccess('تم رفع الصورة. احفظ الصور لتطبيقها.');
    }catch(caught){setError(caught instanceof Error?caught.message:'تعذر رفع الصورة.');}finally{setUploading(null);}};

  const saveSettings=async(event:FormEvent)=>{event.preventDefault();if(!business)return;setSaving(true);setError(null);setSuccess(null);try{
    const updated=await setBusinessPublicProfileSettings({businessId:business.id,profileMode:mode,primaryAction:action,primaryActionLabel:actionLabel||null,enabledSections:sections,featuredItemIds:business.featured_item_ids||[]});
    setBusiness(updated);setSuccess('تم حفظ نمط الملف والإجراء الرئيسي.');
  }catch(caught){setError(caught instanceof Error?caught.message:'تعذر حفظ إعدادات الملف.');}finally{setSaving(false);}};
  const saveMedia=async(event:FormEvent)=>{event.preventDefault();if(!business)return;setSaving(true);setError(null);setSuccess(null);try{
    const {error:rpcError}=await supabase.rpc('set_business_profile_media',{p_business_id:business.id,p_cover_image_path:coverPath||null,p_horizontal_cover_image_path:horizontalCoverPath||null,p_profile_image_path:profilePath||null,p_gallery_paths:[],p_resubmit_review:false});
    if(rpcError)throw rpcError;setSuccess('تم حفظ صور الهوية البصرية.');await load();
  }catch(caught){setError(caught instanceof Error?caught.message:'تعذر حفظ الصور.');}finally{setSaving(false);}};
  const saveDetails=async(event:FormEvent)=>{event.preventDefault();if(!business)return;if(!draft.name.trim()||!draft.governorate.trim()||!draft.city.trim()){setError('اسم النشاط والمحافظة والمدينة حقول أساسية.');return;}
    setSaving(true);setError(null);setSuccess(null);try{await updateBusinessProfile({p_business_id:business.id,p_name:draft.name.trim(),p_tagline:draft.tagline.trim()||null,p_description:draft.description.trim()||null,p_governorate:draft.governorate.trim(),p_city:draft.city.trim(),p_whatsapp:draft.whatsapp.trim()||null,p_address_text:draft.address.trim()||null,p_contact_links:{facebook:normalizeLink(draft.facebook),instagram:normalizeLink(draft.instagram),twitter:normalizeLink(draft.twitter),website:normalizeLink(draft.website)}});setSuccess('تم حفظ البيانات العامة وروابط التواصل.');await load();
    }catch(caught){setError(caught instanceof Error?caught.message:'تعذر حفظ البيانات العامة.');}finally{setSaving(false);}};
  const update=(key:keyof Draft,value:string)=>setDraft(current=>({...current,[key]:value}));

  if(loading)return <div className="min-h-[60vh] space-y-4 bg-slate-50 p-4"><div className="h-16 animate-pulse rounded-2xl bg-slate-200"/><div className="h-64 animate-pulse rounded-3xl bg-slate-200"/></div>;
  return <div className="min-h-screen bg-slate-50/70 pb-16 font-arabic text-right" dir="rtl">
    <header className="sticky top-0 z-40 flex items-center gap-3 border-b border-slate-200 bg-white/95 px-3 py-2.5 backdrop-blur"><button onClick={()=>onNavigate('business-manage')} className="rounded-xl border border-slate-200 p-2.5" aria-label="العودة"><ArrowRight className="h-4 w-4"/></button><div className="min-w-0 flex-1"><h1 className="truncate text-sm font-bold">الملف العام</h1><p className="text-[10px] text-slate-400">{business?.name}</p></div>{business&&<a href={buildPublicBusinessUrl(business.slug)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 rounded-xl bg-slate-900 px-3 py-2.5 text-[10px] font-bold text-white"><Eye className="h-4 w-4"/>معاينة</a>}</header>
    <main className="mx-auto w-full max-w-3xl space-y-4 px-2 py-3 sm:px-3">
      {error&&<div className="rounded-2xl border border-rose-100 bg-rose-50 p-3 text-xs text-rose-700">{error}</div>}{success&&<div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-3 text-xs text-emerald-700">{success}</div>}
      <form onSubmit={saveSettings} className="space-y-4 rounded-3xl border border-slate-200 bg-white p-4"><div><h2 className="text-base font-bold">نوع الملف العام</h2><p className="mt-1 text-[10px] leading-5 text-slate-500">اختر النمط الأقرب لطريقة حصول العميل على منتجك أو خدمتك.</p></div><div className="grid gap-2 sm:grid-cols-2">{MODE_OPTIONS.map(item=><button type="button" key={item.id} onClick={()=>chooseMode(item.id)} className={`relative rounded-2xl border p-3 text-right transition ${mode===item.id?'border-emerald-500 bg-emerald-50':'border-slate-200 bg-slate-50'}`}>{mode===item.id&&<Check className="absolute left-3 top-3 h-4 w-4 text-emerald-600"/>}<strong className="block text-xs">{item.title}</strong><span className="mt-1 block text-[10px] leading-5 text-slate-500">{item.description}</span></button>)}</div><label className="block space-y-1 text-[10px] font-bold text-slate-600">الإجراء الرئيسي<select value={action} onChange={event=>setAction(event.target.value as BusinessPrimaryAction)} className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs">{ACTION_OPTIONS.map(item=><option key={item.id} value={item.id}>{item.label}</option>)}</select></label><label className="block space-y-1 text-[10px] font-bold text-slate-600">تسمية مخصصة للزر - اختياري<input value={actionLabel} maxLength={60} onChange={event=>setActionLabel(event.target.value)} placeholder={ACTION_OPTIONS.find(item=>item.id===action)?.label} className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs"/></label><div className="rounded-2xl bg-slate-50 p-3"><p className="text-[10px] font-bold text-slate-600">الأقسام المفعلة تلقائيًا</p><div className="mt-2 flex flex-wrap gap-2">{modeMeta.sections.map(item=><span key={item} className="rounded-full bg-white px-3 py-1.5 text-[9px] font-bold text-slate-600 shadow-sm">{item}</span>)}</div></div><button disabled={saving} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 p-3.5 text-xs font-bold text-white disabled:bg-slate-300">{saving?<Loader2 className="h-4 w-4 animate-spin"/>:<Save className="h-4 w-4"/>}حفظ إعدادات الملف</button></form>
      {business&&<BusinessCatalogExperienceSettings business={business} onSaved={setBusiness}/>} 
      <form onSubmit={saveMedia} className="space-y-4"><section className="rounded-3xl border border-slate-200 bg-white p-4"><h2 className="text-sm font-bold">الغلاف العمودي</h2><p className="mt-1 text-[10px] leading-5 text-slate-500">واجهة النشاط الافتتاحية على الهاتف.</p><label className="relative mt-3 block aspect-[10/13] max-h-[24rem] cursor-pointer overflow-hidden rounded-2xl border border-dashed border-slate-300 bg-slate-100">{coverPreview?<img src={coverPreview} alt="الغلاف العمودي" className="h-full w-full object-cover"/>:<span className="flex h-full flex-col items-center justify-center gap-2 text-xs text-slate-400"><UploadCloud className="h-7 w-7"/>رفع الغلاف</span>}<input type="file" accept="image/jpeg,image/png,image/webp" onChange={event=>void upload(event,'cover')} className="absolute inset-0 opacity-0"/>{uploading==='cover'&&<span className="absolute inset-0 flex items-center justify-center bg-white/80"><Loader2 className="h-5 w-5 animate-spin"/></span>}</label></section><section className="rounded-3xl border border-slate-200 bg-white p-4"><h2 className="text-sm font-bold">الغلاف الأفقي</h2><p className="mt-1 text-[10px] leading-5 text-slate-500">يظهر داخل صفحة التفاصيل بنسبة قريبة من 16:7.</p><label className="relative mt-3 block aspect-[16/7] cursor-pointer overflow-hidden rounded-2xl border border-dashed border-slate-300 bg-slate-100">{horizontalCoverPreview?<img src={horizontalCoverPreview} alt="الغلاف الأفقي" className="h-full w-full object-cover"/>:<span className="flex h-full items-center justify-center gap-2 text-xs text-slate-400"><UploadCloud className="h-6 w-6"/>رفع الغلاف الأفقي</span>}<input type="file" accept="image/jpeg,image/png,image/webp" onChange={event=>void upload(event,'horizontal-cover')} className="absolute inset-0 opacity-0"/></label></section><section className="rounded-3xl border border-slate-200 bg-white p-4"><h2 className="text-sm font-bold">شعار النشاط</h2><div className="mt-3 flex items-center gap-4"><div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-3xl border bg-white p-2">{profilePreview?<img src={profilePreview} alt="الشعار" className="h-full w-full object-contain"/>:<ImageIcon className="h-8 w-8 text-slate-300"/>}</div><label className="relative rounded-xl bg-slate-900 px-4 py-3 text-xs font-bold text-white">اختيار شعار<input type="file" accept="image/jpeg,image/png,image/webp" onChange={event=>void upload(event,'profile')} className="absolute inset-0 opacity-0"/></label></div></section><button disabled={saving||uploading!==null} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-900 p-3.5 text-xs font-bold text-white disabled:bg-slate-300"><Save className="h-4 w-4"/>حفظ الصور</button></form>
      <form onSubmit={saveDetails} className="grid gap-3 rounded-3xl border border-slate-200 bg-white p-4 sm:grid-cols-2"><div className="sm:col-span-2"><h2 className="text-sm font-bold">البيانات العامة والتواصل</h2><p className="mt-1 text-[10px] text-slate-500">تظهر هذه المعلومات للزائر داخل الملف العام.</p></div>{([['name','اسم النشاط'],['tagline','العبارة التعريفية'],['governorate','المحافظة'],['city','المدينة'],['whatsapp','واتساب'],['address','العنوان التفصيلي'],['facebook','رابط فيسبوك'],['instagram','رابط إنستغرام'],['twitter','رابط X'],['website','الموقع الإلكتروني']] as Array<[keyof Draft,string]>).map(([key,label])=><label key={key} className="space-y-1 text-[10px] font-bold text-slate-600">{label}<input value={draft[key]} onChange={event=>update(key,event.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs outline-none focus:border-slate-400"/></label>)}<label className="space-y-1 text-[10px] font-bold text-slate-600 sm:col-span-2">وصف النشاط<textarea value={draft.description} onChange={event=>update('description',event.target.value)} rows={5} maxLength={4000} className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs"/></label><button disabled={saving||!draft.name.trim()} className="flex justify-center gap-2 rounded-2xl bg-slate-900 p-3 text-xs font-bold text-white disabled:bg-slate-300 sm:col-span-2"><Save className="h-4 w-4"/>حفظ البيانات العامة</button></form>
    </main>
  </div>;
}

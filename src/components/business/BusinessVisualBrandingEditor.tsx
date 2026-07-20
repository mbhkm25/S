import { useEffect, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { ArrowRight, Image as ImageIcon, Loader2, Save, UploadCloud } from 'lucide-react';
import {
  getBusinessMediaSignedUrl,
  getUserBusinessContexts,
  updateBusinessProfile,
  uploadBusinessMedia,
  type BusinessProfile
} from '../../lib/businessApi';
import {
  getActiveManagedBusinessId,
  getBusinessManagementProfile,
  rememberActiveManagedBusiness,
  type ManagementBusinessProfile
} from '../../lib/businessManagementApi';
import { supabase } from '../../lib/supabase';

interface Props { onNavigate: (page: string) => void; }
type UploadingField = 'cover' | 'horizontal-cover' | 'profile' | null;
type Draft = {
  name:string; tagline:string; description:string; governorate:string; city:string;
  whatsapp:string; address:string; facebook:string; instagram:string; twitter:string; website:string;
};

const EMPTY_DRAFT: Draft = { name:'',tagline:'',description:'',governorate:'',city:'',whatsapp:'',address:'',facebook:'',instagram:'',twitter:'',website:'' };

function normalizeLink(value:string){
  const trimmed=value.trim();
  if(!trimmed)return null;
  return /^https?:\/\//i.test(trimmed)?trimmed:`https://${trimmed}`;
}

function draftFromBusiness(business:ManagementBusinessProfile):Draft{
  return {
    name:business.name||'', tagline:business.display_tagline||'', description:business.description||'',
    governorate:business.governorate||'', city:business.city||'', whatsapp:business.whatsapp||'',
    address:business.address_text||'', facebook:String(business.contact_links?.facebook||''),
    instagram:String(business.contact_links?.instagram||''), twitter:String(business.contact_links?.twitter||business.contact_links?.x||''),
    website:String(business.contact_links?.website||'')
  };
}

export default function BusinessVisualBrandingEditor({onNavigate}:Props){
  const [business,setBusiness]=useState<ManagementBusinessProfile|null>(null);
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [uploading,setUploading]=useState<UploadingField>(null);
  const [error,setError]=useState<string|null>(null);
  const [success,setSuccess]=useState<string|null>(null);
  const [draft,setDraft]=useState<Draft>(EMPTY_DRAFT);
  const [profilePath,setProfilePath]=useState('');
  const [profilePreview,setProfilePreview]=useState('');
  const [coverPath,setCoverPath]=useState('');
  const [coverPreview,setCoverPreview]=useState('');
  const [horizontalCoverPath,setHorizontalCoverPath]=useState('');
  const [horizontalCoverPreview,setHorizontalCoverPreview]=useState('');

  const load=async()=>{
    setLoading(true);setError(null);
    try{
      const contexts=await getUserBusinessContexts();
      const preferredId=getActiveManagedBusinessId();
      const context=(preferredId?contexts.owned_businesses.find(item=>item.id===preferredId):null)||contexts.owned_businesses[0]||null;
      if(!context)throw new Error('لا يوجد نشاط مملوك لتعديل بياناته.');
      rememberActiveManagedBusiness(context.id);
      const full=await getBusinessManagementProfile(context.id);
      setBusiness(full);setDraft(draftFromBusiness(full));
      const media=full as ManagementBusinessProfile & {profile_image_path?:string|null;cover_image_path?:string|null;horizontal_cover_image_path?:string|null};
      const profile=media.profile_image_path||full.logo_path||'';
      const cover=media.cover_image_path||'';
      const horizontal=media.horizontal_cover_image_path||'';
      setProfilePath(profile);setCoverPath(cover);setHorizontalCoverPath(horizontal);
      const [profileUrl,coverUrl,horizontalUrl]=await Promise.all([
        profile?getBusinessMediaSignedUrl(profile):Promise.resolve(''),
        cover?getBusinessMediaSignedUrl(cover):Promise.resolve(''),
        horizontal?getBusinessMediaSignedUrl(horizontal):Promise.resolve('')
      ]);
      setProfilePreview(profileUrl);setCoverPreview(coverUrl);setHorizontalCoverPreview(horizontalUrl);
    }catch(caught){setError(caught instanceof Error?caught.message:'تعذر تحميل بيانات النشاط.');}
    finally{setLoading(false);}
  };

  useEffect(()=>{void load();},[]);

  const upload=async(event:ChangeEvent<HTMLInputElement>,type:UploadingField)=>{
    const file=event.target.files?.[0];event.target.value='';
    if(!file||!business||!type)return;
    setUploading(type);setError(null);setSuccess(null);
    try{
      const assetType=type==='profile'?'profile':'cover';
      const result=await uploadBusinessMedia({businessId:business.id,assetType,file,altText:type==='horizontal-cover'?'غلاف أفقي للملف العام':null});
      if(type==='profile'){setProfilePath(result.path);setProfilePreview(result.signedUrl);}
      else if(type==='cover'){setCoverPath(result.path);setCoverPreview(result.signedUrl);}
      else{setHorizontalCoverPath(result.path);setHorizontalCoverPreview(result.signedUrl);}
      setSuccess('تم رفع الصورة. اضغط حفظ الصور لتطبيقها على الملف العام.');
    }catch(caught){setError(caught instanceof Error?caught.message:'تعذر رفع الصورة.');}
    finally{setUploading(null);}
  };

  const saveMedia=async(event:FormEvent)=>{
    event.preventDefault();if(!business)return;
    setSaving(true);setError(null);setSuccess(null);
    try{
      const {error:rpcError}=await supabase.rpc('set_business_profile_media',{
        p_business_id:business.id,
        p_cover_image_path:coverPath||null,
        p_horizontal_cover_image_path:horizontalCoverPath||null,
        p_profile_image_path:profilePath||null,
        p_gallery_paths:[],
        p_resubmit_review:false
      });
      if(rpcError)throw rpcError;
      setSuccess('تم حفظ صور الهوية البصرية وستظهر في مواضعها العامة.');
      await load();
    }catch(caught){setError(caught instanceof Error?caught.message:'تعذر حفظ الصور.');}
    finally{setSaving(false);}
  };

  const saveDetails=async(event:FormEvent)=>{
    event.preventDefault();if(!business)return;
    if(!draft.name.trim()||!draft.governorate.trim()||!draft.city.trim()){
      setError('اسم النشاط والمحافظة والمدينة حقول أساسية.');return;
    }
    setSaving(true);setError(null);setSuccess(null);
    try{
      await updateBusinessProfile({
        p_business_id:business.id,p_name:draft.name.trim(),p_tagline:draft.tagline.trim()||null,
        p_description:draft.description.trim()||null,p_governorate:draft.governorate.trim(),p_city:draft.city.trim(),
        p_whatsapp:draft.whatsapp.trim()||null,p_address_text:draft.address.trim()||null,
        p_contact_links:{facebook:normalizeLink(draft.facebook),instagram:normalizeLink(draft.instagram),twitter:normalizeLink(draft.twitter),website:normalizeLink(draft.website)}
      });
      setSuccess('تم حفظ البيانات العامة وروابط التواصل.');await load();
    }catch(caught){setError(caught instanceof Error?caught.message:'تعذر حفظ البيانات العامة.');}
    finally{setSaving(false);}
  };

  const update=(key:keyof Draft,value:string)=>setDraft(current=>({...current,[key]:value}));
  if(loading)return <div className="flex justify-center py-20"><Loader2 className="h-7 w-7 animate-spin"/></div>;

  return <div className="min-h-screen bg-slate-50/60 pb-16 font-arabic text-right" dir="rtl">
    <header className="sticky top-0 z-40 flex items-center gap-3 border-b border-slate-200 bg-white/95 px-2 py-2.5 backdrop-blur sm:px-4">
      <button onClick={()=>onNavigate('business-manage')} className="rounded-xl border border-slate-200 p-2.5" aria-label="العودة"><ArrowRight className="h-4 w-4"/></button>
      <div className="min-w-0 flex-1"><h1 className="truncate text-sm font-bold">الهوية البصرية والبيانات العامة</h1><p className="text-[10px] text-slate-400">{business?.name}</p></div>
    </header>
    <main className="mx-auto w-full max-w-2xl space-y-4 px-2 py-3 sm:px-3">
      {error&&<div className="rounded-2xl border border-rose-100 bg-rose-50 p-3 text-xs text-rose-700">{error}</div>}
      {success&&<div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-3 text-xs text-emerald-700">{success}</div>}

      <form onSubmit={saveMedia} className="space-y-4">
        <section className="rounded-3xl border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-bold">الغلاف العمودي للواجهة الافتتاحية</h2><p className="mt-1 text-[10px] leading-5 text-slate-500">يملأ الواجهة التي تحتوي على زري استعراض الملف والارتباط بالنشاط. استخدم صورة عمودية أو صورة تتحمل القص على الشاشات الطويلة.</p>
          <label className="relative mt-3 block aspect-[10/13] max-h-[24rem] cursor-pointer overflow-hidden rounded-2xl border border-dashed border-slate-300 bg-slate-100">
            {coverPreview?<img src={coverPreview} alt="معاينة الغلاف العمودي" className="h-full w-full object-cover"/>:<span className="flex h-full flex-col items-center justify-center gap-2 text-xs text-slate-400"><UploadCloud className="h-7 w-7"/>رفع الغلاف العمودي</span>}
            <input type="file" accept="image/jpeg,image/png,image/webp" onChange={event=>void upload(event,'cover')} className="absolute inset-0 opacity-0" disabled={uploading!==null}/>
            {uploading==='cover'&&<span className="absolute inset-0 flex items-center justify-center bg-white/80"><Loader2 className="h-5 w-5 animate-spin"/></span>}
          </label>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-bold">الغلاف الأفقي للملف العام</h2><p className="mt-1 text-[10px] leading-5 text-slate-500">يظهر ملتصقًا بالحافة العليا للبطاقة التعريفية. استخدم صورة أفقية بنسبة قريبة من 16:7 وتجنب وضع النصوص المهمة قرب الأطراف.</p>
          <label className="relative mt-3 block aspect-[16/7] cursor-pointer overflow-hidden rounded-2xl border border-dashed border-slate-300 bg-slate-100">
            {horizontalCoverPreview?<img src={horizontalCoverPreview} alt="معاينة الغلاف الأفقي" className="h-full w-full object-cover"/>:<span className="flex h-full flex-col items-center justify-center gap-2 text-xs text-slate-400"><UploadCloud className="h-7 w-7"/>رفع الغلاف الأفقي</span>}
            <input type="file" accept="image/jpeg,image/png,image/webp" onChange={event=>void upload(event,'horizontal-cover')} className="absolute inset-0 opacity-0" disabled={uploading!==null}/>
            {uploading==='horizontal-cover'&&<span className="absolute inset-0 flex items-center justify-center bg-white/80"><Loader2 className="h-5 w-5 animate-spin"/></span>}
          </label>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-bold">صورة البروفايل / شعار النشاط</h2><p className="mt-1 text-[10px] leading-5 text-slate-500">لأفضل مظهر استخدم شعارًا بصيغة PNG بخلفية شفافة، أو شعارًا واضحًا على خلفية بيضاء.</p>
          <div className="mt-3 flex items-center gap-4"><div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-3xl border border-slate-200 bg-white p-2">{profilePreview?<img src={profilePreview} alt="معاينة الشعار" className="h-full w-full object-contain"/>:<ImageIcon className="h-8 w-8 text-slate-300"/>}</div><label className="relative flex cursor-pointer items-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-xs font-bold text-white"><UploadCloud className="h-4 w-4"/>اختيار شعار<input type="file" accept="image/jpeg,image/png,image/webp" onChange={event=>void upload(event,'profile')} className="absolute inset-0 opacity-0" disabled={uploading!==null}/></label>{uploading==='profile'&&<Loader2 className="h-5 w-5 animate-spin"/>}</div>
        </section>
        <button disabled={saving||uploading!==null} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-900 p-3.5 text-xs font-bold text-white disabled:bg-slate-300">{saving?<Loader2 className="h-4 w-4 animate-spin"/>:<Save className="h-4 w-4"/>}حفظ الصور</button>
      </form>

      <form onSubmit={saveDetails} className="grid gap-3 rounded-3xl border border-slate-200 bg-white p-4 sm:grid-cols-2">
        <div className="sm:col-span-2"><h2 className="text-sm font-bold">الهوية النصية والتواصل</h2><p className="mt-1 text-[10px] leading-5 text-slate-500">تنعكس هذه البيانات في البطاقة التعريفية والواجهة الافتتاحية وروابط التواصل العامة.</p></div>
        {([['name','اسم النشاط'],['tagline','العبارة التعريفية'],['governorate','المحافظة'],['city','المدينة'],['whatsapp','واتساب'],['address','العنوان التفصيلي'],['facebook','رابط فيسبوك'],['instagram','رابط إنستغرام'],['twitter','رابط X'],['website','الموقع الإلكتروني']] as Array<[keyof Draft,string]>).map(([key,label])=><label key={key} className="space-y-1 text-[10px] font-bold text-slate-600">{label}<input value={draft[key]} onChange={event=>update(key,event.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs outline-none focus:border-slate-400" placeholder={key==='facebook'?'facebook.com/your-page':''}/></label>)}
        <label className="space-y-1 text-[10px] font-bold text-slate-600 sm:col-span-2">وصف النشاط<textarea value={draft.description} onChange={event=>update('description',event.target.value)} rows={5} maxLength={4000} className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs outline-none focus:border-slate-400"/></label>
        <button disabled={saving||!draft.name.trim()} className="flex justify-center gap-2 rounded-2xl bg-slate-900 p-3 text-xs font-bold text-white disabled:bg-slate-300 sm:col-span-2">{saving?<Loader2 className="h-4 w-4 animate-spin"/>:<Save className="h-4 w-4"/>}حفظ البيانات العامة</button>
      </form>
    </main>
  </div>;
}

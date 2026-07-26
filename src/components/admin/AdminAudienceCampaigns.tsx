import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { BellRing, CheckCircle2, Loader2, MessageCircle, RefreshCw, Smartphone, Users, XCircle } from 'lucide-react';
import {
  cancelAudienceCampaign, createAudienceCampaign, getAudienceCampaigns, previewAudience,
  queueAudienceCampaign, runAudienceWhatsApp,
  type AdminAudienceCampaign, type AdminAudienceCampaignOverview,
  type AdminAudienceMode, type AdminCampaignChannel, type AdminAudiencePreview
} from '../../lib/adminCampaignApi';

const nf = new Intl.NumberFormat('en-US');
const df = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', hour12: true });
const GOVERNORATES = ['','حضرموت','عدن','صنعاء','تعز','إب','الحديدة','ذمار','شبوة','المهرة','مأرب','الجوف','صعدة','حجة','عمران','البيضاء','لحج','أبين','الضالع','ريمة','سقطرى','المحويت'];

function statusLabel(value: string): string {
  return ({ draft:'مسودة',scheduled:'مجدولة',dispatching:'جارٍ التجهيز',queued:'في قائمة الإرسال',completed:'مكتملة',failed:'فشلت',cancelled:'ملغاة' } as Record<string,string>)[value] || value;
}

export default function AdminAudienceCampaigns({ setError, setSuccess }: {
  setError: (value: string | null) => void;
  setSuccess: (value: string | null) => void;
}) {
  const [overview,setOverview] = useState<AdminAudienceCampaignOverview | null>(null);
  const [loading,setLoading] = useState(true);
  const [open,setOpen] = useState(false);
  const load = async () => {
    setLoading(true);
    try { setOverview(await getAudienceCampaigns()); }
    catch { setError('تعذر تحميل مركز الحملات الموجهة.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);

  return <section className="space-y-3 rounded-[1.7rem] border border-slate-200 bg-slate-50 p-4">
    <div className="flex items-start justify-between gap-3">
      <div><div className="flex items-center gap-2"><BellRing className="h-4 w-4 text-violet-600"/><h3 className="text-sm font-bold">مركز الاتصالات والجمهور</h3></div><p className="mt-1 text-[10px] leading-5 text-slate-500">أنشئ إشعارًا موجّهًا داخل التطبيق وPush وواتساب، مع معاينة الجمهور والموافقة والتسجيل الإداري.</p></div>
      <div className="flex gap-2"><button onClick={() => void load()} className="flex h-10 w-10 items-center justify-center rounded-xl bg-white"><RefreshCw className={`h-4 w-4 ${loading?'animate-spin':''}`}/></button><button onClick={() => setOpen(true)} className="min-h-10 rounded-xl bg-violet-600 px-4 text-[10px] font-bold text-white">حملة جديدة</button></div>
    </div>
    <div className="rounded-xl bg-white p-3 text-[9px] leading-5 text-slate-600"><strong>مهم:</strong> اختيار Push ينشئ أيضًا إشعارًا داخل مركز الإشعارات؛ وواتساب لا يشمل إلا جهات الاتصال التي سجلت موافقتها التسويقية صراحة.</div>
    {loading && !overview ? <div className="flex min-h-24 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin"/></div> : <div className="space-y-2">{overview?.campaigns.map(c => <CampaignCard key={c.id} campaign={c} reload={load} setError={setError} setSuccess={setSuccess}/>) }{!overview?.campaigns.length && <div className="rounded-xl border border-dashed border-slate-200 bg-white p-5 text-center text-[10px] text-slate-500">لا توجد حملات متعددة القنوات بعد.</div>}</div>}
    {open && overview && <Composer modes={overview.audience_modes} onClose={() => setOpen(false)} onCreated={async()=>{setOpen(false);setSuccess('تم حفظ مسودة الحملة. راجع الجمهور ثم أرسلها أو جدولها.');await load();}} setError={setError}/>} 
  </section>;
}

function CampaignCard({campaign,reload,setError,setSuccess}:{key?: string;campaign:AdminAudienceCampaign;reload:()=>Promise<void>;setError:(v:string|null)=>void;setSuccess:(v:string|null)=>void}) {
  const [reason,setReason]=useState(''); const [schedule,setSchedule]=useState(''); const [working,setWorking]=useState(false);
  const canQueue=campaign.status==='draft'; const canCancel=['draft','scheduled','queued'].includes(campaign.status);
  const run=async(kind:'send'|'schedule'|'cancel'|'whatsapp')=>{setWorking(true);try{
    if(kind==='send'){const r=await queueAudienceCampaign(campaign.id,reason.trim()); if(r.whatsapp_campaign_id) await runAudienceWhatsApp(r.whatsapp_campaign_id); setSuccess('تم تجهيز الحملة وبدء الإرسال عبر القنوات المحددة.');}
    if(kind==='schedule'){await queueAudienceCampaign(campaign.id,reason.trim(),new Date(schedule).toISOString());setSuccess('تمت جدولة الحملة وسيُنشئ النظام الإشعارات تلقائيًا في الموعد.');}
    if(kind==='cancel'){await cancelAudienceCampaign(campaign.id,reason.trim());setSuccess('تم إلغاء الحملة.');}
    if(kind==='whatsapp'&&campaign.whatsapp_campaign_id){await runAudienceWhatsApp(campaign.whatsapp_campaign_id);setSuccess('تمت متابعة دفعة واتساب.');}
    setReason('');await reload();
  }catch{setError('تعذر تنفيذ إجراء الحملة. تحقق من السبب والقالب والجمهور.');}finally{setWorking(false)}};
  return <article className="rounded-2xl bg-white p-4 shadow-sm"><div className="flex items-start justify-between gap-3"><div><h4 className="text-xs font-bold">{campaign.name}</h4><p className="mt-1 text-[9px] text-slate-500">{campaign.title}</p></div><span className="rounded-lg bg-slate-100 px-2 py-1 text-[9px] font-bold">{statusLabel(campaign.status)}</span></div>
    <div className="mt-3 flex flex-wrap gap-1">{campaign.channels.map(c=><span key={c} className="rounded-lg bg-violet-50 px-2 py-1 text-[8px] font-bold text-violet-700">{c==='in_app'?'داخل التطبيق':c==='push'?'Push':'واتساب'}</span>)}</div>
    <div className="mt-3 grid grid-cols-4 gap-1 text-center"><Metric label="مستخدم" value={campaign.total_users}/><Metric label="واتساب" value={campaign.total_whatsapp}/><Metric label="إشعار" value={campaign.notification_count}/><Metric label="مقروء" value={campaign.whatsapp_read_count}/></div>
    {campaign.scheduled_at&&<p className="mt-2 text-[8px] text-slate-400">الموعد: {df.format(new Date(campaign.scheduled_at))}</p>}
    {campaign.last_error&&<p className="mt-2 rounded-lg bg-rose-50 p-2 text-[8px] text-rose-700">{campaign.last_error}</p>}
    {(canQueue||canCancel||campaign.status==='queued')&&<div className="mt-3 border-t border-slate-100 pt-3"><textarea value={reason} onChange={e=>setReason(e.target.value)} placeholder="سبب الإجراء الإداري" className="admin-input min-h-14 resize-none"/>{canQueue&&<input type="datetime-local" value={schedule} onChange={e=>setSchedule(e.target.value)} className="admin-input mt-2"/>}<div className="mt-2 grid grid-cols-2 gap-2">{canQueue&&<><button disabled={working||reason.trim().length<5} onClick={()=>void run('send')} className="min-h-10 rounded-xl bg-violet-600 text-[9px] font-bold text-white disabled:opacity-40">إرسال الآن</button><button disabled={working||reason.trim().length<5||!schedule} onClick={()=>void run('schedule')} className="min-h-10 rounded-xl bg-sky-50 text-[9px] font-bold text-sky-700 disabled:opacity-40">جدولة</button></>}{campaign.status==='queued'&&campaign.whatsapp_campaign_id&&<button disabled={working} onClick={()=>void run('whatsapp')} className="min-h-10 rounded-xl bg-emerald-50 text-[9px] font-bold text-emerald-700">متابعة واتساب</button>}{canCancel&&<button disabled={working||reason.trim().length<5} onClick={()=>void run('cancel')} className="min-h-10 rounded-xl bg-rose-50 text-[9px] font-bold text-rose-700 disabled:opacity-40">إلغاء</button>}</div></div>}
  </article>;
}

function Composer({modes,onClose,onCreated,setError}:{modes:Array<{id:AdminAudienceMode;label:string}>;onClose:()=>void;onCreated:()=>Promise<void>;setError:(v:string|null)=>void}) {
  const [name,setName]=useState('إشعار عام من سند'); const [title,setTitle]=useState('تحديث من سند'); const [body,setBody]=useState('');
  const [mode,setMode]=useState<AdminAudienceMode>('all_registered'); const [governorate,setGovernorate]=useState(''); const [expiring,setExpiring]=useState('0');
  const [channels,setChannels]=useState<AdminCampaignChannel[]>(['in_app','push']); const [template,setTemplate]=useState(''); const [params,setParams]=useState('');
  const [actionType,setActionType]=useState('none'); const [reason,setReason]=useState(''); const [preview,setPreview]=useState<AdminAudiencePreview|null>(null); const [working,setWorking]=useState(false);
  const filter=useMemo(()=>({mode,governorate:governorate||undefined,subscription_expiring_days:Number(expiring)||0}),[mode,governorate,expiring]);
  const toggle=(c:AdminCampaignChannel)=>setChannels(v=>v.includes(c)?v.filter(x=>x!==c):[...v,c]);
  const inspect=async()=>{setWorking(true);try{setPreview(await previewAudience(filter));}catch{setError('تعذر حساب الجمهور.');}finally{setWorking(false)}};
  const save=async()=>{if(name.trim().length<3||!title.trim()||!body.trim()||channels.length===0||reason.trim().length<5)return;setWorking(true);try{await createAudienceCampaign({name:name.trim(),title:title.trim(),body:body.trim(),category:'system',severity:'info',channels,audienceFilter:filter,actionType,whatsappTemplateName:template.trim(),whatsappTemplateLanguage:'ar',whatsappTemplateParameters:params.split('\n').map(x=>x.trim()).filter(Boolean),reason:reason.trim()});await onCreated();}catch{setError('تعذر حفظ الحملة. تأكد من اسم قالب Meta عند اختيار واتساب.');}finally{setWorking(false)}};
  return <div className="fixed inset-0 z-[100] overflow-y-auto bg-slate-950/70 p-4"><div className="mx-auto my-4 max-w-md rounded-[1.8rem] bg-[#f7f7f5] p-5"><div className="flex items-center justify-between"><div><h3 className="text-sm font-bold">إنشاء حملة موجهة</h3><p className="mt-1 text-[9px] text-slate-500">المسودة لا ترسل شيئًا.</p></div><button onClick={onClose} className="flex h-10 w-10 items-center justify-center rounded-xl bg-white"><XCircle className="h-4 w-4"/></button></div>
    <div className="mt-4 space-y-3"><Field label="اسم الحملة"><input className="admin-input" value={name} onChange={e=>setName(e.target.value)}/></Field><Field label="عنوان الإشعار"><input className="admin-input" value={title} maxLength={160} onChange={e=>setTitle(e.target.value)}/></Field><Field label="نص الرسالة"><textarea className="admin-input min-h-24 resize-none" value={body} maxLength={1000} onChange={e=>setBody(e.target.value)}/></Field>
    <Field label="الجمهور"><select className="admin-input" value={mode} onChange={e=>setMode(e.target.value as AdminAudienceMode)}>{modes.map(m=><option key={m.id} value={m.id}>{m.label}</option>)}</select></Field><div className="grid grid-cols-2 gap-2"><Field label="المحافظة"><select className="admin-input" value={governorate} onChange={e=>setGovernorate(e.target.value)}>{GOVERNORATES.map(g=><option key={g} value={g}>{g||'كل المحافظات'}</option>)}</select></Field><Field label="ينتهي الاشتراك خلال"><select className="admin-input" value={expiring} onChange={e=>setExpiring(e.target.value)}><option value="0">بدون فلتر</option><option value="1">يوم</option><option value="3">3 أيام</option><option value="7">7 أيام</option></select></Field></div>
    <div><p className="text-[10px] font-bold text-slate-600">القنوات</p><div className="mt-2 grid grid-cols-3 gap-2"><Channel active={channels.includes('in_app')} onClick={()=>toggle('in_app')} icon={<BellRing className="h-4 w-4"/>} label="التطبيق"/><Channel active={channels.includes('push')} onClick={()=>toggle('push')} icon={<Smartphone className="h-4 w-4"/>} label="Push"/><Channel active={channels.includes('whatsapp')} onClick={()=>toggle('whatsapp')} icon={<MessageCircle className="h-4 w-4"/>} label="واتساب"/></div></div>
    {channels.includes('whatsapp')&&<><Field label="اسم قالب Meta المعتمد"><input dir="ltr" className="admin-input text-left" value={template} onChange={e=>setTemplate(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g,''))}/></Field><Field label="متغيرات القالب — متغير في كل سطر"><textarea className="admin-input min-h-20 resize-none" value={params} onChange={e=>setParams(e.target.value)}/></Field></>}
    <Field label="الإجراء عند فتح الإشعار"><select className="admin-input" value={actionType} onChange={e=>setActionType(e.target.value)}><option value="none">بدون إجراء</option><option value="profile">الحساب</option><option value="reports">التقارير</option><option value="subscription">الاشتراك</option><option value="business_manage">إدارة النشاط</option></select></Field>
    <button onClick={()=>void inspect()} disabled={working} className="flex min-h-10 w-full items-center justify-center gap-2 rounded-xl bg-white text-[10px] font-bold text-slate-700"><Users className="h-4 w-4"/>معاينة الجمهور</button>{preview&&<div className="grid grid-cols-3 gap-2"><Metric label="مستخدم" value={preview.users}/><Metric label="Push" value={preview.push_enabled}/><Metric label="واتساب" value={preview.whatsapp_opted_in}/></div>}
    <Field label="سبب الإنشاء الإداري"><textarea className="admin-input min-h-16 resize-none" value={reason} onChange={e=>setReason(e.target.value)}/></Field><button onClick={()=>void save()} disabled={working||name.trim().length<3||!title.trim()||!body.trim()||channels.length===0||reason.trim().length<5||(channels.includes('whatsapp')&&!template)} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-slate-950 text-xs font-bold text-white disabled:opacity-40">{working?<Loader2 className="h-4 w-4 animate-spin"/>:<><CheckCircle2 className="h-4 w-4"/>حفظ المسودة</>}</button></div></div></div>;
}

function Metric({label,value}:{label:string;value:number}){return <div className="rounded-xl bg-slate-50 p-2 text-center"><p className="text-xs font-bold">{nf.format(value)}</p><p className="mt-1 text-[8px] text-slate-400">{label}</p></div>}
function Field({label,children}:{label:string;children:ReactNode}){return <label className="block text-[10px] font-bold text-slate-600"><span className="mb-1.5 block">{label}</span>{children}</label>}
function Channel({active,onClick,icon,label}:{active:boolean;onClick:()=>void;icon:ReactNode;label:string}){return <button type="button" onClick={onClick} className={`flex min-h-16 flex-col items-center justify-center gap-2 rounded-xl text-[9px] font-bold ${active?'bg-violet-600 text-white':'bg-white text-slate-500'}`}>{icon}{label}</button>}

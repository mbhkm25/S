import { useEffect, useState, type ReactNode } from 'react';
import { AlertTriangle, Loader2, MessageCircle, Play, RefreshCw, RotateCcw, Save } from 'lucide-react';
import {
  getTransactionalMessagingOverview, retryTransactionalMessage, runTransactionalMessageWorker,
  updateTransactionalMessageRule, type TransactionalMessageItem, type TransactionalMessageRule,
  type TransactionalMessagingOverview
} from '../../lib/transactionalMessagingApi';

const nf = new Intl.NumberFormat('en-US');
const df = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', hour12: true });

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block text-[10px] font-bold text-slate-600"><span className="mb-1.5 block">{label}</span>{children}</label>;
}

function statusLabel(value: string): string {
  return ({ pending: 'معلّقة', processing: 'قيد المعالجة', sent: 'مرسلة', delivered: 'تم التسليم', read: 'مقروءة', failed: 'فشلت', cancelled: 'ملغاة' } as Record<string,string>)[value] || value;
}

export default function TransactionalMessagingAdmin({ setError, setSuccess }: {
  setError: (value: string | null) => void;
  setSuccess: (value: string | null) => void;
}) {
  const [overview, setOverview] = useState<TransactionalMessagingOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);

  const load = async () => {
    setLoading(true);
    try { setOverview(await getTransactionalMessagingOverview()); }
    catch { setError('تعذر تحميل قواعد الرسائل الآلية.'); }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);

  const runWorker = async () => {
    setWorking(true);
    try {
      const result = await runTransactionalMessageWorker(100);
      setSuccess(`تم تشغيل عامل الرسائل: ${nf.format(result.sent)} مرسلة و${nf.format(result.failed)} فاشلة.`);
      await load();
    } catch { setError('تعذر تشغيل عامل الرسائل الآلية.'); }
    finally { setWorking(false); }
  };

  return <section className="space-y-3 rounded-[1.7rem] border border-slate-200 bg-slate-50 p-4">
    <div className="flex items-start justify-between gap-3">
      <div><div className="flex items-center gap-2"><MessageCircle className="h-4 w-4 text-emerald-600"/><h3 className="text-sm font-bold">الرسائل الآلية بعد الإجراءات</h3></div><p className="mt-1 text-[10px] leading-5 text-slate-500">اضبط قوالب Meta للرسائل الخدمية المرتبطة بالتقارير وسند Pro وانتهاء الاشتراك.</p></div>
      <div className="flex gap-2"><button onClick={() => void load()} className="flex h-10 w-10 items-center justify-center rounded-xl bg-white"><RefreshCw className={`h-4 w-4 ${loading?'animate-spin':''}`}/></button><button onClick={() => void runWorker()} disabled={working} className="flex min-h-10 items-center gap-2 rounded-xl bg-emerald-600 px-3 text-[9px] font-bold text-white disabled:opacity-40"><Play className="h-3.5 w-3.5"/>تشغيل المعلّق</button></div>
    </div>
    <div className="rounded-xl bg-amber-50 p-3 text-[9px] leading-5 text-amber-900"><strong>ضابط مهم:</strong> لا تُفعّل أي قاعدة قبل اعتماد القالب في WhatsApp Manager. الرسائل خدمية ولا تعتمد على الموافقة التسويقية، لكنها لا تُرسل لجهة محظورة.</div>
    {overview && <div className="grid grid-cols-4 gap-2">{[['معلّقة',overview.stats.pending],['قيد المعالجة',overview.stats.processing],['مرسلة',overview.stats.sent],['فشلت',overview.stats.failed]].map(([label,value])=><div key={String(label)} className="rounded-xl bg-white p-3 text-center"><p className="text-sm font-bold">{nf.format(Number(value))}</p><p className="mt-1 text-[8px] text-slate-400">{label}</p></div>)}</div>}
    {loading && !overview ? <div className="flex min-h-24 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin"/></div> : <div className="space-y-2">{overview?.rules.map(rule=><RuleCard key={rule.event_type} rule={rule} reload={load} setError={setError} setSuccess={setSuccess}/>)}</div>}
    {overview?.messages?.length ? <div className="space-y-2 pt-2"><h4 className="text-xs font-bold">آخر الرسائل</h4>{overview.messages.slice(0,30).map(item=><MessageRow key={item.id} item={item} reload={load} setError={setError} setSuccess={setSuccess}/>)}</div> : null}
  </section>;
}

function RuleCard({ rule, reload, setError, setSuccess }: {
  key?: string;
  rule: TransactionalMessageRule;
  reload: () => Promise<void>;
  setError: (value: string | null) => void;
  setSuccess: (value: string | null) => void;
}) {
  const [enabled,setEnabled]=useState(rule.enabled);
  const [template,setTemplate]=useState(rule.template_name || '');
  const [language,setLanguage]=useState(rule.template_language || 'ar');
  const [keys,setKeys]=useState(rule.parameter_keys.join('\n'));
  const [reason,setReason]=useState('');
  const [working,setWorking]=useState(false);
  const save=async()=>{setWorking(true);try{await updateTransactionalMessageRule({eventType:rule.event_type,enabled,templateName:template.trim(),templateLanguage:language.trim()||'ar',parameterKeys:keys.split('\n').map(x=>x.trim()).filter(Boolean),reason:reason.trim()});setSuccess(`تم حفظ قاعدة: ${rule.display_name}`);setReason('');await reload();}catch{setError('تعذر حفظ القاعدة. تأكد من اسم قالب Meta والسبب الإداري.');}finally{setWorking(false)}};
  return <article className="rounded-2xl bg-white p-4 shadow-sm"><div className="flex items-start justify-between gap-3"><div><h4 className="text-xs font-bold">{rule.display_name}</h4><p className="mt-1 text-[9px] leading-5 text-slate-500">{rule.description}</p></div><button type="button" onClick={()=>setEnabled(v=>!v)} className={`min-h-9 rounded-xl px-3 text-[9px] font-bold ${enabled?'bg-emerald-50 text-emerald-700':'bg-slate-100 text-slate-500'}`}>{enabled?'مفعّلة':'متوقفة'}</button></div><div className="mt-3 grid grid-cols-[1fr_90px] gap-2"><Field label="اسم قالب Meta"><input dir="ltr" className="admin-input text-left" value={template} onChange={e=>setTemplate(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g,''))}/></Field><Field label="اللغة"><input dir="ltr" className="admin-input text-left" value={language} onChange={e=>setLanguage(e.target.value)}/></Field></div><Field label="ترتيب متغيرات القالب — متغير في كل سطر"><textarea className="admin-input min-h-20 resize-none" value={keys} onChange={e=>setKeys(e.target.value)} /></Field><Field label="سبب التعديل الإداري"><textarea className="admin-input min-h-14 resize-none" value={reason} onChange={e=>setReason(e.target.value)} /></Field><button onClick={()=>void save()} disabled={working||reason.trim().length<5||(enabled&&!template.trim())} className="mt-2 flex min-h-10 w-full items-center justify-center gap-2 rounded-xl bg-slate-950 text-[10px] font-bold text-white disabled:opacity-40">{working?<Loader2 className="h-4 w-4 animate-spin"/>:<><Save className="h-3.5 w-3.5"/>حفظ القاعدة</>}</button></article>;
}

function MessageRow({ item, reload, setError, setSuccess }: {
  key?: string;
  item: TransactionalMessageItem;
  reload: () => Promise<void>;
  setError: (value: string | null) => void;
  setSuccess: (value: string | null) => void;
}) {
  const [reason,setReason]=useState(''); const [working,setWorking]=useState(false);
  const retry=async()=>{setWorking(true);try{await retryTransactionalMessage(item.id,reason.trim());setSuccess('تمت إعادة الرسالة إلى قائمة المحاولة.');setReason('');await reload();}catch{setError('تعذر إعادة الرسالة.');}finally{setWorking(false)}};
  const ok=['sent','delivered','read'].includes(item.status);
  return <article className="rounded-xl bg-white p-3"><div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-bold">{item.full_name || item.phone_normalized}</p><p className="mt-1 text-[8px] text-slate-400">{item.event_type} · {df.format(new Date(item.created_at))}</p></div><span className={`rounded-lg px-2 py-1 text-[8px] font-bold ${ok?'bg-emerald-50 text-emerald-700':item.status==='failed'?'bg-rose-50 text-rose-700':'bg-amber-50 text-amber-800'}`}>{statusLabel(item.status)}</span></div>{item.last_error&&<div className="mt-2 flex gap-2 rounded-lg bg-rose-50 p-2 text-[8px] text-rose-700"><AlertTriangle className="h-3 w-3 shrink-0"/>{item.last_error}</div>}{item.status==='failed'&&<div className="mt-2 grid grid-cols-[1fr_auto] gap-2"><input className="admin-input" value={reason} onChange={e=>setReason(e.target.value)} placeholder="سبب إعادة المحاولة"/><button onClick={()=>void retry()} disabled={working||reason.trim().length<5} className="flex min-h-10 items-center gap-1 rounded-xl bg-sky-50 px-3 text-[8px] font-bold text-sky-700 disabled:opacity-40"><RotateCcw className="h-3 w-3"/>إعادة</button></div>}</article>;
}

import { useEffect, useState } from 'react';
import { Bot, Brain, ChevronLeft, Clock3, Loader2, MessageSquareText, Mic2, RefreshCw, TriangleAlert, X } from 'lucide-react';
import {
  getAdminAssistantOverview, getAdminAssistantThread, updateAdminAssistantSettings,
  type AdminAssistantOverview, type AdminAssistantThread
} from '../../lib/platformAdminApi';

const numberFormat = new Intl.NumberFormat('en-US');
const dateFormat = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', hour12: true });
const formatDate = (value: string | null) => value ? dateFormat.format(new Date(value)) : '—';
const intentLabels: Record<string, string> = {
  faq: 'أسئلة سند', business_search: 'بحث أنشطة', catalog_search: 'بحث كتالوج',
  business_details: 'تفاصيل نشاط', support: 'دعم', memory: 'ذاكرة', greeting: 'ترحيب', unknown: 'غير محدد'
};

export default function WhatsAppAssistantAdmin({ setError, setSuccess }: {
  setError: (value: string | null) => void;
  setSuccess: (value: string | null) => void;
}) {
  const [data, setData] = useState<AdminAssistantOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try { setData(await getAdminAssistantOverview()); }
    catch { setError('تعذر تحميل مؤشرات مساعد واتساب.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);

  const update = async (field: 'enabled' | 'memory_enabled', value: boolean) => {
    if (!data || reason.trim().length < 5) return;
    setSaving(true);
    try {
      await updateAdminAssistantSettings({
        enabled: field === 'enabled' ? value : data.settings.enabled,
        memory_enabled: field === 'memory_enabled' ? value : data.settings.memory_enabled
      }, reason.trim());
      setReason('');
      setSuccess('تم تحديث إعدادات المساعد وتسجيل الإجراء إداريًا.');
      await load();
    } catch { setError('تعذر تحديث إعدادات المساعد.'); }
    finally { setSaving(false); }
  };

  if (loading && !data) return <div className="flex min-h-32 items-center justify-center rounded-2xl bg-white"><Loader2 className="h-5 w-5 animate-spin" /></div>;
  if (!data) return null;

  const cards = [
    ['المحادثات', data.stats.conversations, Bot], ['نشطة خلال 30 يومًا', data.stats.active_30d, MessageSquareText],
    ['الرسائل الواردة', data.stats.inbound_messages, MessageSquareText], ['الرسائل الصوتية', data.stats.audio_messages, Mic2],
    ['متوسط الاستجابة بالمللي ثانية', data.stats.avg_latency_ms, Clock3], ['أخطاء تحتاج مراجعة', data.stats.failed_messages, TriangleAlert]
  ] as const;

  return <section className="space-y-3 rounded-[1.6rem] bg-slate-950 p-4 text-white">
    <div className="flex items-start justify-between gap-3"><div><div className="flex items-center gap-2 text-emerald-300"><Bot className="h-4 w-4" /><span className="text-[10px] font-bold">مساعد سند الذكي</span></div><p className="mt-1 text-[9px] leading-5 text-slate-400">مراقبة المحادثات والذاكرة والأداء. الردود تستند إلى بيانات سند المنشورة فقط.</p></div><button type="button" onClick={() => void load()} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/10"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /></button></div>
    <div className="grid grid-cols-2 gap-2">{cards.map(([label, value, Icon]) => <div key={label} className="rounded-xl bg-white/[0.07] p-3"><Icon className="h-4 w-4 text-emerald-300" /><p className="mt-2 text-lg font-bold">{numberFormat.format(value)}</p><p className="mt-1 text-[8px] leading-4 text-slate-400">{label}</p></div>)}</div>
    <div className="rounded-xl bg-white/[0.07] p-3"><div className="flex flex-wrap gap-2">{data.intents.map((item) => <span key={item.intent} className="rounded-lg bg-white/10 px-2 py-1 text-[8px]">{intentLabels[item.intent] || item.intent}: {numberFormat.format(item.count)}</span>)}</div></div>
    <div className="space-y-2 rounded-xl bg-white/[0.07] p-3"><label className="block text-[9px] font-bold text-slate-300">سبب تغيير الإعدادات<input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="سبب واضح (5 أحرف على الأقل)" className="mt-2 w-full rounded-xl border-0 bg-white px-3 py-2.5 text-[10px] text-slate-950 outline-none" /></label><div className="grid grid-cols-2 gap-2"><button disabled={saving || reason.trim().length < 5} onClick={() => void update('enabled', !data.settings.enabled)} className={`min-h-10 rounded-xl text-[9px] font-bold disabled:opacity-40 ${data.settings.enabled ? 'bg-rose-500/20 text-rose-200' : 'bg-emerald-500 text-slate-950'}`}>{data.settings.enabled ? 'إيقاف الردود' : 'تشغيل الردود'}</button><button disabled={saving || reason.trim().length < 5} onClick={() => void update('memory_enabled', !data.settings.memory_enabled)} className="min-h-10 rounded-xl bg-white/10 text-[9px] font-bold disabled:opacity-40">{data.settings.memory_enabled ? 'إيقاف الذاكرة' : 'تشغيل الذاكرة'}</button></div><p dir="ltr" className="text-left text-[8px] text-slate-500">{data.settings.model} · {data.settings.prompt_version}</p></div>
    <div><h4 className="text-[10px] font-bold">آخر المحادثات</h4><div className="mt-2 space-y-2">{data.conversations.map((item) => <button type="button" key={item.id} onClick={() => setSelected(item.id)} className="flex w-full items-center justify-between gap-3 rounded-xl bg-white p-3 text-right text-slate-950"><div className="min-w-0"><p className="truncate text-[10px] font-bold">{item.display_name || 'مستخدم واتساب'}</p><p dir="ltr" className="mt-1 text-right text-[9px] text-slate-500">+{item.phone_normalized}</p><p className="mt-1 truncate text-[8px] text-slate-400">{item.last_message || 'لا يوجد نص'}</p></div><div className="shrink-0 text-left"><p className="text-[8px] font-bold text-emerald-700">{intentLabels[item.last_intent || 'unknown'] || item.last_intent}</p><p className="mt-1 text-[7px] text-slate-400">{formatDate(item.last_message_at)}</p><ChevronLeft className="mr-auto mt-1 h-3 w-3" /></div></button>)}{data.conversations.length === 0 && <p className="rounded-xl border border-dashed border-white/15 p-5 text-center text-[9px] text-slate-400">ستظهر المحادثات هنا بعد وصول أول رسالة نصية أو صوتية.</p>}</div></div>
    {selected && <ThreadModal conversationId={selected} onClose={() => setSelected(null)} setError={setError} />}
  </section>;
}

function ThreadModal({ conversationId, onClose, setError }: { conversationId: string; onClose: () => void; setError: (value: string | null) => void }) {
  const [thread, setThread] = useState<AdminAssistantThread | null>(null);
  useEffect(() => { let active = true; void getAdminAssistantThread(conversationId).then((value) => { if (active) setThread(value); }).catch(() => setError('تعذر فتح المحادثة.')); return () => { active = false; }; }, [conversationId, setError]);
  return <div className="fixed inset-0 z-[100] overflow-y-auto bg-slate-950/70 p-4"><div className="mx-auto my-4 max-w-lg rounded-[1.7rem] bg-slate-100 p-4 text-slate-950"><div className="flex items-center justify-between"><div><h3 className="text-sm font-bold">سجل المحادثة</h3>{thread?.contact && <p dir="ltr" className="mt-1 text-right text-[9px] text-slate-500">+{thread.contact.phone_normalized}</p>}</div><button onClick={onClose} className="flex h-10 w-10 items-center justify-center rounded-xl bg-white"><X className="h-4 w-4" /></button></div>{!thread ? <div className="flex min-h-40 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin" /></div> : <><div className="mt-4 space-y-2">{thread.messages.map((message) => <article key={message.id} className={`max-w-[88%] rounded-2xl p-3 ${message.direction === 'inbound' ? 'mr-0 bg-white' : 'mr-auto bg-emerald-100'}`}><div className="flex items-center gap-2 text-[8px] text-slate-400">{message.message_type === 'audio' && <Mic2 className="h-3 w-3" />}<span>{message.direction === 'inbound' ? 'المستخدم' : 'مساعد سند'}</span><span>·</span><span>{formatDate(message.created_at)}</span></div><p className="mt-2 whitespace-pre-wrap text-[10px] leading-5">{message.transcript || message.body_text || '—'}</p>{message.error_code && <p dir="ltr" className="mt-2 text-left text-[8px] text-rose-600">{message.error_code}</p>}</article>)}</div><div className="mt-4 rounded-xl bg-white p-3"><div className="flex items-center gap-2"><Brain className="h-4 w-4 text-violet-600" /><h4 className="text-[10px] font-bold">الذاكرة المصرح بها</h4></div><div className="mt-2 space-y-1">{thread.memories.map((memory) => <p key={memory.id} className="text-[9px] text-slate-600">• {memory.value_text}</p>)}{thread.memories.length === 0 && <p className="text-[9px] text-slate-400">لا توجد تفضيلات محفوظة.</p>}</div></div></>}</div></div>;
}

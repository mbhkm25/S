import { useEffect, useState, type ReactNode } from 'react';
import {
  Ban, CheckCircle2, ChevronLeft, Loader2, MessageCircle, RefreshCw,
  Search, Send, ShieldCheck, Smartphone, UserCheck, Users, XCircle
} from 'lucide-react';
import {
  cancelAdminWhatsAppCampaign, createAdminWhatsAppCampaign,
  getAdminWhatsAppContactDetails, getAdminWhatsAppOverview,
  queueAdminWhatsAppCampaign, runAdminWhatsAppCampaign, setAdminWhatsAppContactStatus,
  type AdminWhatsAppCampaign, type AdminWhatsAppContact,
  type AdminWhatsAppContactDetails, type AdminWhatsAppOverview
} from '../../lib/platformAdminApi';
import WhatsAppAssistantAdmin from './WhatsAppAssistantAdmin';

const numberFormat = new Intl.NumberFormat('en-US');
const dateFormat = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', hour12: true });

function formatDate(value: string | null): string {
  return value ? dateFormat.format(new Date(value)) : '—';
}

function statusLabel(status: string): string {
  return ({
    whatsapp_only: 'واتساب فقط', registered: 'مسجل', profile_completed: 'ملف مكتمل', pro_user: 'سند Pro', blocked: 'محظور',
    unknown: 'غير محدد', opted_in: 'وافق', opted_out: 'ألغى الموافقة', active: 'نشط',
    draft: 'مسودة', queued: 'في قائمة الإرسال', processing: 'جارٍ الإرسال', completed: 'مكتملة', failed: 'فشلت', cancelled: 'ملغاة'
  } as Record<string, string>)[status] || status;
}

function Badge({ value }: { value: string }) {
  const good = ['registered', 'profile_completed', 'pro_user', 'opted_in', 'active', 'completed'].includes(value);
  const danger = ['blocked', 'opted_out', 'failed', 'cancelled'].includes(value);
  return <span className={`rounded-lg px-2 py-1 text-[9px] font-bold ${good ? 'bg-emerald-50 text-emerald-700' : danger ? 'bg-rose-50 text-rose-700' : 'bg-slate-100 text-slate-600'}`}>{statusLabel(value)}</span>;
}

export default function WhatsAppAdminSection({ setError, setSuccess }: {
  setError: (value: string | null) => void;
  setSuccess: (value: string | null) => void;
}) {
  const [overview, setOverview] = useState<AdminWhatsAppOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('');
  const [selectedContact, setSelectedContact] = useState<string | null>(null);
  const [showCampaignForm, setShowCampaignForm] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      setOverview(await getAdminWhatsAppOverview(search.trim(), filter, 120));
    } catch {
      setError('تعذر تحميل مستخدمي واتساب.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [filter]);

  if (loading && !overview) return <div className="flex min-h-40 items-center justify-center rounded-2xl bg-white"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>;
  if (!overview) return <div className="rounded-2xl bg-white p-7 text-center text-xs text-slate-500">لا تتوفر بيانات واتساب الآن.</div>;

  const stats = overview.stats;
  const cards = [
    ['جهات واتساب', stats.contacts, MessageCircle],
    ['واتساب فقط', stats.whatsapp_only, Smartphone],
    ['تحولوا إلى حسابات', stats.registered, UserCheck],
    ['وافقوا على الرسائل', stats.marketing_opted_in, ShieldCheck],
    ['الرسائل الواردة', stats.messages, Send],
    ['الإشعارات المالية', stats.operations, CheckCircle2]
  ] as const;

  return <section className="space-y-4">
    <div className="flex items-end justify-between gap-3">
      <div><h2 className="text-sm font-bold">مستخدمو سند عبر واتساب</h2><p className="mt-1 text-[10px] leading-5 text-slate-500">سجل فعلي للمرسلين والتحويل إلى التطبيق، مع إرسال مقيد بالموافقة وقوالب Meta المعتمدة.</p></div>
      <button type="button" onClick={() => void load()} disabled={loading} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white shadow-sm"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /></button>
    </div>

    <WhatsAppAssistantAdmin setError={setError} setSuccess={setSuccess} />

    <div className="grid grid-cols-2 gap-2">{cards.map(([label, value, Icon]) => <div key={label} className="rounded-2xl bg-white p-4 shadow-sm"><Icon className="h-5 w-5 text-emerald-600" /><p className="mt-3 text-xl font-bold">{numberFormat.format(value)}</p><p className="mt-1 text-[9px] text-slate-500">{label}</p></div>)}</div>
    <div className="rounded-2xl bg-amber-50 p-4 text-[10px] leading-6 text-amber-900"><strong>ضابط الإرسال:</strong> الجهة التي حالتها «غير محدد» لا تدخل في أي حملة. لا يُرسل إلا لمن سُجلت موافقته صراحة، وباسم قالب معتمد في WhatsApp Manager.</div>

    <div className="flex items-center justify-between"><h3 className="text-xs font-bold">الحملات</h3><button type="button" onClick={() => setShowCampaignForm(true)} className="min-h-10 rounded-xl bg-slate-950 px-4 text-[10px] font-bold text-white">إنشاء حملة</button></div>
    <div className="space-y-2">{overview.campaigns.map((campaign) => <div key={campaign.id}><CampaignCard campaign={campaign} reload={load} setError={setError} setSuccess={setSuccess} /></div>)}{overview.campaigns.length === 0 && <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-6 text-center text-[10px] text-slate-500">لا توجد حملات بعد. يمكنك إنشاء مسودة من قالب Meta معتمد.</div>}</div>

    <div className="pt-2"><h3 className="text-xs font-bold">جهات الاتصال</h3><p className="mt-1 text-[9px] text-slate-500">نشط خلال آخر 30 يومًا: {numberFormat.format(stats.active_30d)}</p></div>
    <div className="grid grid-cols-[1fr_auto] gap-2"><div className="relative"><Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void load(); }} placeholder="الاسم أو رقم الجوال" className="w-full rounded-xl border-0 bg-white py-3 pl-3 pr-10 text-xs outline-none ring-1 ring-slate-100" /></div><button type="button" onClick={() => void load()} className="min-h-11 rounded-xl bg-slate-950 px-4 text-[10px] font-bold text-white">بحث</button></div>
    <div className="no-scrollbar flex gap-2 overflow-x-auto">{[['', 'الكل'], ['whatsapp_only', 'واتساب فقط'], ['registered', 'المسجلون'], ['pro_user', 'سند Pro'], ['blocked', 'المحظورون']].map(([value, label]) => <button type="button" key={value} onClick={() => setFilter(value)} className={`min-h-9 shrink-0 rounded-xl px-3 text-[9px] font-bold ${filter === value ? 'bg-emerald-600 text-white' : 'bg-white text-slate-500'}`}>{label}</button>)}</div>
    <div className="space-y-2">{overview.contacts.map((contact) => <button type="button" key={contact.id} onClick={() => setSelectedContact(contact.id)} className="block w-full rounded-2xl bg-white p-4 text-right shadow-sm"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><h4 className="truncate text-xs font-bold">{contact.display_name || contact.linked_user_name || 'مستخدم واتساب'}</h4><p dir="ltr" className="mt-1 text-right text-[10px] text-slate-500">+{contact.phone_normalized}</p><p className="mt-1 text-[9px] text-slate-400">آخر تفاعل: {formatDate(contact.last_seen_at)}</p></div><div className="flex shrink-0 flex-col items-end gap-1"><Badge value={contact.registration_status} /><Badge value={contact.marketing_status} /></div></div><div className="mt-3 grid grid-cols-3 gap-2 border-t border-slate-100 pt-3 text-center"><Metric label="رسالة" value={contact.messages_count} /><Metric label="عملية" value={contact.operations_count} /><div className="flex items-center justify-center"><ChevronLeft className="h-4 w-4 text-slate-400" /></div></div></button>)}{overview.contacts.length === 0 && <div className="rounded-2xl bg-white p-7 text-center text-xs text-slate-500">لا توجد نتائج مطابقة.</div>}</div>

    {showCampaignForm && <CampaignForm onClose={() => setShowCampaignForm(false)} onCreated={async () => { setShowCampaignForm(false); setSuccess('تم إنشاء مسودة الحملة. راجعها ثم نفّذ الإرسال من بطاقتها.'); await load(); }} setError={setError} />}
    {selectedContact && <ContactModal contactId={selectedContact} onClose={() => setSelectedContact(null)} reload={load} setError={setError} setSuccess={setSuccess} />}
  </section>;
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div><p className="text-xs font-bold">{numberFormat.format(value)}</p><p className="mt-1 text-[8px] text-slate-400">{label}</p></div>;
}

function CampaignCard({ campaign, reload, setError, setSuccess }: { campaign: AdminWhatsAppCampaign; reload: () => Promise<void>; setError: (value: string | null) => void; setSuccess: (value: string | null) => void }) {
  const [reason, setReason] = useState('');
  const [working, setWorking] = useState(false);
  const canQueue = campaign.status === 'draft';
  const canContinue = ['queued', 'processing'].includes(campaign.status) && campaign.pending_count > 0;
  const canCancel = ['draft', 'queued', 'processing'].includes(campaign.status);
  const submit = async (action: 'queue' | 'cancel') => {
    if (reason.trim().length < 5) return;
    setWorking(true);
    try {
      if (action === 'queue') {
        const count = await queueAdminWhatsAppCampaign(campaign.id, reason.trim());
        setSuccess(`بدأ إرسال القالب المعتمد إلى ${numberFormat.format(count)} جهة وافقت على الرسائل.`);
      } else {
        await cancelAdminWhatsAppCampaign(campaign.id, reason.trim());
        setSuccess('تم إلغاء الحملة وإيقاف المستلمين الذين لم يبدأ إرسالهم.');
      }
      setReason('');
      await reload();
    } catch {
      setError(action === 'queue' ? 'تعذر تشغيل الحملة. تأكد من وجود موافقات ومن صحة اسم قالب Meta.' : 'تعذر إلغاء الحملة.');
    } finally { setWorking(false); }
  };
  const continueSending = async () => {
    setWorking(true);
    try {
      await runAdminWhatsAppCampaign(campaign.id);
      setSuccess('تمت متابعة دفعة الإرسال وتحديث نتائج الحملة.');
      await reload();
    } catch { setError('تعذر متابعة الإرسال. يمكنك المحاولة مجددًا دون تكرار الرسائل المرسلة.'); }
    finally { setWorking(false); }
  };
  return <article className="rounded-2xl bg-white p-4 shadow-sm"><div className="flex items-start justify-between gap-3"><div><h4 className="text-xs font-bold">{campaign.name}</h4><p dir="ltr" className="mt-1 text-right text-[9px] text-slate-500">{campaign.template_name} · {campaign.template_language}</p></div><Badge value={campaign.status} /></div><div className="mt-3 grid grid-cols-4 gap-1 text-center"><Metric label="الجمهور" value={campaign.total_recipients} /><Metric label="مرسلة" value={campaign.sent_count} /><Metric label="مقروءة" value={campaign.read_count} /><Metric label="فشلت" value={campaign.failed_count} /></div>{canContinue && <button disabled={working} onClick={() => void continueSending()} className="mt-3 min-h-10 w-full rounded-xl bg-sky-50 text-[10px] font-bold text-sky-700 disabled:opacity-40">متابعة الإرسال ({numberFormat.format(campaign.pending_count)} متبقية)</button>}{(canQueue || canCancel) && <div className="mt-3 border-t border-slate-100 pt-3"><textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="سبب الإجراء الإداري (5 أحرف على الأقل)" className="admin-input min-h-16 resize-none" /><div className="mt-2 grid grid-cols-2 gap-2">{canQueue && <button disabled={working || reason.trim().length < 5} onClick={() => void submit('queue')} className="min-h-10 rounded-xl bg-emerald-600 text-[10px] font-bold text-white disabled:opacity-40">إرسال القالب</button>}{canCancel && <button disabled={working || reason.trim().length < 5} onClick={() => void submit('cancel')} className="min-h-10 rounded-xl bg-rose-50 text-[10px] font-bold text-rose-700 disabled:opacity-40">إلغاء الحملة</button>}</div></div>}</article>;
}

function CampaignForm({ onClose, onCreated, setError }: { onClose: () => void; onCreated: () => Promise<void>; setError: (value: string | null) => void }) {
  const [name, setName] = useState('دعوة تثبيت تطبيق سند');
  const [purpose, setPurpose] = useState<AdminWhatsAppCampaign['purpose']>('install_app');
  const [templateName, setTemplateName] = useState('');
  const [language, setLanguage] = useState('ar');
  const [parameters, setParameters] = useState('');
  const [registration, setRegistration] = useState('whatsapp_only');
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (name.trim().length < 3 || !/^[a-z0-9_]+$/.test(templateName.trim())) return;
    setSaving(true);
    try {
      await createAdminWhatsAppCampaign({ name: name.trim(), purpose, templateName: templateName.trim(), templateLanguage: language.trim() || 'ar', templateParameters: parameters.split('\n').map((item) => item.trim()).filter(Boolean), registrationStatus: registration });
      await onCreated();
    } catch { setError('تعذر إنشاء الحملة. استخدم الاسم التقني الدقيق لقالب Meta المعتمد.'); }
    finally { setSaving(false); }
  };
  return <div className="fixed inset-0 z-[90] overflow-y-auto bg-slate-950/65 p-4"><div className="mx-auto my-5 max-w-md rounded-[1.8rem] bg-white p-5"><div className="flex items-center justify-between"><div><h3 className="text-sm font-bold">حملة واتساب جديدة</h3><p className="mt-1 text-[9px] text-slate-500">إنشاء المسودة لا يرسل شيئًا.</p></div><button onClick={onClose} className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100"><XCircle className="h-4 w-4" /></button></div><div className="mt-4 space-y-3"><Field label="اسم الحملة"><input className="admin-input" value={name} onChange={(event) => setName(event.target.value)} /></Field><Field label="الغرض"><select className="admin-input" value={purpose} onChange={(event) => setPurpose(event.target.value as AdminWhatsAppCampaign['purpose'])}><option value="install_app">دعوة تثبيت التطبيق</option><option value="service_update">تحديث خدمة</option><option value="transactional_notice">إشعار خدمي</option></select></Field><Field label="اسم قالب Meta المعتمد"><input dir="ltr" className="admin-input text-left" placeholder="sanad_install_invitation" value={templateName} onChange={(event) => setTemplateName(event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))} /></Field><div className="grid grid-cols-2 gap-2"><Field label="لغة القالب"><input dir="ltr" className="admin-input text-left" value={language} onChange={(event) => setLanguage(event.target.value)} /></Field><Field label="الجمهور"><select className="admin-input" value={registration} onChange={(event) => setRegistration(event.target.value)}><option value="whatsapp_only">واتساب فقط</option><option value="registered">المسجلون</option><option value="pro_user">سند Pro</option><option value="">كل الموافقين</option></select></Field></div><Field label="متغيرات نص القالب — متغير في كل سطر"><textarea dir="rtl" className="admin-input min-h-24 resize-none" value={parameters} onChange={(event) => setParameters(event.target.value)} placeholder={'محمد\nhttps://app.sanadflow.com/install/'} /></Field><div className="rounded-xl bg-amber-50 p-3 text-[9px] leading-5 text-amber-900">سيُلتقط الجمهور عند الضغط لاحقًا على «إرسال القالب»، وسيقتصر تلقائيًا على حالة <strong>وافق</strong>.</div><button onClick={() => void save()} disabled={saving || name.trim().length < 3 || !/^[a-z0-9_]+$/.test(templateName.trim())} className="flex min-h-11 w-full items-center justify-center rounded-xl bg-slate-950 text-xs font-bold text-white disabled:opacity-40">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'حفظ المسودة'}</button></div></div></div>;
}

function ContactModal({ contactId, onClose, reload, setError, setSuccess }: { contactId: string; onClose: () => void; reload: () => Promise<void>; setError: (value: string | null) => void; setSuccess: (value: string | null) => void }) {
  const [details, setDetails] = useState<AdminWhatsAppContactDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [reason, setReason] = useState('');
  const [consentSource, setConsentSource] = useState('');
  const [working, setWorking] = useState(false);
  useEffect(() => { void getAdminWhatsAppContactDetails(contactId).then(setDetails).catch(() => setError('تعذر تحميل سجل جهة واتساب.')).finally(() => setLoading(false)); }, [contactId, setError]);
  const change = async (action: 'block' | 'unblock' | 'opt_in' | 'opt_out') => {
    if (reason.trim().length < 5 || (action === 'opt_in' && consentSource.trim().length < 3)) return;
    setWorking(true);
    try {
      await setAdminWhatsAppContactStatus(contactId, {
        transactionalStatus: action === 'block' ? 'blocked' : action === 'unblock' ? 'active' : undefined,
        marketingStatus: action === 'opt_in' ? 'opted_in' : action === 'opt_out' ? 'opted_out' : undefined,
        reason: reason.trim(), consentSource: action === 'opt_in' ? consentSource.trim() : undefined
      });
      setSuccess('تم تحديث جهة واتساب وتسجيل الإجراء في سجل الإدارة.');
      await reload(); onClose();
    } catch { setError('تعذر تحديث جهة واتساب.'); }
    finally { setWorking(false); }
  };
  const contact = details?.contact as AdminWhatsAppContact | undefined;
  return <div className="fixed inset-0 z-[90] overflow-y-auto bg-slate-950/65 p-4"><div className="mx-auto my-5 max-w-md rounded-[1.8rem] bg-[#f7f7f5] p-5"><div className="flex items-center justify-between"><h3 className="text-sm font-bold">سجل مستخدم واتساب</h3><button onClick={onClose} className="flex h-10 w-10 items-center justify-center rounded-xl bg-white"><XCircle className="h-4 w-4" /></button></div>{loading ? <div className="flex min-h-44 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin" /></div> : !contact ? <p className="mt-5 text-xs">تعذر التحميل.</p> : <div className="mt-4 space-y-3"><section className="rounded-2xl bg-white p-4"><h4 className="text-sm font-bold">{contact.display_name || 'مستخدم واتساب'}</h4><p dir="ltr" className="mt-1 text-right text-xs">+{contact.phone_normalized}</p><div className="mt-3 flex flex-wrap gap-1"><Badge value={contact.registration_status} /><Badge value={contact.transactional_status} /><Badge value={contact.marketing_status} /></div><div className="mt-4 grid grid-cols-2 gap-2"><Metric label="رسالة" value={contact.messages_count} /><Metric label="عملية" value={contact.operations_count} /></div></section><section className="rounded-2xl bg-white p-4"><h4 className="text-xs font-bold">إجراء إداري</h4><textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="سبب الإجراء (مطلوب)" className="admin-input mt-3 min-h-16 resize-none" /><input value={consentSource} onChange={(event) => setConsentSource(event.target.value)} placeholder="مصدر إثبات الموافقة — مطلوب عند تفعيل الرسائل" className="admin-input mt-2" /><div className="mt-2 grid grid-cols-2 gap-2"><button disabled={working || reason.trim().length < 5 || consentSource.trim().length < 3} onClick={() => void change('opt_in')} className="min-h-10 rounded-xl bg-emerald-50 text-[9px] font-bold text-emerald-700 disabled:opacity-40">تسجيل موافقة موثقة</button><button disabled={working || reason.trim().length < 5} onClick={() => void change('opt_out')} className="min-h-10 rounded-xl bg-amber-50 text-[9px] font-bold text-amber-800 disabled:opacity-40">إلغاء الرسائل</button><button disabled={working || reason.trim().length < 5} onClick={() => void change(contact.transactional_status === 'blocked' ? 'unblock' : 'block')} className="col-span-2 flex min-h-10 items-center justify-center gap-2 rounded-xl bg-rose-50 text-[9px] font-bold text-rose-700 disabled:opacity-40"><Ban className="h-3 w-3" />{contact.transactional_status === 'blocked' ? 'رفع الحظر' : 'حظر التفاعل'}</button></div></section><section className="rounded-2xl bg-white p-4"><h4 className="text-xs font-bold">آخر الأحداث</h4><div className="mt-3 space-y-2">{details?.events.slice(0, 20).map((event) => <div key={event.id} className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 p-3"><span className="text-[9px] font-bold">{event.event_type}</span><span className="text-[8px] text-slate-400">{formatDate(event.occurred_at)}</span></div>)}</div></section></div>}</div></div>;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block text-[10px] font-bold text-slate-600"><span className="mb-1.5 block">{label}</span>{children}</label>;
}

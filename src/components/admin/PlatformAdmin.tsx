import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Activity, AlertTriangle, ArrowLeft, BadgeCheck, Building2, CheckCircle2,
  ClipboardList, CreditCard, FileClock, Loader2, RefreshCw, Save, Search,
  Settings2, ShieldCheck, Users, XCircle
} from 'lucide-react';
import {
  getPlatformAdminAccess, getPlatformAdminSnapshot, reviewAdminBusiness,
  setAdminUserStatus, updateAdminPlan, updateAdminPublicInformation,
  type AdminBusiness, type AdminPlan, type AdminPublicInformation,
  type AdminUser, type PlatformAdminSnapshot
} from '../../lib/platformAdminApi';

type Tab = 'overview' | 'users' | 'operations' | 'businesses' | 'pro' | 'settings' | 'audit';

interface Props {
  onNavigate: (page: string, token?: string) => void;
}

interface ConfirmAction {
  title: string;
  description: string;
  noteLabel?: string;
  confirmLabel: string;
  tone?: 'dark' | 'danger';
  run: (reason: string, note: string) => Promise<void>;
}

const tabs: Array<{ id: Tab; label: string; icon: typeof Activity }> = [
  { id: 'overview', label: 'النظرة العامة', icon: Activity },
  { id: 'users', label: 'المستخدمون', icon: Users },
  { id: 'operations', label: 'العمليات', icon: ClipboardList },
  { id: 'businesses', label: 'الأنشطة', icon: Building2 },
  { id: 'pro', label: 'سند Pro', icon: CreditCard },
  { id: 'settings', label: 'الإعدادات', icon: Settings2 },
  { id: 'audit', label: 'سجل الإدارة', icon: FileClock }
];

const dateFormat = new Intl.DateTimeFormat('ar-YE', { dateStyle: 'medium', timeStyle: 'short' });
const numberFormat = new Intl.NumberFormat('ar-YE');

function formatDate(value: string | null): string {
  return value ? dateFormat.format(new Date(value)) : '—';
}

function Badge({ children, tone = 'slate' }: { children: ReactNode; tone?: 'slate' | 'green' | 'amber' | 'red' | 'blue' }) {
  const colors = {
    slate: 'bg-slate-100 text-slate-600', green: 'bg-emerald-50 text-emerald-700',
    amber: 'bg-amber-50 text-amber-700', red: 'bg-rose-50 text-rose-700', blue: 'bg-sky-50 text-sky-700'
  };
  return <span className={`rounded-lg px-2 py-1 text-[10px] font-bold ${colors[tone]}`}>{children}</span>;
}

function statusTone(value: string): 'slate' | 'green' | 'amber' | 'red' | 'blue' {
  if (['active', 'published', 'verified', 'approved', 'completed'].includes(value)) return 'green';
  if (['pending', 'pending_review', 'processing', 'under_review'].includes(value)) return 'amber';
  if (['disabled', 'rejected', 'suspended', 'failed'].includes(value)) return 'red';
  return 'slate';
}

function Empty({ text }: { text: string }) {
  return <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center text-xs text-slate-500">{text}</div>;
}

export default function PlatformAdmin({ onNavigate }: Props) {
  const [tab, setTab] = useState<Tab>('overview');
  const [snapshot, setSnapshot] = useState<PlatformAdminSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [denied, setDenied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [confirm, setConfirm] = useState<ConfirmAction | null>(null);
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async (quiet = false) => {
    quiet ? setRefreshing(true) : setLoading(true);
    setError(null);
    try {
      const access = await getPlatformAdminAccess();
      if (!access.allowed) {
        setDenied(true);
        setSnapshot(null);
        return;
      }
      setDenied(false);
      setSnapshot(await getPlatformAdminSnapshot(75));
    } catch {
      setError('تعذر تحميل لوحة الإدارة. تحقق من الاتصال ثم أعد المحاولة.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const users = useMemo(() => {
    const q = search.trim().toLowerCase();
    return !q ? snapshot?.users || [] : (snapshot?.users || []).filter((item) =>
      [item.full_name, item.phone, item.email, item.governorate].some((value) => value?.toLowerCase().includes(q))
    );
  }, [search, snapshot?.users]);

  const operations = useMemo(() => {
    const q = search.trim().toLowerCase();
    return !q ? snapshot?.operations || [] : (snapshot?.operations || []).filter((item) =>
      [item.financial_entity, item.transaction_type, item.submitted_by_name, item.submitted_by_phone, item.public_token]
        .some((value) => String(value || '').toLowerCase().includes(q))
    );
  }, [search, snapshot?.operations]);

  const businesses = useMemo(() => {
    const q = search.trim().toLowerCase();
    return !q ? snapshot?.businesses || [] : (snapshot?.businesses || []).filter((item) =>
      [item.name, item.owner_name, item.owner_phone, item.governorate, item.city].some((value) => value?.toLowerCase().includes(q))
    );
  }, [search, snapshot?.businesses]);

  const runConfirmed = async () => {
    if (!confirm || reason.trim().length < 5) return;
    setSubmitting(true);
    setError(null);
    try {
      await confirm.run(reason.trim(), note.trim());
      setConfirm(null);
      setReason('');
      setNote('');
      setSuccess('تم تنفيذ الإجراء وتسجيله في سجل الإدارة.');
      await load(true);
    } catch {
      setError('تعذر تنفيذ الإجراء. راجع البيانات وحاول مرة أخرى.');
    } finally {
      setSubmitting(false);
    }
  };

  const requestUserStatus = (user: AdminUser, status: AdminUser['status']) => setConfirm({
    title: status === 'disabled' ? 'تعطيل المستخدم' : 'تفعيل المستخدم',
    description: `${user.full_name || user.phone || 'المستخدم'} — سيُطبق التغيير فورًا.`,
    confirmLabel: status === 'disabled' ? 'تعطيل الحساب' : 'تفعيل الحساب',
    tone: status === 'disabled' ? 'danger' : 'dark',
    run: (adminReason) => setAdminUserStatus(user.id, status, adminReason)
  });

  const requestBusinessReview = (business: AdminBusiness, decision: string) => setConfirm({
    title: decision === 'published' ? 'اعتماد ونشر النشاط' : decision === 'rejected' ? 'رفض النشاط' : 'تعليق ظهور النشاط',
    description: business.name,
    noteLabel: 'ملاحظة المراجعة لصاحب النشاط',
    confirmLabel: decision === 'published' ? 'اعتماد النشاط' : decision === 'rejected' ? 'رفض النشاط' : 'تعليق النشاط',
    tone: decision === 'published' ? 'dark' : 'danger',
    run: (adminReason, reviewNote) => reviewAdminBusiness(business.id, decision, reviewNote, adminReason)
  });

  if (loading) return <div className="flex min-h-[55vh] items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-slate-400" /></div>;

  if (denied) return (
    <div className="mx-auto max-w-md rounded-[2rem] bg-white p-7 text-center shadow-sm">
      <ShieldCheck className="mx-auto h-12 w-12 text-slate-300" />
      <h1 className="mt-4 text-lg font-bold">صفحة إدارية محمية</h1>
      <p className="mt-2 text-xs leading-6 text-slate-500">هذا الحساب لا يملك صلاحية مدير سند.</p>
      <button onClick={() => onNavigate('profile')} className="mt-5 min-h-11 w-full rounded-xl bg-slate-950 text-xs font-bold text-white">العودة إلى حسابي</button>
    </div>
  );

  if (!snapshot) return <Empty text="لا تتوفر بيانات إدارية الآن." />;

  return (
    <div dir="rtl" className="space-y-4 pb-10">
      <section className="overflow-hidden rounded-[2rem] bg-slate-950 p-5 text-white shadow-xl">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-emerald-300"><ShieldCheck className="h-4 w-4" /><span className="text-[10px] font-bold">وصول مدير المنصة</span></div>
            <h1 className="mt-2 text-xl font-bold">إدارة سند</h1>
            <p className="mt-1 text-[11px] text-slate-400">مركز متابعة وتشغيل المنصة</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => void load(true)} disabled={refreshing} aria-label="تحديث" className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/10 disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} /></button>
            <button onClick={() => onNavigate('profile')} aria-label="رجوع" className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/10"><ArrowLeft className="h-4 w-4" /></button>
          </div>
        </div>
      </section>

      {error && <div className="flex items-center gap-2 rounded-xl bg-rose-50 p-3 text-xs font-bold text-rose-700"><AlertTriangle className="h-4 w-4" />{error}</div>}
      {success && <button onClick={() => setSuccess(null)} className="flex w-full items-center gap-2 rounded-xl bg-emerald-50 p-3 text-right text-xs font-bold text-emerald-700"><CheckCircle2 className="h-4 w-4" />{success}</button>}

      <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
        {tabs.map(({ id, label, icon: Icon }) => <button key={id} onClick={() => { setTab(id); setSearch(''); }} className={`flex min-h-11 shrink-0 items-center gap-2 rounded-xl px-3 text-[11px] font-bold ${tab === id ? 'bg-slate-950 text-white' : 'bg-white text-slate-500 shadow-sm'}`}><Icon className="h-4 w-4" />{label}</button>)}
      </div>

      {tab === 'overview' && <Overview snapshot={snapshot} onTab={setTab} />}
      {tab === 'users' && <ListSection title="المستخدمون" search={search} setSearch={setSearch}>
        <div className="space-y-2">{users.map((user) => <div key={user.id}><UserCard user={user} onStatus={requestUserStatus} /></div>)}{!users.length && <Empty text="لا توجد نتائج مطابقة." />}</div>
      </ListSection>}
      {tab === 'operations' && <ListSection title="آخر العمليات" search={search} setSearch={setSearch}>
        <div className="space-y-2">{operations.map((operation) => <article key={operation.id} className="rounded-2xl bg-white p-4 shadow-sm"><div className="flex items-start justify-between gap-3"><div><h3 className="text-xs font-bold">{operation.financial_entity || 'جهة غير محددة'}</h3><p className="mt-1 text-[10px] text-slate-500">{operation.transaction_type || 'عملية مالية'} • {operation.submitted_by_name || operation.submitted_by_phone || 'مستخدم'}</p></div><div className="flex gap-1"><Badge tone={statusTone(operation.ai_status)}>{operation.ai_status}</Badge>{operation.possible_fraud && <Badge tone="red">اشتباه</Badge>}</div></div><div className="mt-3 flex items-end justify-between border-t border-slate-100 pt-3"><div><p className="text-sm font-bold">{operation.amount == null ? '—' : numberFormat.format(operation.amount)} <span className="text-[10px] text-slate-400">{operation.currency || ''}</span></p><p className="mt-1 text-[9px] text-slate-400">{formatDate(operation.created_at)}</p></div><Badge tone={statusTone(operation.sanad_risk_level)}>{operation.sanad_risk_level}</Badge></div></article>)}{!operations.length && <Empty text="لا توجد عمليات مطابقة." />}</div>
      </ListSection>}
      {tab === 'businesses' && <ListSection title="الأنشطة التجارية" search={search} setSearch={setSearch}>
        <div className="space-y-2">{businesses.map((business) => <div key={business.id}><BusinessCard business={business} onReview={requestBusinessReview} /></div>)}{!businesses.length && <Empty text="لا توجد أنشطة مطابقة." />}</div>
      </ListSection>}
      {tab === 'pro' && <ProSection snapshot={snapshot} onSaved={() => void load(true)} setError={setError} setSuccess={setSuccess} />}
      {tab === 'settings' && <SettingsSection info={snapshot.public_information} onSaved={() => void load(true)} setError={setError} setSuccess={setSuccess} />}
      {tab === 'audit' && <section className="space-y-2"><h2 className="px-1 text-sm font-bold">سجل الإجراءات الإدارية</h2>{snapshot.audit_log.map((item) => <article key={item.id} className="rounded-2xl bg-white p-4 shadow-sm"><div className="flex items-start justify-between gap-3"><div><h3 className="text-xs font-bold">{item.action}</h3><p className="mt-1 text-[10px] text-slate-500">{item.reason || 'دون ملاحظة'} • {item.actor_name || 'مدير سند'}</p></div><Badge>{item.target_type}</Badge></div><p className="mt-3 text-[9px] text-slate-400">{formatDate(item.created_at)}</p></article>)}{!snapshot.audit_log.length && <Empty text="لم تُسجل إجراءات إدارية بعد." />}</section>}

      {confirm && <div className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-950/55 p-4 sm:items-center"><div className="w-full max-w-md rounded-[1.8rem] bg-white p-5 shadow-2xl"><h2 className="text-base font-bold">{confirm.title}</h2><p className="mt-1 text-xs leading-6 text-slate-500">{confirm.description}</p>{confirm.noteLabel && <label className="mt-4 block text-[11px] font-bold">{confirm.noteLabel}<textarea value={note} onChange={(e) => setNote(e.target.value)} className="admin-input mt-2 min-h-20 resize-none" /></label>}<label className="mt-4 block text-[11px] font-bold">سبب الإجراء الإداري <span className="text-rose-500">*</span><textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="اكتب سببًا واضحًا (5 أحرف على الأقل)" className="admin-input mt-2 min-h-20 resize-none" /></label><div className="mt-4 grid grid-cols-2 gap-2"><button disabled={submitting || reason.trim().length < 5} onClick={() => void runConfirmed()} className={`min-h-11 rounded-xl text-xs font-bold text-white disabled:opacity-40 ${confirm.tone === 'danger' ? 'bg-rose-600' : 'bg-slate-950'}`}>{submitting ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : confirm.confirmLabel}</button><button disabled={submitting} onClick={() => { setConfirm(null); setReason(''); setNote(''); }} className="min-h-11 rounded-xl bg-slate-100 text-xs font-bold">إلغاء</button></div></div></div>}
    </div>
  );
}

function Overview({ snapshot, onTab }: { snapshot: PlatformAdminSnapshot; onTab: (tab: Tab) => void }) {
  const cards = [
    ['المستخدمون', snapshot.stats.users, Users, 'users' as Tab],
    ['كل العمليات', snapshot.stats.operations, ClipboardList, 'operations' as Tab],
    ['عمليات اليوم', snapshot.stats.operations_today, Activity, 'operations' as Tab],
    ['اشتراكات فعالة', snapshot.stats.active_subscriptions, BadgeCheck, 'pro' as Tab],
    ['طلبات دفع', snapshot.stats.pending_payments, CreditCard, 'pro' as Tab],
    ['أنشطة تنتظر', snapshot.stats.pending_businesses, Building2, 'businesses' as Tab],
    ['اشتباه محتمل', snapshot.stats.possible_fraud, AlertTriangle, 'operations' as Tab]
  ] as const;
  return <section className="space-y-4"><div className="grid grid-cols-2 gap-2">{cards.map(([label, value, Icon, target]) => <button key={label} onClick={() => onTab(target)} className="rounded-2xl bg-white p-4 text-right shadow-sm"><Icon className="h-5 w-5 text-slate-400" /><p className="mt-4 text-2xl font-bold text-slate-950">{numberFormat.format(value)}</p><p className="mt-1 text-[10px] text-slate-500">{label}</p></button>)}</div><div className="rounded-2xl bg-emerald-50 p-4"><div className="flex gap-3"><CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" /><div><h2 className="text-xs font-bold text-emerald-900">قاعدة البيانات متصلة</h2><p className="mt-1 text-[10px] leading-5 text-emerald-700">آخر مزامنة: {formatDate(snapshot.generated_at)}</p></div></div></div></section>;
}

function ListSection({ title, search, setSearch, children }: { title: string; search: string; setSearch: (value: string) => void; children: ReactNode }) {
  return <section className="space-y-3"><div className="flex items-center justify-between px-1"><h2 className="text-sm font-bold">{title}</h2></div><div className="relative"><Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بحث..." className="w-full rounded-xl border-0 bg-white py-3 pl-3 pr-10 text-xs outline-none ring-1 ring-slate-100 focus:ring-2 focus:ring-slate-400" /></div>{children}</section>;
}

function UserCard({ user, onStatus }: { user: AdminUser; onStatus: (user: AdminUser, status: AdminUser['status']) => void }) {
  const isAdmin = user.global_role === 'platform_admin';
  return <article className="rounded-2xl bg-white p-4 shadow-sm"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="flex items-center gap-2"><h3 className="truncate text-xs font-bold">{user.full_name || 'مستخدم سند'}</h3>{isAdmin && <Badge tone="blue">مدير</Badge>}</div><p dir="ltr" className="mt-1 text-right text-[10px] text-slate-500">{user.phone || user.email || '—'}</p><p className="mt-1 text-[9px] text-slate-400">{user.governorate || 'المحافظة غير محددة'} • انضم {formatDate(user.created_at)}</p></div><Badge tone={statusTone(user.status)}>{user.status}</Badge></div>{!isAdmin && <div className="mt-3 border-t border-slate-100 pt-3">{user.status === 'disabled' ? <button onClick={() => onStatus(user, 'active')} className="min-h-10 rounded-xl bg-emerald-50 px-4 text-[10px] font-bold text-emerald-700">تفعيل الحساب</button> : <button onClick={() => onStatus(user, 'disabled')} className="min-h-10 rounded-xl bg-rose-50 px-4 text-[10px] font-bold text-rose-700">تعطيل الحساب</button>}</div>}</article>;
}

function BusinessCard({ business, onReview }: { business: AdminBusiness; onReview: (business: AdminBusiness, decision: string) => void }) {
  return <article className="rounded-2xl bg-white p-4 shadow-sm"><div className="flex items-start justify-between gap-3"><div><h3 className="text-xs font-bold">{business.name}</h3><p className="mt-1 text-[10px] text-slate-500">{business.owner_name || business.owner_phone || 'مالك غير محدد'}</p><p className="mt-1 text-[9px] text-slate-400">{[business.governorate, business.city].filter(Boolean).join('، ') || 'الموقع غير محدد'}</p></div><div className="flex flex-col items-end gap-1"><Badge tone={statusTone(business.public_status)}>{business.public_status}</Badge><Badge tone={statusTone(business.verification_status)}>{business.verification_status}</Badge></div></div><div className="mt-3 grid grid-cols-3 gap-2 border-t border-slate-100 pt-3"><button onClick={() => onReview(business, 'published')} className="min-h-10 rounded-xl bg-emerald-50 text-[10px] font-bold text-emerald-700">اعتماد</button><button onClick={() => onReview(business, 'rejected')} className="min-h-10 rounded-xl bg-rose-50 text-[10px] font-bold text-rose-700">رفض</button><button onClick={() => onReview(business, 'suspended')} className="min-h-10 rounded-xl bg-slate-100 text-[10px] font-bold text-slate-700">تعليق</button></div></article>;
}

function ProSection({ snapshot, onSaved, setError, setSuccess }: { snapshot: PlatformAdminSnapshot; onSaved: () => void; setError: (v: string | null) => void; setSuccess: (v: string | null) => void }) {
  const [editing, setEditing] = useState<AdminPlan | null>(null);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const save = async () => { if (!editing || reason.trim().length < 5) return; setSaving(true); try { await updateAdminPlan(editing, reason.trim()); setEditing(null); setReason(''); setSuccess('تم تحديث الباقة من قاعدة البيانات.'); onSaved(); } catch { setError('تعذر حفظ إعدادات الباقة.'); } finally { setSaving(false); } };
  return <section className="space-y-4"><div><h2 className="text-sm font-bold">باقات سند Pro</h2><p className="mt-1 text-[10px] text-slate-500">السعر والمدة والحدود مصدرها قاعدة البيانات.</p></div>{snapshot.plans.map((plan) => <article key={plan.code} className="rounded-2xl bg-white p-4 shadow-sm"><div className="flex items-start justify-between"><div><h3 className="text-sm font-bold">{plan.display_name}</h3><p className="mt-1 text-[10px] text-slate-500">{plan.description || plan.code}</p></div><Badge tone={plan.is_active ? 'green' : 'red'}>{plan.is_active ? 'فعالة' : 'متوقفة'}</Badge></div><div className="mt-4 grid grid-cols-3 gap-2 text-center"><div className="rounded-xl bg-slate-50 p-2"><p className="text-xs font-bold">{numberFormat.format(plan.monthly_price_yer)}</p><p className="mt-1 text-[9px] text-slate-400">{plan.currency_code}</p></div><div className="rounded-xl bg-slate-50 p-2"><p className="text-xs font-bold">{numberFormat.format(plan.billing_duration_days)}</p><p className="mt-1 text-[9px] text-slate-400">يومًا</p></div><div className="rounded-xl bg-slate-50 p-2"><p className="text-xs font-bold">{numberFormat.format(plan.monthly_access_limit)}</p><p className="mt-1 text-[9px] text-slate-400">عملية</p></div></div><button onClick={() => { setEditing({ ...plan }); setReason(''); }} className="mt-3 min-h-10 w-full rounded-xl bg-slate-950 text-[10px] font-bold text-white">تعديل الباقة</button></article>)}<h2 className="pt-2 text-sm font-bold">طلبات الدفع الأخيرة</h2>{snapshot.payment_requests.map((request) => <article key={request.id} className="rounded-2xl bg-white p-4 shadow-sm"><div className="flex justify-between gap-3"><div><h3 className="text-xs font-bold">{request.full_name || request.phone || 'مستخدم سند'}</h3><p className="mt-1 text-[10px] text-slate-500">{numberFormat.format(request.expected_amount)} {request.expected_currency} • {request.payment_network}</p></div><Badge tone={statusTone(request.status)}>{request.status}</Badge></div><p className="mt-3 text-[9px] text-slate-400">{formatDate(request.created_at)}</p></article>)}{!snapshot.payment_requests.length && <Empty text="لا توجد طلبات دفع." />}<h2 className="pt-2 text-sm font-bold">الاشتراكات</h2>{snapshot.subscriptions.map((sub) => <article key={sub.id} className="rounded-2xl bg-white p-4 shadow-sm"><div className="flex justify-between gap-3"><div><h3 className="text-xs font-bold">{sub.full_name || sub.phone || 'مستخدم سند'}</h3><p className="mt-1 text-[10px] text-slate-500">{sub.plan_code} • حتى {formatDate(sub.current_period_end)}</p></div><Badge tone={statusTone(sub.status)}>{sub.status}</Badge></div></article>)}{editing && <div className="fixed inset-0 z-[80] overflow-y-auto bg-slate-950/55 p-4"><div className="mx-auto my-6 max-w-md rounded-[1.8rem] bg-white p-5"><div className="flex items-center justify-between"><h2 className="text-base font-bold">تعديل {editing.display_name}</h2><button onClick={() => setEditing(null)} className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100"><XCircle className="h-4 w-4" /></button></div><div className="mt-4 space-y-3"><AdminField label="اسم الباقة"><input className="admin-input" value={editing.display_name} onChange={(e) => setEditing({ ...editing, display_name: e.target.value })} /></AdminField><AdminField label="الوصف"><textarea className="admin-input min-h-20" value={editing.description || ''} onChange={(e) => setEditing({ ...editing, description: e.target.value })} /></AdminField><div className="grid grid-cols-2 gap-2"><AdminField label="السعر"><input type="number" min="0" className="admin-input" value={editing.monthly_price_yer} onChange={(e) => setEditing({ ...editing, monthly_price_yer: Number(e.target.value) })} /></AdminField><AdminField label="المدة بالأيام"><input type="number" min="1" className="admin-input" value={editing.billing_duration_days} onChange={(e) => setEditing({ ...editing, billing_duration_days: Number(e.target.value) })} /></AdminField></div><AdminField label="حد العمليات"><input type="number" min="1" className="admin-input" value={editing.monthly_access_limit} onChange={(e) => setEditing({ ...editing, monthly_access_limit: Number(e.target.value) })} /></AdminField><AdminField label="سبب التعديل"><textarea className="admin-input min-h-20" value={reason} onChange={(e) => setReason(e.target.value)} /></AdminField><label className="flex items-center gap-2 text-xs font-bold"><input type="checkbox" checked={editing.is_active} onChange={(e) => setEditing({ ...editing, is_active: e.target.checked })} />الباقة متاحة للاشتراك</label><button onClick={() => void save()} disabled={saving || reason.trim().length < 5} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-slate-950 text-xs font-bold text-white disabled:opacity-40">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}حفظ الباقة</button></div></div></div>}</section>;
}

function SettingsSection({ info, onSaved, setError, setSuccess }: { info: AdminPublicInformation | null; onSaved: () => void; setError: (v: string | null) => void; setSuccess: (v: string | null) => void }) {
  const [form, setForm] = useState<Partial<AdminPublicInformation>>(info || {});
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => setForm(info || {}), [info]);
  const set = (key: keyof AdminPublicInformation, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const save = async () => { if (reason.trim().length < 5) return; setSaving(true); try { await updateAdminPublicInformation(form, reason.trim()); setReason(''); setSuccess('تم تحديث معلومات الدعم العامة.'); onSaved(); } catch { setError('تعذر حفظ معلومات الدعم.'); } finally { setSaving(false); } };
  return <section className="space-y-4"><div><h2 className="text-sm font-bold">معلومات الدعم العامة</h2><p className="mt-1 text-[10px] text-slate-500">تظهر هذه البيانات تلقائيًا داخل التطبيق وصفحاته.</p></div><div className="space-y-3 rounded-2xl bg-white p-4 shadow-sm"><AdminField label="رقم واتساب"><input dir="ltr" className="admin-input text-left" value={form.support_whatsapp || ''} onChange={(e) => set('support_whatsapp', e.target.value)} /></AdminField><AdminField label="رقم الاتصال"><input dir="ltr" className="admin-input text-left" value={form.support_phone || ''} onChange={(e) => set('support_phone', e.target.value)} /></AdminField><AdminField label="البريد"><input dir="ltr" className="admin-input text-left" value={form.support_email || ''} onChange={(e) => set('support_email', e.target.value)} /></AdminField><AdminField label="الموقع"><input dir="ltr" className="admin-input text-left" value={form.support_website || ''} onChange={(e) => set('support_website', e.target.value)} /></AdminField><AdminField label="ساعات الدعم"><input className="admin-input" value={form.support_hours_text || ''} onChange={(e) => set('support_hours_text', e.target.value)} /></AdminField><AdminField label="أيام الدعم"><input className="admin-input" value={form.support_days_text || ''} onChange={(e) => set('support_days_text', e.target.value)} /></AdminField><AdminField label="زمن الاستجابة"><input className="admin-input" value={form.support_response_time_text || ''} onChange={(e) => set('support_response_time_text', e.target.value)} /></AdminField><AdminField label="سبب التعديل"><textarea className="admin-input min-h-20" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="سبب واضح للتغيير" /></AdminField><button onClick={() => void save()} disabled={saving || reason.trim().length < 5} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-slate-950 text-xs font-bold text-white disabled:opacity-40">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}حفظ معلومات الدعم</button></div></section>;
}

function AdminField({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block text-[10px] font-bold text-slate-600"><span className="mb-1.5 block">{label}</span>{children}</label>;
}

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, ArrowLeft, CalendarDays, CheckCircle2, Clock3, Eye, FileText, Hash, Inbox, Landmark, Loader2, RefreshCw, ShieldCheck, UserRound, UserRoundCheck, WalletCards } from 'lucide-react';
import { getPaymentInbox, getPaymentInboxContexts, getPaymentInboxProAccess, type PaymentInboxContext, type PaymentInboxItem, type PaymentInboxView } from '../../lib/paymentInboxApi';
import { toLatinDigits } from '../../lib/digits';
import ProUpgradeModal from '../ProUpgradeModal';
import PaymentInboxPreview from './PaymentInboxPreview';

type InboxIntent = 'claim' | 'claim_verify' | 'complete' | 'open_original';

const LOGOS = [
  { names: ['العمقي'], paths: ['/assets/financial-entities/alamqi-mobile.png', '/assets/financial-entities/alamqi-mobile.webp'] },
  { names: ['البسيري'], paths: ['/assets/financial-entities/albasiri-mobile.png', '/assets/financial-entities/albasiri-mobile.webp'] },
  { names: ['بي كاش', 'بيكاش'], paths: ['/assets/financial-entities/bcash.png', '/assets/financial-entities/bcash.webp'] },
  { names: ['الكريمي حاسب', 'حاسب'], paths: ['/assets/financial-entities/alkuraimi-hasib.png', '/assets/financial-entities/alkuraimi-hasib.webp'] },
  { names: ['الكريمي سعودي'], paths: ['/assets/financial-entities/alkuraimi-saudi.png', '/assets/financial-entities/alkuraimi-saudi.webp'] },
  { names: ['الكريمي يمني'], paths: ['/assets/financial-entities/alkuraimi-yemeni.png', '/assets/financial-entities/alkuraimi-yemeni.webp'] },
  { names: ['بن دول صرافة'], paths: ['/assets/financial-entities/bindawol-exchange.png', '/assets/financial-entities/bindawol-exchange.webp'] },
  { names: ['بن دول باي'], paths: ['/assets/financial-entities/bindawol-pay.png', '/assets/financial-entities/bindawol-pay.webp'] },
  { names: ['القطيبي'], paths: ['/assets/financial-entities/alqutaibi.png', '/assets/financial-entities/alqutaibi.webp'] }
];

const CASHIER_TABS: Array<{ value: PaymentInboxView; label: string }> = [
  { value: 'new', label: 'جديدة' },
  { value: 'mine', label: 'لدي' },
  { value: 'completed', label: 'مكتملة' }
];
const ADMIN_TABS: Array<{ value: PaymentInboxView; label: string }> = [
  { value: 'team_active', label: 'لدى الفريق' },
  { value: 'review', label: 'تحتاج مراجعة' },
  { value: 'completed', label: 'مكتملة' },
  { value: 'all', label: 'كل العمليات' }
];

function formatAmount(value?: number | null) {
  if (value == null || Number.isNaN(Number(value))) return '—';
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(Number(value));
}

function formatTime(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return toLatinDigits(new Intl.DateTimeFormat('ar-YE', { hour: '2-digit', minute: '2-digit' }).format(date));
}

function formatDate(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return toLatinDigits(new Intl.DateTimeFormat('ar-YE', { year: 'numeric', month: 'short', day: 'numeric' }).format(date));
}

function currencyName(currency?: string | null) {
  if (currency === 'SAR') return 'ريال سعودي';
  if (currency === 'USD') return 'دولار أمريكي';
  if (currency === 'YER') return 'ريال يمني';
  return currency || 'عملة غير محددة';
}

function currencyClass(currency?: string | null) {
  if (currency === 'SAR') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (currency === 'USD') return 'border-sky-200 bg-sky-50 text-sky-700';
  return 'border-amber-200 bg-amber-50 text-amber-700';
}

function EntityLogo({ entity }: { entity: string }) {
  const candidates = LOGOS.find(entry => entry.names.some(name => entity.includes(name)))?.paths || [];
  const [index, setIndex] = useState(0);
  if (!candidates[index]) return <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-slate-500"><Landmark className="h-5 w-5" /></span>;
  return <img src={candidates[index]} alt={`شعار ${entity}`} className="h-11 w-11 rounded-2xl object-contain" onError={() => setIndex(value => value + 1)} />;
}

function DataCell({ icon, label, value, ltr = false }: { icon: React.ReactNode; label: string; value?: string | null; ltr?: boolean }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-3">
      <div className="flex items-center gap-1.5 text-[9px] font-bold text-slate-400">{icon}<span>{label}</span></div>
      <p dir={ltr ? 'ltr' : 'rtl'} className={`mt-1.5 truncate text-[11px] font-black text-slate-800 ${ltr ? 'text-left font-mono' : ''}`}>{value || '—'}</p>
    </div>
  );
}

function buildInboxUrl(admin: boolean, businessId: string) {
  const params = new URLSearchParams({ view: admin ? 'payment-inbox-admin' : 'payment-inbox' });
  if (businessId) params.set('business_id', businessId);
  return `/business/manage/operations?${params.toString()}`;
}

function buildOperationUrl(item: PaymentInboxItem, action?: InboxIntent) {
  const params = new URLSearchParams({ src: 'app' });
  if (action) {
    params.set('inbox_action', action);
    params.set('inbox_id', item.id);
    params.set('row_version', String(item.row_version));
    params.set('business_id', item.business_id);
  }
  return `/v/${item.public_token}?${params.toString()}`;
}

export default function PaymentInbox({ admin = false }: { admin?: boolean }) {
  const [contexts, setContexts] = useState<PaymentInboxContext[]>([]);
  const [businessId, setBusinessId] = useState('');
  const [view, setView] = useState<PaymentInboxView>(admin ? 'team_active' : 'new');
  const [items, setItems] = useState<PaymentInboxItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [proUser, setProUser] = useState<unknown | null>(null);
  const [isPro, setIsPro] = useState(false);
  const [showProModal, setShowProModal] = useState(false);
  const [accessChecking, setAccessChecking] = useState(false);

  const activeContext = useMemo(() => contexts.find(item => item.business_id === businessId) || null, [businessId, contexts]);

  const loadContexts = useCallback(async () => {
    const next = await getPaymentInboxContexts();
    setContexts(next);
    const requested = new URL(window.location.href).searchParams.get('business_id');
    setBusinessId((next.find(item => item.business_id === requested) || next[0])?.business_id || '');
  }, []);

  const loadProAccess = useCallback(async () => {
    const access = await getPaymentInboxProAccess();
    setProUser(access.user);
    setIsPro(access.isPro);
    return access.isPro;
  }, []);

  const loadItems = useCallback(async () => {
    if (!businessId) return;
    setLoading(true);
    setError(null);
    try { setItems(await getPaymentInbox(businessId, view)); }
    catch (cause) { setItems([]); setError(cause instanceof Error ? cause.message : 'تعذر تحميل وارد المدفوعات.'); }
    finally { setLoading(false); }
  }, [businessId, view]);

  useEffect(() => {
    setLoading(true);
    void Promise.all([loadContexts(), loadProAccess()]).catch(cause => {
      setError(cause instanceof Error ? cause.message : 'تعذر تجهيز وارد المدفوعات.');
      setLoading(false);
    });
  }, [loadContexts, loadProAccess]);
  useEffect(() => { void loadItems(); }, [loadItems]);

  const openProtected = async (item: PaymentInboxItem, action?: InboxIntent) => {
    setAccessChecking(true);
    setError(null);
    try {
      const allowed = isPro || await loadProAccess();
      if (!allowed) { setShowProModal(true); return; }
      window.location.assign(buildOperationUrl(item, action));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذر التحقق من اشتراك سند Pro.');
    } finally { setAccessChecking(false); }
  };

  const tabs = admin ? ADMIN_TABS : CASHIER_TABS;
  return (
    <section className="space-y-4 font-arabic" dir="rtl">
      <header className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div><h1 className="text-lg font-black text-slate-950">{admin ? 'إدارة وارد المدفوعات' : 'وارد المدفوعات'}</h1><p className="mt-1 text-[10px] leading-5 text-slate-500">{admin ? 'متابعة عمليات الفريق والحالات التي تحتاج قرارًا إشرافيًا.' : 'استلام أحدث العمليات المرتبطة بالنشاط والتحقق منها.'}</p></div>
          <button type="button" onClick={() => void loadItems()} className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-slate-700" aria-label="تحديث وارد المدفوعات"><RefreshCw className="h-4 w-4" /></button>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
          <select value={businessId} onChange={event => setBusinessId(event.target.value)} className="h-11 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 text-xs font-bold text-slate-900 outline-none">{contexts.map(item => <option key={item.business_id} value={item.business_id}>{item.business_name}</option>)}</select>
          {!admin && activeContext?.is_supervisor && <a href={buildInboxUrl(true, businessId)} className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 text-xs font-black text-white"><ShieldCheck className="h-4 w-4" /> إدارة وارد المدفوعات</a>}
        </div>
        <div className={`mt-3 grid gap-2 ${admin ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-3'}`}>{tabs.map(tab => <button key={tab.value} type="button" onClick={() => setView(tab.value)} className={`h-10 rounded-2xl px-3 text-xs font-black ${view === tab.value ? 'bg-slate-950 text-white' : 'border border-slate-200 bg-slate-50 text-slate-600'}`}>{tab.label}</button>)}</div>
      </header>

      {error && <div className="flex items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700"><AlertCircle className="mt-0.5 h-4 w-4" /><span>{error}</span></div>}
      {loading ? <div className="flex min-h-40 items-center justify-center rounded-3xl border border-slate-200 bg-white"><Loader2 className="h-6 w-6 animate-spin text-slate-500" /></div> : items.length === 0 ? <div className="rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm"><Inbox className="mx-auto h-8 w-8 text-slate-300" /><h2 className="mt-3 text-sm font-black text-slate-800">{view === 'completed' ? 'لا توجد عمليات مكتملة' : 'لا توجد عمليات في هذا القسم'}</h2><p className="mt-1 text-[10px] text-slate-400">{view === 'completed' ? 'ستظهر هنا العمليات التي أكملتها واعتمدتها لهذا النشاط.' : 'ستظهر العمليات تلقائيًا عند وصولها أو تغير حالتها.'}</p></div> : (
        <div className="space-y-5">{items.map(item => {
          const entity = item.financial_entity || 'جهة مالية أخرى';
          const accountName = item.account_holder_name || item.receiver_name || item.business_name || 'حساب غير محدد';
          const accountNumber = item.merchant_point || item.receiver_account;
          const operationDate = item.transaction_datetime || item.created_at;
          const canClaim = item.action_permissions?.can_claim === true;
          const canComplete = item.action_permissions?.can_complete === true;
          return <article key={item.id} className="overflow-hidden rounded-[2rem] border border-slate-200/80 bg-white p-3 shadow-[0_18px_50px_-28px_rgba(15,23,42,0.35)]">
            <PaymentInboxPreview publicToken={item.public_token} entity={entity} />
            <div className="px-1 pb-1 pt-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0"><div className="flex items-center gap-2"><EntityLogo entity={entity} /><div className="min-w-0"><h2 className="truncate text-base font-black text-slate-950">{entity}</h2><p className="truncate text-[11px] font-bold text-slate-500">{accountName}</p></div></div></div>
                <div className="shrink-0 text-left" dir="ltr"><div className="flex items-end gap-2"><span className={`mb-1 rounded-full border px-2.5 py-1 text-[10px] font-black ${currencyClass(item.currency)}`}>{item.currency || '—'}</span><strong className="text-4xl font-black tracking-tight text-slate-950">{formatAmount(item.amount)}</strong></div><p className="mt-1 text-[10px] font-bold text-slate-400">{currencyName(item.currency)}</p></div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2">
                <DataCell icon={<CalendarDays className="h-3.5 w-3.5" />} label="التاريخ" value={formatDate(operationDate)} />
                <DataCell icon={<Clock3 className="h-3.5 w-3.5" />} label="الوقت" value={formatTime(operationDate)} />
                <DataCell icon={<WalletCards className="h-3.5 w-3.5" />} label="رقم الحساب" value={accountNumber ? toLatinDigits(accountNumber) : '—'} ltr />
                <DataCell icon={<Hash className="h-3.5 w-3.5" />} label="المرجع" value={item.reference_number ? toLatinDigits(item.reference_number) : '—'} ltr />
                <div className="col-span-2"><DataCell icon={<UserRound className="h-3.5 w-3.5" />} label="اسم الحساب" value={accountName} /></div>
              </div>

              {admin && item.claimed_by_name && <div className="mt-3 flex items-center gap-2 rounded-2xl bg-indigo-50 px-3 py-2 text-[10px] text-indigo-700"><UserRoundCheck className="h-4 w-4" /><span>المسؤول الحالي: <b>{item.claimed_by_name}</b></span></div>}

              <div className="mt-4 grid grid-cols-2 gap-2">
                <button type="button" disabled={accessChecking} onClick={() => void openProtected(item)} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 text-[11px] font-black text-slate-800 shadow-sm disabled:opacity-60"><Eye className="h-4 w-4" /> فتح السجل</button>
                <button type="button" disabled={accessChecking} onClick={() => void openProtected(item, 'open_original')} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-violet-200 bg-violet-50 px-3 text-[11px] font-black text-violet-700 disabled:opacity-60"><FileText className="h-4 w-4" /> الملف الأصلي</button>
                {canClaim && <button type="button" disabled={accessChecking} onClick={() => void openProtected(item, 'claim')} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-sky-600 px-3 text-[11px] font-black text-white shadow-lg shadow-sky-200 disabled:opacity-60"><Inbox className="h-4 w-4" /> استلام العملية</button>}
                {canClaim && <button type="button" disabled={accessChecking} onClick={() => void openProtected(item, 'claim_verify')} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-indigo-600 px-3 text-[11px] font-black text-white shadow-lg shadow-indigo-200 disabled:opacity-60"><ShieldCheck className="h-4 w-4" /> استلام وتحقق</button>}
                {canComplete && <button type="button" disabled={accessChecking} onClick={() => void openProtected(item, 'complete')} className="col-span-2 inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-3 text-[11px] font-black text-white shadow-lg shadow-emerald-200 disabled:opacity-60"><CheckCircle2 className="h-4 w-4" /> إكمال العملية</button>}
              </div>
            </div>
          </article>;
        })}</div>
      )}
      {admin && <a href={buildInboxUrl(false, businessId)} className="inline-flex items-center gap-2 text-xs font-bold text-slate-500"><ArrowLeft className="h-4 w-4" /> العودة إلى وارد الموظف</a>}
      {showProModal && proUser && <ProUpgradeModal user={proUser as any} onClose={() => setShowProModal(false)} onSuccess={() => { setShowProModal(false); void loadProAccess(); }} />}
    </section>
  );
}

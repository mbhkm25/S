import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Clock3,
  Eye,
  FileText,
  Inbox,
  Loader2,
  RefreshCw,
  ShieldCheck,
  UserRoundCheck
} from 'lucide-react';
import {
  getPaymentInbox,
  getPaymentInboxContexts,
  getPaymentInboxProAccess,
  type PaymentInboxContext,
  type PaymentInboxItem,
  type PaymentInboxView
} from '../../lib/paymentInboxApi';
import { toLatinDigits } from '../../lib/digits';
import ProUpgradeModal from '../ProUpgradeModal';

interface PaymentInboxProps {
  admin?: boolean;
  onNavigate: (page: string, token?: string) => void;
}

type InboxIntent = 'claim' | 'claim_verify' | 'complete' | 'open_original';

const LOGOS: Array<{ names: string[]; paths: string[] }> = [
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
  { value: 'mine', label: 'لدي' }
];

const ADMIN_TABS: Array<{ value: PaymentInboxView; label: string }> = [
  { value: 'team_active', label: 'لدى الفريق' },
  { value: 'review', label: 'تحتاج مراجعة' },
  { value: 'completed', label: 'مكتملة' },
  { value: 'all', label: 'كل العمليات' }
];

function formatAmount(value?: number | null): string {
  if (value == null || Number.isNaN(Number(value))) return '—';
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(Number(value));
}

function formatTime(value?: string | null): string {
  if (!value) return 'حديثًا';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'حديثًا';
  return toLatinDigits(new Intl.DateTimeFormat('ar-YE', { hour: '2-digit', minute: '2-digit' }).format(date));
}

function currencyClass(currency?: string | null): string {
  if (currency === 'SAR') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (currency === 'USD') return 'border-blue-200 bg-blue-50 text-blue-700';
  return 'border-amber-200 bg-amber-50 text-amber-700';
}

function EntityLogo({ entity }: { entity: string }) {
  const candidates = LOGOS.find(entry => entry.names.some(name => entity.includes(name)))?.paths || [];
  const [index, setIndex] = useState(0);
  if (!candidates[index]) return <span className="text-[11px] font-black text-slate-400">{entity.slice(0, 2)}</span>;
  return <img src={candidates[index]} alt={`شعار ${entity}`} className="max-h-11 max-w-[72px] object-contain" onError={() => setIndex(value => value + 1)} />;
}

function buildInboxUrl(admin: boolean, businessId: string): string {
  const params = new URLSearchParams({ view: admin ? 'payment-inbox-admin' : 'payment-inbox' });
  if (businessId) params.set('business_id', businessId);
  return `/business/manage/operations?${params.toString()}`;
}

function buildOperationUrl(item: PaymentInboxItem, action?: InboxIntent): string {
  const params = new URLSearchParams({ src: 'app' });
  if (action) {
    params.set('inbox_action', action);
    params.set('inbox_id', item.id);
    params.set('row_version', String(item.row_version));
    params.set('business_id', item.business_id);
  }
  return `/v/${item.public_token}?${params.toString()}`;
}

export default function PaymentInbox({ admin = false }: PaymentInboxProps) {
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
    try {
      setItems(await getPaymentInbox(businessId, view));
    } catch (cause) {
      setItems([]);
      setError(cause instanceof Error ? cause.message : 'تعذر تحميل وارد المدفوعات.');
    } finally {
      setLoading(false);
    }
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
      if (!allowed) {
        setShowProModal(true);
        return;
      }
      window.location.assign(buildOperationUrl(item, action));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذر التحقق من اشتراك سند Pro.');
    } finally {
      setAccessChecking(false);
    }
  };

  const tabs = admin ? ADMIN_TABS : CASHIER_TABS;

  return (
    <section className="space-y-4 font-arabic" dir="rtl">
      <header className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-lg font-black text-slate-950">{admin ? 'إدارة وارد المدفوعات' : 'وارد المدفوعات'}</h1>
            <p className="mt-1 text-[10px] leading-5 text-slate-500">{admin ? 'متابعة عمليات الفريق والحالات التي تحتاج قرارًا إشرافيًا.' : 'استلام أحدث العمليات المرتبطة بالنشاط والتحقق منها.'}</p>
          </div>
          <button type="button" onClick={() => void loadItems()} className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-slate-700" aria-label="تحديث وارد المدفوعات">
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
          <select value={businessId} onChange={event => setBusinessId(event.target.value)} className="h-11 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 text-xs font-bold text-slate-900 outline-none" aria-label="اختيار النشاط التجاري">
            {contexts.map(item => <option key={item.business_id} value={item.business_id}>{item.business_name}</option>)}
          </select>
          {!admin && activeContext?.is_supervisor && (
            <a href={buildInboxUrl(true, businessId)} className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 text-xs font-black text-white">
              <ShieldCheck className="h-4 w-4" /> إدارة وارد المدفوعات
            </a>
          )}
        </div>

        <div className={`mt-3 grid gap-2 ${admin ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-2'}`}>
          {tabs.map(tab => (
            <button key={tab.value} type="button" onClick={() => setView(tab.value)} className={`h-10 rounded-2xl px-3 text-xs font-black transition ${view === tab.value ? 'bg-slate-950 text-white' : 'border border-slate-200 bg-slate-50 text-slate-600'}`}>
              {tab.label}
            </button>
          ))}
        </div>
      </header>

      {error && <div className="flex items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><span>{error}</span></div>}

      {loading ? (
        <div className="flex min-h-40 items-center justify-center rounded-3xl border border-slate-200 bg-white"><Loader2 className="h-6 w-6 animate-spin text-slate-500" /></div>
      ) : items.length === 0 ? (
        <div className="rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm"><Inbox className="mx-auto h-8 w-8 text-slate-300" /><h2 className="mt-3 text-sm font-black text-slate-800">لا توجد عمليات في هذا القسم</h2><p className="mt-1 text-[10px] text-slate-400">ستظهر العمليات تلقائيًا عند وصولها أو تغير حالتها.</p></div>
      ) : (
        <div className="space-y-3">
          {items.map(item => {
            const entity = item.financial_entity || 'جهة مالية';
            const identity = item.account_holder_name || item.receiver_name || item.business_name || 'عملية مالية واردة';
            const point = item.merchant_point || item.receiver_account;
            const canClaim = item.action_permissions?.can_claim === true;
            const canComplete = item.action_permissions?.can_complete === true;

            return (
              <article key={item.id} className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
                <div className="grid gap-4 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-12 w-20 shrink-0 items-center justify-start"><EntityLogo entity={entity} /></div>
                    <div className="min-w-0">
                      <h3 className="truncate text-sm font-black text-slate-900">{entity}</h3>
                      <p className="mt-1 truncate text-xs font-medium text-slate-500">{identity}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12px] leading-5 text-slate-500">
                        <span className="inline-flex items-center gap-1.5"><Clock3 className="h-3.5 w-3.5" />{formatTime(item.created_at || item.transaction_datetime)}</span>
                        {point && <span>الحساب/النقطة: <b dir="ltr" className="inline-block font-mono text-slate-700">{toLatinDigits(point)}</b></span>}
                        {item.reference_number && <span>المرجع: <b dir="ltr" className="inline-block font-mono text-slate-700">{toLatinDigits(item.reference_number)}</b></span>}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-baseline justify-end gap-2 sm:min-w-[150px]">
                    <strong className="text-4xl font-black tracking-tight text-slate-950">{formatAmount(item.amount)}</strong>
                    <span className={`rounded-full border px-2 py-1 text-[10px] font-black ${currencyClass(item.currency)}`}>{item.currency || '—'}</span>
                  </div>
                </div>

                {admin && item.claimed_by_name && (
                  <div className="mx-4 mb-3 flex items-center gap-2 rounded-2xl bg-slate-50 px-3 py-2 text-[10px] text-slate-600"><UserRoundCheck className="h-4 w-4 text-slate-400" /><span>المسؤول الحالي: <b>{item.claimed_by_name}</b></span></div>
                )}

                <div className="grid grid-cols-2 gap-2 border-t border-slate-100 bg-slate-50/70 p-3 sm:grid-cols-4">
                  <button type="button" disabled={accessChecking} onClick={() => void openProtected(item)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 text-[11px] font-black text-slate-700 disabled:opacity-60">
                    <Eye className="h-4 w-4" /> فتح السجل
                  </button>

                  {canClaim && (
                    <>
                      <button type="button" disabled={accessChecking} onClick={() => void openProtected(item, 'claim')} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-3 text-[11px] font-black text-white disabled:opacity-60">
                        <Inbox className="h-4 w-4" /> استلام العملية
                      </button>
                      <button type="button" disabled={accessChecking} onClick={() => void openProtected(item, 'claim_verify')} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-blue-600 px-3 text-[11px] font-black text-white disabled:opacity-60">
                        <CheckCircle2 className="h-4 w-4" /> استلام وتحقق
                      </button>
                    </>
                  )}

                  {canComplete && (
                    <button type="button" disabled={accessChecking} onClick={() => void openProtected(item, 'complete')} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-3 text-[11px] font-black text-white disabled:opacity-60">
                      <CheckCircle2 className="h-4 w-4" /> إكمال العملية
                    </button>
                  )}

                  <button type="button" disabled={accessChecking} onClick={() => void openProtected(item, 'open_original')} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-violet-200 bg-violet-50 px-3 text-[11px] font-black text-violet-700 disabled:opacity-60">
                    <FileText className="h-4 w-4" /> فتح الملف الأصلي
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {admin && <a href={buildInboxUrl(false, businessId)} className="inline-flex items-center gap-2 text-xs font-bold text-slate-500"><ArrowLeft className="h-4 w-4" /> العودة إلى وارد الموظف</a>}

      {showProModal && proUser && (
        <ProUpgradeModal
          user={proUser as any}
          onClose={() => setShowProModal(false)}
          onSuccess={() => {
            setShowProModal(false);
            void loadProAccess();
          }}
        />
      )}
    </section>
  );
}

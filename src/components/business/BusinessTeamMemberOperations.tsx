import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  ArrowUpDown,
  BriefcaseBusiness,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock3,
  FileSearch,
  History,
  Link2,
  Loader2,
  Phone,
  RefreshCw,
  Search,
  ShieldAlert,
  TimerReset,
  Undo2,
  UserRound,
  X
} from 'lucide-react';
import {
  getBusinessTeamMemberOperationsV2,
  type TeamMemberOperationItem,
  type TeamMemberOperationsResultV2,
  type TeamOperationActivityType,
  type TeamOperationEvent
} from '../../lib/businessTeamOperationsApi';
import { toLatinDigits } from '../../lib/digits';

interface Props {
  businessId: string;
  memberUserId: string;
  memberName: string;
  onClose: () => void;
  onOpenOperation: (token: string) => void;
}

type SortMode = 'recent' | 'amount';

const FILTERS: Array<[TeamOperationActivityType, string]> = [
  ['all', 'الكل'],
  ['in_progress', 'قيد التنفيذ'],
  ['completed', 'مكتملة'],
  ['review_required', 'للمراجعة'],
  ['released', 'محررة'],
  ['linked', 'مرتبطة']
];

const STATUS_LABELS: Record<string, string> = {
  new: 'جديدة',
  claimed: 'قيد التنفيذ',
  completed: 'مكتملة',
  released: 'متاحة مجددًا',
  review_required: 'تحتاج مراجعة',
  rejected: 'مرفوضة',
  cancelled: 'ملغاة',
  verified: 'متحقق منها',
  ready: 'جاهزة'
};

const EVENT_LABELS: Record<string, string> = {
  enqueued: 'وصلت إلى وارد المدفوعات',
  claimed: 'استلم العملية',
  claim_renewed: 'مدد مدة الاستلام',
  claim_conflict: 'محاولة استلام متزامنة',
  stale_action_rejected: 'رُفض إجراء من نسخة قديمة',
  released: 'حرر العملية',
  reassigned: 'أعيد تعيين العملية',
  review_requested: 'أحال العملية للمراجعة',
  review_resolved: 'أعيدت العملية للمعالجة',
  completed: 'أكمل العملية',
  rejected: 'رفض المطابقة',
  expired_claim_released: 'انتهت مهلة الاستلام'
};

const SOURCE_LABELS: Record<string, string> = {
  payment_inbox: 'وارد المدفوعات',
  qr_details: 'مسح QR',
  direct_link: 'الرابط المباشر',
  operation_details: 'صفحة العملية',
  business_link_after_verification: 'الربط بعد التحقق',
  notification: 'الإشعار',
  admin: 'إجراء إداري',
  system: 'النظام'
};

function formatDate(value?: string | null) {
  if (!value) return 'غير متوفر';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'غير متوفر';
  return toLatinDigits(new Intl.DateTimeFormat('ar-YE-u-nu-latn', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Aden',
    numberingSystem: 'latn'
  }).format(date));
}

function formatNumber(value: number | null | undefined) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(Number(value || 0));
}

function formatDuration(seconds?: number | null) {
  if (!seconds || seconds < 1) return 'غير متوفر';
  if (seconds < 60) return `${formatNumber(seconds)} ثانية`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${formatNumber(minutes)} دقيقة`;
  return `${formatNumber(Math.round(minutes / 60))} ساعة`;
}

function statusTone(status: string) {
  if (status === 'completed') return 'border-emerald-100 bg-emerald-50 text-emerald-700';
  if (status === 'claimed') return 'border-blue-100 bg-blue-50 text-blue-700';
  if (status === 'review_required') return 'border-amber-100 bg-amber-50 text-amber-800';
  if (status === 'rejected' || status === 'cancelled') return 'border-rose-100 bg-rose-50 text-rose-700';
  return 'border-slate-200 bg-slate-100 text-slate-700';
}

function contributionLabels(item: TeamMemberOperationItem) {
  const labels: string[] = [];
  if (item.contribution.claimed) labels.push('استلمها');
  if (item.contribution.completed) labels.push('أكملها');
  if (item.contribution.requested_review) labels.push('أحالها للمراجعة');
  if (item.contribution.released) labels.push('حررها');
  if (item.contribution.linked) labels.push('ربطها بالنشاط');
  if (item.contribution.verified) labels.push('تحقق منها');
  return labels;
}

function eventDescription(event: TeamOperationEvent) {
  const label = EVENT_LABELS[event.event_type] || event.event_type;
  const source = typeof event.metadata?.source === 'string' ? SOURCE_LABELS[event.metadata.source] || event.metadata.source : null;
  if (event.assigned_to_member) return `${label} إلى هذا العضو`;
  if (source) return `${label} عبر ${source}`;
  return label;
}

export default function BusinessTeamMemberOperations({ businessId, memberUserId, memberName, onClose, onOpenOperation }: Props) {
  const [activityType, setActivityType] = useState<TeamOperationActivityType>('all');
  const [sortMode, setSortMode] = useState<SortMode>('recent');
  const [query, setQuery] = useState('');
  const [data, setData] = useState<TeamMemberOperationsResultV2 | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedOperationId, setExpandedOperationId] = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      setData(await getBusinessTeamMemberOperationsV2(businessId, memberUserId, activityType));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'تعذر تحميل السجل التشغيلي للعضو.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activityType, businessId, memberUserId]);

  useEffect(() => { void load(); }, [load]);

  const visibleItems = useMemo(() => {
    const normalizedQuery = toLatinDigits(query).trim().toLowerCase();
    const items = (data?.items || []).filter((item) => {
      if (!normalizedQuery) return true;
      const operation = item.operation;
      return [operation.summary, operation.financial_entity, operation.reference_number, operation.currency, String(operation.amount || ''), item.current_assignee?.name, item.completed_by?.name]
        .some((value) => String(value || '').toLowerCase().includes(normalizedQuery));
    });
    return [...items].sort((left, right) => sortMode === 'amount'
      ? Number(right.operation.amount || 0) - Number(left.operation.amount || 0)
      : new Date(right.latest_member_activity_at).getTime() - new Date(left.latest_member_activity_at).getTime());
  }, [data?.items, query, sortMode]);

  const member = data?.member;
  const summary = data?.summary;
  const memberDisplayName = member?.full_name || memberName;

  return (
    <div className="fixed inset-0 z-[130] overflow-y-auto bg-slate-50 font-arabic text-right" dir="rtl">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur-xl">
        <div className="mx-auto flex max-w-4xl items-center gap-3 px-4 py-3">
          <button type="button" onClick={onClose} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700 shadow-sm" aria-label="إغلاق"><X className="h-5 w-5" /></button>
          <div className="min-w-0 flex-1"><p className="text-[11px] font-bold text-emerald-700">السجل التشغيلي لعضو الفريق</p><h2 className="truncate text-base font-bold text-slate-950">{memberDisplayName}</h2></div>
          <button type="button" onClick={() => void load(true)} disabled={refreshing} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-700 disabled:opacity-50" aria-label="تحديث السجل"><RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} /></button>
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-4 p-4 pb-[calc(28px+env(safe-area-inset-bottom))]">
        <section className="overflow-hidden rounded-[1.8rem] bg-slate-950 p-4 text-white shadow-sm">
          <div className="flex items-start gap-3">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-emerald-300"><UserRound className="h-6 w-6" /></span>
            <div className="min-w-0 flex-1"><h3 className="truncate text-sm font-bold">{memberDisplayName}</h3><div className="mt-2 flex flex-wrap gap-x-3 gap-y-2 text-[11px] text-slate-300"><span className="flex items-center gap-1"><BriefcaseBusiness className="h-3.5 w-3.5" />{member?.job_title || 'عضو فريق العمل'}</span>{member?.phone && <span dir="ltr" className="flex items-center gap-1"><Phone className="h-3.5 w-3.5" />{toLatinDigits(member.phone)}</span>}</div></div>
            <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${member?.status === 'active' ? 'bg-emerald-400/15 text-emerald-300' : 'bg-amber-400/15 text-amber-200'}`}>{member?.status === 'active' ? 'عضو نشط' : 'غير نشط'}</span>
          </div>
          <p className="mt-4 border-t border-white/10 pt-3 text-[11px] leading-6 text-slate-300">يجمع هذا السجل ما فعله العضو تاريخيًا مع الحالة الحالية لكل عملية، سواء نُفذت من وارد المدفوعات أو عبر QR أو الرابط المباشر.</p>
        </section>

        <section className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {[
            ['استلم', summary?.claimed_count, Activity, 'bg-blue-50 text-blue-800 border-blue-100'],
            ['أكمل', summary?.completed_count, CheckCircle2, 'bg-emerald-50 text-emerald-800 border-emerald-100'],
            ['قيد التنفيذ', summary?.in_progress_count, Clock3, 'bg-sky-50 text-sky-800 border-sky-100'],
            ['للمراجعة', summary?.review_requested_count, ShieldAlert, 'bg-amber-50 text-amber-800 border-amber-100'],
            ['حرر', summary?.released_count, Undo2, 'bg-violet-50 text-violet-800 border-violet-100'],
            ['متوسط الإكمال', formatDuration(summary?.average_completion_seconds), TimerReset, 'bg-slate-100 text-slate-800 border-slate-200']
          ].map(([label, value, Icon, tone]) => (
            <article key={String(label)} className={`rounded-[1.45rem] border p-3.5 ${tone}`}><div className="flex items-center justify-between gap-2"><Icon className="h-5 w-5" /><strong className="text-lg text-slate-950">{typeof value === 'string' ? value : formatNumber(value as number | null | undefined)}</strong></div><p className="mt-2 text-[10px] font-bold">{String(label)}</p></article>
          ))}
        </section>

        <section className="space-y-3 rounded-[1.6rem] border border-slate-200 bg-white p-3 shadow-sm">
          <div className="grid grid-cols-3 gap-1 rounded-2xl bg-slate-100 p-1 sm:grid-cols-6">{FILTERS.map(([value, label]) => <button type="button" key={value} onClick={() => setActivityType(value)} className={`min-h-11 rounded-xl px-2 text-[10px] font-bold transition ${activityType === value ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500'}`}>{label}</button>)}</div>
          <div className="flex gap-2">
            <label className="flex min-h-11 flex-1 items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3"><Search className="h-4 w-4 shrink-0 text-slate-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} className="min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-slate-400" placeholder="ابحث بالمرجع أو الجهة أو المبلغ" />{query && <button type="button" onClick={() => setQuery('')} className="text-slate-400"><X className="h-4 w-4" /></button>}</label>
            <button type="button" onClick={() => setSortMode((current) => current === 'recent' ? 'amount' : 'recent')} className="flex h-11 shrink-0 items-center gap-1.5 rounded-2xl border border-slate-200 bg-white px-3 text-[10px] font-bold text-slate-700"><ArrowUpDown className="h-4 w-4" />{sortMode === 'recent' ? 'الأحدث' : 'المبلغ'}</button>
          </div>
        </section>

        {loading ? <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-slate-500" /></div> : error ? (
          <div className="rounded-[1.6rem] border border-rose-100 bg-rose-50 p-4 text-xs text-rose-700"><p>{error}</p><button type="button" onClick={() => void load()} className="mt-3 min-h-10 rounded-xl bg-rose-600 px-4 text-[10px] font-bold text-white">إعادة المحاولة</button></div>
        ) : !visibleItems.length ? (
          <div className="rounded-[1.8rem] border border-slate-200 bg-white py-14 text-center"><FileSearch className="mx-auto h-9 w-9 text-slate-300" /><p className="mt-3 text-xs font-bold text-slate-700">لا توجد نتائج مطابقة</p><p className="mt-1 text-[10px] text-slate-400">غيّر التصنيف أو امسح عبارة البحث.</p></div>
        ) : (
          <section className="space-y-3">
            <div className="flex items-center justify-between px-1"><h3 className="text-xs font-bold text-slate-900">العمليات</h3><span className="text-[10px] text-slate-500">{formatNumber(visibleItems.length)} نتيجة</span></div>
            {visibleItems.map((item) => {
              const operation = item.operation;
              const contributions = contributionLabels(item);
              const expanded = expandedOperationId === item.operation_id;
              return (
                <article key={item.operation_id} className="overflow-hidden rounded-[1.7rem] border border-slate-200 bg-white shadow-sm">
                  <button type="button" onClick={() => onOpenOperation(operation.public_token)} className="block w-full p-4 text-right transition active:bg-slate-50">
                    <div className="flex items-start justify-between gap-3"><div className="min-w-0 flex-1"><span className={`inline-flex rounded-full border px-2.5 py-1 text-[9px] font-bold ${statusTone(item.current_status)}`}>{STATUS_LABELS[item.current_status] || item.current_status}</span><h4 className="mt-3 line-clamp-2 text-sm font-bold leading-6 text-slate-950">{operation.summary || operation.financial_entity || 'إشعار مالي'}</h4></div><div className="shrink-0 text-left"><strong dir="ltr" className="block text-base text-emerald-700">{formatNumber(operation.amount)} {operation.currency || ''}</strong><span className="mt-1 block text-[9px] text-slate-400">{formatDate(item.latest_member_activity_at)}</span></div></div>
                    <div className="mt-3 rounded-2xl bg-slate-50 p-3"><p className="text-[10px] text-slate-500">مساهمة {memberDisplayName}</p><p className="mt-1 text-xs font-bold leading-6 text-slate-900">{contributions.length ? contributions.join(' · ') : 'ظهر ضمن السجل التشغيلي'}</p><p className="mt-2 text-[10px] leading-5 text-slate-500">الحالة الحالية: {STATUS_LABELS[item.current_status] || item.current_status}{item.current_assignee?.name ? ` بواسطة ${item.current_assignee.name}` : ''}{item.completed_by?.name ? ` · أكملها ${item.completed_by.name}` : ''}</p></div>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-[10px] text-slate-500"><span>الجهة: <strong className="text-slate-800">{operation.financial_entity || '—'}</strong></span><span>المرجع: <strong dir="ltr" className="text-slate-800">{toLatinDigits(operation.reference_number || '—')}</strong></span></div>
                  </button>
                  <div className="border-t border-slate-100 px-4 py-3">
                    <button type="button" onClick={() => setExpandedOperationId(expanded ? null : item.operation_id)} className="flex min-h-10 w-full items-center justify-between rounded-xl px-1 text-[11px] font-bold text-slate-700"><span className="flex items-center gap-2"><History className="h-4 w-4" />سجل إجراءات العضو</span>{expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</button>
                    {expanded && <div className="mt-2 space-y-2 border-t border-slate-100 pt-3">{item.member_events.length ? item.member_events.map((event, index) => <div key={`${event.event_type}-${event.created_at}-${index}`} className="flex gap-3 rounded-xl bg-slate-50 p-3"><span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-emerald-500" /><div className="min-w-0 flex-1"><p className="text-[11px] font-bold leading-5 text-slate-800">{eventDescription(event)}</p>{event.reason && <p className="mt-1 text-[10px] leading-5 text-slate-500">{event.reason}</p>}<p className="mt-1 text-[9px] text-slate-400">{formatDate(event.created_at)}{event.actor_name ? ` · ${event.actor_name}` : ''}</p></div></div>) : <p className="py-3 text-center text-[10px] text-slate-400">لا توجد أحداث تشغيلية مسجلة.</p>}</div>}
                  </div>
                </article>
              );
            })}
          </section>
        )}

        <section className="flex items-center gap-3 rounded-[1.5rem] border border-slate-200 bg-white p-4"><span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-100 text-slate-700"><Link2 className="h-5 w-5" /></span><div className="min-w-0 flex-1"><p className="text-[10px] text-slate-500">الربط والتحقق</p><strong className="mt-1 block text-xs text-slate-900">ربط {formatNumber(summary?.linked_count)} · تحقق {formatNumber(summary?.verified_count)}</strong></div><span className="text-[9px] text-slate-400">آخر نشاط {formatDate(summary?.last_activity_at)}</span></section>
      </main>
    </div>
  );
}

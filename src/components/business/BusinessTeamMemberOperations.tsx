import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowUpDown,
  BriefcaseBusiness,
  CheckCircle2,
  ChevronLeft,
  CircleDollarSign,
  Clock3,
  Copy,
  FileSearch,
  FileText,
  Link2,
  Loader2,
  Phone,
  RefreshCw,
  Search,
  SearchCheck,
  UserRound,
  X
} from 'lucide-react';
import {
  getBusinessTeamMemberOperations,
  type BusinessTeamMemberOperation,
  type BusinessTeamMemberOperationsResult
} from '../../lib/businessTeamApi';
import { toLatinDigits } from '../../lib/digits';

interface Props {
  businessId: string;
  memberUserId: string;
  memberName: string;
  onClose: () => void;
  onOpenOperation: (token: string) => void;
}

type ActivityType = 'all' | 'linked' | 'verified';
type SortMode = 'recent' | 'amount';

const activityLabels: Record<BusinessTeamMemberOperation['activity_type'], string> = {
  linked: 'ربطها بالنشاط',
  verified: 'تحقق منها',
  linked_and_verified: 'ربطها وتحقق منها'
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
  return new Intl.NumberFormat('en-US').format(Number(value || 0));
}

function activityTone(type: BusinessTeamMemberOperation['activity_type']) {
  if (type === 'verified') return 'border-emerald-100 bg-emerald-50 text-emerald-700';
  if (type === 'linked_and_verified') return 'border-indigo-100 bg-indigo-50 text-indigo-700';
  return 'border-sky-100 bg-sky-50 text-sky-700';
}

export default function BusinessTeamMemberOperations({
  businessId,
  memberUserId,
  memberName,
  onClose,
  onOpenOperation
}: Props) {
  const [activityType, setActivityType] = useState<ActivityType>('all');
  const [sortMode, setSortMode] = useState<SortMode>('recent');
  const [query, setQuery] = useState('');
  const [data, setData] = useState<BusinessTeamMemberOperationsResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedReference, setCopiedReference] = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const result = await getBusinessTeamMemberOperations(businessId, memberUserId, activityType);
      setData(result);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'تعذر تحميل سجل العمليات.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activityType, businessId, memberUserId]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void getBusinessTeamMemberOperations(businessId, memberUserId, activityType)
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((caught) => {
        if (!cancelled) setError(caught instanceof Error ? caught.message : 'تعذر تحميل سجل العمليات.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activityType, businessId, memberUserId]);

  const visibleItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const items = (data?.items || []).filter((item) => {
      if (!normalizedQuery) return true;
      const operation = item.operation;
      return [
        operation.summary,
        operation.financial_entity,
        operation.transaction_type,
        operation.reference_number,
        operation.currency,
        String(operation.amount || '')
      ].some((value) => String(value || '').toLowerCase().includes(normalizedQuery));
    });

    return [...items].sort((left, right) => {
      if (sortMode === 'amount') {
        return Number(right.operation.amount || 0) - Number(left.operation.amount || 0);
      }
      return new Date(right.linked_at).getTime() - new Date(left.linked_at).getTime();
    });
  }, [data?.items, query, sortMode]);

  const copyReference = async (reference: string) => {
    try {
      await navigator.clipboard.writeText(toLatinDigits(reference));
      setCopiedReference(reference);
      window.setTimeout(() => setCopiedReference((current) => current === reference ? null : current), 1600);
    } catch {
      setCopiedReference(null);
    }
  };

  const member = data?.member;
  const memberDisplayName = member?.full_name || memberName;

  return (
    <div className="fixed inset-0 z-[130] overflow-y-auto bg-slate-50 font-arabic text-right" dir="rtl">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur-xl">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700 shadow-sm"
            aria-label="إغلاق"
          >
            <X className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold text-emerald-700">نشاط عضو الفريق</p>
            <h2 className="truncate text-base font-bold text-slate-950">{memberDisplayName}</h2>
          </div>
          <button
            type="button"
            onClick={() => void load(true)}
            disabled={refreshing}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-700 disabled:opacity-50"
            aria-label="تحديث السجل"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-4 p-4 pb-[calc(28px+env(safe-area-inset-bottom))]">
        <section className="overflow-hidden rounded-[1.8rem] bg-slate-950 p-4 text-white shadow-sm">
          <div className="flex items-start gap-3">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-emerald-300">
              <UserRound className="h-6 w-6" />
            </span>
            <div className="min-w-0 flex-1">
              <h3 className="truncate text-sm font-bold">{memberDisplayName}</h3>
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-2 text-[10px] text-slate-300">
                <span className="flex items-center gap-1"><BriefcaseBusiness className="h-3.5 w-3.5" />{member?.job_title || 'عضو فريق العمل'}</span>
                {member?.phone && <span dir="ltr" className="flex items-center gap-1"><Phone className="h-3.5 w-3.5" />{toLatinDigits(member.phone)}</span>}
              </div>
            </div>
            <span className={`rounded-full px-2.5 py-1 text-[9px] font-bold ${member?.status === 'active' ? 'bg-emerald-400/15 text-emerald-300' : 'bg-amber-400/15 text-amber-200'}`}>
              {member?.status === 'active' ? 'عضو نشط' : 'غير نشط'}
            </span>
          </div>
          <p className="mt-4 border-t border-white/10 pt-3 text-[10px] leading-5 text-slate-300">
            يعرض السجل العمليات التي ربطها العضو بالنشاط أو نفّذ التحقق منها، مع وقت النشاط المسجل داخل سند.
          </p>
        </section>

        <section className="grid grid-cols-2 gap-3">
          <div className="rounded-[1.5rem] border border-sky-100 bg-sky-50 p-4">
            <div className="flex items-center justify-between"><Link2 className="h-5 w-5 text-sky-700" /><strong className="text-2xl text-slate-950">{formatNumber(data?.summary.linked_count)}</strong></div>
            <p className="mt-3 text-[10px] font-bold text-sky-900">عمليات ربطها بالنشاط</p>
          </div>
          <div className="rounded-[1.5rem] border border-emerald-100 bg-emerald-50 p-4">
            <div className="flex items-center justify-between"><CheckCircle2 className="h-5 w-5 text-emerald-700" /><strong className="text-2xl text-slate-950">{formatNumber(data?.summary.verified_count)}</strong></div>
            <p className="mt-3 text-[10px] font-bold text-emerald-900">عمليات تحقق منها</p>
          </div>
          <div className="col-span-2 flex items-center gap-3 rounded-[1.5rem] border border-slate-200 bg-white p-4">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-100 text-slate-700"><Clock3 className="h-5 w-5" /></span>
            <div className="min-w-0"><p className="text-[9px] text-slate-500">آخر نشاط مسجل</p><strong className="mt-1 block truncate text-xs text-slate-900">{formatDate(data?.summary.last_activity_at)}</strong></div>
          </div>
        </section>

        <section className="space-y-3 rounded-[1.6rem] border border-slate-200 bg-white p-3 shadow-sm">
          <div className="grid grid-cols-3 gap-1 rounded-2xl bg-slate-100 p-1">
            {([
              ['all', 'الكل', (data?.summary.linked_count || 0) + (data?.summary.verified_count || 0)],
              ['linked', 'الربط', data?.summary.linked_count || 0],
              ['verified', 'التحقق', data?.summary.verified_count || 0]
            ] as Array<[ActivityType, string, number]>).map(([value, label, count]) => (
              <button
                type="button"
                key={value}
                onClick={() => setActivityType(value)}
                className={`min-h-10 rounded-xl px-2 text-[10px] font-bold transition ${activityType === value ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500'}`}
              >
                {label} <span className="mr-1 text-[9px]">{formatNumber(count)}</span>
              </button>
            ))}
          </div>

          <div className="flex gap-2">
            <label className="flex min-h-11 flex-1 items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3">
              <Search className="h-4 w-4 shrink-0 text-slate-400" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-slate-400"
                placeholder="ابحث بالمرجع أو الجهة أو المبلغ"
              />
              {query && <button type="button" onClick={() => setQuery('')} className="text-slate-400"><X className="h-4 w-4" /></button>}
            </label>
            <button
              type="button"
              onClick={() => setSortMode((current) => current === 'recent' ? 'amount' : 'recent')}
              className="flex h-11 shrink-0 items-center gap-1.5 rounded-2xl border border-slate-200 bg-white px-3 text-[10px] font-bold text-slate-700"
            >
              <ArrowUpDown className="h-4 w-4" />
              {sortMode === 'recent' ? 'الأحدث' : 'المبلغ'}
            </button>
          </div>
        </section>

        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-slate-500" /></div>
        ) : error ? (
          <div className="rounded-[1.6rem] border border-rose-100 bg-rose-50 p-4 text-xs text-rose-700">
            <p>{error}</p>
            <button type="button" onClick={() => void load()} className="mt-3 min-h-10 rounded-xl bg-rose-600 px-4 text-[10px] font-bold text-white">إعادة المحاولة</button>
          </div>
        ) : !visibleItems.length ? (
          <div className="rounded-[1.8rem] border border-slate-200 bg-white py-14 text-center">
            <FileSearch className="mx-auto h-9 w-9 text-slate-300" />
            <p className="mt-3 text-xs font-bold text-slate-700">لا توجد نتائج مطابقة</p>
            <p className="mt-1 text-[10px] text-slate-400">غيّر التصنيف أو امسح عبارة البحث.</p>
          </div>
        ) : (
          <section className="space-y-3">
            <div className="flex items-center justify-between px-1"><h3 className="text-xs font-bold text-slate-900">العمليات</h3><span className="text-[10px] text-slate-500">{formatNumber(visibleItems.length)} نتيجة</span></div>
            {visibleItems.map((item) => {
              const operation = item.operation;
              return (
                <article key={item.link_id} className="overflow-hidden rounded-[1.7rem] border border-slate-200 bg-white shadow-sm">
                  <button type="button" onClick={() => onOpenOperation(operation.public_token)} className="block w-full p-4 text-right transition active:bg-slate-50">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <span className={`inline-flex rounded-full border px-2.5 py-1 text-[9px] font-bold ${activityTone(item.activity_type)}`}>{activityLabels[item.activity_type]}</span>
                        <h4 className="mt-3 line-clamp-3 text-xs font-bold leading-6 text-slate-950">{operation.summary || 'إشعار مالي'}</h4>
                      </div>
                      <div className="shrink-0 text-left">
                        <strong dir="ltr" className="block text-sm text-emerald-700">{formatNumber(operation.amount)} {operation.currency || ''}</strong>
                        <span className="mt-2 inline-flex items-center gap-1 text-[9px] font-bold text-slate-500">التفاصيل <ChevronLeft className="h-3.5 w-3.5" /></span>
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-2 border-t border-slate-100 pt-3 text-[10px]">
                      <div><span className="block text-[9px] text-slate-400">الجهة المالية</span><strong className="mt-1 block truncate text-slate-700">{operation.financial_entity || 'غير محددة'}</strong></div>
                      <div><span className="block text-[9px] text-slate-400">نوع العملية</span><strong className="mt-1 block truncate text-slate-700">{operation.transaction_type || 'غير محدد'}</strong></div>
                    </div>
                  </button>

                  <div className="flex items-center gap-2 border-t border-slate-100 bg-slate-50/80 px-4 py-3">
                    <Clock3 className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                    <span className="min-w-0 flex-1 truncate text-[9px] text-slate-500">وقت النشاط: {formatDate(item.linked_at)}</span>
                    {operation.reference_number && (
                      <button
                        type="button"
                        onClick={() => void copyReference(operation.reference_number || '')}
                        className="flex shrink-0 items-center gap-1 rounded-xl bg-white px-2.5 py-1.5 text-[9px] font-bold text-slate-600 shadow-sm"
                        aria-label="نسخ رقم المرجع"
                      >
                        <Copy className="h-3 w-3" />
                        {copiedReference === operation.reference_number ? 'تم النسخ' : toLatinDigits(operation.reference_number)}
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </section>
        )}

        <div className="flex items-start gap-3 rounded-[1.5rem] border border-slate-200 bg-white p-4 text-[10px] leading-5 text-slate-500">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700"><SearchCheck className="h-4 w-4" /></span>
          <div><strong className="block text-slate-800">سجل تشغيلي موثق داخل سند</strong><p className="mt-1">تعكس البيانات ارتباطات العمليات وأفعال عضو الفريق المحفوظة في قاعدة البيانات.</p></div>
          <ArrowLeft className="mr-auto mt-1 h-4 w-4 shrink-0 text-slate-300" />
        </div>
      </main>
    </div>
  );
}

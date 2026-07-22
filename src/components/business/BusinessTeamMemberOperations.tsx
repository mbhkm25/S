import { useEffect, useState } from 'react';
import { ArrowLeft, FileText, Link2, Loader2, SearchCheck, X } from 'lucide-react';
import {
  getBusinessTeamMemberOperations,
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

function formatDate(value?: string | null) {
  if (!value) return 'غير متوفر';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'غير متوفر';
  return new Intl.DateTimeFormat('ar-YE-u-nu-latn', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Aden',
    numberingSystem: 'latn'
  }).format(date);
}

function formatNumber(value: number | null | undefined) {
  return new Intl.NumberFormat('en-US').format(Number(value || 0));
}

export default function BusinessTeamMemberOperations({
  businessId,
  memberUserId,
  memberName,
  onClose,
  onOpenOperation
}: Props) {
  const [activityType, setActivityType] = useState<ActivityType>('all');
  const [data, setData] = useState<BusinessTeamMemberOperationsResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <div className="fixed inset-0 z-[130] overflow-y-auto bg-slate-50 font-arabic text-right" dir="rtl">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-sm font-bold text-slate-950">سجل عمليات {memberName}</h2>
            <p className="mt-1 text-[10px] text-slate-500">العمليات التي ربطها الموظف أو تحقق منها داخل النشاط</p>
          </div>
          <button onClick={onClose} className="rounded-xl border border-slate-200 p-2.5" aria-label="إغلاق">
            <X className="h-4 w-4" />
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-4 p-4 pb-[calc(24px+env(safe-area-inset-bottom))]">
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-3 text-center">
            <strong className="block text-lg">{formatNumber(data?.summary.linked_count)}</strong>
            <span className="text-[9px] text-slate-500">عمليات ربطها</span>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-3 text-center">
            <strong className="block text-lg">{formatNumber(data?.summary.verified_count)}</strong>
            <span className="text-[9px] text-slate-500">عمليات تحقق منها</span>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-3 text-center">
            <strong className="block truncate text-[10px]">{formatDate(data?.summary.last_activity_at)}</strong>
            <span className="mt-2 block text-[9px] text-slate-500">آخر نشاط</span>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 rounded-2xl bg-slate-200/70 p-1">
          {([
            ['all', 'الكل'],
            ['linked', 'الربط'],
            ['verified', 'التحقق']
          ] as Array<[ActivityType, string]>).map(([value, label]) => (
            <button
              key={value}
              onClick={() => setActivityType(value)}
              className={`rounded-xl px-3 py-2 text-[10px] font-bold transition ${
                activityType === value ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : error ? (
          <div className="rounded-2xl border border-rose-100 bg-rose-50 p-4 text-xs text-rose-700">{error}</div>
        ) : !data?.items.length ? (
          <div className="rounded-3xl border border-slate-200 bg-white py-14 text-center">
            <FileText className="mx-auto h-8 w-8 text-slate-300" />
            <p className="mt-3 text-xs text-slate-500">لا توجد عمليات في هذا التصنيف.</p>
          </div>
        ) : (
          <section className="space-y-3">
            {data.items.map((item) => {
              const operation = item.operation;
              return (
                <button
                  key={item.link_id}
                  onClick={() => onOpenOperation(operation.public_token)}
                  className="w-full rounded-3xl border border-slate-200 bg-white p-4 text-right shadow-sm transition hover:border-slate-300"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <strong className="text-xs text-slate-950">{operation.summary || 'إشعار مالي'}</strong>
                        <span className="rounded-full bg-slate-100 px-2 py-1 text-[8px] font-bold text-slate-600">
                          {item.activity_type === 'linked'
                            ? 'ربطها'
                            : item.activity_type === 'verified'
                              ? 'تحقق منها'
                              : 'ربطها وتحقق منها'}
                        </span>
                      </div>
                      <p className="mt-2 text-[10px] text-slate-500">
                        {[operation.financial_entity, operation.transaction_type].filter(Boolean).join(' · ') || 'بيانات العملية'}
                      </p>
                      {operation.reference_number && (
                        <p className="mt-1 font-mono text-[9px] text-slate-400" dir="ltr">
                          {toLatinDigits(operation.reference_number)}
                        </p>
                      )}
                      <p className="mt-2 text-[9px] text-slate-400">{formatDate(operation.transaction_datetime || item.linked_at)}</p>
                    </div>
                    <div className="shrink-0 text-left">
                      <strong className="block text-xs text-emerald-700">
                        {formatNumber(operation.amount)} {operation.currency || ''}
                      </strong>
                      <span className="mt-3 flex items-center justify-end gap-1 text-[9px] text-slate-500">
                        عرض <ArrowLeft className="h-3 w-3" />
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
          </section>
        )}

        <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white p-3 text-[10px] text-slate-500">
          <Link2 className="h-4 w-4 shrink-0" />
          السجل يعكس ارتباطات النشاط المحفوظة في قاعدة البيانات.
          <SearchCheck className="mr-auto h-4 w-4 shrink-0 text-emerald-600" />
        </div>
      </main>
    </div>
  );
}

import { useState } from 'react';
import { Clock, RefreshCw, AlertCircle, Loader2 } from 'lucide-react';
import type { BusinessReportHistoryItem } from '../../../lib/businessReportsApi';
import { formatYemeniDisplay, toLatinDigits } from '../../../lib/digits';
import { formatYemenDate, formatYemenTime } from '../../../utils/numerals';

interface BusinessReportHistoryProps {
  requests: BusinessReportHistoryItem[];
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
}

export default function BusinessReportHistory({
  requests,
  loading,
  error,
  onRefresh
}: BusinessReportHistoryProps) {
  const [showAll, setShowAll] = useState(false);

  const getStatusText = (status: string) => {
    switch (status) {
      case 'queued':
        return 'بانتظار المعالجة';
      case 'processing':
        return 'جارٍ إعداد التقرير';
      case 'ready':
        return 'التقرير جاهز';
      case 'sent':
        return 'تم الإرسال إلى واتساب';
      case 'failed':
        return 'تعذر إعداد أو إرسال التقرير';
      case 'cancelled':
        return 'تم إلغاء التقرير';
      default:
        return status;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'queued':
        return 'bg-slate-50 text-slate-500 border-slate-200';
      case 'processing':
        return 'bg-amber-50 text-amber-700 border-amber-100';
      case 'ready':
        return 'bg-blue-50 text-blue-700 border-blue-150';
      case 'sent':
        return 'bg-emerald-50 text-emerald-700 border-emerald-150';
      case 'failed':
        return 'bg-rose-50 text-rose-700 border-rose-100';
      case 'cancelled':
        return 'bg-slate-50 text-slate-400 border-slate-200';
      default:
        return 'bg-slate-50 text-slate-500 border-slate-200';
    }
  };

  const visibleRequests = showAll ? requests : requests.slice(0, 3);

  return (
    <div className="bg-white border border-slate-250/50 rounded-3xl p-4.5 shadow-3xs space-y-4 text-right">
      <div className="flex items-center justify-between">
        <button
          onClick={onRefresh}
          disabled={loading}
          className="p-1.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 transition-all active:scale-95 disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 text-slate-500 ${loading ? 'animate-spin' : ''}`} />
        </button>
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">سجل طلبات التقارير السابقة</h3>
      </div>

      {error && (
        <div className="p-3.5 bg-rose-50 border border-rose-150 text-rose-800 rounded-2xl text-xs leading-relaxed">
          {error}
        </div>
      )}

      {loading && requests.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 space-y-2">
          <Loader2 className="w-5 h-5 text-slate-400 animate-spin" />
          <span className="text-[10px] text-slate-400">جاري جلب سجل التقارير...</span>
        </div>
      ) : requests.length === 0 ? (
        <div className="bg-slate-50 border border-slate-150 rounded-2xl p-8 text-center">
          <Clock className="w-6 h-6 text-slate-300 mx-auto mb-2" />
          <p className="text-[11px] text-slate-400 leading-relaxed">لم يتم طلب أي تقرير بعد.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {visibleRequests.map((req) => {
            return (
              <div
                key={req.id}
                className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 text-right space-y-2.5 transition-all hover:border-slate-300"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${getStatusColor(req.status)}`}>
                    {getStatusText(req.status)}
                  </span>
                  <div>
                    <span className="text-[11px] font-bold text-slate-800 block">
                      {toLatinDigits(req.report_title || 'تقرير عمليات النشاط')}
                    </span>
                    <span className="text-[8px] text-slate-400 block font-mono mt-0.5" dir="ltr">
                      {formatYemenDate(req.requested_at)} — {formatYemenTime(req.requested_at)}
                    </span>
                  </div>
                </div>

                {/* Meta details */}
                <div className="grid grid-cols-2 gap-2 text-[10px] pt-2 border-t border-slate-200/50">
                  <div className="text-right text-slate-400">واتساب المستلم:</div>
                  <div className="text-left font-mono text-slate-600" dir="ltr">
                    {formatYemeniDisplay(req.destination_phone)}
                  </div>
                </div>

                {req.date_from && (
                  <div className="grid grid-cols-2 gap-2 text-[9px] text-slate-400">
                    <div className="text-right">الفترة الزمنية:</div>
                    <div className="text-left font-mono" dir="ltr">
                      {formatYemenDate(req.date_from)} إلى {req.date_to ? formatYemenDate(req.date_to) : 'الآن'}
                    </div>
                  </div>
                )}

                {(req.result_metrics?.total_operations_count !== undefined || req.result_metrics?.operation_count !== undefined) && (
                  <div className="grid grid-cols-2 gap-2 text-[9px] text-slate-400">
                    <div className="text-right">العمليات المشمولة:</div>
                    <div className="text-left font-mono" dir="ltr">
                      {toLatinDigits(req.result_metrics.total_operations_count ?? req.result_metrics.operation_count)} عملية
                    </div>
                  </div>
                )}

                {/* Error message */}
                {req.status === 'failed' && (
                  <div className="flex items-start gap-1.5 p-2 bg-rose-50/60 border border-rose-100 text-[9px] text-rose-600 rounded-lg leading-relaxed">
                    <AlertCircle className="w-3 h-3 text-rose-450 shrink-0 mt-0.5" />
                    <span>تعذر إكمال التقرير. تحقق من الاتصال أو حاول طلب تقرير جديد لاحقًا.</span>
                  </div>
                )}
              </div>
            );
          })}

          {requests.length > 3 && (
            <button
              onClick={() => setShowAll(!showAll)}
              className="w-full text-center py-2 text-xs font-bold text-slate-500 hover:text-slate-800 transition-all border border-slate-100 hover:border-slate-200 rounded-xl"
            >
              {showAll ? 'عرض تقارير أقل' : 'عرض كل التقارير السابقة'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

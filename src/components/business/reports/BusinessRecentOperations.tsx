import { useMemo } from 'react';
import { Eye, FileText, ChevronLeft } from 'lucide-react';
import type { BusinessOperationItem } from '../../../lib/businessApi';
import { toLatinDigits } from '../../../lib/digits';
import { formatNumberLatin, formatYemenDate, formatYemenTime } from '../../../utils/numerals';
import { getOperationDate, getOperationVerificationState } from './businessReportUtils';

interface BusinessRecentOperationsProps {
  operations: BusinessOperationItem[];
  onNavigate: (page: string, token?: string) => void;
}

export default function BusinessRecentOperations({
  operations,
  onNavigate
}: BusinessRecentOperationsProps) {
  // Sort operations by date descending and take top 5
  const recentOps = useMemo(() => {
    return [...operations]
      .sort((a, b) => {
        return (getOperationDate(b)?.getTime() || 0) - (getOperationDate(a)?.getTime() || 0);
      })
      .slice(0, 5);
  }, [operations]);

  const getStatusBadge = (item: BusinessOperationItem) => {
    const state = getOperationVerificationState(item);
    if (state === 'verified') {
      return (
        <span className="bg-emerald-50 text-emerald-700 text-[9px] font-bold px-2 py-0.5 rounded-full border border-emerald-100">
          موثق ومعتمد
        </span>
      );
    }
    
    switch (state) {
      case 'needs_review':
        return (
          <span className="bg-amber-50 text-amber-700 text-[9px] font-bold px-2 py-0.5 rounded-full border border-amber-100">
            تحتاج مراجعة
          </span>
        );
      default:
        return (
          <span className="bg-slate-100 text-slate-600 text-[9px] font-bold px-2 py-0.5 rounded-full border border-slate-200">
            معلق
          </span>
        );
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-3xl p-4.5 shadow-3xs space-y-3.5 text-right font-arabic">
      <div className="flex items-center justify-between">
        <button
          onClick={() => onNavigate('business-operations')}
          className="text-[10px] font-bold text-slate-500 hover:text-black flex items-center gap-0.5"
        >
          <span>عرض كل العمليات</span>
          <ChevronLeft className="w-3 h-3" />
        </button>
        <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">أحدث العمليات</h4>
      </div>

      {recentOps.length === 0 ? (
        <div className="p-8 border border-dashed border-slate-200 rounded-2xl text-center">
          <p className="text-[10px] text-slate-400">لا توجد عمليات مسجلة حالياً.</p>
        </div>
      ) : (
        <div className="divide-y divide-slate-100 border border-slate-200/50 rounded-2xl overflow-hidden shadow-3xs bg-slate-50/20">
          {recentOps.map((item, index) => {
            const op = item.operation;
            if (!op) return null;

            const verifierName = item.verified_by?.full_name || item.verified_by?.phone || 'غير محدد';
            const opDate = op.transaction_datetime || op.created_at || item.linked_at;

            return (
              <div
                key={op.id || index}
                className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 hover:bg-slate-50 transition-all"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center shrink-0">
                    <FileText className="w-4.5 h-4.5 text-slate-450" />
                  </div>
                  <div className="text-right">
                    <span className="text-xs font-bold text-slate-900 block font-mono">
                      {formatNumberLatin(op.amount)} {toLatinDigits(op.currency)}
                    </span>
                    <div className="flex items-center gap-1.5 mt-1">
                      <span className="text-[9px] text-slate-500 font-bold bg-slate-200/60 px-1.5 py-0.5 rounded">
                        {op.financial_entity}
                      </span>
                      <span className="text-[9px] text-slate-400 font-mono">
                        المرجع: {toLatinDigits(op.reference_number || '—')}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-3.5">
                  <div className="text-[9px] text-slate-500 text-left sm:text-right">
                    <span className="block font-bold text-slate-700">المتحقق: {verifierName}</span>
                    <span className="block font-mono text-slate-400 mt-0.5" dir="ltr">
                      {formatYemenDate(opDate)} — {formatYemenTime(opDate)}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    {getStatusBadge(item)}
                    
                    {op.public_token && (
                      <button
                        onClick={() => onNavigate('details', op.public_token)}
                        className="p-1.5 hover:bg-slate-150 border border-slate-200 hover:border-slate-300 rounded-lg transition-all"
                        title="فتح تفاصيل العملية"
                      >
                        <Eye className="w-3.5 h-3.5 text-slate-500" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

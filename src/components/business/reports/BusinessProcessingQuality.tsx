import { useMemo } from 'react';
import { ShieldCheck, Percent } from 'lucide-react';
import type { BusinessOperationItem } from '../../../lib/businessApi';
import { formatNumberLatin, formatPercentLatin } from '../../../utils/numerals';
import { getOperationVerificationState } from './businessReportUtils';

interface BusinessProcessingQualityProps {
  operations: BusinessOperationItem[];
}

export default function BusinessProcessingQuality({ operations }: BusinessProcessingQualityProps) {
  const metrics = useMemo(() => {
    const total = operations.length;
    let verifiedCount = 0;
    let failedCount = 0;
    let needsReviewCount = 0;
    let pendingCount = 0;

    operations.forEach((item) => {
      const op = item.operation;
      if (!op) return;

      const state = getOperationVerificationState(item);
      if (state === 'verified') {
        verifiedCount++;
      } else if (state === 'needs_review') {
        needsReviewCount++;
      } else {
        pendingCount++;
      }
      if (op.ai_status === 'failed') failedCount++;
    });

    const verificationRate = total > 0 ? Math.round((verifiedCount / total) * 100) : 0;
    
    const completedCount = operations.filter(({ operation }) => operation?.ai_status === 'completed').length;
    const completionRate = total > 0 ? Math.round((completedCount / total) * 100) : 0;

    return {
      total,
      verifiedCount,
      failedCount,
      needsReviewCount,
      pendingCount,
      verificationRate,
      completionRate
    };
  }, [operations]);

  return (
    <div className="bg-white border border-slate-200 rounded-3xl p-4.5 shadow-3xs space-y-4 text-right font-arabic">
      <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">جودة معالجة العمليات</h4>

      <div className="space-y-3">
        {/* Verification Ratio */}
        <div className="flex items-center justify-between p-2.5 bg-slate-50 border border-slate-100 rounded-xl text-[10px]">
          <div className="flex items-center gap-1.5 font-bold text-slate-800">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            <span>نسبة التحقق</span>
          </div>
          <span className="font-bold text-slate-900 font-mono">
            {formatPercentLatin(metrics.verificationRate)}
          </span>
        </div>

        {/* Analysis Completion Ratio */}
        <div className="flex items-center justify-between p-2.5 bg-slate-50 border border-slate-100 rounded-xl text-[10px]">
          <div className="flex items-center gap-1.5 font-bold text-slate-800">
            <Percent className="w-3.5 h-3.5 text-indigo-650" />
            <span>اكتمال تحليل العمليات</span>
          </div>
          <span className="font-bold text-slate-900 font-mono">
            {formatPercentLatin(metrics.completionRate)}
          </span>
        </div>

        {/* Details Counters */}
        <div className="grid grid-cols-3 gap-2 text-[9px] pt-1">
          {/* Needs Review */}
          <div className="bg-rose-50/30 border border-rose-100/50 p-2 rounded-xl text-center">
            <span className="block text-rose-700/80 font-bold">تحتاج مراجعة</span>
            <span className="block font-bold text-rose-700 font-mono mt-1">
              {formatNumberLatin(metrics.needsReviewCount)}
            </span>
          </div>

          {/* Failed Analysis */}
          <div className="bg-slate-100/50 border border-slate-200/60 p-2 rounded-xl text-center">
            <span className="block text-slate-500 font-bold">تحليل فاشل</span>
            <span className="block font-bold text-slate-600 font-mono mt-1">
              {formatNumberLatin(metrics.failedCount)}
            </span>
          </div>

          {/* Pending operations */}
          <div className="bg-amber-50/30 border border-amber-100/50 p-2 rounded-xl text-center">
            <span className="block text-amber-700/80 font-bold">عمليات معلقة</span>
            <span className="block font-bold text-amber-750 font-mono mt-1">
              {formatNumberLatin(metrics.pendingCount)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

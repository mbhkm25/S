import { useMemo } from 'react';
import type { BusinessOperationItem } from '../../../lib/businessApi';
import { formatNumberLatin, formatPercentLatin } from '../../../utils/numerals';
import { getOperationVerificationState } from './businessReportUtils';

interface BusinessOperationsSummaryProps {
  operations: BusinessOperationItem[];
}

export default function BusinessOperationsSummary({ operations }: BusinessOperationsSummaryProps) {
  const stats = useMemo(() => {
    const total = operations.length;
    let verified = 0;
    let pending = 0;
    let needsReview = 0;
    const activeVerifiers = new Set<string>();

    operations.forEach((item) => {
      const op = item.operation;
      if (!op) return;

      const state = getOperationVerificationState(item);
      if (state === 'verified') {
        verified++;
      } else if (state === 'needs_review') {
        needsReview++;
      } else {
        pending++;
      }

      // Track active team members
      if (item.verified_by?.id) activeVerifiers.add(item.verified_by.id);
      if (item.linked_by?.id) activeVerifiers.add(item.linked_by.id);
    });

    const verificationRate = total > 0 ? Math.round((verified / total) * 100) : 0;

    return {
      total,
      verified,
      pending,
      needsReview,
      verificationRate,
      activeMembersCount: activeVerifiers.size
    };
  }, [operations]);

  return (
    <div className="space-y-3.5 text-right font-arabic">
      <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">ملخص العمليات</span>
      
      {/* 2x2 Grid + Full width rate card */}
      <div className="grid grid-cols-2 gap-3">
        {/* Total ops */}
        <div className="bg-slate-50 border border-slate-200/60 rounded-2xl p-4 shadow-3xs">
          <span className="text-[9px] text-slate-450 block font-bold">عدد العمليات</span>
          <span className="text-xl font-bold text-slate-800 block mt-1 font-mono">
            {formatNumberLatin(stats.total)}
          </span>
        </div>

        {/* Verified ops */}
        <div className="bg-emerald-50/40 border border-emerald-100/60 rounded-2xl p-4 shadow-3xs">
          <span className="text-[9px] text-emerald-700/80 block font-bold">العمليات المؤكدة</span>
          <span className="text-xl font-bold text-emerald-700 block mt-1 font-mono">
            {formatNumberLatin(stats.verified)}
          </span>
        </div>

        {/* Pending ops */}
        <div className="bg-amber-50/40 border border-amber-100/60 rounded-2xl p-4 shadow-3xs">
          <span className="text-[9px] text-amber-700/80 block font-bold">العمليات المعلقة</span>
          <span className="text-xl font-bold text-amber-750 block mt-1 font-mono">
            {formatNumberLatin(stats.pending)}
          </span>
        </div>

        {/* Needs review */}
        <div className="bg-rose-50/40 border border-rose-100/60 rounded-2xl p-4 shadow-3xs">
          <span className="text-[9px] text-rose-700/80 block font-bold">تحتاج مراجعة</span>
          <span className="text-xl font-bold text-rose-700 block mt-1 font-mono">
            {formatNumberLatin(stats.needsReview)}
          </span>
        </div>
      </div>

      {/* Verification Rate Card */}
      <div className="bg-slate-900 text-white rounded-2xl p-4 flex items-center justify-between shadow-xs">
        <div className="text-right">
          <span className="text-[9px] text-slate-400 block font-bold">نسبة التحقق والمطابقة</span>
          <span className="text-[8px] text-slate-500 block mt-0.5 font-mono">
            {formatNumberLatin(stats.activeMembersCount)} أعضاء نشطين ضمن النتائج
          </span>
        </div>
        <span className="text-2xl font-black text-emerald-400 font-mono">
          {formatPercentLatin(stats.verificationRate)}
        </span>
      </div>
    </div>
  );
}

import React, { useState, useMemo } from 'react';
import { Users, Award, Shield, Clock } from 'lucide-react';
import { toLatinDigits } from '../../../lib/digits';
import { formatNumberLatin, formatPercentLatin } from '../../../utils/numerals';

interface BusinessTeamPerformanceProps {
  operations: any[];
}

interface MemberStats {
  userId: string;
  name: string;
  phone: string;
  verifiedCount: number;
  pendingCount: number;
  totalCount: number;
  lastActivityAt: string | null;
}

export default function BusinessTeamPerformance({ operations }: BusinessTeamPerformanceProps) {
  const [showAll, setShowAll] = useState(false);

  const leaderboard = useMemo(() => {
    const statsMap: Record<string, MemberStats> = {};

    operations.forEach((item) => {
      const op = item.operation;
      if (!op) return;

      const isVerified = op.status === 'verified' || item.link_status === 'verified';
      const activityTime = op.transaction_datetime || op.created_at || item.linked_at;

      // 1. Credit for verification
      if (isVerified && item.verified_by?.id) {
        const vUser = item.verified_by;
        const uid = vUser.id;
        if (!statsMap[uid]) {
          statsMap[uid] = {
            userId: uid,
            name: vUser.full_name || 'عضو فريق',
            phone: vUser.phone || '',
            verifiedCount: 0,
            pendingCount: 0,
            totalCount: 0,
            lastActivityAt: null
          };
        }
        statsMap[uid].verifiedCount++;
        statsMap[uid].totalCount++;
        
        if (!statsMap[uid].lastActivityAt || new Date(activityTime) > new Date(statsMap[uid].lastActivityAt!)) {
          statsMap[uid].lastActivityAt = activityTime;
        }
      }

      // 2. Credit for pending link (adding to activity)
      if (!isVerified && item.linked_by?.id) {
        const lUser = item.linked_by;
        const uid = lUser.id;
        if (!statsMap[uid]) {
          statsMap[uid] = {
            userId: uid,
            name: lUser.full_name || 'عضو فريق',
            phone: lUser.phone || '',
            verifiedCount: 0,
            pendingCount: 0,
            totalCount: 0,
            lastActivityAt: null
          };
        }
        statsMap[uid].pendingCount++;
        statsMap[uid].totalCount++;

        if (!statsMap[uid].lastActivityAt || new Date(activityTime) > new Date(statsMap[uid].lastActivityAt!)) {
          statsMap[uid].lastActivityAt = activityTime;
        }
      }
    });

    // Sort by verified operations descending, then total operations descending
    return Object.values(statsMap).sort((a, b) => {
      if (b.verifiedCount !== a.verifiedCount) {
        return b.verifiedCount - a.verifiedCount;
      }
      return b.totalCount - a.totalCount;
    });
  }, [operations]);

  const visibleMembers = showAll ? leaderboard : leaderboard.slice(0, 3);

  return (
    <div className="bg-white border border-slate-200 rounded-3xl p-4.5 shadow-3xs space-y-3.5 text-right font-arabic">
      <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5 justify-end">
        <Users className="w-3.5 h-3.5 text-slate-400" />
        <span>أداء أعضاء الفريق</span>
      </h4>

      {leaderboard.length === 0 ? (
        <p className="text-[10px] text-slate-450 text-center py-4">لا توجد عمليات كافية لقياس الأداء.</p>
      ) : (
        <div className="space-y-2">
          {visibleMembers.map((member, idx) => {
            const verificationRate = member.totalCount > 0 
              ? Math.round((member.verifiedCount / member.totalCount) * 100) 
              : 0;

            return (
              <div
                key={member.userId}
                className="flex flex-col p-3 bg-slate-50 border border-slate-100 rounded-2xl space-y-2 text-[10px]"
              >
                <div className="flex items-center justify-between">
                  {/* Status Badges */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded font-bold">
                      {formatNumberLatin(member.verifiedCount)} موثقة
                    </span>
                    <span className="text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                      {formatPercentLatin(verificationRate)} تحقق
                    </span>
                  </div>

                  {/* Member Name and Rank */}
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-800 text-[11px] truncate max-w-[120px]">
                      {member.name}
                    </span>
                    <span className={`w-5 h-5 rounded-full flex items-center justify-center font-bold text-[9px] shrink-0 ${
                      idx === 0 ? 'bg-amber-100 text-amber-800' : 'bg-slate-200 text-slate-650'
                    }`}>
                      {formatNumberLatin(idx + 1)}
                    </span>
                  </div>
                </div>

                <div className="flex justify-between text-[9px] text-slate-400 pt-1.5 border-t border-slate-200/40">
                  <div>
                    {member.lastActivityAt ? (
                      <span className="font-mono" dir="ltr">
                        آخر نشاط: {toLatinDigits(new Date(member.lastActivityAt).toLocaleDateString('ar-YE-u-nu-latn', { numberingSystem: 'latn' }))}
                      </span>
                    ) : (
                      <span>لا يوجد نشاط مؤخراً</span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <span>العمليات المضافة: {formatNumberLatin(member.pendingCount)} معلقة</span>
                    <span>•</span>
                    <span>الإجمالي: {formatNumberLatin(member.totalCount)}</span>
                  </div>
                </div>
              </div>
            );
          })}

          {leaderboard.length > 3 && (
            <button
              onClick={() => setShowAll(!showAll)}
              className="w-full text-center py-2 text-xs font-bold text-slate-500 hover:text-slate-800 transition-all border border-slate-100 hover:border-slate-200 rounded-xl"
            >
              {showAll ? 'عرض أعضاء أقل' : 'عرض جميع أعضاء الفريق'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

import { useState, useEffect } from 'react';
import { Profile, MyOperationItem } from '../types';
import { supabase } from '../lib/supabase';
import { UploadCloud, FileText, CheckCircle2, FileBarChart2, ArrowUpRight } from 'lucide-react';
import { formatArabicDate, formatArabicTime, toLatinDigits, getOperationCardDetails } from '../lib/digits';

interface HomeProps {
  profile: Profile | null;
  onNavigate: (page: string, token?: string) => void;
}

export default function Home({ profile, onNavigate }: HomeProps) {
  const [loading, setLoading] = useState(true);
  const [uploaderCount, setUploaderCount] = useState(0);
  const [verifierCount, setVerifierCount] = useState(0);
  const [latestOperations, setLatestOperations] = useState<MyOperationItem[]>([]);

  useEffect(() => {
    async function fetchDashboardData() {
      if (import.meta.env.DEV) {
        performance.mark('home_data_load_start');
      }
      setLoading(true);
      try {
        // Fetch operations uploaded by user
        const { data: uploaders } = await supabase.rpc('get_my_operations', {
          p_relation_type: 'uploader',
          p_limit: 10
        });

        // Fetch operations verified by user
        const { data: verifiers } = await supabase.rpc('get_my_operations', {
          p_relation_type: 'verifier',
          p_limit: 10
        });

        const uCount = uploaders?.length || 0;
        const vCount = verifiers?.length || 0;

        setUploaderCount(uCount);
        setVerifierCount(vCount);

        // Merge and sort for latest 2 activities
        const merged: MyOperationItem[] = [];
        if (uploaders) merged.push(...uploaders);
        if (verifiers) merged.push(...verifiers);

        // Sort descending by created_at
        merged.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

        // Deduplicate to avoid duplicate keys when user is both uploader and verifier
        const uniqueMerged: MyOperationItem[] = [];
        const seenIds = new Set<string>();
        for (const item of merged) {
          const id = item.operation_id || item.public_token;
          if (id && !seenIds.has(id)) {
            seenIds.add(id);
            uniqueMerged.push(item);
          }
        }

        // Set top 2
        const top2 = uniqueMerged.slice(0, 2);

        // Fetch full operation details to enrich with real database fields
        const ids = top2.map(op => op.operation_id).filter(Boolean);
        if (ids.length > 0) {
          const { data: fullOps, error: fullOpsError } = await supabase
            .from('operations')
            .select('id, amount, currency, financial_entity, reference_number, structured_data, raw_ai_json, receiver_name')
            .in('id', ids);

          if (!fullOpsError && fullOps) {
            const enriched = top2.map(t2 => {
              const full = fullOps.find(f => f.id === t2.operation_id);
              return {
                ...t2,
                ...full
              };
            });
            setLatestOperations(enriched);
          } else {
            setLatestOperations(top2);
          }
        } else {
          setLatestOperations(top2);
        }
      } catch (err) {
        console.error('Error fetching dashboard counts:', err);
      } finally {
        setLoading(false);
        if (import.meta.env.DEV) {
          performance.mark('home_data_load_end');
          performance.measure('Home Data Load Time', 'home_data_load_start', 'home_data_load_end');
        }
      }
    }

    fetchDashboardData();
  }, []);

  return (
    <div className="space-y-6" id="home_view">
      
      {/* Overview Card (Inspired by the neutral dark aesthetic of the reference) */}
      <div className="bg-[#111111] text-white rounded-3xl p-5 shadow-sm space-y-4" id="home_overview_card">
        <div>
          <span className="text-[10px] text-slate-400 font-medium font-arabic">مرحباً بك في سند للتحقق</span>
          <h2 className="text-lg font-bold text-white font-arabic mt-0.5">
            {profile ? profile.full_name : <span className="h-5 w-24 bg-slate-800 rounded animate-pulse inline-block mt-1"></span>}
          </h2>
          <p className="text-[10px] text-slate-400 font-arabic mt-1 leading-relaxed">
            نظام التحقق المالي الشخصي الآمن لإثبات ومطابقة الإشعارات الفورية.
          </p>
        </div>
        
        <div className="grid grid-cols-3 gap-3 pt-3.5 border-t border-white/10 text-right">
          <div>
            <span className="text-[9px] text-slate-400 font-arabic block">العمليات المرسلة</span>
            <span className="text-base font-bold font-mono text-white mt-0.5 block">
              {loading ? '...' : uploaderCount}
            </span>
          </div>
          <div>
            <span className="text-[9px] text-slate-400 font-arabic block">العمليات المدققة</span>
            <span className="text-base font-bold font-mono text-white mt-0.5 block">
              {loading ? '...' : verifierCount}
            </span>
          </div>
          <div>
            <span className="text-[9px] text-slate-400 font-arabic block">حالة الحساب</span>
            <span className="text-xs font-bold text-emerald-400 mt-1 flex items-center gap-1 font-arabic">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>نشط</span>
            </span>
          </div>
        </div>
      </div>

      {/* Quick Actions Section (Clean 2x2 Layout) */}
      <div className="space-y-2">
        <h3 className="text-xs font-bold text-slate-400 font-arabic text-right">الإجراءات السريعة</h3>
        <div className="grid grid-cols-2 gap-3" id="quick_actions_grid">
          <button
            onClick={() => onNavigate('upload')}
            className="bg-white border border-slate-200/60 p-4 rounded-2xl text-right hover:border-slate-300 transition-all cursor-pointer flex flex-col justify-between h-[100px]"
          >
            <div className="w-8 h-8 rounded-xl bg-slate-50 flex items-center justify-center border border-slate-100">
              <UploadCloud className="w-4 h-4 text-[#111111]" />
            </div>
            <div>
              <span className="text-xs font-bold text-slate-900 block font-arabic">رفع إشعار</span>
              <span className="text-[9px] text-slate-400 mt-0.5 block font-arabic">توليد ومشاركة رمز QR</span>
            </div>
          </button>

          <button
            onClick={() => onNavigate('verify-notice')}
            className="bg-white border border-slate-200/60 p-4 rounded-2xl text-right hover:border-slate-300 transition-all cursor-pointer flex flex-col justify-between h-[100px]"
          >
            <div className="w-8 h-8 rounded-xl bg-slate-50 flex items-center justify-center border border-slate-100">
              <CheckCircle2 className="w-4 h-4 text-[#111111]" />
            </div>
            <div>
              <span className="text-xs font-bold text-slate-900 block font-arabic">تحقق من إشعار</span>
              <span className="text-[9px] text-slate-400 mt-0.5 block font-arabic">مطابقة ومسح الرموز</span>
            </div>
          </button>

          <button
            onClick={() => onNavigate('reports')}
            className="bg-white border border-slate-200/60 p-4 rounded-2xl text-right hover:border-slate-300 transition-all cursor-pointer flex flex-col justify-between h-[100px]"
          >
            <div className="w-8 h-8 rounded-xl bg-slate-50 flex items-center justify-center border border-slate-100">
              <FileBarChart2 className="w-4 h-4 text-[#111111]" />
            </div>
            <div>
              <span className="text-xs font-bold text-slate-900 block font-arabic">طلب تقرير</span>
              <span className="text-[9px] text-slate-400 mt-0.5 block font-arabic">استلام كشف عبر واتساب</span>
            </div>
          </button>

          <button
            onClick={() => onNavigate('my-operations')}
            className="bg-white border border-slate-200/60 p-4 rounded-2xl text-right hover:border-slate-300 transition-all cursor-pointer flex flex-col justify-between h-[100px]"
          >
            <div className="w-8 h-8 rounded-xl bg-slate-50 flex items-center justify-center border border-slate-100">
              <FileText className="w-4 h-4 text-[#111111]" />
            </div>
            <div>
              <span className="text-xs font-bold text-slate-900 block font-arabic">سجل العمليات</span>
              <span className="text-[9px] text-slate-400 mt-0.5 block font-arabic">استعراض وتصفح العمليات</span>
            </div>
          </button>
        </div>
      </div>

      {/* Latest Activities Section */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold text-slate-400 font-arabic text-right">آخر النشاط</h3>
          <button
            onClick={() => onNavigate('my-operations')}
            className="text-[10px] font-bold text-slate-600 hover:text-slate-900 transition-all font-arabic"
          >
            عرض الكل
          </button>
        </div>

        {loading ? (
          <div className="p-6 text-center text-slate-400 text-xs font-arabic">جاري جلب أحدث العمليات...</div>
        ) : latestOperations.length === 0 ? (
          <div className="bg-white border border-slate-150 p-6 rounded-2xl text-center text-xs text-slate-400 font-arabic">
            لا توجد عمليات مسجلة بعد.
          </div>
        ) : (
          <div className="space-y-2.5" id="latest_activities_list">
            {latestOperations.map((item) => {
              const card = getOperationCardDetails(item);
              return (
                <div
                  key={item.operation_id || item.public_token}
                  className="bg-white border border-slate-200/60 p-3.5 rounded-2xl flex items-center justify-between gap-3 shadow-sm hover:border-slate-300 hover:shadow-md transition-all group"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`p-2 rounded-xl shrink-0 ${
                      item.relation_type === 'uploader' ? 'bg-emerald-50 text-emerald-700' : 'bg-blue-50 text-blue-700'
                    }`}>
                      <FileText className="w-4 h-4" />
                    </div>
                    <div className="min-w-0 text-right">
                      <span className="text-xs font-bold text-slate-900 block truncate leading-snug">
                        {card.title}
                      </span>
                      
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1 text-[10px] text-slate-500 font-arabic">
                        {card.amount && (
                          <span className="text-emerald-700 font-bold bg-emerald-50/80 px-1.5 py-0.2 rounded font-mono text-[9px] shrink-0 border border-emerald-100/40">
                            {card.amount}
                          </span>
                        )}
                        {card.entity && (
                          <span className="text-slate-600 truncate max-w-[120px]">{card.entity}</span>
                        )}
                        {card.refNum && (
                          <span className="text-slate-400 font-mono text-[9px] shrink-0">رقم {card.refNum}</span>
                        )}
                        <span className="text-slate-400 font-mono text-[9px] shrink-0">
                          {card.dateStr}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${
                      item.status === 'verified' || item.status === 'completed'
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-100/40'
                        : 'bg-amber-50 text-amber-700 border border-amber-100/40'
                    }`}>
                      {item.status === 'verified' || item.status === 'completed' ? 'موثق' : 'معلق'}
                    </span>
                    <button
                      onClick={() => onNavigate('details', item.public_token)}
                      className="text-[10px] font-bold text-slate-800 hover:text-black bg-slate-50 hover:bg-slate-100 border border-slate-200 py-1.5 px-3 rounded-xl transition-all cursor-pointer shadow-sm shrink-0"
                    >
                      عرض
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

    </div>
  );
}

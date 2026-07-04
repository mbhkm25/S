import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { MyOperationItem } from '../types';
import { FileText, Calendar, Filter, Loader2, ArrowUpRight, FolderOpen, RefreshCcw, ShieldCheck } from 'lucide-react';
import { getOperationCardDetails } from '../lib/digits';

interface MyOperationsProps {
  onNavigateToDetails: (token: string) => void;
}

type FilterType = 'uploader' | 'verifier';

export default function MyOperations({ onNavigateToDetails }: MyOperationsProps) {
  const [operations, setOperations] = useState<MyOperationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Segment Filter state ('uploader' or 'verifier')
  const [activeFilter, setActiveFilter] = useState<FilterType>('uploader');

  const fetchOperations = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: rpcError } = await supabase.rpc('get_my_operations', {
        p_relation_type: activeFilter,
        p_from: null,
        p_to: null,
        p_limit: 100,
        p_offset: 0
      });

      if (rpcError) {
        throw rpcError;
      }

      const items = data || [];
      const ids = items.map((op: any) => op.operation_id).filter(Boolean);
      if (ids.length > 0) {
        const { data: fullOps, error: fullOpsError } = await supabase
          .from('operations')
          .select('id, amount, currency, financial_entity, reference_number, structured_data, raw_ai_json, receiver_name')
          .in('id', ids);

        if (!fullOpsError && fullOps) {
          const enriched = items.map((t2: any) => {
            const full = fullOps.find(f => f.id === t2.operation_id);
            return {
              ...t2,
              ...full
            };
          });
          setOperations(enriched);
        } else {
          setOperations(items);
        }
      } else {
        setOperations(items);
      }
    } catch (err: any) {
      console.error('get_my_operations error:', err);
      setError('تعذر جلب العمليات من قاعدة سند. أعد المحاولة.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOperations();
  }, [activeFilter]);

  return (
    <div className="space-y-6" id="my_operations_view">
      
      {/* Title */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">سجل عملياتي</h1>
          <p className="text-xs text-slate-500 font-arabic">مراجعة الإشعارات التي أرسلتها أو تحققت من صحتها</p>
        </div>
        <button
          onClick={fetchOperations}
          disabled={loading}
          className="p-2 bg-slate-50 hover:bg-slate-100 rounded-xl text-slate-500 border border-slate-150 transition-all cursor-pointer disabled:opacity-50"
          title="تحديث البيانات"
        >
          <RefreshCcw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Filter Tabs (Segment Switcher) */}
      <div className="flex bg-slate-100 p-1 rounded-2xl border border-slate-150" id="filter_tabs">
        <button
          onClick={() => setActiveFilter('uploader')}
          className={`flex-1 py-2.5 text-xs font-bold rounded-xl transition-all cursor-pointer text-center font-arabic ${
            activeFilter === 'uploader'
              ? 'bg-white text-emerald-700 shadow-sm'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          عمليات أرسلتها إلى سند
        </button>
        <button
          onClick={() => setActiveFilter('verifier')}
          className={`flex-1 py-2.5 text-xs font-bold rounded-xl transition-all cursor-pointer text-center font-arabic ${
            activeFilter === 'verifier'
              ? 'bg-white text-emerald-700 shadow-sm'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          عمليات تم التحقق منها
        </button>
      </div>

      {error && (
        <div className="p-4 bg-rose-50 border border-rose-150 text-rose-800 rounded-2xl text-xs font-arabic">
          {error}
        </div>
      )}

      {/* List Container */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 space-y-3" id="operations_loader">
          <Loader2 className="w-8 h-8 text-emerald-600 animate-spin" />
          <span className="text-xs text-slate-400 font-arabic">جاري تحميل سجل العمليات الموثقة...</span>
        </div>
      ) : operations.length === 0 ? (
        /* Empty State */
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-12 text-center space-y-4 animate-fade-in" id="empty_operations_state">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-100 text-emerald-600 mb-2">
            <FolderOpen className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-800">لا توجد عمليات مسجلة</h3>
            <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto leading-relaxed font-arabic">
              {activeFilter === 'uploader'
                ? 'لم ترسل أي إشعار إلى سند بعد.'
                : 'لم تتحقق من أي إشعار بعد.'}
            </p>
          </div>
        </div>
      ) : (
        /* Operations List */
        <div className="space-y-3.5" id="operations_list">
          {operations.map((item) => {
            const card = getOperationCardDetails(item);
            return (
              <div
                key={item.operation_id || item.public_token}
                className="bg-white rounded-2xl border border-slate-100 hover:border-emerald-200/50 p-4 shadow-sm flex items-center justify-between gap-4 hover:shadow-md transition-all group"
              >
                <div className="flex items-center gap-3 text-right overflow-hidden min-w-0">
                  <div className={`p-2.5 rounded-xl shrink-0 ${
                    item.relation_type === 'uploader' 
                      ? 'bg-emerald-50 text-emerald-600' 
                      : 'bg-indigo-50 text-indigo-600'
                  }`}>
                    <FileText className="w-5 h-5" />
                  </div>
                  <div className="overflow-hidden min-w-0">
                    <h3 className="text-xs font-bold text-slate-900 truncate leading-snug">
                      {card.title}
                    </h3>
                    
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1.5 text-[10px] text-slate-500 font-arabic">
                      {/* Amount tag */}
                      {card.amount && (
                        <span className="text-emerald-700 font-bold bg-emerald-50 px-1.5 py-0.2 rounded font-mono text-[9px] border border-emerald-100/30 shrink-0">
                          {card.amount}
                        </span>
                      )}

                      {/* Financial entity */}
                      {card.entity && (
                        <span className="text-slate-600 truncate max-w-[120px] shrink-0">{card.entity}</span>
                      )}

                      {/* Ref Number */}
                      {card.refNum && (
                        <span className="text-slate-400 font-mono text-[9px] shrink-0">رقم {card.refNum}</span>
                      )}

                      {/* Timestamp */}
                      <span className="flex items-center gap-1 text-slate-400 font-mono text-[9px] shrink-0">
                        <Calendar className="w-3 h-3 text-slate-300" />
                        <span>{card.dateStr}</span>
                      </span>

                      {/* Role Tag */}
                      <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded-full text-[8px] font-semibold shrink-0 ${
                        item.relation_type === 'uploader'
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-indigo-50 text-indigo-700'
                      }`}>
                        {item.relation_type === 'uploader' ? 'مرسل' : 'مدقق'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Action Button */}
                <button
                  onClick={() => onNavigateToDetails(item.public_token)}
                  className="px-3.5 py-2 bg-slate-50 hover:bg-emerald-50 text-slate-600 hover:text-emerald-700 border border-slate-200/50 hover:border-emerald-200 rounded-xl text-xs font-semibold transition-all inline-flex items-center gap-1.5 cursor-pointer shrink-0 group-hover:translate-x-0.5"
                >
                  <span>تفاصيل</span>
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

import { motion, useReducedMotion } from 'motion/react';
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { MyOperationItem } from '../types';
import { Calendar, Loader2, ArrowUpRight, FolderOpen, RefreshCcw, Eye, X, CloudOff, Clock3 } from 'lucide-react';
import { getOperationCardDetails } from '../lib/digits';
import FinancialEntityLogo from './FinancialEntityLogo';
import ShinyText from './ui/ShinyText';
import { listLocalOperationHistory, type LocalOperationHistoryItem } from '../features/local-first/localOperationHistory';
import { LOCAL_RUNTIME_STATUS_EVENT } from '../features/local-first/localRuntimeEvents';

interface MyOperationsProps {
  onNavigateToDetails: (token: string) => void;
}

type FilterType = 'uploader' | 'verifier';

function localStatusLabel(item: LocalOperationHistoryItem): string {
  switch (item.operation.status) {
    case 'syncing':
      return 'جاري المزامنة مع سند';
    case 'synced':
      return 'تمت المزامنة — جاري إكمال المعالجة';
    case 'sync_failed':
      return 'محفوظ محليًا — تعذر إكمال المزامنة';
    case 'retry_wait':
      return 'محفوظ محليًا — سيعيد سند المحاولة';
    default:
      return 'محفوظ محليًا — بانتظار الاتصال لإكمال التحليل';
  }
}

function localStatusClass(item: LocalOperationHistoryItem): string {
  if (item.operation.status === 'synced') return 'bg-emerald-50 text-emerald-700 border-emerald-100';
  if (item.operation.status === 'syncing') return 'bg-sky-50 text-sky-700 border-sky-100';
  if (item.operation.status === 'sync_failed') return 'bg-rose-50 text-rose-700 border-rose-100';
  return 'bg-amber-50 text-amber-800 border-amber-100';
}

export default function MyOperations({ onNavigateToDetails }: MyOperationsProps) {
  const reduceMotion = useReducedMotion();
  const [operations, setOperations] = useState<MyOperationItem[]>([]);
  const [localOperations, setLocalOperations] = useState<LocalOperationHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<FilterType>('uploader');
  const [preview, setPreview] = useState<{ url: string; name: string; mimeType: string } | null>(null);

  const closePreview = useCallback(() => {
    setPreview((current) => {
      if (current?.url) URL.revokeObjectURL(current.url);
      return null;
    });
  }, []);

  const openLocalPreview = useCallback((item: LocalOperationHistoryItem) => {
    if (!item.file) return;
    closePreview();
    const url = URL.createObjectURL(item.file.blob);
    setPreview({ url, name: item.file.name, mimeType: item.file.mimeType });
  }, [closePreview]);

  const fetchOperations = useCallback(async () => {
    setLoading(true);
    setError(null);

    let localItems: LocalOperationHistoryItem[] = [];
    if (activeFilter === 'uploader') {
      try {
        localItems = await listLocalOperationHistory();
        setLocalOperations(localItems);
      } catch (caught) {
        console.error('local operation history error:', caught);
        setLocalOperations([]);
      }
    } else {
      setLocalOperations([]);
    }

    try {
      if (navigator.onLine === false) {
        setOperations([]);
        return;
      }

      const { data, error: rpcError } = await supabase.rpc('get_my_operations', {
        p_relation_type: activeFilter,
        p_from: null,
        p_to: null,
        p_limit: 100,
        p_offset: 0
      });

      if (rpcError) throw rpcError;

      const items = data || [];
      const ids = items.map((operation: any) => operation.operation_id).filter(Boolean);
      if (ids.length > 0) {
        const { data: fullOperations, error: fullOperationsError } = await supabase
          .from('operations')
          .select('id, amount, currency, financial_entity, reference_number, structured_data, raw_ai_json')
          .in('id', ids);

        if (!fullOperationsError && fullOperations) {
          setOperations(items.map((item: any) => ({
            ...item,
            ...(fullOperations.find((operation) => operation.id === item.operation_id) || {})
          })));
        } else {
          setOperations(items);
        }
      } else {
        setOperations(items);
      }
    } catch (caught) {
      console.error('get_my_operations error:', caught);
      setOperations([]);
      if (navigator.onLine !== false || localItems.length === 0 || activeFilter === 'verifier') {
        setError('تعذر جلب العمليات من قاعدة سند. أعد المحاولة.');
      }
    } finally {
      setLoading(false);
    }
  }, [activeFilter]);

  useEffect(() => {
    void fetchOperations();
  }, [fetchOperations]);

  useEffect(() => {
    const refreshLocalHistory = () => void fetchOperations();
    window.addEventListener(LOCAL_RUNTIME_STATUS_EVENT, refreshLocalHistory);
    window.addEventListener('online', refreshLocalHistory);
    return () => {
      window.removeEventListener(LOCAL_RUNTIME_STATUS_EVENT, refreshLocalHistory);
      window.removeEventListener('online', refreshLocalHistory);
      closePreview();
    };
  }, [fetchOperations, closePreview]);

  const cloudOperationIds = new Set(operations.map((item) => item.operation_id).filter(Boolean));
  const visibleLocalOperations = activeFilter === 'uploader'
    ? localOperations.filter((item) => !item.operation.cloudOperationId || !cloudOperationIds.has(item.operation.cloudOperationId))
    : [];
  const totalVisible = operations.length + visibleLocalOperations.length;

  return (
    <div className="space-y-6" id="my_operations_view">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold"><ShinyText text="سجل عملياتي" speed={2.4} delay={1.5} color="#0f172a" shineColor="#10b981" spread={110} pauseOnHover /></h1>
          <p className="text-xs text-slate-500 font-arabic">مراجعة الإشعارات التي أرسلتها أو تحققت من صحتها</p>
        </div>
        <button
          onClick={() => void fetchOperations()}
          disabled={loading}
          className="p-2 bg-slate-50 hover:bg-slate-100 rounded-xl text-slate-500 border border-slate-150 transition-all cursor-pointer disabled:opacity-50"
          title="تحديث البيانات"
        >
          <RefreshCcw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

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

      {activeFilter === 'uploader' && navigator.onLine === false && visibleLocalOperations.length > 0 && (
        <div className="p-3.5 bg-amber-50 border border-amber-100 text-amber-900 rounded-2xl text-xs font-arabic flex items-start gap-2.5">
          <CloudOff className="w-4 h-4 mt-0.5 shrink-0" />
          <span>أنت دون اتصال. يعرض سند الآن العمليات المحفوظة على هذا الجهاز، وسيكمل رفعها وتحليلها تلقائيًا عند عودة الإنترنت.</span>
        </div>
      )}

      {loading && totalVisible === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 space-y-3" id="operations_loader">
          <Loader2 className="w-8 h-8 text-emerald-600 animate-spin" />
          <span className="text-xs text-slate-400 font-arabic">جاري تحميل سجل العمليات...</span>
        </div>
      ) : totalVisible === 0 ? (
        <motion.div initial={reduceMotion ? false : { opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-3xl border border-slate-200 shadow-sm p-12 text-center space-y-4" id="empty_operations_state">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-100 text-emerald-600 mb-2">
            <FolderOpen className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-800">لا توجد عمليات مسجلة</h3>
            <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto leading-relaxed font-arabic">
              {activeFilter === 'uploader' ? 'لم ترسل أي إشعار إلى سند بعد.' : 'لم تتحقق من أي إشعار بعد.'}
            </p>
          </div>
        </motion.div>
      ) : (
        <div className="space-y-3.5" id="operations_list">
          {visibleLocalOperations.map((item, index) => (
            <motion.div
              key={item.operation.localId}
              initial={reduceMotion ? false : { opacity: 0, y: 18, scale: .985 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ delay: reduceMotion ? 0 : Math.min(index * .045, .36), duration: .3, ease: [0.22, 1, 0.36, 1] }}
              className="bg-white rounded-2xl border border-amber-100 p-4 shadow-sm space-y-3"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 text-right overflow-hidden min-w-0">
                  <div className="h-12 w-12 shrink-0 rounded-2xl border border-amber-100 bg-amber-50 flex items-center justify-center text-amber-700">
                    <Clock3 className="w-5 h-5" />
                  </div>
                  <div className="overflow-hidden min-w-0">
                    <h3 className="text-xs font-bold text-slate-900 truncate leading-snug">{item.file?.name || 'إشعار مالي محفوظ محليًا'}</h3>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1.5 text-[10px] text-slate-500 font-arabic">
                      <span className="flex items-center gap-1 text-slate-400 font-mono text-[9px] shrink-0">
                        <Calendar className="w-3 h-3 text-slate-300" />
                        <span>{new Date(item.operation.createdAt).toLocaleString('ar-YE')}</span>
                      </span>
                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[8px] font-semibold shrink-0 bg-emerald-50 text-emerald-700">مرسل</span>
                    </div>
                  </div>
                </div>
                {item.operation.publicToken ? (
                  <button
                    onClick={() => onNavigateToDetails(item.operation.publicToken!)}
                    className="px-3.5 py-2 bg-slate-50 hover:bg-emerald-50 text-slate-600 hover:text-emerald-700 border border-slate-200/50 hover:border-emerald-200 rounded-xl text-xs font-semibold transition-all inline-flex items-center gap-1.5 cursor-pointer shrink-0"
                  >
                    <span>تفاصيل</span>
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  </button>
                ) : (
                  <button
                    onClick={() => openLocalPreview(item)}
                    disabled={!item.file}
                    className="px-3.5 py-2 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-100 rounded-xl text-xs font-semibold transition-all inline-flex items-center gap-1.5 cursor-pointer shrink-0 disabled:opacity-50"
                  >
                    <span>عرض الإشعار</span>
                    <Eye className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <div className={`rounded-xl border px-3 py-2 text-[10px] font-semibold font-arabic ${localStatusClass(item)}`}>
                {localStatusLabel(item)}
              </div>
            </motion.div>
          ))}

          {operations.map((item, index) => {
            const card = getOperationCardDetails(item);
            return (
              <motion.div
                key={item.operation_id || item.public_token}
                initial={reduceMotion ? false : { opacity: 0, y: 18, scale: .985 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ delay: reduceMotion ? 0 : Math.min((index + visibleLocalOperations.length) * .045, .36), duration: .3, ease: [0.22, 1, 0.36, 1] }}
                className="bg-white rounded-2xl border border-slate-100 hover:border-emerald-200/50 p-4 shadow-sm flex items-center justify-between gap-4 hover:shadow-md transition-all group"
              >
                <div className="flex items-center gap-3 text-right overflow-hidden min-w-0">
                  <FinancialEntityLogo
                    entity={card.entity}
                    className="h-12 w-12 rounded-2xl border border-slate-100"
                    imageClassName="h-full w-full object-contain p-1.5"
                  />
                  <div className="overflow-hidden min-w-0">
                    <h3 className="text-xs font-bold text-slate-900 truncate leading-snug">{card.title}</h3>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1.5 text-[10px] text-slate-500 font-arabic">
                      {card.amount && (
                        <span className="text-emerald-700 font-bold bg-emerald-50 px-1.5 py-0.5 rounded font-mono text-[9px] border border-emerald-100/30 shrink-0">
                          {card.amount}
                        </span>
                      )}
                      {card.entity && <span className="text-slate-600 truncate max-w-[120px] shrink-0">{card.entity}</span>}
                      {card.refNum && <span className="text-slate-400 font-mono text-[9px] shrink-0">رقم {card.refNum}</span>}
                      <span className="flex items-center gap-1 text-slate-400 font-mono text-[9px] shrink-0">
                        <Calendar className="w-3 h-3 text-slate-300" />
                        <span>{card.dateStr}</span>
                      </span>
                      <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[8px] font-semibold shrink-0 ${
                        item.relation_type === 'uploader'
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-indigo-50 text-indigo-700'
                      }`}>
                        {item.relation_type === 'uploader' ? 'مرسل' : 'مدقق'}
                      </span>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => onNavigateToDetails(item.public_token)}
                  className="px-3.5 py-2 bg-slate-50 hover:bg-emerald-50 text-slate-600 hover:text-emerald-700 border border-slate-200/50 hover:border-emerald-200 rounded-xl text-xs font-semibold transition-all inline-flex items-center gap-1.5 cursor-pointer shrink-0 group-hover:translate-x-0.5"
                >
                  <span>تفاصيل</span>
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </button>
              </motion.div>
            );
          })}
        </div>
      )}

      {preview && (
        <div className="fixed inset-0 z-[100] bg-slate-950/70 backdrop-blur-sm p-4 flex items-center justify-center" onClick={closePreview}>
          <div className="bg-white rounded-3xl w-full max-w-xl max-h-[88vh] overflow-hidden shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-100">
              <div className="min-w-0 text-right">
                <p className="text-sm font-bold text-slate-900 truncate">الإشعار المحفوظ محليًا</p>
                <p className="text-[10px] text-slate-500 truncate">{preview.name}</p>
              </div>
              <button onClick={closePreview} className="w-9 h-9 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center" aria-label="إغلاق">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-3 bg-slate-50 overflow-auto max-h-[75vh]">
              {preview.mimeType.startsWith('image/') ? (
                <img src={preview.url} alt={preview.name} className="w-full h-auto rounded-2xl bg-white object-contain" />
              ) : preview.mimeType === 'application/pdf' ? (
                <iframe src={preview.url} title={preview.name} className="w-full h-[68vh] rounded-2xl bg-white" />
              ) : (
                <div className="p-8 text-center text-xs text-slate-600 font-arabic">الملف محفوظ محليًا وسيتم رفعه إلى سند عند توفر الاتصال.</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

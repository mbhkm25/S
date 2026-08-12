import { motion, useReducedMotion } from 'motion/react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { MyOperationItem } from '../types';
import { Calendar, Loader2, ArrowUpRight, FolderOpen, RefreshCcw, FileText, X, CloudOff, Clock3 } from 'lucide-react';
import { getOperationCardDetails } from '../lib/digits';
import FinancialEntityLogo from './FinancialEntityLogo';
import ShinyText from './ui/ShinyText';
import {
  getLocalOperationFile,
  listLocalOperations,
  type LocalStoredFile,
  type LocalStoredOperation,
} from '../features/local-first/localStore';
import {
  LOCAL_RUNTIME_STATUS_EVENT,
  type LocalRuntimeStatusDetail,
} from '../features/local-first/localRuntimeEvents';

interface MyOperationsProps {
  onNavigateToDetails: (token: string) => void;
}

type FilterType = 'uploader' | 'verifier';

type LocalPreview = {
  operation: LocalStoredOperation;
  file: LocalStoredFile;
  url: string;
};

function localStatusLabel(status: LocalStoredOperation['status']): { label: string; tone: string } {
  switch (status) {
    case 'syncing':
      return { label: 'جاري المزامنة مع سند', tone: 'bg-sky-50 text-sky-700 border-sky-100' };
    case 'synced':
      return { label: 'تمت المزامنة', tone: 'bg-emerald-50 text-emerald-700 border-emerald-100' };
    case 'sync_failed':
      return { label: 'محفوظ محليًا • تعذرت المزامنة', tone: 'bg-rose-50 text-rose-700 border-rose-100' };
    case 'retry_wait':
      return { label: 'محفوظ محليًا • ستتم إعادة المحاولة', tone: 'bg-amber-50 text-amber-700 border-amber-100' };
    default:
      return { label: 'محفوظ محليًا • بانتظار الاتصال', tone: 'bg-amber-50 text-amber-700 border-amber-100' };
  }
}

function formatLocalDate(value: string): string {
  try {
    return new Intl.DateTimeFormat('ar-YE', {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(new Date(value));
  } catch {
    return value;
  }
}

export default function MyOperations({ onNavigateToDetails }: MyOperationsProps) {
  const reduceMotion = useReducedMotion();
  const [operations, setOperations] = useState<MyOperationItem[]>([]);
  const [localOperations, setLocalOperations] = useState<LocalStoredOperation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<FilterType>('uploader');
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' ? true : navigator.onLine !== false);
  const [preview, setPreview] = useState<LocalPreview | null>(null);
  const [previewLoadingId, setPreviewLoadingId] = useState<string | null>(null);

  const refreshLocalOperations = useCallback(async () => {
    if (activeFilter !== 'uploader') {
      setLocalOperations([]);
      return [] as LocalStoredOperation[];
    }
    try {
      const items = await listLocalOperations();
      setLocalOperations(items);
      return items;
    } catch (caught) {
      console.warn('SANAD local operation history unavailable:', caught);
      setLocalOperations([]);
      return [] as LocalStoredOperation[];
    }
  }, [activeFilter]);

  const fetchOperations = useCallback(async () => {
    setLoading(true);
    setError(null);

    await refreshLocalOperations();

    const isOnline = typeof navigator === 'undefined' ? true : navigator.onLine !== false;
    setOnline(isOnline);

    if (!isOnline) {
      setOperations([]);
      setLoading(false);
      return;
    }

    try {
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
      setError('تعذر تحديث سجل سند كلاود حاليًا. العمليات المحفوظة على هذا الجهاز ما زالت متاحة.');
    } finally {
      setLoading(false);
    }
  }, [activeFilter, refreshLocalOperations]);

  useEffect(() => {
    void fetchOperations();
  }, [fetchOperations]);

  useEffect(() => {
    const onOnline = () => {
      setOnline(true);
      void fetchOperations();
    };
    const onOffline = () => {
      setOnline(false);
      void refreshLocalOperations();
    };
    const onLocalRuntimeStatus = (_event: Event) => {
      const event = _event as CustomEvent<LocalRuntimeStatusDetail>;
      void refreshLocalOperations();
      if (event.detail.phase === 'synced') void fetchOperations();
    };

    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    window.addEventListener(LOCAL_RUNTIME_STATUS_EVENT, onLocalRuntimeStatus as EventListener);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener(LOCAL_RUNTIME_STATUS_EVENT, onLocalRuntimeStatus as EventListener);
    };
  }, [fetchOperations, refreshLocalOperations]);

  useEffect(() => () => {
    if (preview?.url) URL.revokeObjectURL(preview.url);
  }, [preview]);

  const visibleLocalOperations = useMemo(() => {
    if (activeFilter !== 'uploader') return [];
    const cloudIds = new Set(operations.map((item: any) => item.operation_id).filter(Boolean));
    return localOperations.filter((item) => !item.cloudOperationId || !cloudIds.has(item.cloudOperationId));
  }, [activeFilter, localOperations, operations]);

  const totalVisible = visibleLocalOperations.length + operations.length;

  const openLocalPreview = async (operation: LocalStoredOperation) => {
    setPreviewLoadingId(operation.localId);
    try {
      const file = await getLocalOperationFile(operation.localId);
      if (!file) {
        setError('تعذر العثور على المستند المحلي لهذه العملية.');
        return;
      }
      if (preview?.url) URL.revokeObjectURL(preview.url);
      const url = URL.createObjectURL(file.blob);
      setPreview({ operation, file, url });
    } catch (caught) {
      console.error('Local operation preview error:', caught);
      setError('تعذر فتح المستند المحلي لهذه العملية.');
    } finally {
      setPreviewLoadingId(null);
    }
  };

  const closePreview = () => {
    if (preview?.url) URL.revokeObjectURL(preview.url);
    setPreview(null);
  };

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

      {!online && activeFilter === 'uploader' && (
        <div className="p-3.5 bg-amber-50 border border-amber-150 text-amber-900 rounded-2xl text-xs font-arabic flex items-center gap-2">
          <CloudOff className="w-4 h-4 shrink-0" />
          <span>أنت غير متصل بالإنترنت. يعرض سند الآن سجل هذا الجهاز، وستكتمل بيانات العمليات والتحليل تلقائيًا عند عودة الاتصال.</span>
        </div>
      )}

      {error && (
        <div className="p-4 bg-rose-50 border border-rose-150 text-rose-800 rounded-2xl text-xs font-arabic">
          {error}
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
          {visibleLocalOperations.map((item, index) => {
            const status = localStatusLabel(item.status);
            return (
              <motion.div
                key={`local-${item.localId}`}
                initial={reduceMotion ? false : { opacity: 0, y: 18, scale: .985 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ delay: reduceMotion ? 0 : Math.min(index * .045, .36), duration: .3, ease: [0.22, 1, 0.36, 1] }}
                className="bg-white rounded-2xl border border-amber-200/70 p-4 shadow-sm flex items-center justify-between gap-4"
              >
                <div className="flex items-center gap-3 text-right overflow-hidden min-w-0">
                  <div className="h-12 w-12 rounded-2xl border border-amber-100 bg-amber-50 text-amber-700 flex items-center justify-center shrink-0">
                    <FileText className="w-6 h-6" />
                  </div>
                  <div className="overflow-hidden min-w-0">
                    <h3 className="text-xs font-bold text-slate-900 truncate leading-snug">إشعار مالي محفوظ على هذا الجهاز</h3>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1.5 text-[10px] text-slate-500 font-arabic">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-semibold border ${status.tone}`}>
                        <Clock3 className="w-3 h-3" />
                        {status.label}
                      </span>
                      <span className="flex items-center gap-1 text-slate-400 text-[9px] shrink-0">
                        <Calendar className="w-3 h-3 text-slate-300" />
                        <span>{formatLocalDate(item.createdAt)}</span>
                      </span>
                    </div>
                    {!item.latestAnalysis && (
                      <p className="text-[10px] text-slate-400 mt-1 font-arabic">لم يتم التحليل بعد. سيبدأ التحليل بعد مزامنة العملية مع سند كلاود.</p>
                    )}
                  </div>
                </div>

                <button
                  onClick={() => void openLocalPreview(item)}
                  disabled={previewLoadingId === item.localId}
                  className="px-3.5 py-2 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-xl text-xs font-semibold transition-all inline-flex items-center gap-1.5 cursor-pointer shrink-0 disabled:opacity-60"
                >
                  {previewLoadingId === item.localId ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />}
                  <span>عرض الإشعار</span>
                </button>
              </motion.div>
            );
          })}

          {operations.map((item, index) => {
            const card = getOperationCardDetails(item);
            return (
              <motion.div
                key={item.operation_id || item.public_token}
                initial={reduceMotion ? false : { opacity: 0, y: 18, scale: .985 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ delay: reduceMotion ? 0 : Math.min((visibleLocalOperations.length + index) * .045, .36), duration: .3, ease: [0.22, 1, 0.36, 1] }}
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
        <div className="fixed inset-0 z-[120] bg-slate-950/65 backdrop-blur-sm p-4 flex items-center justify-center" role="dialog" aria-modal="true" aria-label="معاينة الإشعار المحلي">
          <div className="w-full max-w-lg max-h-[88vh] bg-white rounded-3xl shadow-2xl overflow-hidden border border-white/60 flex flex-col">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-sm font-bold text-slate-900">الإشعار المالي المحفوظ محليًا</h3>
                <p className="text-[10px] text-slate-500 truncate mt-0.5">{preview.file.name}</p>
              </div>
              <button onClick={closePreview} className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center shrink-0" aria-label="إغلاق">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-3 bg-slate-50 overflow-auto flex-1 min-h-0">
              {preview.file.mimeType.startsWith('image/') ? (
                <img src={preview.url} alt="الإشعار المالي المحفوظ محليًا" className="w-full h-auto rounded-2xl bg-white object-contain" />
              ) : preview.file.mimeType === 'application/pdf' ? (
                <iframe src={preview.url} title="الإشعار المالي المحفوظ محليًا" className="w-full h-[68vh] rounded-2xl bg-white" />
              ) : (
                <div className="p-10 text-center text-xs text-slate-600 font-arabic bg-white rounded-2xl">
                  المستند محفوظ على الجهاز، لكن المعاينة الداخلية لهذا النوع غير مدعومة.
                </div>
              )}
            </div>
            <div className="px-4 py-3 border-t border-slate-100 bg-white">
              <p className="text-[11px] text-slate-600 font-arabic leading-relaxed">
                هذه نسخة محلية من الإشعار. بيانات المبلغ والجهة والمرجع والتحليل ستظهر بعد اتصال الجهاز بالإنترنت ومزامنة العملية مع سند كلاود.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
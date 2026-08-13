import { motion, useReducedMotion } from 'motion/react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Calendar, Loader2, ArrowUpRight, FolderOpen, RefreshCcw, FileText, CloudOff, Clock3, ChevronUp } from 'lucide-react';
import { getOperationCardDetails } from '../lib/digits';
import FinancialEntityLogo from './FinancialEntityLogo';
import ShinyText from './ui/ShinyText';
import TouchZoomImage from './TouchZoomImage';
import {
  getLocalOperationFile,
  listLocalOperationsForUser,
  type LocalStoredFile,
  type LocalStoredOperation,
} from '../features/local-first/localStore';
import {
  LOCAL_RUNTIME_STATUS_EVENT,
  type LocalRuntimeStatusDetail,
} from '../features/local-first/localRuntimeEvents';
import {
  DEVICE_LEDGER_UPDATED_EVENT,
  listDeviceOperationSnapshots,
  pullCloudOperationsIntoDeviceLedger,
  type DeviceOperationSnapshot,
  type DeviceLedgerRelation,
} from '../features/local-first/deviceOperationLedger';
import { drainLocalSyncQueue } from '../features/local-first/syncEngine';

interface MyOperationsProps {
  userId: string;
  onNavigateToDetails: (token: string) => void;
}

type FilterType = DeviceLedgerRelation;

type LocalPreview = {
  operation: LocalStoredOperation;
  file: LocalStoredFile;
  url: string;
};

function localStatusLabel(operation: LocalStoredOperation): { label: string; tone: string } {
  if (operation.cloudOperationId || operation.status === 'synced') {
    return { label: 'تمت المزامنة', tone: 'bg-emerald-50 text-emerald-700 border-emerald-100' };
  }
  switch (operation.status) {
    case 'syncing':
      return { label: 'جاري المزامنة مع سند', tone: 'bg-sky-50 text-sky-700 border-sky-100' };
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
    return new Intl.DateTimeFormat('ar-YE', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
  } catch {
    return value;
  }
}

export default function MyOperations({ userId, onNavigateToDetails }: MyOperationsProps) {
  const reduceMotion = useReducedMotion();
  const [operations, setOperations] = useState<DeviceOperationSnapshot[]>([]);
  const [localOperations, setLocalOperations] = useState<LocalStoredOperation[]>([]);
  const [loadingDevice, setLoadingDevice] = useState(true);
  const [refreshingCloud, setRefreshingCloud] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<FilterType>('uploader');
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' ? true : navigator.onLine !== false);
  const [preview, setPreview] = useState<LocalPreview | null>(null);
  const [previewLoadingId, setPreviewLoadingId] = useState<string | null>(null);

  const loadDeviceLedger = useCallback(async () => {
    try {
      const [cachedCloud, local] = await Promise.all([
        listDeviceOperationSnapshots(userId, activeFilter),
        activeFilter === 'uploader' ? listLocalOperationsForUser(userId) : Promise.resolve([] as LocalStoredOperation[]),
      ]);
      setOperations(cachedCloud);
      setLocalOperations(local);
    } catch (caught) {
      console.warn('SANAD device operation ledger unavailable:', caught);
      setError('تعذر قراءة سجل العمليات المحفوظ على هذا الجهاز.');
    } finally {
      setLoadingDevice(false);
    }
  }, [activeFilter, userId]);

  const refreshFromCloud = useCallback(async () => {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
    setRefreshingCloud(true);
    setError(null);
    try {
      if (activeFilter === 'uploader') await drainLocalSyncQueue();
      const snapshots = await pullCloudOperationsIntoDeviceLedger(userId, activeFilter);
      setOperations(snapshots);
      if (activeFilter === 'uploader') setLocalOperations(await listLocalOperationsForUser(userId));
    } catch (caught) {
      console.warn('SANAD cloud ledger refresh failed:', caught);
      setError('تعذر تحديث سجل سند كلاود الآن. يعرض سند آخر نسخة محفوظة على هذا الجهاز.');
    } finally {
      setRefreshingCloud(false);
    }
  }, [activeFilter, userId]);

  useEffect(() => {
    setLoadingDevice(true);
    void loadDeviceLedger().then(() => {
      if (navigator.onLine !== false) void refreshFromCloud();
    });
  }, [loadDeviceLedger, refreshFromCloud]);

  useEffect(() => {
    const onOnline = () => {
      setOnline(true);
      void refreshFromCloud();
    };
    const onOffline = () => {
      setOnline(false);
      void loadDeviceLedger();
    };
    const onLocalRuntimeStatus = (rawEvent: Event) => {
      const event = rawEvent as CustomEvent<LocalRuntimeStatusDetail>;
      if (activeFilter === 'uploader') {
        void listLocalOperationsForUser(userId).then(setLocalOperations);
      }
      if (event.detail.phase === 'synced' && navigator.onLine !== false) void refreshFromCloud();
    };
    const onDeviceLedgerUpdated = () => void loadDeviceLedger();

    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    window.addEventListener(LOCAL_RUNTIME_STATUS_EVENT, onLocalRuntimeStatus as EventListener);
    window.addEventListener(DEVICE_LEDGER_UPDATED_EVENT, onDeviceLedgerUpdated);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener(LOCAL_RUNTIME_STATUS_EVENT, onLocalRuntimeStatus as EventListener);
      window.removeEventListener(DEVICE_LEDGER_UPDATED_EVENT, onDeviceLedgerUpdated);
    };
  }, [activeFilter, loadDeviceLedger, refreshFromCloud, userId]);

  useEffect(() => () => {
    if (preview?.url) URL.revokeObjectURL(preview.url);
  }, [preview]);

  const visibleLocalOperations = useMemo(() => {
    if (activeFilter !== 'uploader') return [];
    const cloudIds = new Set(operations.map((item) => item.operation_id).filter(Boolean));
    return localOperations.filter((item) => !item.cloudOperationId || !cloudIds.has(item.cloudOperationId));
  }, [activeFilter, localOperations, operations]);

  const totalVisible = visibleLocalOperations.length + operations.length;

  const toggleLocalPreview = async (operation: LocalStoredOperation) => {
    if (preview?.operation.localId === operation.localId) {
      URL.revokeObjectURL(preview.url);
      setPreview(null);
      return;
    }
    setPreviewLoadingId(operation.localId);
    try {
      const file = await getLocalOperationFile(operation.localId);
      if (!file) {
        setError('تعذر العثور على المستند المحلي لهذه العملية.');
        return;
      }
      if (preview?.url) URL.revokeObjectURL(preview.url);
      setPreview({ operation, file, url: URL.createObjectURL(file.blob) });
    } catch (caught) {
      console.error('Local operation preview error:', caught);
      setError('تعذر فتح المستند المحلي لهذه العملية.');
    } finally {
      setPreviewLoadingId(null);
    }
  };

  return (
    <div className="space-y-6" id="my_operations_view">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold"><ShinyText text="سجل عملياتي" speed={2.4} delay={1.5} color="#0f172a" shineColor="#10b981" spread={110} pauseOnHover /></h1>
          <p className="text-xs text-slate-500 font-arabic">يعرض سند سجل هذا الجهاز فورًا ويحدّثه من الكلاود في الخلفية</p>
        </div>
        <button
          onClick={() => void refreshFromCloud()}
          disabled={refreshingCloud || !online}
          className="p-2 bg-slate-50 hover:bg-slate-100 rounded-xl text-slate-500 border border-slate-150 transition-all cursor-pointer disabled:opacity-40"
          title="مزامنة سجل العمليات"
        >
          <RefreshCcw className={`w-4 h-4 ${refreshingCloud ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="flex bg-slate-100 p-1 rounded-2xl border border-slate-150" id="filter_tabs">
        <button onClick={() => setActiveFilter('uploader')} className={`flex-1 py-2.5 text-xs font-bold rounded-xl transition-all cursor-pointer text-center font-arabic ${activeFilter === 'uploader' ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>
          عمليات أرسلتها إلى سند
        </button>
        <button onClick={() => setActiveFilter('verifier')} className={`flex-1 py-2.5 text-xs font-bold rounded-xl transition-all cursor-pointer text-center font-arabic ${activeFilter === 'verifier' ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>
          عمليات تم التحقق منها
        </button>
      </div>

      {!online && (
        <div className="p-3 bg-slate-50 border border-slate-150 text-slate-600 rounded-2xl text-[10px] font-arabic flex items-center gap-2">
          <CloudOff className="w-4 h-4 shrink-0" />
          <span>أنت دون اتصال. السجل الظاهر هو النسخة المحفوظة على هذا الجهاز وسيُحدّث تلقائيًا عند عودة الإنترنت.</span>
        </div>
      )}

      {error && <div className="p-3 bg-amber-50 border border-amber-100 text-amber-800 rounded-2xl text-[10px] font-arabic">{error}</div>}

      {loadingDevice && totalVisible === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 space-y-3" id="operations_loader">
          <Loader2 className="w-7 h-7 text-emerald-600 animate-spin" />
          <span className="text-xs text-slate-400 font-arabic">جاري فتح سجل هذا الجهاز...</span>
        </div>
      ) : totalVisible === 0 ? (
        <motion.div initial={reduceMotion ? false : { opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-3xl border border-slate-200 shadow-sm p-12 text-center space-y-4" id="empty_operations_state">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-100 text-emerald-600 mb-2"><FolderOpen className="w-6 h-6" /></div>
          <div>
            <h3 className="text-sm font-bold text-slate-800">لا توجد عمليات محفوظة</h3>
            <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto leading-relaxed font-arabic">
              {activeFilter === 'uploader' ? 'لم ترسل أي إشعار إلى سند بعد.' : 'لم تُحفظ بعد أي عملية تحققت منها على هذا الجهاز.'}
            </p>
          </div>
          {refreshingCloud && <p className="text-[10px] text-slate-400">جاري تحديث النسخة المحلية من سند كلاود…</p>}
        </motion.div>
      ) : (
        <div className="space-y-3.5" id="operations_list">
          {visibleLocalOperations.map((item, index) => {
            const status = localStatusLabel(item);
            const expanded = preview?.operation.localId === item.localId;
            return (
              <div key={`local-${item.localId}`} className="space-y-2">
                <motion.div
                  initial={reduceMotion ? false : { opacity: 0, y: 18, scale: .985 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ delay: reduceMotion ? 0 : Math.min(index * .045, .36), duration: .3, ease: [0.22, 1, 0.36, 1] }}
                  className="bg-white rounded-2xl border border-amber-200/70 p-4 shadow-sm flex items-center justify-between gap-4"
                >
                  <div className="flex items-center gap-3 text-right overflow-hidden min-w-0">
                    <div className="h-12 w-12 rounded-2xl border border-amber-100 bg-amber-50 text-amber-700 flex items-center justify-center shrink-0"><FileText className="w-6 h-6" /></div>
                    <div className="overflow-hidden min-w-0">
                      <h3 className="text-xs font-bold text-slate-900 truncate leading-snug">إشعار مالي محفوظ على هذا الجهاز</h3>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1.5 text-[10px] text-slate-500 font-arabic">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-semibold border ${status.tone}`}><Clock3 className="w-3 h-3" />{status.label}</span>
                        <span className="flex items-center gap-1 text-slate-400 text-[9px] shrink-0"><Calendar className="w-3 h-3 text-slate-300" /><span>{formatLocalDate(item.createdAt)}</span></span>
                      </div>
                      {!item.latestAnalysis && <p className="text-[10px] text-slate-400 mt-1 font-arabic">الإشعار محفوظ. سيكتمل التحليل بعد مزامنته مع سند كلاود.</p>}
                    </div>
                  </div>
                  <button onClick={() => void toggleLocalPreview(item)} disabled={previewLoadingId === item.localId} className="px-3.5 py-2 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-xl text-xs font-semibold transition-all inline-flex items-center gap-1.5 cursor-pointer shrink-0 disabled:opacity-60">
                    {previewLoadingId === item.localId ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <FileText className="w-3.5 h-3.5" />}
                    <span>{expanded ? 'إخفاء' : 'عرض الإشعار'}</span>
                  </button>
                </motion.div>

                {expanded && preview && (
                  <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm" aria-label="الإشعار المالي المحفوظ محليًا">
                    <div className="mb-3 text-right">
                      <h3 className="text-xs font-bold text-slate-900">الإشعار المالي</h3>
                      <p className="mt-0.5 truncate text-[9px] text-slate-400">{preview.file.name}</p>
                    </div>
                    {preview.file.mimeType.startsWith('image/') ? (
                      <TouchZoomImage src={preview.url} alt="الإشعار المالي المحفوظ على الجهاز" />
                    ) : preview.file.mimeType === 'application/pdf' ? (
                      <iframe src={preview.url} title="الإشعار المالي المحفوظ على الجهاز" className="h-[65vh] w-full rounded-2xl bg-slate-50" />
                    ) : (
                      <div className="rounded-2xl bg-slate-50 p-8 text-center text-xs text-slate-600">المستند محفوظ على الجهاز، لكن هذا النوع لا يدعم المعاينة الداخلية.</div>
                    )}
                    <p className="mt-3 text-[10px] leading-5 text-slate-500">هذه هي النسخة الأصلية المحفوظة على الجهاز. لا يحتاج عرضها إلى اتصال بالإنترنت.</p>
                  </section>
                )}
              </div>
            );
          })}

          {operations.map((item, index) => {
            const card = getOperationCardDetails(item);
            return (
              <motion.div key={item.operation_id || item.public_token} initial={reduceMotion ? false : { opacity: 0, y: 18, scale: .985 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ delay: reduceMotion ? 0 : Math.min((visibleLocalOperations.length + index) * .045, .36), duration: .3, ease: [0.22, 1, 0.36, 1] }} className="bg-white rounded-2xl border border-slate-100 hover:border-emerald-200/50 p-4 shadow-sm flex items-center justify-between gap-4 hover:shadow-md transition-all group">
                <div className="flex items-center gap-3 text-right overflow-hidden min-w-0">
                  <FinancialEntityLogo entity={card.entity} className="h-12 w-12 rounded-2xl border border-slate-100" imageClassName="h-full w-full object-contain p-1.5" />
                  <div className="overflow-hidden min-w-0">
                    <h3 className="text-xs font-bold text-slate-900 truncate leading-snug">{card.title}</h3>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1.5 text-[10px] text-slate-500 font-arabic">
                      {card.amount && <span className="text-emerald-700 font-bold bg-emerald-50 px-1.5 py-0.5 rounded font-mono text-[9px] border border-emerald-100/30 shrink-0">{card.amount}</span>}
                      {card.entity && <span className="text-slate-600 truncate max-w-[120px] shrink-0">{card.entity}</span>}
                      {card.refNum && <span className="text-slate-400 font-mono text-[9px] shrink-0">رقم {card.refNum}</span>}
                      <span className="flex items-center gap-1 text-slate-400 font-mono text-[9px] shrink-0"><Calendar className="w-3 h-3 text-slate-300" /><span>{card.dateStr}</span></span>
                      <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[8px] font-semibold shrink-0 ${item.relation_type === 'uploader' ? 'bg-emerald-50 text-emerald-700' : 'bg-indigo-50 text-indigo-700'}`}>{item.relation_type === 'uploader' ? 'مرسل' : 'مدقق'}</span>
                    </div>
                  </div>
                </div>
                <button onClick={() => onNavigateToDetails(item.public_token)} className="px-3.5 py-2 bg-slate-50 hover:bg-emerald-50 text-slate-600 hover:text-emerald-700 border border-slate-200/50 hover:border-emerald-200 rounded-xl text-xs font-semibold transition-all inline-flex items-center gap-1.5 cursor-pointer shrink-0 group-hover:translate-x-0.5">
                  <span>تفاصيل</span><ArrowUpRight className="w-3.5 h-3.5" />
                </button>
              </motion.div>
            );
          })}
        </div>
      )}

      {refreshingCloud && totalVisible > 0 && <p className="text-center text-[9px] text-slate-400">يحدّث سند السجل من الكلاود في الخلفية دون إيقاف العرض.</p>}
    </div>
  );
}

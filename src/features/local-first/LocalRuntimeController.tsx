import { useEffect, useMemo, useRef, useState } from 'react';
import { BellRing, CloudOff, RefreshCw, Settings2, ShieldCheck, TriangleAlert, UploadCloud, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { drainLocalSyncQueue, installReconnectSyncListener } from './syncEngine';
import { localOperationRepository } from './localOperationRepository';
import { ingestNativeFinancialNotification, type NativeFinancialNotificationPayload } from './notificationIntake';
import {
  LOCAL_RUNTIME_STATUS_EVENT,
  emitLocalRuntimeStatus,
  type LocalRuntimeStatusDetail,
} from './localRuntimeEvents';

type SeenNotificationApp = {
  packageName: string;
  appLabel: string;
  lastSeenAt: number;
};

declare global {
  interface Window {
    AndroidLocalRuntime?: {
      scheduleRecovery?: () => void;
      consumeRecoveryDue?: () => boolean;
      getLatestFinancialNotification?: () => string | null;
      clearLatestFinancialNotification?: () => void;
      isNotificationAccessEnabled?: () => boolean;
      openNotificationAccessSettings?: () => void;
      canDrawOverlays?: () => boolean;
      openOverlaySettings?: () => void;
      setMonitoredPackages?: (packagesJson: string) => void;
      getMonitoredPackages?: () => string | null;
      getSeenNotificationApps?: () => string | null;
      clearSeenNotificationApps?: () => void;
    };
  }
}

function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}

async function activeIdentity() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return null;
  const { data: profile } = await supabase
    .from('profiles')
    .select('phone, full_name')
    .eq('id', session.user.id)
    .maybeSingle();
  return {
    userId: session.user.id,
    phone: profile?.phone ?? null,
    name: profile?.full_name ?? null,
  };
}

async function consumeNativeFinancialNotification(): Promise<void> {
  const bridge = window.AndroidLocalRuntime;
  const raw = bridge?.getLatestFinancialNotification?.();
  if (!raw) return;

  let payload: NativeFinancialNotificationPayload;
  try {
    payload = JSON.parse(raw) as NativeFinancialNotificationPayload;
  } catch (error) {
    console.warn('SANAD local-first: invalid native notification payload', error);
    bridge?.clearLatestFinancialNotification?.();
    return;
  }

  const identity = await activeIdentity();
  if (!identity) {
    emitLocalRuntimeStatus({
      phase: 'review_required',
      message: 'وصل إشعار مالي إلى سند. افتح حسابك لاستكمال حفظه المحلي.',
    });
    return;
  }

  await ingestNativeFinancialNotification({
    payload,
    submittedByUserId: identity.userId,
    submittedByPhone: identity.phone,
    submittedByName: identity.name,
  });
  bridge?.clearLatestFinancialNotification?.();
}

export default function LocalRuntimeController() {
  const [status, setStatus] = useState<LocalRuntimeStatusDetail | null>(null);
  const [setupOpen, setSetupOpen] = useState(false);
  const [notificationAccess, setNotificationAccess] = useState(false);
  const [overlayAccess, setOverlayAccess] = useState(false);
  const [seenApps, setSeenApps] = useState<SeenNotificationApp[]>([]);
  const [monitoredPackages, setMonitoredPackages] = useState<string[]>([]);
  const offlineInputRef = useRef<HTMLInputElement>(null);
  const bridgeAvailable = typeof window !== 'undefined' && Boolean(window.AndroidLocalRuntime);

  const refreshNativeSettings = () => {
    const bridge = window.AndroidLocalRuntime;
    if (!bridge) return;
    setNotificationAccess(Boolean(bridge.isNotificationAccessEnabled?.()));
    setOverlayAccess(Boolean(bridge.canDrawOverlays?.()));
    setMonitoredPackages(parseJson<string[]>(bridge.getMonitoredPackages?.(), []));
    const seenObject = parseJson<Record<string, SeenNotificationApp>>(bridge.getSeenNotificationApps?.(), {});
    setSeenApps(Object.values(seenObject).sort((a, b) => (b.lastSeenAt || 0) - (a.lastSeenAt || 0)));
  };

  useEffect(() => {
    const uninstallReconnect = installReconnectSyncListener();

    const onStatus = (event: Event) => {
      const detail = (event as CustomEvent<LocalRuntimeStatusDetail>).detail;
      if (!detail) return;
      setStatus(detail);
      if (detail.phase === 'synced' || detail.phase === 'notification_captured') {
        window.setTimeout(() => setStatus((current) => current?.timestamp === detail.timestamp ? null : current), 4500);
      }
    };

    const onOffline = () => emitLocalRuntimeStatus({
      phase: 'offline',
      message: 'سند يعمل محليًا الآن. يمكنك حفظ المستند وسيُزامن عند عودة الإنترنت.',
    });

    const onOnline = () => {
      emitLocalRuntimeStatus({ phase: 'syncing', message: 'عاد الاتصال. سند يراجع العمليات المحلية للمزامنة…' });
      void drainLocalSyncQueue()
        .then(({ attempted }) => emitLocalRuntimeStatus({
          phase: 'synced',
          message: attempted > 0 ? 'اكتملت محاولة مزامنة العمليات المحلية.' : 'الاتصال متاح ولا توجد عمليات معلقة للمزامنة.',
        }))
        .catch((error) => {
          console.warn('SANAD local-first reconnect drain failed', error);
          emitLocalRuntimeStatus({ phase: 'error', message: 'تعذر إكمال المزامنة الآن. سيعيد سند المحاولة تلقائيًا.' });
        });
    };

    const onNativeRecovery = () => void onOnline();
    const onNativeNotification = () => void consumeNativeFinancialNotification().catch((error) => {
      console.warn('SANAD financial notification intake failed', error);
      emitLocalRuntimeStatus({ phase: 'error', message: 'وصل إشعار مالي لكن تعذر حفظه محليًا.' });
    });

    window.addEventListener(LOCAL_RUNTIME_STATUS_EVENT, onStatus);
    window.addEventListener('offline', onOffline);
    window.addEventListener('online', onOnline);
    window.addEventListener('sanadNativeLocalRecovery', onNativeRecovery);
    window.addEventListener('sanadFinancialNotificationReady', onNativeNotification);

    if (!navigator.onLine) onOffline();
    if (window.AndroidLocalRuntime?.consumeRecoveryDue?.()) onNativeRecovery();
    void consumeNativeFinancialNotification().catch(() => undefined);
    refreshNativeSettings();

    const onVisibility = () => {
      if (document.visibilityState !== 'visible') return;
      refreshNativeSettings();
      if (window.AndroidLocalRuntime?.consumeRecoveryDue?.()) onNativeRecovery();
      void consumeNativeFinancialNotification().catch(() => undefined);
      if (navigator.onLine) void drainLocalSyncQueue().catch(() => undefined);
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      uninstallReconnect();
      window.removeEventListener(LOCAL_RUNTIME_STATUS_EVENT, onStatus);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('sanadNativeLocalRecovery', onNativeRecovery);
      window.removeEventListener('sanadFinancialNotificationReady', onNativeNotification);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  const selectedPackages = useMemo(() => new Set(monitoredPackages), [monitoredPackages]);

  const togglePackage = (packageName: string) => {
    setMonitoredPackages((current) => current.includes(packageName)
      ? current.filter((value) => value !== packageName)
      : [...current, packageName]);
  };

  const saveMonitorSelection = () => {
    window.AndroidLocalRuntime?.setMonitoredPackages?.(JSON.stringify(monitoredPackages));
    emitLocalRuntimeStatus({
      phase: 'synced',
      message: monitoredPackages.length
        ? `تم تفعيل الالتقاط المحلي لـ ${monitoredPackages.length} تطبيق مالي.`
        : 'تم إيقاف التقاط محتوى إشعارات التطبيقات.',
    });
    setSetupOpen(false);
  };

  const handleOfflineFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const isSupported = file.type.startsWith('image/') || file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    if (!isSupported) {
      emitLocalRuntimeStatus({ phase: 'error', message: 'اختر صورة أو ملف PDF لإشعار الدفع.' });
      return;
    }

    try {
      const identity = await activeIdentity();
      if (!identity) throw new Error('session_required');
      const operation = await localOperationRepository.create({
        source: 'file',
        submittedByUserId: identity.userId,
        submittedByPhone: identity.phone,
        submittedByName: identity.name,
        file,
        clientMetadata: {
          offline_intake: true,
          captured_at: new Date().toISOString(),
          user_agent: navigator.userAgent,
        },
      });
      await localOperationRepository.queueForCloud(operation);
      emitLocalRuntimeStatus({
        phase: 'queued',
        message: 'تم حفظ المستند على هذا الجهاز. لن يضيع وسيُزامن عند عودة الإنترنت.',
        localId: operation.identity.localId,
      });
    } catch (error) {
      console.warn('SANAD offline intake failed', error);
      emitLocalRuntimeStatus({ phase: 'error', message: 'تعذر حفظ المستند محليًا. حاول مرة أخرى.' });
    }
  };

  const Icon = status?.phase === 'offline'
    ? CloudOff
    : status?.phase === 'error' || status?.phase === 'review_required'
      ? TriangleAlert
      : status?.phase === 'syncing' || status?.phase === 'queued'
        ? RefreshCw
        : ShieldCheck;

  return (
    <>
      <input
        ref={offlineInputRef}
        type="file"
        accept="image/*,application/pdf"
        className="hidden"
        onChange={handleOfflineFile}
      />

      {status && (
        <div className="pointer-events-none fixed inset-x-0 top-3 z-[9999] flex justify-center px-3" dir="rtl">
          <div className="pointer-events-auto flex max-w-md items-center gap-2 rounded-2xl border border-slate-200 bg-white/95 px-3 py-2.5 text-[11px] font-bold text-slate-800 shadow-xl backdrop-blur">
            <Icon className={`h-4 w-4 shrink-0 ${status.phase === 'syncing' ? 'animate-spin' : ''}`} />
            <span className="flex-1">{status.message}</span>
            {status.phase === 'offline' && (
              <button
                type="button"
                onClick={() => offlineInputRef.current?.click()}
                className="flex shrink-0 items-center gap-1 rounded-xl bg-slate-950 px-2.5 py-1.5 text-[10px] text-white"
              >
                <UploadCloud className="h-3.5 w-3.5" /> حفظ محليًا
              </button>
            )}
          </div>
        </div>
      )}

      {bridgeAvailable && (
        <button
          type="button"
          onClick={() => { refreshNativeSettings(); setSetupOpen(true); }}
          className="fixed bottom-20 end-3 z-[9997] flex h-10 items-center gap-1.5 rounded-full border border-slate-200 bg-white/95 px-3 text-[10px] font-bold text-slate-700 shadow-lg backdrop-blur"
          dir="rtl"
          aria-label="إعدادات سند المحلي"
        >
          <Settings2 className="h-3.5 w-3.5" /> المحلي
        </button>
      )}

      {setupOpen && bridgeAvailable && (
        <div className="fixed inset-0 z-[10000] flex items-end justify-center bg-slate-950/40 p-3 sm:items-center" dir="rtl">
          <section className="max-h-[82vh] w-full max-w-md overflow-y-auto rounded-[1.7rem] bg-white p-4 shadow-2xl">
            <header className="mb-4 flex items-start justify-between gap-3">
              <div className="text-right">
                <h2 className="text-sm font-black text-slate-950">سند المحلي على Android</h2>
                <p className="mt-1 text-[10px] leading-5 text-slate-500">الالتقاط من الإشعارات اختياري، ولا يقرأ سند محتوى أي تطبيق قبل اختياره صراحة.</p>
              </div>
              <button type="button" onClick={() => setSetupOpen(false)} className="rounded-xl bg-slate-100 p-2 text-slate-600"><X className="h-4 w-4" /></button>
            </header>

            <div className="space-y-3">
              <div className="rounded-2xl border border-slate-100 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-right">
                    <strong className="block text-[11px] text-slate-900">الوصول إلى الإشعارات</strong>
                    <span className="text-[9px] text-slate-500">{notificationAccess ? 'مفعّل' : 'غير مفعّل'}</span>
                  </div>
                  {!notificationAccess && <button type="button" onClick={() => window.AndroidLocalRuntime?.openNotificationAccessSettings?.()} className="rounded-xl bg-slate-950 px-3 py-2 text-[10px] font-bold text-white">تفعيل</button>}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-100 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-right">
                    <strong className="block text-[11px] text-slate-900">أيقونة سند العائمة</strong>
                    <span className="text-[9px] text-slate-500">{overlayAccess ? 'مسموح بها' : 'تحتاج إذن الظهور فوق التطبيقات'}</span>
                  </div>
                  {!overlayAccess && <button type="button" onClick={() => window.AndroidLocalRuntime?.openOverlaySettings?.()} className="rounded-xl bg-slate-100 px-3 py-2 text-[10px] font-bold text-slate-800">السماح</button>}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-100 p-3">
                <div className="mb-2 flex items-center gap-2 text-right">
                  <BellRing className="h-4 w-4 text-emerald-600" />
                  <div>
                    <strong className="block text-[11px] text-slate-900">التطبيقات التي سيقرأ سند إشعاراتها</strong>
                    <span className="text-[9px] text-slate-500">تظهر التطبيقات هنا بعد إصدارها إشعارًا واحدًا. قبل اختيارها لا يُحفظ محتوى الإشعار.</span>
                  </div>
                </div>
                {seenApps.length ? (
                  <div className="space-y-2">
                    {seenApps.slice(0, 20).map((app) => (
                      <label key={app.packageName} className="flex cursor-pointer items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2">
                        <div className="min-w-0 text-right">
                          <strong className="block truncate text-[10px] text-slate-800">{app.appLabel || app.packageName}</strong>
                          <span className="block truncate font-mono text-[8px] text-slate-400" dir="ltr">{app.packageName}</span>
                        </div>
                        <input type="checkbox" checked={selectedPackages.has(app.packageName)} onChange={() => togglePackage(app.packageName)} className="h-4 w-4" />
                      </label>
                    ))}
                  </div>
                ) : (
                  <p className="rounded-xl bg-slate-50 px-3 py-3 text-[9px] leading-5 text-slate-500">بعد تفعيل وصول الإشعارات استخدم تطبيقك المالي بشكل طبيعي. سيظهر اسمه هنا للاختيار، دون حفظ محتوى إشعاراته قبل الموافقة.</p>
                )}
              </div>

              <button type="button" onClick={saveMonitorSelection} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 py-3 text-[11px] font-bold text-white">
                <ShieldCheck className="h-4 w-4" /> حفظ إعدادات الالتقاط المحلي
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}

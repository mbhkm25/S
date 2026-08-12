import { useEffect, useState } from 'react';
import { CloudOff, RefreshCw, ShieldCheck, TriangleAlert } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { drainLocalSyncQueue, installReconnectSyncListener } from './syncEngine';
import { ingestNativeFinancialNotification, type NativeFinancialNotificationPayload } from './notificationIntake';
import {
  LOCAL_RUNTIME_STATUS_EVENT,
  emitLocalRuntimeStatus,
  type LocalRuntimeStatusDetail,
} from './localRuntimeEvents';

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
    };
  }
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

  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) {
    emitLocalRuntimeStatus({
      phase: 'review_required',
      message: 'وصل إشعار مالي إلى سند. افتح حسابك لاستكمال حفظه المحلي.',
    });
    return;
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('phone, full_name')
    .eq('id', session.user.id)
    .maybeSingle();

  await ingestNativeFinancialNotification({
    payload,
    submittedByUserId: session.user.id,
    submittedByPhone: profile?.phone ?? null,
    submittedByName: profile?.full_name ?? null,
  });
  bridge?.clearLatestFinancialNotification?.();
}

export default function LocalRuntimeController() {
  const [status, setStatus] = useState<LocalRuntimeStatusDetail | null>(null);

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
      message: 'سند يعمل محليًا الآن. ستبقى عملياتك محفوظة حتى عودة الإنترنت.',
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

    const onVisibility = () => {
      if (document.visibilityState !== 'visible') return;
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

  if (!status) return null;

  const Icon = status.phase === 'offline'
    ? CloudOff
    : status.phase === 'error' || status.phase === 'review_required'
      ? TriangleAlert
      : status.phase === 'syncing' || status.phase === 'queued'
        ? RefreshCw
        : ShieldCheck;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-[9999] flex justify-center px-3" dir="rtl">
      <div className="pointer-events-auto flex max-w-md items-center gap-2 rounded-2xl border border-slate-200 bg-white/95 px-3 py-2.5 text-[11px] font-bold text-slate-800 shadow-xl backdrop-blur">
        <Icon className={`h-4 w-4 shrink-0 ${status.phase === 'syncing' ? 'animate-spin' : ''}`} />
        <span>{status.message}</span>
      </div>
    </div>
  );
}

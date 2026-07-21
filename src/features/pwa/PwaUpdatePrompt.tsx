import { useEffect, useRef, useState } from 'react';
import { RefreshCw, Sparkles, X } from 'lucide-react';
import { useRegisterSW } from 'virtual:pwa-register/react';

const UPDATE_INTERVAL_MS = 60 * 60 * 1000;

export default function PwaUpdatePrompt() {
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [updateError, setUpdateError] = useState(false);
  const reloadRequestedRef = useRef(false);

  const {
    needRefresh: [needRefresh],
    updateServiceWorker
  } = useRegisterSW({
    immediate: true,
    onRegisteredSW(_url, currentRegistration) {
      setRegistration(currentRegistration || null);
    },
    onRegisterError(error) {
      console.error('[SANAD PWA] Service worker registration failed', error);
    },
    onNeedReload() {
      if (reloadRequestedRef.current) return;
      reloadRequestedRef.current = true;
      window.location.reload();
    }
  });

  useEffect(() => {
    if (!registration) return;

    const checkForUpdate = () => {
      if (document.visibilityState !== 'visible' || !navigator.onLine) return;
      registration.update().catch(error => {
        console.warn('[SANAD PWA] Update check failed', error);
      });
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') checkForUpdate();
    };

    window.addEventListener('online', checkForUpdate);
    document.addEventListener('visibilitychange', handleVisibility);
    const timer = window.setInterval(checkForUpdate, UPDATE_INTERVAL_MS);

    return () => {
      window.removeEventListener('online', checkForUpdate);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.clearInterval(timer);
    };
  }, [registration]);

  useEffect(() => {
    if (needRefresh) {
      setDismissed(false);
      setUpdateError(false);
    }
  }, [needRefresh]);

  if (!needRefresh || dismissed) return null;

  const installUpdate = async () => {
    if (updating) return;
    setUpdating(true);
    setUpdateError(false);
    try {
      await updateServiceWorker(true);
    } catch (error) {
      console.error('[SANAD PWA] Failed to activate update', error);
      setUpdateError(true);
      setUpdating(false);
    }
  };

  return (
    <aside
      className="fixed inset-x-0 top-0 z-[120] px-3 pt-[calc(0.75rem+env(safe-area-inset-top,0px))] font-arabic"
      role="alert"
      aria-live="polite"
      aria-label="تحديث تطبيق سند"
    >
      <div className="mx-auto flex max-w-2xl items-center gap-3 rounded-2xl border border-emerald-200/80 bg-white/95 p-3 shadow-[0_18px_55px_rgba(15,23,42,0.20)] backdrop-blur-xl">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-emerald-50 text-emerald-700">
          <Sparkles className="h-5 w-5" aria-hidden="true" />
        </div>

        <div className="min-w-0 flex-1 text-right">
          <p className="text-xs font-extrabold text-slate-900">نسخة جديدة من سند متاحة</p>
          <p className="mt-0.5 text-[10px] leading-5 text-slate-500">
            حدّث الآن للحصول على آخر التحسينات. احفظ أي عمل مفتوح قبل التحديث.
          </p>
          {updateError && (
            <p className="mt-1 text-[10px] font-bold text-rose-600">تعذر إكمال التحديث. تحقق من الاتصال وحاول مجددًا.</p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={installUpdate}
            disabled={updating}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-slate-950 px-3 text-[10px] font-extrabold text-white disabled:cursor-wait disabled:opacity-60"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${updating ? 'animate-spin' : ''}`} aria-hidden="true" />
            {updating ? 'جارٍ التحديث' : 'تحديث الآن'}
          </button>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            disabled={updating}
            className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 text-slate-500 disabled:opacity-40"
            aria-label="تأجيل التحديث"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    </aside>
  );
}

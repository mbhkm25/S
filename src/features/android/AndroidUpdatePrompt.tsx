import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Download, Loader2, RefreshCw, ShieldCheck, Sparkles, X } from 'lucide-react';

type UpdateStatus =
  | 'idle'
  | 'checking'
  | 'update_available'
  | 'up_to_date'
  | 'starting'
  | 'downloading'
  | 'verified'
  | 'permission_required'
  | 'installer_opened'
  | 'error';

type NativeUpdateDetail = {
  status?: UpdateStatus;
  version_code?: number;
  version_name?: string;
  current_version_code?: number;
  current_version_name?: string;
  minimum_supported_version_code?: number;
  update_policy?: 'recommended' | 'required';
  required?: boolean;
  release_notes?: string[];
  percent?: number;
  downloaded_bytes?: number;
  total_bytes?: number;
  size_bytes?: number;
  code?: string;
  message?: string;
};

type AndroidUpdaterApi = {
  getAppInfo?: () => string;
  checkForUpdate?: () => void;
  startUpdate?: () => void;
};

declare global {
  interface Window {
    AndroidUpdater?: AndroidUpdaterApi;
  }
}

const CHECK_INTERVAL_MS = 60 * 60 * 1000;
const START_TIMEOUT_MS = 15_000;
const DISMISS_KEY_PREFIX = 'sanad_android_update_dismissed_';

function toLatin(value: unknown) {
  return String(value ?? '').replace(/[٠-٩]/g, digit => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)));
}

function formatBytes(bytes?: number) {
  if (!bytes || !Number.isFinite(bytes)) return '';
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function isNativeUpdaterAvailable() {
  return typeof window.AndroidUpdater?.checkForUpdate === 'function' && typeof window.AndroidUpdater?.startUpdate === 'function';
}

export default function AndroidUpdatePrompt() {
  const [detail, setDetail] = useState<NativeUpdateDetail>({ status: 'idle' });
  const [dismissed, setDismissed] = useState(false);

  const status = detail.status || 'idle';
  const required = detail.required === true || detail.update_policy === 'required';
  const versionLabel = detail.version_name ? `V${toLatin(detail.version_name)}` : detail.version_code ? `V${toLatin(detail.version_code)}` : '';
  const notes = useMemo(
    () => (Array.isArray(detail.release_notes) ? detail.release_notes.filter(Boolean).slice(0, 3) : []),
    [detail.release_notes]
  );

  const checkForUpdate = useCallback(() => {
    if (!isNativeUpdaterAvailable() || document.visibilityState !== 'visible' || !navigator.onLine) return;
    window.AndroidUpdater?.checkForUpdate?.();
  }, []);

  useEffect(() => {
    const handler = (event: Event) => {
      const customEvent = event as CustomEvent<NativeUpdateDetail>;
      const next = customEvent.detail || { status: 'error', message: 'تعذر قراءة حالة التحديث.' };
      setDetail(next);

      if (next.status === 'update_available') {
        const target = next.version_code;
        const wasDismissed = target ? sessionStorage.getItem(`${DISMISS_KEY_PREFIX}${target}`) === '1' : false;
        setDismissed(next.required === true ? false : wasDismissed);
      }
      if (next.status === 'permission_required' || next.status === 'downloading' || next.status === 'verified') {
        setDismissed(false);
      }
    };

    window.addEventListener('sanadNativeUpdateStatus', handler as EventListener);
    const initialCheck = window.setTimeout(checkForUpdate, 1200);
    const timer = window.setInterval(checkForUpdate, CHECK_INTERVAL_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') checkForUpdate();
    };
    window.addEventListener('online', checkForUpdate);
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      window.removeEventListener('sanadNativeUpdateStatus', handler as EventListener);
      window.removeEventListener('online', checkForUpdate);
      document.removeEventListener('visibilitychange', onVisible);
      window.clearTimeout(initialCheck);
      window.clearInterval(timer);
    };
  }, [checkForUpdate]);

  useEffect(() => {
    if (status !== 'starting') return undefined;
    const timer = window.setTimeout(() => {
      setDetail(current => current.status === 'starting'
        ? { ...current, status: 'error', message: 'لم يبدأ تنزيل التحديث في الوقت المتوقع. تحقق من الاتصال وحاول مرة أخرى.' }
        : current);
    }, START_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [status]);

  const beginUpdate = () => {
    if (!isNativeUpdaterAvailable()) {
      setDetail(current => ({ ...current, status: 'error', message: 'ميزة التحديث غير متاحة في هذه النسخة من سند.' }));
      return;
    }
    setDismissed(false);
    setDetail(current => ({ ...current, status: 'starting', percent: 0, message: undefined }));
    try {
      window.AndroidUpdater?.startUpdate?.();
    } catch (error) {
      console.warn('Android updater start failed:', error);
      setDetail(current => ({ ...current, status: 'error', message: 'تعذر بدء التحديث. حاول مرة أخرى.' }));
    }
  };

  const dismiss = () => {
    if (required || status === 'starting' || status === 'downloading' || status === 'verified' || status === 'permission_required') return;
    if (detail.version_code) sessionStorage.setItem(`${DISMISS_KEY_PREFIX}${detail.version_code}`, '1');
    setDismissed(true);
  };

  if (!isNativeUpdaterAvailable()) return null;
  if (['idle', 'checking', 'up_to_date'].includes(status) || dismissed) return null;

  const progress = Math.max(0, Math.min(100, Number(detail.percent || 0)));
  const isStarting = status === 'starting';
  const isBusy = isStarting || status === 'downloading' || status === 'verified';
  const isError = status === 'error';
  const needsPermission = status === 'permission_required';
  const installerOpened = status === 'installer_opened';

  const title = isError
    ? 'تعذر تحديث سند'
    : installerOpened
      ? 'أكمل تثبيت التحديث'
      : needsPermission
        ? 'اسمح لسند بتثبيت التحديث'
        : isStarting
          ? 'جاري بدء التحديث'
          : required
            ? 'يلزم تحديث سند للمتابعة'
            : 'نسخة جديدة من سند متاحة';

  return (
    <aside
      className={`fixed inset-0 z-[180] font-arabic ${required || isBusy || needsPermission ? 'bg-slate-950/55 backdrop-blur-sm' : 'pointer-events-none'}`}
      dir="rtl"
      role={required ? 'alertdialog' : 'alert'}
      aria-live="polite"
      aria-label="تحديث تطبيق سند"
    >
      <div className={`mx-auto flex h-full max-w-2xl items-start justify-center px-3 pt-[calc(0.75rem+env(safe-area-inset-top,0px))] ${required || isBusy || needsPermission ? '' : 'pointer-events-none'}`}>
        <div className="pointer-events-auto w-full rounded-[1.6rem] border border-slate-200 bg-white/98 p-4 shadow-[0_24px_70px_rgba(15,23,42,0.30)]">
          <div className="flex items-start gap-3">
            <div className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl ${isError ? 'bg-rose-50 text-rose-700' : required ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}>
              {isError ? <AlertTriangle className="h-5 w-5" /> : installerOpened ? <CheckCircle2 className="h-5 w-5" /> : isStarting ? <Loader2 className="h-5 w-5 animate-spin" /> : required ? <ShieldCheck className="h-5 w-5" /> : <Sparkles className="h-5 w-5" />}
            </div>

            <div className="min-w-0 flex-1 text-right">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-sm font-black text-slate-950">{title}</h2>
                {versionLabel && !isError && <span className="rounded-full bg-slate-100 px-2 py-1 text-[9px] font-black text-slate-600" dir="ltr">{versionLabel}</span>}
              </div>

              {status === 'update_available' && (
                <p className="mt-1 text-[10px] leading-5 text-slate-500">
                  {required ? 'هذه النسخة لم تعد ضمن الحد المدعوم. حدّث سند حتى تواصل الاستخدام بأمان.' : 'حدّث الآن للحصول على آخر التحسينات مع بقاء بيانات حسابك كما هي.'}
                </p>
              )}
              {isStarting && <p className="mt-1 text-[10px] leading-5 text-slate-500">يجهز سند رابط التحديث ويبدأ التنزيل الآن…</p>}
              {status === 'downloading' && <p className="mt-1 text-[10px] leading-5 text-slate-500">جارٍ تنزيل التحديث من خادم سند والتحقق منه قبل فتح شاشة التثبيت.</p>}
              {status === 'verified' && <p className="mt-1 text-[10px] leading-5 text-emerald-700">تم تنزيل الملف والتحقق من سلامته وتوقيع سند.</p>}
              {needsPermission && <p className="mt-1 text-[10px] leading-5 text-amber-700">يفتح Android إعداد «السماح من هذا المصدر». فعّل الإذن لسند ثم عد إلى التطبيق، وسيكمل سند تلقائيًا.</p>}
              {installerOpened && <p className="mt-1 text-[10px] leading-5 text-emerald-700">تم التحقق من التحديث. وافق على «تحديث/تثبيت» في شاشة Android لإكمال العملية.</p>}
              {isError && <p className="mt-1 text-[10px] leading-5 text-rose-700">{detail.message || 'تعذر تجهيز التحديث. لم يتم تثبيت أي ملف.'}</p>}

              {notes.length > 0 && status === 'update_available' && (
                <div className="mt-2 space-y-1 rounded-2xl bg-slate-50 px-3 py-2.5">
                  {notes.map(note => <p key={note} className="text-[9px] leading-5 text-slate-600">• {note}</p>)}
                </div>
              )}

              {status === 'downloading' && (
                <div className="mt-3">
                  <div className="mb-1 flex items-center justify-between text-[9px] font-bold text-slate-500">
                    <span>جارٍ التنزيل والتحقق</span>
                    <span dir="ltr">{toLatin(progress)}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-slate-950 transition-[width] duration-300" style={{ width: `${progress}%` }} />
                  </div>
                  <p className="mt-1 text-[8px] text-slate-400" dir="ltr">
                    {[formatBytes(detail.downloaded_bytes), formatBytes(detail.total_bytes || detail.size_bytes)].filter(Boolean).join(' / ')}
                  </p>
                </div>
              )}
            </div>

            {!required && !isBusy && !needsPermission && !installerOpened && (
              <button type="button" onClick={dismiss} className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-slate-200 text-slate-500" aria-label="تأجيل التحديث">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          <div className="mt-4 flex gap-2">
            {(status === 'update_available' || isStarting || isError || needsPermission) && (
              <button
                type="button"
                onClick={isError ? checkForUpdate : beginUpdate}
                disabled={isStarting}
                aria-busy={isStarting}
                className={`inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-2xl px-4 text-xs font-black text-white transition-all ${isStarting ? 'cursor-wait bg-slate-700' : 'bg-slate-950 active:scale-[0.99]'}`}
              >
                {isStarting ? <Loader2 className="h-4 w-4 animate-spin" /> : isError ? <RefreshCw className="h-4 w-4" /> : <Download className="h-4 w-4" />}
                {isStarting ? 'جاري بدء التحديث…' : isError ? 'إعادة المحاولة' : needsPermission ? 'متابعة التحديث' : 'تحديث الآن'}
              </button>
            )}
            {status === 'update_available' && !required && (
              <button type="button" onClick={dismiss} className="min-h-11 rounded-2xl border border-slate-200 bg-white px-4 text-xs font-black text-slate-600">لاحقًا</button>
            )}
            {installerOpened && (
              <button type="button" onClick={() => setDismissed(true)} className="inline-flex min-h-11 flex-1 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-xs font-black text-slate-700">تم</button>
            )}
          </div>

          {!isError && !installerOpened && (
            <p className="mt-3 flex items-center justify-center gap-1.5 text-[8px] font-bold text-slate-400">
              <ShieldCheck className="h-3 w-3" /> يتحقق سند من SHA-256 واسم الحزمة وشهادة التوقيع قبل التثبيت.
            </p>
          )}
        </div>
      </div>
    </aside>
  );
}

import { useCallback, useEffect, useRef, useState } from 'react';
import { BellRing, CheckCircle2, Loader2, Smartphone, TriangleAlert } from 'lucide-react';
import { getMyPushStatus } from './pushApi';
import { reportPushError } from './pushErrors';
import { detectPushSupport } from './pushSupport';
import {
  disablePushNotifications,
  enablePushNotifications,
  getLocalPushSubscription
} from './pushSubscription';
import type { PushStatusResponse, PushSupportResult } from './types';

interface PushNotificationSettingsProps {
  userId: string | null;
}

export default function PushNotificationSettings({ userId }: PushNotificationSettingsProps) {
  const [support, setSupport] = useState<PushSupportResult | null>(null);
  const [status, setStatus] = useState<PushStatusResponse | null>(null);
  const [localEnabled, setLocalEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const nextSupport = await detectPushSupport();
      if (!mountedRef.current) return;
      setSupport(nextSupport);
      if (userId) {
        const [nextStatus, local] = await Promise.all([
          getMyPushStatus(),
          nextSupport.status === 'supported' || nextSupport.status === 'permission_denied'
            ? getLocalPushSubscription().catch(() => null)
            : Promise.resolve(null)
        ]);
        if (!mountedRef.current) return;
        setStatus(nextStatus);
        setLocalEnabled(!!local);
      }
    } catch (error) {
      if (mountedRef.current) setMessage(reportPushError(error));
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    mountedRef.current = true;
    void refresh();
    return () => { mountedRef.current = false; };
  }, [refresh]);

  const runMutation = async (kind: 'enable' | 'disable') => {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const result = kind === 'enable'
        ? await enablePushNotifications()
        : await disablePushNotifications();
      if (mountedRef.current) setMessage(result.message);
      await refresh();
      if (mountedRef.current) setMessage(result.message);
    } catch (error) {
      if (mountedRef.current) {
        const errorMessage = reportPushError(error);
        await refresh();
        if (mountedRef.current) setMessage(errorMessage);
      }
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  };

  const unavailableText = support?.status === 'requires_native_push'
    ? 'إشعارات نسخة Android ستتوفر عبر نظامها الأصلي لاحقًا.'
    : support?.status === 'permission_denied'
      ? 'تم حظر الإشعارات من إعدادات المتصفح. افتح إعدادات الموقع ثم اسمح بالإشعارات.'
      : support?.status === 'missing_vapid_key'
        ? 'إشعارات الجوال غير متاحة حاليًا.'
        : support?.status === 'unsupported'
          ? 'هذا الجهاز أو المتصفح لا يدعم إشعارات الجوال. ستبقى إشعارات سند داخل التطبيق متاحة.'
          : support?.status === 'unknown'
            ? 'تعذر التحقق من خدمة الإشعارات حاليًا.'
            : null;

  return (
    <section aria-labelledby="push-settings-title" className="rounded-3xl border border-emerald-100 bg-white p-4 shadow-2xs space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="text-right space-y-1 flex-1">
          <div className="flex items-center justify-end gap-2">
            {localEnabled && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-bold text-emerald-700">
                <CheckCircle2 className="h-3.5 w-3.5" /> مفعلة
              </span>
            )}
            <h3 id="push-settings-title" className="text-sm font-bold text-slate-800">إشعارات الجوال</h3>
          </div>
          <p className="text-[11px] leading-relaxed text-slate-500">
            استقبل إشعارات سند حتى عندما يكون التطبيق مغلقًا.
          </p>
        </div>
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-emerald-50 text-emerald-700">
          <BellRing className="h-5 w-5" />
        </span>
      </div>

      {loading ? (
        <div className="flex min-h-12 items-center justify-center gap-2 text-xs text-slate-500" role="status">
          <Loader2 className="h-4 w-4 animate-spin" /> جاري التحقق
        </div>
      ) : unavailableText ? (
        <div className="flex items-start justify-end gap-2 rounded-2xl bg-amber-50 p-3 text-right text-[11px] leading-relaxed text-amber-800">
          <span>{unavailableText}</span>
          {support?.status === 'requires_native_push'
            ? <Smartphone className="h-4 w-4 shrink-0" />
            : <TriangleAlert className="h-4 w-4 shrink-0" />}
        </div>
      ) : localEnabled ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => void runMutation('disable')}
          className="min-h-12 w-full rounded-2xl border border-rose-200 bg-rose-50 px-4 text-xs font-bold text-rose-700 transition hover:bg-rose-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 disabled:opacity-50"
        >
          {busy ? 'جاري التعطيل...' : 'تعطيل على هذا الجهاز'}
        </button>
      ) : (
        <button
          type="button"
          disabled={busy || support?.status !== 'supported'}
          onClick={() => void runMutation('enable')}
          className="min-h-12 w-full rounded-2xl bg-slate-900 px-4 text-xs font-bold text-white transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:opacity-50"
        >
          {busy ? 'جاري التفعيل...' : 'تفعيل إشعارات الجوال'}
        </button>
      )}

      {!!status?.active_device_count && (
        <p className="text-right text-[10px] text-slate-500">
          الأجهزة المفعلة: {status.active_device_count}
        </p>
      )}
      {message && <p role="status" className="text-right text-[11px] font-medium text-slate-700">{message}</p>}
    </section>
  );
}

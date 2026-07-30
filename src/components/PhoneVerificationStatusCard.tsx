import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, CheckCircle2, Clock3, Loader2, MessageCircle, RefreshCw, ShieldCheck } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { Profile } from '../types';

type VerificationStatus = {
  ok?: boolean;
  status?: string | null;
  verified_phone?: string | null;
  pending_phone?: string | null;
  verified_at?: string | null;
  claim?: {
    id?: string;
    status?: string | null;
    requested_at?: string | null;
    sent_at?: string | null;
    expires_at?: string | null;
    can_resend?: boolean;
  } | null;
};

type Props = {
  profile: Profile;
  refreshProfile: () => Promise<Profile | null>;
};

const ACTIVE_STATUSES = new Set(['queued', 'sending', 'sent', 'failed', 'expired', 'rejected']);
const TARGET_ATTRIBUTE = 'data-phone-verification-slot';

function statusCopy(status?: string | null) {
  switch (status) {
    case 'queued': return { title: 'بانتظار الإرسال', detail: 'سيحاول سند إرسال رسالة التحقق تلقائيًا خلال لحظات.' };
    case 'sending': return { title: 'جارٍ إرسال رسالة التحقق', detail: 'انتظر قليلًا ثم افتح واتساب.' };
    case 'sent': return { title: 'أُرسلت رسالة التحقق', detail: 'افتح الرسالة واضغط «نعم، أنا صاحب الرقم».' };
    case 'failed': return { title: 'فشل إرسال رسالة التحقق', detail: 'أعد المحاولة من الزر أدناه.' };
    case 'expired': return { title: 'انتهت صلاحية الطلب', detail: 'أنشئ محاولة تحقق جديدة للرقم نفسه.' };
    case 'rejected': return { title: 'تم رفض ربط الرقم', detail: 'أعد المحاولة عندما يكون الرقم ملكك.' };
    default: return { title: 'رقم الجوال غير موثق', detail: 'أكمل التحقق عبر واتساب لحماية الحساب.' };
  }
}

function formatTime(value?: string | null) {
  if (!value) return null;
  try {
    return new Intl.DateTimeFormat('ar-YE', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'Asia/Aden'
    }).format(new Date(value));
  } catch {
    return null;
  }
}

function ensureTarget(): HTMLElement | null {
  const form = document.getElementById('personal-data-form');
  if (!form) return null;

  const existing = form.querySelector<HTMLElement>(`[${TARGET_ATTRIBUTE}]`);
  if (existing) return existing;

  const labels = Array.from(form.querySelectorAll<HTMLLabelElement>('label'));
  const phoneField = labels.find((label) => label.textContent?.includes('رقم الجوال'));
  if (!phoneField) return null;

  const slot = document.createElement('div');
  slot.setAttribute(TARGET_ATTRIBUTE, 'true');
  slot.className = 'mt-2';
  phoneField.appendChild(slot);
  return slot;
}

export default function PhoneVerificationStatusCard({ profile, refreshProfile }: Props) {
  const [status, setStatus] = useState<VerificationStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [target, setTarget] = useState<HTMLElement | null>(null);

  const loadStatus = useCallback(async () => {
    const { data, error: requestError } = await supabase.rpc('get_my_phone_verification_status');
    if (requestError) throw requestError;
    setStatus((data || null) as VerificationStatus | null);
    return data as VerificationStatus | null;
  }, []);

  useEffect(() => {
    const syncTarget = () => setTarget(ensureTarget());
    syncTarget();
    const observer = new MutationObserver(syncTarget);
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('popstate', syncTarget);
    return () => {
      observer.disconnect();
      window.removeEventListener('popstate', syncTarget);
    };
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void loadStatus()
      .catch(() => active && setError('تعذر تحميل حالة توثيق رقم الجوال.'))
      .finally(() => active && setLoading(false));

    const timer = window.setInterval(() => {
      void loadStatus().then((next) => {
        if (next?.status === 'verified') void refreshProfile();
      }).catch(() => undefined);
    }, 15000);

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [loadStatus, refreshProfile]);

  const handleRetry = async () => {
    if (retrying) return;
    setRetrying(true);
    setError(null);
    setMessage(null);
    try {
      const { data, error: retryError } = await supabase.rpc('retry_my_phone_verification');
      if (retryError) throw retryError;
      const result = data as { ok?: boolean; reason?: string; retry_after_seconds?: number } | null;
      if (result?.ok === false) {
        if (result.reason === 'cooldown') throw new Error(`يمكن إعادة الإرسال بعد ${result.retry_after_seconds || 60} ثانية.`);
        if (result.reason === 'already_sending') throw new Error('هناك محاولة إرسال جارية الآن. انتظر قليلًا.');
        if (result.reason === 'verified') throw new Error('الرقم موثق بالفعل.');
        throw new Error('تعذر إنشاء محاولة جديدة الآن.');
      }
      setMessage('تمت جدولة رسالة تحقق جديدة، وستصل عبر واتساب خلال لحظات.');
      await loadStatus();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'تعذر إعادة إرسال رسالة التحقق.');
    } finally {
      setRetrying(false);
    }
  };

  if (!target) return null;

  const effectiveStatus = status?.claim?.status || status?.status || profile.phone_verification_status;
  const isVerified = profile.phone_verification_status === 'verified' || status?.status === 'verified';

  if (isVerified) {
    return createPortal(
      <div className="flex items-center justify-between gap-2 rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2.5" dir="rtl">
        <span className="flex min-w-0 items-center gap-2 text-[11px] font-bold text-emerald-800">
          <ShieldCheck className="h-4 w-4 shrink-0" />
          رقم الجوال موثّق
        </span>
        <span className="text-[9px] text-emerald-600">تم تأكيد ملكية الرقم</span>
      </div>,
      target
    );
  }

  if (!profile.pending_phone && !status?.pending_phone && !ACTIVE_STATUSES.has(effectiveStatus || '')) return null;

  const copy = statusCopy(effectiveStatus);
  const canRetry = Boolean(status?.claim?.can_resend) || ['failed', 'expired', 'rejected'].includes(effectiveStatus || '');
  const sentTime = formatTime(status?.claim?.sent_at || status?.claim?.requested_at);

  return createPortal(
    <div className="space-y-2 rounded-xl border border-amber-100 bg-amber-50 p-3" dir="rtl">
      <div className="flex items-start gap-2">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-600 text-white">
          {effectiveStatus === 'sent' ? <MessageCircle className="h-4 w-4" /> : effectiveStatus === 'queued' || effectiveStatus === 'sending' ? <Clock3 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] font-bold text-amber-950">{copy.title}</p>
            {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-600" />}
          </div>
          <p className="mt-1 text-[9px] leading-5 text-amber-800">{copy.detail}</p>
          {sentTime && <p className="mt-1 text-[9px] text-amber-600">آخر محاولة: {sentTime}</p>}
        </div>
      </div>

      {message && <div className="flex items-start gap-2 rounded-lg bg-emerald-100 p-2.5 text-[9px] text-emerald-800"><CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span>{message}</span></div>}
      {error && <div className="flex items-start gap-2 rounded-lg bg-rose-100 p-2.5 text-[9px] text-rose-800"><AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span>{error}</span></div>}

      <button
        type="button"
        disabled={!canRetry || retrying || loading}
        onClick={() => void handleRetry()}
        className="flex min-h-10 w-full items-center justify-center gap-2 rounded-lg bg-amber-600 px-3 text-[11px] font-bold text-white disabled:cursor-not-allowed disabled:bg-amber-300"
      >
        {retrying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
        {canRetry ? 'إعادة إرسال رسالة التحقق' : 'انتظر قبل إعادة الإرسال'}
      </button>
    </div>,
    target
  );
}

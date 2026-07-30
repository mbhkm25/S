import { useCallback, useEffect, useState } from 'react';
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

function statusCopy(status?: string | null) {
  switch (status) {
    case 'queued': return { title: 'طلب التحقق في قائمة الإرسال', detail: 'سيحاول سند إرسال الرسالة تلقائيًا خلال لحظات.' };
    case 'sending': return { title: 'جارٍ إرسال رسالة التحقق', detail: 'لا تغلق واتساب وانتظر قليلًا.' };
    case 'sent': return { title: 'أُرسلت رسالة التحقق إلى واتساب', detail: 'افتح الرسالة واضغط «نعم، أنا صاحب الرقم» لإكمال التوثيق.' };
    case 'failed': return { title: 'تعذر إرسال رسالة التحقق', detail: 'يمكنك إعادة المحاولة دون إنشاء حساب جديد.' };
    case 'expired': return { title: 'انتهت صلاحية طلب التحقق', detail: 'أنشئ طلبًا جديدًا للرقم نفسه من الزر أدناه.' };
    case 'rejected': return { title: 'تم رفض ربط الرقم', detail: 'يمكنك إعادة المحاولة إذا كان الرقم يخصك.' };
    default: return { title: 'رقم الجوال غير موثق', detail: 'أكمل التحقق عبر رسالة واتساب لحماية الحساب.' };
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

export default function PhoneVerificationStatusCard({ profile, refreshProfile }: Props) {
  const [status, setStatus] = useState<VerificationStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    const { data, error: requestError } = await supabase.rpc('get_my_phone_verification_status');
    if (requestError) throw requestError;
    setStatus((data || null) as VerificationStatus | null);
    return data as VerificationStatus | null;
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
        if (result.reason === 'cooldown') {
          throw new Error(`يمكن إعادة الإرسال بعد ${result.retry_after_seconds || 60} ثانية.`);
        }
        if (result.reason === 'already_sending') throw new Error('هناك محاولة إرسال جارية الآن. انتظر قليلًا.');
        if (result.reason === 'verified') throw new Error('الرقم موثق بالفعل.');
        throw new Error('تعذر إنشاء محاولة جديدة الآن.');
      }
      setMessage('تمت جدولة رسالة تحقق جديدة. ستصل عبر واتساب خلال لحظات.');
      await loadStatus();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'تعذر إعادة إرسال رسالة التحقق.');
    } finally {
      setRetrying(false);
    }
  };

  const effectiveStatus = status?.claim?.status || status?.status || profile.phone_verification_status;
  if (profile.phone_verification_status === 'verified' || status?.status === 'verified') {
    return (
      <section className="flex items-center gap-3 rounded-[1.5rem] border border-emerald-100 bg-emerald-50 p-4 text-right">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white"><ShieldCheck className="h-5 w-5" /></span>
        <div className="min-w-0"><p className="text-xs font-bold text-emerald-900">رقم الجوال موثق</p><p className="mt-1 text-[10px] text-emerald-700">تم تأكيد ملكية الرقم المرتبط بحسابك.</p></div>
      </section>
    );
  }

  if (!profile.pending_phone && !status?.pending_phone && !ACTIVE_STATUSES.has(effectiveStatus || '')) return null;

  const copy = statusCopy(effectiveStatus);
  const canRetry = Boolean(status?.claim?.can_resend) || ['failed', 'expired', 'rejected'].includes(effectiveStatus || '');
  const sentTime = formatTime(status?.claim?.sent_at || status?.claim?.requested_at);

  return (
    <section className="space-y-3 rounded-[1.7rem] border border-amber-100 bg-amber-50 p-4 text-right shadow-sm" dir="rtl">
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-600 text-white">
          {effectiveStatus === 'sent' ? <MessageCircle className="h-5 w-5" /> : effectiveStatus === 'queued' || effectiveStatus === 'sending' ? <Clock3 className="h-5 w-5" /> : <AlertCircle className="h-5 w-5" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold text-amber-950">{copy.title}</p>
          <p className="mt-1 text-[10px] leading-5 text-amber-800">{copy.detail}</p>
          {(status?.pending_phone || profile.pending_phone) && <p className="mt-1 font-mono text-[10px] text-amber-700" dir="ltr">{status?.pending_phone || `***${String(profile.pending_phone).slice(-4)}`}</p>}
          {sentTime && <p className="mt-1 text-[9px] text-amber-600">آخر محاولة: {sentTime}</p>}
        </div>
        {loading && <Loader2 className="h-4 w-4 animate-spin text-amber-600" />}
      </div>

      {message && <div className="flex items-start gap-2 rounded-xl bg-emerald-100 p-3 text-[10px] text-emerald-800"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /><span>{message}</span></div>}
      {error && <div className="flex items-start gap-2 rounded-xl bg-rose-100 p-3 text-[10px] text-rose-800"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><span>{error}</span></div>}

      <button
        type="button"
        disabled={!canRetry || retrying || loading}
        onClick={() => void handleRetry()}
        className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-amber-600 px-4 text-xs font-bold text-white disabled:cursor-not-allowed disabled:bg-amber-300"
      >
        {retrying ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        {canRetry ? 'إعادة إرسال رسالة التحقق' : 'انتظر قبل إعادة الإرسال'}
      </button>
    </section>
  );
}

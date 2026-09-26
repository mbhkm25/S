import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Clock3, RefreshCw, TriangleAlert } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { formatSanadSourceDate } from '../../utils/sanadSourceDisplay';

type RefreshStatus = 'idle' | 'offline' | 'requested' | 'claimed'
  | 'uploading' | 'completed' | 'failed' | 'expired' | 'cooldown';

type RefreshState = {
  status: RefreshStatus;
  request_id?: string | null;
  requested_at?: string | null;
  completed_at?: string | null;
  snapshot_public_id?: string | null;
  device_online?: boolean;
  device_last_heartbeat_at?: string | null;
  error_code?: string | null;
};

function readableDate(value?: string | null): string {
  const result = formatSanadSourceDate(value);
  return result.valid ? result.text : 'غير متاح';
}

const ACTIVE = new Set<RefreshStatus>(['requested', 'claimed', 'uploading']);

export default function SanadBridgeRefreshControl({ businessId }: { businessId: string }) {
  const [state, setState] = useState<RefreshState>({ status: 'idle' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const readStatus = useCallback(async () => {
    const { data, error: rpcError } = await supabase.rpc('get_sanad_erp_refresh_status_v1', {
      p_business_id: businessId,
    });
    if (rpcError) throw rpcError;
    return data as RefreshState;
  }, [businessId]);

  useEffect(() => {
    let active = true;
    setState({ status: 'idle' });
    setError(null);
    void readStatus().then((next) => {
      if (active) setState(next);
    }).catch(() => {
      if (active) setError('تعذر قراءة حالة تحديث Bridge. تحقق من اتصالك وحاول مجددًا.');
    });
    return () => { active = false; };
  }, [readStatus]);

  useEffect(() => {
    if (!ACTIVE.has(state.status)) return;
    const timer = window.setInterval(() => {
      void readStatus().then((next) => {
        setState((previous) => previous.request_id && next.request_id !== previous.request_id ? previous : next);
      }).catch(() => setError('تعذر تحديث حالة العملية مؤقتًا. أعد المحاولة لاحقًا.'));
    }, 8000);
    return () => window.clearInterval(timer);
  }, [readStatus, state.status]);

  const requestNow = async () => {
    setBusy(true);
    setError(null);
    try {
      const { data, error: rpcError } = await supabase.rpc('request_sanad_erp_refresh_v1', {
        p_business_id: businessId,
      });
      if (rpcError) throw rpcError;
      const next = data as RefreshState;
      if (next.status === 'offline') {
        setError('الجهاز غير جاهز لاستقبال الأوامر. يلزم تشغيل إصدار Bridge الجديد على كمبيوتر إبداع وانتظار نبضة الاتصال.');
      } else if (next.status === 'cooldown') {
        setError('اكتمل تحديث قبل لحظات؛ تجنب تشغيل نسخة كاملة أخرى خلال دقيقة.');
      }
      // Fetch server-owned lifecycle, timestamps and verified completion,
      // never infer success from a successful request RPC.
      setState(await readStatus());
    } catch {
      setError('تعذر إنشاء طلب التحديث. قد يلزم مالك النشاط أو تحديث نسخة الخادم.');
    } finally {
      setBusy(false);
    }
  };

  const inProgress = ACTIVE.has(state.status);
  const offline = state.device_online === false;
  return (
    <div data-sanad-bridge-refresh="on-demand" className="mt-3 max-w-xl rounded-xl border border-cyan-100 bg-cyan-50/40 p-3 text-right">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-[13px] font-semibold text-slate-900">نسخة إبداع السحابية</h3>
          <p className="mt-1 text-[11px] leading-5 text-slate-600">
            التحديث الفوري إضافة إلى الجدولة الدورية؛ لا يغير أي بيانات داخل إبداع.
          </p>
        </div>
        <button type="button" onClick={() => void requestNow()}
          disabled={busy || inProgress}
          className="sanad-focus-ring inline-flex min-h-11 items-center gap-2 rounded-xl border border-cyan-200 bg-gradient-to-l from-cyan-200 to-lime-100 px-3.5 text-xs font-semibold text-slate-900 transition hover:border-cyan-300 disabled:cursor-wait disabled:opacity-60">
          <RefreshCw className={`h-4 w-4 ${busy ? 'animate-spin' : ''}`} aria-hidden="true" />
          تحديث النسخة الآن
        </button>
      </div>
      <div className="mt-2 flex items-start gap-2 text-xs leading-6 text-slate-700" role="status" aria-live="polite">
        {state.status === 'completed' ? <CheckCircle2 aria-hidden="true" className="mt-1 h-4 w-4 shrink-0 text-emerald-700" /> :
          inProgress ? <Clock3 aria-hidden="true" className="mt-1 h-4 w-4 shrink-0 text-cyan-700" /> :
          <RefreshCw aria-hidden="true" className="mt-1 h-4 w-4 shrink-0 text-slate-500" />}
        <span>
          {state.status === 'requested' ? 'تم تسجيل الطلب، بانتظار استلام Bridge على كمبيوتر المحل.' :
            state.status === 'claimed' ? 'استلم Bridge الطلب؛ تنفيذ النسخة أو تجهيزها جارٍ.' :
            state.status === 'uploading' ? 'يجري رفع النسخة السحابية والتحقق من اكتمالها.' :
            state.status === 'completed' ? `نسخة مكتملة ومؤكدة من الخادم: ${readableDate(state.completed_at)}.` :
            state.status === 'expired' || state.status === 'failed' ? 'لم يكتمل التحديث؛ افحص حالة Bridge قبل طلب جديد.' :
            'يمكن طلب نسخة محاسبية جديدة دون انتظار الموعد الدوري.'}
          {offline ? <span className="block text-amber-800">الجهاز غير متصل حاليًا.</span> : null}
        </span>
      </div>
      {state.status === 'completed' && state.snapshot_public_id ? (
        <p className="mt-1 break-all text-[11px] text-slate-500">معرّف النسخة: <bdi dir="ltr">{state.snapshot_public_id}</bdi></p>
      ) : null}
      {error ? (
        <div role="alert" className="mt-2 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs leading-5 text-amber-900">
          <TriangleAlert aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />{error}
        </div>
      ) : null}
    </div>
  );
}

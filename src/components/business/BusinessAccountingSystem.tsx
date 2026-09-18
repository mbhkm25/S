import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  CircleDot,
  Database,
  Laptop,
  Loader2,
  RefreshCw,
  ServerCog,
  ShieldCheck,
  Unplug
} from 'lucide-react';
import {
  getBusinessAccountingConnections,
  type BusinessAccountingConnection,
  type BusinessAccountingConnectionStatus
} from '../../lib/businessAccountingApi';
import BusinessErpCloudReplica from './BusinessErpCloudReplica';
import BusinessErpCustomerStatement from './BusinessErpCustomerStatement';

interface Props {
  businessId: string;
}

const STATUS_META: Record<BusinessAccountingConnectionStatus, {
  label: string;
  description: string;
  badgeClass: string;
  iconClass: string;
}> = {
  connected: {
    label: 'متصل',
    description: 'المصدر مرتبط بسند ويمكن متابعة حالة المزامنة من هنا.',
    badgeClass: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    iconClass: 'bg-emerald-50 text-emerald-700'
  },
  pending: {
    label: 'بانتظار إكمال الربط',
    description: 'تم إنشاء الربط، لكن المزامنة الأولية لم تكتمل بعد.',
    badgeClass: 'bg-amber-50 text-amber-700 ring-amber-200',
    iconClass: 'bg-amber-50 text-amber-700'
  },
  paused: {
    label: 'متوقف مؤقتًا',
    description: 'الربط موجود لكن المزامنة متوقفة مؤقتًا.',
    badgeClass: 'bg-slate-100 text-slate-700 ring-slate-200',
    iconClass: 'bg-slate-100 text-slate-700'
  },
  error: {
    label: 'يحتاج مراجعة',
    description: 'أوقف سند المزامنة الآلية حتى تتم مراجعة سبب الخطأ.',
    badgeClass: 'bg-rose-50 text-rose-700 ring-rose-200',
    iconClass: 'bg-rose-50 text-rose-700'
  },
  disconnected: {
    label: 'غير متصل',
    description: 'هذا الربط غير نشط حاليًا.',
    badgeClass: 'bg-slate-100 text-slate-600 ring-slate-200',
    iconClass: 'bg-slate-100 text-slate-600'
  }
};

function formatDateTime(value: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day} · ${hours}:${minutes}`;
}

function providerName(connection: BusinessAccountingConnection) {
  if (connection.provider_code === 'edaa_v5' || connection.provider_code === 'edaa') return 'إبداع سوفت';
  return connection.display_name || connection.provider_code;
}

function errorLabel(code: string | null) {
  if (!code) return null;
  if (code === 'schema_fingerprint_mismatch') return 'تغيّر مخطط قاعدة إبداع ويحتاج إعادة تحقق قبل استئناف المزامنة.';
  if (code === 'baseline_snapshot_count_mismatch') return 'لم تتطابق أعداد السجلات في المزامنة الأولية.';
  if (code === 'baseline_snapshot_missing') return 'لم تصل جميع أجزاء المزامنة الأولية إلى سند.';
  return 'تعذرت آخر محاولة مزامنة. يمكن مراجعة الرمز التقني أدناه عند الدعم.';
}

function ConnectionCard({ connection }: { connection: BusinessAccountingConnection }) {
  const meta = STATUS_META[connection.status] || STATUS_META.error;
  const lastError = errorLabel(connection.last_error_code);
  const StatusIcon = connection.status === 'connected'
    ? CheckCircle2
    : connection.status === 'error'
      ? AlertCircle
      : connection.status === 'disconnected'
        ? Unplug
        : CircleDot;

  return (
    <article className="overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white shadow-[0_10px_30px_rgba(15,23,42,0.04)]">
      <div className="p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${meta.iconClass}`}>
            <StatusIcon className="h-6 w-6" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-black text-slate-950">{providerName(connection)}</h3>
              <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ring-1 ring-inset ${meta.badgeClass}`}>
                {meta.label}
              </span>
              <span className="rounded-full bg-sky-50 px-2.5 py-1 text-[10px] font-bold text-sky-700 ring-1 ring-inset ring-sky-100">
                قراءة فقط
              </span>
            </div>
            <p className="mt-1.5 text-[11px] leading-5 text-slate-500">{meta.description}</p>
          </div>
        </div>

        <dl className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3">
          <div className="rounded-2xl bg-slate-50 p-3">
            <dt className="text-[9px] font-bold text-slate-400">الفرع</dt>
            <dd className="mt-1 truncate text-[11px] font-bold text-slate-800">{connection.location_name || 'الفرع الرئيسي'}</dd>
          </div>
          <div className="rounded-2xl bg-slate-50 p-3">
            <dt className="text-[9px] font-bold text-slate-400">الأجهزة المرتبطة</dt>
            <dd className="mt-1 text-[11px] font-bold text-slate-800">{connection.active_devices ?? 0}</dd>
          </div>
          <div className="rounded-2xl bg-slate-50 p-3">
            <dt className="text-[9px] font-bold text-slate-400">نسخة المحول</dt>
            <dd className="mt-1 text-[11px] font-bold text-slate-800">{connection.adapter_version || '—'}</dd>
          </div>
          <div className="rounded-2xl bg-slate-50 p-3">
            <dt className="text-[9px] font-bold text-slate-400">آخر مزامنة</dt>
            <dd className="mt-1 text-[10px] font-bold text-slate-800" dir="ltr">{formatDateTime(connection.last_sync_at)}</dd>
          </div>
          <div className="rounded-2xl bg-slate-50 p-3">
            <dt className="text-[9px] font-bold text-slate-400">آخر اتصال بالجهاز</dt>
            <dd className="mt-1 text-[10px] font-bold text-slate-800" dir="ltr">{formatDateTime(connection.last_heartbeat_at)}</dd>
          </div>
          <div className="rounded-2xl bg-slate-50 p-3">
            <dt className="text-[9px] font-bold text-slate-400">عقد الأحداث</dt>
            <dd className="mt-1 text-[11px] font-bold text-slate-800">v{connection.event_schema_version || 1}</dd>
          </div>
        </dl>

        {connection.status === 'connected' && (
          <div className="mt-4 flex items-start gap-2 rounded-2xl border border-emerald-100 bg-emerald-50/70 p-3 text-[10px] leading-5 text-emerald-800">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
            <span>سند يقرأ البيانات من النظام المحاسبي ولا يكتب أو يعدّل سجلات إبداع في مرحلة الربط الحالية.</span>
          </div>
        )}

        {lastError && (
          <div className="mt-4 rounded-2xl border border-rose-100 bg-rose-50 p-3">
            <div className="flex items-start gap-2 text-[10px] leading-5 text-rose-800">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{lastError}</span>
            </div>
            {connection.last_error_code && (
              <code className="mt-2 block overflow-x-auto rounded-xl bg-white/80 px-2.5 py-2 text-[9px] text-rose-700" dir="ltr">
                {connection.last_error_code}
              </code>
            )}
          </div>
        )}
      </div>
    </article>
  );
}

export default function BusinessAccountingSystem({ businessId }: Props) {
  const [connections, setConnections] = useState<BusinessAccountingConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      setConnections(await getBusinessAccountingConnections(businessId));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'تعذر تحميل حالة النظام المحاسبي.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [businessId]);

  useEffect(() => { void load(); }, [load]);

  const active = useMemo(
    () => connections.filter(item => item.status !== 'disconnected'),
    [connections]
  );

  if (loading) {
    return (
      <div className="flex min-h-[42vh] flex-col items-center justify-center gap-3 text-slate-500">
        <Loader2 className="h-6 w-6 animate-spin" />
        <span className="text-xs font-bold">جارٍ قراءة حالة الربط…</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <section className="rounded-[1.8rem] border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-slate-950 text-white">
              <Database className="h-6 w-6" />
            </span>
            <div className="min-w-0">
              <span className="text-[10px] font-bold text-emerald-700">ربط الأنظمة</span>
              <h2 className="mt-0.5 text-lg font-black text-slate-950">النظام المحاسبي</h2>
              <p className="mt-1 text-[11px] leading-5 text-slate-500">متابعة ربط إبداع سوفت وحالة الجهاز والمزامنة مع سند.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void load(true)}
            disabled={refreshing}
            className="rounded-xl border border-slate-200 p-2.5 text-slate-600 disabled:opacity-50"
            aria-label="تحديث حالة النظام المحاسبي"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </section>

      {error && (
        <div role="alert" className="flex items-start gap-2 rounded-2xl border border-rose-100 bg-rose-50 p-3 text-xs leading-5 text-rose-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="flex-1">{error}</span>
          <button type="button" onClick={() => void load(true)} className="shrink-0 font-bold underline">إعادة المحاولة</button>
        </div>
      )}

      {!error && active.length === 0 && (
        <section className="overflow-hidden rounded-[1.8rem] border border-slate-200 bg-white shadow-sm">
          <div className="p-4 sm:p-5">
            <div className="flex items-start gap-3">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-600">
                <Unplug className="h-6 w-6" />
              </span>
              <div>
                <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-600">غير مرتبط</span>
                <h3 className="mt-2 text-sm font-black text-slate-950">لا يوجد نظام محاسبي مرتبط بهذا النشاط بعد</h3>
                <p className="mt-1 text-[11px] leading-5 text-slate-500">يمكنك مشاهدة هذه الصفحة من أي جهاز. تنفيذ الربط الأولي نفسه يبدأ من الكمبيوتر الذي يعمل عليه إبداع سوفت.</p>
              </div>
            </div>

            <div className="mt-5 space-y-2">
              {[
                ['1', 'على كمبيوتر إبداع', 'شغّل SANAD Bridge بعد تثبيته على الكمبيوتر الذي توجد عليه قاعدة إبداع.'],
                ['2', 'وافق على الربط', 'يفتح Bridge سند في المتصفح لتسجيل الدخول واختيار النشاط والفرع ثم الموافقة.'],
                ['3', 'تبدأ المزامنة الأولية', 'يفحص Bridge قاعدة إبداع للقراءة فقط، ثم يرفع البيانات المتفق عليها ويظهر تقدم الربط هنا.']
              ].map(([number, title, text]) => (
                <div key={number} className="flex gap-3 rounded-2xl bg-slate-50 p-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-900 text-[10px] font-black text-white">{number}</span>
                  <div>
                    <strong className="text-[11px] text-slate-900">{title}</strong>
                    <p className="mt-0.5 text-[10px] leading-5 text-slate-500">{text}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 border-t border-slate-100 bg-slate-50/70">
            <div className="flex items-center gap-2 border-l border-slate-100 p-3 text-[10px] text-slate-600">
              <Laptop className="h-4 w-4 text-slate-500" />
              الربط من كمبيوتر إبداع
            </div>
            <div className="flex items-center gap-2 p-3 text-[10px] text-slate-600">
              <ShieldCheck className="h-4 w-4 text-emerald-600" />
              وصول للقراءة فقط
            </div>
          </div>
        </section>
      )}

      {!error && active.map(connection => (
        <div key={connection.connection_id}>
          <ConnectionCard connection={connection} />
        </div>
      ))}

      {!error && active.length > 0 && (
        <BusinessErpCloudReplica businessId={businessId} />
      )}

      {!error && active.length > 0 && (
        <BusinessErpCustomerStatement businessId={businessId} />
      )}

      <section className="rounded-[1.6rem] border border-sky-100 bg-sky-50/70 p-4">
        <div className="flex items-start gap-3">
          <ServerCog className="mt-0.5 h-5 w-5 shrink-0 text-sky-700" />
          <div>
            <h3 className="text-xs font-black text-sky-950">ما الذي يمكن عمله من هذا الجهاز؟</h3>
            <p className="mt-1 text-[10px] leading-5 text-sky-800">يمكن متابعة حالة الربط وآخر مزامنة من أي هاتف أو لابتوب. أما اكتشاف قاعدة إبداع وتنفيذ المزامنة فيتم فقط من الكمبيوتر الذي يعمل عليه النظام المحاسبي.</p>
          </div>
        </div>
      </section>
    </div>
  );
}

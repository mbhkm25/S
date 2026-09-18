import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArchiveRestore,
  Cloud,
  Database,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import {
  getBusinessErpSnapshotStatus,
  type BusinessErpSnapshotStatus,
} from '../../lib/businessAccountingApi';

interface Props {
  businessId: string;
}

function formatDate(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('ar-YE-u-nu-latn', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function formatValue(value: unknown) {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export default function BusinessErpCloudReplica({ businessId }: Props) {
  const [status, setStatus] = useState<BusinessErpSnapshotStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const tables = useMemo(
    () => (status?.manifest?.tables || [])
      .filter((item) => item.table_name)
      .sort((a, b) => String(a.table_name).localeCompare(String(b.table_name))),
    [status]
  );

  const loadStatus = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await getBusinessErpSnapshotStatus(businessId);
      setStatus(next);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'تعذر تحميل النسخة السحابية.');
    } finally {
      setLoading(false);
    }
  }, [businessId]);


  useEffect(() => { void loadStatus(); }, [loadStatus]);

  if (loading) {
    return (
      <section className="flex min-h-40 items-center justify-center gap-2 rounded-[1.6rem] border border-slate-200 bg-white text-xs font-bold text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        جارٍ قراءة حالة النسخة السحابية…
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white shadow-sm" dir="rtl">
      <div className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-sky-50 text-sky-700">
              <Cloud className="h-5 w-5" />
            </span>
            <div>
              <span className="text-[10px] font-bold text-sky-700">نسخة سند السحابية</span>
              <h3 className="mt-0.5 text-sm font-black text-slate-950">مرآة بيانات النظام المحاسبي</h3>
              <p className="mt-1 text-[10px] leading-5 text-slate-500">
                نسخة منطقية دورية للبيانات المنظمة تتيح القراءة من سند حتى خارج كمبيوتر إبداع.
              </p>
            </div>
          </div>
          <button type="button" onClick={() => void loadStatus()} className="rounded-xl border border-slate-200 p-2 text-slate-500" aria-label="تحديث">
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>

        {error && (
          <div className="mt-4 flex items-start gap-2 rounded-2xl border border-rose-100 bg-rose-50 p-3 text-[10px] leading-5 text-rose-700">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {!error && !status?.available && (
          <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4">
            <div className="flex items-center gap-2 text-slate-700"><ArchiveRestore className="h-4 w-4" /><strong className="text-xs">لم تكتمل أول نسخة سحابية بعد</strong></div>
            <p className="mt-2 text-[10px] leading-5 text-slate-500">بعد تفعيل نسخة Bridge الجديدة ستُنشأ النسخة المنطقية تلقائيًا وتُحدّث دوريًا.</p>
          </div>
        )}

        {!error && status?.available && (
          <>
            <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
              <div className="rounded-2xl bg-slate-50 p-3"><dt className="text-[9px] font-bold text-slate-400">آخر نسخة مكتملة</dt><dd className="mt-1 text-[10px] font-bold text-slate-800">{formatDate(status.completed_at)}</dd></div>
              <div className="rounded-2xl bg-slate-50 p-3"><dt className="text-[9px] font-bold text-slate-400">الجداول</dt><dd className="mt-1 text-[11px] font-black text-slate-800">{status.manifest?.table_count ?? tables.length}</dd></div>
              <div className="rounded-2xl bg-slate-50 p-3"><dt className="text-[9px] font-bold text-slate-400">النوع</dt><dd className="mt-1 text-[10px] font-bold text-slate-800">نسخة منطقية منظمة</dd></div>
            </dl>

            <div className="mt-4 rounded-2xl border border-amber-100 bg-amber-50 p-3 text-[10px] leading-5 text-amber-800">
              هذه ليست حتى الآن نسخة SQL Server <span dir="ltr">.bak</span> قابلة لاستعادة البرنامج حرفيًا؛ هي نسخة سحابية للبيانات المنظمة والوصول والتقارير. النسخة الفيزيائية الكاملة ستعامل كطبقة مستقلة بعد اختبار الاستعادة.
            </div>

            <div className="mt-5 rounded-2xl border border-slate-100 bg-slate-50 p-4">
              <div className="flex items-start gap-3">
                <Database className="mt-0.5 h-5 w-5 shrink-0 text-slate-600" />
                <div>
                  <strong className="text-xs text-slate-900">الوصول إلى البيانات عبر شاشات محاسبية منظمة</strong>
                  <p className="mt-1 text-[10px] leading-5 text-slate-500">
                    يحتفظ سند بالنسخة المنظمة ويعرضها من خلال كشوف الحساب والفواتير والتقارير. استعراض صفوف الجداول الخام مخصص للتشخيص الداخلي ولا يظهر للمستخدم العادي.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {tables.slice(0, 8).map((table) => (
                      <span key={table.table_name} className="rounded-full bg-white px-2.5 py-1 text-[9px] font-bold text-slate-600 ring-1 ring-inset ring-slate-200">
                        {table.table_name} · {table.row_count ?? 0}
                      </span>
                    ))}
                    {tables.length > 8 && (
                      <span className="rounded-full bg-slate-900 px-2.5 py-1 text-[9px] font-bold text-white">
                        +{tables.length - 8} جدول
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </section>
  );
}

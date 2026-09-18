import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArchiveRestore,
  ChevronDown,
  Cloud,
  Database,
  Loader2,
  RefreshCw,
  Table2,
} from 'lucide-react';
import {
  getBusinessErpSnapshotStatus,
  getBusinessErpSnapshotTableRows,
  type BusinessErpSnapshotRow,
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
  const [selectedTable, setSelectedTable] = useState('');
  const [rows, setRows] = useState<BusinessErpSnapshotRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [tableLoading, setTableLoading] = useState(false);
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
      const first = next.manifest?.tables?.find((item) => item.table_name)?.table_name || '';
      setSelectedTable((current) => current || first);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'تعذر تحميل النسخة السحابية.');
    } finally {
      setLoading(false);
    }
  }, [businessId]);

  const loadTable = useCallback(async (tableName: string) => {
    if (!tableName) {
      setRows([]);
      setTotal(0);
      return;
    }
    setTableLoading(true);
    setError(null);
    try {
      const result = await getBusinessErpSnapshotTableRows(businessId, tableName, 100, 0);
      setRows(result.items);
      setTotal(result.total);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'تعذر تحميل بيانات الجدول.');
    } finally {
      setTableLoading(false);
    }
  }, [businessId]);

  useEffect(() => { void loadStatus(); }, [loadStatus]);
  useEffect(() => {
    if (status?.available && selectedTable) void loadTable(selectedTable);
  }, [status?.available, selectedTable, loadTable]);

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

            <div className="mt-5">
              <div className="mb-2 flex items-center gap-2"><Table2 className="h-4 w-4 text-slate-500" /><strong className="text-xs text-slate-900">استعراض بيانات المصدر</strong></div>
              <label className="relative block">
                <select value={selectedTable} onChange={(event) => setSelectedTable(event.target.value)} className="w-full appearance-none rounded-xl border border-slate-200 bg-white px-3 py-3 pl-9 text-xs font-bold outline-none">
                  {tables.map((table) => <option key={table.table_name} value={table.table_name}>{table.table_name} · {table.row_count ?? 0} سجل</option>)}
                </select>
                <ChevronDown className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              </label>
              <p className="mt-2 text-[9px] text-slate-400">يعرض أول 100 سجل من أصل {total}. هذه واجهة فنية مؤقتة قبل بناء شاشات العملاء وكشوف الحساب والفواتير بالمسميات العربية.</p>
            </div>

            <div className="mt-3 space-y-2">
              {tableLoading ? (
                <div className="flex min-h-24 items-center justify-center gap-2 text-xs text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />جارٍ تحميل البيانات…</div>
              ) : rows.map((row) => (
                <article key={row.row_key} className="rounded-2xl border border-slate-100 bg-slate-50/60 p-3">
                  <div className="grid gap-2 sm:grid-cols-2">
                    {Object.entries(row.row_data || {}).map(([key, value]) => (
                      <div key={key} className="min-w-0 rounded-xl bg-white p-2.5">
                        <span className="block truncate text-[8px] font-bold text-slate-400" dir="ltr">{key}</span>
                        <span className="mt-1 block break-words text-[10px] font-semibold text-slate-800">{formatValue(value)}</span>
                      </div>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}

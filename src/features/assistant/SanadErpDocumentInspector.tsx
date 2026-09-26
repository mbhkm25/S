import { useEffect, useState } from 'react';
import { AlertTriangle, FileText, Loader2, X } from 'lucide-react';
import {
  getBusinessErpDocumentDetail,
  type BusinessErpDocumentDetail,
} from '../../lib/businessAccountingApi';
import { formatSanadSourceAmount } from '../../utils/sanadSourceDisplay';
import { formatSanadErpLedgerDate } from '../../utils/sanadErpLedgerDate';
import type { SanadErpDocumentTarget } from './sanadEntityContext';

/**
 * Read-only source document inspector: reuses the existing authorized RPC.
 * Never derive a posted invoice net from source line totals, discount or tax.
 */
export default function SanadErpDocumentInspector({
  target,
  onClose,
  showClose = true,
}: {
  target: SanadErpDocumentTarget;
  onClose: () => void;
  showClose?: boolean;
}) {
  const [detail, setDetail] = useState<BusinessErpDocumentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    setDetail(null);
    setError(null);
    setLoading(true);
    void getBusinessErpDocumentDetail(target.businessId, target.documentKind, target.documentId)
      .then((result) => {
        if (!active) return;
        if (result.status !== 'ok' || !result.header) {
          setError('تعذر تحميل المستند من النسخة السحابية الحالية.');
          return;
        }
        // An old link might resolve to a changed document. Never present
        // inconsistent identities or kinds under a trusted-looking header.
        if (result.header.document_id !== target.documentId ||
            result.header.document_kind !== target.documentKind) {
          setError('معرّف المستند المستلم لا يطابق المستند المطلوب.');
          return;
        }
        setDetail(result);
      })
      .catch(() => {
        if (active) setError('تعذرت قراءة المستند، أو لم تعد لديك صلاحية الوصول إليه.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [target.businessId, target.documentKind, target.documentId]);

  const header = detail?.header;
  const currency = header?.english_code || header?.arabic_code || header?.currency_name || null;
  const displayDate = formatSanadErpLedgerDate(header?.document_date);
  return (
    <section dir="rtl" aria-label="تفاصيل المستند المحاسبي" data-sanad-entity-inspector="erp-document"
      className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-3 py-3 sm:px-4 sm:py-4">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cyan-100 text-teal-800">
            <FileText aria-hidden="true" className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="text-[11px] font-medium text-slate-500">
              {target.documentKind === 'sale' ? 'فاتورة بيع' : 'فاتورة شراء'} · نسخة المصدر
            </p>
            <h3 className="mt-1 break-words text-base font-semibold leading-7 text-slate-900 sm:text-lg">
              {header?.party_name || (loading ? 'جارٍ قراءة المستند…' : 'تفاصيل المستند')}
            </h3>
            <p className="mt-0.5 text-xs text-slate-600">
              رقم المستند <bdi dir="ltr" className="font-semibold text-slate-900">#{header?.document_number || target.documentId}</bdi>
              {header?.document_date ? <> <span aria-hidden="true">·</span> {displayDate.valid ? displayDate.text : `تاريخ المصدر: ${displayDate.text}`}</> : null}
            </p>
          </div>
        </div>
        {showClose ? (
          <button type="button" aria-label="إغلاق تفاصيل المستند" onClick={onClose}
            className="sanad-focus-ring flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-50">
            <X aria-hidden="true" className="h-4 w-4" />
          </button>
        ) : null}
      </header>
      {loading ? <p role="status" className="flex items-center gap-2 px-4 py-5 text-xs text-slate-600">
        <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin motion-reduce:animate-none" />
        جارٍ التحقق من المستند وصلاحية قراءته…
      </p> : null}
      {error ? <p role="alert" className="m-3 flex gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-6 text-amber-900">
        <AlertTriangle aria-hidden="true" className="mt-1 h-4 w-4 shrink-0" />{error}
      </p> : null}
      {detail && header ? (
        <div className="min-w-0 px-3 pb-4 sm:px-4">
          <dl className="grid grid-cols-2 gap-x-5 gap-y-3 border-b border-slate-100 py-4 sm:grid-cols-3">
            <div><dt className="text-[11px] text-slate-500">العملة</dt><dd className="mt-1 text-sm font-semibold text-slate-900">{currency || 'غير محددة'}</dd></div>
            <div><dt className="text-[11px] text-slate-500">طريقة الدفع</dt><dd className="mt-1 text-sm font-medium text-slate-900">{header.payment_method || 'غير متاحة'}</dd></div>
            <div className="col-span-2 min-w-0 sm:col-span-1">
              <dt className="text-[11px] text-slate-500">مرجع نسخة المصدر</dt>
              <dd className="mt-1 break-all text-xs text-slate-600" dir="ltr">{detail.snapshot_public_id || 'غير متاح'}</dd>
            </div>
          </dl>
          <details data-sanad-source-caveat="compact" className="my-3 rounded-lg border border-amber-200/75 bg-amber-50/70 text-xs text-amber-950">
            <summary className="sanad-focus-ring min-h-10 cursor-pointer px-3 py-2.5 font-medium leading-5">
              من النسخة السحابية · لم تُعتمد المطابقة المالية مع إبداع الحي
            </summary>
            <p className="border-t border-amber-200/60 px-3 pb-3 pt-2 leading-6">
              بيانات هذا العرض للقراءة فقط. قيم البنود مأخوذة من المصدر ولا تعني بالضرورة صافي الفاتورة؛
              قارن المستند بتقرير إبداع الحالي قبل أي تحصيل أو تسوية.
            </p>
          </details>
          <div className="mb-2 flex items-baseline justify-between gap-2">
            <h4 className="text-sm font-semibold text-slate-900">الأصناف والبنود</h4>
            <span className="text-xs text-slate-500">{detail.lines.length} بند</span>
          </div>
          <div role="region" aria-label="جدول بنود المستند" tabIndex={0}
            className="min-w-0 overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full min-w-[580px] text-right text-[13px]">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-600">
                <tr>
                  <th scope="col" className="px-3 py-3 font-medium">الصنف</th>
                  <th scope="col" className="px-3 py-3 font-medium">الوحدة</th>
                  <th scope="col" className="px-3 py-3 font-medium">الكمية</th>
                  <th scope="col" className="px-3 py-3 font-medium">سعر الوحدة</th>
                  <th scope="col" className="px-3 py-3 font-medium">قيمة البند من المصدر</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {detail.lines.map((line) => (
                  <tr key={line.line_id} className="align-top">
                    <td className="min-w-[160px] px-3 py-3 font-medium leading-6 text-slate-900">{line.class_name || line.class_number || '—'}</td>
                    <td className="px-3 py-3 text-slate-600">{line.unit_name || '—'}</td>
                    <td className="whitespace-nowrap px-3 py-3 tabular-nums text-slate-800" dir="ltr">{formatSanadSourceAmount(line.quantity).text}</td>
                    <td className="whitespace-nowrap px-3 py-3 tabular-nums text-slate-800" dir="ltr">{formatSanadSourceAmount(line.unit_price, currency).text}</td>
                    <td className="whitespace-nowrap px-3 py-3 font-semibold tabular-nums text-slate-900" dir="ltr">{formatSanadSourceAmount(line.source_total_amount, currency).text}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </section>
  );
}

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
}: {
  target: SanadErpDocumentTarget;
  onClose: () => void;
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
      className="mt-3 min-w-0 rounded-xl border border-slate-200 bg-white p-3 sm:p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-cyan-50 text-slate-700">
            <FileText aria-hidden="true" className="h-4 w-4" />
          </span>
          <div>
            <p className="text-sm font-semibold text-slate-900">
              {target.documentKind === 'sale' ? 'فاتورة بيع' : 'فاتورة شراء'} · من المصدر
            </p>
            <p className="mt-1 text-xs leading-5 text-slate-500">عرض للقراءة فقط وفق صلاحيات مشروع الأعمال الحالي.</p>
          </div>
        </div>
        <button type="button" aria-label="إغلاق تفاصيل المستند" onClick={onClose}
          className="sanad-focus-ring flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100">
          <X aria-hidden="true" className="h-4 w-4" />
        </button>
      </div>
      {loading ? <p role="status" className="mt-3 flex items-center gap-2 text-xs text-slate-500">
        <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin motion-reduce:animate-none" />
        جاري التحقق من المستند وصلاحيات القراءة…
      </p> : null}
      {error ? <p role="alert" className="mt-3 flex gap-2 rounded-lg bg-amber-50 p-3 text-xs leading-6 text-amber-900">
        <AlertTriangle aria-hidden="true" className="mt-1 h-4 w-4 shrink-0" />{error}
      </p> : null}
      {detail && header ? (
        <>
          <dl className="mt-3 grid grid-cols-1 gap-2 border-t border-slate-100 pt-3 text-xs sm:grid-cols-2">
            <div><dt className="text-slate-500">رقم المستند</dt><dd className="mt-1 font-semibold text-slate-900"><bdi dir="ltr">{header.document_number || header.document_id}</bdi></dd></div>
            <div><dt className="text-slate-500">الطرف</dt><dd className="mt-1 font-medium text-slate-900">{header.party_name || 'غير متاح في المصدر'}</dd></div>
            <div><dt className="text-slate-500">التاريخ</dt><dd className="mt-1 text-slate-900">{displayDate.valid ? displayDate.text : 'تاريخ المصدر: ' + displayDate.text}</dd></div>
            <div><dt className="text-slate-500">العملة وطريقة الدفع</dt><dd className="mt-1 text-slate-900">{currency || 'عملة غير محددة'} · {header.payment_method || 'غير متاح'}</dd></div>
          </dl>
          <p className="mt-3 break-all text-[11px] text-slate-500">
            نسخة المصدر: <bdi dir="ltr">{detail.snapshot_public_id || 'غير متاح'}</bdi>
          </p>
          <p role="note" className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs leading-6 text-amber-900">
            بيانات النسخة السحابية غير معتمدة بوصفها مطابقة نهائية لتقرير إبداع الحي.
            قيم البنود الأصلية لا تعني بالضرورة صافي الفاتورة.
          </p>
          <p className="mt-4 text-xs font-semibold text-slate-700">البنود: {detail.lines.length}</p>
          <div role="region" aria-label="جدول بنود المستند" tabIndex={0} className="mt-2 min-w-0 overflow-x-auto">
            <table className="w-full min-w-[580px] text-right text-xs">
              <thead className="border-y border-slate-100 bg-slate-50 text-slate-600">
                <tr>
                  <th className="p-2 font-medium">الصنف</th>
                  <th className="p-2 font-medium">الوحدة</th>
                  <th className="p-2 font-medium">الكمية</th>
                  <th className="p-2 font-medium">سعر الوحدة</th>
                  <th className="p-2 font-medium">قيمة البند من المصدر</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {detail.lines.map((line) => (
                  <tr key={line.line_id}>
                    <td className="p-2">{line.class_name || line.class_number || '—'}</td>
                    <td className="p-2">{line.unit_name || '—'}</td>
                    <td className="p-2" dir="ltr">{formatSanadSourceAmount(line.quantity).text}</td>
                    <td className="p-2" dir="ltr">{formatSanadSourceAmount(line.unit_price, currency).text}</td>
                    <td className="p-2" dir="ltr">{formatSanadSourceAmount(line.source_total_amount, currency).text}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </section>
  );
}

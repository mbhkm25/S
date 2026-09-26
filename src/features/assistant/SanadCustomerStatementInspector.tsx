import { useEffect, useState } from 'react';
import { AlertTriangle, ChevronDown, Loader2, X } from 'lucide-react';
import {
  getBusinessErpCustomerStatement,
  type BusinessErpCustomerStatement,
} from '../../lib/businessAccountingApi';
import { formatSanadSourceAmount, formatSanadSourceDate } from '../../utils/sanadSourceDisplay';
import { formatSanadErpLedgerDate } from '../../utils/sanadErpLedgerDate';
import type { SanadCustomerStatementTarget } from './sanadEntityContext';

/**
 * Stage 2C.4: a read-only view of the EXISTING, business-authorized ERP RPC.
 * The caller only passes IDs from a server-verified business thread; the RPC
 * independently rechecks active owner/member access on every open.
 * No source balance, financial action or grant is cached in conversation state.
 */
const PAGE_SIZE = 25;

function amount(value: number | string | null | undefined, code?: string | null): string {
  return formatSanadSourceAmount(value, code).text;
}

function readDate(value?: string | null): string {
  const result = formatSanadSourceDate(value);
  return result.valid || result.text === '—' ? result.text : `المصدر: ${result.text}`;
}

function ledgerDate(value?: string | null): string {
  const result = formatSanadErpLedgerDate(value);
  return result.valid || result.text === '—' ? result.text : `تاريخ المصدر: ${result.text}`;
}

function currencyCode(row: {
  english_code?: string | null;
  arabic_code?: string | null;
  currency_name?: string | null;
}): string | null {
  return row.english_code || row.arabic_code || row.currency_name || null;
}

export default function SanadCustomerStatementInspector({
  target,
  onClose,
}: {
  target: SanadCustomerStatementTarget;
  onClose: () => void;
}) {
  const [statement, setStatement] = useState<BusinessErpCustomerStatement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [readAt, setReadAt] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  useEffect(() => {
    let active = true;
    setStatement(null);
    setError(null);
    setLoading(true);
    setVisibleCount(PAGE_SIZE);
    void getBusinessErpCustomerStatement(
      target.businessId,
      target.accountId,
      target.fromDate || null,
      target.toDate || null,
    ).then((data) => {
      if (!active) return;
      if (data.status !== 'ok') {
        setError(data.status === 'snapshot_unavailable'
          ? 'لا تتوفر نسخة محاسبية مكتملة لهذا النشاط.'
          : 'تعذر عرض الكشف من المصدر المحاسبي الحالي.');
        return;
      }
      setStatement(data);
      setReadAt(new Date().toISOString());
    }).catch((cause: unknown) => {
      if (active) setError('تعذرت قراءة كشف الحساب من المصدر، أو لم تعد لديك صلاحية الوصول إليه.');
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [target.businessId, target.accountId, target.fromDate, target.toDate]);

  return (
    <section aria-label="تفاصيل كشف حساب العميل" data-sanad-entity-inspector="erp-customer-statement"
      className="mt-3 min-w-0 rounded-[var(--sanad-radius-md)] border border-[var(--sanad-border-subtle)] bg-[var(--sanad-surface-1)] p-3 sm:p-4" dir="rtl">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900">كشف الحساب · عرض من المصدر</p>
          <p className="mt-1 text-xs leading-6 text-slate-500">قراءة جديدة تخضع لصلاحيات النشاط. لا ينشئ هذا العرض أي حركة مالية.</p>
        </div>
        <button type="button" onClick={onClose} aria-label="إغلاق تفاصيل كشف الحساب"
          className="sanad-focus-ring flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100">
          <X className="h-4 w-4" />
        </button>
      </div>
      {loading ? (
        <div role="status" className="mt-4 flex items-center gap-2 text-xs text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />جارٍ إعادة قراءة المصدر والتحقق من الصلاحية…
        </div>
      ) : null}
      {error ? (
        <div role="alert" className="mt-3 flex gap-2 rounded-xl bg-amber-50 p-3 text-xs leading-6 text-amber-900">
          <AlertTriangle className="mt-1 h-4 w-4 shrink-0" />{error}
        </div>
      ) : null}
      {statement ? (
        <>
          <p role="note" data-sanad-parity-warning="unverified" className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-6 text-amber-900">
            هذه بيانات آخر نسخة سحابية متاحة لسند، ولم نتحقق بعد من مطابقتها لكشف إبداع الحالي.
            يوجد اختلاف موثق في أحد الحسابات، فلا تعتمد هذا الرصيد للتحصيل أو التسوية قبل المقارنة بالمصدر.
          </p>
          <div className="mt-3 border-t border-slate-100 pt-3">
            <p className="text-sm font-medium text-slate-900">{statement.identity?.customer_name || statement.account?.account_name || 'حساب عميل'}</p>
            <p className="mt-1 text-xs text-slate-500">رقم الحساب: <bdi dir="ltr">{statement.account?.account_number || statement.account?.account_id || '—'}</bdi></p>
            <p className="mt-1 break-all text-[11px] text-slate-500">معرّف النسخة: <bdi dir="ltr">{statement.snapshot_public_id || 'غير متاح'}</bdi></p>
            <p className="mt-1 text-[11px] text-slate-500">
              وقت القراءة: {readDate(readAt)} · لا يثبت هذا الوقت حداثة مزامنة النظام المحاسبي.
            </p>
            {statement.identity?.identity_status === 'warning_multiple_names_on_account' ? (
              <p role="note" className="mt-2 text-xs text-amber-800">قد يرتبط هذا الحساب بأكثر من اسم عميل في المصدر؛ لا نفترض تطابق الهويات.</p>
            ) : null}
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {(statement.totals_by_currency || []).map((total, index) => {
              const code = currencyCode(total);
              return (
                <dl key={`${total.currency_id ?? code ?? 'unknown'}-${index}`} className="rounded-xl border border-slate-100 p-3">
                  <dt className="text-xs text-slate-600">{code || 'عملة غير محددة'}</dt>
                  <dd className="mt-1 text-lg font-semibold text-slate-900" dir="ltr">{amount(total.closing_balance, code)}</dd>
                  <dd className="mt-2 grid grid-cols-3 gap-2 text-[11px] text-slate-600">
                    <span>افتتاحي <bdi dir="ltr" className="block">{amount(total.opening_balance, code)}</bdi></span>
                    <span>مدين <bdi dir="ltr" className="block">{amount(total.debit, code)}</bdi></span>
                    <span>دائن <bdi dir="ltr" className="block">{amount(total.credit, code)}</bdi></span>
                  </dd>
                </dl>
              );
            })}
          </div>
          <div className="mt-4">
            <p className="mb-2 text-xs font-semibold text-slate-700">حركات الحساب: {statement.items.length}</p>
            <div className="min-w-0 overflow-x-auto" role="region" aria-label="جدول حركات الحساب" tabIndex={0}>
              <table className="w-full min-w-[600px] text-right text-xs">
                <thead className="border-y border-slate-100 bg-slate-50 text-slate-600">
                  <tr><th className="p-2 font-medium">التاريخ</th><th className="p-2 font-medium">الوصف</th>
                    <th className="p-2 font-medium">العملة</th><th className="p-2 font-medium">مدين</th>
                    <th className="p-2 font-medium">دائن</th><th className="p-2 font-medium">الرصيد</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {statement.items.slice(0, visibleCount).map((item, index) => {
                    const code = currencyCode(item);
                    return (
                      <tr key={`${item.detail_id}-${item.entry_id}-${index}`}>
                        <td className="whitespace-nowrap p-2">{ledgerDate(item.date)}</td>
                        <td className="max-w-[16rem] p-2">{item.description || item.doc_number || '—'}</td>
                        <td className="p-2"><bdi dir="auto">{code || '—'}</bdi></td>
                        <td className="p-2" dir="ltr">{amount(item.debit, code)}</td>
                        <td className="p-2" dir="ltr">{amount(item.credit, code)}</td>
                        <td className="p-2" dir="ltr">{amount(item.running_balance, code)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {statement.items.length > visibleCount ? (
              <button type="button" onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}
                className="sanad-focus-ring mt-3 inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-xs font-medium text-slate-700 hover:bg-slate-50">
                عرض {Math.min(PAGE_SIZE, statement.items.length - visibleCount)} حركة إضافية <ChevronDown className="h-4 w-4" />
              </button>
            ) : null}
          </div>
          <p className="mt-3 text-[11px] leading-5 text-slate-500">
            هذا العرض يستخدم عقد كشف الحساب الحالي. قد تفقد الأرقام الكبيرة جدًا دقتها الأصلية في عقد JSON الحالي؛ معالجة النقل النصي الكامل منفصلة في #384.
          </p>
        </>
      ) : null}
    </section>
  );
}

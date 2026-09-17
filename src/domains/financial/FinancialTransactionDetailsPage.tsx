import { FormEvent, useCallback, useEffect, useState } from 'react';
import { AlertTriangle, ArrowRight, CheckCircle2, Landmark, Link2, Loader2, ReceiptText, RotateCcw, ShieldCheck, X } from 'lucide-react';
import {
  getFinancialTransactionDetail,
  reverseFinancialTransaction,
  type FinancialTransactionDetail,
} from './financialTransactionAuditApi';

interface Props {
  transactionId: string;
  onBack: () => void;
  onOpenTransaction: (transactionId: string) => void;
  onOpenOperation: (token: string) => void;
}

function money(value: number, currency: string): string {
  return `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value)} ${currency}`;
}

function dateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('ar-YE', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function typeLabel(type: FinancialTransactionDetail['transaction']['transaction_type']): string {
  if (type === 'income') return 'دخل';
  if (type === 'expense') return 'مصروف';
  if (type === 'transfer') return 'تحويل';
  if (type === 'liability') return 'التزام';
  if (type === 'settlement') return 'تسوية';
  return 'قيد تصحيح';
}

function sourceLabel(source: FinancialTransactionDetail['transaction']['source']): string {
  if (source === 'sanad_operation') return 'من عملية سند';
  if (source === 'assistant') return 'مساعد سند';
  if (source === 'import') return 'استيراد';
  return 'إدخال يدوي';
}

export default function FinancialTransactionDetailsPage({ transactionId, onBack, onOpenTransaction, onOpenOperation }: Props) {
  const [detail, setDetail] = useState<FinancialTransactionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showReverse, setShowReverse] = useState(false);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setDetail(await getFinancialTransactionDetail(transactionId));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'تعذر تحميل تفاصيل القيد.');
    } finally {
      setLoading(false);
    }
  }, [transactionId]);

  useEffect(() => { void load(); }, [load]);

  const submitReverse = async (event: FormEvent) => {
    event.preventDefault();
    const cleanReason = reason.trim();
    if (cleanReason.length < 5) {
      setError('اكتب سببًا واضحًا للعكس لا يقل عن 5 أحرف.');
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await reverseFinancialTransaction(transactionId, cleanReason);
      setShowReverse(false);
      setReason('');
      setSuccess('تم إنشاء قيد عكسي مستقل. القيد الأصلي لم يُعدّل أو يُحذف.');
      await load();
      if (!result.reversal_transaction_id) setError('تم العكس لكن تعذر تحديد القيد العكسي.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'تعذر عكس القيد المالي.');
    } finally {
      setSaving(false);
    }
  };

  const canReverse = Boolean(detail && detail.transaction.status === 'posted' && !detail.reversal && !detail.reverses);

  return (
    <main className="mx-auto w-full max-w-2xl px-4 pb-6 pt-4" dir="rtl">
      <header className="mb-5 flex items-center gap-3">
        <button type="button" onClick={onBack} aria-label="رجوع" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700 shadow-sm"><ArrowRight className="h-5 w-5" /></button>
        <div><p className="text-[11px] font-bold text-emerald-700">سند المالي · أثر تدقيق</p><h1 className="mt-0.5 text-[22px] font-black text-slate-950">تفاصيل القيد</h1></div>
      </header>

      {loading ? (
        <div className="flex min-h-[55vh] items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-slate-400" /></div>
      ) : error && !detail ? (
        <section className="rounded-[28px] border border-rose-100 bg-white p-6 text-center shadow-sm"><p className="text-sm font-black text-slate-900">تعذر فتح القيد</p><p className="mt-2 text-[12px] leading-6 text-slate-500">{error}</p><button type="button" onClick={() => void load()} className="mt-5 rounded-2xl bg-slate-950 px-5 py-3 text-[12px] font-black text-white">إعادة المحاولة</button></section>
      ) : !detail ? (
        <section className="rounded-[28px] border border-slate-200 bg-white p-6 text-center shadow-sm"><p className="text-sm font-black text-slate-900">القيد غير متاح</p><p className="mt-2 text-[12px] leading-6 text-slate-500">قد لا يكون القيد تابعًا لهذا الحساب أو لم يعد متاحًا.</p></section>
      ) : (
        <>
          {success && <div className="mb-4 flex items-start gap-2 rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-[11px] font-bold leading-5 text-emerald-800"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />{success}</div>}
          {error && <div className="mb-4 rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-[11px] font-bold leading-5 text-rose-700">{error}</div>}

          <section className="mb-4 rounded-[28px] border border-slate-200/80 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0"><p className="text-[11px] font-bold text-slate-400">{typeLabel(detail.transaction.transaction_type)} · {sourceLabel(detail.transaction.source)}</p><h2 className="mt-1 break-words text-[17px] font-black text-slate-950">{detail.transaction.description || detail.transaction.category_name || typeLabel(detail.transaction.transaction_type)}</h2><p className="mt-2 text-[11px] text-slate-400">{dateTime(detail.transaction.transaction_at)}</p></div>
              <p className="shrink-0 text-[18px] font-black text-slate-950">{money(detail.transaction.amount, detail.transaction.currency)}</p>
            </div>
            {detail.transaction.category_name && <div className="mt-4 rounded-2xl bg-slate-50 px-4 py-3 text-[11px] font-bold text-slate-600">التصنيف: {detail.transaction.category_name}</div>}
          </section>

          {detail.reversal && (
            <section className="mb-4 rounded-[24px] border border-amber-200 bg-amber-50 p-4">
              <div className="flex items-start gap-3"><RotateCcw className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" /><div className="min-w-0 flex-1"><p className="text-[12px] font-black text-slate-900">هذا القيد تم عكسه</p><p className="mt-1 text-[11px] leading-5 text-slate-600">{detail.reversal.reason}</p><button type="button" onClick={() => onOpenTransaction(detail.reversal!.reversal_transaction_id)} className="mt-3 text-[11px] font-black text-amber-800">فتح القيد العكسي</button></div></div>
            </section>
          )}

          {detail.reverses && (
            <section className="mb-4 rounded-[24px] border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-slate-600" /><div className="min-w-0 flex-1"><p className="text-[12px] font-black text-slate-900">هذا قيد عكسي</p><p className="mt-1 text-[11px] leading-5 text-slate-600">سبب العكس: {detail.reverses.reason}</p><button type="button" onClick={() => onOpenTransaction(detail.reverses!.original_transaction_id)} className="mt-3 text-[11px] font-black text-emerald-700">فتح القيد الأصلي</button></div></div>
            </section>
          )}

          <section className="mb-4 rounded-[28px] border border-slate-200/80 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center gap-2"><Landmark className="h-4 w-4 text-slate-500" /><h2 className="text-[14px] font-black text-slate-950">أطراف القيد</h2></div>
            <div className="divide-y divide-slate-100">
              {detail.postings.map((posting) => (
                <div key={posting.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                  <div className="min-w-0"><p className="truncate text-[12px] font-black text-slate-900">{posting.account_name}</p><p className="mt-1 text-[10px] text-slate-400">{posting.direction === 'debit' ? 'مدين' : 'دائن'}{posting.account_status === 'archived' ? ' · حساب مؤرشف' : ''}</p></div>
                  <p className="shrink-0 text-[12px] font-black text-slate-700">{money(posting.amount, posting.currency)}</p>
                </div>
              ))}
            </div>
          </section>

          {detail.source_operations.length > 0 && (
            <section className="mb-4 rounded-[28px] border border-emerald-100 bg-emerald-50/60 p-4">
              <div className="mb-3 flex items-center gap-2"><Link2 className="h-4 w-4 text-emerald-700" /><h2 className="text-[14px] font-black text-slate-950">دليل سند المرتبط</h2></div>
              <div className="space-y-2">
                {detail.source_operations.map((operation) => (
                  <button key={`${operation.operation_id}-${operation.link_role}`} type="button" onClick={() => onOpenOperation(operation.public_token)} className="flex w-full items-center justify-between gap-3 rounded-2xl bg-white px-4 py-3 text-right shadow-sm">
                    <div className="min-w-0"><p className="truncate text-[12px] font-black text-slate-900">{operation.financial_entity || 'عملية سند'}</p><p className="mt-1 text-[10px] text-slate-400">{operation.amount !== null ? money(operation.amount, operation.currency || detail.transaction.currency) : 'فتح الدليل الأصلي'}</p></div>
                    <ReceiptText className="h-4 w-4 shrink-0 text-emerald-700" />
                  </button>
                ))}
              </div>
            </section>
          )}

          <section className="rounded-[28px] border border-slate-200/80 bg-white p-4 shadow-sm">
            <div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" /><div><p className="text-[12px] font-black text-slate-900">القيد المرحّل لا يُعدّل</p><p className="mt-1 text-[11px] leading-5 text-slate-500">إذا كان القيد خاطئًا، ينشئ سند قيدًا عكسيًا مستقلًا يحفظ الأثر المحاسبي والتاريخي بدل حذف الأصل أو تغييره.</p></div></div>
            {canReverse && <button type="button" onClick={() => { setShowReverse(true); setError(null); setSuccess(null); }} className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 text-[12px] font-black text-rose-700"><RotateCcw className="h-4 w-4" />عكس هذا القيد</button>}
          </section>
        </>
      )}

      {showReverse && detail && (
        <div className="fixed inset-0 z-[90] flex items-end justify-center bg-slate-950/40 backdrop-blur-[2px] sm:items-center sm:p-4" role="dialog" aria-modal="true">
          <form onSubmit={submitReverse} className="w-full max-w-lg rounded-t-[30px] bg-white p-5 shadow-2xl sm:rounded-[30px]">
            <div className="mb-4 flex items-start justify-between gap-3"><div><p className="text-[11px] font-bold text-rose-600">تصحيح محاسبي</p><h2 className="mt-1 text-[19px] font-black text-slate-950">عكس القيد</h2></div><button type="button" onClick={() => setShowReverse(false)} className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-100 text-slate-600"><X className="h-4 w-4" /></button></div>
            <div className="mb-4 flex items-start gap-2 rounded-2xl bg-amber-50 px-4 py-3 text-[11px] leading-5 text-amber-800"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />لن يُحذف القيد الأصلي. سيُنشأ قيد جديد يعكس أثره بالكامل، وسيبقى القيدان مرتبطين في سجل التدقيق.</div>
            <label className="block"><span className="mb-2 block text-[11px] font-black text-slate-600">سبب العكس</span><textarea value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} rows={4} placeholder="مثال: تم تسجيل العملية على حساب غير صحيح" className="w-full resize-none rounded-2xl border border-slate-200 bg-white p-4 text-[12px] font-bold leading-6 outline-none" /></label>
            <button type="submit" disabled={saving || reason.trim().length < 5} className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 text-[12px] font-black text-white disabled:opacity-50">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}تأكيد وإنشاء القيد العكسي</button>
          </form>
        </div>
      )}
    </main>
  );
}

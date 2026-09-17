import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeftRight, Loader2, RefreshCw } from 'lucide-react';
import { getSettlementCandidates, settleCommercialDocument } from './api/financialApi';
import type { SettlementCandidates, SettlementInvoiceCandidate, SettlementPaymentCandidate } from './api/financialTypes';

const inputClass = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm outline-none focus:border-slate-400';
const labelClass = 'mb-1.5 block text-[10px] font-bold text-slate-500';

function formatAmount(value: number, currency: string) {
  const amount = new Intl.NumberFormat('ar-YE-u-nu-latn', { maximumFractionDigits: 2 }).format(Number(value || 0));
  if (currency === 'YER') return `${amount} ر.ي`;
  if (currency === 'SAR') return `${amount} ر.س`;
  return `${amount} ${currency}`;
}

function invoiceLabel(item: SettlementInvoiceCandidate) {
  const type = item.document_type === 'sales_invoice' ? 'فاتورة بيع' : item.document_type === 'purchase_invoice' ? 'فاتورة شراء' : 'مصروف';
  return `${type} ${item.document_number || ''} — ${item.party_name || 'بدون اسم'} — متبقي ${formatAmount(item.outstanding_amount, item.currency)}`;
}

function paymentLabel(item: SettlementPaymentCandidate) {
  const type = item.document_type === 'receipt' ? 'سند قبض' : 'سند صرف';
  return `${type} ${item.document_number || ''} — متاح ${formatAmount(item.available_amount, item.currency)}`;
}

export default function CommercialSettlementPanel({ businessId, onChanged }: { businessId: string; onChanged: () => void }) {
  const [data, setData] = useState<SettlementCandidates | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [invoiceId, setInvoiceId] = useState('');
  const [paymentId, setPaymentId] = useState('');
  const [amount, setAmount] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    const result = await getSettlementCandidates(businessId);
    if (result.error) {
      setError(result.error.message || 'تعذر تحميل المستندات القابلة للتسوية.');
      setData(null);
    } else {
      const next = result.data || { contract_version: 1, business_id: businessId, invoices: [], payments: [] };
      setData(next);
      setInvoiceId(current => next.invoices.some(item => item.id === current) ? current : (next.invoices[0]?.id || ''));
    }
    setLoading(false);
  }, [businessId]);

  useEffect(() => { void load(); }, [load]);

  const selectedInvoice = useMemo(() => data?.invoices.find(item => item.id === invoiceId) || null, [data, invoiceId]);
  const compatiblePayments = useMemo(() => {
    if (!selectedInvoice || !data) return [];
    return data.payments.filter(item =>
      item.party_id === selectedInvoice.party_id &&
      item.currency === selectedInvoice.currency &&
      item.document_type === selectedInvoice.compatible_payment_type &&
      item.available_amount > 0
    );
  }, [data, selectedInvoice]);

  useEffect(() => {
    setPaymentId(current => compatiblePayments.some(item => item.id === current) ? current : (compatiblePayments[0]?.id || ''));
    if (selectedInvoice) setAmount(String(selectedInvoice.outstanding_amount));
  }, [compatiblePayments, selectedInvoice]);

  const selectedPayment = compatiblePayments.find(item => item.id === paymentId) || null;
  const maxSettlement = selectedInvoice && selectedPayment ? Math.min(selectedInvoice.outstanding_amount, selectedPayment.available_amount) : 0;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!selectedInvoice || !selectedPayment) return;
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0 || numericAmount > maxSettlement) {
      setError(`المبلغ يجب أن يكون أكبر من صفر وألا يتجاوز ${formatAmount(maxSettlement, selectedInvoice.currency)}.`);
      return;
    }
    setSubmitting(true); setError(''); setSuccess('');
    void settleCommercialDocument(selectedInvoice.id, selectedPayment.id, amount)
      .then(result => {
        if (result.error) throw new Error(result.error.message || 'تعذر تنفيذ التسوية');
        setSuccess('تمت التسوية وتحديث الرصيد المتبقي بنجاح.');
        onChanged();
        return load();
      })
      .catch(cause => setError(cause instanceof Error ? cause.message : 'تعذر تنفيذ التسوية'))
      .finally(() => setSubmitting(false));
  };

  return <section className="rounded-[1.5rem] border border-slate-100 bg-white p-4 shadow-sm">
    <div className="flex items-start justify-between gap-3">
      <div className="flex items-center gap-2"><ArrowLeftRight className="mt-0.5 h-5 w-5 text-indigo-700" /><div><h3 className="text-sm font-black">تسوية ذكية</h3><p className="mt-1 text-[10px] leading-5 text-slate-500">يعرض فقط المستندات المرحّلة المتوافقة في الطرف والعملة ونوع القبض أو الصرف.</p></div></div>
      <button type="button" onClick={() => void load()} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500" aria-label="تحديث"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /></button>
    </div>
    {loading ? <div className="mt-4 flex min-h-24 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div> : null}
    {!loading && error ? <div className="mt-4 rounded-xl bg-rose-50 px-3 py-2 text-xs leading-5 text-rose-800">{error}</div> : null}
    {!loading && success ? <div className="mt-4 rounded-xl bg-emerald-50 px-3 py-2 text-xs leading-5 text-emerald-800">{success}</div> : null}
    {!loading && !error && data && data.invoices.length === 0 ? <div className="mt-4 rounded-xl bg-slate-50 px-3 py-3 text-xs leading-6 text-slate-600">لا توجد حاليًا فواتير أو مصروفات مرحّلة ذات رصيد متبقٍ.</div> : null}
    {!loading && data && data.invoices.length > 0 ? <form className="mt-4 space-y-3" onSubmit={submit}>
      <label><span className={labelClass}>المستند المطلوب تسويته</span><select value={invoiceId} onChange={event => setInvoiceId(event.target.value)} className={inputClass}>{data.invoices.map(item => <option key={item.id} value={item.id}>{invoiceLabel(item)}</option>)}</select></label>
      <label><span className={labelClass}>المستند المالي المتوافق</span><select required value={paymentId} onChange={event => setPaymentId(event.target.value)} className={inputClass}><option value="">{compatiblePayments.length ? 'اختر المستند' : 'لا يوجد قبض/صرف متوافق'}</option>{compatiblePayments.map(item => <option key={item.id} value={item.id}>{paymentLabel(item)}</option>)}</select></label>
      {selectedInvoice && selectedPayment ? <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-3 text-[10px] leading-5 text-slate-600"><div><span className="block font-bold text-slate-800">متبقي المستند</span>{formatAmount(selectedInvoice.outstanding_amount, selectedInvoice.currency)}</div><div><span className="block font-bold text-slate-800">المتاح في القبض/الصرف</span>{formatAmount(selectedPayment.available_amount, selectedPayment.currency)}</div></div> : null}
      <label><span className={labelClass}>مبلغ التسوية</span><input required inputMode="decimal" value={amount} onChange={event => setAmount(event.target.value)} className={inputClass} /></label>
      <button disabled={submitting || !selectedPayment || maxSettlement <= 0} className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-700 py-3 text-xs font-bold text-white disabled:opacity-50">{submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowLeftRight className="h-4 w-4" />} تنفيذ التسوية</button>
    </form> : null}
  </section>;
}

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Loader2, RefreshCcw, Scale } from 'lucide-react';
import {
  getPersonalCorrectionCandidates,
  reversePersonalTransaction,
  settlePersonalObligation,
} from './api/financialApi';
import type {
  PersonalCorrectionCandidates,
  PersonalObligationCandidate,
  PersonalReversalCandidate,
  PersonalSettlementTransactionCandidate,
} from './api/financialTypes';

const inputClass = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm outline-none focus:border-slate-400';

function money(value: number, currency: string) {
  return new Intl.NumberFormat('ar-YE', { maximumFractionDigits: 2 }).format(Number(value || 0)) + ' ' + currency;
}

export default function PersonalFinanceCorrectionPanel({ onChanged }: { onChanged: () => void }) {
  const [data, setData] = useState<PersonalCorrectionCandidates | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [notice, setNotice] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [obligationId, setObligationId] = useState('');
  const [transactionId, setTransactionId] = useState('');
  const [amount, setAmount] = useState('');
  const [reversalId, setReversalId] = useState('');
  const [reason, setReason] = useState('');

  const load = async () => {
    setLoading(true);
    const result = await getPersonalCorrectionCandidates();
    if (result.error) {
      setNotice({ kind: 'error', text: result.error.message || 'تعذر تحميل بيانات التصحيح.' });
      setData(null);
    } else {
      setData(result.data);
    }
    setLoading(false);
  };

  useEffect(() => { void load(); }, []);

  const selectedObligation = useMemo(
    () => data?.obligations.find((item) => item.id === obligationId) || null,
    [data, obligationId],
  );

  const compatibleTransactions = useMemo(() => {
    if (!selectedObligation || !data) return [];
    return data.transactions.filter((item) => {
      if (item.currency !== selectedObligation.currency || item.available_amount <= 0) return false;
      if (selectedObligation.obligation_type === 'payable') return item.transaction_type === 'expense' || item.transaction_type === 'settlement';
      return item.transaction_type === 'income' || item.transaction_type === 'settlement';
    });
  }, [data, selectedObligation]);

  useEffect(() => {
    if (!compatibleTransactions.some((item) => item.id === transactionId)) setTransactionId('');
  }, [compatibleTransactions, transactionId]);

  const settle = async (event: FormEvent) => {
    event.preventDefault();
    if (!obligationId || !transactionId || !amount) return;
    setWorking(true); setNotice(null);
    const result = await settlePersonalObligation(obligationId, transactionId, amount);
    if (result.error) {
      setNotice({ kind: 'error', text: result.error.message || 'تعذر تنفيذ التسوية.' });
    } else {
      setNotice({ kind: 'success', text: 'تمت تسوية الالتزام وتحديث رصيده.' });
      setAmount(''); setTransactionId('');
      await load(); onChanged();
    }
    setWorking(false);
  };

  const reverse = async (event: FormEvent) => {
    event.preventDefault();
    if (!reversalId || reason.trim().length < 5) return;
    setWorking(true); setNotice(null);
    const result = await reversePersonalTransaction(reversalId, reason.trim());
    if (result.error) {
      setNotice({ kind: 'error', text: result.error.message || 'تعذر عكس العملية.' });
    } else {
      setNotice({ kind: 'success', text: 'تم إنشاء قيد عكسي موثق للعملية.' });
      setReversalId(''); setReason('');
      await load(); onChanged();
    }
    setWorking(false);
  };

  if (loading) {
    return <div className="flex min-h-32 items-center justify-center rounded-[1.5rem] bg-white"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>;
  }

  return (
    <section className="space-y-3">
      {notice ? <div className={`rounded-xl px-3 py-2 text-xs leading-5 ${notice.kind === 'success' ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-800'}`}>{notice.text}</div> : null}

      <section className="rounded-[1.5rem] border border-slate-100 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-2"><Scale className="h-4 w-4 text-sky-700" /><h3 className="text-sm font-black">تسوية الالتزامات</h3></div>
        <p className="mt-1 text-[10px] leading-5 text-slate-500">اربط التزامًا مفتوحًا بعملية مالية مرحّلة ومتوافقة في النوع والعملة. يمنع الخادم تجاوز أي رصيد.</p>
        {!data?.obligations.length ? (
          <div className="mt-4 rounded-xl bg-slate-50 p-3 text-xs text-slate-500">لا توجد التزامات مفتوحة تحتاج إلى تسوية.</div>
        ) : (
          <form className="mt-4 space-y-3" onSubmit={settle}>
            <select required value={obligationId} onChange={(event) => setObligationId(event.target.value)} className={inputClass}>
              <option value="">اختر الالتزام</option>
              {data.obligations.map((item: PersonalObligationCandidate) => <option key={item.id} value={item.id}>{item.title} — {money(item.outstanding_amount, item.currency)}</option>)}
            </select>
            <select required disabled={!selectedObligation} value={transactionId} onChange={(event) => setTransactionId(event.target.value)} className={inputClass}>
              <option value="">اختر العملية المسددة</option>
              {compatibleTransactions.map((item: PersonalSettlementTransactionCandidate) => <option key={item.id} value={item.id}>{item.description || item.transaction_type} — متاح {money(item.available_amount, item.currency)}</option>)}
            </select>
            {selectedObligation && compatibleTransactions.length === 0 ? <div className="rounded-xl bg-amber-50 p-3 text-[10px] leading-5 text-amber-800">لا توجد عملية مرحّلة متوافقة مع هذا الالتزام. سجّل عملية دفع/تحصيل أولًا ثم عد للتسوية.</div> : null}
            <input required inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} className={inputClass} placeholder="مبلغ التسوية" />
            <button disabled={working || !transactionId} className="w-full rounded-xl bg-sky-700 py-3 text-xs font-bold text-white disabled:opacity-50">{working ? 'جارٍ التنفيذ…' : 'تنفيذ التسوية'}</button>
          </form>
        )}
      </section>

      <section className="rounded-[1.5rem] border border-rose-100 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-2"><RefreshCcw className="h-4 w-4 text-rose-700" /><h3 className="text-sm font-black">عكس عملية مالية</h3></div>
        <div className="mt-2 flex gap-2 rounded-xl bg-amber-50 p-3 text-[10px] leading-5 text-amber-900"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><span>العكس لا يحذف العملية الأصلية؛ ينشئ قيدًا معاكسًا ويحافظ على أثر التدقيق. العمليات المرتبطة بتسويات نشطة لا يمكن عكسها مباشرة.</span></div>
        {!data?.reversible_transactions.length ? (
          <div className="mt-4 rounded-xl bg-slate-50 p-3 text-xs text-slate-500">لا توجد عمليات مؤهلة للعكس حاليًا.</div>
        ) : (
          <form className="mt-4 space-y-3" onSubmit={reverse}>
            <select required value={reversalId} onChange={(event) => setReversalId(event.target.value)} className={inputClass}>
              <option value="">اختر العملية</option>
              {data.reversible_transactions.map((item: PersonalReversalCandidate) => <option key={item.id} value={item.id}>{item.description || item.transaction_type} — {money(item.amount, item.currency)}</option>)}
            </select>
            <textarea required minLength={5} maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} className={inputClass} rows={3} placeholder="سبب العكس — 5 أحرف على الأقل" />
            <button disabled={working || !reversalId || reason.trim().length < 5} className="w-full rounded-xl bg-rose-700 py-3 text-xs font-bold text-white disabled:opacity-50">{working ? 'جارٍ التنفيذ…' : 'إنشاء قيد عكسي'}</button>
          </form>
        )}
      </section>
    </section>
  );
}

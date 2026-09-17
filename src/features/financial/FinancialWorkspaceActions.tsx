import { FormEvent, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, FilePlus2, Loader2, ReceiptText, Target, WalletCards } from 'lucide-react';
import {
  createCommercialDraft,
  createPersonalBudget,
  createPersonalGoal,
  createPersonalObligation,
  createPersonalTransaction,
  getBusinessParties,
  getPersonalMasterData,
  postCommercialDocument,
} from './api/financialApi';
import type { BusinessParty, PersonalAccount, PersonalCategory, PersonalParty } from './api/financialTypes';

type Notice = { kind: 'success' | 'error'; text: string } | null;

const inputClass = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm outline-none focus:border-slate-400';
const labelClass = 'mb-1.5 block text-[10px] font-bold text-slate-500';

function NoticeBox({ notice }: { notice: Notice }) {
  if (!notice) return null;
  return <div className={`rounded-xl px-3 py-2 text-xs leading-5 ${notice.kind === 'success' ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-800'}`}>{notice.text}</div>;
}

function ActionSection({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[1.5rem] border border-slate-100 bg-white p-4 shadow-sm">
      <h3 className="text-sm font-black text-slate-950">{title}</h3>
      <p className="mt-1 text-[10px] leading-5 text-slate-500">{description}</p>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function PersonalFinanceActions({ onChanged }: { onChanged: () => void }) {
  const [mode, setMode] = useState<'transaction' | 'budget' | 'obligation' | 'goal'>('transaction');
  const [accounts, setAccounts] = useState<PersonalAccount[]>([]);
  const [categories, setCategories] = useState<PersonalCategory[]>([]);
  const [parties, setParties] = useState<PersonalParty[]>([]);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  const [transactionType, setTransactionType] = useState<'expense' | 'income'>('expense');
  const [accountId, setAccountId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('YER');
  const [description, setDescription] = useState('');

  const [budgetName, setBudgetName] = useState('');
  const [budgetAmount, setBudgetAmount] = useState('');
  const [budgetStart, setBudgetStart] = useState(new Date().toISOString().slice(0, 10));
  const [budgetEnd, setBudgetEnd] = useState(new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString().slice(0, 10));

  const [obligationType, setObligationType] = useState<'payable' | 'receivable'>('payable');
  const [obligationTitle, setObligationTitle] = useState('');
  const [obligationAmount, setObligationAmount] = useState('');
  const [obligationParty, setObligationParty] = useState('');
  const [obligationDue, setObligationDue] = useState('');

  const [goalName, setGoalName] = useState('');
  const [goalAmount, setGoalAmount] = useState('');
  const [goalDate, setGoalDate] = useState('');

  useEffect(() => {
    let active = true;
    void getPersonalMasterData().then(result => {
      if (!active) return;
      if (result.error) {
        setNotice({ kind: 'error', text: result.error.message || 'تعذر تحميل البيانات المالية الأساسية.' });
        return;
      }
      setAccounts(result.accounts);
      setCategories(result.categories);
      setParties(result.parties);
      const first = result.accounts[0];
      if (first) { setAccountId(first.id); setCurrency(first.currency); }
    });
    return () => { active = false; };
  }, []);

  const filteredCategories = useMemo(() => categories.filter(item => item.kind === transactionType), [categories, transactionType]);

  const run = async (task: () => Promise<{ error: { message?: string } | null }>, success: string) => {
    setLoading(true); setNotice(null);
    try {
      const result = await task();
      if (result.error) throw new Error(result.error.message || 'تعذر تنفيذ العملية');
      setNotice({ kind: 'success', text: success });
      onChanged();
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'تعذر تنفيذ العملية' });
    } finally { setLoading(false); }
  };

  const submitTransaction = (event: FormEvent) => {
    event.preventDefault();
    void run(() => createPersonalTransaction({
      transaction_type: transactionType,
      account_id: accountId,
      category_id: categoryId || null,
      amount,
      currency,
      description,
    }), transactionType === 'expense' ? 'تم تسجيل المصروف وترحيله.' : 'تم تسجيل الدخل وترحيله.');
  };

  const submitBudget = (event: FormEvent) => {
    event.preventDefault();
    void run(() => createPersonalBudget({
      name: budgetName,
      amount: budgetAmount,
      currency,
      period_start: budgetStart,
      period_end: budgetEnd,
      category_id: categoryId || null,
    }), 'تم إنشاء الميزانية.');
  };

  const submitObligation = (event: FormEvent) => {
    event.preventDefault();
    void run(() => createPersonalObligation({
      obligation_type: obligationType,
      title: obligationTitle,
      amount: obligationAmount,
      currency,
      party_id: obligationParty || null,
      due_date: obligationDue || null,
    }), 'تم إنشاء الالتزام المالي.');
  };

  const submitGoal = (event: FormEvent) => {
    event.preventDefault();
    void run(() => createPersonalGoal({
      name: goalName,
      target_amount: goalAmount,
      currency,
      target_date: goalDate || null,
      linked_account_id: accountId || null,
    }), 'تم إنشاء هدف الادخار.');
  };

  return (
    <section className="space-y-3">
      <div className="grid grid-cols-4 gap-2 rounded-[1.3rem] bg-white p-2 shadow-sm">
        {([
          ['transaction', 'دخل/مصروف', WalletCards], ['budget', 'ميزانية', ReceiptText], ['obligation', 'التزام', FilePlus2], ['goal', 'هدف', Target],
        ] as const).map(([value, label, Icon]) => (
          <button key={value} type="button" onClick={() => { setMode(value); setNotice(null); }} className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl text-[9px] font-bold ${mode === value ? 'bg-emerald-700 text-white' : 'bg-slate-50 text-slate-600'}`}>
            <Icon className="h-4 w-4" />{label}
          </button>
        ))}
      </div>
      <NoticeBox notice={notice} />

      {mode === 'transaction' && <ActionSection title="عملية مالية" description="يتم إنشاء القيود المحاسبية وترحيلها من خلال العقد المالي المعتمد، وليس من الواجهة مباشرة.">
        <form className="space-y-3" onSubmit={submitTransaction}>
          <div className="grid grid-cols-2 gap-3"><button type="button" onClick={() => setTransactionType('expense')} className={`rounded-xl py-3 text-xs font-bold ${transactionType === 'expense' ? 'bg-rose-600 text-white' : 'bg-slate-100'}`}>مصروف</button><button type="button" onClick={() => setTransactionType('income')} className={`rounded-xl py-3 text-xs font-bold ${transactionType === 'income' ? 'bg-emerald-600 text-white' : 'bg-slate-100'}`}>دخل</button></div>
          <label><span className={labelClass}>الحساب</span><select required value={accountId} onChange={event => { setAccountId(event.target.value); const account = accounts.find(item => item.id === event.target.value); if (account) setCurrency(account.currency); }} className={inputClass}><option value="">اختر الحساب</option>{accounts.map(account => <option key={account.id} value={account.id}>{account.name} — {account.currency}</option>)}</select></label>
          <label><span className={labelClass}>التصنيف</span><select value={categoryId} onChange={event => setCategoryId(event.target.value)} className={inputClass}><option value="">بدون تصنيف</option>{filteredCategories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
          <div className="grid grid-cols-[1fr_92px] gap-3"><label><span className={labelClass}>المبلغ</span><input required inputMode="decimal" value={amount} onChange={event => setAmount(event.target.value)} className={inputClass} /></label><label><span className={labelClass}>العملة</span><input readOnly value={currency} className={`${inputClass} bg-slate-50`} /></label></div>
          <label><span className={labelClass}>البيان</span><input value={description} onChange={event => setDescription(event.target.value)} className={inputClass} placeholder="مثال: مشتريات منزل" /></label>
          <button disabled={loading || !accountId} className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-950 py-3 text-xs font-bold text-white disabled:opacity-50">{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} تسجيل وترحيل</button>
        </form>
      </ActionSection>}

      {mode === 'budget' && <ActionSection title="ميزانية جديدة" description="حدد فترة وحدًا للإنفاق. يمكن ربط الميزانية بتصنيف مصروف أو تركها عامة."><form className="space-y-3" onSubmit={submitBudget}>
        <label><span className={labelClass}>اسم الميزانية</span><input required value={budgetName} onChange={event => setBudgetName(event.target.value)} className={inputClass} /></label>
        <label><span className={labelClass}>تصنيف المصروف</span><select value={categoryId} onChange={event => setCategoryId(event.target.value)} className={inputClass}><option value="">كل المصروفات</option>{categories.filter(category => category.kind === 'expense').map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
        <div className="grid grid-cols-2 gap-3"><label><span className={labelClass}>من</span><input type="date" required value={budgetStart} onChange={event => setBudgetStart(event.target.value)} className={inputClass} /></label><label><span className={labelClass}>إلى</span><input type="date" required value={budgetEnd} onChange={event => setBudgetEnd(event.target.value)} className={inputClass} /></label></div>
        <div className="grid grid-cols-[1fr_92px] gap-3"><label><span className={labelClass}>الحد</span><input required inputMode="decimal" value={budgetAmount} onChange={event => setBudgetAmount(event.target.value)} className={inputClass} /></label><label><span className={labelClass}>العملة</span><select value={currency} onChange={event => setCurrency(event.target.value)} className={inputClass}><option>YER</option><option>SAR</option><option>USD</option></select></label></div>
        <button disabled={loading} className="w-full rounded-xl bg-emerald-700 py-3 text-xs font-bold text-white disabled:opacity-50">إنشاء الميزانية</button>
      </form></ActionSection>}

      {mode === 'obligation' && <ActionSection title="التزام أو مستحق" description="سجل ما عليك أو ما لك مع تاريخ استحقاق اختياري وطرف مرتبط."><form className="space-y-3" onSubmit={submitObligation}>
        <div className="grid grid-cols-2 gap-3"><button type="button" onClick={() => setObligationType('payable')} className={`rounded-xl py-3 text-xs font-bold ${obligationType === 'payable' ? 'bg-amber-600 text-white' : 'bg-slate-100'}`}>عليّ</button><button type="button" onClick={() => setObligationType('receivable')} className={`rounded-xl py-3 text-xs font-bold ${obligationType === 'receivable' ? 'bg-sky-600 text-white' : 'bg-slate-100'}`}>لي</button></div>
        <label><span className={labelClass}>العنوان</span><input required value={obligationTitle} onChange={event => setObligationTitle(event.target.value)} className={inputClass} /></label>
        <label><span className={labelClass}>الطرف</span><select value={obligationParty} onChange={event => setObligationParty(event.target.value)} className={inputClass}><option value="">بدون طرف</option>{parties.map(party => <option key={party.id} value={party.id}>{party.display_name}</option>)}</select></label>
        <div className="grid grid-cols-[1fr_92px] gap-3"><label><span className={labelClass}>المبلغ</span><input required inputMode="decimal" value={obligationAmount} onChange={event => setObligationAmount(event.target.value)} className={inputClass} /></label><label><span className={labelClass}>العملة</span><select value={currency} onChange={event => setCurrency(event.target.value)} className={inputClass}><option>YER</option><option>SAR</option><option>USD</option></select></label></div>
        <label><span className={labelClass}>تاريخ الاستحقاق</span><input type="date" value={obligationDue} onChange={event => setObligationDue(event.target.value)} className={inputClass} /></label>
        <button disabled={loading} className="w-full rounded-xl bg-amber-600 py-3 text-xs font-bold text-white disabled:opacity-50">إنشاء الالتزام</button>
      </form></ActionSection>}

      {mode === 'goal' && <ActionSection title="هدف ادخار" description="أنشئ هدفًا ماليًا مرتبطًا بعملة وحساب اختياري."><form className="space-y-3" onSubmit={submitGoal}>
        <label><span className={labelClass}>اسم الهدف</span><input required value={goalName} onChange={event => setGoalName(event.target.value)} className={inputClass} /></label>
        <div className="grid grid-cols-[1fr_92px] gap-3"><label><span className={labelClass}>المبلغ المستهدف</span><input required inputMode="decimal" value={goalAmount} onChange={event => setGoalAmount(event.target.value)} className={inputClass} /></label><label><span className={labelClass}>العملة</span><select value={currency} onChange={event => setCurrency(event.target.value)} className={inputClass}><option>YER</option><option>SAR</option><option>USD</option></select></label></div>
        <label><span className={labelClass}>الحساب المرتبط</span><select value={accountId} onChange={event => setAccountId(event.target.value)} className={inputClass}><option value="">بدون حساب</option>{accounts.filter(account => account.currency === currency).map(account => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label>
        <label><span className={labelClass}>التاريخ المستهدف</span><input type="date" value={goalDate} onChange={event => setGoalDate(event.target.value)} className={inputClass} /></label>
        <button disabled={loading} className="w-full rounded-xl bg-indigo-700 py-3 text-xs font-bold text-white disabled:opacity-50">إنشاء الهدف</button>
      </form></ActionSection>}
    </section>
  );
}

export function CommercialActions({ businessId, onChanged }: { businessId: string; onChanged: () => void }) {
  const [parties, setParties] = useState<BusinessParty[]>([]);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [documentType, setDocumentType] = useState<'sales_invoice' | 'purchase_invoice' | 'receipt' | 'payment' | 'expense'>('sales_invoice');
  const [partyId, setPartyId] = useState('');
  const [number, setNumber] = useState('');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('YER');
  const [draftId, setDraftId] = useState('');

  useEffect(() => {
    let active = true;
    void getBusinessParties(businessId).then(result => {
      if (!active) return;
      if (result.error) {
        setNotice({ kind: 'error', text: result.error.message || 'تعذر تحميل الأطراف التجارية.' });
        return;
      }
      setParties(result.data || []);
    });
    return () => { active = false; };
  }, [businessId]);

  const createDraft = async (event: FormEvent) => {
    event.preventDefault(); setLoading(true); setNotice(null);
    try {
      const { data, error } = await createCommercialDraft({
        business_id: businessId,
        party_id: partyId || null,
        document_type: documentType,
        document_number: number || null,
        document_date: new Date().toISOString().slice(0, 10),
        currency,
        description,
        amount,
      });
      if (error) throw error;
      const id = String((data as Record<string, unknown>)?.document_id || '');
      setDraftId(id);
      setNotice({ kind: 'success', text: 'تم حفظ المستند كمسودة. راجعه ثم اضغط ترحيل.' });
      onChanged();
    } catch (error) { setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'تعذر حفظ المسودة' }); }
    finally { setLoading(false); }
  };

  const postDraft = async () => {
    if (!draftId) return;
    setLoading(true); setNotice(null);
    try {
      const { error } = await postCommercialDocument(draftId);
      if (error) throw error;
      setNotice({ kind: 'success', text: 'تم ترحيل المستند بنجاح.' });
      setDraftId('');
      onChanged();
    } catch (error) { setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'تعذر ترحيل المستند' }); }
    finally { setLoading(false); }
  };

  if (!businessId) return null;
  return (
    <section className="space-y-3">
      <NoticeBox notice={notice} />
      <ActionSection title="مستند تجاري جديد" description="المستند يحفظ أولًا كمسودة، ثم يرحّل بإجراء صريح بعد المراجعة.">
        <form className="space-y-3" onSubmit={createDraft}>
          <label><span className={labelClass}>نوع المستند</span><select value={documentType} onChange={event => setDocumentType(event.target.value as typeof documentType)} className={inputClass}><option value="sales_invoice">فاتورة بيع</option><option value="purchase_invoice">فاتورة شراء</option><option value="receipt">سند قبض</option><option value="payment">سند صرف</option><option value="expense">مصروف</option></select></label>
          <label><span className={labelClass}>الطرف</span><select value={partyId} onChange={event => setPartyId(event.target.value)} className={inputClass}><option value="">بدون طرف</option>{parties.map(party => <option key={party.id} value={party.id}>{party.display_name}</option>)}</select></label>
          <div className="grid grid-cols-2 gap-3"><label><span className={labelClass}>رقم المستند</span><input value={number} onChange={event => setNumber(event.target.value)} className={inputClass} /></label><label><span className={labelClass}>العملة</span><select value={currency} onChange={event => setCurrency(event.target.value)} className={inputClass}><option>YER</option><option>SAR</option><option>USD</option></select></label></div>
          <label><span className={labelClass}>البيان</span><input required value={description} onChange={event => setDescription(event.target.value)} className={inputClass} /></label>
          <label><span className={labelClass}>المبلغ</span><input required inputMode="decimal" value={amount} onChange={event => setAmount(event.target.value)} className={inputClass} /></label>
          <button disabled={loading} className="w-full rounded-xl bg-slate-950 py-3 text-xs font-bold text-white disabled:opacity-50">حفظ كمسودة</button>
        </form>
        {draftId ? <div className="mt-3 rounded-xl border border-emerald-100 bg-emerald-50 p-3"><p className="text-[10px] leading-5 text-emerald-800">المسودة جاهزة للمراجعة. الترحيل يجعل بياناتها المالية غير قابلة للتعديل المباشر.</p><button type="button" onClick={() => void postDraft()} disabled={loading} className="mt-2 w-full rounded-xl bg-emerald-700 py-3 text-xs font-bold text-white disabled:opacity-50">ترحيل المستند</button></div> : null}
      </ActionSection>
    </section>
  );
}

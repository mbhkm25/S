import { FormEvent, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, FilePlus2, Loader2, ReceiptText, Target, WalletCards } from 'lucide-react';
import { supabase } from '../../lib/supabase';

type PersonalAccount = { id: string; name: string; currency: string; account_type: string; system_role?: string | null };
type PersonalCategory = { id: string; name: string; kind: 'income' | 'expense' };
type PersonalParty = { id: string; display_name: string };
type BusinessParty = { id: string; display_name: string };
type CommercialDocument = { id: string; document_type: string; document_number: string | null; party_id: string | null; currency: string; total_amount: number; status: string };

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
    void Promise.all([
      supabase.from('personal_finance_accounts').select('id,name,currency,account_type,system_role').eq('status', 'active').is('system_role', null).order('name'),
      supabase.from('personal_finance_categories').select('id,name,kind').eq('status', 'active').order('name'),
      supabase.from('personal_finance_parties').select('id,display_name').eq('status', 'active').order('display_name'),
    ]).then(([accountResult, categoryResult, partyResult]) => {
      if (!active) return;
      setAccounts((accountResult.data || []) as PersonalAccount[]);
      setCategories((categoryResult.data || []) as PersonalCategory[]);
      setParties((partyResult.data || []) as PersonalParty[]);
      const first = (accountResult.data || [])[0] as PersonalAccount | undefined;
      if (first) { setAccountId(first.id); setCurrency(first.currency); }
    });
    return () => { active = false; };
  }, []);

  const filteredCategories = useMemo(() => categories.filter((item) => item.kind === transactionType), [categories, transactionType]);

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
    void run(async () => supabase.rpc('create_personal_finance_transaction_v1', { p_command: {
      transaction_type: transactionType,
      account_id: accountId,
      category_id: categoryId || null,
      amount,
      currency,
      description,
      source: 'manual',
      metadata: { ui_surface: 'financial_workspace' },
    } }), transactionType === 'expense' ? 'تم تسجيل المصروف وترحيله.' : 'تم تسجيل الدخل وترحيله.');
  };

  const submitBudget = (event: FormEvent) => {
    event.preventDefault();
    void run(async () => supabase.rpc('create_personal_finance_budget_v1', { p_command: {
      name: budgetName, amount: budgetAmount, currency, period_start: budgetStart, period_end: budgetEnd,
      category_id: categoryId || null, metadata: { ui_surface: 'financial_workspace' },
    } }), 'تم إنشاء الميزانية.');
  };

  const submitObligation = (event: FormEvent) => {
    event.preventDefault();
    void run(async () => supabase.rpc('create_personal_finance_obligation_v1', { p_command: {
      obligation_type: obligationType, title: obligationTitle, amount: obligationAmount, currency,
      party_id: obligationParty || null, due_date: obligationDue || null, metadata: { ui_surface: 'financial_workspace' },
    } }), 'تم إنشاء الالتزام المالي.');
  };

  const submitGoal = (event: FormEvent) => {
    event.preventDefault();
    void run(async () => supabase.rpc('create_personal_finance_goal_v1', { p_command: {
      name: goalName, target_amount: goalAmount, currency, target_date: goalDate || null,
      linked_account_id: accountId || null, metadata: { ui_surface: 'financial_workspace' },
    } }), 'تم إنشاء هدف الادخار.');
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
          <label><span className={labelClass}>الحساب</span><select required value={accountId} onChange={(e) => { setAccountId(e.target.value); const a = accounts.find(x => x.id === e.target.value); if (a) setCurrency(a.currency); }} className={inputClass}><option value="">اختر الحساب</option>{accounts.map(a => <option key={a.id} value={a.id}>{a.name} — {a.currency}</option>)}</select></label>
          <label><span className={labelClass}>التصنيف</span><select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={inputClass}><option value="">بدون تصنيف</option>{filteredCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
          <div className="grid grid-cols-[1fr_92px] gap-3"><label><span className={labelClass}>المبلغ</span><input required inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className={inputClass} /></label><label><span className={labelClass}>العملة</span><input readOnly value={currency} className={`${inputClass} bg-slate-50`} /></label></div>
          <label><span className={labelClass}>البيان</span><input value={description} onChange={(e) => setDescription(e.target.value)} className={inputClass} placeholder="مثال: مشتريات منزل" /></label>
          <button disabled={loading || !accountId} className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-950 py-3 text-xs font-bold text-white disabled:opacity-50">{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} تسجيل وترحيل</button>
        </form>
      </ActionSection>}

      {mode === 'budget' && <ActionSection title="ميزانية جديدة" description="حدد فترة وحدًا للإنفاق. يمكن ربط الميزانية بتصنيف مصروف أو تركها عامة."><form className="space-y-3" onSubmit={submitBudget}>
        <label><span className={labelClass}>اسم الميزانية</span><input required value={budgetName} onChange={(e) => setBudgetName(e.target.value)} className={inputClass} /></label>
        <label><span className={labelClass}>تصنيف المصروف</span><select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={inputClass}><option value="">كل المصروفات</option>{categories.filter(c => c.kind === 'expense').map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <div className="grid grid-cols-2 gap-3"><label><span className={labelClass}>من</span><input type="date" required value={budgetStart} onChange={(e) => setBudgetStart(e.target.value)} className={inputClass} /></label><label><span className={labelClass}>إلى</span><input type="date" required value={budgetEnd} onChange={(e) => setBudgetEnd(e.target.value)} className={inputClass} /></label></div>
        <div className="grid grid-cols-[1fr_92px] gap-3"><label><span className={labelClass}>الحد</span><input required inputMode="decimal" value={budgetAmount} onChange={(e) => setBudgetAmount(e.target.value)} className={inputClass} /></label><label><span className={labelClass}>العملة</span><select value={currency} onChange={(e) => setCurrency(e.target.value)} className={inputClass}><option>YER</option><option>SAR</option><option>USD</option></select></label></div>
        <button disabled={loading} className="w-full rounded-xl bg-emerald-700 py-3 text-xs font-bold text-white disabled:opacity-50">إنشاء الميزانية</button>
      </form></ActionSection>}

      {mode === 'obligation' && <ActionSection title="التزام أو مستحق" description="سجل ما عليك أو ما لك مع تاريخ استحقاق اختياري وطرف مرتبط."><form className="space-y-3" onSubmit={submitObligation}>
        <div className="grid grid-cols-2 gap-3"><button type="button" onClick={() => setObligationType('payable')} className={`rounded-xl py-3 text-xs font-bold ${obligationType === 'payable' ? 'bg-amber-600 text-white' : 'bg-slate-100'}`}>عليّ</button><button type="button" onClick={() => setObligationType('receivable')} className={`rounded-xl py-3 text-xs font-bold ${obligationType === 'receivable' ? 'bg-sky-600 text-white' : 'bg-slate-100'}`}>لي</button></div>
        <label><span className={labelClass}>العنوان</span><input required value={obligationTitle} onChange={(e) => setObligationTitle(e.target.value)} className={inputClass} /></label>
        <label><span className={labelClass}>الطرف</span><select value={obligationParty} onChange={(e) => setObligationParty(e.target.value)} className={inputClass}><option value="">بدون طرف</option>{parties.map(p => <option key={p.id} value={p.id}>{p.display_name}</option>)}</select></label>
        <div className="grid grid-cols-[1fr_92px] gap-3"><label><span className={labelClass}>المبلغ</span><input required inputMode="decimal" value={obligationAmount} onChange={(e) => setObligationAmount(e.target.value)} className={inputClass} /></label><label><span className={labelClass}>العملة</span><select value={currency} onChange={(e) => setCurrency(e.target.value)} className={inputClass}><option>YER</option><option>SAR</option><option>USD</option></select></label></div>
        <label><span className={labelClass}>تاريخ الاستحقاق</span><input type="date" value={obligationDue} onChange={(e) => setObligationDue(e.target.value)} className={inputClass} /></label>
        <button disabled={loading} className="w-full rounded-xl bg-amber-600 py-3 text-xs font-bold text-white disabled:opacity-50">إنشاء الالتزام</button>
      </form></ActionSection>}

      {mode === 'goal' && <ActionSection title="هدف ادخار" description="أنشئ هدفًا ماليًا مرتبطًا بعملة وحساب اختياري."><form className="space-y-3" onSubmit={submitGoal}>
        <label><span className={labelClass}>اسم الهدف</span><input required value={goalName} onChange={(e) => setGoalName(e.target.value)} className={inputClass} /></label>
        <div className="grid grid-cols-[1fr_92px] gap-3"><label><span className={labelClass}>المبلغ المستهدف</span><input required inputMode="decimal" value={goalAmount} onChange={(e) => setGoalAmount(e.target.value)} className={inputClass} /></label><label><span className={labelClass}>العملة</span><select value={currency} onChange={(e) => setCurrency(e.target.value)} className={inputClass}><option>YER</option><option>SAR</option><option>USD</option></select></label></div>
        <label><span className={labelClass}>الحساب المرتبط</span><select value={accountId} onChange={(e) => setAccountId(e.target.value)} className={inputClass}><option value="">بدون حساب</option>{accounts.filter(a => a.currency === currency).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
        <label><span className={labelClass}>التاريخ المستهدف</span><input type="date" value={goalDate} onChange={(e) => setGoalDate(e.target.value)} className={inputClass} /></label>
        <button disabled={loading} className="w-full rounded-xl bg-indigo-700 py-3 text-xs font-bold text-white disabled:opacity-50">إنشاء الهدف</button>
      </form></ActionSection>}
    </section>
  );
}

export function CommercialActions({ businessId, onChanged }: { businessId: string; onChanged: () => void }) {
  const [parties, setParties] = useState<BusinessParty[]>([]);
  const [documents, setDocuments] = useState<CommercialDocument[]>([]);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [documentType, setDocumentType] = useState<'sales_invoice' | 'purchase_invoice' | 'receipt' | 'payment' | 'expense'>('sales_invoice');
  const [partyId, setPartyId] = useState('');
  const [number, setNumber] = useState('');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('YER');
  const [draftId, setDraftId] = useState('');
  const [invoiceId, setInvoiceId] = useState('');
  const [paymentId, setPaymentId] = useState('');
  const [settlementAmount, setSettlementAmount] = useState('');

  const loadReferenceData = async () => {
    if (!businessId) return;
    const [partyResult, documentResult] = await Promise.all([
      supabase.from('business_parties').select('id,display_name').eq('business_id', businessId).eq('status', 'active').order('display_name'),
      supabase.from('business_commercial_documents').select('id,document_type,document_number,party_id,currency,total_amount,status').eq('business_id', businessId).eq('status', 'posted').order('created_at', { ascending: false }).limit(100),
    ]);
    setParties((partyResult.data || []) as BusinessParty[]);
    setDocuments((documentResult.data || []) as CommercialDocument[]);
  };

  useEffect(() => { void loadReferenceData(); }, [businessId]);

  const invoiceOptions = documents.filter(d => ['sales_invoice', 'purchase_invoice', 'expense'].includes(d.document_type));
  const paymentOptions = documents.filter(d => ['receipt', 'payment'].includes(d.document_type));

  const createDraft = async (event: FormEvent) => {
    event.preventDefault(); setLoading(true); setNotice(null);
    try {
      const { data, error } = await supabase.rpc('create_business_commercial_draft_v1', { p_command: {
        business_id: businessId, party_id: partyId || null, document_type: documentType,
        document_number: number || null, document_date: new Date().toISOString().slice(0, 10), currency,
        lines: [{ description: description || 'بند مالي', quantity: 1, unit_price: amount, discount_amount: 0, tax_amount: 0 }],
        metadata: { ui_surface: 'commercial_workspace' },
      } });
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
      const { error } = await supabase.rpc('post_business_commercial_document_v1', { p_document_id: draftId });
      if (error) throw error;
      setNotice({ kind: 'success', text: 'تم ترحيل المستند بنجاح.' });
      setDraftId('');
      await loadReferenceData();
      onChanged();
    } catch (error) { setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'تعذر ترحيل المستند' }); }
    finally { setLoading(false); }
  };

  const settle = async (event: FormEvent) => {
    event.preventDefault(); setLoading(true); setNotice(null);
    try {
      const { error } = await supabase.rpc('settle_business_commercial_document_v1', { p_invoice_document_id: invoiceId, p_payment_document_id: paymentId, p_amount: settlementAmount });
      if (error) throw error;
      setNotice({ kind: 'success', text: 'تمت التسوية الجزئية/الكاملة بنجاح.' });
      onChanged();
    } catch (error) { setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'تعذر تنفيذ التسوية' }); }
    finally { setLoading(false); }
  };

  if (!businessId) return null;
  return (
    <section className="space-y-3">
      <NoticeBox notice={notice} />
      <ActionSection title="مستند تجاري جديد" description="المستند يحفظ أولًا كمسودة، ثم يرحّل بإجراء صريح بعد المراجعة.">
        <form className="space-y-3" onSubmit={createDraft}>
          <label><span className={labelClass}>نوع المستند</span><select value={documentType} onChange={(e) => setDocumentType(e.target.value as typeof documentType)} className={inputClass}><option value="sales_invoice">فاتورة بيع</option><option value="purchase_invoice">فاتورة شراء</option><option value="receipt">سند قبض</option><option value="payment">سند صرف</option><option value="expense">مصروف</option></select></label>
          <label><span className={labelClass}>الطرف</span><select value={partyId} onChange={(e) => setPartyId(e.target.value)} className={inputClass}><option value="">بدون طرف</option>{parties.map(p => <option key={p.id} value={p.id}>{p.display_name}</option>)}</select></label>
          <div className="grid grid-cols-2 gap-3"><label><span className={labelClass}>رقم المستند</span><input value={number} onChange={(e) => setNumber(e.target.value)} className={inputClass} /></label><label><span className={labelClass}>العملة</span><select value={currency} onChange={(e) => setCurrency(e.target.value)} className={inputClass}><option>YER</option><option>SAR</option><option>USD</option></select></label></div>
          <label><span className={labelClass}>البيان</span><input required value={description} onChange={(e) => setDescription(e.target.value)} className={inputClass} /></label>
          <label><span className={labelClass}>المبلغ</span><input required inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className={inputClass} /></label>
          <button disabled={loading} className="w-full rounded-xl bg-slate-950 py-3 text-xs font-bold text-white disabled:opacity-50">حفظ كمسودة</button>
        </form>
        {draftId && <div className="mt-3 rounded-xl border border-emerald-100 bg-emerald-50 p-3"><p className="text-[10px] leading-5 text-emerald-800">المسودة جاهزة للمراجعة. الترحيل يجعل بياناتها المالية غير قابلة للتعديل المباشر.</p><button type="button" onClick={() => void postDraft()} disabled={loading} className="mt-2 w-full rounded-xl bg-emerald-700 py-3 text-xs font-bold text-white disabled:opacity-50">ترحيل المستند</button></div>}
      </ActionSection>

      <ActionSection title="تسوية مستندات" description="اربط فاتورة مرحّلة بسند قبض/صرف مرحّل. الخادم يمنع تجاوز الرصيد المتاح.">
        <form className="space-y-3" onSubmit={settle}>
          <label><span className={labelClass}>الفاتورة / المصروف</span><select required value={invoiceId} onChange={(e) => setInvoiceId(e.target.value)} className={inputClass}><option value="">اختر</option>{invoiceOptions.map(d => <option key={d.id} value={d.id}>{d.document_number || d.document_type} — {d.total_amount} {d.currency}</option>)}</select></label>
          <label><span className={labelClass}>سند القبض / الصرف</span><select required value={paymentId} onChange={(e) => setPaymentId(e.target.value)} className={inputClass}><option value="">اختر</option>{paymentOptions.map(d => <option key={d.id} value={d.id}>{d.document_number || d.document_type} — {d.total_amount} {d.currency}</option>)}</select></label>
          <label><span className={labelClass}>مبلغ التسوية</span><input required inputMode="decimal" value={settlementAmount} onChange={(e) => setSettlementAmount(e.target.value)} className={inputClass} /></label>
          <button disabled={loading || !invoiceId || !paymentId} className="w-full rounded-xl bg-sky-700 py-3 text-xs font-bold text-white disabled:opacity-50">تنفيذ التسوية</button>
        </form>
      </ActionSection>
    </section>
  );
}

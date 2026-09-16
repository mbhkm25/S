import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  FileCheck2,
  Landmark,
  Loader2,
  RefreshCw,
  ReceiptText,
  ShieldCheck,
  WalletCards,
  X,
} from 'lucide-react';
import {
  createFinanceFromOperation,
  getFinancialAccounts,
  getFinancialCategories,
  getLinkableFinancialOperations,
  type LinkableFinancialOperation,
  type PersonalFinanceAccount,
  type PersonalFinanceCategory,
} from './personalFinanceApi';

interface Props {
  onBack: () => void;
  onManageAccounts: () => void;
  onOpenOperation: (token: string) => void;
}

type IntakeType = 'income' | 'expense';

function money(value: number | null, currency: string | null): string {
  if (value === null) return 'المبلغ غير مستخرج';
  const formatted = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value);
  return currency ? `${formatted} ${currency}` : formatted;
}

function dateLabel(operation: LinkableFinancialOperation): string {
  const raw = operation.transaction_date || operation.created_at;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('ar-YE', { dateStyle: 'medium' }).format(date);
}

function directionLabel(direction: LinkableFinancialOperation['transaction_direction']): string {
  if (direction === 'incoming') return 'وارد';
  if (direction === 'outgoing') return 'صادر';
  if (direction === 'internal') return 'داخلي';
  return 'غير محسوم';
}

function operationTitle(operation: LinkableFinancialOperation): string {
  if (operation.receiver_name && operation.transaction_direction === 'outgoing') return operation.receiver_name;
  if (operation.sender_name && operation.transaction_direction === 'incoming') return operation.sender_name;
  if (operation.financial_entity) return operation.financial_entity;
  return 'عملية سند';
}

function localNoonIso(dateValue: string): string | undefined {
  if (!dateValue) return undefined;
  const date = new Date(`${dateValue}T12:00:00`);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

export default function FinancialOperationIntakePage({ onBack, onManageAccounts, onOpenOperation }: Props) {
  const [operations, setOperations] = useState<LinkableFinancialOperation[]>([]);
  const [accounts, setAccounts] = useState<PersonalFinanceAccount[]>([]);
  const [categories, setCategories] = useState<PersonalFinanceCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [selected, setSelected] = useState<LinkableFinancialOperation | null>(null);
  const [type, setType] = useState<IntakeType | ''>('');
  const [accountId, setAccountId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const [loadedOperations, loadedAccounts, loadedCategories] = await Promise.all([
        getLinkableFinancialOperations(80, false),
        getFinancialAccounts(),
        getFinancialCategories(),
      ]);
      setOperations(loadedOperations);
      setAccounts(loadedAccounts.filter((item) => item.status === 'active'));
      setCategories(loadedCategories.filter((item) => item.status === 'active'));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'تعذر تجهيز عمليات سند للمحاسب.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const compatibleAccounts = useMemo(() => {
    if (!selected?.currency || !/^[A-Z]{3}$/.test(selected.currency)) return accounts;
    return accounts.filter((account) => account.currency === selected.currency);
  }, [accounts, selected]);

  const compatibleCategories = useMemo(
    () => type ? categories.filter((category) => category.kind === type) : [],
    [categories, type],
  );

  const selectedAccount = useMemo(
    () => accounts.find((account) => account.id === accountId) ?? null,
    [accounts, accountId],
  );

  const amountNumber = Number(amount);
  const amountOverridden = Boolean(
    selected?.amount !== null
    && Number.isFinite(amountNumber)
    && amountNumber > 0
    && Math.abs(amountNumber - selected.amount) > 0.000001,
  );

  const openReview = (operation: LinkableFinancialOperation) => {
    const suggestion = operation.suggested_transaction_type;
    const initialAccounts = operation.currency && /^[A-Z]{3}$/.test(operation.currency)
      ? accounts.filter((account) => account.currency === operation.currency)
      : accounts;
    setSelected(operation);
    setType(suggestion || '');
    setAccountId(initialAccounts[0]?.id ?? '');
    setCategoryId('');
    setAmount(operation.amount && operation.amount > 0 ? String(operation.amount) : '');
    setDate(operation.transaction_date || operation.created_at.slice(0, 10));
    setDescription('');
    setError(null);
    setSuccess(null);
  };

  const closeReview = () => {
    if (saving) return;
    setSelected(null);
    setType('');
    setAccountId('');
    setCategoryId('');
    setAmount('');
    setDate('');
    setDescription('');
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!selected) return;
    if (!type) { setError('اختر هل ستُسجل العملية دخلًا أم مصروفًا.'); return; }
    if (!selectedAccount) { setError('اختر الحساب الذي ستُسجل عليه العملية.'); return; }
    if (!Number.isFinite(amountNumber) || amountNumber <= 0) { setError('أدخل مبلغًا صحيحًا أكبر من صفر.'); return; }

    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await createFinanceFromOperation({
        operation_id: selected.operation_id,
        transaction_type: type,
        account_id: selectedAccount.id,
        amount: amountNumber,
        category_id: categoryId || null,
        description: description.trim() || undefined,
        transaction_at: localNoonIso(date),
        metadata: { ui_surface: 'financial_operation_intake_v1' },
      });
      setOperations((current) => current.filter((item) => item.operation_id !== selected.operation_id));
      setSuccess(`تم تسجيل العملية في المحاسب بقيمة ${money(result.amount, result.currency)}. بقي أصل عملية سند دون تعديل.`);
      closeReview();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'تعذر إدخال العملية إلى المحاسب.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="mx-auto w-full max-w-2xl px-4 pb-6 pt-4" dir="rtl">
      <header className="mb-5 flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <button type="button" onClick={onBack} aria-label="رجوع" className="flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700 shadow-sm">
            <ArrowRight className="h-5 w-5" />
          </button>
          <div>
            <p className="text-[11px] font-bold text-emerald-700">سند المالي</p>
            <h1 className="mt-0.5 text-[22px] font-black text-slate-950">إدخال عمليات سند</h1>
            <p className="mt-1 text-[11px] leading-5 text-slate-500">راجع الدليل ثم قرر إن كان يستحق قيدًا في محاسبك الشخصي.</p>
          </div>
        </div>
        <button type="button" onClick={() => void load(true)} disabled={refreshing} aria-label="تحديث" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-600 shadow-sm disabled:opacity-50">
          {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        </button>
      </header>

      <section className="mb-5 flex items-start gap-3 rounded-[24px] border border-emerald-100 bg-emerald-50/70 p-4">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" />
        <div>
          <p className="text-[12px] font-black text-slate-900">عملية سند تبقى دليلًا، والقيد المحاسبي سجل مستقل</p>
          <p className="mt-1 text-[11px] leading-5 text-slate-600">لن نعدّل المبلغ أو الاتجاه أو بيانات التحليل في أصل العملية. أي مبلغ أو تصنيف تختاره هنا يُحفظ في دفتر مالي منفصل مع رابط مصدر قابل للتتبع.</p>
        </div>
      </section>

      {success && (
        <div className="mb-4 flex items-start gap-2 rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-[12px] font-bold leading-5 text-emerald-800">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{success}</span>
        </div>
      )}
      {error && <div className="mb-4 rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-[12px] font-bold leading-5 text-rose-700">{error}</div>}

      {!loading && !accounts.length && (
        <button type="button" onClick={onManageAccounts} className="mb-5 flex w-full items-center justify-between rounded-[26px] border border-amber-100 bg-amber-50/70 p-4 text-right">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-amber-700"><Landmark className="h-5 w-5" /></div>
            <div><p className="text-[13px] font-black text-slate-900">أضف حسابًا قبل إدخال العمليات</p><p className="mt-1 text-[10px] leading-5 text-slate-500">القيد يحتاج حسابًا يحدد أين دخل المال أو من أين خرج.</p></div>
          </div>
          <ArrowUpRight className="h-4 w-4 text-amber-700" />
        </button>
      )}

      {loading ? (
        <div className="flex min-h-[44vh] items-center justify-center"><div className="text-center text-slate-500"><Loader2 className="mx-auto h-7 w-7 animate-spin" /><p className="mt-3 text-[12px] font-bold">جاري قراءة العمليات المتاحة…</p></div></div>
      ) : operations.length ? (
        <section className="space-y-3">
          {operations.map((operation) => (
            <article key={operation.operation_id} className="rounded-[26px] border border-slate-200/80 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="mb-1 flex flex-wrap items-center gap-1.5">
                    <span className="rounded-full bg-slate-100 px-2 py-1 text-[9px] font-black text-slate-600">{directionLabel(operation.transaction_direction)}</span>
                    {operation.suggested_transaction_type && <span className="rounded-full bg-emerald-50 px-2 py-1 text-[9px] font-black text-emerald-700">اقتراح: {operation.suggested_transaction_type === 'expense' ? 'مصروف' : 'دخل'}</span>}
                  </div>
                  <h2 className="truncate text-[15px] font-black text-slate-950">{operationTitle(operation)}</h2>
                  <p className="mt-1 text-[10px] text-slate-400">{dateLabel(operation)}{operation.financial_entity ? ` · ${operation.financial_entity}` : ''}</p>
                </div>
                <p className="shrink-0 text-left text-[14px] font-black text-slate-950" dir="ltr">{money(operation.amount, operation.currency)}</p>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2 text-[10px] text-slate-500">
                <div className="rounded-2xl bg-slate-50 px-3 py-2"><span className="block text-[9px] text-slate-400">المرسل</span><strong className="mt-0.5 block truncate text-slate-700">{operation.sender_name || '—'}</strong></div>
                <div className="rounded-2xl bg-slate-50 px-3 py-2"><span className="block text-[9px] text-slate-400">المستلم</span><strong className="mt-0.5 block truncate text-slate-700">{operation.receiver_name || '—'}</strong></div>
              </div>

              <div className="mt-4 flex gap-2">
                <button type="button" onClick={() => openReview(operation)} disabled={!accounts.length} className="flex h-11 flex-1 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-3 text-[11px] font-black text-white disabled:opacity-40">
                  <FileCheck2 className="h-4 w-4" /> مراجعة وإدخال
                </button>
                <button type="button" onClick={() => onOpenOperation(operation.public_token)} className="flex h-11 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 text-[11px] font-black text-slate-700">
                  <ReceiptText className="h-4 w-4" /> الأصل
                </button>
              </div>
            </article>
          ))}
        </section>
      ) : (
        <section className="rounded-[28px] border border-slate-200/80 bg-white px-5 py-12 text-center shadow-sm">
          <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-600" />
          <h2 className="mt-3 text-[15px] font-black text-slate-950">لا توجد عمليات تنتظر الإدخال</h2>
          <p className="mx-auto mt-2 max-w-sm text-[11px] leading-5 text-slate-500">كل العمليات المتاحة حاليًا إما أُدخلت إلى المحاسب أو لا توجد عمليات مرفوعة على حسابك.</p>
        </section>
      )}

      {selected && (
        <div className="fixed inset-0 z-[90] flex items-end justify-center bg-slate-950/35 backdrop-blur-[2px] sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="مراجعة عملية سند قبل إدخالها إلى المحاسب">
          <form onSubmit={submit} className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-[30px] bg-white p-5 shadow-2xl sm:rounded-[30px]">
            <div className="mb-5 flex items-start justify-between gap-3">
              <div><p className="text-[11px] font-bold text-emerald-700">مراجعة قبل التسجيل</p><h2 className="mt-1 text-[19px] font-black text-slate-950">{operationTitle(selected)}</h2><p className="mt-1 text-[10px] text-slate-400">دليل سند: {money(selected.amount, selected.currency)}</p></div>
              <button type="button" onClick={closeReview} disabled={saving} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-600"><X className="h-4 w-4" /></button>
            </div>

            <div className="mb-4 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => { setType('expense'); setCategoryId(''); }} className={`h-12 rounded-2xl border text-[12px] font-black ${type === 'expense' ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-slate-200 bg-white text-slate-600'}`}>مصروف</button>
              <button type="button" onClick={() => { setType('income'); setCategoryId(''); }} className={`h-12 rounded-2xl border text-[12px] font-black ${type === 'income' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-white text-slate-600'}`}>دخل</button>
            </div>
            {selected.suggested_transaction_type && <p className="mb-4 text-[10px] leading-5 text-slate-500">اقتراح سند من اتجاه العملية: <strong>{selected.suggested_transaction_type === 'expense' ? 'مصروف' : 'دخل'}</strong>. القرار النهائي لك.</p>}

            <label className="mb-4 block">
              <span className="mb-2 block text-[11px] font-black text-slate-600">الحساب</span>
              <select value={accountId} onChange={(event) => setAccountId(event.target.value)} className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-3 text-[12px] font-bold outline-none">
                <option value="">اختر الحساب</option>
                {compatibleAccounts.map((account) => <option key={account.id} value={account.id}>{account.name} — {account.currency}</option>)}
              </select>
              {selected.currency && compatibleAccounts.length === 0 && <span className="mt-2 block text-[10px] leading-5 text-amber-700">لا يوجد لديك حساب بعملة {selected.currency}. أضف حسابًا بهذه العملة قبل إدخال العملية.</span>}
            </label>

            <label className="mb-4 block">
              <span className="mb-2 block text-[11px] font-black text-slate-600">المبلغ {selectedAccount ? `(${selectedAccount.currency})` : ''}</span>
              <input type="number" min="0.01" step="0.01" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-left text-[16px] font-black outline-none" dir="ltr" />
              {amountOverridden && <span className="mt-2 block text-[10px] leading-5 text-amber-700">المبلغ المحاسبي مختلف عن مبلغ الدليل في سند. سيُحفظ الاختلاف في السجل ولن يتغير أصل العملية.</span>}
            </label>

            {type && compatibleCategories.length > 0 && (
              <label className="mb-4 block"><span className="mb-2 block text-[11px] font-black text-slate-600">التصنيف</span><select value={categoryId} onChange={(event) => setCategoryId(event.target.value)} className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-3 text-[12px] font-bold outline-none"><option value="">بدون تصنيف</option>{compatibleCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
            )}

            <label className="mb-4 block"><span className="mb-2 block text-[11px] font-black text-slate-600">التاريخ</span><input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-3 text-[12px] font-bold outline-none" /></label>
            <label className="mb-5 block"><span className="mb-2 block text-[11px] font-black text-slate-600">البيان المحاسبي</span><input value={description} onChange={(event) => setDescription(event.target.value)} maxLength={500} placeholder={type === 'income' ? 'مثال: تحويل مستلم' : 'مثال: شراء أغراض المنزل'} className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-[12px] font-bold outline-none" /></label>

            <div className="mb-4 flex items-start gap-2 rounded-2xl bg-slate-50 p-3 text-[10px] leading-5 text-slate-500"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" /><span>بالتأكيد، سيُنشأ قيد مالي جديد مرتبط بهذه العملية كمصدر. لن نكتب فوق بيانات العملية الأصلية.</span></div>

            <button type="submit" disabled={saving || !type || !accountId || !amount || compatibleAccounts.length === 0} className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 text-[13px] font-black text-white disabled:opacity-50">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <WalletCards className="h-4 w-4" />} إدخال إلى المحاسب
            </button>
          </form>
        </div>
      )}
    </main>
  );
}

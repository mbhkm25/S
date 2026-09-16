import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowDownLeft, ArrowRight, ArrowUpRight, ArrowLeftRight, Loader2, Plus, WalletCards, X } from 'lucide-react';
import {
  createFinancialCategory,
  createFinancialTransaction,
  getFinancialAccounts,
  getFinancialActivity,
  getFinancialCategories,
  type PersonalFinanceAccount,
  type PersonalFinanceActivityItem,
  type PersonalFinanceCategory,
} from './personalFinanceApi';

interface Props {
  onBack: () => void;
  onManageAccounts: () => void;
}

type ComposerType = 'expense' | 'income' | 'transfer';

function money(value: number, currency: string): string {
  return `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value)} ${currency}`;
}

function dateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('ar-YE', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

export default function PersonalAccountingPage({ onBack, onManageAccounts }: Props) {
  const [accounts, setAccounts] = useState<PersonalFinanceAccount[]>([]);
  const [categories, setCategories] = useState<PersonalFinanceCategory[]>([]);
  const [activity, setActivity] = useState<PersonalFinanceActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [composer, setComposer] = useState<ComposerType | null>(null);
  const [saving, setSaving] = useState(false);
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [accountId, setAccountId] = useState('');
  const [destinationAccountId, setDestinationAccountId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [showCategoryCreator, setShowCategoryCreator] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [categorySaving, setCategorySaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [loadedAccounts, loadedCategories, loadedActivity] = await Promise.all([
        getFinancialAccounts(), getFinancialCategories(), getFinancialActivity(60),
      ]);
      setAccounts(loadedAccounts);
      setCategories(loadedCategories);
      setActivity(loadedActivity);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'تعذر تحميل المحاسب الشخصي.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const selectedAccount = useMemo(() => accounts.find((item) => item.id === accountId) ?? null, [accounts, accountId]);
  const composerCategories = useMemo(() => categories.filter((item) => item.kind === composer), [categories, composer]);
  const transferDestinations = useMemo(
    () => accounts.filter((item) => item.id !== accountId && (!selectedAccount || item.currency === selectedAccount.currency)),
    [accounts, accountId, selectedAccount],
  );

  const openComposer = (type: ComposerType) => {
    setComposer(type);
    setAmount('');
    setDescription('');
    setCategoryId('');
    setNewCategoryName('');
    setShowCategoryCreator(false);
    const first = accounts.find((item) => item.status === 'active');
    setAccountId(first?.id ?? '');
    setDestinationAccountId('');
    setError(null);
  };

  const addCategory = async () => {
    if (composer !== 'income' && composer !== 'expense') return;
    const name = newCategoryName.trim();
    if (!name) {
      setError('اكتب اسم التصنيف أولًا.');
      return;
    }

    setCategorySaving(true);
    setError(null);
    try {
      const id = await createFinancialCategory(composer, name);
      const refreshed = await getFinancialCategories();
      setCategories(refreshed);
      setCategoryId(id);
      setNewCategoryName('');
      setShowCategoryCreator(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'تعذر إنشاء التصنيف.');
    } finally {
      setCategorySaving(false);
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!composer) return;
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      setError('أدخل مبلغًا صحيحًا أكبر من صفر.');
      return;
    }
    if (!selectedAccount) {
      setError('اختر الحساب الذي ستُسجل عليه الحركة.');
      return;
    }
    if (composer === 'transfer' && !destinationAccountId) {
      setError('اختر الحساب المستلم للتحويل.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      if (composer === 'transfer') {
        await createFinancialTransaction({
          transaction_type: 'transfer',
          amount: numericAmount,
          source_account_id: selectedAccount.id,
          destination_account_id: destinationAccountId,
          description: description.trim() || undefined,
        });
      } else {
        await createFinancialTransaction({
          transaction_type: composer,
          amount: numericAmount,
          currency: selectedAccount.currency,
          account_id: selectedAccount.id,
          category_id: categoryId || null,
          description: description.trim() || undefined,
        });
      }
      setComposer(null);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'تعذر تسجيل الحركة المالية.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="mx-auto w-full max-w-2xl px-4 pb-6 pt-4" dir="rtl">
      <header className="mb-5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button type="button" onClick={onBack} aria-label="رجوع" className="flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700 shadow-sm"><ArrowRight className="h-5 w-5" /></button>
          <div><p className="text-[11px] font-bold text-emerald-700">سند المالي</p><h1 className="mt-0.5 text-[23px] font-black text-slate-950">المحاسب الشخصي</h1></div>
        </div>
        <button type="button" onClick={onManageAccounts} className="text-[11px] font-black text-emerald-700">الحسابات</button>
      </header>

      <section className="mb-5 grid grid-cols-3 gap-2">
        <Action icon={ArrowUpRight} label="مصروف" onClick={() => openComposer('expense')} disabled={!accounts.length} />
        <Action icon={ArrowDownLeft} label="دخل" onClick={() => openComposer('income')} disabled={!accounts.length} />
        <Action icon={ArrowLeftRight} label="تحويل" onClick={() => openComposer('transfer')} disabled={accounts.length < 2} />
      </section>

      {error && <div className="mb-4 rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-[12px] font-bold leading-5 text-rose-700">{error}</div>}

      {!loading && !accounts.length && (
        <button type="button" onClick={onManageAccounts} className="mb-5 flex w-full items-center justify-between rounded-[26px] border border-emerald-100 bg-emerald-50/70 p-4 text-right">
          <div className="flex items-center gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-emerald-700"><Plus className="h-5 w-5" /></div><div><p className="text-[13px] font-black text-slate-900">أضف حسابًا قبل تسجيل القيود</p><p className="mt-1 text-[10px] leading-5 text-slate-500">الحساب يحدد أين دخل المال أو من أين خرج.</p></div></div>
          <ArrowRight className="h-4 w-4 rotate-180 text-emerald-700" />
        </button>
      )}

      <section className="rounded-[28px] border border-slate-200/80 bg-white p-4 shadow-sm">
        <div className="mb-4"><p className="text-[11px] font-bold text-slate-400">دفتر الحركة</p><h2 className="mt-1 text-[17px] font-black text-slate-950">آخر القيود</h2></div>
        {loading ? (
          <div className="flex min-h-[36vh] items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-slate-400" /></div>
        ) : activity.length ? (
          <div className="divide-y divide-slate-100">
            {activity.map((item) => {
              const positive = item.transaction_type === 'income';
              const negative = item.transaction_type === 'expense';
              const transfer = item.transaction_type === 'transfer';
              return (
                <article key={item.id} className="flex items-center justify-between gap-3 py-3.5 first:pt-0 last:pb-0">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${positive ? 'bg-emerald-50 text-emerald-700' : negative ? 'bg-rose-50 text-rose-600' : 'bg-slate-100 text-slate-600'}`}>
                      {positive ? <ArrowDownLeft className="h-4 w-4" /> : negative ? <ArrowUpRight className="h-4 w-4" /> : transfer ? <ArrowLeftRight className="h-4 w-4" /> : <WalletCards className="h-4 w-4" />}
                    </div>
                    <div className="min-w-0"><p className="truncate text-[13px] font-black text-slate-900">{item.description || item.category_name || (positive ? 'دخل' : negative ? 'مصروف' : transfer ? 'تحويل' : 'تسوية')}</p><p className="mt-1 text-[10px] text-slate-400">{dateTime(item.transaction_at)}{item.category_name && item.description ? ` · ${item.category_name}` : ''}</p></div>
                  </div>
                  <p className={`shrink-0 text-[13px] font-black ${positive ? 'text-emerald-700' : negative ? 'text-rose-600' : 'text-slate-700'}`}>{positive ? '+' : negative ? '−' : ''}{money(item.amount, item.currency)}</p>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="py-12 text-center"><WalletCards className="mx-auto h-7 w-7 text-slate-300" /><p className="mt-3 text-[12px] font-bold text-slate-500">لا توجد قيود محاسبية حتى الآن</p></div>
        )}
      </section>

      {composer && (
        <div className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-950/35 backdrop-blur-[2px] sm:items-center sm:p-4" role="dialog" aria-modal="true">
          <form onSubmit={submit} className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-[30px] bg-white p-5 shadow-2xl sm:rounded-[30px]">
            <div className="mb-5 flex items-center justify-between"><div><p className="text-[11px] font-bold text-emerald-700">قيد جديد</p><h2 className="mt-1 text-[19px] font-black text-slate-950">{composer === 'expense' ? 'تسجيل مصروف' : composer === 'income' ? 'تسجيل دخل' : 'تحويل بين الحسابات'}</h2></div><button type="button" onClick={() => setComposer(null)} className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-100 text-slate-600"><X className="h-4 w-4" /></button></div>

            <label className="mb-4 block"><span className="mb-2 block text-[11px] font-black text-slate-600">{composer === 'transfer' ? 'من حساب' : 'الحساب'}</span><select value={accountId} onChange={(e) => { setAccountId(e.target.value); setDestinationAccountId(''); }} className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-3 text-[12px] font-bold outline-none"><option value="">اختر الحساب</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.name} — {account.currency}</option>)}</select></label>

            {composer === 'transfer' && <label className="mb-4 block"><span className="mb-2 block text-[11px] font-black text-slate-600">إلى حساب</span><select value={destinationAccountId} onChange={(e) => setDestinationAccountId(e.target.value)} className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-3 text-[12px] font-bold outline-none"><option value="">اختر الحساب المستلم</option>{transferDestinations.map((account) => <option key={account.id} value={account.id}>{account.name} — {account.currency}</option>)}</select>{selectedAccount && transferDestinations.length === 0 && <span className="mt-2 block text-[10px] leading-5 text-amber-700">لا يوجد حساب آخر بنفس العملة. التحويل بين عملتين سيُضاف لاحقًا ضمن مسار صرف صريح.</span>}</label>}

            <label className="mb-4 block"><span className="mb-2 block text-[11px] font-black text-slate-600">المبلغ {selectedAccount ? `(${selectedAccount.currency})` : ''}</span><input type="number" min="0.01" step="0.01" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-left text-[16px] font-black outline-none" dir="ltr" /></label>

            {composer !== 'transfer' && (
              <div className="mb-4">
                <div className="mb-2 flex items-center justify-between gap-3"><span className="text-[11px] font-black text-slate-600">التصنيف</span><button type="button" onClick={() => setShowCategoryCreator((value) => !value)} className="text-[10px] font-black text-emerald-700">{showCategoryCreator ? 'إلغاء' : '+ تصنيف جديد'}</button></div>
                <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-3 text-[12px] font-bold outline-none"><option value="">بدون تصنيف</option>{composerCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select>
                {showCategoryCreator && (
                  <div className="mt-2 flex gap-2 rounded-2xl bg-slate-50 p-2">
                    <input value={newCategoryName} onChange={(e) => setNewCategoryName(e.target.value)} maxLength={80} placeholder={composer === 'expense' ? 'مثال: أغراض البيت' : 'مثال: دخل إضافي'} className="h-10 min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 text-[11px] font-bold outline-none" />
                    <button type="button" onClick={() => void addCategory()} disabled={categorySaving} className="flex h-10 shrink-0 items-center justify-center rounded-xl bg-slate-950 px-4 text-[10px] font-black text-white disabled:opacity-60">{categorySaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'إضافة'}</button>
                  </div>
                )}
              </div>
            )}

            <label className="mb-5 block"><span className="mb-2 block text-[11px] font-black text-slate-600">البيان</span><input value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} placeholder="مثال: مقاضي المنزل" className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-[13px] font-bold outline-none" /></label>

            <button type="submit" disabled={saving || categorySaving} className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 text-[13px] font-black text-white disabled:opacity-60">{saving && <Loader2 className="h-4 w-4 animate-spin" />} تسجيل القيد</button>
          </form>
        </div>
      )}
    </main>
  );
}

function Action({ icon: Icon, label, onClick, disabled }: { icon: typeof ArrowUpRight; label: string; onClick: () => void; disabled?: boolean }) {
  return <button type="button" onClick={onClick} disabled={disabled} className="flex min-h-[74px] flex-col items-center justify-center gap-2 rounded-[22px] border border-slate-200/80 bg-white text-slate-700 shadow-sm active:scale-[0.98] disabled:opacity-40"><Icon className="h-[19px] w-[19px]" /><span className="text-[11px] font-black">{label}</span></button>;
}

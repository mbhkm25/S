import { FormEvent, useCallback, useEffect, useState } from 'react';
import { ArrowRight, Landmark, Loader2, Plus, RefreshCw, WalletCards, X } from 'lucide-react';
import { createFinancialAccount, getFinancialAccounts, type PersonalFinanceAccount } from './personalFinanceApi';

interface Props {
  onBack: () => void;
}

const CURRENCIES = ['YER', 'SAR', 'USD'];

function money(value: number, currency: string): string {
  return `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value)} ${currency}`;
}

export default function FinancialAccountsPage({ onBack }: Props) {
  const [accounts, setAccounts] = useState<PersonalFinanceAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [currency, setCurrency] = useState('YER');
  const [accountType, setAccountType] = useState<'asset' | 'liability'>('asset');
  const [openingBalance, setOpeningBalance] = useState('0');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try { setAccounts(await getFinancialAccounts()); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'تعذر تحميل الحسابات.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const opening = Number(openingBalance || 0);
    if (!name.trim()) { setError('اكتب اسمًا واضحًا للحساب.'); return; }
    if (!Number.isFinite(opening) || opening < 0) { setError('الرصيد الافتتاحي يجب أن يكون صفرًا أو رقمًا موجبًا.'); return; }
    setSaving(true);
    setError(null);
    try {
      await createFinancialAccount({ account_type: accountType, name: name.trim(), currency, opening_balance: opening });
      setName(''); setOpeningBalance('0'); setAccountType('asset'); setShowForm(false);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'تعذر إنشاء الحساب.');
    } finally { setSaving(false); }
  };

  return (
    <main className="mx-auto w-full max-w-2xl px-4 pb-6 pt-4" dir="rtl">
      <header className="mb-5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button type="button" onClick={onBack} aria-label="رجوع" className="flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700 shadow-sm"><ArrowRight className="h-5 w-5" /></button>
          <div><p className="text-[11px] font-bold text-emerald-700">المحاسب الشخصي</p><h1 className="mt-0.5 text-[23px] font-black text-slate-950">الحسابات</h1></div>
        </div>
        <button type="button" onClick={() => setShowForm(true)} className="flex h-11 items-center gap-2 rounded-2xl bg-slate-950 px-4 text-[12px] font-black text-white"><Plus className="h-4 w-4" /> حساب</button>
      </header>

      <p className="mb-5 text-[12px] leading-6 text-slate-500">هذه حسابات محاسبك الشخصي. لا تغيّر سجلات الدفع أو التحقق الأصلية في سند، ويمكن ربطها لاحقًا بحساباتك المالية المسجلة.</p>

      {error && <div className="mb-4 rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-[12px] font-bold leading-5 text-rose-700">{error}</div>}

      {loading ? (
        <div className="flex min-h-[42vh] items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-slate-400" /></div>
      ) : accounts.length ? (
        <div className="space-y-3">
          {accounts.map((account) => (
            <article key={account.id} className="flex items-center justify-between gap-4 rounded-[24px] border border-slate-200/80 bg-white p-4 shadow-sm">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-slate-50 text-slate-700">{account.account_type === 'liability' ? <WalletCards className="h-5 w-5" /> : <Landmark className="h-5 w-5" />}</div>
                <div className="min-w-0"><h2 className="truncate text-[14px] font-black text-slate-950">{account.name}</h2><p className="mt-1 text-[10px] text-slate-400">{account.account_type === 'liability' ? 'التزام' : 'أصل'} · {account.currency}{account.linked_user_financial_account_id ? ' · مرتبط بسند' : ''}</p></div>
              </div>
              <p className="shrink-0 text-[14px] font-black text-slate-900">{money(account.current_balance, account.currency)}</p>
            </article>
          ))}
        </div>
      ) : (
        <section className="rounded-[28px] border border-slate-200 bg-white p-6 text-center shadow-sm">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-3xl bg-slate-50 text-slate-700"><WalletCards className="h-6 w-6" /></div>
          <h2 className="mt-4 text-[16px] font-black text-slate-950">ابدأ بحسابك الأول</h2>
          <p className="mx-auto mt-2 max-w-sm text-[12px] leading-6 text-slate-500">أنشئ حسابًا للنقد أو البنك أو أي التزام. إذا كان لديك رصيد حالي، أدخله كرصد افتتاحي وسيُقيد محاسبيًا بقيد متوازن.</p>
          <button type="button" onClick={() => setShowForm(true)} className="mt-5 rounded-2xl bg-slate-950 px-6 py-3 text-[12px] font-black text-white">إضافة حساب</button>
        </section>
      )}

      {!loading && accounts.length > 0 && (
        <button type="button" onClick={() => void load()} className="mx-auto mt-5 flex items-center gap-2 text-[11px] font-bold text-slate-500"><RefreshCw className="h-4 w-4" /> تحديث الأرصدة</button>
      )}

      {showForm && (
        <div className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-950/35 p-0 backdrop-blur-[2px] sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="إضافة حساب مالي">
          <form onSubmit={submit} className="w-full max-w-lg rounded-t-[30px] bg-white p-5 shadow-2xl sm:rounded-[30px]">
            <div className="mb-5 flex items-center justify-between"><div><p className="text-[11px] font-bold text-emerald-700">المحاسب الشخصي</p><h2 className="mt-1 text-[19px] font-black text-slate-950">حساب جديد</h2></div><button type="button" onClick={() => setShowForm(false)} className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-100 text-slate-600"><X className="h-4 w-4" /></button></div>
            <label className="mb-4 block"><span className="mb-2 block text-[11px] font-black text-slate-600">اسم الحساب</span><input value={name} onChange={(e) => setName(e.target.value)} placeholder="مثال: نقد المحفظة" maxLength={120} autoFocus className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-[13px] font-bold outline-none focus:border-slate-400" /></label>
            <div className="mb-4 grid grid-cols-2 gap-3">
              <label><span className="mb-2 block text-[11px] font-black text-slate-600">نوع الحساب</span><select value={accountType} onChange={(e) => setAccountType(e.target.value as 'asset' | 'liability')} className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-3 text-[12px] font-bold outline-none"><option value="asset">أصل / رصيد أملكه</option><option value="liability">التزام / مبلغ عليّ</option></select></label>
              <label><span className="mb-2 block text-[11px] font-black text-slate-600">العملة</span><select value={currency} onChange={(e) => setCurrency(e.target.value)} className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-3 text-[12px] font-bold outline-none">{CURRENCIES.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
            </div>
            <label className="mb-5 block"><span className="mb-2 block text-[11px] font-black text-slate-600">الرصيد الافتتاحي</span><input type="number" min="0" step="0.01" inputMode="decimal" value={openingBalance} onChange={(e) => setOpeningBalance(e.target.value)} className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-left text-[14px] font-black outline-none" dir="ltr" /><span className="mt-2 block text-[10px] leading-5 text-slate-400">يمكن تركه صفرًا وإضافة الحركات لاحقًا.</span></label>
            <button type="submit" disabled={saving} className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 text-[13px] font-black text-white disabled:opacity-60">{saving && <Loader2 className="h-4 w-4 animate-spin" />} حفظ الحساب</button>
          </form>
        </div>
      )}
    </main>
  );
}

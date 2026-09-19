import { FormEvent, useState } from 'react';
import { Building2, FolderPlus, Loader2, UserPlus, WalletCards } from 'lucide-react';
import {
  createBusinessParty,
  createPersonalAccount,
  createPersonalCategory,
  createPersonalParty,
} from './api/financialApi';

type Notice = { kind: 'success' | 'error'; text: string } | null;
const inputClass = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm outline-none focus:border-slate-400';
const labelClass = 'mb-1.5 block text-[10px] font-bold text-slate-500';

function NoticeBox({ notice }: { notice: Notice }) {
  if (!notice) return null;
  return <div className={`rounded-xl px-3 py-2 text-xs leading-5 ${notice.kind === 'success' ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-800'}`}>{notice.text}</div>;
}

async function execute(task: () => Promise<{ error: { message?: string } | null }>) {
  const result = await task();
  if (result.error) throw new Error(result.error.message || 'تعذر تنفيذ العملية');
}

export function PersonalMasterDataActions({ onChanged, initialMode = 'account' }: { onChanged: () => void; initialMode?: 'account' | 'category' | 'party' }) {
  const [mode, setMode] = useState<'account' | 'category' | 'party'>(initialMode);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [accountName, setAccountName] = useState('');
  const [accountType, setAccountType] = useState<'asset' | 'liability'>('asset');
  const [accountCurrency, setAccountCurrency] = useState('YER');
  const [openingBalance, setOpeningBalance] = useState('0');
  const [categoryName, setCategoryName] = useState('');
  const [categoryKind, setCategoryKind] = useState<'expense' | 'income'>('expense');
  const [partyName, setPartyName] = useState('');
  const [partyType, setPartyType] = useState<'person' | 'business' | 'household' | 'other'>('person');
  const [partyPhone, setPartyPhone] = useState('');

  const run = async (task: () => Promise<{ error: { message?: string } | null }>, success: string) => {
    setLoading(true); setNotice(null);
    try {
      await execute(task);
      setNotice({ kind: 'success', text: success });
      onChanged();
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'تعذر تنفيذ العملية' });
    } finally { setLoading(false); }
  };

  const submitAccount = (event: FormEvent) => {
    event.preventDefault();
    void run(() => createPersonalAccount({ name: accountName, account_type: accountType, currency: accountCurrency, opening_balance: openingBalance }), 'تم إنشاء الحساب المالي.');
  };
  const submitCategory = (event: FormEvent) => {
    event.preventDefault();
    void run(() => createPersonalCategory({ name: categoryName, kind: categoryKind }), 'تم إنشاء التصنيف.');
  };
  const submitParty = (event: FormEvent) => {
    event.preventDefault();
    void run(() => createPersonalParty({ display_name: partyName, party_type: partyType, phone: partyPhone || undefined }), 'تم إنشاء الطرف المالي.');
  };

  return (
    <section className="rounded-[1.5rem] border border-slate-100 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2"><WalletCards className="h-5 w-5 text-emerald-700" /><div><h3 className="text-sm font-black">البيانات الأساسية</h3><p className="mt-1 text-[10px] leading-5 text-slate-500">أنشئ الحسابات والتصنيفات والأطراف قبل تسجيل العمليات.</p></div></div>
      <div className="mt-4 grid grid-cols-3 gap-2">
        <button type="button" onClick={() => { setMode('account'); setNotice(null); }} className={`rounded-xl py-2 text-[10px] font-bold ${mode === 'account' ? 'bg-slate-950 text-white' : 'bg-slate-50 text-slate-600'}`}>حساب</button>
        <button type="button" onClick={() => { setMode('category'); setNotice(null); }} className={`rounded-xl py-2 text-[10px] font-bold ${mode === 'category' ? 'bg-slate-950 text-white' : 'bg-slate-50 text-slate-600'}`}>تصنيف</button>
        <button type="button" onClick={() => { setMode('party'); setNotice(null); }} className={`rounded-xl py-2 text-[10px] font-bold ${mode === 'party' ? 'bg-slate-950 text-white' : 'bg-slate-50 text-slate-600'}`}>طرف</button>
      </div>
      <div className="mt-3"><NoticeBox notice={notice} /></div>
      {mode === 'account' ? <form className="mt-4 space-y-3" onSubmit={submitAccount}>
        <label><span className={labelClass}>اسم الحساب</span><input required value={accountName} onChange={event => setAccountName(event.target.value)} className={inputClass} placeholder="مثال: العمقي" /></label>
        <div className="grid grid-cols-2 gap-3"><label><span className={labelClass}>نوع الحساب</span><select value={accountType} onChange={event => setAccountType(event.target.value as 'asset' | 'liability')} className={inputClass}><option value="asset">أصل / رصيد متاح</option><option value="liability">التزام</option></select></label><label><span className={labelClass}>العملة</span><select value={accountCurrency} onChange={event => setAccountCurrency(event.target.value)} className={inputClass}><option>YER</option><option>SAR</option><option>USD</option></select></label></div>
        <label><span className={labelClass}>الرصيد الافتتاحي</span><input inputMode="decimal" value={openingBalance} onChange={event => setOpeningBalance(event.target.value)} className={inputClass} /></label>
        <button disabled={loading} className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-950 py-3 text-xs font-bold text-white disabled:opacity-50">{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <WalletCards className="h-4 w-4" />} إنشاء الحساب</button>
      </form> : null}
      {mode === 'category' ? <form className="mt-4 space-y-3" onSubmit={submitCategory}>
        <label><span className={labelClass}>اسم التصنيف</span><input required value={categoryName} onChange={event => setCategoryName(event.target.value)} className={inputClass} placeholder="مثال: أغراض المنزل" /></label>
        <label><span className={labelClass}>نوع التصنيف</span><select value={categoryKind} onChange={event => setCategoryKind(event.target.value as 'expense' | 'income')} className={inputClass}><option value="expense">مصروف</option><option value="income">دخل</option></select></label>
        <button disabled={loading} className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-950 py-3 text-xs font-bold text-white disabled:opacity-50">{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FolderPlus className="h-4 w-4" />} إنشاء التصنيف</button>
      </form> : null}
      {mode === 'party' ? <form className="mt-4 space-y-3" onSubmit={submitParty}>
        <label><span className={labelClass}>اسم الطرف</span><input required value={partyName} onChange={event => setPartyName(event.target.value)} className={inputClass} placeholder="مثال: العم حسين" /></label>
        <label><span className={labelClass}>النوع</span><select value={partyType} onChange={event => setPartyType(event.target.value as typeof partyType)} className={inputClass}><option value="person">شخص</option><option value="business">نشاط تجاري</option><option value="household">أسرة</option><option value="other">أخرى</option></select></label>
        <label><span className={labelClass}>الهاتف — اختياري</span><input value={partyPhone} onChange={event => setPartyPhone(event.target.value)} className={inputClass} inputMode="tel" /></label>
        <button disabled={loading} className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-950 py-3 text-xs font-bold text-white disabled:opacity-50">{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />} إنشاء الطرف</button>
      </form> : null}
    </section>
  );
}

export function BusinessMasterDataActions({ businessId, onChanged }: { businessId: string; onChanged: () => void }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setLoading(true); setNotice(null);
    void execute(() => createBusinessParty(businessId, { display_name: name, primary_phone: phone || undefined }))
      .then(() => { setNotice({ kind: 'success', text: 'تم إنشاء الطرف التجاري أو استخدام الطرف الموجود مسبقًا.' }); setName(''); setPhone(''); onChanged(); })
      .catch(error => setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'تعذر إنشاء الطرف' }))
      .finally(() => setLoading(false));
  };

  return <section className="rounded-[1.5rem] border border-slate-100 bg-white p-4 shadow-sm">
    <div className="flex items-center gap-2"><Building2 className="h-5 w-5 text-sky-700" /><div><h3 className="text-sm font-black">طرف تجاري جديد</h3><p className="mt-1 text-[10px] leading-5 text-slate-500">أضف عميلاً أو مورداً يدويًا قبل إنشاء المستندات التجارية.</p></div></div>
    <div className="mt-3"><NoticeBox notice={notice} /></div>
    <form className="mt-4 space-y-3" onSubmit={submit}>
      <label><span className={labelClass}>الاسم</span><input required value={name} onChange={event => setName(event.target.value)} className={inputClass} /></label>
      <label><span className={labelClass}>الهاتف — اختياري</span><input value={phone} onChange={event => setPhone(event.target.value)} className={inputClass} inputMode="tel" /></label>
      <button disabled={loading} className="flex w-full items-center justify-center gap-2 rounded-xl bg-sky-700 py-3 text-xs font-bold text-white disabled:opacity-50">{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />} حفظ الطرف التجاري</button>
    </form>
  </section>;
}

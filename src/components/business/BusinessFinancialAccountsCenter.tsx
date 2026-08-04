import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  BadgeCheck,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CircleDollarSign,
  Fingerprint,
  KeyRound,
  Landmark,
  Loader2,
  Pencil,
  Phone,
  Plus,
  Route,
  ShieldCheck,
  Trash2,
  WalletCards,
  X
} from 'lucide-react';
import { getUserBusinessContexts } from '../../lib/businessApi';
import { getActiveManagedBusinessId } from '../../lib/businessManagementApi';
import {
  archiveBusinessFinancialAccount,
  getBusinessFinancialAccounts,
  getFinancialEntities,
  upsertBusinessFinancialAccount,
  type BusinessFinancialAccount,
  type FinancialCurrency,
  type FinancialEntityCode,
  type FinancialEntityOption,
  type FinancialIdentifierInput,
  type FinancialIdentifierType
} from '../../lib/businessFinancialAccountsApi';

type AccountDraft = {
  accountId: string | null;
  financialEntityCode: FinancialEntityCode;
  financialEntityRaw: string;
  accountHolderName: string;
  accountLabel: string;
  isMulticurrency: boolean;
  routingEnabled: boolean;
  identifiers: FinancialIdentifierInput[];
};

type IdentifierMeta = {
  label: string;
  description: string;
  placeholder: string;
  inputMode: 'text' | 'numeric' | 'tel';
  composite: boolean;
};

const IDENTIFIER_META: Record<FinancialIdentifierType, IdentifierMeta> = {
  account_number: { label: 'رقم الحساب', description: 'رقم الحساب المالي كما يظهر في الإشعار.', placeholder: 'مثال: 254073867', inputMode: 'text', composite: false },
  wallet_number: { label: 'رقم المحفظة', description: 'المعرّف الداخلي للمحفظة الإلكترونية.', placeholder: 'رقم المحفظة', inputMode: 'text', composite: false },
  customer_line: { label: 'رقم الخط أو العميل', description: 'خط مالي أو رقم عميل تستخدمه الجهة.', placeholder: 'رقم الخط/العميل', inputMode: 'text', composite: false },
  merchant_point: { label: 'نقطة التاجر أو حاسب', description: 'رقم نقطة التاجر في أنظمة مثل الكريمي حاسب.', placeholder: 'مثال: 825121', inputMode: 'numeric', composite: false },
  terminal_number: { label: 'رقم الجهاز أو الطرفية', description: 'رقم جهاز التحصيل أو الطرفية المالية.', placeholder: 'رقم الطرفية', inputMode: 'text', composite: false },
  phone_number: { label: 'رقم الجوال المرتبط', description: 'يطابق مع الجهة واسم صاحب الحساب معًا.', placeholder: 'مثال: 777634971', inputMode: 'tel', composite: true },
  national_id: { label: 'رقم الهوية الوطنية', description: 'يستخدم فقط عندما تعرض الجهة الهوية كمعرّف للحساب.', placeholder: 'رقم الهوية', inputMode: 'numeric', composite: true },
  passport_number: { label: 'رقم الجواز', description: 'يستخدم فقط عندما يكون الجواز معرّفًا ماليًا ظاهرًا.', placeholder: 'رقم الجواز', inputMode: 'text', composite: true },
  unique_account_name: { label: 'اسم الحساب الفريد', description: 'اسم أو لقب حساب تستخدمه الجهة كمعرّف مستقل.', placeholder: 'اسم الحساب كما يظهر', inputMode: 'text', composite: true },
  iban: { label: 'IBAN', description: 'رقم الحساب المصرفي الدولي.', placeholder: 'YE00…', inputMode: 'text', composite: false },
  other: { label: 'معرّف آخر', description: 'معرّف صريح لا يطابق الأنواع السابقة.', placeholder: 'قيمة المعرّف', inputMode: 'text', composite: false }
};

const IDENTIFIER_TYPES = Object.entries(IDENTIFIER_META) as [FinancialIdentifierType, IdentifierMeta][];
const CURRENCIES: FinancialCurrency[] = ['YER', 'SAR', 'USD'];
const COMPOSITE_TYPES = new Set<FinancialIdentifierType>(['phone_number', 'national_id', 'passport_number', 'unique_account_name']);

function createIdentifier(type: FinancialIdentifierType = 'account_number', primary = false): FinancialIdentifierInput {
  return { identifierType: type, identifierValue: '', currency: null, isPrimary: primary, routingEnabled: true };
}

function createDraft(): AccountDraft {
  return {
    accountId: null,
    financialEntityCode: 'alomqy_mobile',
    financialEntityRaw: '',
    accountHolderName: '',
    accountLabel: '',
    isMulticurrency: false,
    routingEnabled: true,
    identifiers: [createIdentifier('account_number', true)]
  };
}

function draftFromAccount(account: BusinessFinancialAccount): AccountDraft {
  return {
    accountId: account.account_id,
    financialEntityCode: account.financial_entity_code,
    financialEntityRaw: account.financial_entity_raw || '',
    accountHolderName: account.account_holder_name || '',
    accountLabel: account.account_label || '',
    isMulticurrency: account.is_multicurrency,
    routingEnabled: account.routing_enabled,
    identifiers: account.identifiers.length
      ? account.identifiers.map(identifier => ({
          identifierType: identifier.identifier_type,
          identifierValue: identifier.identifier_value,
          currency: identifier.currency,
          isPrimary: identifier.is_primary,
          routingEnabled: identifier.routing_enabled
        }))
      : [createIdentifier('account_number', true)]
  };
}

function verificationLabel(status: BusinessFinancialAccount['verification_status']) {
  if (status === 'verified') return 'موثّق';
  if (status === 'pending') return 'قيد التوثيق';
  if (status === 'rejected') return 'مرفوض';
  return 'غير موثّق';
}

function identifierIcon(type: FinancialIdentifierType) {
  if (type === 'phone_number') return Phone;
  if (type === 'national_id' || type === 'passport_number') return Fingerprint;
  if (type === 'wallet_number') return WalletCards;
  if (type === 'unique_account_name') return BadgeCheck;
  if (type === 'iban' || type === 'account_number') return Landmark;
  return KeyRound;
}

export default function BusinessFinancialAccountsCenter() {
  const [open, setOpen] = useState(false);
  const [businessId, setBusinessId] = useState<string | null>(null);
  const [businessName, setBusinessName] = useState('النشاط');
  const [entities, setEntities] = useState<FinancialEntityOption[]>([]);
  const [accounts, setAccounts] = useState<BusinessFinancialAccount[]>([]);
  const [draft, setDraft] = useState<AccountDraft | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const selectableEntities = useMemo(() => entities.filter(entity => entity.code !== 'unknown'), [entities]);
  const requiresHolderName = Boolean(draft?.identifiers.some(identifier => COMPOSITE_TYPES.has(identifier.identifierType)));

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const contexts = await getUserBusinessContexts();
      const activeId = getActiveManagedBusinessId();
      const owned = contexts.owned_businesses || [];
      const selected = owned.find(item => item.id === activeId) || owned[0] || null;
      if (!selected) {
        setBusinessId(null);
        setBusinessName('النشاط');
        setEntities([]);
        setAccounts([]);
        return;
      }
      const [entityOptions, financialAccounts] = await Promise.all([
        getFinancialEntities(),
        getBusinessFinancialAccounts(selected.id)
      ]);
      setBusinessId(selected.id);
      setBusinessName(selected.name);
      setEntities(entityOptions);
      setAccounts(financialAccounts);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'تعذر تحميل الحسابات المالية.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (open) void load(); }, [open, load]);

  const startCreate = () => {
    const next = createDraft();
    const firstEntity = selectableEntities.find(entity => entity.routing_enabled) || selectableEntities[0];
    if (firstEntity) next.financialEntityCode = firstEntity.code;
    setDraft(next);
    setError(null);
    setSuccess(null);
  };

  const updateIdentifier = (index: number, patch: Partial<FinancialIdentifierInput>) => {
    setDraft(current => current ? {
      ...current,
      identifiers: current.identifiers.map((identifier, itemIndex) => itemIndex === index ? { ...identifier, ...patch } : identifier)
    } : current);
  };

  const setPrimaryIdentifier = (index: number) => {
    setDraft(current => current ? {
      ...current,
      identifiers: current.identifiers.map((identifier, itemIndex) => ({ ...identifier, isPrimary: itemIndex === index }))
    } : current);
  };

  const removeIdentifier = (index: number) => {
    setDraft(current => {
      if (!current || current.identifiers.length === 1) return current;
      const identifiers = current.identifiers.filter((_, itemIndex) => itemIndex !== index);
      if (!identifiers.some(identifier => identifier.isPrimary)) identifiers[0] = { ...identifiers[0], isPrimary: true };
      return { ...current, identifiers };
    });
  };

  const selectEntity = (code: FinancialEntityCode) => {
    setDraft(current => {
      if (!current) return current;
      const identifiers = current.identifiers.length === 1 && current.identifiers[0].identifierValue.trim() === ''
        ? [createIdentifier(code === 'kuraimi_haseb' ? 'merchant_point' : 'account_number', true)]
        : current.identifiers;
      return { ...current, financialEntityCode: code, identifiers };
    });
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!businessId || !draft) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await upsertBusinessFinancialAccount({
        businessId,
        accountId: draft.accountId,
        financialEntityCode: draft.financialEntityCode,
        financialEntityRaw: draft.financialEntityRaw,
        accountHolderName: draft.accountHolderName,
        accountLabel: draft.accountLabel,
        isMulticurrency: draft.isMulticurrency,
        routingEnabled: draft.routingEnabled,
        identifiers: draft.identifiers
      });
      setAccounts(result.items);
      setDraft(null);
      setSuccess('تم حفظ الحساب ومعرّفاته. سيبقى غير موثّق حتى اكتمال إجراء التوثيق.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'تعذر حفظ الحساب المالي.');
    } finally {
      setSaving(false);
    }
  };

  const archive = async (account: BusinessFinancialAccount) => {
    if (!businessId || !window.confirm(`أرشفة حساب «${account.name}» وإيقاف توجيهه؟`)) return;
    setSaving(true);
    setError(null);
    try {
      setAccounts(await archiveBusinessFinancialAccount(businessId, account.id));
      setDraft(current => current?.accountId === account.account_id ? null : current);
      setSuccess('تمت أرشفة الحساب مع إبقاء سجل التدقيق.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'تعذر أرشفة الحساب المالي.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="mx-2 overflow-hidden rounded-3xl border border-emerald-200 bg-white shadow-[0_10px_30px_rgba(15,23,42,0.05)] sm:mx-3">
      <button type="button" onClick={() => setOpen(value => !value)} className="flex w-full items-center gap-3 p-4 text-right" aria-expanded={open}>
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-600 text-white"><Route className="h-5 w-5" /></span>
        <span className="min-w-0 flex-1">
          <strong className="block text-sm text-slate-950">الحسابات المالية والتوجيه</strong>
          <span className="mt-1 block text-[10px] leading-5 text-slate-500">سجّل الجهة واسم صاحب الحساب وكل المعرّفات التي قد تظهر في الإشعارات.</span>
        </span>
        {open ? <ChevronUp className="h-5 w-5 text-slate-400" /> : <ChevronDown className="h-5 w-5 text-slate-400" />}
      </button>

      {open && <div className="border-t border-slate-100 bg-slate-50/70 p-3 sm:p-4">
        {loading ? <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin" /></div> : !businessId ? (
          <p className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-xs text-slate-500">لا يوجد نشاط مملوك لإدارة حساباته المالية.</p>
        ) : <div className="space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-slate-950">حسابات {businessName}</h2>
              <p className="mt-1 text-[10px] leading-5 text-slate-500">الحساب قد يُعرّف برقم حساب أو محفظة أو جوال أو هوية أو نقطة تاجر؛ اختر ما يظهر فعلًا في إشعارات الجهة.</p>
            </div>
            <button type="button" onClick={startCreate} disabled={saving || draft !== null} className="flex min-h-11 shrink-0 items-center gap-1 rounded-xl bg-slate-950 px-3 text-[10px] font-bold text-white disabled:opacity-50"><Plus className="h-4 w-4" /> إضافة</button>
          </div>

          {error && <div className="flex gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-[10px] leading-5 text-rose-800"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}
          {success && <div className="flex gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-[10px] leading-5 text-emerald-800"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />{success}</div>}

          {draft && <form onSubmit={save} className="space-y-4 rounded-3xl border border-slate-200 bg-white p-3 sm:p-4">
            <div className="flex items-start justify-between gap-3">
              <div><h3 className="text-sm font-bold">{draft.accountId ? 'تعديل الحساب المالي' : 'إضافة حساب مالي'}</h3><p className="mt-1 text-[9px] leading-4 text-slate-400">تعديل الهوية المالية يعيد حالة الحساب ومعرّفاته إلى غير موثّق.</p></div>
              <button type="button" onClick={() => setDraft(null)} className="rounded-xl p-2 text-slate-500" aria-label="إغلاق"><X className="h-4 w-4" /></button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1 text-[10px] font-bold text-slate-700"><span>الجهة المالية</span><select value={draft.financialEntityCode} onChange={event => selectEntity(event.target.value as FinancialEntityCode)} className="min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-normal">{selectableEntities.map(entity => <option key={entity.code} value={entity.code}>{entity.display_name_ar}</option>)}</select></label>
              {draft.financialEntityCode === 'other' && <label className="space-y-1 text-[10px] font-bold text-slate-700"><span>اسم الجهة الأخرى</span><input value={draft.financialEntityRaw} onChange={event => setDraft(current => current ? { ...current, financialEntityRaw: event.target.value } : current)} required className="min-h-11 w-full rounded-xl border border-slate-200 px-3 text-xs font-normal" /></label>}
              <label className="space-y-1 text-[10px] font-bold text-slate-700 sm:col-span-2"><span>اسم صاحب الحساب أو المستفيد {requiresHolderName && <b className="text-rose-600">— مطلوب لهذا النوع</b>}</span><input value={draft.accountHolderName} onChange={event => setDraft(current => current ? { ...current, accountHolderName: event.target.value } : current)} required={requiresHolderName} placeholder="اكتبه كما يظهر في الإشعار" className="min-h-11 w-full rounded-xl border border-slate-200 px-3 text-xs font-normal" /><small className="block font-normal leading-4 text-slate-400">عند استخدام الجوال أو الهوية أو الجواز، تتم المطابقة بالجهة + المعرّف + هذا الاسم.</small></label>
              <label className="space-y-1 text-[10px] font-bold text-slate-700 sm:col-span-2"><span>اسم داخلي اختياري</span><input value={draft.accountLabel} onChange={event => setDraft(current => current ? { ...current, accountLabel: event.target.value } : current)} placeholder="مثال: محفظة فرع المكلا" className="min-h-11 w-full rounded-xl border border-slate-200 px-3 text-xs font-normal" /></label>
            </div>

            <section className="space-y-2">
              <div className="flex items-center justify-between gap-3"><div><h4 className="text-xs font-bold">معرّفات الحساب</h4><p className="mt-1 text-[9px] text-slate-400">أضف كل معرّف قد يظهر في إشعارات هذا الحساب.</p></div><button type="button" onClick={() => setDraft(current => current ? { ...current, identifiers: [...current.identifiers, createIdentifier()] } : current)} className="min-h-10 rounded-xl border border-slate-200 px-3 text-[9px] font-bold">+ معرّف</button></div>

              {draft.identifiers.map((identifier, index) => {
                const meta = IDENTIFIER_META[identifier.identifierType];
                const Icon = identifierIcon(identifier.identifierType);
                return <article key={`${index}-${identifier.identifierType}`} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  <div className="flex items-start gap-2">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-slate-600 shadow-sm"><Icon className="h-4 w-4" /></span>
                    <div className="min-w-0 flex-1 space-y-2">
                      <select value={identifier.identifierType} onChange={event => updateIdentifier(index, { identifierType: event.target.value as FinancialIdentifierType, identifierValue: '' })} className="min-h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-[10px] font-bold">{IDENTIFIER_TYPES.map(([type, option]) => <option key={type} value={type}>{option.label}</option>)}</select>
                      <p className="text-[9px] leading-4 text-slate-500">{meta.description}</p>
                      <div className="grid gap-2 sm:grid-cols-[1.5fr_.65fr]">
                        <input value={identifier.identifierValue} onChange={event => updateIdentifier(index, { identifierValue: event.target.value })} placeholder={meta.placeholder} required dir={identifier.identifierType === 'unique_account_name' ? 'auto' : 'ltr'} inputMode={meta.inputMode} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 font-mono text-[11px]" />
                        <select value={identifier.currency || ''} onChange={event => updateIdentifier(index, { currency: (event.target.value || null) as FinancialCurrency | null })} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-[10px]"><option value="">بلا عملة</option>{CURRENCIES.map(currency => <option key={currency} value={currency}>{currency}</option>)}</select>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-[9px]">
                        <label className="flex min-h-9 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3"><input type="radio" name="primary-financial-identifier" checked={identifier.isPrimary === true} onChange={() => setPrimaryIdentifier(index)} />المعرّف الرئيسي</label>
                        <label className="flex min-h-9 items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 text-emerald-900"><input type="checkbox" checked={identifier.routingEnabled !== false} onChange={event => updateIdentifier(index, { routingEnabled: event.target.checked })} />استخدامه في التوجيه</label>
                        {meta.composite && <span className="flex min-h-9 items-center gap-1 rounded-xl bg-violet-50 px-3 text-violet-700"><ShieldCheck className="h-3.5 w-3.5" />مطابقة مركبة مع الاسم</span>}
                      </div>
                    </div>
                    <button type="button" onClick={() => removeIdentifier(index)} disabled={draft.identifiers.length === 1} className="rounded-xl p-2 text-rose-600 disabled:opacity-30" aria-label="حذف المعرّف"><Trash2 className="h-4 w-4" /></button>
                  </div>
                </article>;
              })}
            </section>

            {draft.financialEntityCode === 'kuraimi_haseb' && <p className="rounded-xl bg-violet-50 px-3 py-2 text-[9px] leading-5 text-violet-800">في إشعارات الكريمي حاسب قد تكون «نقطة التاجر/حاسب» هي المعرّف الأهم، وليس رقم الحساب أعلى الشاشة.</p>}
            {requiresHolderName && <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[9px] leading-5 text-amber-900">وجود الاسم مع الجوال أو الهوية يجعل الحساب قابلًا للمطابقة المركبة، لكنه لا يوثّقه تلقائيًا. التوثيق يبقى إجراءً مستقلًا.</p>}

            <div className="grid gap-2 sm:grid-cols-2">
              <label className="flex min-h-11 items-center justify-between rounded-xl border border-slate-200 px-3 text-[10px] font-bold"><span>حساب متعدد العملات</span><input type="checkbox" checked={draft.isMulticurrency} onChange={event => setDraft(current => current ? { ...current, isMulticurrency: event.target.checked } : current)} /></label>
              <label className="flex min-h-11 items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-3 text-[10px] font-bold text-emerald-900"><span>تفعيل المطابقة والتوجيه</span><input type="checkbox" checked={draft.routingEnabled} onChange={event => setDraft(current => current ? { ...current, routingEnabled: event.target.checked } : current)} /></label>
            </div>

            <div className="flex gap-2"><button type="button" onClick={() => setDraft(null)} className="min-h-11 flex-1 rounded-xl border border-slate-200 text-[10px] font-bold">إلغاء</button><button disabled={saving} className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 text-[10px] font-bold text-white disabled:opacity-50">{saving && <Loader2 className="h-4 w-4 animate-spin" />}حفظ الحساب</button></div>
          </form>}

          <div className="space-y-2">{accounts.length ? accounts.map(account => <article key={account.account_id} className="rounded-2xl border border-slate-200 bg-white p-3">
            <div className="flex items-start gap-3"><span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${account.routing_enabled ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}><CircleDollarSign className="h-5 w-5" /></span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-1.5"><h3 className="text-xs font-bold text-slate-950">{account.name}</h3><span className={`rounded-full px-2 py-0.5 text-[8px] font-bold ${account.routing_enabled ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>{account.routing_enabled ? 'التوجيه مفعّل' : 'التوجيه متوقف'}</span><span className="rounded-full bg-amber-50 px-2 py-0.5 text-[8px] font-bold text-amber-800">{verificationLabel(account.verification_status)}</span></div>{(account.account_holder_name || account.account_label) && <p className="mt-1 text-[9px] text-slate-500">{[account.account_holder_name, account.account_label].filter(Boolean).join(' · ')}</p>}<div className="mt-2 flex flex-wrap gap-1.5">{account.identifiers.map(identifier => <span key={identifier.id} className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 font-mono text-[8px] text-slate-600" dir="auto">{IDENTIFIER_META[identifier.identifier_type]?.label || identifier.identifier_type}: {identifier.identifier_value}</span>)}</div></div><div className="flex shrink-0 gap-1"><button type="button" onClick={() => setDraft(draftFromAccount(account))} disabled={saving || draft !== null} className="rounded-lg p-2 text-slate-700 disabled:opacity-40" aria-label="تعديل"><Pencil className="h-4 w-4" /></button><button type="button" onClick={() => void archive(account)} disabled={saving} className="rounded-lg p-2 text-rose-600 disabled:opacity-40" aria-label="أرشفة"><Trash2 className="h-4 w-4" /></button></div></div>
          </article>) : <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center"><CircleDollarSign className="mx-auto h-7 w-7 text-slate-300" /><p className="mt-2 text-xs font-bold text-slate-600">لا توجد حسابات مالية مهيأة.</p><p className="mt-1 text-[9px] text-slate-400">أضف الجهة واسم الحساب ومعرّفًا واحدًا على الأقل.</p></div>}</div>
        </div>}
      </div>}
    </section>
  );
}

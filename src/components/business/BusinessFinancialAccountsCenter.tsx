import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CircleDollarSign,
  Loader2,
  Pencil,
  Plus,
  Route,
  Trash2,
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

const IDENTIFIER_LABELS: Record<FinancialIdentifierType, string> = {
  account_number: 'رقم الحساب',
  wallet_number: 'رقم المحفظة',
  customer_line: 'رقم الخط/العميل',
  merchant_point: 'رقم نقطة حاسب/التاجر',
  terminal_number: 'رقم الجهاز أو الطرفية',
  phone_number: 'رقم الجوال المرتبط',
  iban: 'IBAN',
  other: 'معرّف آخر'
};

const IDENTIFIER_TYPES = Object.entries(IDENTIFIER_LABELS) as [FinancialIdentifierType, string][];
const CURRENCIES: FinancialCurrency[] = ['YER', 'SAR', 'USD'];

function createIdentifier(type: FinancialIdentifierType = 'account_number'): FinancialIdentifierInput {
  return {
    identifierType: type,
    identifierValue: '',
    currency: null,
    isPrimary: true,
    routingEnabled: true
  };
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
    identifiers: [createIdentifier()]
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
      : [createIdentifier()]
  };
}

function verificationLabel(status: BusinessFinancialAccount['verification_status']): string {
  if (status === 'verified') return 'موثّق';
  if (status === 'pending') return 'قيد التوثيق';
  if (status === 'rejected') return 'مرفوض';
  return 'غير موثّق';
}

function identifierSummary(account: BusinessFinancialAccount): string {
  return account.identifiers
    .map(identifier => {
      const currency = identifier.currency ? ` ${identifier.currency}` : '';
      return `${IDENTIFIER_LABELS[identifier.identifier_type]}: ${identifier.identifier_value}${currency}`;
    })
    .join(' · ');
}

export default function BusinessFinancialAccountsCenter() {
  const [open, setOpen] = useState(false);
  const [businessId, setBusinessId] = useState<string | null>(null);
  const [businessName, setBusinessName] = useState<string>('النشاط');
  const [entities, setEntities] = useState<FinancialEntityOption[]>([]);
  const [accounts, setAccounts] = useState<BusinessFinancialAccount[]>([]);
  const [draft, setDraft] = useState<AccountDraft | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const selectableEntities = useMemo(
    () => entities.filter(entity => entity.code !== 'unknown'),
    [entities]
  );

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

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const startCreate = () => {
    const initial = createDraft();
    const firstEntity = selectableEntities.find(entity => entity.routing_enabled) || selectableEntities[0];
    if (firstEntity) initial.financialEntityCode = firstEntity.code;
    setDraft(initial);
    setError(null);
    setSuccess(null);
  };

  const updateIdentifier = (index: number, patch: Partial<FinancialIdentifierInput>) => {
    setDraft(current => {
      if (!current) return current;
      return {
        ...current,
        identifiers: current.identifiers.map((identifier, itemIndex) =>
          itemIndex === index ? { ...identifier, ...patch } : identifier
        )
      };
    });
  };

  const removeIdentifier = (index: number) => {
    setDraft(current => {
      if (!current || current.identifiers.length === 1) return current;
      return {
        ...current,
        identifiers: current.identifiers.filter((_, itemIndex) => itemIndex !== index)
      };
    });
  };

  const selectEntity = (code: FinancialEntityCode) => {
    setDraft(current => {
      if (!current) return current;
      const identifiers = current.identifiers.length === 1
        && current.identifiers[0].identifierValue.trim() === ''
        ? [createIdentifier(code === 'kuraimi_haseb' ? 'merchant_point' : 'account_number')]
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
      setSuccess('تم حفظ الحساب ومعرّفاته وتجهيزه لمحرك التوجيه.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'تعذر حفظ الحساب المالي.');
    } finally {
      setSaving(false);
    }
  };

  const archive = async (account: BusinessFinancialAccount) => {
    if (!businessId) return;
    const confirmed = window.confirm(
      `أرشفة حساب «${account.name}»؟ سيتوقف استخدامه في التوجيه ولن يُحذف سجل التدقيق.`
    );
    if (!confirmed) return;

    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      setAccounts(await archiveBusinessFinancialAccount(businessId, account.id));
      setDraft(current => current?.accountId === account.account_id ? null : current);
      setSuccess('تمت أرشفة الحساب وإيقاف استخدامه في التوجيه.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'تعذر أرشفة الحساب المالي.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="mx-2 overflow-hidden rounded-2xl border border-emerald-200 bg-white shadow-[0_8px_24px_rgba(15,23,42,0.04)] sm:mx-3">
      <button
        type="button"
        onClick={() => setOpen(current => !current)}
        className="flex w-full items-center gap-3 p-3 text-right"
        aria-expanded={open}
      >
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-600 text-white">
          <Route className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[9px] font-bold text-emerald-700">البنية التشغيلية الجديدة</span>
          <strong className="mt-0.5 block text-xs text-slate-950">الحسابات المالية والتوجيه</strong>
          <span className="mt-1 block text-[9px] leading-5 text-slate-500">
            عرّف حسابات النشاط وأرقامها ونقاط حاسب تمهيدًا لوصول العمليات تلقائيًا.
          </span>
        </span>
        {open ? <ChevronUp className="h-5 w-5 text-slate-400" /> : <ChevronDown className="h-5 w-5 text-slate-400" />}
      </button>

      {open && (
        <div className="border-t border-slate-100 bg-slate-50/70 p-3 sm:p-4">
          {loading ? (
            <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin" /></div>
          ) : !businessId ? (
            <p className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-xs text-slate-500">
              لا يوجد نشاط مملوك لإدارة حساباته المالية.
            </p>
          ) : (
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-sm font-bold text-slate-950">حسابات {businessName}</h2>
                  <p className="mt-1 text-[10px] leading-5 text-slate-500">
                    رقم الحساب ليس النوع الوحيد؛ يمكن تسجيل رقم خط أو محفظة أو نقطة حاسب بحسب قالب الجهة.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={startCreate}
                  disabled={saving || draft !== null}
                  className="flex shrink-0 items-center gap-1 rounded-xl bg-slate-950 px-3 py-2 text-[10px] font-bold text-white disabled:opacity-50"
                >
                  <Plus className="h-4 w-4" /> إضافة
                </button>
              </div>

              {error && (
                <div className="flex gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-[10px] leading-5 text-rose-800">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
                </div>
              )}
              {success && (
                <div className="flex gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-[10px] leading-5 text-emerald-800">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> {success}
                </div>
              )}

              {draft && (
                <form onSubmit={save} className="space-y-3 rounded-2xl border border-slate-200 bg-white p-3 sm:p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-xs font-bold">{draft.accountId ? 'تعديل الحساب المالي' : 'إضافة حساب مالي'}</h3>
                      <p className="mt-1 text-[9px] text-slate-400">أي تعديل على الهوية المالية يعيد حالة التوثيق إلى غير موثّق.</p>
                    </div>
                    <button type="button" onClick={() => setDraft(null)} className="rounded-lg p-2 text-slate-500" aria-label="إغلاق النموذج">
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="space-y-1 text-[10px] font-bold text-slate-700">
                      <span>الجهة المالية</span>
                      <select
                        value={draft.financialEntityCode}
                        onChange={event => selectEntity(event.target.value as FinancialEntityCode)}
                        className="w-full rounded-xl border border-slate-200 bg-white p-3 text-xs font-normal"
                      >
                        {selectableEntities.map(entity => (
                          <option key={entity.code} value={entity.code}>{entity.display_name_ar}</option>
                        ))}
                      </select>
                    </label>

                    {draft.financialEntityCode === 'other' && (
                      <label className="space-y-1 text-[10px] font-bold text-slate-700">
                        <span>اسم الجهة الأخرى</span>
                        <input
                          value={draft.financialEntityRaw}
                          onChange={event => setDraft(current => current ? { ...current, financialEntityRaw: event.target.value } : current)}
                          required
                          className="w-full rounded-xl border border-slate-200 p-3 text-xs font-normal"
                        />
                      </label>
                    )}

                    <label className="space-y-1 text-[10px] font-bold text-slate-700">
                      <span>اسم صاحب الحساب/المستفيد</span>
                      <input
                        value={draft.accountHolderName}
                        onChange={event => setDraft(current => current ? { ...current, accountHolderName: event.target.value } : current)}
                        placeholder="الاسم كما يظهر في الإشعار"
                        className="w-full rounded-xl border border-slate-200 p-3 text-xs font-normal"
                      />
                    </label>

                    <label className="space-y-1 text-[10px] font-bold text-slate-700">
                      <span>اسم داخلي اختياري</span>
                      <input
                        value={draft.accountLabel}
                        onChange={event => setDraft(current => current ? { ...current, accountLabel: event.target.value } : current)}
                        placeholder="مثال: حساب فرع المكلا"
                        className="w-full rounded-xl border border-slate-200 p-3 text-xs font-normal"
                      />
                    </label>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="text-[11px] font-bold">المعرّفات المالية</h4>
                        <p className="text-[9px] text-slate-400">سيتطابق محرك التوجيه مع هذه القيم بعد التطبيع.</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setDraft(current => current ? { ...current, identifiers: [...current.identifiers, createIdentifier()] } : current)}
                        className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-[9px] font-bold"
                      >
                        + معرّف
                      </button>
                    </div>

                    {draft.identifiers.map((identifier, index) => (
                      <div key={`${index}-${identifier.identifierType}`} className="grid gap-2 rounded-xl border border-slate-200 bg-slate-50 p-2.5 sm:grid-cols-[1fr_1.4fr_.7fr_auto]">
                        <select
                          value={identifier.identifierType}
                          onChange={event => updateIdentifier(index, { identifierType: event.target.value as FinancialIdentifierType })}
                          className="rounded-lg border border-slate-200 bg-white p-2.5 text-[10px]"
                        >
                          {IDENTIFIER_TYPES.map(([type, label]) => <option key={type} value={type}>{label}</option>)}
                        </select>
                        <input
                          value={identifier.identifierValue}
                          onChange={event => updateIdentifier(index, { identifierValue: event.target.value })}
                          placeholder={IDENTIFIER_LABELS[identifier.identifierType]}
                          required
                          dir="ltr"
                          className="rounded-lg border border-slate-200 bg-white p-2.5 font-mono text-[11px]"
                        />
                        <select
                          value={identifier.currency || ''}
                          onChange={event => updateIdentifier(index, { currency: (event.target.value || null) as FinancialCurrency | null })}
                          className="rounded-lg border border-slate-200 bg-white p-2.5 text-[10px]"
                        >
                          <option value="">بلا عملة</option>
                          {CURRENCIES.map(currency => <option key={currency} value={currency}>{currency}</option>)}
                        </select>
                        <button
                          type="button"
                          onClick={() => removeIdentifier(index)}
                          disabled={draft.identifiers.length === 1}
                          className="rounded-lg p-2 text-rose-600 disabled:opacity-30"
                          aria-label="حذف المعرّف"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>

                  <div className="grid gap-2 sm:grid-cols-2">
                    <label className="flex items-center justify-between rounded-xl border border-slate-200 p-3 text-[10px] font-bold">
                      <span>حساب متعدد العملات</span>
                      <input
                        type="checkbox"
                        checked={draft.isMulticurrency}
                        onChange={event => setDraft(current => current ? { ...current, isMulticurrency: event.target.checked } : current)}
                      />
                    </label>
                    <label className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 text-[10px] font-bold text-emerald-900">
                      <span>تفعيل المطابقة والتوجيه</span>
                      <input
                        type="checkbox"
                        checked={draft.routingEnabled}
                        onChange={event => setDraft(current => current ? { ...current, routingEnabled: event.target.checked } : current)}
                      />
                    </label>
                  </div>

                  {draft.financialEntityCode === 'kuraimi_haseb' && (
                    <p className="rounded-xl bg-violet-50 px-3 py-2 text-[9px] leading-5 text-violet-800">
                      في إشعارات الكريمي حاسب البنفسجية قد يكون رقم نقطة حاسب/التاجر هو معرّف النشاط الأهم، وليس رقم الحساب الظاهر أعلى الشاشة فقط.
                    </p>
                  )}

                  <div className="flex gap-2">
                    <button type="button" onClick={() => setDraft(null)} className="flex-1 rounded-xl border border-slate-200 p-3 text-[10px] font-bold">إلغاء</button>
                    <button disabled={saving} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 p-3 text-[10px] font-bold text-white disabled:opacity-50">
                      {saving && <Loader2 className="h-4 w-4 animate-spin" />} حفظ الحساب
                    </button>
                  </div>
                </form>
              )}

              <div className="space-y-2">
                {accounts.length ? accounts.map(account => (
                  <article key={account.account_id} className="rounded-2xl border border-slate-200 bg-white p-3">
                    <div className="flex items-start gap-3">
                      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${account.routing_enabled ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                        <CircleDollarSign className="h-5 w-5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <h3 className="text-xs font-bold text-slate-950">{account.name}</h3>
                          <span className={`rounded-full px-2 py-0.5 text-[8px] font-bold ${account.routing_enabled ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>
                            {account.routing_enabled ? 'التوجيه مفعّل' : 'التوجيه متوقف'}
                          </span>
                          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[8px] font-bold text-amber-800">
                            {verificationLabel(account.verification_status)}
                          </span>
                        </div>
                        {(account.account_holder_name || account.account_label) && (
                          <p className="mt-1 text-[9px] text-slate-500">
                            {[account.account_holder_name, account.account_label].filter(Boolean).join(' · ')}
                          </p>
                        )}
                        <p className="mt-2 break-words font-mono text-[9px] leading-5 text-slate-600" dir="ltr">
                          {identifierSummary(account) || 'لا توجد معرّفات نشطة'}
                        </p>
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <button type="button" onClick={() => setDraft(draftFromAccount(account))} disabled={saving || draft !== null} className="rounded-lg p-2 text-slate-700 disabled:opacity-40" aria-label="تعديل الحساب">
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button type="button" onClick={() => void archive(account)} disabled={saving} className="rounded-lg p-2 text-rose-600 disabled:opacity-40" aria-label="أرشفة الحساب">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </article>
                )) : (
                  <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
                    <CircleDollarSign className="mx-auto h-7 w-7 text-slate-300" />
                    <p className="mt-2 text-xs font-bold text-slate-600">لا توجد حسابات مالية مهيأة للتوجيه.</p>
                    <p className="mt-1 text-[9px] text-slate-400">أضف حسابًا ومعرّفًا واحدًا على الأقل.</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

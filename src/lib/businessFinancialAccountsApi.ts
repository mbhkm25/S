import { supabase } from './supabase';

export type FinancialEntityCode =
  | 'alomqy_mobile'
  | 'albusaery_mobile'
  | 'bcash_wallet'
  | 'kuraimi_sar'
  | 'kuraimi_yer'
  | 'kuraimi_haseb'
  | 'bin_dowal_exchange'
  | 'bin_dowal_pay'
  | 'm_floos'
  | 'aden_cash'
  | 'alqutaibi'
  | 'almehdar'
  | 'other'
  | 'unknown';

export type FinancialIdentifierType =
  | 'account_number'
  | 'wallet_number'
  | 'customer_line'
  | 'merchant_point'
  | 'terminal_number'
  | 'phone_number'
  | 'national_id'
  | 'passport_number'
  | 'unique_account_name'
  | 'iban'
  | 'other';

export type FinancialCurrency = 'YER' | 'SAR' | 'USD';
export type FinancialVerificationStatus = 'unverified' | 'pending' | 'verified' | 'rejected';

export interface FinancialEntityOption {
  code: FinancialEntityCode;
  display_name_ar: string;
  routing_enabled: boolean;
  sort_order: number;
}

export interface BusinessFinancialIdentifier {
  id: string;
  identifier_type: FinancialIdentifierType;
  identifier_value: string;
  currency: FinancialCurrency | null;
  is_primary: boolean;
  routing_enabled: boolean;
  verification_status: FinancialVerificationStatus;
}

export interface BusinessFinancialAccount {
  account_id: string;
  id: string;
  name: string;
  financial_entity_code: FinancialEntityCode;
  financial_entity_raw: string | null;
  account_holder_name: string | null;
  account_label: string | null;
  is_multicurrency: boolean;
  account_number: string | null;
  accounts: Partial<Record<FinancialCurrency, string>> | null;
  routing_enabled: boolean;
  verification_status: FinancialVerificationStatus;
  identifiers: BusinessFinancialIdentifier[];
}

export interface FinancialIdentifierInput {
  identifierType: FinancialIdentifierType;
  identifierValue: string;
  currency?: FinancialCurrency | null;
  isPrimary?: boolean;
  routingEnabled?: boolean;
}

export interface UpsertBusinessFinancialAccountInput {
  businessId: string;
  accountId?: string | null;
  financialEntityCode: FinancialEntityCode;
  financialEntityRaw?: string | null;
  accountHolderName?: string | null;
  accountLabel?: string | null;
  isMulticurrency?: boolean;
  identifiers: FinancialIdentifierInput[];
  routingEnabled?: boolean;
}

interface FinancialAccountCollectionResponse {
  business_id?: string;
  items?: unknown;
}

interface FinancialAccountMutationResponse {
  ok?: boolean;
  account_id?: string;
  item?: unknown;
  items?: unknown;
}

const COMPOSITE_IDENTIFIER_TYPES = new Set<FinancialIdentifierType>([
  'phone_number',
  'national_id',
  'passport_number',
  'unique_account_name'
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`استجابة الحسابات المالية تفتقد الحقل ${field}.`);
  }
  return value;
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

function normalizeComparable(value: string): string {
  return value
    .trim()
    .replace(/[٠-٩]/g, digit => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))
    .replace(/[۰-۹]/g, digit => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)))
    .replace(/\s+/g, '')
    .toLowerCase();
}

function parseIdentifier(value: unknown): BusinessFinancialIdentifier {
  if (!isRecord(value)) throw new Error('استجابة معرّف الحساب المالي غير صالحة.');
  return {
    id: requireString(value.id, 'identifier.id'),
    identifier_type: requireString(value.identifier_type, 'identifier.identifier_type') as FinancialIdentifierType,
    identifier_value: requireString(value.identifier_value, 'identifier.identifier_value'),
    currency: nullableString(value.currency) as FinancialCurrency | null,
    is_primary: value.is_primary === true,
    routing_enabled: value.routing_enabled !== false,
    verification_status: requireString(value.verification_status ?? 'unverified', 'identifier.verification_status') as FinancialVerificationStatus
  };
}

function parseAccount(value: unknown): BusinessFinancialAccount {
  if (!isRecord(value)) throw new Error('استجابة الحساب المالي غير صالحة.');
  const identifiers = Array.isArray(value.identifiers) ? value.identifiers.map(parseIdentifier) : [];
  const accounts = isRecord(value.accounts)
    ? Object.fromEntries(Object.entries(value.accounts).filter(([, item]) => typeof item === 'string' && item.trim() !== '')) as Partial<Record<FinancialCurrency, string>>
    : null;

  return {
    account_id: requireString(value.account_id, 'account_id'),
    id: requireString(value.id, 'id'),
    name: requireString(value.name, 'name'),
    financial_entity_code: requireString(value.financial_entity_code, 'financial_entity_code') as FinancialEntityCode,
    financial_entity_raw: nullableString(value.financial_entity_raw),
    account_holder_name: nullableString(value.account_holder_name),
    account_label: nullableString(value.account_label),
    is_multicurrency: value.is_multicurrency === true,
    account_number: nullableString(value.account_number),
    accounts,
    routing_enabled: value.routing_enabled !== false,
    verification_status: requireString(value.verification_status ?? 'unverified', 'verification_status') as FinancialVerificationStatus,
    identifiers
  };
}

function parseAccountArray(value: unknown): BusinessFinancialAccount[] {
  if (!Array.isArray(value)) return [];
  return value.map(parseAccount);
}

function validateUpsertInput(input: UpsertBusinessFinancialAccountInput): void {
  if (!input.businessId) throw new Error('معرّف النشاط مطلوب.');
  if (!input.financialEntityCode) throw new Error('الجهة المالية مطلوبة.');
  if (input.financialEntityCode === 'unknown') throw new Error('لا يمكن حفظ حساب مالي تحت جهة غير معروفة.');
  if (input.financialEntityCode === 'other' && !input.financialEntityRaw?.trim()) throw new Error('اكتب اسم الجهة المالية الأخرى.');
  if (!Array.isArray(input.identifiers) || input.identifiers.length === 0) throw new Error('أضف معرّفًا ماليًا واحدًا على الأقل.');
  if (input.identifiers.length > 20) throw new Error('الحد الأقصى 20 معرّفًا للحساب المالي الواحد.');

  if (input.identifiers.some(identifier => COMPOSITE_IDENTIFIER_TYPES.has(identifier.identifierType)) && !input.accountHolderName?.trim()) {
    throw new Error('اسم صاحب الحساب مطلوب عند استخدام رقم جوال أو هوية أو جواز أو اسم حساب فريد.');
  }

  const uniqueIdentifiers = new Set<string>();
  for (const identifier of input.identifiers) {
    const value = identifier.identifierValue.trim();
    if (!value) throw new Error('قيمة المعرّف المالي مطلوبة.');
    if (identifier.identifierType === 'phone_number') {
      const digits = normalizeComparable(value).replace(/\D/g, '');
      const local = digits.startsWith('967') ? digits.slice(3) : digits.startsWith('0') ? digits.slice(1) : digits;
      if (!/^7\d{8}$/.test(local)) throw new Error('رقم الجوال اليمني يجب أن يتكون من 9 أرقام ويبدأ بالرقم 7.');
    }
    const key = `${identifier.identifierType}:${identifier.currency ?? ''}:${normalizeComparable(value)}`;
    if (uniqueIdentifiers.has(key)) throw new Error('يوجد معرّف مالي مكرر.');
    uniqueIdentifiers.add(key);
  }
}

export async function getFinancialEntities(): Promise<FinancialEntityOption[]> {
  const { data, error } = await supabase.rpc('get_financial_entities');
  if (error) throw new Error(error.message || 'تعذر تحميل الجهات المالية.');
  if (!Array.isArray(data)) return [];
  return data.map((item: unknown) => {
    if (!isRecord(item)) throw new Error('استجابة الجهات المالية غير صالحة.');
    return {
      code: requireString(item.code, 'entity.code') as FinancialEntityCode,
      display_name_ar: requireString(item.display_name_ar, 'entity.display_name_ar'),
      routing_enabled: item.routing_enabled !== false,
      sort_order: typeof item.sort_order === 'number' ? item.sort_order : 100
    };
  });
}

export async function getBusinessFinancialAccounts(businessId: string): Promise<BusinessFinancialAccount[]> {
  if (!businessId) throw new Error('معرّف النشاط مطلوب.');
  const { data, error } = await supabase.rpc('get_business_financial_accounts', { p_business_id: businessId });
  if (error) throw new Error(error.message || 'تعذر تحميل الحسابات المالية.');
  const response = isRecord(data) ? data as FinancialAccountCollectionResponse : null;
  return parseAccountArray(response?.items);
}

export async function upsertBusinessFinancialAccount(
  input: UpsertBusinessFinancialAccountInput
): Promise<{ item: BusinessFinancialAccount; items: BusinessFinancialAccount[] }> {
  validateUpsertInput(input);
  const { data, error } = await supabase.rpc('upsert_business_financial_account_v2', {
    p_business_id: input.businessId,
    p_account_id: input.accountId || null,
    p_financial_entity_code: input.financialEntityCode,
    p_financial_entity_raw: input.financialEntityRaw?.trim() || null,
    p_account_holder_name: input.accountHolderName?.trim() || null,
    p_account_label: input.accountLabel?.trim() || null,
    p_is_multicurrency: input.isMulticurrency === true,
    p_identifiers: input.identifiers.map(identifier => ({
      identifier_type: identifier.identifierType,
      identifier_value: identifier.identifierValue.trim(),
      currency: identifier.currency || null,
      is_primary: identifier.isPrimary === true,
      routing_enabled: identifier.routingEnabled !== false
    })),
    p_routing_enabled: input.routingEnabled !== false
  });
  if (error) throw new Error(error.message || 'تعذر حفظ الحساب المالي.');
  if (!isRecord(data)) throw new Error('لم تُرجع قاعدة البيانات نتيجة حفظ صالحة.');
  const response = data as FinancialAccountMutationResponse;
  if (response.ok !== true) throw new Error('لم يكتمل حفظ الحساب المالي.');
  return { item: parseAccount(response.item), items: parseAccountArray(response.items) };
}

export async function archiveBusinessFinancialAccount(businessId: string, accountId: string): Promise<BusinessFinancialAccount[]> {
  if (!businessId || !accountId) throw new Error('بيانات الحساب المالي غير مكتملة.');
  const { data, error } = await supabase.rpc('delete_business_financial_account', {
    p_business_id: businessId,
    p_account_id: accountId
  });
  if (error) throw new Error(error.message || 'تعذر أرشفة الحساب المالي.');
  if (!isRecord(data)) throw new Error('لم تُرجع قاعدة البيانات نتيجة أرشفة صالحة.');
  return parseAccountArray(data.items);
}

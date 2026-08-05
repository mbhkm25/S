const IDENTIFIER_LABELS: Record<string, string> = {
  financial_account_number: 'رقم الحساب',
  account_number: 'رقم الحساب',
  bank_account_number: 'رقم الحساب',
  wallet_number: 'رقم المحفظة',
  phone_number: 'رقم الجوال',
  mobile_number: 'رقم الجوال',
  phone: 'رقم الجوال',
  national_id: 'رقم الهوية',
  national_identity_number: 'رقم الهوية',
  card_number: 'رقم البطاقة',
  passport_number: 'رقم الجواز',
  unique_account_name: 'اسم الحساب',
  iban: 'IBAN',
  merchant_point: 'رقم نقطة التاجر',
  merchant_point_number: 'رقم نقطة التاجر',
  merchant_id: 'رقم نقطة التاجر',
  line_number: 'رقم الخط أو العميل',
  customer_number: 'رقم العميل',
  customer_id: 'رقم العميل',
  terminal_number: 'رقم الجهاز',
  terminal_id: 'رقم الجهاز',
  device_number: 'رقم الجهاز',
};

export function normalizeFinancialIdentifierType(type?: string | null): string {
  return String(type ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
}

export function getFinancialIdentifierLabel(type?: string | null): string {
  const normalizedType = normalizeFinancialIdentifierType(type);
  return IDENTIFIER_LABELS[normalizedType] ?? 'المعرّف المالي';
}

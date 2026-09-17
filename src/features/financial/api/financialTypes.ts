export type CurrencyCode = 'YER' | 'SAR' | 'USD' | string;

export type AccountBusiness = {
  id: string;
  name?: string;
};

export type PersonalAccount = {
  id: string;
  name: string;
  currency: CurrencyCode;
  account_type: string;
  system_role?: string | null;
};

export type PersonalCategory = {
  id: string;
  name: string;
  kind: 'income' | 'expense';
};

export type PersonalParty = {
  id: string;
  display_name: string;
  party_type?: 'person' | 'business' | 'household' | 'other';
  phone?: string | null;
};

export type BusinessParty = {
  id: string;
  display_name: string;
  primary_phone?: string | null;
};

export type SettlementInvoiceCandidate = {
  id: string;
  document_type: 'sales_invoice' | 'purchase_invoice' | 'expense';
  document_number?: string | null;
  document_date?: string;
  party_id: string;
  party_name?: string;
  currency: CurrencyCode;
  total_amount: number;
  settled_amount: number;
  outstanding_amount: number;
  compatible_payment_type: 'receipt' | 'payment';
};

export type SettlementPaymentCandidate = {
  id: string;
  document_type: 'receipt' | 'payment';
  document_number?: string | null;
  document_date?: string;
  party_id: string;
  party_name?: string;
  currency: CurrencyCode;
  total_amount: number;
  used_amount: number;
  available_amount: number;
};

export type SettlementCandidates = {
  contract_version: number;
  business_id: string;
  invoices: SettlementInvoiceCandidate[];
  payments: SettlementPaymentCandidate[];
};

export type RpcResult<T> = {
  data: T | null;
  error: { message?: string } | null;
};

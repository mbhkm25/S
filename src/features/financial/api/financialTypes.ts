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

export type PersonalObligationCandidate = {
  id: string;
  obligation_type: 'payable' | 'receivable';
  title: string;
  original_amount: number;
  outstanding_amount: number;
  currency: CurrencyCode;
  due_date?: string | null;
  party_id?: string | null;
  status: 'open' | 'partial';
};

export type PersonalSettlementTransactionCandidate = {
  id: string;
  transaction_type: 'income' | 'expense' | 'settlement';
  description?: string | null;
  transaction_at: string;
  amount: number;
  used_amount: number;
  available_amount: number;
  currency: CurrencyCode;
  party_id?: string | null;
};

export type PersonalReversalCandidate = {
  id: string;
  transaction_type: string;
  description?: string | null;
  transaction_at: string;
  amount: number;
  currency: CurrencyCode;
};

export type PersonalCorrectionCandidates = {
  contract_version: number;
  obligations: PersonalObligationCandidate[];
  transactions: PersonalSettlementTransactionCandidate[];
  reversible_transactions: PersonalReversalCandidate[];
};

export type RpcResult<T> = {
  data: T | null;
  error: { message?: string } | null;
};

import { supabase } from './supabase';

export type BusinessAccountingConnectionStatus =
  | 'pending'
  | 'connected'
  | 'paused'
  | 'error'
  | 'disconnected';

export type BusinessAccountingConnection = {
  connection_id: string;
  business_id: string;
  location_id: string | null;
  location_name: string | null;
  provider_code: string;
  display_name: string;
  connection_mode: 'read_only';
  status: BusinessAccountingConnectionStatus;
  adapter_version: string | null;
  event_schema_version: number;
  last_sync_at: string | null;
  last_heartbeat_at: string | null;
  last_error_code: string | null;
  last_error_at: string | null;
  created_at: string;
  active_devices: number;
};

type AccountingConnectionsResponse = {
  items?: BusinessAccountingConnection[];
  contract_version?: number;
};

export async function getBusinessAccountingConnections(
  businessId: string
): Promise<BusinessAccountingConnection[]> {
  const { data, error } = await supabase.rpc('get_business_accounting_connections_v1', {
    p_business_id: businessId
  });

  if (error) {
    throw new Error(error.message || 'تعذر تحميل حالة النظام المحاسبي.');
  }

  if (!data || typeof data !== 'object') return [];
  const payload = data as AccountingConnectionsResponse;
  return Array.isArray(payload.items) ? payload.items : [];
}


export type BusinessErpSnapshotStatus = {
  available: boolean;
  snapshot_public_id: string | null;
  status: string;
  started_at?: string | null;
  completed_at?: string | null;
  expected_counts?: Record<string, number>;
  received_counts?: Record<string, number>;
  manifest?: {
    table_count?: number;
    full_schema_fingerprint?: string;
    captured_at?: string;
    tables?: Array<{
      table_name?: string;
      row_count?: number;
      primary_key?: string[];
      columns?: Array<{
        name?: string;
        data_type?: string;
        exported?: boolean;
        omission_reason?: string | null;
      }>;
    }>;
    coverage?: Record<string, unknown>;
    disaster_recovery?: Record<string, unknown>;
  };
  contract_version?: number;
};

export type BusinessErpSnapshotRow = {
  row_key: string;
  row_hash: string;
  row_data: Record<string, unknown>;
  captured_at: string;
};

export type BusinessErpSnapshotTableRows = {
  items: BusinessErpSnapshotRow[];
  total: number;
  limit: number;
  offset: number;
  snapshot_public_id: string | null;
  table_name: string;
  contract_version?: number;
};

export async function getBusinessErpSnapshotStatus(
  businessId: string
): Promise<BusinessErpSnapshotStatus> {
  const { data, error } = await supabase.rpc('get_business_erp_snapshot_status_v1', {
    p_business_id: businessId
  });

  if (error) {
    throw new Error(error.message || 'تعذر تحميل حالة النسخة السحابية للنظام المحاسبي.');
  }

  return (data || {
    available: false,
    snapshot_public_id: null,
    status: 'not_started'
  }) as BusinessErpSnapshotStatus;
}

export async function getBusinessErpSnapshotTableRows(
  businessId: string,
  tableName: string,
  limit = 200,
  offset = 0
): Promise<BusinessErpSnapshotTableRows> {
  const { data, error } = await supabase.rpc('get_business_erp_snapshot_table_rows_v1', {
    p_business_id: businessId,
    p_table_name: tableName,
    p_limit: limit,
    p_offset: offset
  });

  if (error) {
    throw new Error(error.message || 'تعذر تحميل بيانات النظام المحاسبي.');
  }

  const payload = (data || {}) as Partial<BusinessErpSnapshotTableRows>;
  return {
    items: Array.isArray(payload.items) ? payload.items : [],
    total: Number(payload.total || 0),
    limit: Number(payload.limit || limit),
    offset: Number(payload.offset || offset),
    snapshot_public_id: payload.snapshot_public_id || null,
    table_name: payload.table_name || tableName,
    contract_version: payload.contract_version
  };
}


export type BusinessErpCustomerCandidate = {
  customer_name: string;
  account_id: number;
  sale_count: number;
  account_count: number;
  account_name?: string | null;
  account_number?: string | null;
  account_type?: string | null;
  customer_number?: string | null;
  mobile?: string | null;
  work_phone?: string | null;
  address?: string | null;
  resolution_status: 'resolved_unique_sale_account' | 'ambiguous_multiple_sale_accounts' | string;
};

export type BusinessErpCustomerCandidatesResponse = {
  items: BusinessErpCustomerCandidate[];
  snapshot_public_id: string | null;
  status: string;
  contract_version?: number;
};

export type BusinessErpCustomerStatementItem = {
  detail_id: number;
  entry_id: number;
  entry_number?: number | null;
  doc_type?: string | null;
  doc_id?: number | null;
  doc_number?: string | null;
  date?: string | null;
  description?: string | null;
  currency_id?: number | null;
  currency_name?: string | null;
  arabic_code?: string | null;
  english_code?: string | null;
  debit: number;
  credit: number;
  signed_source_amount?: number | null;
  mc_amount?: number | null;
  running_balance: number;
};

export type BusinessErpCustomerStatement = {
  status: string;
  snapshot_public_id?: string | null;
  account?: {
    account_id: number;
    account_name?: string | null;
    account_number?: string | null;
    account_type?: string | null;
  };
  identity?: {
    customer_name?: string | null;
    sale_count?: number;
    distinct_names_on_account?: number;
    identity_status?: string;
    customer_number?: string | null;
    mobile?: string | null;
    work_phone?: string | null;
    address?: string | null;
  };
  from_date?: string | null;
  to_date?: string | null;
  opening_by_currency?: Array<{
    currency_id?: number | null;
    currency_name?: string | null;
    arabic_code?: string | null;
    english_code?: string | null;
    debit?: number;
    credit?: number;
    balance?: number;
  }>;
  totals_by_currency?: Array<{
    currency_id?: number | null;
    currency_name?: string | null;
    arabic_code?: string | null;
    english_code?: string | null;
    debit: number;
    credit: number;
    movement_balance: number;
    opening_balance: number;
    closing_balance: number;
  }>;
  items: BusinessErpCustomerStatementItem[];
  sign_convention?: Record<string, unknown>;
  contract_version?: number;
};

export async function searchBusinessErpCustomers(
  businessId: string,
  query: string,
  limit = 50
): Promise<BusinessErpCustomerCandidatesResponse> {
  const { data, error } = await supabase.rpc('get_business_erp_customer_candidates_v1', {
    p_business_id: businessId,
    p_query: query || null,
    p_limit: limit
  });

  if (error) throw new Error(error.message || 'تعذر البحث في عملاء النظام المحاسبي.');

  const payload = (data || {}) as Partial<BusinessErpCustomerCandidatesResponse>;
  return {
    items: Array.isArray(payload.items) ? payload.items : [],
    snapshot_public_id: payload.snapshot_public_id || null,
    status: payload.status || 'unknown',
    contract_version: payload.contract_version
  };
}

export async function getBusinessErpCustomerStatement(
  businessId: string,
  accountId: number,
  fromDate?: string | null,
  toDate?: string | null
): Promise<BusinessErpCustomerStatement> {
  const { data, error } = await supabase.rpc('get_business_erp_customer_statement_v1', {
    p_business_id: businessId,
    p_account_id: accountId,
    p_from_date: fromDate || null,
    p_to_date: toDate || null
  });

  if (error) throw new Error(error.message || 'تعذر تحميل كشف حساب العميل.');

  const payload = (data || {}) as Partial<BusinessErpCustomerStatement>;
  return {
    ...payload,
    status: payload.status || 'unknown',
    items: Array.isArray(payload.items) ? payload.items : [],
    opening_by_currency: Array.isArray(payload.opening_by_currency) ? payload.opening_by_currency : [],
    totals_by_currency: Array.isArray(payload.totals_by_currency) ? payload.totals_by_currency : []
  } as BusinessErpCustomerStatement;
}

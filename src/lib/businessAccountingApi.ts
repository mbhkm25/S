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


export type BusinessErpDocumentKind = 'sale' | 'purchase';

export type BusinessErpDocumentSummary = {
  document_id: number;
  document_number?: string | null;
  document_date?: string | null;
  payment_method?: string | null;
  account_id?: number | null;
  currency_id?: number | null;
  exchange_price?: number | null;
  party_name?: string | null;
  entry_id?: number | null;
  notes?: string | null;
  deleted: boolean;
  locked: boolean;
  captured_at?: string | null;
  currency_name?: string | null;
  arabic_code?: string | null;
  english_code?: string | null;
  line_count: number;
  source_line_total: number;
};

export type BusinessErpDocumentsResponse = {
  status: string;
  document_kind: BusinessErpDocumentKind;
  snapshot_public_id?: string | null;
  items: BusinessErpDocumentSummary[];
  total: number;
  limit: number;
  offset: number;
  amount_semantics?: Record<string, unknown>;
  contract_version?: number;
};

export type BusinessErpDocumentDetail = {
  status: string;
  snapshot_public_id?: string | null;
  header?: {
    document_id: number;
    document_kind: BusinessErpDocumentKind;
    document_number?: string | null;
    document_date?: string | null;
    payment_method?: string | null;
    party_name?: string | null;
    account_id?: string | null;
    currency_id?: string | null;
    currency_name?: string | null;
    arabic_code?: string | null;
    english_code?: string | null;
    exchange_price?: string | null;
    discount?: string | null;
    services_amount?: string | null;
    entry_id?: string | null;
    notes?: string | null;
    deleted?: string | null;
    locked?: string | null;
    captured_at?: string | null;
  };
  lines: Array<{
    line_id: number;
    class_id?: number | null;
    class_name?: string | null;
    class_number?: string | null;
    unit_id?: number | null;
    unit_name?: string | null;
    quantity?: string | null;
    unit_price?: string | null;
    line_discount?: string | null;
    source_total_amount?: string | null;
    serial_number?: string | null;
    class_notes?: string | null;
  }>;
  contract_version?: number;
};

export async function getBusinessErpDocuments(
  businessId: string,
  documentKind: BusinessErpDocumentKind,
  options: {
    query?: string;
    fromDate?: string | null;
    toDate?: string | null;
    limit?: number;
    offset?: number;
  } = {}
): Promise<BusinessErpDocumentsResponse> {
  const { data, error } = await supabase.rpc('get_business_erp_documents_v1', {
    p_business_id: businessId,
    p_document_kind: documentKind,
    p_query: options.query || null,
    p_from_date: options.fromDate || null,
    p_to_date: options.toDate || null,
    p_limit: options.limit ?? 50,
    p_offset: options.offset ?? 0
  });

  if (error) throw new Error(error.message || 'تعذر تحميل مستندات النظام المحاسبي.');

  const payload = (data || {}) as Partial<BusinessErpDocumentsResponse>;
  return {
    status: payload.status || 'unknown',
    document_kind: documentKind,
    snapshot_public_id: payload.snapshot_public_id || null,
    items: Array.isArray(payload.items) ? payload.items : [],
    total: Number(payload.total || 0),
    limit: Number(payload.limit || options.limit || 50),
    offset: Number(payload.offset || options.offset || 0),
    amount_semantics: payload.amount_semantics,
    contract_version: payload.contract_version
  };
}

export async function getBusinessErpDocumentDetail(
  businessId: string,
  documentKind: BusinessErpDocumentKind,
  documentId: number
): Promise<BusinessErpDocumentDetail> {
  const { data, error } = await supabase.rpc('get_business_erp_document_detail_v1', {
    p_business_id: businessId,
    p_document_kind: documentKind,
    p_document_id: documentId
  });

  if (error) throw new Error(error.message || 'تعذر تحميل تفاصيل المستند.');

  const payload = (data || {}) as Partial<BusinessErpDocumentDetail>;
  return {
    ...payload,
    status: payload.status || 'unknown',
    lines: Array.isArray(payload.lines) ? payload.lines : []
  } as BusinessErpDocumentDetail;
}


export type BusinessErpRetentionPolicy = {
  business_id: string;
  enabled: boolean;
  retain_completed_snapshots: number;
  retain_days: number;
  retain_raw_event_days: number;
  configured: boolean;
  updated_at?: string | null;
  metadata?: Record<string, unknown>;
  contract_version?: number;
};

export type BusinessErpPrunePlan = {
  enabled: boolean;
  retain_completed_snapshots?: number;
  retain_days?: number;
  retain_raw_event_days?: number;
  items: Array<{
    snapshot_public_id: string;
    completed_at?: string | null;
    recency_rank?: number;
    materialized_row_count?: number;
  }>;
  dry_run?: boolean;
  reason?: string;
  contract_version?: number;
};

export async function getBusinessErpRetentionPolicy(
  businessId: string
): Promise<BusinessErpRetentionPolicy> {
  const { data, error } = await supabase.rpc('get_business_erp_retention_policy_v1', {
    p_business_id: businessId
  });
  if (error) throw new Error(error.message || 'تعذر تحميل سياسة الاحتفاظ بالنسخ.');
  return data as BusinessErpRetentionPolicy;
}

export async function setBusinessErpRetentionPolicy(
  businessId: string,
  policy: {
    enabled: boolean;
    retainCompletedSnapshots: number;
    retainDays: number;
    retainRawEventDays: number;
  }
): Promise<BusinessErpRetentionPolicy> {
  const { data, error } = await supabase.rpc('set_business_erp_retention_policy_v1', {
    p_business_id: businessId,
    p_enabled: policy.enabled,
    p_retain_completed_snapshots: policy.retainCompletedSnapshots,
    p_retain_days: policy.retainDays,
    p_retain_raw_event_days: policy.retainRawEventDays
  });
  if (error) throw new Error(error.message || 'تعذر حفظ سياسة الاحتفاظ بالنسخ.');
  return data as BusinessErpRetentionPolicy;
}

export async function planBusinessErpSnapshotPrune(
  businessId: string
): Promise<BusinessErpPrunePlan> {
  const { data, error } = await supabase.rpc('plan_business_erp_snapshot_prune_v1', {
    p_business_id: businessId
  });
  if (error) throw new Error(error.message || 'تعذر حساب خطة تنظيف النسخ القديمة.');
  const payload = (data || {}) as Partial<BusinessErpPrunePlan>;
  return {
    enabled: Boolean(payload.enabled),
    retain_completed_snapshots: payload.retain_completed_snapshots,
    retain_days: payload.retain_days,
    retain_raw_event_days: payload.retain_raw_event_days,
    items: Array.isArray(payload.items) ? payload.items : [],
    dry_run: payload.dry_run,
    reason: payload.reason,
    contract_version: payload.contract_version
  };
}

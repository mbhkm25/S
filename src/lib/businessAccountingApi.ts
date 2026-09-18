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

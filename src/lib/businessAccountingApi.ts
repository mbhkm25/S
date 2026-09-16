import { supabase } from './supabase';
import { toUserSafeServiceError } from './userFacingError';

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
    console.error('[SANAD accounting connections]', {
      code: error.code,
      message: error.message,
      details: error.details,
    });
    throw toUserSafeServiceError(error, 'تعذر تحميل حالة النظام المحاسبي حاليًا.');
  }

  if (!data || typeof data !== 'object') return [];
  const payload = data as AccountingConnectionsResponse;
  return Array.isArray(payload.items) ? payload.items : [];
}

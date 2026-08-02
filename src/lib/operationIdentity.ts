import { supabase } from './supabase';

export type OperationIdentitySource =
  | 'linked_business'
  | 'exact_identifier_match'
  | 'document_extraction';

export interface OperationIdentityProjection {
  operation_id: string;
  raw_receiver_name: string | null;
  raw_sender_name: string | null;
  receiver_name_normalized: string | null;
  sender_name_normalized: string | null;
  receiver_account: string | null;
  merchant_point: string | null;
  financial_entity: string | null;
  financial_entity_code: string | null;
  linked_business_id: string | null;
  linked_business_name: string | null;
  linked_financial_account_id: string | null;
  matched_business_id: string | null;
  matched_business_name: string | null;
  matched_account_id: string | null;
  resolved_business_name: string | null;
  resolved_account_holder_name: string | null;
  identity_source: OperationIdentitySource;
  identity_confidence: number;
  has_name_conflict: boolean;
  match_score: number | null;
  match_strategy: string | null;
  reason_codes: string[];
  field_confidences: Record<string, number>;
  field_evidence: Record<string, string | null>;
}

export async function getOperationIdentityProjections(
  operationIds: string[]
): Promise<Map<string, OperationIdentityProjection>> {
  const uniqueIds = [...new Set(operationIds.filter(Boolean))];
  if (!uniqueIds.length) return new Map();

  const { data, error } = await supabase.rpc('get_operation_identity_projection', {
    p_operation_ids: uniqueIds
  });

  if (error) throw new Error(error.message || 'تعذر تحميل هوية العمليات.');

  const payload = data && typeof data === 'object'
    ? data as { items?: OperationIdentityProjection[] }
    : {};
  const items = Array.isArray(payload.items) ? payload.items : [];
  return new Map(items.map((item) => [item.operation_id, item]));
}

export function getOperationIdentityTitle(
  identity: OperationIdentityProjection | null | undefined,
  fallbackTitle: string
): string {
  if (!identity?.resolved_business_name) return fallbackTitle;

  if (identity.identity_source === 'linked_business') {
    return `عملية لدى ${identity.resolved_business_name}`;
  }

  if (identity.identity_source === 'exact_identifier_match') {
    return `عملية مطابقة لحساب ${identity.resolved_business_name}`;
  }

  return fallbackTitle;
}

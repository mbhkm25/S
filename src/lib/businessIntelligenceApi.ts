import { supabase } from './supabase';

export interface BusinessActivityEvent {
  id: string;
  party_id?: string | null;
  party_name?: string | null;
  source_kind: 'erp' | 'payment' | 'manual' | 'system' | string;
  event_type: string;
  title: string;
  summary?: string | null;
  amount?: number | null;
  currency?: string | null;
  business_date?: string | null;
  occurred_at?: string | null;
  status: string;
  data: Record<string, unknown>;
  created_at: string;
  sort_at: string;
}

export interface BusinessActivityTimelineResponse {
  items: BusinessActivityEvent[];
  contract_version: number;
}

export async function getBusinessActivityTimeline(
  businessId: string,
  options: {
    partyId?: string | null;
    limit?: number;
    before?: string | null;
  } = {}
): Promise<BusinessActivityTimelineResponse> {
  const { data, error } = await supabase.rpc('get_business_activity_timeline_v1', {
    p_business_id: businessId,
    p_party_id: options.partyId || null,
    p_limit: Math.max(1, Math.min(options.limit || 50, 100)),
    p_before: options.before || null
  });

  if (error) throw error;

  const payload = data && typeof data === 'object'
    ? data as { items?: unknown; contract_version?: unknown }
    : {};

  return {
    items: Array.isArray(payload.items) ? payload.items as BusinessActivityEvent[] : [],
    contract_version: Number(payload.contract_version || 1)
  };
}

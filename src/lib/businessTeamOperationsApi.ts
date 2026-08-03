import { supabase } from './supabase';

export type TeamOperationActivityType =
  | 'all'
  | 'in_progress'
  | 'completed'
  | 'review_required'
  | 'released'
  | 'linked';

export interface TeamOperationEvent {
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  reason: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  actor_user_id: string | null;
  actor_name: string | null;
  is_member_action: boolean;
  assigned_to_member: boolean;
}

export interface TeamMemberOperationItem {
  operation_id: string;
  inbox_id: string | null;
  current_status: string;
  row_version: number | null;
  current_assignee: {
    user_id: string;
    name: string | null;
    claimed_at: string;
    claim_expires_at: string;
  } | null;
  completed_by: {
    user_id: string;
    name: string | null;
    completed_at: string;
    source: string | null;
  } | null;
  contribution: {
    claimed: boolean;
    completed: boolean;
    requested_review: boolean;
    released: boolean;
    linked: boolean;
    verified: boolean;
  };
  member_events: TeamOperationEvent[];
  latest_member_activity_at: string;
  operation: {
    id: string;
    public_token: string;
    created_at: string;
    status: string;
    ai_status: string;
    summary: string | null;
    financial_entity: string | null;
    financial_entity_code: string | null;
    transaction_type: string | null;
    amount: number | null;
    currency: string | null;
    reference_number: string | null;
    transaction_datetime: string | null;
  };
}

export interface TeamMemberOperationsResultV2 {
  member: {
    membership_id: string;
    user_id: string;
    status: string;
    job_title: string | null;
    full_name: string | null;
    phone: string | null;
    joined_at: string;
  };
  summary: {
    claimed_count: number;
    completed_count: number;
    in_progress_count: number;
    review_requested_count: number;
    released_count: number;
    linked_count: number;
    verified_count: number;
    average_completion_seconds: number | null;
    last_activity_at: string | null;
  };
  items: TeamMemberOperationItem[];
  limit: number;
  offset: number;
  activity_type: TeamOperationActivityType;
  supervision: boolean;
}

export async function getBusinessTeamMemberOperationsV2(
  businessId: string,
  memberUserId: string,
  activityType: TeamOperationActivityType = 'all',
  limit = 50,
  offset = 0
): Promise<TeamMemberOperationsResultV2> {
  const { data, error } = await supabase.rpc('get_business_team_member_operations_v2', {
    p_business_id: businessId,
    p_member_user_id: memberUserId,
    p_activity_type: activityType,
    p_limit: limit,
    p_offset: offset
  });

  if (error) {
    throw new Error(error.message || 'تعذر تحميل السجل التشغيلي لعضو الفريق.');
  }

  return data as TeamMemberOperationsResultV2;
}

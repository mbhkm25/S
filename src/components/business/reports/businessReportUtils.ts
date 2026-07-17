import type { BusinessOperationItem } from '../../../lib/businessApi';

export type OperationVerificationState = 'verified' | 'needs_review' | 'pending';

export function getOperationVerificationState(
  item: BusinessOperationItem
): OperationVerificationState {
  const operation = item.operation;
  if (!operation) return 'pending';

  const isVerified =
    operation.status === 'verified' ||
    Boolean(operation.verified_at) ||
    Boolean(operation.verified_by_user_id);

  if (isVerified) return 'verified';
  if (operation.ai_status === 'failed' || operation.status === 'needs_review') {
    return 'needs_review';
  }
  return 'pending';
}

export function getOperationDate(item: BusinessOperationItem): Date | null {
  const value =
    item.operation?.transaction_datetime ||
    item.operation?.created_at ||
    item.linked_at;
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
}

export function getOperationStatusLabel(item: BusinessOperationItem): string {
  switch (getOperationVerificationState(item)) {
    case 'verified':
      return 'موثقة ومعتمدة';
    case 'needs_review':
      return 'تحتاج مراجعة';
    default:
      return 'معلقة';
  }
}

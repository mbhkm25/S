export type LocalRuntimePhase =
  | 'idle'
  | 'offline'
  | 'queued'
  | 'syncing'
  | 'synced'
  | 'review_required'
  | 'notification_captured'
  | 'error';

export interface LocalRuntimeStatusDetail {
  phase: LocalRuntimePhase;
  message: string;
  localId?: string;
  cloudOperationId?: string | null;
  pendingCount?: number;
  timestamp: string;
}

export const LOCAL_RUNTIME_STATUS_EVENT = 'sanadLocalRuntimeStatus';

export function emitLocalRuntimeStatus(
  detail: Omit<LocalRuntimeStatusDetail, 'timestamp'> & { timestamp?: string },
): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<LocalRuntimeStatusDetail>(LOCAL_RUNTIME_STATUS_EVENT, {
    detail: { ...detail, timestamp: detail.timestamp ?? new Date().toISOString() },
  }));
}

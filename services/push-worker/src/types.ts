export const ACTION_TYPES = [
  'operation_details', 'reports', 'business_invitation', 'business_manage', 'business_team',
  'business_operations', 'business_public_profile', 'pro_payment', 'subscription', 'profile', 'none'
] as const;

export type NotificationActionType = typeof ACTION_TYPES[number];
export type NotificationCategory = 'operations' | 'reports' | 'business' | 'subscription' | 'security' | 'system';
export type NotificationSeverity = 'info' | 'success' | 'warning' | 'error';
export type DeliveryAttemptStatus = 'sent' | 'failed' | 'gone' | 'skipped';
export type OutboxFinalStatus = 'sent' | 'no_subscription' | 'retry' | 'dead';
export type OutboxProcessingOutcome = OutboxFinalStatus | 'configuration_failure' | 'lease_lost' | 'uncertain' | 'shutdown_interrupted';

export interface ClaimedOutboxItem {
  outbox_id: string;
  notification_id: string;
  recipient_user_id: string;
  attempt_count: number;
  notification_type: string;
  category: NotificationCategory;
  severity: NotificationSeverity;
  title: string;
  body: string;
  action_type: NotificationActionType;
  action_payload: Record<string, unknown>;
  created_at: string;
}

export interface PushDeliveryTarget {
  subscription_id: string;
  endpoint: string;
  p256dh: string;
  auth_secret: string;
  content_encoding: 'aes128gcm' | 'aesgcm';
  platform: 'web' | 'pwa';
  failure_count: number;
}

export interface PushPayload {
  version: 1;
  notification_id: string;
  title: string;
  body: string;
  category: NotificationCategory;
  severity: NotificationSeverity;
  action_type: NotificationActionType;
  action_payload: Record<string, string>;
  created_at: string;
}

export interface BuiltPushPayload {
  payload: PushPayload;
  serialized: string;
  byteLength: number;
}

export interface SendOptions {
  TTL: number;
  urgency: 'high' | 'normal';
  topic: string;
}

export interface SendResult { statusCode: number; }

export interface PushSender {
  send(target: PushDeliveryTarget, serializedPayload: string, options: SendOptions): Promise<SendResult>;
}

export type PushReservationReason =
  | 'subscription_not_deliverable'
  | 'already_sent'
  | 'reserved_by_other'
  | 'uncertain_cooldown'
  | 'unknown';

export interface PushDeliveryReservation {
  reservationToken: string;
  expiresAt: string;
}

export type PushReservationResult =
  | { reserved: true; reservation: PushDeliveryReservation }
  | { reserved: false; reason: PushReservationReason; expiresAt: string | null };

export interface PushOutboxDeliveryState {
  outboxId: string;
  notificationId: string;
  sentCount: number;
  activeSubscriptionCount: number;
  activeUnsentCount: number;
  activeReservationCount: number;
  uncertainCount: number;
  transientFailureCount: number;
  permanentFailureCount: number;
  goneCount: number;
  configurationFailureCount: number;
}

export interface ReservedAttemptInput {
  outboxId: string;
  workerId: string;
  subscriptionId: string;
  reservationToken: string;
  status: DeliveryAttemptStatus;
  httpStatus: number | null;
  errorCode: string | null;
  disableSubscription: boolean;
}

export interface FinalizeInput {
  outboxId: string;
  workerId: string;
  status: OutboxFinalStatus;
  nextAttemptAt: string | null;
  errorCode: string | null;
}

export interface PushDatabase {
  claimBatch(workerId: string, batchSize: number, lockSeconds: number, maxAttempts: number): Promise<ClaimedOutboxItem[]>;
  getDeliveryTargets(outboxId: string, workerId: string): Promise<PushDeliveryTarget[]>;
  reserveDelivery(outboxId: string, workerId: string, subscriptionId: string, reservationSeconds: number): Promise<PushReservationResult>;
  renewDeliveryReservation(reservationToken: string, workerId: string, reservationSeconds: number): Promise<string>;
  releaseDeliveryReservation(reservationToken: string, workerId: string, reason: string): Promise<void>;
  markDeliveryUncertain(reservationToken: string, workerId: string, cooldownSeconds: number, errorCode: string): Promise<string>;
  recordReservedAttempt(input: ReservedAttemptInput): Promise<void>;
  getOutboxDeliveryState(outboxId: string, workerId: string): Promise<PushOutboxDeliveryState>;
  finalize(input: FinalizeInput): Promise<void>;
  renewLock(outboxId: string, workerId: string, lockSeconds: number): Promise<void>;
}

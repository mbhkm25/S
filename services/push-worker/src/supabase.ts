import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { WorkerConfig } from './config.js';
import {
  ACTION_TYPES, type ClaimedOutboxItem, type FinalizeInput, type NotificationCategory,
  type NotificationSeverity, type PushDatabase, type PushDeliveryTarget, type PushOutboxDeliveryState,
  type PushReservationReason, type PushReservationResult, type ReservedAttemptInput
} from './types.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CATEGORIES = ['operations', 'reports', 'business', 'subscription', 'security', 'system'] as const;
const SEVERITIES = ['info', 'success', 'warning', 'error'] as const;
const RESERVATION_REASONS = ['subscription_not_deliverable', 'already_sent', 'reserved_by_other', 'uncertain_cooldown'] as const;
const SAFE_DATABASE_CODES = new Set([
  'push_outbox_lock_not_owned', 'push_delivery_reservation_not_owned', 'push_delivery_reservation_expired',
  'push_delivery_already_sent', 'push_delivery_already_reserved', 'push_delivery_uncertain',
  'invalid_worker_request', 'invalid_delivery_reservation', 'invalid_delivery_attempt', 'invalid_outbox_finalization',
  'invalid_push_delivery_state_request', 'invalid_push_uncertain_mark', 'invalid_reserved_delivery_attempt',
  'invalid_push_reservation_release', 'invalid_push_reservation_renewal', 'invalid_push_reservation_request',
  'subscription_not_owned_by_recipient'
]);

export class DatabaseContractError extends Error {
  constructor(public readonly code: string) { super(code); this.name = 'DatabaseContractError'; }
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new DatabaseContractError('invalid_rpc_response');
  return value as Record<string, unknown>;
}
function string(value: unknown, code = 'invalid_rpc_response'): string {
  if (typeof value !== 'string' || !value) throw new DatabaseContractError(code);
  return value;
}
function uuid(value: unknown): string {
  const parsed = string(value);
  if (!UUID.test(parsed)) throw new DatabaseContractError('invalid_rpc_uuid');
  return parsed;
}
function integer(value: unknown): number {
  if (!Number.isInteger(value) || (value as number) < 0) throw new DatabaseContractError('invalid_rpc_integer');
  return value as number;
}
function date(value: unknown): string {
  const parsed = string(value);
  if (Number.isNaN(Date.parse(parsed))) throw new DatabaseContractError('invalid_rpc_date');
  return parsed;
}
function optionalDate(value: unknown): string | null { return value === null || value === undefined ? null : date(value); }
function assertOk(value: unknown): Record<string, unknown> {
  const row = object(value);
  if (row.ok !== true) throw new DatabaseContractError('rpc_operation_failed');
  return row;
}

function parseClaim(value: unknown): ClaimedOutboxItem {
  const row = object(value);
  const category = string(row.category) as NotificationCategory;
  const severity = string(row.severity) as NotificationSeverity;
  const action = string(row.action_type);
  if (!(CATEGORIES as readonly string[]).includes(category) || !(SEVERITIES as readonly string[]).includes(severity)
      || !(ACTION_TYPES as readonly string[]).includes(action)) throw new DatabaseContractError('invalid_notification_contract');
  return {
    outbox_id: uuid(row.outbox_id), notification_id: uuid(row.notification_id), recipient_user_id: uuid(row.recipient_user_id),
    attempt_count: integer(row.attempt_count), notification_type: string(row.notification_type), category, severity,
    title: string(row.title), body: string(row.body), action_type: action as ClaimedOutboxItem['action_type'],
    action_payload: object(row.action_payload), created_at: date(row.created_at)
  };
}

function parseTarget(value: unknown): PushDeliveryTarget {
  const row = object(value);
  const encoding = string(row.content_encoding);
  const platform = string(row.platform);
  if ((encoding !== 'aes128gcm' && encoding !== 'aesgcm') || (platform !== 'web' && platform !== 'pwa')) {
    throw new DatabaseContractError('invalid_subscription_contract');
  }
  const endpoint = string(row.endpoint);
  let parsed: URL;
  try { parsed = new URL(endpoint); } catch { throw new DatabaseContractError('invalid_subscription_endpoint'); }
  if (parsed.protocol !== 'https:') throw new DatabaseContractError('invalid_subscription_endpoint');
  return {
    subscription_id: uuid(row.subscription_id), endpoint, p256dh: string(row.p256dh), auth_secret: string(row.auth_secret),
    content_encoding: encoding, platform, failure_count: integer(row.failure_count)
  };
}

function safeDatabaseCode(error: unknown, fallback: string): string {
  if (!error || typeof error !== 'object') return fallback;
  const source = error as Record<string, unknown>;
  for (const candidate of [source.code, source.message]) {
    if (typeof candidate === 'string' && SAFE_DATABASE_CODES.has(candidate.trim())) return candidate.trim();
  }
  return fallback;
}

async function rpc(client: SupabaseClient, name: string, args: Record<string, unknown>): Promise<unknown> {
  const { data, error } = await client.rpc(name, args);
  if (error) throw new DatabaseContractError(safeDatabaseCode(error, `rpc_${name}_failed`));
  return data;
}

function parseReservation(value: unknown): PushReservationResult {
  const row = assertOk(value);
  if (typeof row.reserved !== 'boolean') throw new DatabaseContractError('invalid_reservation_response');
  if (row.reserved) return { reserved: true, reservation: { reservationToken: uuid(row.reservation_token), expiresAt: date(row.expires_at) } };
  const rawReason = string(row.reason);
  const reason: PushReservationReason = (RESERVATION_REASONS as readonly string[]).includes(rawReason)
    ? rawReason as PushReservationReason : 'unknown';
  return { reserved: false, reason, expiresAt: optionalDate(row.expires_at) };
}

function parseDeliveryState(value: unknown): PushOutboxDeliveryState {
  const row = assertOk(value);
  return {
    outboxId: uuid(row.outbox_id), notificationId: uuid(row.notification_id), sentCount: integer(row.sent_count),
    activeSubscriptionCount: integer(row.active_subscription_count), activeUnsentCount: integer(row.active_unsent_count),
    activeReservationCount: integer(row.active_reservation_count), uncertainCount: integer(row.uncertain_count),
    transientFailureCount: integer(row.transient_failure_count), permanentFailureCount: integer(row.permanent_failure_count),
    goneCount: integer(row.gone_count), configurationFailureCount: integer(row.configuration_failure_count)
  };
}

export function createPushDatabase(config: WorkerConfig): PushDatabase {
  const client = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  });
  return {
    async claimBatch(workerId, batchSize, lockSeconds, maxAttempts) {
      const data = await rpc(client, 'claim_push_outbox_batch', { p_worker_id: workerId, p_batch_size: batchSize, p_lock_seconds: lockSeconds, p_max_attempts: maxAttempts });
      if (!Array.isArray(data)) throw new DatabaseContractError('invalid_claim_response');
      return data.map(parseClaim);
    },
    async getDeliveryTargets(outboxId, workerId) {
      const data = await rpc(client, 'get_push_delivery_targets', { p_outbox_id: outboxId, p_worker_id: workerId });
      if (!Array.isArray(data)) throw new DatabaseContractError('invalid_targets_response');
      return data.map(parseTarget);
    },
    async reserveDelivery(outboxId, workerId, subscriptionId, reservationSeconds) {
      return parseReservation(await rpc(client, 'reserve_push_delivery', {
        p_outbox_id: outboxId, p_worker_id: workerId, p_subscription_id: subscriptionId, p_reservation_seconds: reservationSeconds
      }));
    },
    async renewDeliveryReservation(reservationToken, workerId, reservationSeconds) {
      const row = assertOk(await rpc(client, 'renew_push_delivery_reservation', {
        p_reservation_token: reservationToken, p_worker_id: workerId, p_reservation_seconds: reservationSeconds
      }));
      if (uuid(row.reservation_token) !== reservationToken) throw new DatabaseContractError('reservation_token_mismatch');
      return date(row.expires_at);
    },
    async releaseDeliveryReservation(reservationToken, workerId, reason) {
      const row = assertOk(await rpc(client, 'release_push_delivery_reservation', {
        p_reservation_token: reservationToken, p_worker_id: workerId, p_reason: reason
      }));
      if (uuid(row.reservation_token) !== reservationToken || row.status !== 'released') throw new DatabaseContractError('invalid_release_response');
    },
    async markDeliveryUncertain(reservationToken, workerId, cooldownSeconds, errorCode) {
      const row = assertOk(await rpc(client, 'mark_push_delivery_uncertain', {
        p_reservation_token: reservationToken, p_worker_id: workerId, p_cooldown_seconds: cooldownSeconds, p_error_code: errorCode
      }));
      if (uuid(row.reservation_token) !== reservationToken || row.status !== 'uncertain') throw new DatabaseContractError('invalid_uncertain_response');
      return date(row.retry_after);
    },
    async recordReservedAttempt(input: ReservedAttemptInput) {
      const row = assertOk(await rpc(client, 'record_reserved_push_delivery_attempt', {
        p_outbox_id: input.outboxId, p_worker_id: input.workerId, p_subscription_id: input.subscriptionId,
        p_reservation_token: input.reservationToken, p_status: input.status, p_http_status: input.httpStatus,
        p_error_code: input.errorCode, p_disable_subscription: input.disableSubscription
      }));
      if (uuid(row.reservation_token) !== input.reservationToken || row.status !== input.status) throw new DatabaseContractError('invalid_record_response');
    },
    async getOutboxDeliveryState(outboxId, workerId) {
      const state = parseDeliveryState(await rpc(client, 'get_push_outbox_delivery_state', { p_outbox_id: outboxId, p_worker_id: workerId }));
      if (state.outboxId !== outboxId) throw new DatabaseContractError('outbox_state_mismatch');
      return state;
    },
    async finalize(input: FinalizeInput) {
      const row = assertOk(await rpc(client, 'finalize_push_outbox', {
        p_outbox_id: input.outboxId, p_worker_id: input.workerId, p_status: input.status,
        p_next_attempt_at: input.nextAttemptAt, p_error_code: input.errorCode
      }));
      if (uuid(row.outbox_id) !== input.outboxId || row.status !== input.status) throw new DatabaseContractError('invalid_finalize_response');
    },
    async renewLock(outboxId, workerId, lockSeconds) {
      const row = assertOk(await rpc(client, 'renew_push_outbox_lock', { p_outbox_id: outboxId, p_worker_id: workerId, p_lock_seconds: lockSeconds }));
      if (uuid(row.outbox_id) !== outboxId || integer(row.lease_seconds) !== lockSeconds) throw new DatabaseContractError('invalid_renew_lock_response');
    }
  };
}

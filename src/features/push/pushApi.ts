import { supabase } from '../../lib/supabase';
import { PushClientError } from './pushErrors';
import type { PushDeviceInfo, PushStatusResponse, PushSubscriptionPayload } from './types';

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isNullableDate(value: unknown): value is string | null {
  return value === null || (typeof value === 'string' && !Number.isNaN(Date.parse(value)));
}

function parseDevice(value: unknown): PushDeviceInfo {
  if (!isRecord(value)
      || typeof value.id !== 'string'
      || (value.platform !== 'pwa' && value.platform !== 'web')
      || (value.device_label !== null && typeof value.device_label !== 'string')
      || !isNullableDate(value.last_seen_at)
      || !isNullableDate(value.last_success_at)
      || typeof value.created_at !== 'string'
      || Number.isNaN(Date.parse(value.created_at))) {
    throw new PushClientError('rpc_failure');
  }
  return {
    id: value.id,
    platform: value.platform,
    device_label: value.device_label as string | null,
    last_seen_at: value.last_seen_at,
    last_success_at: value.last_success_at,
    created_at: value.created_at
  };
}

export function validatePushStatus(value: unknown): PushStatusResponse {
  if (!isRecord(value)
      || typeof value.enabled !== 'boolean'
      || !Number.isInteger(value.active_device_count)
      || (value.active_device_count as number) < 0
      || !Array.isArray(value.devices)) {
    throw new PushClientError('rpc_failure');
  }
  const devices = value.devices.map(parseDevice);
  if (devices.length !== value.active_device_count) {
    throw new PushClientError('rpc_failure');
  }
  return {
    enabled: value.enabled,
    active_device_count: value.active_device_count as number,
    devices
  };
}

function assertOkResponse(value: unknown): void {
  if (!isRecord(value) || value.ok !== true) throw new PushClientError('rpc_failure');
}

export async function getMyPushStatus(): Promise<PushStatusResponse> {
  const { data, error } = await supabase.rpc('get_my_push_status');
  if (error) throw new PushClientError('rpc_failure');
  return validatePushStatus(data);
}

export async function upsertMyPushSubscription(payload: PushSubscriptionPayload): Promise<void> {
  const { data, error } = await supabase.rpc('upsert_my_push_subscription', {
    p_endpoint: payload.endpoint,
    p_p256dh: payload.p256dh,
    p_auth_secret: payload.auth_secret,
    p_user_agent: payload.user_agent,
    p_device_label: payload.device_label,
    p_platform: payload.platform
  });
  if (error) throw new PushClientError('rpc_failure');
  assertOkResponse(data);
}

export async function deactivateMyPushSubscription(endpoint: string): Promise<void> {
  const { data, error } = await supabase.rpc('deactivate_my_push_subscription', {
    p_endpoint: endpoint
  });
  if (error) throw new PushClientError('rpc_failure');
  assertOkResponse(data);
}

import {
  isNotificationActionType,
  type NotificationActionType
} from '../notifications/types';
import type { SanadNotificationClickMessage } from './types';

export interface SafeNavigationTarget {
  page: string;
  token?: string;
  source?: 'app';
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SAFE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{6,200}$/;
const SAFE_SLUG_PATTERN = /^[A-Za-z0-9_-]{1,120}$/;

export function isValidNotificationId(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

export function isSafePublicToken(value: unknown): value is string {
  return typeof value === 'string' && SAFE_TOKEN_PATTERN.test(value);
}

export function isSafeSlug(value: unknown): value is string {
  return typeof value === 'string' && SAFE_SLUG_PATTERN.test(value);
}

function getPayloadString(
  payload: Record<string, unknown>,
  keys: string[],
  validator: (value: unknown) => value is string
): string | null {
  for (const key of keys) {
    const value = payload[key];
    if (validator(value)) return value;
  }
  return null;
}

export function sanitizeActionPayload(
  actionType: NotificationActionType,
  payload: unknown
): Record<string, string> {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return {};
  const record = payload as Record<string, unknown>;
  if (actionType === 'operation_details') {
    const token = getPayloadString(record, ['public_token', 'token'], isSafePublicToken);
    return token ? { public_token: token } : {};
  }
  if (actionType === 'business_public_profile') {
    const slug = getPayloadString(record, ['business_slug', 'slug'], isSafeSlug);
    return slug ? { business_slug: slug } : {};
  }
  return {};
}

export function getSafeNavigationTarget(
  actionType: NotificationActionType,
  payload: Record<string, unknown>
): SafeNavigationTarget | null {
  switch (actionType) {
    case 'operation_details': {
      const token = getPayloadString(payload, ['public_token', 'token'], isSafePublicToken);
      return token ? { page: 'details', token, source: 'app' } : null;
    }
    case 'reports': return { page: 'reports' };
    case 'business_invitation':
    case 'pro_payment':
    case 'subscription':
    case 'profile': return { page: 'profile' };
    case 'business_manage': return { page: 'business-manage' };
    case 'business_team': return { page: 'business-team' };
    case 'business_operations': return { page: 'business-operations' };
    case 'business_public_profile': {
      const slug = getPayloadString(payload, ['business_slug', 'slug'], isSafeSlug);
      return slug ? { page: 'public-business-profile', token: slug } : null;
    }
    case 'none': return { page: 'notifications' };
  }
}

function normalizeBasePath(basePath: string): string {
  const safe = /^\/[A-Za-z0-9/_-]*$/.test(basePath) ? basePath : '/';
  return safe.endsWith('/') ? safe : `${safe}/`;
}

export function buildSafeNotificationPath(
  actionType: NotificationActionType,
  payload: Record<string, unknown>,
  notificationId: string | null,
  basePath = '/'
): string {
  const target = getSafeNavigationTarget(actionType, payload) || { page: 'notifications' };
  const base = normalizeBasePath(basePath);
  let path = `${base}notifications`;
  if (target.page === 'details' && target.token) path = `${base}v/${encodeURIComponent(target.token)}`;
  else if (target.page === 'reports') path = `${base}reports`;
  else if (target.page === 'profile') path = `${base}profile`;
  else if (target.page === 'business-manage') path = `${base}business/manage`;
  else if (target.page === 'business-team') path = `${base}business/manage/team`;
  else if (target.page === 'business-operations') path = `${base}business/manage/operations`;
  else if (target.page === 'public-business-profile' && target.token) {
    path = `${base}b/${encodeURIComponent(target.token)}`;
  }
  if (isValidNotificationId(notificationId)) {
    path += `${path.includes('?') ? '&' : '?'}notification=${encodeURIComponent(notificationId)}`;
  }
  return path;
}

export function parseNotificationClickMessage(value: unknown): SanadNotificationClickMessage | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const message = value as Record<string, unknown>;
  if (message.type !== 'SANAD_NOTIFICATION_CLICK' || !isNotificationActionType(message.actionType)) return null;
  const notificationId = isValidNotificationId(message.notificationId) ? message.notificationId : null;
  const actionPayload = sanitizeActionPayload(message.actionType, message.actionPayload);
  return {
    type: 'SANAD_NOTIFICATION_CLICK',
    notificationId,
    actionType: message.actionType,
    actionPayload
  };
}


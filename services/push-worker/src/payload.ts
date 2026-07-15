import { createHash } from 'node:crypto';
import { ACTION_TYPES, type BuiltPushPayload, type ClaimedOutboxItem, type NotificationActionType, type PushPayload, type SendOptions } from './types.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SAFE_SLUG = /^[A-Za-z0-9_-]{1,120}$/;

export class PayloadError extends Error {
  readonly code = 'push_payload_too_large';
  constructor() { super('push_payload_too_large'); this.name = 'PayloadError'; }
}

function graphemes(value: string): string[] {
  if (typeof Intl.Segmenter === 'function') {
    return Array.from(new Intl.Segmenter('ar', { granularity: 'grapheme' }).segment(value), (part) => part.segment);
  }
  return Array.from(value);
}

function truncate(value: string, max: number): string { return graphemes(value).slice(0, max).join(''); }

export function sanitizeText(value: unknown, fallback: string, max: number): string {
  if (typeof value !== 'string') return fallback.normalize('NFC');
  const cleaned = value.normalize('NFC')
    .replace(/[\x00-\x1f\x7f]/g, ' ')
    .replace(/https?:\/\/\S+/gi, '[رابط محمي]')
    .replace(/\beyJ[A-Za-z0-9._-]+\b/g, '[بيانات محمية]')
    .replace(/\d{6,}/g, '[بيانات محمية]')
    .replace(/\s+/g, ' ').trim();
  return truncate(cleaned || fallback.normalize('NFC'), max);
}

function isActionType(value: unknown): value is NotificationActionType {
  return typeof value === 'string' && (ACTION_TYPES as readonly string[]).includes(value);
}

export function sanitizeAction(actionType: unknown, actionPayload: unknown): { actionType: NotificationActionType; actionPayload: Record<string, string> } {
  if (!isActionType(actionType)) return { actionType: 'none', actionPayload: {} };
  if (!actionPayload || typeof actionPayload !== 'object' || Array.isArray(actionPayload)) return { actionType, actionPayload: {} };
  const record = actionPayload as Record<string, unknown>;
  if (actionType === 'operation_details') {
    const token = record.public_token ?? record.token;
    return UUID.test(String(token ?? '')) ? { actionType, actionPayload: { public_token: String(token) } } : { actionType: 'none', actionPayload: {} };
  }
  if (actionType === 'business_public_profile') {
    const slug = record.business_slug ?? record.slug;
    return SAFE_SLUG.test(String(slug ?? '')) ? { actionType, actionPayload: { business_slug: String(slug) } } : { actionType: 'none', actionPayload: {} };
  }
  return { actionType, actionPayload: {} };
}

function result(payload: PushPayload): BuiltPushPayload {
  const serialized = JSON.stringify(payload);
  return { payload, serialized, byteLength: Buffer.byteLength(serialized, 'utf8') };
}

export function buildPushPayload(item: ClaimedOutboxItem, maxBytes: number): BuiltPushPayload {
  const action = sanitizeAction(item.action_type, item.action_payload);
  const payload: PushPayload = {
    version: 1, notification_id: item.notification_id,
    title: sanitizeText(item.title, 'إشعار جديد من سند', 120),
    body: sanitizeText(item.body, 'لديك تحديث جديد. افتح سند لعرض التفاصيل.', 240),
    category: item.category, severity: item.severity,
    action_type: action.actionType, action_payload: action.actionPayload, created_at: item.created_at
  };
  let built = result(payload);
  if (built.byteLength <= maxBytes) return built;

  const parts = graphemes(payload.body);
  let low = 0;
  let high = parts.length;
  let best: BuiltPushPayload | null = null;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const candidate = result({ ...payload, body: parts.slice(0, middle).join('') });
    if (candidate.byteLength <= maxBytes) { best = candidate; low = middle + 1; } else { high = middle - 1; }
  }
  if (best) return best;

  built = result({
    ...payload, title: 'إشعار جديد من سند', body: 'افتح سند لعرض التفاصيل.', action_type: 'none', action_payload: {}
  });
  if (built.byteLength > maxBytes) throw new PayloadError();
  return built;
}

export function getSendOptions(item: ClaimedOutboxItem): SendOptions {
  const urgent = item.category === 'security' || item.category === 'operations';
  return { TTL: urgent ? 21_600 : 86_400, urgency: urgent ? 'high' : 'normal', topic: createHash('sha256').update(item.notification_id).digest('base64url').slice(0, 32) };
}

import { createHash } from 'node:crypto';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export interface Logger { log(level: LogLevel, event: string, fields?: Record<string, unknown>): void; }

const BLOCKED_KEYS = new Set([
  'authorization', 'apikey', 'api_key', 'service_role', 'service_role_key', 'supabase_service_role_key',
  'web_push_vapid_private_key', 'private_key', 'access_token', 'refresh_token', 'token', 'password',
  'secret', 'auth', 'auth_secret', 'p256dh', 'endpoint', 'subscription', 'headers', 'cookie', 'set-cookie',
  'request', 'response', 'body', 'payload'
]);
const REDACTED = '[REDACTED]';
const MAX_DEPTH = 5;

export function hashEndpoint(endpoint: string): string {
  return createHash('sha256').update(endpoint).digest('hex').slice(0, 16);
}

export function safeErrorCode(value: unknown, fallback = 'unknown_error'): string {
  if (typeof value !== 'string') return fallback;
  const normalized = value.toLowerCase().replace(/[^a-z0-9_.:-]/g, '_').slice(0, 100);
  if (/(?:secret|token|password|bearer|authorization|auth[_-]?key|private[_-]?key|endpoint|cookie)/i.test(normalized)) return fallback;
  return normalized || fallback;
}

function sensitiveString(value: string): boolean {
  return /\bbearer\s+[a-z0-9._~+/-]+=*/i.test(value)
    || /\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\b/.test(value)
    || /\bsb_(?:secret|publishable)_[A-Za-z0-9_-]{10,}\b/.test(value)
    || /\b(?:authorization|apikey|api_key|service_role_key)\s*[:=]\s*\S+/i.test(value)
    || /https:\/\/\S+/i.test(value)
    || /\b[A-Za-z0-9_-]{40,100}\b/.test(value);
}

function sanitize(value: unknown, depth: number, seen: WeakSet<object>): unknown {
  if (value === null || typeof value === 'boolean' || typeof value === 'number') return value;
  if (typeof value === 'string') {
    if (sensitiveString(value)) return REDACTED;
    return Array.from(value).slice(0, 500).join('');
  }
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'undefined') return null;
  if (typeof value === 'symbol' || typeof value === 'function') return '[UNSERIALIZABLE]';
  if (typeof value !== 'object') return '[UNSERIALIZABLE]';
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? 'invalid_date' : value.toISOString();
  if (value instanceof Error) {
    const allowedNames = new Set(['Error', 'TypeError', 'RangeError', 'SyntaxError', 'ReferenceError', 'URIError', 'AggregateError']);
    return { name: allowedNames.has(value.name) ? value.name : 'Error', error_code: safeErrorCode((value as Error & { code?: unknown }).code) };
  }
  if (depth >= MAX_DEPTH) return '[MAX_DEPTH]';
  if (seen.has(value)) return '[CIRCULAR]';
  seen.add(value);
  try {
    if (Array.isArray(value)) return value.slice(0, 30).map((entry) => sanitize(entry, depth + 1, seen));
    const source = value as Record<string, unknown>;
    const output: Record<string, unknown> = {};
    for (const key of Object.keys(source).slice(0, 50)) {
      output[key] = BLOCKED_KEYS.has(key.toLowerCase()) ? REDACTED : sanitize(source[key], depth + 1, seen);
    }
    return output;
  } finally {
    seen.delete(value);
  }
}

export function sanitizeForLog(value: unknown): unknown {
  return sanitize(value, 0, new WeakSet<object>());
}

export function createLogger(workerInstance: string, sink: (line: string) => void = console.log): Logger {
  return {
    log(level, event, fields = {}) {
      const entry = sanitizeForLog({
        timestamp: new Date().toISOString(), level, event, worker_instance: workerInstance, ...fields
      });
      sink(JSON.stringify(entry));
    }
  };
}

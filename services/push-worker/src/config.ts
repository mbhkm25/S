export interface WorkerConfig {
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  vapidPublicKey: string;
  vapidPrivateKey: string;
  vapidSubject: string;
  workerInstanceId: string;
  batchSize: number;
  pollIntervalMs: number;
  maxAttempts: number;
  lockSeconds: number;
  concurrency: number;
  reservationSeconds: number;
  uncertainCooldownSeconds: number;
  sendTimeoutMs: number;
  maxPayloadBytes: number;
  healthHost: '127.0.0.1';
  healthPort: 3002;
  shutdownTimeoutMs: number;
}

export class ConfigError extends Error {
  constructor(public readonly code: string) { super(code); this.name = 'ConfigError'; }
}

const EXPECTED_SUPABASE_HOST = 'hudbzlgclghlhazlduas.supabase.co';

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new ConfigError(`missing_${name.toLowerCase()}`);
  return value;
}

function integer(env: NodeJS.ProcessEnv, name: string, fallback: number, min: number, max: number): number {
  const raw = env[name]?.trim();
  const value = raw ? Number(raw) : fallback;
  if (!Number.isInteger(value) || value < min || value > max) throw new ConfigError(`invalid_${name.toLowerCase()}`);
  return value;
}

function validateSupabaseUrl(value: string): string {
  let url: URL;
  try { url = new URL(value); } catch { throw new ConfigError('invalid_supabase_url'); }
  if (url.protocol !== 'https:' || url.hostname !== EXPECTED_SUPABASE_HOST || url.username || url.password) {
    throw new ConfigError('invalid_supabase_url');
  }
  return url.toString().replace(/\/$/, '');
}

function validateServiceRoleKey(value: string): string {
  if (value.startsWith('sb_secret_') && value.length >= 30) return value;
  const parts = value.split('.');
  if (parts.length !== 3) throw new ConfigError('invalid_supabase_service_role_key');
  try {
    const claims = JSON.parse(Buffer.from(parts[1] ?? '', 'base64url').toString('utf8')) as Record<string, unknown>;
    if (claims.role !== 'service_role') throw new ConfigError('invalid_supabase_service_role_key');
  } catch (error) {
    if (error instanceof ConfigError) throw error;
    throw new ConfigError('invalid_supabase_service_role_key');
  }
  return value;
}

function validateVapidKey(value: string, kind: 'public' | 'private'): string {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new ConfigError(`invalid_vapid_${kind}_key`);
  const bytes = Buffer.from(value, 'base64url');
  if ((kind === 'public' && (bytes.length !== 65 || bytes[0] !== 4)) || (kind === 'private' && bytes.length !== 32)) {
    throw new ConfigError(`invalid_vapid_${kind}_key`);
  }
  return value;
}

function validateSubject(value: string): string {
  if (!/^mailto:[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(value) && !/^https:\/\/[^\s]+$/i.test(value)) {
    throw new ConfigError('invalid_web_push_subject');
  }
  return value;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): WorkerConfig {
  const workerInstanceId = required(env, 'PUSH_WORKER_INSTANCE_ID');
  if (!/^[A-Za-z0-9._:-]{1,200}$/.test(workerInstanceId)) throw new ConfigError('invalid_push_worker_instance_id');
  const reservationSeconds = integer(env, 'PUSH_WORKER_RESERVATION_SECONDS', 90, 60, 900);
  const sendTimeoutMs = integer(env, 'PUSH_WORKER_SEND_TIMEOUT_MS', 20_000, 5_000, 60_000);
  if (sendTimeoutMs >= reservationSeconds * 1000) throw new ConfigError('send_timeout_must_be_less_than_reservation');
  return {
    supabaseUrl: validateSupabaseUrl(required(env, 'SUPABASE_URL')),
    supabaseServiceRoleKey: validateServiceRoleKey(required(env, 'SUPABASE_SERVICE_ROLE_KEY')),
    vapidPublicKey: validateVapidKey(required(env, 'WEB_PUSH_VAPID_PUBLIC_KEY'), 'public'),
    vapidPrivateKey: validateVapidKey(required(env, 'WEB_PUSH_VAPID_PRIVATE_KEY'), 'private'),
    vapidSubject: validateSubject(required(env, 'WEB_PUSH_SUBJECT')),
    workerInstanceId,
    batchSize: integer(env, 'PUSH_WORKER_BATCH_SIZE', 20, 1, 100),
    pollIntervalMs: integer(env, 'PUSH_WORKER_POLL_INTERVAL_MS', 5000, 1000, 60_000),
    maxAttempts: integer(env, 'PUSH_WORKER_MAX_ATTEMPTS', 5, 1, 20),
    lockSeconds: integer(env, 'PUSH_WORKER_LOCK_SECONDS', 120, 30, 900),
    concurrency: integer(env, 'PUSH_WORKER_CONCURRENCY', 5, 1, 20),
    reservationSeconds,
    uncertainCooldownSeconds: integer(env, 'PUSH_WORKER_UNCERTAIN_COOLDOWN_SECONDS', 300, 60, 3600),
    sendTimeoutMs,
    maxPayloadBytes: integer(env, 'PUSH_WORKER_MAX_PAYLOAD_BYTES', 3072, 1024, 4096),
    healthHost: '127.0.0.1', healthPort: 3002, shutdownTimeoutMs: 30_000
  };
}

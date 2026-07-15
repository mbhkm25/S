import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { WorkerConfig } from '../src/config.js';
import { ConfigError, loadConfig } from '../src/config.js';
import { ReservationController } from '../src/controllers.js';
import { startHealthServer } from '../src/health.js';
import { createLogger, hashEndpoint, sanitizeForLog } from '../src/logger.js';
import { buildPushPayload, sanitizeAction } from '../src/payload.js';
import { classifySendFailure, retryDelayMs } from '../src/retryPolicy.js';
import type {
  ClaimedOutboxItem, FinalizeInput, PushDatabase, PushDeliveryTarget, PushOutboxDeliveryState,
  PushReservationResult, PushSender, ReservedAttemptInput
} from '../src/types.js';
import { PushWorker } from '../src/worker.js';

const ID = {
  outbox: '10000000-0000-4000-8000-000000000001', notification: '20000000-0000-4000-8000-000000000002',
  user: '30000000-0000-4000-8000-000000000003', one: '40000000-0000-4000-8000-000000000004',
  two: '50000000-0000-4000-8000-000000000005', token: '60000000-0000-4000-8000-000000000006'
};

const config: WorkerConfig = {
  supabaseUrl: 'https://hudbzlgclghlhazlduas.supabase.co', supabaseServiceRoleKey: 'mock',
  vapidPublicKey: 'mock', vapidPrivateKey: 'mock', vapidSubject: 'mailto:support@sanadflow.com',
  workerInstanceId: 'test-worker', batchSize: 20, pollIntervalMs: 5000, maxAttempts: 5,
  lockSeconds: 120, concurrency: 2, reservationSeconds: 90, uncertainCooldownSeconds: 300,
  sendTimeoutMs: 20_000, maxPayloadBytes: 3072, healthHost: '127.0.0.1', healthPort: 3002,
  shutdownTimeoutMs: 1000
};

function item(attempt = 1, suffix = '1'): ClaimedOutboxItem {
  return {
    outbox_id: `10000000-0000-4000-8000-00000000000${suffix}`,
    notification_id: `20000000-0000-4000-8000-00000000000${suffix}`,
    recipient_user_id: ID.user, attempt_count: attempt, notification_type: 'operation_update', category: 'operations',
    severity: 'info', title: 'تحديث العملية', body: 'لديك تحديث جديد', action_type: 'operation_details',
    action_payload: { public_token: ID.token }, created_at: '2026-07-15T12:00:00.000Z'
  };
}

function target(subscriptionId = ID.one, suffix = 'one'): PushDeliveryTarget {
  return { subscription_id: subscriptionId, endpoint: `https://push.example.test/${suffix}`, p256dh: 'public-key',
    auth_secret: 'auth-secret', content_encoding: 'aes128gcm', platform: 'pwa', failure_count: 0 };
}

function state(overrides: Partial<PushOutboxDeliveryState> = {}): PushOutboxDeliveryState {
  return {
    outboxId: ID.outbox, notificationId: ID.notification, sentCount: 0, activeSubscriptionCount: 0,
    activeUnsentCount: 0, activeReservationCount: 0, uncertainCount: 0, transientFailureCount: 0,
    permanentFailureCount: 0, goneCount: 0, configurationFailureCount: 0, ...overrides
  };
}

class MockDatabase implements PushDatabase {
  claims: ClaimedOutboxItem[][] = [];
  targets: PushDeliveryTarget[] = [];
  reservationResult: PushReservationResult = { reserved: true, reservation: { reservationToken: ID.token, expiresAt: '2026-07-15T12:02:00.000Z' } };
  attempts: ReservedAttemptInput[] = [];
  finalizations: FinalizeInput[] = [];
  releases: Array<{ token: string; reason: string }> = [];
  uncertain: Array<{ token: string; cooldown: number; code: string }> = [];
  reservations = 0;
  reservationRenewals = 0;
  lockRenewals = 0;
  stateValue: PushOutboxDeliveryState = state();
  getTargetsError: Error | null = null;
  reserveDelayMs = 0;
  failLockRenewal = false;
  failReservationRenewal = false;
  recordError: Error | null = null;

  async claimBatch() { return this.claims.shift() ?? []; }
  async getDeliveryTargets() { if (this.getTargetsError) throw this.getTargetsError; return this.targets; }
  async reserveDelivery(): Promise<PushReservationResult> {
    this.reservations += 1;
    if (this.reserveDelayMs) await new Promise((resolve) => setTimeout(resolve, this.reserveDelayMs));
    return this.reservationResult;
  }
  async renewDeliveryReservation() {
    this.reservationRenewals += 1;
    if (this.failReservationRenewal) throw Object.assign(new Error(), { code: 'push_delivery_reservation_not_owned' });
    return '2026-07-15T12:02:00.000Z';
  }
  async releaseDeliveryReservation(token: string, _worker: string, reason: string) { this.releases.push({ token, reason }); }
  async markDeliveryUncertain(token: string, _worker: string, cooldown: number, code: string) {
    this.uncertain.push({ token, cooldown, code }); return '2026-07-15T12:05:00.000Z';
  }
  async recordReservedAttempt(input: ReservedAttemptInput) {
    if (this.recordError) throw this.recordError;
    this.attempts.push(input);
  }
  async getOutboxDeliveryState(outboxId: string) {
    return { ...this.stateValue, outboxId, notificationId: outboxId.replace(/^1/, '2') };
  }
  async finalize(input: FinalizeInput) { this.finalizations.push(input); }
  async renewLock() {
    this.lockRenewals += 1;
    if (this.failLockRenewal) throw Object.assign(new Error(), { code: 'push_outbox_lock_not_owned' });
  }
}

function statusSender(statuses = new Map<string, number>(), delayMs = 0, calls: string[] = []): PushSender {
  return {
    async send(entry, serialized) {
      calls.push(entry.subscription_id);
      assert.ok(typeof serialized === 'string');
      if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
      const statusCode = statuses.get(entry.subscription_id) ?? 201;
      if (statusCode >= 400) throw Object.assign(new Error('raw provider body'), { statusCode });
      return { statusCode };
    }
  };
}

function worker(db: MockDatabase, sender: PushSender, overrides: Partial<WorkerConfig> = {}, controllerIntervalMs?: number): PushWorker {
  return new PushWorker({
    config: { ...config, ...overrides }, database: db, sender,
    logger: createLogger('test-worker', () => undefined), now: () => new Date('2026-07-15T12:00:00.000Z'),
    random: () => 0.5, ...(controllerIntervalMs === undefined ? {} : { controllerIntervalMs })
  });
}

test('configuration validates new reservation, timeout, cooldown, and payload limits', () => {
  const role = Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url');
  const env = {
    SUPABASE_URL: config.supabaseUrl, SUPABASE_SERVICE_ROLE_KEY: `x.${role}.x`,
    WEB_PUSH_VAPID_PUBLIC_KEY: Buffer.concat([Buffer.from([4]), Buffer.alloc(64, 1)]).toString('base64url'),
    WEB_PUSH_VAPID_PRIVATE_KEY: Buffer.alloc(32, 2).toString('base64url'), WEB_PUSH_SUBJECT: config.vapidSubject,
    PUSH_WORKER_INSTANCE_ID: 'worker-01'
  };
  const loaded = loadConfig(env);
  assert.equal(loaded.reservationSeconds, 90); assert.equal(loaded.uncertainCooldownSeconds, 300);
  assert.equal(loaded.sendTimeoutMs, 20_000); assert.equal(loaded.maxPayloadBytes, 3072);
  assert.throws(() => loadConfig({ ...env, SUPABASE_SERVICE_ROLE_KEY: '' }), ConfigError);
  assert.throws(() => loadConfig({ ...env, SUPABASE_URL: 'https://wrong.supabase.co' }), ConfigError);
  assert.throws(() => loadConfig({ ...env, WEB_PUSH_VAPID_PRIVATE_KEY: 'invalid' }), ConfigError);
  assert.throws(() => loadConfig({ ...env, PUSH_WORKER_RESERVATION_SECONDS: '60', PUSH_WORKER_SEND_TIMEOUT_MS: '60000' }), ConfigError);
  assert.throws(() => loadConfig({ ...env, PUSH_WORKER_MAX_PAYLOAD_BYTES: '5000' }), ConfigError);
});

test('payload applies NFC, action allowlist, Arabic and grapheme-safe limits', () => {
  const value = item(); value.title = 'ا\u0654'.repeat(200); value.body = '😀'.repeat(400);
  const built = buildPushPayload(value, 3072);
  assert.equal(built.payload.title, built.payload.title.normalize('NFC'));
  assert.ok(Array.from(built.payload.title).length <= 120); assert.ok(Array.from(built.payload.body).length <= 240);
  assert.equal(Buffer.byteLength(built.serialized), built.byteLength); assert.ok(built.byteLength <= 3072);
  assert.deepEqual(sanitizeAction('operation_details', { public_token: 'bad' }), { actionType: 'none', actionPayload: {} });
});

test('payload byte cap trims body and never exceeds configured limit', () => {
  const value = item(); value.title = '😀'.repeat(120); value.body = '😀'.repeat(240);
  const built = buildPushPayload(value, 1024);
  assert.ok(built.byteLength <= 1024); assert.ok(Array.from(built.payload.body).length < 240);
});

test('payload uses minimal fallback when title alone cannot fit', () => {
  const value = item(); value.title = '👨‍👩‍👧‍👦'.repeat(120); value.body = 'تفاصيل'.repeat(100);
  const built = buildPushPayload(value, 1024);
  assert.equal(built.payload.title, 'إشعار جديد من سند');
  assert.equal(built.payload.body, 'افتح سند لعرض التفاصيل.');
  assert.equal(built.payload.action_type, 'none');
  assert.ok(built.byteLength <= 1024);
});

test('logger recursively redacts hostile values, errors, cycles, arrays, and bigint', () => {
  const lines: string[] = []; const circular: Record<string, unknown> = {}; circular.self = circular;
  const error = Object.assign(new Error('Bearer raw-secret'), { code: 'SAFE_CODE', cause: { endpoint: 'https://push.test/x' } });
  error.name = 'Bearer name-secret';
  createLogger('safe', (line) => lines.push(line)).log('error', 'hostile', {
    error, circular, headers: { Authorization: 'Bearer abc' }, request: { endpoint: 'https://push.test/x' },
    jwt: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.signature123', vapid: 'A'.repeat(43),
    values: [1n, { auth_secret: 'hidden' }]
  });
  const line = lines[0] ?? '';
  assert.doesNotMatch(line, /raw-secret|name-secret|push\.test|signature123|hidden|Bearer abc|A{40}/);
  assert.match(line, /\[REDACTED\]|\[CIRCULAR\]/); assert.match(line, /safe_code/);
  assert.doesNotThrow(() => JSON.stringify(sanitizeForLog(circular)));
});

test('failure classifier uses status/code without raw messages', () => {
  assert.equal(classifySendFailure({ statusCode: 404 }).kind, 'gone');
  assert.equal(classifySendFailure({ statusCode: 410 }).kind, 'gone');
  assert.equal(classifySendFailure({ statusCode: 400 }).kind, 'permanent');
  assert.equal(classifySendFailure({ statusCode: 403 }).kind, 'configuration');
  assert.equal(classifySendFailure({ statusCode: 408 }).kind, 'transient');
  assert.equal(classifySendFailure({ statusCode: 429 }).kind, 'transient');
  assert.equal(classifySendFailure({ statusCode: 503 }).kind, 'transient');
  assert.equal(classifySendFailure({ code: 'ENOTFOUND', message: 'secret' }).kind, 'transient');
  assert.equal(retryDelayMs(1, () => 0.5), 60_000);
});

test('no send occurs without a successful reservation', async () => {
  const db = new MockDatabase(); db.claims = [[item()]]; db.targets = [target()];
  db.reservationResult = { reserved: false, reason: 'reserved_by_other', expiresAt: '2026-07-15T12:01:00.000Z' };
  db.stateValue = state({ activeSubscriptionCount: 1, activeUnsentCount: 1, activeReservationCount: 1 });
  const calls: string[] = []; await worker(db, statusSender(new Map(), 0, calls)).runOnce();
  assert.equal(calls.length, 0); assert.equal(db.attempts.length, 0); assert.equal(db.finalizations[0]?.status, 'retry');
});

test('already sent reservation result skips send and finalizes from explicit state', async () => {
  const db = new MockDatabase(); db.claims = [[item(2)]]; db.targets = [target()];
  db.reservationResult = { reserved: false, reason: 'already_sent', expiresAt: null };
  db.stateValue = state({ sentCount: 1, activeSubscriptionCount: 1 });
  const calls: string[] = []; await worker(db, statusSender(new Map(), 0, calls)).runOnce();
  assert.equal(calls.length, 0); assert.equal(db.finalizations[0]?.status, 'sent');
});

test('uncertain cooldown reservation skips send and schedules configured cooldown', async () => {
  const db = new MockDatabase(); db.claims = [[item()]]; db.targets = [target()];
  db.reservationResult = { reserved: false, reason: 'uncertain_cooldown', expiresAt: '2026-07-15T12:05:00.000Z' };
  db.stateValue = state({ activeSubscriptionCount: 1, activeUnsentCount: 1, uncertainCount: 1 });
  await worker(db, statusSender()).runOnce();
  assert.equal(db.finalizations[0]?.nextAttemptAt, '2026-07-15T12:05:00.000Z');
});

test('reservation token is required and passed to reserved attempt record', async () => {
  const db = new MockDatabase(); db.claims = [[item()]]; db.targets = [target()];
  db.stateValue = state({ sentCount: 1, activeSubscriptionCount: 1 });
  await worker(db, statusSender()).runOnce();
  assert.equal(db.attempts[0]?.reservationToken, ID.token); assert.equal(db.attempts[0]?.status, 'sent');
  assert.equal(db.finalizations[0]?.status, 'sent');
});

test('reservation renews during a long send', async () => {
  const db = new MockDatabase(); db.claims = [[item()]]; db.targets = [target()]; db.stateValue = state({ sentCount: 1, activeSubscriptionCount: 1 });
  await worker(db, statusSender(new Map(), 30), {}, 5).runOnce();
  assert.ok(db.reservationRenewals >= 1);
});

test('ReservationController does not overlap renewal requests', async () => {
  const db = new MockDatabase(); let active = 0; let maximum = 0; let release!: () => void;
  const blocked = new Promise<void>((resolve) => { release = resolve; });
  db.renewDeliveryReservation = async () => { active += 1; maximum = Math.max(maximum, active); await blocked; active -= 1; return '2026-07-15T12:02:00.000Z'; };
  const controller = new ReservationController(ID.token, 90, {
    database: db, workerId: config.workerInstanceId, logger: createLogger('test', () => undefined), heartbeatIntervalMs: 5
  });
  controller.start(); await new Promise((resolve) => setTimeout(resolve, 20)); release(); await controller.stop();
  assert.equal(maximum, 1);
});

test('send timeout marks uncertain, uses cooldown, and never records or releases', async () => {
  const db = new MockDatabase(); db.claims = [[item()]]; db.targets = [target()];
  db.stateValue = state({ activeSubscriptionCount: 1, activeUnsentCount: 1, uncertainCount: 1 });
  await worker(db, statusSender(new Map(), 30), { sendTimeoutMs: 10 }).runOnce();
  assert.equal(db.uncertain[0]?.cooldown, 300); assert.equal(db.attempts.length, 0); assert.equal(db.releases.length, 0);
  assert.equal(db.finalizations[0]?.errorCode, 'delivery_outcome_uncertain');
});

test('reservation renewal loss during send marks uncertain', async () => {
  const db = new MockDatabase(); db.claims = [[item()]]; db.targets = [target()]; db.failReservationRenewal = true;
  db.stateValue = state({ activeSubscriptionCount: 1, activeUnsentCount: 1, uncertainCount: 1 });
  await worker(db, statusSender(new Map(), 30), {}, 5).runOnce();
  assert.equal(db.uncertain.length, 1); assert.equal(db.attempts.length, 0);
});

test('outbox lease loss during send marks uncertain and prevents finalize', async () => {
  const db = new MockDatabase(); db.claims = [[item()]]; db.targets = [target()]; db.failLockRenewal = true;
  await worker(db, statusSender(new Map(), 30), {}, 5).runOnce();
  assert.equal(db.uncertain.length, 1); assert.equal(db.finalizations.length, 0);
});

test('lost outbox lease before target lookup prevents reserve and finalize', async () => {
  const db = new MockDatabase(); db.claims = [[item()]];
  db.getTargetsError = Object.assign(new Error(), { code: 'push_outbox_lock_not_owned' });
  await worker(db, statusSender()).runOnce();
  assert.equal(db.reservations, 0); assert.equal(db.finalizations.length, 0);
});

test('lost lease after reserve but before send releases reservation', async () => {
  const db = new MockDatabase(); db.claims = [[item()]]; db.targets = [target()]; db.reserveDelayMs = 15; db.failLockRenewal = true;
  const calls: string[] = []; await worker(db, statusSender(new Map(), 0, calls), {}, 5).runOnce();
  assert.equal(calls.length, 0); assert.equal(db.releases.length, 1); assert.equal(db.finalizations.length, 0);
});

test('success followed by lock loss before record becomes uncertain and is not finalized', async () => {
  const db = new MockDatabase(); db.claims = [[item()]]; db.targets = [target()];
  db.recordError = Object.assign(new Error(), { code: 'push_outbox_lock_not_owned' });
  await worker(db, statusSender()).runOnce();
  assert.equal(db.uncertain.length, 1); assert.equal(db.attempts.length, 0); assert.equal(db.finalizations.length, 0);
});

test('success followed by reservation loss before record becomes uncertain without release', async () => {
  const db = new MockDatabase(); db.claims = [[item()]]; db.targets = [target()];
  db.recordError = Object.assign(new Error(), { code: 'push_delivery_reservation_not_owned' });
  db.stateValue = state({ activeSubscriptionCount: 1, activeUnsentCount: 1 });
  await worker(db, statusSender()).runOnce();
  assert.equal(db.uncertain.length, 1); assert.equal(db.releases.length, 0);
  assert.equal(db.finalizations[0]?.status, 'retry');
});

test('403 opens circuit and current item retries after fifteen minutes', async () => {
  const db = new MockDatabase(); db.claims = [[item()]]; db.targets = [target()];
  db.stateValue = state({ activeSubscriptionCount: 1, activeUnsentCount: 1, configurationFailureCount: 1 });
  const instance = worker(db, statusSender(new Map([[ID.one, 403]])));
  await instance.runOnce();
  assert.equal(instance.state().configurationFailure, true); assert.equal(db.attempts[0]?.errorCode, 'vapid_configuration_failure');
  assert.equal(db.finalizations[0]?.nextAttemptAt, '2026-07-15T12:15:00.000Z');
  const claimsBefore = db.claims.length; await instance.runOnce(); assert.equal(db.claims.length, claimsBefore);
});

test('breaker never converts another claimed item to no_subscription', async () => {
  const db = new MockDatabase(); db.claims = [[item(1, '1'), item(1, '2')]]; db.targets = [target()];
  db.stateValue = state({ activeSubscriptionCount: 1, activeUnsentCount: 1 });
  await worker(db, statusSender(new Map([[ID.one, 403]])), { concurrency: 1 }).runOnce();
  assert.ok(db.finalizations.every((entry) => entry.status === 'retry')); assert.ok(db.finalizations.every((entry) => entry.status !== 'no_subscription'));
});

test('breaker releases reservations that were acquired but had not started send', async () => {
  const db = new MockDatabase(); db.claims = [[item(1, '1'), item(1, '2')]];
  db.targets = [target(ID.one, 'one'), target(ID.two, 'two')];
  db.stateValue = state({ activeSubscriptionCount: 2, activeUnsentCount: 1, configurationFailureCount: 1 });
  const sender: PushSender = {
    async send(entry) {
      if (entry.subscription_id === ID.one) throw Object.assign(new Error(), { statusCode: 403 });
      await new Promise((resolve) => setTimeout(resolve, 25)); return { statusCode: 201 };
    }
  };
  await worker(db, sender, { concurrency: 2 }).runOnce();
  assert.ok(db.releases.some((release) => release.reason === 'circuit_open_before_send'));
  assert.ok(db.finalizations.every((entry) => entry.status === 'retry'));
});

test('empty targets never infer sent from attempt_count', async () => {
  const db = new MockDatabase(); db.claims = [[item(4)]]; db.stateValue = state();
  await worker(db, statusSender()).runOnce();
  assert.equal(db.finalizations[0]?.status, 'no_subscription');
});

test('explicit sent delivery state finalizes sent', async () => {
  const db = new MockDatabase(); db.claims = [[item()]]; db.stateValue = state({ sentCount: 1, activeSubscriptionCount: 1 });
  await worker(db, statusSender()).runOnce(); assert.equal(db.finalizations[0]?.status, 'sent');
});

test('explicit transient or active-unsent state retries', async () => {
  const db = new MockDatabase(); db.claims = [[item(2)]]; db.stateValue = state({ activeSubscriptionCount: 1, activeUnsentCount: 1, transientFailureCount: 1 });
  await worker(db, statusSender()).runOnce(); assert.equal(db.finalizations[0]?.status, 'retry');
});

test('all gone state finalizes no_subscription', async () => {
  const db = new MockDatabase(); db.claims = [[item()]]; db.stateValue = state({ goneCount: 2 });
  await worker(db, statusSender()).runOnce(); assert.equal(db.finalizations[0]?.status, 'no_subscription');
});

test('permanent-only state finalizes dead', async () => {
  const db = new MockDatabase(); db.claims = [[item()]]; db.stateValue = state({ permanentFailureCount: 1 });
  await worker(db, statusSender()).runOnce();
  assert.equal(db.finalizations[0]?.status, 'dead'); assert.equal(db.finalizations[0]?.errorCode, 'all_targets_permanently_failed');
});

test('graceful shutdown waits for send and shutdown timeout marks uncertain', async () => {
  const db = new MockDatabase(); db.claims = [[item()]]; db.targets = [target()]; db.stateValue = state({ uncertainCount: 1, activeSubscriptionCount: 1, activeUnsentCount: 1 });
  let release!: () => void; const blocked = new Promise<void>((resolve) => { release = resolve; });
  const sender: PushSender = { async send() { await blocked; return { statusCode: 201 }; } };
  const instance = worker(db, sender, { shutdownTimeoutMs: 10 });
  const running = instance.runOnce(); await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(await instance.stop(), false); assert.equal(db.uncertain[0]?.code, 'shutdown_timeout');
  release(); await running; assert.equal(db.finalizations.length, 0);
});

test('stop before run prevents claim', async () => {
  const db = new MockDatabase(); db.claims = [[item()]]; const instance = worker(db, statusSender());
  await instance.stop(); await instance.runOnce(); assert.equal(db.claims.length, 1);
});

test('shutdown after reserve and before send releases reservation', async () => {
  const db = new MockDatabase(); db.claims = [[item()]]; db.targets = [target()]; db.reserveDelayMs = 25;
  const calls: string[] = []; const instance = worker(db, statusSender(new Map(), 0, calls));
  const running = instance.runOnce(); await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(await instance.stop(), true); await running;
  assert.equal(calls.length, 0); assert.ok(db.releases.some((release) => release.reason === 'shutdown_before_send'));
  assert.equal(db.finalizations.length, 0);
});

test('health/readiness expose no secrets and endpoint hash is one-way', async () => {
  const db = new MockDatabase(); let releaseSleep!: () => void;
  const sleeping = new Promise<void>((resolve) => { releaseSleep = resolve; });
  const instance = new PushWorker({ config, database: db, sender: statusSender(), logger: createLogger('test', () => undefined), sleep: () => sleeping });
  const running = instance.start(); await new Promise((resolve) => setImmediate(resolve));
  const server = await startHealthServer(config, instance, createLogger('test', () => undefined));
  try {
    const ready = await fetch('http://127.0.0.1:3002/ready'); const body = JSON.stringify(await ready.json());
    assert.equal(ready.status, 200); assert.doesNotMatch(body, /supabase\.co|service_role|vapid|endpoint|secret/);
    assert.equal(hashEndpoint('https://push.example.test/private').length, 16);
  } finally { await instance.stop(); releaseSleep(); await running; await server.close(); }
});

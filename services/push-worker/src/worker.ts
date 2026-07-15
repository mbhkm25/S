import type { WorkerConfig } from './config.js';
import { LeaseController, OwnershipError, ReservationController, readErrorCode } from './controllers.js';
import { hashEndpoint, type Logger } from './logger.js';
import { buildPushPayload, getSendOptions, PayloadError } from './payload.js';
import { classifySendFailure, nextAttemptAt } from './retryPolicy.js';
import type {
  BuiltPushPayload, ClaimedOutboxItem, FinalizeInput, OutboxFinalStatus, OutboxProcessingOutcome,
  PushDatabase, PushDeliveryTarget, PushOutboxDeliveryState, PushSender, SendOptions
} from './types.js';

export interface WorkerDependencies {
  config: WorkerConfig;
  database: PushDatabase;
  sender: PushSender;
  logger: Logger;
  now?: () => Date;
  random?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
  controllerIntervalMs?: number;
}

export interface WorkerState {
  running: boolean;
  stopping: boolean;
  ready: boolean;
  configurationFailure: boolean;
  lastSupabaseSuccessAt: string | null;
}

interface LocalItemState {
  outcome: OutboxProcessingOutcome | null;
  uncertain: boolean;
  configurationBlocked: boolean;
  transient: boolean;
  permanent: boolean;
  errorCode: string | null;
}

interface ActiveSend {
  forceUncertain(errorCode: string): Promise<void>;
}

const defaultSleep = (milliseconds: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function runPool<T>(items: T[], concurrency: number, task: (item: T) => Promise<void>): Promise<void> {
  let cursor = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const item = items[cursor++];
      if (item !== undefined) await task(item);
    }
  });
  const outcomes = await Promise.allSettled(runners);
  const failure = outcomes.find((entry): entry is PromiseRejectedResult => entry.status === 'rejected');
  if (failure) throw failure.reason;
}

function isOwnershipError(error: unknown, code?: string): boolean {
  const value = readErrorCode(error, 'unknown_error');
  if (code) return value === code || (error instanceof OwnershipError && error.code === code);
  return error instanceof OwnershipError || value === 'push_outbox_lock_not_owned'
    || value === 'push_delivery_reservation_not_owned' || value === 'push_delivery_reservation_expired';
}

export class PushWorker {
  private readonly config: WorkerConfig;
  private readonly database: PushDatabase;
  private readonly sender: PushSender;
  private readonly logger: Logger;
  private readonly now: () => Date;
  private readonly random: () => number;
  private readonly sleep: (milliseconds: number) => Promise<void>;
  private readonly controllerIntervalMs: number | undefined;
  private running = false;
  private stopping = false;
  private configurationFailure = false;
  private supabaseHealthy = false;
  private lastSupabaseSuccessAt: Date | null = null;
  private activeBatch: Promise<void> | null = null;
  private activeDeliveries = 0;
  private readonly deliveryWaiters: Array<() => void> = [];
  private readonly activeSends = new Map<string, ActiveSend>();
  private readonly pendingReservations = new Map<string, () => Promise<void>>();
  private readonly activeLeases = new Set<LeaseController>();

  constructor(dependencies: WorkerDependencies) {
    this.config = dependencies.config; this.database = dependencies.database; this.sender = dependencies.sender;
    this.logger = dependencies.logger; this.now = dependencies.now ?? (() => new Date());
    this.random = dependencies.random ?? Math.random; this.sleep = dependencies.sleep ?? defaultSleep;
    this.controllerIntervalMs = dependencies.controllerIntervalMs;
  }

  state(): WorkerState {
    return {
      running: this.running, stopping: this.stopping,
      ready: this.running && !this.stopping && !this.configurationFailure && this.supabaseHealthy && this.lastSupabaseSuccessAt !== null,
      configurationFailure: this.configurationFailure, lastSupabaseSuccessAt: this.lastSupabaseSuccessAt?.toISOString() ?? null
    };
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true; this.stopping = false;
    this.logger.log('info', 'worker_started');
    try {
      while (!this.stopping && !this.configurationFailure) {
        try { await this.runOnce(); }
        catch (error) { this.logger.log('error', 'poll_failed', { error_code: readErrorCode(error, 'poll_failed') }); }
        if (!this.stopping && !this.configurationFailure) await this.sleep(this.config.pollIntervalMs);
      }
    } finally {
      this.running = false;
      this.logger.log(this.configurationFailure ? 'error' : 'info', 'worker_stopped', {
        reason: this.configurationFailure ? 'configuration_failure' : 'shutdown'
      });
    }
  }

  async runOnce(): Promise<void> {
    if (this.stopping || this.configurationFailure) return;
    if (this.activeBatch) return this.activeBatch;
    const batch = this.runBatch(); this.activeBatch = batch;
    try { await batch; this.supabaseHealthy = true; }
    catch (error) { this.supabaseHealthy = false; throw error; }
    finally { if (this.activeBatch === batch) this.activeBatch = null; }
  }

  async stop(): Promise<boolean> {
    this.stopping = true;
    const batch = this.activeBatch;
    if (!batch) return true;
    let timer: NodeJS.Timeout | undefined;
    const timedOut = new Promise<false>((resolve) => {
      timer = setTimeout(() => resolve(false), this.config.shutdownTimeoutMs); timer.unref();
    });
    const graceful = await Promise.race([batch.then(() => true, () => true), timedOut]);
    if (timer) clearTimeout(timer);
    if (!graceful) {
      const cleanup = Promise.allSettled([
        ...Array.from(this.activeSends.values(), (send) => send.forceUncertain('shutdown_timeout')),
        ...Array.from(this.pendingReservations.values(), (release) => release())
      ]);
      let cleanupTimer: NodeJS.Timeout | undefined;
      const cleanupDeadline = new Promise<void>((resolve) => {
        cleanupTimer = setTimeout(resolve, 1000); cleanupTimer.unref();
      });
      await Promise.race([cleanup.then(() => undefined), cleanupDeadline]);
      if (cleanupTimer) clearTimeout(cleanupTimer);
      await Promise.allSettled(Array.from(this.activeLeases, (lease) => lease.stop(false)));
    }
    return graceful;
  }

  private async runBatch(): Promise<void> {
    if (this.stopping || this.configurationFailure) return;
    const items = await this.database.claimBatch(
      this.config.workerInstanceId, this.config.batchSize, this.config.lockSeconds, this.config.maxAttempts
    );
    this.lastSupabaseSuccessAt = this.now();
    if (items.length === 0) return;
    this.logger.log('info', 'batch_claimed', { count: items.length });
    await runPool(items, this.config.concurrency, async (item) => { await this.processItem(item); });
  }

  private async processItem(item: ClaimedOutboxItem): Promise<void> {
    const startedAt = this.now().getTime();
    const lease = new LeaseController(item.outbox_id, item.notification_id, this.config.lockSeconds, {
      database: this.database, workerId: this.config.workerInstanceId, logger: this.logger, now: this.now,
      ...(this.controllerIntervalMs === undefined ? {} : { heartbeatIntervalMs: this.controllerIntervalMs })
    });
    const local: LocalItemState = { outcome: null, uncertain: false, configurationBlocked: false, transient: false, permanent: false, errorCode: null };
    this.activeLeases.add(lease); lease.start();
    try {
      lease.assertOwned();
      const targets = await this.database.getDeliveryTargets(item.outbox_id, this.config.workerInstanceId);
      this.lastSupabaseSuccessAt = this.now(); lease.assertOwned();
      let built: BuiltPushPayload;
      try { built = buildPushPayload(item, this.config.maxPayloadBytes); }
      catch (error) {
        if (error instanceof PayloadError) { local.outcome = 'dead'; local.permanent = true; local.errorCode = error.code; }
        else throw error;
        built = buildPushPayload({ ...item, title: '', body: '', action_type: 'none', action_payload: {} }, this.config.maxPayloadBytes);
      }
      const options = getSendOptions(item);
      if (!local.permanent) {
        await runPool(targets, this.config.concurrency, async (target) => {
          await this.processTarget(item, target, built, options, lease, local);
        });
      }
      if (this.stopping) { local.outcome = 'shutdown_interrupted'; return; }
      if (lease.lost) { local.outcome = 'lease_lost'; return; }
      lease.assertOwned();
      const state = await this.database.getOutboxDeliveryState(item.outbox_id, this.config.workerInstanceId);
      this.lastSupabaseSuccessAt = this.now(); lease.assertOwned();
      const finalization = this.chooseFinalization(item, state, local);
      if (finalization === null || this.stopping || lease.lost) return;
      lease.assertOwned();
      await this.database.finalize({ outboxId: item.outbox_id, workerId: this.config.workerInstanceId, ...finalization });
      this.lastSupabaseSuccessAt = this.now();
      this.logger.log('info', 'outbox_finalized', {
        outbox_id: item.outbox_id, notification_id: item.notification_id, attempt: item.attempt_count,
        status: finalization.status, sent_count: state.sentCount, duration_ms: this.now().getTime() - startedAt,
        error_code: finalization.errorCode
      });
    } catch (error) {
      if (isOwnershipError(error, 'push_outbox_lock_not_owned')) { lease.markLost(); local.outcome = 'lease_lost'; return; }
      throw error;
    } finally {
      await lease.stop(); this.activeLeases.delete(lease);
    }
  }

  private async processTarget(
    item: ClaimedOutboxItem, target: PushDeliveryTarget, built: BuiltPushPayload, options: SendOptions,
    lease: LeaseController, local: LocalItemState
  ): Promise<void> {
    if (this.stopping) { local.outcome = 'shutdown_interrupted'; return; }
    if (this.configurationFailure) { local.configurationBlocked = true; local.outcome = 'configuration_failure'; return; }
    lease.assertOwned();
    let reservation;
    try {
      reservation = await this.database.reserveDelivery(
        item.outbox_id, this.config.workerInstanceId, target.subscription_id, this.config.reservationSeconds
      );
      this.lastSupabaseSuccessAt = this.now();
    } catch (error) {
      if (isOwnershipError(error, 'push_outbox_lock_not_owned')) { lease.markLost(); local.outcome = 'lease_lost'; return; }
      throw error;
    }
    if (!reservation.reserved) {
      if (reservation.reason === 'uncertain_cooldown') { local.uncertain = true; local.outcome = 'uncertain'; }
      return;
    }
    const token = reservation.reservation.reservationToken;
    if (lease.lost) {
      local.outcome = 'lease_lost';
      try { await this.database.releaseDeliveryReservation(token, this.config.workerInstanceId, 'outbox_lease_lost_after_reserve'); }
      catch (error) { this.logger.log('warn', 'delivery_reservation_release_failed', { error_code: readErrorCode(error, 'reservation_release_failed') }); }
      return;
    }
    let sendStarted = false;
    const release = async (reason: string): Promise<void> => {
      if (sendStarted) return;
      this.pendingReservations.delete(token);
      try { await this.database.releaseDeliveryReservation(token, this.config.workerInstanceId, reason); }
      catch (error) { this.logger.log('warn', 'delivery_reservation_release_failed', { error_code: readErrorCode(error, 'reservation_release_failed') }); }
    };
    this.pendingReservations.set(token, () => release('shutdown_before_send'));

    try {
      await this.withDeliverySlot(async () => {
        if (this.stopping) { local.outcome = 'shutdown_interrupted'; await release('shutdown_before_send'); return; }
        if (this.configurationFailure) { local.configurationBlocked = true; local.outcome = 'configuration_failure'; await release('circuit_open_before_send'); return; }
        try { lease.assertOwned(); }
        catch { lease.markLost(); local.outcome = 'lease_lost'; await release('outbox_lease_lost_before_send'); return; }
        this.pendingReservations.delete(token);
        sendStarted = true;
        await this.sendReserved(item, target, built, options, token, lease, local);
      });
    } finally {
      this.pendingReservations.delete(token);
    }
  }

  private async sendReserved(
    item: ClaimedOutboxItem, target: PushDeliveryTarget, built: BuiltPushPayload, options: SendOptions,
    token: string, lease: LeaseController, local: LocalItemState
  ): Promise<void> {
    const startedAt = this.now().getTime();
    const reservation = new ReservationController(token, this.config.reservationSeconds, {
      database: this.database, workerId: this.config.workerInstanceId, logger: this.logger, now: this.now,
      ...(this.controllerIntervalMs === undefined ? {} : { heartbeatIntervalMs: this.controllerIntervalMs })
    });
    let uncertainMarked = false;
    const markUncertain = async (errorCode: string): Promise<void> => {
      if (uncertainMarked) return;
      uncertainMarked = true; local.uncertain = true; local.outcome = 'uncertain'; local.errorCode ??= 'delivery_outcome_uncertain';
      await reservation.stop(errorCode !== 'shutdown_timeout');
      try {
        await this.database.markDeliveryUncertain(token, this.config.workerInstanceId, this.config.uncertainCooldownSeconds, errorCode);
        this.lastSupabaseSuccessAt = this.now();
      } catch (error) {
        this.logger.log('error', 'delivery_uncertain_mark_failed', { error_code: readErrorCode(error, 'uncertain_mark_failed') });
      }
      this.logger.log('warn', 'delivery_outcome_uncertain', {
        outbox_id: item.outbox_id, notification_id: item.notification_id,
        subscription_hash: hashEndpoint(target.endpoint), error_code: 'delivery_outcome_uncertain'
      });
    };
    this.activeSends.set(token, { forceUncertain: markUncertain }); reservation.start();
    try {
      lease.assertOwned(); reservation.assertOwned();
      let timeoutHandle: NodeJS.Timeout | undefined;
      const timeout = new Promise<{ kind: 'timeout' }>((resolve) => {
        timeoutHandle = setTimeout(() => resolve({ kind: 'timeout' }), this.config.sendTimeoutMs); timeoutHandle.unref();
      });
      const delivery = this.sender.send(target, built.serialized, options)
        .then((response) => ({ kind: 'response' as const, response }))
        .catch((error: unknown) => ({ kind: 'error' as const, error }));
      const result = await Promise.race([delivery, timeout]);
      if (timeoutHandle) clearTimeout(timeoutHandle);
      if (result.kind === 'timeout') { await markUncertain('send_timeout'); return; }
      if (uncertainMarked) return;
      if (lease.lost || reservation.lost) { await markUncertain('delivery_ownership_lost'); return; }
      try { lease.assertOwned(); reservation.assertOwned(); }
      catch { await markUncertain('delivery_ownership_lost'); return; }

      let status: 'sent' | 'failed' | 'gone';
      let httpStatus: number | null;
      let errorCode: string | null;
      let disableSubscription: boolean;
      if (result.kind === 'response' && result.response.statusCode >= 200 && result.response.statusCode < 300) {
        status = 'sent'; httpStatus = result.response.statusCode; errorCode = null; disableSubscription = false;
      } else {
        const failure = classifySendFailure(result.kind === 'error' ? result.error : { statusCode: result.response.statusCode });
        status = failure.kind === 'gone' ? 'gone' : 'failed'; httpStatus = failure.httpStatus;
        errorCode = failure.errorCode; disableSubscription = failure.disableSubscription;
        if (failure.kind === 'configuration') {
          this.configurationFailure = true; local.configurationBlocked = true; local.outcome = 'configuration_failure';
        } else if (failure.kind === 'transient') { local.transient = true; }
        else if (failure.kind === 'permanent') { local.permanent = true; }
        local.errorCode ??= failure.errorCode;
      }
      try {
        lease.assertOwned(); reservation.assertOwned();
        await this.database.recordReservedAttempt({
          outboxId: item.outbox_id, workerId: this.config.workerInstanceId, subscriptionId: target.subscription_id,
          reservationToken: token, status, httpStatus, errorCode, disableSubscription
        });
        this.lastSupabaseSuccessAt = this.now(); lease.assertOwned();
      } catch (error) {
        if (isOwnershipError(error, 'push_outbox_lock_not_owned')) lease.markLost();
        await markUncertain('record_after_send_failed'); return;
      }
      this.logger.log(status === 'sent' ? 'info' : 'warn', 'push_delivery_recorded', {
        outbox_id: item.outbox_id, notification_id: item.notification_id, subscription_hash: hashEndpoint(target.endpoint),
        attempt: item.attempt_count, http_status: httpStatus, status,
        duration_ms: this.now().getTime() - startedAt, error_code: errorCode
      });
    } finally {
      this.activeSends.delete(token); await reservation.stop();
    }
  }

  private async withDeliverySlot<T>(task: () => Promise<T>): Promise<T> {
    if (this.activeDeliveries >= this.config.concurrency) await new Promise<void>((resolve) => this.deliveryWaiters.push(resolve));
    this.activeDeliveries += 1;
    try { return await task(); }
    finally { this.activeDeliveries -= 1; this.deliveryWaiters.shift()?.(); }
  }

  private chooseFinalization(
    item: ClaimedOutboxItem, state: PushOutboxDeliveryState, local: LocalItemState
  ): Omit<FinalizeInput, 'outboxId' | 'workerId'> | null {
    if (local.outcome === 'lease_lost' || local.outcome === 'shutdown_interrupted') return null;
    if (local.uncertain || state.uncertainCount > 0) return this.retryAfter('delivery_outcome_uncertain', this.config.uncertainCooldownSeconds);
    if (local.configurationBlocked || state.configurationFailureCount > 0) return this.retryAfter('push_configuration_failure', 15 * 60);
    if (local.outcome === 'dead' || (state.permanentFailureCount > 0 && state.sentCount === 0
        && state.transientFailureCount === 0 && state.activeUnsentCount === 0)) {
      return { status: 'dead', nextAttemptAt: null, errorCode: local.errorCode ?? 'all_targets_permanently_failed' };
    }
    if (state.transientFailureCount > 0 || state.activeUnsentCount > 0 || state.activeReservationCount > 0 || local.transient) {
      if (item.attempt_count >= this.config.maxAttempts) return { status: 'dead', nextAttemptAt: null, errorCode: 'max_attempts_exceeded' };
      return { status: 'retry', nextAttemptAt: nextAttemptAt(item.attempt_count, this.now(), this.random), errorCode: local.errorCode ?? 'delivery_incomplete' };
    }
    if (state.sentCount > 0 && state.activeUnsentCount === 0 && state.uncertainCount === 0) {
      return { status: 'sent', nextAttemptAt: null, errorCode: null };
    }
    if (state.goneCount > 0 && state.activeSubscriptionCount === 0) {
      return { status: 'no_subscription', nextAttemptAt: null, errorCode: 'all_subscriptions_gone' };
    }
    if (state.activeSubscriptionCount === 0 && state.sentCount === 0) {
      return { status: 'no_subscription', nextAttemptAt: null, errorCode: 'no_active_subscription' };
    }
    return this.retryAfter('delivery_incomplete', 60);
  }

  private retryAfter(errorCode: string, seconds: number): Omit<FinalizeInput, 'outboxId' | 'workerId'> {
    return { status: 'retry' as OutboxFinalStatus, nextAttemptAt: new Date(this.now().getTime() + seconds * 1000).toISOString(), errorCode };
  }
}

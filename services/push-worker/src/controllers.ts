import type { Logger } from './logger.js';
import type { PushDatabase } from './types.js';

export class OwnershipError extends Error {
  constructor(public readonly code: 'push_outbox_lock_not_owned' | 'push_delivery_reservation_not_owned') {
    super(code); this.name = 'OwnershipError';
  }
}

export interface ControllerDependencies {
  database: PushDatabase;
  workerId: string;
  logger: Logger;
  now?: () => Date;
  heartbeatIntervalMs?: number;
}

export class LeaseController {
  owned = true;
  lost = false;
  stopped = false;
  renewalInFlight = false;
  lastRenewedAt: Date;
  private timer: NodeJS.Timeout | null = null;
  private renewalTask: Promise<void> | null = null;
  private readonly now: () => Date;

  constructor(
    private readonly outboxId: string,
    private readonly notificationId: string,
    private readonly lockSeconds: number,
    private readonly dependencies: ControllerDependencies
  ) {
    this.now = dependencies.now ?? (() => new Date());
    this.lastRenewedAt = this.now();
  }

  start(): void {
    if (this.timer || this.stopped) return;
    const intervalMs = this.dependencies.heartbeatIntervalMs ?? Math.max(10_000, Math.min(this.lockSeconds * 350, 30_000));
    this.timer = setInterval(() => { void this.renewNow().catch(() => undefined); }, intervalMs);
    this.timer.unref();
  }

  assertOwned(): void {
    if (!this.owned || this.lost || this.stopped) throw new OwnershipError('push_outbox_lock_not_owned');
  }

  async renewNow(): Promise<void> {
    this.assertOwned();
    if (this.renewalTask) return this.renewalTask;
    this.renewalInFlight = true;
    const task = this.dependencies.database.renewLock(this.outboxId, this.dependencies.workerId, this.lockSeconds)
      .then(() => { this.lastRenewedAt = this.now(); })
      .catch((error: unknown) => {
        this.owned = false; this.lost = true;
        this.dependencies.logger.log('error', 'lease_renewal_failed', {
          outbox_id: this.outboxId, notification_id: this.notificationId, error_code: readErrorCode(error, 'lease_renewal_failed')
        });
        throw new OwnershipError('push_outbox_lock_not_owned');
      })
      .finally(() => { this.renewalInFlight = false; this.renewalTask = null; });
    this.renewalTask = task;
    return task;
  }

  markLost(): void { this.owned = false; this.lost = true; }

  async stop(waitForRenewal = true): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (waitForRenewal && this.renewalTask) await this.renewalTask.catch(() => undefined);
    this.stopped = true;
  }
}

export class ReservationController {
  owned = true;
  lost = false;
  stopped = false;
  renewalInFlight = false;
  private timer: NodeJS.Timeout | null = null;
  private renewalTask: Promise<void> | null = null;

  constructor(
    readonly reservationToken: string,
    private readonly reservationSeconds: number,
    private readonly dependencies: ControllerDependencies
  ) {}

  start(): void {
    if (this.timer || this.stopped) return;
    const intervalMs = this.dependencies.heartbeatIntervalMs ?? Math.max(10_000, Math.min(this.reservationSeconds * 350, 30_000));
    this.timer = setInterval(() => { void this.renewNow().catch(() => undefined); }, intervalMs);
    this.timer.unref();
  }

  assertOwned(): void {
    if (!this.owned || this.lost || this.stopped) throw new OwnershipError('push_delivery_reservation_not_owned');
  }

  async renewNow(): Promise<void> {
    this.assertOwned();
    if (this.renewalTask) return this.renewalTask;
    this.renewalInFlight = true;
    const task = this.dependencies.database.renewDeliveryReservation(
      this.reservationToken, this.dependencies.workerId, this.reservationSeconds
    ).then(() => undefined).catch(() => {
      this.owned = false; this.lost = true;
      throw new OwnershipError('push_delivery_reservation_not_owned');
    }).finally(() => { this.renewalInFlight = false; this.renewalTask = null; });
    this.renewalTask = task;
    return task;
  }

  async stop(waitForRenewal = true): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (waitForRenewal && this.renewalTask) await this.renewalTask.catch(() => undefined);
    this.stopped = true;
  }
}

export function readErrorCode(error: unknown, fallback: string): string {
  if (error && typeof error === 'object' && 'code' in error) {
    const value = (error as { code?: unknown }).code;
    if (typeof value === 'string' && /^[a-z0-9_.:-]{1,100}$/i.test(value)) return value.toLowerCase();
  }
  return fallback;
}

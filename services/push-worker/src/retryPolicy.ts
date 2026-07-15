import { safeErrorCode } from './logger.js';

export type FailureKind = 'gone' | 'permanent' | 'transient' | 'configuration';

export interface FailureClassification {
  kind: FailureKind;
  httpStatus: number | null;
  errorCode: string;
  disableSubscription: boolean;
}

const RETRY_DELAYS_MS = [60_000, 5 * 60_000, 15 * 60_000, 60 * 60_000, 6 * 60 * 60_000] as const;

function readStatus(error: unknown): number | null {
  if (!error || typeof error !== 'object') return null;
  const value = (error as Record<string, unknown>).statusCode;
  return typeof value === 'number' && Number.isInteger(value) ? value : null;
}

function readCode(error: unknown): string | null {
  if (!error || typeof error !== 'object') return null;
  const value = (error as Record<string, unknown>).code;
  return typeof value === 'string' ? value : null;
}

export function classifySendFailure(error: unknown): FailureClassification {
  const httpStatus = readStatus(error);
  const networkCode = readCode(error);
  if (httpStatus === 404 || httpStatus === 410) {
    return { kind: 'gone', httpStatus, errorCode: 'expired_subscription', disableSubscription: true };
  }
  if (httpStatus === 401 || httpStatus === 403) {
    return { kind: 'configuration', httpStatus, errorCode: 'vapid_configuration_failure', disableSubscription: false };
  }
  if (httpStatus === 408 || httpStatus === 429 || (httpStatus !== null && httpStatus >= 500)) {
    return { kind: 'transient', httpStatus, errorCode: `push_http_${httpStatus}`, disableSubscription: false };
  }
  if (httpStatus === 400) {
    return { kind: 'permanent', httpStatus, errorCode: 'malformed_subscription', disableSubscription: true };
  }
  if (networkCode && ['ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'UND_ERR_CONNECT_TIMEOUT'].includes(networkCode)) {
    return { kind: 'transient', httpStatus, errorCode: safeErrorCode(networkCode), disableSubscription: false };
  }
  return { kind: 'permanent', httpStatus, errorCode: 'subscription_crypto_failure', disableSubscription: true };
}

export function retryDelayMs(attempt: number, random: () => number = Math.random): number {
  const index = Math.min(Math.max(attempt, 1), RETRY_DELAYS_MS.length) - 1;
  const base = RETRY_DELAYS_MS[index] ?? 6 * 60 * 60_000;
  const jitter = 0.8 + Math.min(Math.max(random(), 0), 1) * 0.4;
  return Math.round(base * jitter);
}

export function nextAttemptAt(attempt: number, now: Date, random: () => number = Math.random): string {
  return new Date(now.getTime() + retryDelayMs(attempt, random)).toISOString();
}

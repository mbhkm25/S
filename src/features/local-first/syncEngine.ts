import { cloudOperationRepository } from './cloudOperationRepository';
import type { CreateOperationInput } from './operationRepository';
import { emitLocalRuntimeStatus } from './localRuntimeEvents';
import {
  enqueueLocalSyncJob,
  getLocalOperation,
  getLocalOperationFile,
  listRunnableSyncJobs,
  updateLocalOperation,
  updateSyncJob,
  type LocalSyncJob,
} from './localStore';

const MAX_ATTEMPTS = 6;
const BASE_RETRY_MS = 15_000;

function buildIdempotencyKey(localId: string, fileSha256: string): string {
  return `sanad-local:${localId}:${fileSha256}`;
}

function scheduleNativeRecovery(): void {
  if (typeof window === 'undefined') return;
  try {
    window.AndroidLocalRuntime?.scheduleRecovery?.();
  } catch (error) {
    console.warn('SANAD local-first native recovery scheduling failed', error);
  }
}

export async function queueOperationForCloud(localId: string): Promise<LocalSyncJob> {
  const operation = await getLocalOperation(localId);
  if (!operation) throw new Error(`Local operation ${localId} does not exist.`);

  const now = new Date().toISOString();
  const job: LocalSyncJob = {
    id: crypto.randomUUID(),
    localOperationId: localId,
    idempotencyKey: buildIdempotencyKey(localId, operation.fileSha256),
    state: 'queued',
    attemptCount: 0,
    nextAttemptAt: null,
    lastError: null,
    createdAt: now,
    updatedAt: now,
  };
  await enqueueLocalSyncJob(job);
  await updateLocalOperation(
    localId,
    (current) => ({ ...current, status: 'queued_for_sync', updatedAt: now }),
    { type: 'sync_queued', payload: { idempotency_key: job.idempotencyKey } },
  );
  scheduleNativeRecovery();
  emitLocalRuntimeStatus({ phase: 'queued', message: 'تم حفظ العملية محليًا وستتم مزامنتها بأمان.', localId });
  return job;
}

function nextRetryAt(attemptCount: number): string {
  const exponent = Math.min(attemptCount - 1, 5);
  const delay = BASE_RETRY_MS * 2 ** exponent;
  return new Date(Date.now() + delay).toISOString();
}

async function syncOne(job: LocalSyncJob): Promise<void> {
  const operation = await getLocalOperation(job.localOperationId);
  const storedFile = await getLocalOperationFile(job.localOperationId);
  if (!operation || !storedFile) {
    await updateSyncJob({ ...job, state: 'failed', lastError: 'local_payload_missing', updatedAt: new Date().toISOString() });
    emitLocalRuntimeStatus({ phase: 'error', message: 'تعذر العثور على ملف عملية محلية محفوظة.', localId: job.localOperationId });
    return;
  }

  if (operation.cloudOperationId) {
    const now = new Date().toISOString();
    if (operation.status !== 'synced') {
      await updateLocalOperation(
        operation.localId,
        (current) => ({ ...current, status: 'synced', updatedAt: now }),
        { type: 'sync_state_reconciled', payload: { cloud_operation_id: operation.cloudOperationId } },
      );
    }
    await updateSyncJob({
      ...job,
      state: 'completed',
      nextAttemptAt: null,
      lastError: null,
      updatedAt: now,
    });
    return;
  }

  const attemptCount = job.attemptCount + 1;
  await updateSyncJob({ ...job, state: 'syncing', attemptCount, nextAttemptAt: null, updatedAt: new Date().toISOString() });
  await updateLocalOperation(
    operation.localId,
    (current) => ({ ...current, status: 'syncing', updatedAt: new Date().toISOString() }),
    { type: 'sync_started', payload: { attempt: attemptCount, idempotency_key: job.idempotencyKey } },
  );
  emitLocalRuntimeStatus({ phase: 'syncing', message: 'جاري مزامنة عملية محفوظة محليًا…', localId: operation.localId });

  try {
    const file = new File([storedFile.blob], storedFile.name, { type: storedFile.mimeType, lastModified: Date.parse(storedFile.createdAt) });
    const createInput: CreateOperationInput = {
      source: operation.source,
      submittedByUserId: operation.submittedByUserId,
      submittedByPhone: operation.submittedByPhone,
      submittedByName: operation.submittedByName,
      file,
      clientMetadata: {
        ...operation.clientMetadata,
        local_operation_id: operation.localId,
        local_file_sha256: operation.fileSha256,
        sync_idempotency_key: job.idempotencyKey,
        sync_attempt: attemptCount,
      },
    };
    const cloud = await cloudOperationRepository.create(createInput);
    const cloudOperationId = cloud.identity.cloudOperationId;
    if (!cloudOperationId || !cloud.publicToken) throw new Error('Cloud operation identity is incomplete.');

    await updateLocalOperation(
      operation.localId,
      (current) => ({
        ...current,
        cloudOperationId,
        publicToken: cloud.publicToken ?? null,
        status: 'synced',
        updatedAt: new Date().toISOString(),
      }),
      { type: 'sync_completed', payload: { cloud_operation_id: cloudOperationId, public_token: cloud.publicToken } },
    );
    await updateSyncJob({
      ...job,
      state: 'completed',
      attemptCount,
      nextAttemptAt: null,
      lastError: null,
      updatedAt: new Date().toISOString(),
    });

    emitLocalRuntimeStatus({
      phase: 'synced',
      message: 'تمت مزامنة العملية المحلية مع سند كلاود.',
      localId: operation.localId,
      cloudOperationId,
    });

    try {
      await cloudOperationRepository.triggerAnalysis(cloud);
    } catch (error) {
      console.warn('SANAD local-first: cloud analysis trigger failed after durable sync', error);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown_sync_error';
    const terminal = attemptCount >= MAX_ATTEMPTS;
    const now = new Date().toISOString();
    await updateSyncJob({
      ...job,
      state: terminal ? 'failed' : 'retry_wait',
      attemptCount,
      nextAttemptAt: terminal ? null : nextRetryAt(attemptCount),
      lastError: message,
      updatedAt: now,
    });
    await updateLocalOperation(
      operation.localId,
      (current) => ({ ...current, status: terminal ? 'sync_failed' : 'retry_wait', updatedAt: now }),
      { type: terminal ? 'sync_failed' : 'sync_retry_scheduled', payload: { attempt: attemptCount, error: message } },
    );
    if (!terminal) scheduleNativeRecovery();
    emitLocalRuntimeStatus({
      phase: terminal ? 'error' : 'queued',
      message: terminal
        ? 'تعذر مزامنة العملية بعد عدة محاولات. ستبقى محفوظة محليًا للمراجعة.'
        : 'تعذر الاتصال مؤقتًا. بقيت العملية محفوظة وسيعيد سند المحاولة.',
      localId: operation.localId,
    });
  }
}

export async function drainLocalSyncQueue(): Promise<{ attempted: number }> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return { attempted: 0 };
  const jobs = await listRunnableSyncJobs();
  for (const job of jobs) await syncOne(job);
  return { attempted: jobs.length };
}

export function installReconnectSyncListener(): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const onOnline = () => void drainLocalSyncQueue().catch((error) => console.warn('SANAD local sync drain failed', error));
  window.addEventListener('online', onOnline);
  return () => window.removeEventListener('online', onOnline);
}

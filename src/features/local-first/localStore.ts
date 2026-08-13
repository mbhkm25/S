import type { LocalOperationStatus, StructuredFinancialAnalysis } from './contracts';

export type LocalSource = 'pwa_upload' | 'share_intake' | 'camera' | 'file' | 'notification' | 'manual';

export interface LocalStoredFile {
  id: string;
  localOperationId: string;
  name: string;
  mimeType: string;
  size: number;
  sha256: string;
  blob: Blob;
  createdAt: string;
}

export interface LocalStoredOperation {
  localId: string;
  cloudOperationId: string | null;
  publicToken: string | null;
  source: LocalSource;
  status: LocalOperationStatus;
  submittedByUserId: string;
  submittedByPhone: string | null;
  submittedByName: string | null;
  fileId: string;
  fileSha256: string;
  analysisRevision: number;
  latestAnalysis: StructuredFinancialAnalysis | null;
  clientMetadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface LocalOperationEvent {
  id: string;
  localOperationId: string;
  type: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface LocalSyncJob {
  id: string;
  localOperationId: string;
  idempotencyKey: string;
  state: 'queued' | 'syncing' | 'retry_wait' | 'failed' | 'completed';
  attemptCount: number;
  nextAttemptAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

const DB_NAME = 'sanad-local-first';
const DB_VERSION = 1;
const OPERATIONS = 'operations';
const FILES = 'files';
const EVENTS = 'events';
const SYNC_QUEUE = 'sync_queue';

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction aborted'));
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed'));
  });
}

export async function openLocalFirstDatabase(): Promise<IDBDatabase> {
  if (!('indexedDB' in globalThis)) throw new Error('IndexedDB is unavailable on this runtime.');
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(OPERATIONS)) {
        const store = db.createObjectStore(OPERATIONS, { keyPath: 'localId' });
        store.createIndex('by_cloud_id', 'cloudOperationId', { unique: false });
        store.createIndex('by_created_at', 'createdAt', { unique: false });
        store.createIndex('by_status', 'status', { unique: false });
        store.createIndex('by_file_sha256', 'fileSha256', { unique: false });
      }
      if (!db.objectStoreNames.contains(FILES)) {
        const store = db.createObjectStore(FILES, { keyPath: 'id' });
        store.createIndex('by_operation', 'localOperationId', { unique: false });
        store.createIndex('by_sha256', 'sha256', { unique: false });
      }
      if (!db.objectStoreNames.contains(EVENTS)) {
        const store = db.createObjectStore(EVENTS, { keyPath: 'id' });
        store.createIndex('by_operation', 'localOperationId', { unique: false });
        store.createIndex('by_created_at', 'createdAt', { unique: false });
      }
      if (!db.objectStoreNames.contains(SYNC_QUEUE)) {
        const store = db.createObjectStore(SYNC_QUEUE, { keyPath: 'id' });
        store.createIndex('by_operation', 'localOperationId', { unique: false });
        store.createIndex('by_state', 'state', { unique: false });
        store.createIndex('by_idempotency', 'idempotencyKey', { unique: true });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Failed to open SANAD local database'));
  });
}

export async function persistLocalOperationAtomic(input: { operation: LocalStoredOperation; file: LocalStoredFile; event?: LocalOperationEvent }): Promise<void> {
  const db = await openLocalFirstDatabase();
  try {
    const tx = db.transaction([OPERATIONS, FILES, EVENTS], 'readwrite');
    tx.objectStore(FILES).add(input.file);
    tx.objectStore(OPERATIONS).add(input.operation);
    if (input.event) tx.objectStore(EVENTS).add(input.event);
    await transactionDone(tx);
  } finally { db.close(); }
}

export async function getLocalOperation(localId: string): Promise<LocalStoredOperation | null> {
  const db = await openLocalFirstDatabase();
  try {
    const tx = db.transaction(OPERATIONS, 'readonly');
    const value = await requestResult(tx.objectStore(OPERATIONS).get(localId) as IDBRequest<LocalStoredOperation | undefined>);
    await transactionDone(tx);
    return value ?? null;
  } finally { db.close(); }
}

export async function listLocalOperations(): Promise<LocalStoredOperation[]> {
  const db = await openLocalFirstDatabase();
  try {
    const tx = db.transaction(OPERATIONS, 'readonly');
    const values = await requestResult(tx.objectStore(OPERATIONS).getAll() as IDBRequest<LocalStoredOperation[]>);
    await transactionDone(tx);
    return values.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } finally { db.close(); }
}

export async function listLocalOperationsForUser(userId: string): Promise<LocalStoredOperation[]> {
  return (await listLocalOperations()).filter((operation) => operation.submittedByUserId === userId);
}

export async function getLocalOperationFile(localId: string): Promise<LocalStoredFile | null> {
  const operation = await getLocalOperation(localId);
  if (!operation) return null;
  const db = await openLocalFirstDatabase();
  try {
    const tx = db.transaction(FILES, 'readonly');
    const value = await requestResult(tx.objectStore(FILES).get(operation.fileId) as IDBRequest<LocalStoredFile | undefined>);
    await transactionDone(tx);
    return value ?? null;
  } finally { db.close(); }
}

export async function updateLocalOperation(
  localId: string,
  mutate: (current: LocalStoredOperation) => LocalStoredOperation,
  event?: Omit<LocalOperationEvent, 'id' | 'localOperationId' | 'createdAt'>,
): Promise<LocalStoredOperation> {
  const db = await openLocalFirstDatabase();
  try {
    const tx = db.transaction([OPERATIONS, EVENTS], 'readwrite');
    const store = tx.objectStore(OPERATIONS);
    const current = await requestResult(store.get(localId) as IDBRequest<LocalStoredOperation | undefined>);
    if (!current) throw new Error(`Local operation ${localId} was not found.`);
    const next = mutate(current);
    store.put(next);
    if (event) {
      tx.objectStore(EVENTS).add({ id: crypto.randomUUID(), localOperationId: localId, type: event.type, payload: event.payload, createdAt: new Date().toISOString() } satisfies LocalOperationEvent);
    }
    await transactionDone(tx);
    return next;
  } finally { db.close(); }
}

export async function enqueueLocalSyncJob(job: LocalSyncJob): Promise<void> {
  const db = await openLocalFirstDatabase();
  try {
    const tx = db.transaction(SYNC_QUEUE, 'readwrite');
    tx.objectStore(SYNC_QUEUE).add(job);
    await transactionDone(tx);
  } finally { db.close(); }
}

export async function listRunnableSyncJobs(now = new Date()): Promise<LocalSyncJob[]> {
  const db = await openLocalFirstDatabase();
  try {
    const tx = db.transaction(SYNC_QUEUE, 'readonly');
    const jobs = await requestResult(tx.objectStore(SYNC_QUEUE).getAll() as IDBRequest<LocalSyncJob[]>);
    await transactionDone(tx);
    const timestamp = now.getTime();
    return jobs
      .filter((job) =>
        job.state === 'queued' ||
        job.state === 'syncing' ||
        (job.state === 'retry_wait' && (!job.nextAttemptAt || Date.parse(job.nextAttemptAt) <= timestamp)),
      )
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  } finally { db.close(); }
}

export async function updateSyncJob(job: LocalSyncJob): Promise<void> {
  const db = await openLocalFirstDatabase();
  try {
    const tx = db.transaction(SYNC_QUEUE, 'readwrite');
    tx.objectStore(SYNC_QUEUE).put(job);
    await transactionDone(tx);
  } finally { db.close(); }
}

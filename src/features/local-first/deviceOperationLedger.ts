import { supabase } from '../../lib/supabase';
import type { MyOperationItem } from '../../types';

export type DeviceLedgerRelation = 'uploader' | 'verifier';

export type DeviceOperationSnapshot = MyOperationItem & {
  ledger_key: string;
  user_id: string;
  relation_type: DeviceLedgerRelation;
  amount?: number | null;
  currency?: string | null;
  financial_entity?: string | null;
  reference_number?: string | null;
  structured_data?: unknown;
  raw_ai_json?: unknown;
  fetched_at: string;
};

const DB_NAME = 'sanad-operation-ledger';
const DB_VERSION = 1;
const SNAPSHOTS = 'operation_snapshots';
const PAGE_SIZE = 100;
const MAX_PAGES = 50;

export const DEVICE_LEDGER_UPDATED_EVENT = 'sanadDeviceLedgerUpdated';

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

async function openLedgerDatabase(): Promise<IDBDatabase> {
  if (!('indexedDB' in globalThis)) throw new Error('IndexedDB is unavailable on this runtime.');
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(SNAPSHOTS)) {
        const store = db.createObjectStore(SNAPSHOTS, { keyPath: 'ledger_key' });
        store.createIndex('by_user_relation', ['user_id', 'relation_type'], { unique: false });
        store.createIndex('by_cloud_operation', 'operation_id', { unique: false });
        store.createIndex('by_created_at', 'created_at', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Failed to open SANAD operation ledger'));
  });
}

export async function listDeviceOperationSnapshots(
  userId: string,
  relationType: DeviceLedgerRelation,
): Promise<DeviceOperationSnapshot[]> {
  const db = await openLedgerDatabase();
  try {
    const tx = db.transaction(SNAPSHOTS, 'readonly');
    const index = tx.objectStore(SNAPSHOTS).index('by_user_relation');
    const values = await requestResult(
      index.getAll(IDBKeyRange.only([userId, relationType])) as IDBRequest<DeviceOperationSnapshot[]>,
    );
    await transactionDone(tx);
    return values.sort((a, b) => b.created_at.localeCompare(a.created_at));
  } finally {
    db.close();
  }
}

async function replaceDeviceOperationSnapshots(
  userId: string,
  relationType: DeviceLedgerRelation,
  values: DeviceOperationSnapshot[],
): Promise<void> {
  const db = await openLedgerDatabase();
  try {
    const tx = db.transaction(SNAPSHOTS, 'readwrite');
    const store = tx.objectStore(SNAPSHOTS);
    const index = store.index('by_user_relation');
    const existing = await requestResult(
      index.getAll(IDBKeyRange.only([userId, relationType])) as IDBRequest<DeviceOperationSnapshot[]>,
    );
    for (const item of existing) store.delete(item.ledger_key);
    for (const item of values) store.put(item);
    await transactionDone(tx);
  } finally {
    db.close();
  }
}

async function fetchRelationRows(relationType: DeviceLedgerRelation): Promise<any[]> {
  const rows: any[] = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const offset = page * PAGE_SIZE;
    const { data, error } = await supabase.rpc('get_my_operations', {
      p_relation_type: relationType,
      p_from: null,
      p_to: null,
      p_limit: PAGE_SIZE,
      p_offset: offset,
    });
    if (error) throw error;
    const pageRows = Array.isArray(data) ? data : [];
    rows.push(...pageRows);
    if (pageRows.length < PAGE_SIZE) break;
  }
  return rows;
}

async function hydrateOperationRows(rows: any[]): Promise<any[]> {
  const ids = [...new Set(rows.map((row) => row.operation_id).filter(Boolean))];
  if (ids.length === 0) return rows;

  const byId = new Map<string, any>();
  for (let offset = 0; offset < ids.length; offset += PAGE_SIZE) {
    const chunk = ids.slice(offset, offset + PAGE_SIZE);
    const { data, error } = await supabase
      .from('operations')
      .select('id, amount, currency, financial_entity, reference_number, structured_data, raw_ai_json')
      .in('id', chunk);
    if (error) throw error;
    for (const operation of data || []) byId.set(operation.id, operation);
  }

  return rows.map((row) => ({ ...row, ...(byId.get(row.operation_id) || {}) }));
}

export async function pullCloudOperationsIntoDeviceLedger(
  userId: string,
  relationType: DeviceLedgerRelation,
): Promise<DeviceOperationSnapshot[]> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return listDeviceOperationSnapshots(userId, relationType);
  }

  const fetchedAt = new Date().toISOString();
  const rows = await hydrateOperationRows(await fetchRelationRows(relationType));
  const snapshots: DeviceOperationSnapshot[] = rows.map((row) => ({
    ...row,
    ledger_key: `${userId}:${relationType}:${row.operation_id}`,
    user_id: userId,
    relation_type: relationType,
    fetched_at: fetchedAt,
  }));

  await replaceDeviceOperationSnapshots(userId, relationType, snapshots);
  window.dispatchEvent(new CustomEvent(DEVICE_LEDGER_UPDATED_EVENT, {
    detail: { userId, relationType, count: snapshots.length, fetchedAt },
  }));
  return snapshots.sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export async function refreshCompleteDeviceLedger(userId: string): Promise<void> {
  await Promise.all([
    pullCloudOperationsIntoDeviceLedger(userId, 'uploader'),
    pullCloudOperationsIntoDeviceLedger(userId, 'verifier'),
  ]);
}

import { openLocalFirstDatabase, type LocalStoredFile, type LocalStoredOperation } from './localStore';

export interface LocalOperationHistoryItem {
  operation: LocalStoredOperation;
  file: LocalStoredFile | null;
}

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

export async function listLocalOperationHistory(): Promise<LocalOperationHistoryItem[]> {
  const db = await openLocalFirstDatabase();
  try {
    const tx = db.transaction(['operations', 'files'], 'readonly');
    const operations = await requestResult(
      tx.objectStore('operations').getAll() as IDBRequest<LocalStoredOperation[]>,
    );
    const files = await requestResult(
      tx.objectStore('files').getAll() as IDBRequest<LocalStoredFile[]>,
    );
    await transactionDone(tx);

    const fileById = new Map(files.map((file) => [file.id, file]));
    return operations
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((operation) => ({
        operation,
        file: fileById.get(operation.fileId) ?? null,
      }));
  } finally {
    db.close();
  }
}

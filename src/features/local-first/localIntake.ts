import {
  persistLocalOperationAtomic,
  type LocalOperationEvent,
  type LocalSource,
  type LocalStoredFile,
  type LocalStoredOperation,
} from './localStore';

export interface LocalIntakeInput {
  source: LocalSource;
  submittedByUserId: string;
  submittedByPhone?: string | null;
  submittedByName?: string | null;
  file: File;
  clientMetadata?: Record<string, unknown>;
}

export interface LocalIntakeResult {
  localId: string;
  fileId: string;
  fileSha256: string;
  status: 'local_only';
  createdAt: string;
}

export async function sha256Blob(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function ingestLocalOperation(input: LocalIntakeInput): Promise<LocalIntakeResult> {
  const now = new Date().toISOString();
  const localId = crypto.randomUUID();
  const fileId = crypto.randomUUID();
  const fileSha256 = await sha256Blob(input.file);

  const file: LocalStoredFile = {
    id: fileId,
    localOperationId: localId,
    name: input.file.name,
    mimeType: input.file.type || 'application/octet-stream',
    size: input.file.size,
    sha256: fileSha256,
    blob: input.file,
    createdAt: now,
  };

  const operation: LocalStoredOperation = {
    localId,
    cloudOperationId: null,
    publicToken: null,
    source: input.source,
    status: 'local_only',
    submittedByUserId: input.submittedByUserId,
    submittedByPhone: input.submittedByPhone ?? null,
    submittedByName: input.submittedByName ?? null,
    fileId,
    fileSha256,
    analysisRevision: 0,
    latestAnalysis: null,
    clientMetadata: input.clientMetadata ?? {},
    createdAt: now,
    updatedAt: now,
  };

  const event: LocalOperationEvent = {
    id: crypto.randomUUID(),
    localOperationId: localId,
    type: 'local_operation_created',
    payload: {
      source: input.source,
      file_name: input.file.name,
      file_mime_type: input.file.type || 'application/octet-stream',
      file_size: input.file.size,
      file_sha256: fileSha256,
    },
    createdAt: now,
  };

  // The file, operation and first audit event are committed in one transaction.
  // Any failure aborts all three writes, preventing orphaned records.
  await persistLocalOperationAtomic({ operation, file, event });

  return { localId, fileId, fileSha256, status: 'local_only', createdAt: now };
}

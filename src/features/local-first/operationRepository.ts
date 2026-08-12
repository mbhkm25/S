import type { LocalOperationIdentity, SyncEnvelope } from './contracts';

export type OperationRepositoryMode = 'cloud' | 'local' | 'hybrid';

export type CreateOperationInput = {
  source: 'pwa_upload' | 'share_intake' | 'camera' | 'file' | 'notification' | 'manual';
  submittedByUserId: string;
  submittedByPhone?: string | null;
  submittedByName?: string | null;
  file: File;
  fileBucket?: string;
  clientMetadata?: Record<string, unknown>;
};

export type CreatedOperation = {
  identity: LocalOperationIdentity;
  publicToken?: string | null;
  source: CreateOperationInput['source'];
  mode: OperationRepositoryMode;
  analysisTriggerFailed?: boolean;
};

export type OperationAccessProbe = {
  ready: boolean;
  allowed: boolean;
  publicToken?: string | null;
  reason?: string;
};

export type OperationRepositoryCapabilities = {
  durableLocalFiles: boolean;
  localDatabase: boolean;
  offlineCreate: boolean;
  backgroundSync: boolean;
  cloudPromotion: boolean;
};

export interface OperationRepository {
  readonly mode: OperationRepositoryMode;
  readonly capabilities: OperationRepositoryCapabilities;

  create(input: CreateOperationInput): Promise<CreatedOperation>;
  probeAccess(publicToken: string): Promise<OperationAccessProbe>;
  triggerAnalysis(operation: CreatedOperation): Promise<void>;
  buildSyncEnvelope?(operation: CreatedOperation): Promise<SyncEnvelope>;
}

export class OperationRepositoryError extends Error {
  readonly code: string;
  readonly recoverable: boolean;
  readonly cause?: unknown;

  constructor(code: string, message: string, options?: { recoverable?: boolean; cause?: unknown }) {
    super(message);
    this.name = 'OperationRepositoryError';
    this.code = code;
    this.recoverable = options?.recoverable ?? false;
    this.cause = options?.cause;
  }
}

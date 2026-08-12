import { ingestLocalOperation } from './localIntake';
import { queueOperationForCloud } from './syncEngine';
import type { OperationRepository, CreateOperationInput, CreatedOperation, OperationAccessProbe } from './operationRepository';

export class LocalOperationRepository implements OperationRepository {
  readonly mode = 'local' as const;
  readonly capabilities = {
    durableLocalFiles: true,
    localDatabase: true,
    offlineCreate: true,
    backgroundSync: true,
    cloudPromotion: true,
  } as const;

  async create(input: CreateOperationInput): Promise<CreatedOperation> {
    const local = await ingestLocalOperation({
      source: input.source,
      submittedByUserId: input.submittedByUserId,
      submittedByPhone: input.submittedByPhone,
      submittedByName: input.submittedByName,
      file: input.file,
      clientMetadata: input.clientMetadata,
    });

    return {
      identity: {
        localId: local.localId,
        cloudOperationId: null,
        fileSha256: local.fileSha256,
      },
      publicToken: null,
      source: input.source,
      mode: 'local',
      analysisTriggerFailed: false,
    };
  }

  async probeAccess(): Promise<OperationAccessProbe> {
    // A public-token access probe is inherently a Cloud concern. Local details
    // are read by localId through the local store, not through public tokens.
    return { ready: false, allowed: false, reason: 'local_operation_has_no_public_token' };
  }

  async triggerAnalysis(): Promise<void> {
    // Local analysis is orchestrated by the OCR/analysis pipeline, not by the
    // Cloud trigger endpoint. This no-op keeps the repository contract stable.
  }

  async queueForCloud(operation: CreatedOperation): Promise<void> {
    await queueOperationForCloud(operation.identity.localId);
  }
}

export const localOperationRepository = new LocalOperationRepository();

import { supabase } from '../../lib/supabase';
import { callSanadAppFunction } from '../../lib/sanadFunctions';
import {
  OperationRepository,
  OperationRepositoryError,
  type CreateOperationInput,
  type CreatedOperation,
  type OperationAccessProbe,
} from './operationRepository';

const OPERATION_FILES_BUCKET = 'operation-files';

function safeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9.-]/g, '_') || 'payment-document';
}

async function sha256Hex(file: File): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export class CloudOperationRepository implements OperationRepository {
  readonly mode = 'cloud' as const;
  readonly capabilities = {
    durableLocalFiles: false,
    localDatabase: false,
    offlineCreate: false,
    backgroundSync: false,
    cloudPromotion: true,
  } as const;

  async create(input: CreateOperationInput): Promise<CreatedOperation> {
    const bucket = input.fileBucket ?? OPERATION_FILES_BUCKET;
    const storagePath = `${input.submittedByUserId}/${Date.now()}-${safeFileName(input.file.name)}`;
    let uploaded = false;

    try {
      const fileSha256 = await sha256Hex(input.file);
      const { error: storageError } = await supabase.storage.from(bucket).upload(storagePath, input.file, {
        cacheControl: '3600',
        upsert: false,
        contentType: input.file.type || 'application/octet-stream',
      });

      if (storageError) {
        throw new OperationRepositoryError(
          'cloud_file_upload_failed',
          'تعذر رفع المستند. تحقق من اتصال الإنترنت وحاول مرة أخرى.',
          { recoverable: true, cause: storageError },
        );
      }
      uploaded = true;

      const uploadOrigin = input.source === 'share_intake' ? 'share' : 'pwa';
      const { data, error } = await supabase
        .from('operations')
        .insert({
          source: input.source === 'camera' || input.source === 'file' ? 'pwa_upload' : input.source,
          upload_origin: uploadOrigin,
          submitted_by_user_id: input.submittedByUserId,
          submitted_by_phone: input.submittedByPhone ?? null,
          submitted_by_name: input.submittedByName ?? null,
          file_bucket: bucket,
          file_path: storagePath,
          file_original_name: input.file.name,
          file_mime_type: input.file.type || 'application/octet-stream',
          file_size: input.file.size,
          original_file_status: 'stored',
          qr_status: 'created',
          status: 'stored',
          ai_status: 'pending',
          client_upload_metadata: {
            ...(input.clientMetadata ?? {}),
            file_sha256: fileSha256,
            repository_mode: 'cloud',
          },
        })
        .select('id, public_token')
        .single();

      if (error || !data) {
        throw new OperationRepositoryError(
          'cloud_operation_create_failed',
          'تم رفع الملف، لكن تعذر إنشاء العملية. لم يتم الاحتفاظ بالملف غير المرتبط.',
          { recoverable: true, cause: error },
        );
      }

      return {
        identity: {
          localId: `cloud:${data.id}`,
          cloudOperationId: data.id,
          fileSha256,
        },
        publicToken: data.public_token,
        source: input.source,
        mode: 'cloud',
        analysisTriggerFailed: false,
      };
    } catch (error) {
      if (uploaded) {
        await supabase.storage.from(bucket).remove([storagePath]).catch(() => undefined);
      }
      if (error instanceof OperationRepositoryError) throw error;
      throw new OperationRepositoryError('cloud_create_unexpected', 'تعذر إنشاء العملية. حاول مرة أخرى.', {
        recoverable: true,
        cause: error,
      });
    }
  }

  async probeAccess(publicToken: string): Promise<OperationAccessProbe> {
    try {
      const { data, error } = await supabase.rpc('open_operation_access', {
        p_public_token: publicToken,
        p_source: 'app',
      });
      if (error) return { ready: false, allowed: false, publicToken, reason: 'rpc_error' };
      return {
        ready: Boolean(data?.operation),
        allowed: data?.allowed === true,
        publicToken,
        reason: data?.allowed === true && data?.operation ? undefined : 'not_ready',
      };
    } catch {
      return { ready: false, allowed: false, publicToken, reason: 'network_error' };
    }
  }

  async triggerAnalysis(operation: CreatedOperation): Promise<void> {
    const operationId = operation.identity.cloudOperationId;
    if (!operationId || !operation.publicToken) {
      throw new OperationRepositoryError('cloud_identity_missing', 'معرّف العملية السحابية غير متاح.');
    }

    await callSanadAppFunction('sanad-v3-app-trigger-analysis', {
      operation_id: operationId,
      public_token: operation.publicToken,
      source: operation.source === 'camera' || operation.source === 'file' ? 'pwa_upload' : operation.source,
    });
  }
}

export const cloudOperationRepository = new CloudOperationRepository();

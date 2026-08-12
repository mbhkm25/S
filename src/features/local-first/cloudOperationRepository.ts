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

function toCloudSource(source: CreateOperationInput['source']): 'pwa_upload' | 'share_target' {
  return source === 'share_intake' ? 'share_target' : 'pwa_upload';
}

function toUploadOrigin(source: CreateOperationInput['source']): 'pwa' | 'share' {
  return source === 'share_intake' ? 'share' : 'pwa';
}

async function sha256Hex(file: File): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function syncIdempotencyKey(input: CreateOperationInput): string | null {
  const value = input.clientMetadata?.sync_idempotency_key;
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

async function findExistingSyncOperation(syncKey: string): Promise<{ id: string; public_token: string } | null> {
  const { data, error } = await supabase
    .from('operations')
    .select('id, public_token')
    .contains('client_upload_metadata', { sync_idempotency_key: syncKey })
    .maybeSingle();
  if (error) return null;
  return data ?? null;
}

function createdFromExisting(
  existing: { id: string; public_token: string },
  input: CreateOperationInput,
  fileSha256: string,
): CreatedOperation {
  return {
    identity: {
      localId: `cloud:${existing.id}`,
      cloudOperationId: existing.id,
      fileSha256,
    },
    publicToken: existing.public_token,
    source: input.source,
    mode: 'cloud',
    analysisTriggerFailed: false,
  };
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
    const syncKey = syncIdempotencyKey(input);
    let uploaded = false;

    try {
      const fileSha256 = await sha256Hex(input.file);

      // Recovery fast-path: if a previous attempt committed the canonical row
      // but the client lost the response, reuse it before uploading a second file.
      if (syncKey) {
        const existing = await findExistingSyncOperation(syncKey);
        if (existing) return createdFromExisting(existing, input, fileSha256);
      }

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

      const cloudSource = toCloudSource(input.source);
      const { data, error } = await supabase
        .from('operations')
        .insert({
          source: cloudSource,
          upload_origin: toUploadOrigin(input.source),
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
            repository_mode: syncKey ? 'local_sync' : 'cloud',
          },
        })
        .select('id, public_token')
        .single();

      if (error || !data) {
        // The database unique index is the final concurrency guard. If another
        // retry won the race, remove this attempt's orphan upload and reuse the
        // canonical operation instead of surfacing a false failure.
        if (syncKey && error?.code === '23505') {
          if (uploaded) {
            await supabase.storage.from(bucket).remove([storagePath]).catch(() => undefined);
            uploaded = false;
          }
          const existing = await findExistingSyncOperation(syncKey);
          if (existing) return createdFromExisting(existing, input, fileSha256);
        }

        throw new OperationRepositoryError(
          'cloud_operation_create_failed',
          'تم رفع الملف، لكن تعذر إنشاء العملية. لم يتم الاحتفاظ بالملف غير المرتبط.',
          { recoverable: true, cause: error },
        );
      }

      return createdFromExisting(data, input, fileSha256);
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
      source: toCloudSource(operation.source),
    });
  }
}

export const cloudOperationRepository = new CloudOperationRepository();
import { extractFinancialCandidates } from './candidateExtractor';
import { buildDeterministicFinancialAnalysis } from './deterministicAnalysis';
import { ingestLocalOperation } from './localIntake';
import { updateLocalOperation } from './localStore';
import { emitLocalRuntimeStatus } from './localRuntimeEvents';

export interface NativeFinancialNotificationPayload {
  packageName: string;
  appLabel?: string | null;
  title?: string | null;
  text?: string | null;
  bigText?: string | null;
  postedAt?: number | null;
  notificationKey?: string | null;
}

function notificationText(payload: NativeFinancialNotificationPayload): string {
  return [
    payload.appLabel ? `التطبيق: ${payload.appLabel}` : null,
    payload.title ? `العنوان: ${payload.title}` : null,
    payload.text,
    payload.bigText && payload.bigText !== payload.text ? payload.bigText : null,
  ].filter(Boolean).join('\n');
}

export async function ingestNativeFinancialNotification(input: {
  payload: NativeFinancialNotificationPayload;
  submittedByUserId: string;
  submittedByPhone?: string | null;
  submittedByName?: string | null;
}): Promise<{ localId: string }> {
  const rawText = notificationText(input.payload).trim();
  if (!rawText) throw new Error('financial_notification_text_empty');

  const file = new File(
    [rawText],
    `sanad-notification-${input.payload.postedAt || Date.now()}.txt`,
    { type: 'text/plain;charset=utf-8', lastModified: input.payload.postedAt || Date.now() },
  );

  const local = await ingestLocalOperation({
    source: 'notification',
    submittedByUserId: input.submittedByUserId,
    submittedByPhone: input.submittedByPhone,
    submittedByName: input.submittedByName,
    file,
    clientMetadata: {
      native_notification: true,
      package_name: input.payload.packageName,
      app_label: input.payload.appLabel ?? null,
      notification_key: input.payload.notificationKey ?? null,
      posted_at: input.payload.postedAt ?? null,
    },
  });

  const candidates = extractFinancialCandidates(rawText);
  const { structured } = buildDeterministicFinancialAnalysis({ rawText, candidates, ocrConfidence: 1 });
  const now = new Date().toISOString();

  await updateLocalOperation(
    local.localId,
    (current) => ({
      ...current,
      status: structured.reviewRequired ? 'review_required' : 'local_analyzed',
      analysisRevision: current.analysisRevision + 1,
      latestAnalysis: structured,
      updatedAt: now,
    }),
    {
      type: 'native_financial_notification_analyzed',
      payload: {
        package_name: input.payload.packageName,
        financial_entity_code: structured.financialEntityCode,
        review_required: structured.reviewRequired,
      },
    },
  );

  emitLocalRuntimeStatus({
    phase: structured.reviewRequired ? 'review_required' : 'notification_captured',
    message: structured.reviewRequired
      ? 'التقط سند إشعارًا ماليًا محليًا ويحتاج إلى مراجعة.'
      : 'التقط سند إشعارًا ماليًا وحلله محليًا.',
    localId: local.localId,
  });

  return { localId: local.localId };
}

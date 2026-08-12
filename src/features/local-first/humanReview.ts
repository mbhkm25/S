import type { StructuredFinancialAnalysis } from './contracts';
import { persistAnalysisRevision } from './analysisRevision';
import { getLocalOperation } from './localStore';

export interface HumanReviewPatch {
  financialEntity?: string;
  financialEntityCode?: string;
  transactionType?: StructuredFinancialAnalysis['transactionType'];
  transactionDirection?: StructuredFinancialAnalysis['transactionDirection'];
  amount?: number | null;
  currency?: StructuredFinancialAnalysis['currency'];
  documentReference?: string | null;
  transferReference?: string | null;
  transactionDatetime?: string | null;
  merchantPoint?: string | null;
  parties?: StructuredFinancialAnalysis['parties'];
}

export interface HumanReviewProvenance {
  reviewerUserId: string;
  reviewedAt: string;
  note?: string | null;
}

function criticalComplete(value: StructuredFinancialAnalysis): boolean {
  return Boolean(
    value.financialEntityCode &&
      value.financialEntityCode !== 'unknown' &&
      value.amount !== null &&
      value.amount > 0 &&
      value.currency &&
      (value.documentReference || value.transferReference),
  );
}

export function applyHumanReviewPatch(
  current: StructuredFinancialAnalysis,
  patch: HumanReviewPatch,
): StructuredFinancialAnalysis {
  const next: StructuredFinancialAnalysis = {
    ...current,
    ...patch,
    schemaVersion: Math.max(2, current.schemaVersion),
    confidence: current.confidence,
    warnings: [...new Set([...current.warnings.filter((warning) => warning !== 'human_review_applied'), 'human_review_applied'])],
    reviewRequired: false,
  };

  if (!criticalComplete(next)) {
    next.reviewRequired = true;
    next.warnings = [...new Set([...next.warnings, 'critical_field_unresolved_after_human_review'])];
  }
  return next;
}

export async function applyHumanReview(input: {
  localId: string;
  patch: HumanReviewPatch;
  provenance: HumanReviewProvenance;
}): Promise<StructuredFinancialAnalysis> {
  const operation = await getLocalOperation(input.localId);
  if (!operation?.latestAnalysis) throw new Error('local_analysis_required_before_human_review');

  const reviewed = applyHumanReviewPatch(operation.latestAnalysis, input.patch);
  const revision = operation.analysisRevision + 1;
  await persistAnalysisRevision(input.localId, {
    revision,
    source: 'human',
    structured: reviewed,
    createdAt: input.provenance.reviewedAt,
  });

  // Persist reviewer identity and changed fields separately from model output.
  const { updateLocalOperation } = await import('./localStore');
  await updateLocalOperation(
    input.localId,
    (current) => ({ ...current, updatedAt: input.provenance.reviewedAt }),
    {
      type: 'human_review_applied',
      payload: {
        revision,
        reviewer_user_id: input.provenance.reviewerUserId,
        reviewed_at: input.provenance.reviewedAt,
        note: input.provenance.note ?? null,
        changed_fields: Object.keys(input.patch),
      },
    },
  );

  return reviewed;
}

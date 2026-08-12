import type { LocalAnalysisRevision } from './contracts';
import { updateLocalOperation } from './localStore';

export async function persistAnalysisRevision(
  localId: string,
  revision: LocalAnalysisRevision,
): Promise<void> {
  await updateLocalOperation(
    localId,
    (current) => {
      const nextRevision = Math.max(current.analysisRevision + 1, revision.revision);
      const structured = revision.structured ?? current.latestAnalysis;
      const status = structured?.reviewRequired ? 'review_required' : 'local_analyzed';
      return {
        ...current,
        analysisRevision: nextRevision,
        latestAnalysis: structured ?? null,
        status,
        updatedAt: revision.createdAt,
      };
    },
    {
      type: 'analysis_revision_created',
      payload: {
        revision: revision.revision,
        source: revision.source,
        ocr_provider: revision.ocr?.provider ?? null,
        ocr_confidence: revision.ocr?.confidence ?? null,
        grounding: revision.grounding ?? null,
        structured: revision.structured ?? null,
      },
    },
  );
}

import type { LocalAnalysisRevision, LocalOcrResult } from './contracts';
import { persistAnalysisRevision } from './analysisRevision';
import { extractFinancialCandidates } from './candidateExtractor';
import { buildDeterministicFinancialAnalysis } from './deterministicAnalysis';
import { analyzeTextSemantically, cloudTextSemanticAllowed, type SemanticTextPolicy } from './semanticTextAnalysis';

export interface LocalAnalysisPipelineResult {
  localRevision: LocalAnalysisRevision;
  semanticRevision?: LocalAnalysisRevision;
  finalRevision: LocalAnalysisRevision;
}

export async function processLocalOcrResult(input: {
  localId: string;
  currentRevision: number;
  ocr: LocalOcrResult;
  semanticPolicy: SemanticTextPolicy;
}): Promise<LocalAnalysisPipelineResult> {
  const candidates = extractFinancialCandidates(input.ocr.rawText);
  const deterministic = buildDeterministicFinancialAnalysis({
    rawText: input.ocr.rawText,
    candidates,
    ocrConfidence: input.ocr.confidence,
  });

  const localRevision: LocalAnalysisRevision = {
    revision: input.currentRevision + 1,
    source: 'local_rules',
    ocr: input.ocr,
    candidates,
    structured: deterministic.structured,
    grounding: deterministic.grounding,
    createdAt: new Date().toISOString(),
  };
  await persistAnalysisRevision(input.localId, localRevision);

  const semanticUseful = deterministic.structured.reviewRequired || deterministic.grounding.fallbackRecommended;
  if (!semanticUseful || !cloudTextSemanticAllowed(input.semanticPolicy)) {
    return { localRevision, finalRevision: localRevision };
  }

  const semantic = await analyzeTextSemantically({
    localOperationId: input.localId,
    analysisRevision: localRevision.revision + 1,
    ocr: input.ocr,
    candidates,
    localHints: deterministic.structured,
    policy: input.semanticPolicy,
  });

  const semanticRevision: LocalAnalysisRevision = {
    revision: localRevision.revision + 1,
    source: 'cloud_text_semantic',
    ocr: input.ocr,
    candidates,
    structured: semantic.structured,
    grounding: semantic.grounding,
    createdAt: new Date().toISOString(),
  };
  await persistAnalysisRevision(input.localId, semanticRevision);

  return { localRevision, semanticRevision, finalRevision: semanticRevision };
}

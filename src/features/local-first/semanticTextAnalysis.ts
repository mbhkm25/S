import { supabase } from '../../lib/supabase';
import type {
  AnalysisGrounding,
  FinancialFieldCandidates,
  LocalOcrResult,
  StructuredFinancialAnalysis,
} from './contracts';
import { enforceGrounding, groundStructuredAnalysis } from './evidenceEngine';

const FUNCTION_NAME = 'sanad-local-text-analysis';
const MAX_OCR_TEXT_LENGTH = 20_000;

export interface SemanticTextPolicy {
  allowCloudTextSemantic: boolean;
  requireOnline: boolean;
}

export interface SemanticTextResult {
  engine: string;
  model: string;
  latencyMs: number;
  structured: StructuredFinancialAnalysis;
  grounding: AnalysisGrounding;
}

interface FunctionResponse {
  ok?: boolean;
  engine?: string;
  model?: string;
  latency_ms?: number;
  structured?: StructuredFinancialAnalysis;
  error?: string;
  detail?: string;
}

function assertStructured(value: unknown): asserts value is StructuredFinancialAnalysis {
  if (!value || typeof value !== 'object') throw new Error('semantic_structured_payload_missing');
  const item = value as Partial<StructuredFinancialAnalysis>;
  if (typeof item.schemaVersion !== 'number') throw new Error('semantic_schema_version_missing');
  if (typeof item.financialEntityCode !== 'string') throw new Error('semantic_entity_code_missing');
  if (!Array.isArray(item.parties)) throw new Error('semantic_parties_invalid');
  if (!Array.isArray(item.warnings)) throw new Error('semantic_warnings_invalid');
  if (typeof item.confidence !== 'number') throw new Error('semantic_confidence_invalid');
  if (typeof item.reviewRequired !== 'boolean') throw new Error('semantic_review_flag_invalid');
}

export function cloudTextSemanticAllowed(policy: SemanticTextPolicy): boolean {
  if (!policy.allowCloudTextSemantic) return false;
  if (policy.requireOnline && typeof navigator !== 'undefined' && navigator.onLine === false) return false;
  return true;
}

export async function analyzeTextSemantically(input: {
  localOperationId: string;
  analysisRevision: number;
  ocr: LocalOcrResult;
  candidates: FinancialFieldCandidates;
  localHints?: StructuredFinancialAnalysis | null;
  policy: SemanticTextPolicy;
}): Promise<SemanticTextResult> {
  if (!cloudTextSemanticAllowed(input.policy)) throw new Error('cloud_text_semantic_not_allowed');

  const ocrText = input.ocr.rawText.trim();
  if (!ocrText) throw new Error('ocr_text_required');
  if (ocrText.length > MAX_OCR_TEXT_LENGTH) throw new Error('ocr_text_too_large');

  // Only OCR text and deterministic hints leave the device here. The original
  // image/blob is deliberately not part of this contract.
  const { data, error } = await supabase.functions.invoke<FunctionResponse>(FUNCTION_NAME, {
    body: {
      local_operation_id: input.localOperationId,
      analysis_revision: input.analysisRevision,
      ocr_text: ocrText,
      ocr_confidence: input.ocr.confidence,
      local_hints: {
        candidates: input.candidates,
        structured: input.localHints ?? null,
      },
    },
  });

  if (error) throw new Error(`cloud_text_semantic_request_failed:${error.message}`);
  if (!data?.ok) throw new Error(`cloud_text_semantic_failed:${data?.error ?? 'unknown'}:${data?.detail ?? ''}`);
  assertStructured(data.structured);

  const grounding = groundStructuredAnalysis({
    rawText: ocrText,
    candidates: input.candidates,
    structured: data.structured,
    ocrConfidence: input.ocr.confidence,
  });

  return {
    engine: data.engine ?? 'sanad-local-text-v2',
    model: data.model ?? 'unknown',
    latencyMs: Number(data.latency_ms ?? 0),
    structured: enforceGrounding(data.structured, grounding),
    grounding,
  };
}

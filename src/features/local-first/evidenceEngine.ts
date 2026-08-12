import type {
  AnalysisGrounding,
  FinancialFieldCandidates,
  StructuredFinancialAnalysis,
} from './contracts';
import { normalizeFinancialOcrText } from './textNormalization';

function normalizeEvidenceValue(value: string | number | null | undefined): string {
  return normalizeFinancialOcrText(String(value ?? ''))
    .replace(/[^A-Za-z0-9]/g, '')
    .toLowerCase();
}

export function valueIsGrounded(rawText: string, value: string | number | null | undefined): boolean {
  const needle = normalizeEvidenceValue(value);
  if (needle.length < 2) return false;
  const haystack = normalizeEvidenceValue(rawText);
  return haystack.includes(needle);
}

function candidateContains(candidates: FinancialFieldCandidates, value: string | number | null | undefined): boolean {
  const needle = normalizeEvidenceValue(value);
  if (!needle) return false;
  const groups = [
    candidates.amounts,
    candidates.currencies,
    candidates.references,
    candidates.dates,
    candidates.identifiers,
    candidates.entityHints,
  ];
  return groups.some((group) => group.some((candidate) => normalizeEvidenceValue(candidate.value) === needle));
}

function pushCheck(
  state: { checked: number; grounded: number; mismatches: string[] },
  label: string,
  present: boolean,
  supported: boolean,
): void {
  if (!present) return;
  state.checked += 1;
  if (supported) state.grounded += 1;
  else state.mismatches.push(label);
}

export function groundStructuredAnalysis(input: {
  rawText: string;
  candidates: FinancialFieldCandidates;
  structured: StructuredFinancialAnalysis;
  ocrConfidence?: number;
}): AnalysisGrounding {
  const { rawText, candidates, structured } = input;
  const state = { checked: 0, grounded: 0, mismatches: [] as string[] };

  pushCheck(
    state,
    'amount_not_grounded',
    structured.amount !== null,
    valueIsGrounded(rawText, structured.amount) || candidateContains(candidates, structured.amount),
  );
  pushCheck(
    state,
    'currency_not_grounded',
    structured.currency !== null,
    candidateContains(candidates, structured.currency),
  );
  pushCheck(
    state,
    'document_reference_not_grounded',
    Boolean(structured.documentReference),
    valueIsGrounded(rawText, structured.documentReference) || candidateContains(candidates, structured.documentReference),
  );
  pushCheck(
    state,
    'transfer_reference_not_grounded',
    Boolean(structured.transferReference),
    valueIsGrounded(rawText, structured.transferReference) || candidateContains(candidates, structured.transferReference),
  );
  pushCheck(
    state,
    'transaction_datetime_not_grounded',
    Boolean(structured.transactionDatetime),
    valueIsGrounded(rawText, structured.transactionDatetime) || candidateContains(candidates, structured.transactionDatetime),
  );
  pushCheck(
    state,
    'merchant_point_not_grounded',
    Boolean(structured.merchantPoint),
    valueIsGrounded(rawText, structured.merchantPoint) || candidateContains(candidates, structured.merchantPoint),
  );

  for (const party of structured.parties) {
    for (const identifier of party.identifiers) {
      pushCheck(
        state,
        `identifier_not_grounded:${identifier.type}`,
        Boolean(identifier.value),
        valueIsGrounded(rawText, identifier.value) || candidateContains(candidates, identifier.value),
      );
    }
  }

  const criticalEntityResolved = Boolean(structured.financialEntityCode && structured.financialEntityCode !== 'unknown');
  const criticalAmount = structured.amount !== null && structured.amount > 0;
  const criticalCurrency = structured.currency !== null;
  const criticalReference = Boolean(structured.documentReference || structured.transferReference);
  const criticalComplete = criticalEntityResolved && criticalAmount && criticalCurrency && criticalReference;

  const ratio = state.checked > 0 ? state.grounded / state.checked : null;
  const fullyGrounded = state.mismatches.length === 0 && criticalComplete;
  const fallbackReasons = [...state.mismatches];

  if (!criticalComplete) fallbackReasons.push('critical_field_unresolved');
  if ((input.ocrConfidence ?? 1) < 0.8) fallbackReasons.push('ocr_confidence_below_automatic_threshold');
  if (structured.confidence < 0.8) fallbackReasons.push('semantic_confidence_below_automatic_threshold');

  return {
    criticalChecked: state.checked,
    criticalGrounded: state.grounded,
    criticalGroundingRatio: ratio,
    criticalFullyGrounded: fullyGrounded,
    mismatches: [...new Set(state.mismatches)],
    fallbackRecommended: fallbackReasons.length > 0,
    fallbackReasons: [...new Set(fallbackReasons)],
  };
}

export function enforceGrounding(
  structured: StructuredFinancialAnalysis,
  grounding: AnalysisGrounding,
): StructuredFinancialAnalysis {
  const warnings = [...new Set([...structured.warnings, ...grounding.fallbackReasons])];
  return {
    ...structured,
    warnings,
    reviewRequired: structured.reviewRequired || !grounding.criticalFullyGrounded || warnings.length > 0,
  };
}

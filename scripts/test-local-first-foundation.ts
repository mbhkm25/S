import assert from 'node:assert/strict';
import { extractFinancialCandidates } from '../src/features/local-first/candidateExtractor';
import { buildDeterministicFinancialAnalysis } from '../src/features/local-first/deterministicAnalysis';
import { groundStructuredAnalysis } from '../src/features/local-first/evidenceEngine';
import { applyHumanReviewPatch } from '../src/features/local-first/humanReview';
import { normalizeFinancialOcrText } from '../src/features/local-first/textNormalization';

const normalized = normalizeFinancialOcrText('المبلغ ١٢٣٬٤٥٦ ريال يمني\r\nرقم العملية: ABC-12345');
assert.match(normalized, /123/);
assert.doesNotMatch(normalized, /١/);

const ocrText = `
العمقي للصرافة
المبلغ 125000 ريال يمني
رقم العملية: OM-778899
رقم الحساب 123456789012
2026/08/12 20:45
`;
const candidates = extractFinancialCandidates(ocrText);

assert.equal(candidates.currencies.some((candidate) => candidate.value === 'YER'), true, 'YER must be detected');
assert.equal(candidates.references.some((candidate) => candidate.value === 'OM-778899'), true, 'labeled reference must be preserved');
assert.equal(candidates.identifiers.some((candidate) => candidate.value === '123456789012'), true, 'long numeric identifier must be preserved');
assert.equal(candidates.entityHints.some((candidate) => candidate.value === 'alomqi'), true, 'Al-Omqi entity hint must use the canonical cloud code');
assert.equal(candidates.identifiers.some((candidate) => candidate.value === '123456789013'), false, 'digits must never be invented');

const deterministic = buildDeterministicFinancialAnalysis({ rawText: ocrText, candidates, ocrConfidence: 0.94 });
assert.equal(deterministic.structured.financialEntityCode, 'alomqi');
assert.equal(deterministic.structured.amount, 125000);
assert.equal(deterministic.structured.currency, 'YER');
assert.equal(deterministic.structured.documentReference, 'OM-778899');
assert.equal(deterministic.grounding.criticalFullyGrounded, true, 'complete deterministic result must be grounded');
assert.equal(deterministic.structured.reviewRequired, false, 'fully grounded deterministic result should be auto-acceptable');

const forged = { ...deterministic.structured, amount: 125001, confidence: 0.99 };
const forgedGrounding = groundStructuredAnalysis({ rawText: ocrText, candidates, structured: forged, ocrConfidence: 0.94 });
assert.equal(forgedGrounding.criticalFullyGrounded, false, 'an unseen amount must fail evidence grounding');
assert.equal(forgedGrounding.mismatches.includes('amount_not_grounded'), true);

const reviewed = applyHumanReviewPatch(deterministic.structured, {
  amount: 130000,
  documentReference: 'MANUAL-REFERENCE',
});
assert.equal(reviewed.amount, 130000, 'human correction must outrank automated analysis');
assert.equal(reviewed.documentReference, 'MANUAL-REFERENCE');
assert.equal(reviewed.warnings.includes('human_review_applied'), true, 'human provenance marker must be retained');
assert.equal(reviewed.reviewRequired, false, 'complete human-reviewed values are final even when they differ from OCR');

console.log('SANAD local-first foundation + evidence + review checks passed.');

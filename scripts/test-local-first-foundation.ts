import assert from 'node:assert/strict';
import { extractFinancialCandidates } from '../src/features/local-first/candidateExtractor';
import { normalizeFinancialOcrText } from '../src/features/local-first/textNormalization';

const normalized = normalizeFinancialOcrText('المبلغ ١٢٣٬٤٥٦ ريال يمني\r\nرقم العملية: ABC-12345');
assert.match(normalized, /123/);
assert.doesNotMatch(normalized, /١/);

const candidates = extractFinancialCandidates(`
العمقي للصرافة
المبلغ 125000 ريال يمني
رقم العملية: OM-778899
رقم الحساب 123456789012
2026/08/12 20:45
`);

assert.equal(candidates.currencies.some((candidate) => candidate.value === 'YER'), true, 'YER must be detected');
assert.equal(candidates.references.some((candidate) => candidate.value === 'OM-778899'), true, 'labeled reference must be preserved');
assert.equal(candidates.identifiers.some((candidate) => candidate.value === '123456789012'), true, 'long numeric identifier must be preserved');
assert.equal(candidates.entityHints.some((candidate) => candidate.value === 'alomqy'), true, 'Al-Omqi entity hint must be detected');

// The deterministic layer may normalize glyphs/spacing, but must never invent
// an unseen financial identifier or silently repair digits.
assert.equal(candidates.identifiers.some((candidate) => candidate.value === '123456789013'), false);

console.log('SANAD local-first foundation checks passed.');

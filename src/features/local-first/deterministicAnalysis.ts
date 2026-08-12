import type {
  FinancialCurrency,
  FinancialFieldCandidates,
  StructuredFinancialAnalysis,
} from './contracts';
import { groundStructuredAnalysis, enforceGrounding } from './evidenceEngine';
import { normalizeFinancialOcrText } from './textNormalization';

function uniqueValues(items: { value: string }[]): string[] {
  return [...new Set(items.map((item) => item.value))];
}

function chooseUnique(items: { value: string }[]): string | null {
  const values = uniqueValues(items);
  return values.length === 1 ? values[0] : null;
}

function resolveEntity(candidates: FinancialFieldCandidates, normalizedText: string): { code: string; name: string } {
  const hints = uniqueValues(candidates.entityHints);
  if (hints.length === 1) {
    const code = hints[0];
    if (code === 'alomqi' || code === 'alomqy') return { code: 'alomqi', name: 'العمقي' };
    if (code === 'bin_dowal') return { code, name: 'بن دول' };
    if (code === 'al_busairi') return { code, name: 'البسيري' };
    if (code === 'kuraimi_haseb' || code === 'alkuraimi') return { code: 'kuraimi_haseb', name: 'الكريمي / حاسب' };
  }

  if (/Fund\s+Transfer\s*-\s*Other/i.test(normalizedText) && /\bFT[A-Z0-9]{6,}\b/i.test(normalizedText)) {
    return { code: 'kuraimi_haseb', name: 'الكريمي / حاسب' };
  }
  return { code: 'unknown', name: '' };
}

function transactionType(text: string): StructuredFinancialAnalysis['transactionType'] {
  if (/(تحويل|حوالة|transfer|fund transfer)/i.test(text)) return 'transfer';
  if (/(إيداع|ايداع|deposit)/i.test(text)) return 'deposit';
  if (/(سحب|withdraw)/i.test(text)) return 'withdrawal';
  if (/(دفع|payment|شراء|purchase)/i.test(text)) return 'payment';
  return 'unknown';
}

function direction(text: string): StructuredFinancialAnalysis['transactionDirection'] {
  if (/(تم\s+(?:إضافة|ايداع|إيداع)|credited|received|مستلم)/i.test(text)) return 'incoming';
  if (/(تم\s+(?:خصم|سحب)|debited|sent|مرسل)/i.test(text)) return 'outgoing';
  return 'unknown';
}

function confidenceFor(input: {
  entityResolved: boolean;
  amountResolved: boolean;
  currencyResolved: boolean;
  referenceResolved: boolean;
}): number {
  const values = [input.entityResolved, input.amountResolved, input.currencyResolved, input.referenceResolved];
  return values.filter(Boolean).length / values.length;
}

export function buildDeterministicFinancialAnalysis(input: {
  rawText: string;
  candidates: FinancialFieldCandidates;
  ocrConfidence?: number;
}): { structured: StructuredFinancialAnalysis; grounding: ReturnType<typeof groundStructuredAnalysis> } {
  const normalizedText = normalizeFinancialOcrText(input.rawText);
  const entity = resolveEntity(input.candidates, normalizedText);
  const amountValue = chooseUnique(input.candidates.amounts);
  const currencyValue = chooseUnique(input.candidates.currencies) as FinancialCurrency | null;
  const referenceValue = chooseUnique(input.candidates.references);
  const dateValue = chooseUnique(input.candidates.dates);

  const amount = amountValue !== null && /^\d+(?:\.\d{1,2})?$/.test(amountValue) ? Number(amountValue) : null;
  const confidence = confidenceFor({
    entityResolved: entity.code !== 'unknown',
    amountResolved: amount !== null && amount > 0,
    currencyResolved: currencyValue !== null,
    referenceResolved: referenceValue !== null,
  });

  const warnings: string[] = [];
  if (uniqueValues(input.candidates.amounts).length > 1) warnings.push('ambiguous_amount_candidates');
  if (uniqueValues(input.candidates.currencies).length > 1) warnings.push('ambiguous_currency_candidates');
  if (uniqueValues(input.candidates.references).length > 1) warnings.push('ambiguous_reference_candidates');
  if (entity.code === 'unknown') warnings.push('financial_entity_unresolved');

  const structured: StructuredFinancialAnalysis = {
    schemaVersion: 2,
    financialEntity: entity.name,
    financialEntityCode: entity.code,
    templateCode: 'local_deterministic_v1',
    transactionType: transactionType(normalizedText),
    transactionDirection: direction(normalizedText),
    amount,
    currency: currencyValue,
    documentReference: referenceValue,
    transferReference: null,
    transactionDatetime: dateValue,
    merchantPoint: null,
    parties: [],
    confidence,
    warnings,
    reviewRequired: warnings.length > 0 || confidence < 1,
  };

  const grounding = groundStructuredAnalysis({
    rawText: input.rawText,
    candidates: input.candidates,
    structured,
    ocrConfidence: input.ocrConfidence,
  });

  return { structured: enforceGrounding(structured, grounding), grounding };
}

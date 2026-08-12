import type { EvidenceCandidate, FinancialFieldCandidates } from './contracts';
import { normalizeCandidateToken, normalizeFinancialOcrText } from './textNormalization';

const CURRENCY_PATTERNS: Array<{ code: string; pattern: RegExp }> = [
  { code: 'YER', pattern: /(?:YER|ريال\s*يمني|ر\.?\s*ي\.?)/i },
  { code: 'SAR', pattern: /(?:SAR|ريال\s*سعودي|ر\.?\s*س\.?)/i },
  { code: 'USD', pattern: /(?:USD|دولار(?:\s*أمريكي)?|\$)/i },
];

const REFERENCE_LABEL = /(?:رقم\s*(?:العملية|الحوالة|المرجع)|مرجع|reference|ref|transaction\s*id)\s*[:：#-]?\s*([A-Z0-9][A-Z0-9\-_/]{3,})/i;
const AMOUNT_LABEL = /(?:المبلغ|amount|إجمالي|اجمالي|total)\s*[:：-]?\s*(\d{1,3}(?:[,\s]\d{3})+(?:\.\d{1,2})?|\d{1,12}(?:\.\d{1,2})?)/i;
const DATE_PATTERN = /\b(20\d{2}[\-/]\d{1,2}[\-/]\d{1,2}(?:[ T]\d{1,2}:\d{2}(?::\d{2})?)?|\d{1,2}[\-/]\d{1,2}[\-/]20\d{2}(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?)\b/g;
const LONG_IDENTIFIER_PATTERN = /\b\d{6,24}\b/g;
const AMOUNT_PATTERN = /(?:^|\s)(\d{1,3}(?:[,\s]\d{3})+(?:\.\d{1,2})?|\d{4,12}(?:\.\d{1,2})?)(?=\s|$|[.,،])/g;

function uniqueCandidates(items: EvidenceCandidate[]): EvidenceCandidate[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.kind ?? ''}:${item.value}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function compactAmount(value: string): string | null {
  const compact = value.replace(/[\s,]/g, '');
  return /^\d+(?:\.\d{1,2})?$/.test(compact) ? compact : null;
}

export function extractFinancialCandidates(rawText: string): FinancialFieldCandidates {
  const normalized = normalizeFinancialOcrText(rawText);
  const lines = normalized.split('\n').map((line) => line.trim()).filter(Boolean);
  const amounts: EvidenceCandidate[] = [];
  const currencies: EvidenceCandidate[] = [];
  const references: EvidenceCandidate[] = [];
  const dates: EvidenceCandidate[] = [];
  const identifiers: EvidenceCandidate[] = [];
  const entityHints: EvidenceCandidate[] = [];

  for (const line of lines) {
    for (const currency of CURRENCY_PATTERNS) {
      if (currency.pattern.test(line)) currencies.push({ value: currency.code, line, kind: 'currency', score: 1 });
    }

    const labeledAmount = line.match(AMOUNT_LABEL)?.[1];
    const labeledCompact = labeledAmount ? compactAmount(labeledAmount) : null;
    if (labeledCompact) amounts.push({ value: labeledCompact, line, kind: 'labeled_amount', score: 1 });

    const reference = line.match(REFERENCE_LABEL)?.[1];
    if (reference) references.push({ value: normalizeCandidateToken(reference), line, kind: 'labeled_reference', score: 1 });

    for (const match of line.matchAll(DATE_PATTERN)) {
      dates.push({ value: match[1], line, kind: 'datetime_like', score: 0.9 });
    }

    for (const match of line.matchAll(LONG_IDENTIFIER_PATTERN)) {
      identifiers.push({ value: match[0], line, kind: 'numeric_identifier', score: 0.65 });
    }

    for (const match of line.matchAll(AMOUNT_PATTERN)) {
      const compact = compactAmount(match[1]);
      if (compact) amounts.push({ value: compact, line, kind: 'amount_like', score: 0.6 });
    }

    const lower = line.toLowerCase();
    if (/(الكريمي|حاسب|kuraimi|haseb)/i.test(lower)) entityHints.push({ value: 'kuraimi_haseb', line, kind: 'entity_hint', score: 0.95 });
    if (/(العمقي|alomqy|alomqi|amqi)/i.test(lower)) entityHints.push({ value: 'alomqi', line, kind: 'entity_hint', score: 0.95 });
    if (/(بن\s*دول|bindaw?al|bin\s*dowal)/i.test(lower)) entityHints.push({ value: 'bin_dowal', line, kind: 'entity_hint', score: 0.9 });
    if (/(البسيري|busairi|al\s*busairi)/i.test(lower)) entityHints.push({ value: 'al_busairi', line, kind: 'entity_hint', score: 0.9 });

    for (const ft of line.matchAll(/\bFT[A-Z0-9]{6,}\b/gi)) {
      references.push({ value: normalizeCandidateToken(ft[0]), line, kind: 'ft_transfer_reference', score: 0.95 });
    }
  }

  return {
    amounts: uniqueCandidates(amounts),
    currencies: uniqueCandidates(currencies),
    references: uniqueCandidates(references),
    dates: uniqueCandidates(dates),
    identifiers: uniqueCandidates(identifiers),
    entityHints: uniqueCandidates(entityHints),
  };
}

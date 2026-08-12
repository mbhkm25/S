const ARABIC_INDIC_DIGITS: Record<string, string> = {
  '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4',
  '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
  '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4',
  '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9',
};

/**
 * Conservative OCR normalization for financial text.
 * It normalizes presentation noise but never guesses or repairs digits.
 */
export function normalizeFinancialOcrText(rawText: string): string {
  return rawText
    .normalize('NFKC')
    .replace(/[٠-٩۰-۹]/g, (digit) => ARABIC_INDIC_DIGITS[digit] ?? digit)
    .replace(/\u00a0/g, ' ')
    .replace(/[\t ]+/g, ' ')
    .replace(/\r\n?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function normalizeCandidateToken(value: string): string {
  return normalizeFinancialOcrText(value)
    .replace(/[،]/g, ',')
    .replace(/[٫]/g, '.')
    .trim();
}

export function digitsOnly(value: string): string {
  return normalizeCandidateToken(value).replace(/\D/g, '');
}

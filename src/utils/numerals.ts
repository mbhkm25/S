/**
 * Convert Eastern Arabic (Arabic-Indic) and Persian digits to standard Western/Latin digits.
 * Safely handles string, number, null, undefined, Date, or mixed text.
 */
export function toLatinDigits(value: unknown): string {
  if (value === null || value === undefined) return '';
  
  let str = '';
  if (value instanceof Date) {
    str = value.toISOString();
  } else {
    str = String(value);
  }

  // Convert Arabic-Indic digits (٠-٩) and Persian digits (۰-۹) to standard Latin digits (0-9)
  return str
    .replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 1632))
    .replace(/[۰-۹]/g, d => String(d.charCodeAt(0) - 1776));
}

// English-number formatter for Latin numerals
const latinNumberFormatter = new Intl.NumberFormat('en-US', {
  numberingSystem: 'latn'
});

export function formatNumberLatin(val: number | string | null | undefined): string {
  if (val === null || val === undefined || val === '') return '';
  const num = typeof val === 'number' ? val : parseFloat(toLatinDigits(val));
  if (isNaN(num)) return '';
  return toLatinDigits(latinNumberFormatter.format(num));
}

export function formatCurrencyLatin(val: number | string | null | undefined, currency: string): string {
  const formattedNum = formatNumberLatin(val);
  if (!formattedNum) return '';
  return `${formattedNum} ${toLatinDigits(currency)}`;
}

export function formatPercentLatin(val: number | string | null | undefined): string {
  if (val === null || val === undefined || val === '') return '';
  const num = typeof val === 'number' ? val : parseFloat(toLatinDigits(val));
  if (isNaN(num)) return '';
  return `${toLatinDigits(num)}%`;
}

// Formats date using Yemen timezone and Latin numerals
export function formatYemenDate(dateStr: string | Date | null | undefined): string {
  if (!dateStr) return '';
  const date = dateStr instanceof Date ? dateStr : new Date(dateStr);
  if (isNaN(date.getTime())) return '';
  try {
    const formatted = new Intl.DateTimeFormat('ar-YE-u-nu-latn', {
      timeZone: 'Asia/Aden',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      numberingSystem: 'latn'
    }).format(date);
    return toLatinDigits(formatted);
  } catch (e) {
    return toLatinDigits(date.toLocaleDateString('ar-YE'));
  }
}

// Formats time using Yemen timezone and Latin numerals
export function formatYemenTime(dateStr: string | Date | null | undefined): string {
  if (!dateStr) return '';
  const date = dateStr instanceof Date ? dateStr : new Date(dateStr);
  if (isNaN(date.getTime())) return '';
  try {
    const formatted = new Intl.DateTimeFormat('ar-YE-u-nu-latn', {
      timeZone: 'Asia/Aden',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      numberingSystem: 'latn'
    }).format(date);
    return toLatinDigits(formatted);
  } catch (e) {
    return toLatinDigits(date.toLocaleTimeString('ar-YE'));
  }
}

// Development-only check utility to assert no Eastern digits remain in text
export function checkNoEasternDigits(text: string): boolean {
  if (import.meta.env.DEV) {
    const easternRegex = /[٠-٩۰-۹]/;
    if (easternRegex.test(text)) {
      console.warn(`[Numerals Warning] Eastern/Persian numerals detected in: "${text}"`);
      return false;
    }
  }
  return true;
}

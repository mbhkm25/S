const ARABIC_INDIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";
const EASTERN_ARABIC_DIGITS = "۰۱۲۳۴۵۶۷۸۹";

export function toLatinDigits(value: string): string {
  return value
    .replace(/[٠-٩]/g, (digit) => String(ARABIC_INDIC_DIGITS.indexOf(digit)))
    .replace(/[۰-۹]/g, (digit) => String(EASTERN_ARABIC_DIGITS.indexOf(digit)));
}

export function normalizeArabicFinancialText(value: string): string {
  return toLatinDigits(value)
    .normalize("NFKC")
    .replace(/[ـ]/g, "")
    .replace(/[\u200B-\u200F\u202A-\u202E\u2066-\u2069]/g, "")
    .replace(/([0-9]{1,2})[!؛](?=[0-9]{2}\s*(?:AM|PM)\b)/gi, "$1:")
    .replace(/[：]/g, ":")
    .replace(/[!]/g, " : ")
    .replace(/\s*#\s*/g, "#")
    .replace(/\s*\/\s*/g, "/")
    .replace(/\s*-\s*/g, "-")
    .replace(/([0-9]+-[0-9]{6,})\s*المرجع\s*:/gu, "المرجع : $1")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeArabicName(value: string): string {
  return value
    .replace(/\s+/g, " ")
    .replace(/\s*[-–—]\s*$/g, "")
    .trim();
}

export function parseAmountText(value: string): number | undefined {
  const numeric = Number(value.replace(/,/g, "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : undefined;
}

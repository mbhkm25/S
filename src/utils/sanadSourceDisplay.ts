// UI-only formatting: preserve source digits and distinguish trustworthy dates from raw strings.
// Never use these labels to change the canonical amount, timezone or source currency.
export function formatSanadSourceAmount(
  amount: number | string | null | undefined,
  currency?: string | null,
): { text: string; valid: boolean; currency: string | null } {
  if (amount === null || amount === undefined || amount === '') return { text: '—', valid: false, currency: null };
  const raw = String(amount).trim();
  const normalized = raw.replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x660))
    .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 0x6f0));
  const code = currency?.toUpperCase().trim() || '';
  const safeCurrency = /^[A-Z]{3}$/.test(code) ? code : null;
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(normalized);
  if (!match) return { text: raw, valid: false, currency: safeCurrency };
  const [, sign, integer, fraction = ''] = match;
  // Do not parse via Number/Intl: large ERP source decimals may lose exact digits.
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  let isoDigits = 0;
  if (safeCurrency) {
    try {
      isoDigits = new Intl.NumberFormat('en-US', { style: 'currency', currency: safeCurrency })
        .resolvedOptions().minimumFractionDigits;
    } catch {
      isoDigits = 0; // Unknown ISO code: retain the raw fractional digits.
    }
  }
  const shownFraction = fraction.padEnd(Math.max(fraction.length, isoDigits), '0');
  return { text: `${sign}${grouped}${shownFraction ? '.' + shownFraction : ''}`, valid: true, currency: safeCurrency };
}

export function formatSanadSourceDate(value?: string | null): { text: string; valid: boolean } {
  if (!value) return { text: '—', valid: false };
  const raw = value.trim();
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (dateOnly) {
    const year = Number(dateOnly[1]), month = Number(dateOnly[2]), day = Number(dateOnly[3]);
    const time = new Date(Date.UTC(year, month - 1, day));
    const exact = time.getUTCFullYear() === year && time.getUTCMonth() + 1 === month && time.getUTCDate() === day;
    return exact
      ? { text: new Intl.DateTimeFormat('ar-YE-u-nu-latn', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' }).format(time), valid: true }
      : { text: raw, valid: false };
  }
  // Timezone-less timestamps cannot be silently assigned Yemen or ERP time.
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(raw)) {
    return { text: raw, valid: false };
  }
  // JavaScript may normalize impossible calendar dates (e.g. February 30).
  const [y, m, d] = raw.slice(0, 10).split('-').map(Number);
  const calendar = new Date(Date.UTC(y, m - 1, d));
  if (calendar.getUTCFullYear() !== y || calendar.getUTCMonth() + 1 !== m || calendar.getUTCDate() !== d) {
    return { text: raw, valid: false };
  }
  const parsed = new Date(raw);
  if (!Number.isFinite(parsed.getTime())) return { text: raw, valid: false };
  const formatted = new Intl.DateTimeFormat('ar-YE-u-nu-latn', {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    hour12: false, timeZone: 'Asia/Aden',
  }).format(parsed);
  return { text: formatted, valid: true };
}

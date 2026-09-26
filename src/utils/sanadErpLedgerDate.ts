/**
 * Edaa's tblEntries.TheDate is a timezone-less ERP civil timestamp.
 * Render its calendar date without converting it through the viewer's timezone.
 * This is display only: preserve raw source fields and never infer a time zone.
 */
export function formatSanadErpLedgerDate(value?: string | null): { text: string; valid: boolean } {
  if (!value) return { text: '—', valid: false };
  const raw = value.trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?)?$/.exec(raw);
  if (!match) return { text: raw, valid: false };
  if (match[4] && (Number(match[4]) > 23 || Number(match[5]) > 59 || Number(match[6]) > 59)) {
    return { text: raw, valid: false };
  }
  const [year, month, day] = match.slice(1,4).map(Number);
  const instant = new Date(Date.UTC(year, month - 1, day));
  const valid = year >= 100 && instant.getUTCFullYear() === year &&
    instant.getUTCMonth() + 1 === month && instant.getUTCDate() === day;
  if (!valid) return { text: raw, valid: false };
  return {
    text: new Intl.DateTimeFormat('ar-YE-u-nu-latn', {
      year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC',
    }).format(instant),
    valid: true,
  };
}

import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';

const target = 'supabase/functions/sanad-v3-analyze-operation/index.ts';
let source = readFileSync(target, 'utf8');

function replaceRequired(oldValue, newValue, label) {
  if (source.includes(newValue)) return;
  if (!source.includes(oldValue)) throw new Error(`Missing analyzer anchor: ${label}`);
  source = source.replace(oldValue, newValue);
}

replaceRequired(
`function normalizeTransactionDatetime(value: unknown): string | null {
  const text = cleanTextOrNull(toLatinDigits(value));
  if (!text) return null;

  // Postgres timestamptz accepts ISO-like strings.
  // Avoid patch failure by only keeping date-like values.
  if (/^\\d{4}-\\d{2}-\\d{2}/.test(text)) return text;

  return null;
}`,
`function normalizeTransactionDatetime(value: unknown): string | null {
  const text = cleanTextOrNull(toLatinDigits(value));
  if (!text) return null;
  if (/^\\d{4}-\\d{2}-\\d{2}/.test(text)) return text;
  return null;
}

function normalizeTransactionDateSource(value: unknown): string {
  const source = cleanTextOrNull(value)?.toLowerCase();
  const allowed = new Set([
    "labeled_date",
    "single_detected_date",
    "explicit_datetime",
    "document_time",
    "unknown",
  ]);
  return source && allowed.has(source) ? source : "unknown";
}

function normalizeTemporalFields(extracted: any) {
  const transactionDatetime = normalizeTransactionDatetime(
    extracted?.transaction_datetime,
  );
  const explicitTimeFlag = normalizeBoolean(
    extracted?.transaction_time_present,
    false,
  );
  const date = cleanTextOrNull(toLatinDigits(extracted?.transaction_date))
    ?? transactionDatetime?.match(/^(\\d{4}-\\d{2}-\\d{2})/)?.[1]
    ?? null;
  const detectedTime = transactionDatetime
    ?.match(/[T ](\\d{2}:\\d{2}(?::\\d{2})?)/)?.[1]
    ?? null;
  const requestedTime = cleanTextOrNull(toLatinDigits(extracted?.transaction_time));
  const time = explicitTimeFlag ? requestedTime ?? detectedTime : null;
  const timePresent = Boolean(explicitTimeFlag && time);
  const source = normalizeTransactionDateSource(
    extracted?.transaction_date_source,
  );

  return {
    transaction_datetime: transactionDatetime,
    transaction_date: date,
    transaction_time: timePresent ? time : null,
    transaction_time_present: timePresent,
    transaction_date_source: source,
    transaction_timezone: timePresent ? "Asia/Aden" : null,
  };
}`,
  'temporal normalizer'
);

replaceRequired(
`function normalizeExtracted(extracted: any) {
  const isFinancialDocument = normalizeBoolean(
    extracted?.is_financial_document,
    true,
  );

  const normalized = {`,
`function normalizeExtracted(extracted: any) {
  const isFinancialDocument = normalizeBoolean(
    extracted?.is_financial_document,
    true,
  );
  const temporal = normalizeTemporalFields(extracted);

  const normalized = {`,
  'temporal normalization call'
);

replaceRequired(
`    transaction_datetime: isFinancialDocument
      ? normalizeTransactionDatetime(extracted?.transaction_datetime)
      : null,

    confidence_score:`,
`    transaction_datetime: isFinancialDocument
      ? temporal.transaction_datetime
      : null,
    transaction_date: isFinancialDocument ? temporal.transaction_date : null,
    transaction_time: isFinancialDocument ? temporal.transaction_time : null,
    transaction_time_present: isFinancialDocument
      ? temporal.transaction_time_present
      : false,
    transaction_date_source: isFinancialDocument
      ? temporal.transaction_date_source
      : "unknown",
    transaction_timezone: isFinancialDocument
      ? temporal.transaction_timezone
      : null,

    confidence_score:`,
  'normalized temporal fields'
);

replaceRequired(
`  "transaction_datetime": null,
  "confidence_score": 0.0,`,
`  "transaction_datetime": null,
  "transaction_date": null,
  "transaction_time": null,
  "transaction_time_present": false,
  "transaction_date_source": "unknown",
  "transaction_timezone": null,
  "confidence_score": 0.0,`,
  'fallback response contract'
);

replaceRequired(
`       reference_number: normalized.reference_number,
       transaction_datetime: normalized.transaction_datetime,

       confidence_score:`,
`       reference_number: normalized.reference_number,
       transaction_datetime: normalized.transaction_datetime,
       transaction_date: normalized.transaction_date,
       transaction_time: normalized.transaction_time,
       transaction_time_present: normalized.transaction_time_present,
       transaction_date_source: normalized.transaction_date_source,
       transaction_timezone: normalized.transaction_timezone,
       sanad_time_check: normalized.transaction_time_present
         ? null
         : {
             status: "not_applicable",
             reason: "transaction_time_not_present",
             message: "فحص فرق الوقت غير منطبق لأن الوقت غير مذكور في الإشعار.",
           },

       confidence_score:`,
  'direct database temporal columns'
);

writeFileSync(target, source);
for (const path of [
  'scripts/apply-analyzer-temporal-contract.mjs',
  '.github/workflows/apply-analyzer-temporal-contract.yml'
]) {
  try { unlinkSync(path); } catch {}
}

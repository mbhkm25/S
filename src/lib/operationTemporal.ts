import { toLatinDigits } from '../utils/numerals';

export type OperationDateSource =
  | 'labeled_date'
  | 'single_detected_date'
  | 'explicit_datetime'
  | 'document_time'
  | 'legacy_datetime'
  | 'unknown'
  | string;

export interface OperationTemporalFields {
  transaction_date?: string | null;
  transaction_time?: string | null;
  transaction_time_present?: boolean | null;
  transaction_date_source?: OperationDateSource | null;
  transaction_timezone?: string | null;
  transaction_datetime?: string | null;
  structured_data?: Record<string, unknown> | null;
  verified_at?: string | null;
  confirmed_at?: string | null;
  created_at?: string | null;
}

export interface ResolvedOperationTemporal {
  date: string | null;
  time: string | null;
  timePresent: boolean;
  source: OperationDateSource | null;
  timezone: string | null;
  explicitDateTime: string | null;
}

export interface TimeDiscrepancyResult {
  status: 'not_applicable' | 'compatible' | 'warning' | 'invalid';
  diffMinutes: number | null;
  text: string;
  isWarning: boolean;
  isFuture: boolean;
}

function asText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function asBoolean(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return null;
}

function datePart(value: string | null): string | null {
  if (!value) return null;
  const match = value.match(/^(\d{4}-\d{2}-\d{2})/);
  return match?.[1] || null;
}

function timePart(value: string | null): string | null {
  if (!value) return null;
  const match = value.match(/[T ](\d{2}:\d{2}(?::\d{2})?)/);
  return match?.[1] || null;
}

/**
 * Resolve the wall-clock date and time printed in the financial document.
 *
 * `transaction_datetime` is a timestamptz and PostgreSQL serializes it in UTC.
 * It must never be sliced directly to obtain the displayed local time. Prefer
 * the canonical local columns, then the explicit AI datetime kept in
 * structured_data, and use the stored timestamptz only as a legacy date
 * fallback.
 */
export function resolveOperationTemporal(operation: OperationTemporalFields | null | undefined): ResolvedOperationTemporal {
  const structured = operation?.structured_data || {};
  const canonicalDate = asText(operation?.transaction_date);
  const canonicalTime = asText(operation?.transaction_time);
  const structuredDate = asText(structured.transaction_date);
  const structuredTime = asText(structured.transaction_time);
  const structuredDateTime = asText(structured.transaction_datetime);
  const storedDateTime = asText(operation?.transaction_datetime);

  const explicitFlag = asBoolean(operation?.transaction_time_present)
    ?? asBoolean(structured.transaction_time_present)
    ?? false;

  const date = canonicalDate
    || structuredDate
    || datePart(structuredDateTime)
    || datePart(storedDateTime);

  const time = explicitFlag
    ? canonicalTime
      || structuredTime
      || timePart(structuredDateTime)
    : null;

  const timePresent = Boolean(explicitFlag && time);
  const source = asText(operation?.transaction_date_source)
    || asText(structured.transaction_date_source)
    || (date ? 'legacy_datetime' : null);
  const timezone = timePresent
    ? asText(operation?.transaction_timezone)
      || asText(structured.transaction_timezone)
      || 'Asia/Aden'
    : null;

  let explicitDateTime: string | null = null;
  if (date && timePresent && time) {
    const normalizedTime = time.length === 5 ? `${time}:00` : time;
    explicitDateTime = `${date}T${normalizedTime}${timezone === 'Asia/Aden' ? '+03:00' : ''}`;
  }

  return { date, time, timePresent, source, timezone, explicitDateTime };
}

export function formatOperationDate(date: string | null): string {
  if (!date) return 'التاريخ غير مذكور في الإشعار';
  const parsed = new Date(`${date}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return toLatinDigits(date);
  return toLatinDigits(new Intl.DateTimeFormat('ar-YE', {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC'
  }).format(parsed));
}

export function formatOperationTime(time: string | null): string | null {
  if (!time) return null;
  const match = time.match(/^(\d{2}):(\d{2})/);
  if (!match) return toLatinDigits(time);
  const hours = Number(match[1]);
  const minutes = match[2];
  const normalizedHours = hours % 12 || 12;
  const period = hours < 12 ? 'ص' : 'م';
  return toLatinDigits(`${normalizedHours}:${minutes} ${period}`);
}

export function formatOperationTemporalLabel(operation: OperationTemporalFields | null | undefined): string {
  const temporal = resolveOperationTemporal(operation);
  const dateLabel = formatOperationDate(temporal.date);
  const timeLabel = temporal.timePresent ? formatOperationTime(temporal.time) : null;
  return timeLabel ? `${dateLabel}، ${timeLabel}` : dateLabel;
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return toLatinDigits(`${minutes} دقيقة`);
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (hours < 24) return remainder > 0
    ? toLatinDigits(`${hours} ساعة و${remainder} دقيقة`)
    : toLatinDigits(`${hours} ساعة`);
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  return remainingHours > 0
    ? toLatinDigits(`${days} يوم و${remainingHours} ساعة`)
    : toLatinDigits(`${days} يوم`);
}

export function calculateOperationTimeDiscrepancy(
  operation: OperationTemporalFields | null | undefined,
  comparisonTime: string | null | undefined,
  thresholdMinutes = 7,
): TimeDiscrepancyResult {
  const temporal = resolveOperationTemporal(operation);
  if (!temporal.timePresent || !temporal.explicitDateTime) {
    return {
      status: 'not_applicable', diffMinutes: null,
      text: 'فحص فرق الوقت غير منطبق لأن الوقت غير مذكور في الإشعار.',
      isWarning: false, isFuture: false,
    };
  }
  if (!comparisonTime) {
    return {
      status: 'invalid', diffMinutes: null, text: 'وقت المقارنة غير متوفر.',
      isWarning: false, isFuture: false,
    };
  }
  const transactionDate = new Date(temporal.explicitDateTime);
  const comparisonDate = new Date(comparisonTime);
  if (Number.isNaN(transactionDate.getTime()) || Number.isNaN(comparisonDate.getTime())) {
    return {
      status: 'invalid', diffMinutes: null, text: 'تعذر تفسير وقت العملية.',
      isWarning: false, isFuture: false,
    };
  }
  const diffMs = transactionDate.getTime() - comparisonDate.getTime();
  const diffMinutes = Math.floor(Math.abs(diffMs) / 60_000);
  if (diffMinutes <= thresholdMinutes) {
    return { status: 'compatible', diffMinutes, text: 'الوقت متوافق', isWarning: false, isFuture: false };
  }
  const isFuture = diffMs > 0;
  const duration = formatDuration(diffMinutes);
  return {
    status: 'warning', diffMinutes,
    text: isFuture
      ? `وقت العملية المسجل بعد وقت التحقق بـ ${duration}`
      : `تمت العملية قبل التحقق بـ ${duration}`,
    isWarning: true, isFuture,
  };
}

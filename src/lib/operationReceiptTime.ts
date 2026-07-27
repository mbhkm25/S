const YEMEN_TIMEZONE = 'Asia/Aden';

const dateTimeFormatter = new Intl.DateTimeFormat('ar-YE', {
  timeZone: YEMEN_TIMEZONE,
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true
});

export function resolveOperationReceivedAt(operation: any): string | null {
  const value = operation?.received_at ?? operation?.created_at ?? null;
  if (!value) return null;

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export function formatOperationReceivedAt(operation: any): string | null {
  const value = resolveOperationReceivedAt(operation);
  if (!value) return null;
  return dateTimeFormatter.format(new Date(value));
}

export function getOperationReceivedTimezone(operation: any): string {
  return operation?.received_timezone === YEMEN_TIMEZONE
    ? operation.received_timezone
    : YEMEN_TIMEZONE;
}

export { YEMEN_TIMEZONE };

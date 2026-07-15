/**
 * Convert Eastern Arabic (Arabic-Indic) and Persian digits to standard Western/Latin digits.
 * Example: '١٢٣' -> '123', '۱۲۳' -> '123'
 */
export function toLatinDigits(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  return str
    .replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 1632))
    .replace(/[۰-۹]/g, d => String(d.charCodeAt(0) - 1776));
}

/**
 * Parse and normalize a Yemeni phone number to the local 9-digit format (e.g. 777634971).
 * Accepts various input formats (with or without country codes/prefixes, in Arabic/Persian/Latin digits).
 */
export function parseYemeniLocalPhone(input: string): string {
  // 1. Convert all digits to Latin digits
  let normalized = toLatinDigits(input);

  // 2. Remove all non-numeric characters
  let digits = normalized.replace(/\D/g, '');

  // 3. Extract the local 9-digit Yemeni part
  if (digits.startsWith('00967')) {
    digits = digits.substring(5);
  } else if (digits.startsWith('967')) {
    digits = digits.substring(3);
  } else if (digits.startsWith('0')) {
    digits = digits.substring(1);
  }

  return digits;
}

/**
 * Format a phone number (such as 967777634971 or 777634971) to +967 XXX XXX XXX for display.
 */
export function formatYemeniDisplay(phone: string | null | undefined): string {
  if (!phone) return '';
  
  // Clean and parse to the 9-digit local part
  const local = parseYemeniLocalPhone(phone);
  
  if (local.length === 9) {
    return `+967 ${local.substring(0, 3)} ${local.substring(3, 6)} ${local.substring(6, 9)}`;
  }
  return `+967 ${local}`;
}

/**
 * Format date securely using Arabic locale but forcing Latin numerals.
 */
export function formatArabicDate(dateString: string | Date | null | undefined): string {
  if (!dateString) return '';
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return '';
  
  try {
    // ar-EG-u-nu-latn enforces Latin digits natively
    const formatted = date.toLocaleDateString('ar-EG-u-nu-latn', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
    return toLatinDigits(formatted);
  } catch (e) {
    // Fallback if BCP47 Unicode extensions are not supported
    return toLatinDigits(date.toLocaleDateString('ar-SA'));
  }
}

/**
 * Format time securely using Arabic locale but forcing Latin numerals.
 */
export function formatArabicTime(dateString: string | Date | null | undefined): string {
  if (!dateString) return '';
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return '';
  
  try {
    const formatted = date.toLocaleTimeString('ar-EG-u-nu-latn', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
    return toLatinDigits(formatted);
  } catch (e) {
    return toLatinDigits(date.toLocaleTimeString('ar-SA'));
  }
}

export interface OperationDisplayInfo {
  title: string;
  amount: string | null;
  entity: string | null;
  refNum: string | null;
  dateStr: string;
  timeStr: string;
}

export function getOperationCardDetails(item: any): OperationDisplayInfo {
  if (!item) {
    return {
      title: 'إشعار مالي',
      amount: null,
      entity: null,
      refNum: null,
      dateStr: '',
      timeStr: ''
    };
  }

  // Retrieve structured data from various possible database fields
  const sData = item.structured_data || item.raw_ai_json || item.client_upload_metadata || {};
  
  const receiver = item.receiver_name || sData.receiver_name || null;
  const sender = sData.sender_name || item.client_upload_metadata?.sender_name || null;
  const entity = item.financial_entity || sData.financial_entity || item.client_upload_metadata?.financial_entity || null;
  const ref = item.reference_number || sData.reference_number || item.client_upload_metadata?.reference_number || null;
  
  const rawAmt = item.amount && item.currency 
    ? `${item.amount} ${item.currency}`
    : sData.amount && sData.currency 
      ? `${sData.amount} ${sData.currency}`
      : item.amount || sData.amount || item.client_upload_metadata?.amount || null;

  const amount = rawAmt ? toLatinDigits(rawAmt) : null;
  const refNum = ref ? toLatinDigits(ref) : null;

  let title = '';
  if (receiver && sender) {
    title = `حوالة من ${sender} إلى ${receiver}`;
  } else if (receiver) {
    title = `إشعار استلام لـ ${receiver}`;
  } else if (sender) {
    title = `إشعار إرسال من ${sender}`;
  } else if (entity) {
    title = `إشعار مالي: ${entity}`;
  } else if (refNum) {
    title = `عملية رقم ${refNum}`;
  } else {
    let cleanName = item.file_original_name || '';
    if (cleanName) {
      // Remove file extensions
      cleanName = cleanName.replace(/\.[^/.]+$/, "");
    }
    title = cleanName || 'إشعار مالي قيد التحليل';
  }

  // Format dates and times securely using standard Latin digits
  const dateStr = formatArabicDate(item.created_at);
  const timeStr = formatArabicTime(item.created_at);

  return {
    title,
    amount,
    entity: entity ? String(entity) : null,
    refNum: refNum ? String(refNum) : null,
    dateStr,
    timeStr
  };
}

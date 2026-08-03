import { toLatinDigits } from '../utils/numerals';
export { toLatinDigits };

/**
 * Parse and normalize a Yemeni phone number to the local 9-digit format (e.g. 777634971).
 * Accepts various input formats (with or without country codes/prefixes, in Arabic/Persian/Latin digits).
 */
export function parseYemeniLocalPhone(input: string): string {
  let normalized = toLatinDigits(input);
  let digits = normalized.replace(/\D/g, '');
  if (digits.startsWith('00967')) digits = digits.substring(5);
  else if (digits.startsWith('967')) digits = digits.substring(3);
  else if (digits.startsWith('0')) digits = digits.substring(1);
  return digits;
}

export function formatYemeniDisplay(phone: string | null | undefined): string {
  if (!phone) return '';
  const local = parseYemeniLocalPhone(phone);
  if (local.length === 9) {
    return `+967 ${local.substring(0, 3)} ${local.substring(3, 6)} ${local.substring(6, 9)}`;
  }
  return `+967 ${local}`;
}

export function formatArabicDate(dateString: string | Date | null | undefined): string {
  if (!dateString) return '';
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return '';
  try {
    const formatted = date.toLocaleDateString('ar-EG-u-nu-latn', {
      year: 'numeric', month: 'long', day: 'numeric', numberingSystem: 'latn'
    });
    return toLatinDigits(formatted);
  } catch {
    return toLatinDigits(date.toLocaleDateString('ar-SA-u-nu-latn', { numberingSystem: 'latn' }));
  }
}

export function formatArabicTime(dateString: string | Date | null | undefined): string {
  if (!dateString) return '';
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return '';
  try {
    const formatted = date.toLocaleTimeString('ar-EG-u-nu-latn', {
      hour: '2-digit', minute: '2-digit', hour12: true, numberingSystem: 'latn'
    });
    return toLatinDigits(formatted);
  } catch {
    return toLatinDigits(date.toLocaleTimeString('ar-SA-u-nu-latn', { numberingSystem: 'latn' }));
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
    return { title: 'إشعار مالي', amount: null, entity: null, refNum: null, dateStr: '', timeStr: '' };
  }

  const sData = item.structured_data || item.raw_ai_json || item.client_upload_metadata || {};
  const identity = item.identity_projection || item.operation_identity || {};
  const resolvedBusinessName = item.resolved_business_name || identity.resolved_business_name || null;
  const identitySource = item.identity_source || identity.identity_source || null;
  const receiver = item.receiver_name || sData.receiver_name || identity.raw_receiver_name || null;
  const sender = item.sender_name || sData.sender_name || item.client_upload_metadata?.sender_name || null;
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
  if (resolvedBusinessName && identitySource === 'linked_business') {
    title = `عملية لدى ${resolvedBusinessName}`;
  } else if (resolvedBusinessName && identitySource === 'exact_identifier_match') {
    title = `عملية مطابقة لحساب ${resolvedBusinessName}`;
  } else if (receiver && sender) {
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
    if (cleanName) cleanName = cleanName.replace(/\.[^/.]+$/, '');
    title = cleanName || 'إشعار مالي قيد التحليل';
  }

  return {
    title,
    amount,
    entity: entity ? String(entity) : null,
    refNum: refNum ? String(refNum) : null,
    dateStr: formatArabicDate(item.created_at),
    timeStr: formatArabicTime(item.created_at)
  };
}

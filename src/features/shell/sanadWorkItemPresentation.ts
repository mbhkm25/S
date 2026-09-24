import { formatSanadSourceAmount } from '../../utils/sanadSourceDisplay';

// Only use fields returned by the authenticated, recipient-scoped Work Item RPC.
// Do not join arbitrary businesses, parties or ERP rows in the browser.
export type SanadWorkItemDisplayInput = {
  id: string;
  source_id: string;
  source_type: string;
  item_kind: string;
  status: string;
  business_id?: string | null;
  metadata?: Record<string, unknown> | null;
};

function field(obj: Record<string, unknown>, key: string): string | null {
  const value = obj[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function describeSanadWorkItem(item: SanadWorkItemDisplayInput) {
  const source: Record<string, string> = {
    business_payment_inbox: 'وارد المدفوعات',
    sanad_agent_action: 'إجراء سند',
  };
  const states: Record<string, string> = {
    open: 'مفتوح',
    in_progress: 'قيد المعالجة',
    done: 'مكتمل',
    cancelled: 'ملغى',
  };
  const metadata = item.metadata || {};
  const sourceLabel = source[item.source_type] || 'عنصر عمل من المصدر';
  const statusLabel = states[item.status] || 'حالة غير مصنفة';
  // Keep the full canonical source ID available on hover; abbreviated text is
  // display-only and not a substitute for the unique item.id React key.
  const rawRef = field(metadata, 'reference_number') || field(metadata, 'document_number') || item.source_id || item.id;
  const reference = /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(rawRef) ? rawRef.slice(0, 8) : rawRef;
  const party = field(metadata, 'party_name');
  const business = field(metadata, 'business_name')
    || (item.business_id ? `نشاط ${item.business_id.slice(0, 8)}` : null);
  const amountValue = metadata.amount;
  const currency = field(metadata, 'currency');
  const amount = (typeof amountValue === 'number' || typeof amountValue === 'string') && currency
    ? formatSanadSourceAmount(amountValue, currency)
    : null;
  const money = amount?.valid && amount.currency ? `${amount.text} ${amount.currency}` : null;
  const details = [party, business, money].filter((part): part is string => Boolean(part));
  const incomplete = item.source_type === 'business_payment_inbox' && !party && !money;
  return { sourceLabel, statusLabel, reference, rawRef, details, incomplete };
}

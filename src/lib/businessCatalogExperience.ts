import { toLatinDigits } from './digits';
import { buildPublicBusinessUrl } from './urlUtils';

export type CatalogCardStyle = 'modern' | 'compact' | 'visual';
export type CatalogCardEffect = 'none' | 'spotlight' | 'glow';
export type CatalogPriceDisplay = 'compact' | 'full' | 'code';

export type CatalogDisplaySettings = {
  ordering_enabled: boolean;
  add_button_label: string;
  send_button_label: string;
  whatsapp_message_intro: string;
  require_customer_name: boolean;
  require_address: boolean;
  allow_item_notes: boolean;
  show_total: boolean;
  show_prices: boolean;
  show_direct_whatsapp: boolean;
  max_item_quantity: number;
  price_display: CatalogPriceDisplay;
  missing_price_label: string;
  card_style: CatalogCardStyle;
  card_effect: CatalogCardEffect;
  featured_section_title: string | null;
};

export type DeliveryServiceSettings = {
  is_delivery_provider: boolean;
  customer_delivery_enabled: boolean;
  service_areas: string[];
  delivery_types: string[];
  pricing_note: string | null;
  availability_note: string | null;
  share_order_total: boolean;
  require_customer_address: boolean;
  require_privacy_consent: boolean;
};

export type PublicDeliveryProvider = {
  id: string;
  name: string;
  slug: string;
  display_tagline?: string | null;
  description?: string | null;
  governorate: string;
  city: string;
  whatsapp: string;
  logo_path?: string | null;
  profile_image_path?: string | null;
  verification_status?: string | null;
  service_areas: string[];
  delivery_types: string[];
  pricing_note?: string | null;
  availability_note?: string | null;
};

export type CatalogCartItem = {
  id: string;
  title: string;
  quantity: number;
  price: number | null;
  currency: string | null;
  note?: string;
};

export type CatalogCustomerDetails = {
  name?: string;
  phone?: string;
  area?: string;
  address?: string;
  note?: string;
  paymentMethod?: 'unspecified' | 'paid' | 'cash_on_delivery';
};

export type CatalogOrderContext = {
  reference: string;
  businessId: string;
  businessName: string;
  businessSlug: string;
  businessWhatsapp: string;
  businessAddress?: string | null;
  items: CatalogCartItem[];
  customer: CatalogCustomerDetails;
};

export const DEFAULT_CATALOG_DISPLAY_SETTINGS: CatalogDisplaySettings = {
  ordering_enabled: true,
  add_button_label: 'أضف للطلب',
  send_button_label: 'إرسال الطلب عبر واتساب',
  whatsapp_message_intro: 'مرحبًا، أريد طلب العناصر التالية:',
  require_customer_name: false,
  require_address: false,
  allow_item_notes: true,
  show_total: true,
  show_prices: true,
  show_direct_whatsapp: false,
  max_item_quantity: 20,
  price_display: 'compact',
  missing_price_label: 'السعر عند الطلب',
  card_style: 'modern',
  card_effect: 'spotlight',
  featured_section_title: null
};

export const DEFAULT_DELIVERY_SERVICE_SETTINGS: DeliveryServiceSettings = {
  is_delivery_provider: false,
  customer_delivery_enabled: false,
  service_areas: [],
  delivery_types: [],
  pricing_note: null,
  availability_note: null,
  share_order_total: true,
  require_customer_address: true,
  require_privacy_consent: true
};

const CURRENCY_LABELS: Record<string, { compact: string; full: string }> = {
  YER: { compact: 'ر.ي', full: 'ريال يمني' },
  SAR: { compact: 'ر.س', full: 'ريال سعودي' },
  USD: { compact: '$', full: 'دولار أمريكي' }
};

function cleanPhone(value: string | null | undefined): string {
  return toLatinDigits(value || '').replace(/\D/g, '');
}

function cleanLine(value: string | null | undefined, max = 240): string {
  return String(value || '').replace(/[\r\n]+/g, ' ').trim().slice(0, max);
}

export function normalizeCatalogSettings(value: unknown): CatalogDisplaySettings {
  const raw = value && typeof value === 'object' ? value as Partial<CatalogDisplaySettings> : {};
  return {
    ...DEFAULT_CATALOG_DISPLAY_SETTINGS,
    ...raw,
    max_item_quantity: Math.max(1, Math.min(Number(raw.max_item_quantity) || 20, 99)),
    featured_section_title: cleanLine(raw.featured_section_title, 80) || null
  };
}

export function normalizeDeliverySettings(value: unknown): DeliveryServiceSettings {
  const raw = value && typeof value === 'object' ? value as Partial<DeliveryServiceSettings> : {};
  return {
    ...DEFAULT_DELIVERY_SERVICE_SETTINGS,
    ...raw,
    service_areas: Array.isArray(raw.service_areas) ? raw.service_areas.map(x => cleanLine(x, 80)).filter(Boolean).slice(0, 30) : [],
    delivery_types: Array.isArray(raw.delivery_types) ? raw.delivery_types.map(x => cleanLine(x, 80)).filter(Boolean).slice(0, 12) : [],
    pricing_note: cleanLine(raw.pricing_note) || null,
    availability_note: cleanLine(raw.availability_note) || null
  };
}

export function formatCatalogPrice(
  amount: number | null | undefined,
  currency: string | null | undefined,
  display: CatalogPriceDisplay,
  missingLabel = 'السعر عند الطلب'
): string {
  if (amount == null || !Number.isFinite(Number(amount))) return missingLabel;
  const code = String(currency || '').toUpperCase();
  const formatted = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(Number(amount));
  if (!code) return formatted;
  const labels = CURRENCY_LABELS[code];
  if (display === 'code' || !labels) return `${formatted} ${code}`;
  if (display === 'full') return `${formatted} ${labels.full}`;
  return code === 'USD' ? `${labels.compact}${formatted}` : `${formatted} ${labels.compact}`;
}

export function cartStorageKey(businessId: string): string {
  return `sanad.businessCart.${businessId}`;
}

export function readCatalogCart(businessId: string): CatalogCartItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(cartStorageKey(businessId)) || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(item => item && typeof item.id === 'string' && typeof item.title === 'string')
      .map(item => ({
        id: item.id,
        title: cleanLine(item.title, 140),
        quantity: Math.max(1, Math.min(Number(item.quantity) || 1, 99)),
        price: item.price == null ? null : Number(item.price),
        currency: item.currency ? String(item.currency).toUpperCase() : null,
        note: cleanLine(item.note, 180) || undefined
      }));
  } catch {
    return [];
  }
}

export function writeCatalogCart(businessId: string, items: CatalogCartItem[]): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(cartStorageKey(businessId), JSON.stringify(items.slice(0, 40)));
}

export function upsertCartItem(
  items: CatalogCartItem[],
  incoming: Omit<CatalogCartItem, 'quantity'> & { quantity?: number },
  maxQuantity = 20
): CatalogCartItem[] {
  const quantity = Math.max(1, Math.min(incoming.quantity || 1, maxQuantity));
  const existing = items.find(item => item.id === incoming.id);
  if (!existing) return [...items, { ...incoming, quantity }];
  return items.map(item => item.id === incoming.id
    ? { ...item, ...incoming, quantity: Math.min(item.quantity + quantity, maxQuantity) }
    : item);
}

export function cartTotals(items: CatalogCartItem[]): Record<string, number> {
  return items.reduce<Record<string, number>>((totals, item) => {
    if (item.price == null || !item.currency) return totals;
    const code = item.currency.toUpperCase();
    totals[code] = (totals[code] || 0) + item.price * item.quantity;
    return totals;
  }, {});
}

export function createOrderReference(prefix = 'SND-ORD'): string {
  const time = Date.now().toString(36).toUpperCase().slice(-5);
  const random = Math.random().toString(36).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(2, 5);
  return `${prefix}-${time}${random}`;
}

function appendOrderItems(lines: string[], context: CatalogOrderContext, settings: CatalogDisplaySettings): void {
  lines.push('تفاصيل الطلب:');
  context.items.forEach((item, index) => {
    const price = settings.show_prices
      ? ` — ${formatCatalogPrice(item.price, item.currency, settings.price_display, settings.missing_price_label)}`
      : '';
    lines.push(`${index + 1}. ${cleanLine(item.title, 140)} × ${item.quantity}${price}`);
    if (settings.allow_item_notes && item.note) lines.push(`   ملاحظة: ${cleanLine(item.note, 180)}`);
  });
}

function appendOrderTotals(lines: string[], context: CatalogOrderContext, settings: CatalogDisplaySettings): void {
  if (!settings.show_total) return;
  const totals = cartTotals(context.items);
  if (!Object.keys(totals).length) return;
  lines.push('', 'الإجمالي:');
  Object.entries(totals).forEach(([currency, total]) => {
    lines.push(`- ${formatCatalogPrice(total, currency, settings.price_display, settings.missing_price_label)}`);
  });
}

function appendCustomerDetails(lines: string[], customer: CatalogCustomerDetails): void {
  if (!customer.name && !customer.phone && !customer.area && !customer.address && !customer.note && !customer.paymentMethod) return;
  lines.push('', 'بيانات العميل:');
  if (customer.name) lines.push(`الاسم: ${cleanLine(customer.name, 100)}`);
  if (customer.phone) lines.push(`رقم التواصل: ${cleanPhone(customer.phone)}`);
  if (customer.area) lines.push(`المنطقة: ${cleanLine(customer.area, 100)}`);
  if (customer.address) lines.push(`العنوان: ${cleanLine(customer.address, 240)}`);
  if (customer.paymentMethod === 'paid') lines.push('حالة الدفع: مدفوع');
  if (customer.paymentMethod === 'cash_on_delivery') lines.push('حالة الدفع: الدفع عند الاستلام');
  if (customer.note) lines.push(`ملاحظات عامة: ${cleanLine(customer.note, 240)}`);
}

function finalizeMessage(lines: string[]): string {
  return lines.filter((line, index, all) => line !== '' || all[index - 1] !== '').join('\n').slice(0, 3500);
}

export function buildMerchantWhatsAppMessage(
  context: CatalogOrderContext,
  settings: CatalogDisplaySettings
): string {
  const lines = [
    cleanLine(settings.whatsapp_message_intro, 240),
    '',
    `مرجع الطلب: ${context.reference}`,
    `النشاط: ${cleanLine(context.businessName, 140)}`,
    `رابط النشاط: ${buildPublicBusinessUrl(context.businessSlug)}`,
    ''
  ];
  appendOrderItems(lines, context, settings);
  appendOrderTotals(lines, context, settings);
  appendCustomerDetails(lines, context.customer);
  return finalizeMessage(lines);
}

export function buildDeliveryWhatsAppMessage(
  context: CatalogOrderContext,
  provider: PublicDeliveryProvider,
  catalogSettings: CatalogDisplaySettings,
  deliverySettings: DeliveryServiceSettings
): string {
  const lines = [
    'مرحبًا، أريد طلب خدمة توصيل للطلب التالي:',
    '',
    `مرجع الطلب: ${context.reference}`,
    `شركة التوصيل المختارة: ${cleanLine(provider.name, 140)}`,
    '',
    'بيانات الاستلام من المتجر:',
    `اسم المتجر: ${cleanLine(context.businessName, 140)}`,
    `رقم المتجر: ${cleanPhone(context.businessWhatsapp)}`,
    `رابط المتجر: ${buildPublicBusinessUrl(context.businessSlug)}`
  ];
  if (context.businessAddress) lines.push(`عنوان المتجر: ${cleanLine(context.businessAddress, 240)}`);
  lines.push('');
  appendOrderItems(lines, context, catalogSettings);
  if (deliverySettings.share_order_total) appendOrderTotals(lines, context, catalogSettings);
  appendCustomerDetails(lines, context.customer);
  return finalizeMessage(lines);
}

export function openWhatsApp(phoneNumber: string, message: string): void {
  const destination = cleanPhone(phoneNumber);
  if (!destination) throw new Error('رقم واتساب غير صالح.');
  window.open(`https://wa.me/${destination}?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
}

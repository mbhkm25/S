import { supabase } from './supabase';
import { optimizeImageForUpload } from './imageOptimization';

export type BusinessCatalogItemType = 'product' | 'service' | 'digital' | 'offer' | 'subscription' | 'other';
export type BusinessCatalogItemStatus = 'draft' | 'active' | 'hidden' | 'archived';
export type BusinessCatalogAvailability = 'available' | 'on_request' | 'unavailable';
export type BusinessCatalogContactAction = 'whatsapp' | 'call' | 'none';

export const MAX_CATALOG_IMAGES = 3;

export interface BusinessCatalogItem {
  id: string;
  business_id: string;
  item_type: BusinessCatalogItemType;
  title: string;
  description: string | null;
  price: number | null;
  currency: 'YER' | 'SAR' | 'USD' | null;
  image_paths: string[];
  features: unknown[];
  status: BusinessCatalogItemStatus;
  display_order: number;
  is_featured: boolean;
  availability_status: BusinessCatalogAvailability;
  contact_action: BusinessCatalogContactAction;
  created_at: string;
  updated_at: string;
}

export interface UpsertBusinessCatalogItemInput {
  businessId: string;
  itemId?: string | null;
  itemType: BusinessCatalogItemType;
  title: string;
  description?: string | null;
  price?: number | null;
  currency?: 'YER' | 'SAR' | 'USD' | null;
  imagePaths?: string[];
  status?: BusinessCatalogItemStatus;
  displayOrder?: number;
  isFeatured?: boolean;
  availabilityStatus?: BusinessCatalogAvailability;
  contactAction?: BusinessCatalogContactAction;
}

export interface CatalogImageUploadResult {
  path: string;
  signedUrl: string;
}

function normalizeCatalogItem(value: unknown): BusinessCatalogItem | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  const id = typeof item.id === 'string' ? item.id : '';
  const businessId = typeof item.business_id === 'string' ? item.business_id : '';
  const title = typeof item.title === 'string' ? item.title.trim() : '';
  if (!id || !businessId || !title) return null;

  return {
    id,
    business_id: businessId,
    item_type: (typeof item.item_type === 'string' ? item.item_type : 'other') as BusinessCatalogItemType,
    title,
    description: typeof item.description === 'string' ? item.description : null,
    price: typeof item.price === 'number' ? item.price : item.price === null ? null : Number(item.price) || null,
    currency: (typeof item.currency === 'string' ? item.currency : null) as BusinessCatalogItem['currency'],
    image_paths: Array.isArray(item.image_paths) ? item.image_paths.filter((path): path is string => typeof path === 'string') : [],
    features: Array.isArray(item.features) ? item.features : [],
    status: (typeof item.status === 'string' ? item.status : 'draft') as BusinessCatalogItemStatus,
    display_order: Number.isFinite(Number(item.display_order)) ? Number(item.display_order) : 100,
    is_featured: item.is_featured === true,
    availability_status: (typeof item.availability_status === 'string' ? item.availability_status : 'available') as BusinessCatalogAvailability,
    contact_action: (typeof item.contact_action === 'string' ? item.contact_action : 'whatsapp') as BusinessCatalogContactAction,
    created_at: typeof item.created_at === 'string' ? item.created_at : '',
    updated_at: typeof item.updated_at === 'string' ? item.updated_at : '',
  };
}

function extractCatalogItems(data: unknown): BusinessCatalogItem[] {
  const source = Array.isArray(data)
    ? data
    : data && typeof data === 'object' && Array.isArray((data as { items?: unknown[] }).items)
      ? (data as { items: unknown[] }).items
      : [];

  return source
    .map(normalizeCatalogItem)
    .filter((item): item is BusinessCatalogItem => Boolean(item))
    .sort((a, b) => {
      if (a.is_featured !== b.is_featured) return a.is_featured ? -1 : 1;
      if (a.display_order !== b.display_order) return a.display_order - b.display_order;
      return b.created_at.localeCompare(a.created_at);
    });
}

export async function getBusinessCatalog(businessId: string, includeHidden = true): Promise<BusinessCatalogItem[]> {
  const { data, error } = await supabase.rpc('get_business_catalog', {
    p_business_id: businessId,
    p_include_hidden: includeHidden,
  });
  if (error) throw new Error(error.message || 'تعذر تحميل كتالوج النشاط.');
  return extractCatalogItems(data);
}

export async function uploadCatalogItemImage(
  businessId: string,
  selectedFile: unknown,
  displayOrder: number
): Promise<CatalogImageUploadResult> {
  const file = await optimizeImageForUpload(selectedFile, 'catalog');
  const randomPart = `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
  const path = `${businessId}/catalog/item-${randomPart}.webp`;

  const { error: uploadError } = await supabase.storage
    .from('business-media')
    .upload(path, file, { contentType: 'image/webp', cacheControl: '31536000', upsert: false });
  if (uploadError) throw new Error(uploadError.message || 'تعذر رفع صورة العنصر.');

  const { error: registerError } = await supabase.rpc('register_business_media_asset', {
    p_business_id: businessId,
    p_asset_type: 'catalog',
    p_storage_path: path,
    p_mime_type: 'image/webp',
    p_file_name: file.name.slice(0, 255),
    p_file_size: file.size,
    p_alt_text: null,
    p_display_order: Math.max(0, Math.min(displayOrder, 10000)),
  });

  if (registerError) {
    try { await supabase.storage.from('business-media').remove([path]); } catch { /* best effort */ }
    throw new Error(registerError.message || 'تعذر تسجيل صورة العنصر.');
  }

  const { data: signed, error: signedError } = await supabase.storage.from('business-media').createSignedUrl(path, 86400);
  if (signedError) throw new Error('تم رفع الصورة، لكن تعذر إنشاء معاينتها.');
  return { path, signedUrl: signed?.signedUrl || '' };
}

export async function resolveCatalogImageUrl(path: string): Promise<string> {
  if (!path) return '';
  if (/^https?:\/\//i.test(path)) return path;
  const { data, error } = await supabase.storage.from('business-media').createSignedUrl(path, 86400);
  if (error) return '';
  return data?.signedUrl || '';
}

export async function upsertBusinessCatalogItem(input: UpsertBusinessCatalogItemInput): Promise<BusinessCatalogItem> {
  const imagePaths = input.imagePaths || [];
  if (imagePaths.length > MAX_CATALOG_IMAGES) throw new Error(`الحد الأعلى هو ${MAX_CATALOG_IMAGES} صور لكل عنصر.`);
  const { data, error } = await supabase.rpc('upsert_business_catalog_item', {
    p_business_id: input.businessId,
    p_item_id: input.itemId || null,
    p_item_type: input.itemType,
    p_title: input.title.trim(),
    p_description: input.description?.trim() || null,
    p_price: input.price ?? null,
    p_currency: input.currency || null,
    p_image_paths: imagePaths,
    p_features: [],
    p_status: input.status || 'active',
    p_display_order: input.displayOrder ?? 100,
    p_is_featured: input.isFeatured ?? false,
    p_availability_status: input.availabilityStatus || 'available',
    p_contact_action: input.contactAction || 'whatsapp',
  });
  if (error) {
    if (error.message.includes('active_catalog_limit_reached')) throw new Error('وصل النشاط إلى الحد الأعلى: 10 عناصر منشورة. أخفِ عنصرًا قبل نشر عنصر جديد.');
    if (error.message.includes('catalog_image_limit_exceeded')) throw new Error(`الحد الأعلى هو ${MAX_CATALOG_IMAGES} صور لكل عنصر.`);
    throw new Error(error.message || 'تعذر حفظ عنصر الكتالوج.');
  }
  const rawItem = data && typeof data === 'object' && !Array.isArray(data) ? (data as { item?: unknown }).item : null;
  const item = normalizeCatalogItem(rawItem);
  if (!item) throw new Error('لم تُرجع قاعدة البيانات عنصرًا صالحًا بعد الحفظ.');
  return item;
}

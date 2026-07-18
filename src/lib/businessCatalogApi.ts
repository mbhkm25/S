import { supabase } from './supabase';

export type BusinessCatalogItemType = 'product' | 'service' | 'digital' | 'offer' | 'subscription' | 'other';
export type BusinessCatalogItemStatus = 'draft' | 'active' | 'hidden' | 'archived';
export type BusinessCatalogAvailability = 'available' | 'on_request' | 'unavailable';
export type BusinessCatalogContactAction = 'whatsapp' | 'call' | 'none';

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

export async function getBusinessCatalog(businessId: string, includeHidden = true): Promise<BusinessCatalogItem[]> {
  const { data, error } = await supabase.rpc('get_business_catalog', {
    p_business_id: businessId,
    p_include_hidden: includeHidden
  });
  if (error) throw new Error(error.message || 'تعذر تحميل كتالوج النشاط.');
  return Array.isArray((data as { items?: unknown[] } | null)?.items)
    ? ((data as { items: BusinessCatalogItem[] }).items || [])
    : [];
}

export async function upsertBusinessCatalogItem(input: UpsertBusinessCatalogItemInput): Promise<BusinessCatalogItem> {
  const { data, error } = await supabase.rpc('upsert_business_catalog_item', {
    p_business_id: input.businessId,
    p_item_id: input.itemId || null,
    p_item_type: input.itemType,
    p_title: input.title.trim(),
    p_description: input.description?.trim() || null,
    p_price: input.price ?? null,
    p_currency: input.currency || null,
    p_image_paths: input.imagePaths || [],
    p_features: [],
    p_status: input.status || 'active',
    p_display_order: input.displayOrder ?? 100,
    p_is_featured: input.isFeatured ?? false,
    p_availability_status: input.availabilityStatus || 'available',
    p_contact_action: input.contactAction || 'whatsapp'
  });
  if (error) {
    if (error.message.includes('active_catalog_limit_reached')) {
      throw new Error('وصل النشاط إلى الحد الأعلى: 10 عناصر منشورة. أخفِ عنصرًا قبل نشر عنصر جديد.');
    }
    throw new Error(error.message || 'تعذر حفظ عنصر الكتالوج.');
  }
  const item = (data as { item?: BusinessCatalogItem } | null)?.item;
  if (!item) throw new Error('لم تُرجع قاعدة البيانات العنصر المحفوظ.');
  return item;
}

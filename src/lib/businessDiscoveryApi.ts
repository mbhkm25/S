import { supabase } from './supabase';

export interface DiscoverableBusiness {
  id: string;
  name: string;
  slug: string;
  category_name: string | null;
  governorate: string;
  city: string;
  description: string | null;
  logo_path: string | null;
  verification_status: string | null;
  working_hours: Record<string, { open?: string; close?: string; closed?: boolean }> | null;
  catalog_count: number;
}

export interface BusinessDiscoveryFilters {
  search?: string | null;
  categoryId?: string | null;
  governorate?: string | null;
  city?: string | null;
  limit?: number;
  offset?: number;
}

function normalizeBusiness(row: any): DiscoverableBusiness {
  const rawCatalogCount = row?.catalog_count ?? row?.published_catalog_count ?? row?.items_count ?? 0;
  return {
    id: String(row?.id || ''),
    name: String(row?.name || ''),
    slug: String(row?.slug || ''),
    category_name: row?.category_name || row?.business_categories?.name_ar || row?.category?.name_ar || null,
    governorate: String(row?.governorate || ''),
    city: String(row?.city || ''),
    description: row?.description || null,
    logo_path: row?.profile_image_path || row?.logo_path || row?.logo_url || null,
    verification_status: row?.verification_status || null,
    working_hours: row?.working_hours && typeof row.working_hours === 'object' ? row.working_hours : null,
    catalog_count: Number.isFinite(Number(rawCatalogCount)) ? Number(rawCatalogCount) : 0
  };
}

export async function getDiscoverableBusinesses(filters: BusinessDiscoveryFilters = {}): Promise<DiscoverableBusiness[]> {
  const { data, error } = await supabase.rpc('get_public_businesses', {
    p_search: filters.search?.trim() || null,
    p_category_id: filters.categoryId || null,
    p_governorate: filters.governorate || null,
    p_city: filters.city?.trim() || null,
    p_limit: filters.limit ?? 20,
    p_offset: filters.offset ?? 0
  });

  if (error) throw new Error(error.message || 'تعذر تحميل الأنشطة العامة.');
  const rows = Array.isArray(data) ? data : Array.isArray((data as any)?.items) ? (data as any).items : [];
  return rows.map(normalizeBusiness).filter((item) => item.id && item.slug && item.name);
}

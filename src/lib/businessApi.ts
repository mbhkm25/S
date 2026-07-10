import { supabase } from './supabase';

export interface BusinessProfile {
  id: string;
  workspace_id?: string | null;
  workspace_status?: 'active' | 'suspended' | 'archived' | string | null;
  workspace_role?: 'owner' | 'team_member' | string | null;
  name: string;
  slug: string;
  category_id: string | null;
  governorate: string;
  city: string;
  whatsapp: string | null;
  description: string | null;
  logo_path: string | null;
  public_status: 'draft' | 'pending_review' | 'published' | 'suspended';
  verification_status: 'unverified' | 'verified';
  whatsapp_catalog_url?: string | null;
  created_at: string;
}

export interface BusinessTeamMember {
  id: string;
  business_id: string;
  user_id: string;
  role: 'owner' | 'manager' | 'cashier';
  joined_at: string;
  profile?: {
    full_name: string;
    phone: string;
  };
}

export interface BusinessInvitation {
  id: string;
  business_id: string;
  business_name?: string;
  invited_phone: string;
  role: string;
  token: string;
  status: 'pending' | 'accepted' | 'expired' | 'cancelled';
  created_at: string;
}

export interface BusinessContexts {
  owned_businesses: BusinessProfile[];
  team_businesses: (BusinessProfile & {
    team_role?: string | null;
    membership_id?: string | null;
    membership_status?: string | null;
  })[];
  customer_businesses: (BusinessProfile & {
    customer_id?: string | null;
    customer_status?: string | null;
    customer_source?: string | null;
  })[];
  pending_invitations: BusinessInvitation[];
}

export interface BusinessWorkspace {
  id: string;
  owner_user_id: string;
  name: string;
  status: 'active' | 'suspended' | 'archived';
  default_business_profile_id?: string | null;
  created_at: string;
  updated_at?: string | null;
}

export interface PublicBusinessListItem {
  id: string;
  name: string;
  slug: string;
  category_name: string | null;
  governorate: string;
  city: string;
  description: string | null;
  logo_url: string | null;
  whatsapp: string | null;
}

export interface PublicBusinessDetail {
  id: string;
  name: string;
  slug: string;
  category_name: string | null;
  governorate: string;
  city: string;
  description: string | null;
  logo_url: string | null;
  whatsapp: string | null;
  verification_status: string;
  whatsapp_catalog_url?: string | null;
  display_tagline?: string | null;
  address_text?: string | null;
  cover_image_path?: string | null;
  profile_image_path?: string | null;
  logo_path?: string | null;
  gallery_paths?: string[] | null;
  public_status?: string;
}

export interface BusinessOperationItem {
  link_id: string;
  business_id: string;
  linked_at: string;
  linked_by?: {
    id: string;
    full_name: string | null;
    phone: string | null;
  } | null;
  verified_by?: {
    id: string;
    full_name: string | null;
    phone: string | null;
  } | null;
  link_type: string;
  link_status: string;
  operation?: {
    id: string;
    public_token: string;
    created_at: string;
    status: string;
    ai_status: string;
    summary: string | null;
    financial_entity: string | null;
    transaction_type: string | null;
    amount: number | null;
    currency: string | null;
    reference_number: string | null;
    transaction_datetime: string | null;
  } | null;
}

/**
 * Get all business contexts for the current logged-in user.
 */
export async function getUserBusinessContexts(): Promise<BusinessContexts> {
  const { data, error } = await supabase.rpc('get_user_business_contexts');
  if (error) {
    console.error('Error in getUserBusinessContexts:', error);
    throw new Error(error.message || 'Failed to fetch business contexts');
  }
  return normalizeBusinessContexts(data);
}

function normalizeBusinessContexts(data: any): BusinessContexts {
  const owned = Array.isArray(data?.owned_businesses) ? data.owned_businesses : [];
  const team = Array.isArray(data?.team_businesses) ? data.team_businesses : [];
  const customers = Array.isArray(data?.customer_businesses) ? data.customer_businesses : [];

  return {
    owned_businesses: owned.map(normalizeBusinessProfileContext),
    team_businesses: team.map((row: any) => {
      const business = normalizeBusinessProfileContext(row?.business || row);
      return {
        ...business,
        membership_id: row?.membership_id || row?.id || null,
        membership_status: row?.status || row?.membership_status || null,
        team_role: row?.workspace_role || row?.team_role || row?.label || 'team_member',
        workspace_id: row?.workspace_id || business.workspace_id || null,
        workspace_status: row?.workspace_status || business.workspace_status || null,
        workspace_role: row?.workspace_role || business.workspace_role || 'team_member'
      };
    }),
    customer_businesses: customers.map((row: any) => {
      const business = normalizeBusinessProfileContext(row?.business || row);
      return {
        ...business,
        customer_id: row?.customer_id || row?.id || null,
        customer_status: row?.status || row?.customer_status || null,
        customer_source: row?.source || row?.customer_source || null,
        workspace_id: row?.workspace_id || business.workspace_id || null,
        workspace_status: row?.workspace_status || business.workspace_status || null,
        workspace_role: row?.workspace_role || business.workspace_role || 'customer'
      };
    }),
    pending_invitations: Array.isArray(data?.pending_invitations) ? data.pending_invitations : []
  };
}

function normalizeBusinessProfileContext(item: any): BusinessProfile {
  return {
    ...item,
    workspace_id: item?.workspace_id || item?.workspace?.id || null,
    workspace_status: item?.workspace_status || item?.workspace?.status || null,
    workspace_role: item?.workspace_role || item?.workspace?.role || null
  } as BusinessProfile;
}

/**
 * Create a new business profile.
 */
export async function createBusinessProfile(payload: {
  p_name: string;
  p_slug: string;
  p_category_id?: string | null;
  p_governorate: string;
  p_city: string;
  p_whatsapp: string;
  p_description?: string | null;
  p_logo_path?: string | null;
}): Promise<BusinessProfile> {
  const { data, error } = await supabase.rpc('create_business_profile', payload);
  if (error) {
    console.error('Error in createBusinessProfile:', error);
    throw new Error(error.message || 'Failed to create business profile');
  }
  const result = (data as any)?.business ?? (data as any)?.data?.business ?? data;
  return normalizeBusinessProfileContext(result);
}

/**
 * Get public list of businesses.
 */
export async function getPublicBusinesses(filters: {
  p_search?: string | null;
  p_category_id?: string | null;
  p_governorate?: string | null;
  p_city?: string | null;
  p_limit?: number;
  p_offset?: number;
}): Promise<PublicBusinessListItem[]> {
  const { data, error } = await supabase.rpc('get_public_businesses', {
    p_search: filters.p_search || null,
    p_category_id: filters.p_category_id || null,
    p_governorate: filters.p_governorate || null,
    p_city: filters.p_city || null,
    p_limit: filters.p_limit ?? 20,
    p_offset: filters.p_offset ?? 0,
  });
  if (error) {
    console.error('Error in getPublicBusinesses:', error);
    const fallback = await getPublicBusinessesFallback(filters);
    if (fallback.length > 0) {
      return fallback;
    }
    throw new Error(error.message || 'Failed to fetch public businesses');
  }
  
  if (data) {
    if (Array.isArray(data)) {
      return data.map(normalizePublicBusinessListItem);
    }
    const anyData = data as any;
    if (anyData.items && Array.isArray(anyData.items)) {
      return anyData.items.map(normalizePublicBusinessListItem);
    }
  }
  return [];
}

function normalizePublicBusinessListItem(item: any): PublicBusinessListItem {
  return {
    id: item.id,
    name: item.name,
    slug: item.slug,
    category_name: item.category_name || item.category?.name_ar || item.category?.name || null,
    governorate: item.governorate,
    city: item.city,
    description: item.description || null,
    logo_url: item.profile_image_path || item.logo_path || item.logo_url || null,
    whatsapp: item.whatsapp || null
  };
}

/**
 * Get a public business profile details by slug.
 */
export async function getPublicBusinessProfile(slug: string): Promise<PublicBusinessDetail> {
  const { data, error } = await supabase.rpc('get_public_business_profile', { p_slug: slug });
  if (error) {
    console.error('Error in getPublicBusinessProfile:', error);
    return getPublicBusinessProfileFallback(slug, error.message || 'Failed to fetch business profile');
  }
  return data as PublicBusinessDetail;
}

async function getPublicBusinessesFallback(filters: {
  p_search?: string | null;
  p_governorate?: string | null;
  p_city?: string | null;
  p_limit?: number;
  p_offset?: number;
}): Promise<PublicBusinessListItem[]> {
  try {
    let query = supabase
      .from('business_profiles')
      .select('*')
      .eq('public_status', 'published')
      .order('created_at', { ascending: false })
      .range(filters.p_offset ?? 0, (filters.p_offset ?? 0) + (filters.p_limit ?? 20) - 1);

    if (filters.p_search) {
      query = query.or(`name.ilike.%${filters.p_search}%,city.ilike.%${filters.p_search}%,governorate.ilike.%${filters.p_search}%`);
    }
    if (filters.p_governorate) {
      query = query.eq('governorate', filters.p_governorate);
    }
    if (filters.p_city) {
      query = query.eq('city', filters.p_city);
    }

    const { data, error } = await query;
    if (error || !data) {
      console.warn('Fallback public businesses query failed:', error);
      return [];
    }

    return data.map(normalizePublicBusinessListItem);
  } catch (fallbackError) {
    console.warn('Fallback public businesses exception:', fallbackError);
    return [];
  }
}

async function getPublicBusinessProfileFallback(slug: string, originalMessage: string): Promise<PublicBusinessDetail> {
  const { data, error } = await supabase
    .from('business_profiles')
    .select('*')
    .eq('slug', slug)
    .eq('public_status', 'published')
    .maybeSingle();

  if (error || !data) {
    console.error('Fallback getPublicBusinessProfile failed:', error);
    throw new Error(error?.message || originalMessage);
  }

  const item = data as any;
  return {
    ...item,
    category_name: item.category_name || null,
    logo_url: item.profile_image_path || item.logo_path || item.logo_url || null,
    whatsapp_catalog_url: item.whatsapp_catalog_url || null
  } as PublicBusinessDetail;
}

/**
 * Link user to a business as a customer.
 */
export async function joinBusinessAsCustomer(businessId: string, source: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('join_business_as_customer', {
    p_business_id: businessId,
    p_source: source,
  });
  if (error) {
    console.error('Error in joinBusinessAsCustomer:', error);
    throw new Error(error.message || 'Failed to link as customer');
  }
  return !!data;
}

/**
 * Accept a team join invitation.
 */
export async function acceptBusinessInvitation(token: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('accept_business_invitation', { p_token: token });
  if (error) {
    console.error('Error in acceptBusinessInvitation:', error);
    throw new Error(error.message || 'Failed to accept invitation');
  }
  return !!data;
}

/**
 * Create a new team join invitation for a business.
 */
export async function createBusinessTeamInvitation(
  businessId: string,
  phone: string,
  label?: string | null
): Promise<BusinessInvitation> {
  const { data, error } = await supabase.rpc('create_business_team_invitation', {
    p_business_id: businessId,
    p_invited_phone: phone,
    p_label: label || null,
  });
  if (error) {
    console.error('Error in createBusinessTeamInvitation:', error);
    throw new Error(error.message || 'Failed to send team invitation');
  }
  return data as BusinessInvitation;
}

/**
 * Get operations for a specific business.
 */
export async function getBusinessOperations(businessId: string): Promise<BusinessOperationItem[]> {
  const { data, error } = await supabase.rpc('get_business_operations', {
    p_business_id: businessId,
  });
  if (error) {
    console.error('Error in getBusinessOperations:', error);
    throw new Error(error.message || 'Failed to fetch business operations');
  }
  if (data) {
    if (Array.isArray(data)) {
      return data as BusinessOperationItem[];
    }
    const anyData = data as any;
    if (anyData.items && Array.isArray(anyData.items)) {
      return anyData.items as BusinessOperationItem[];
    }
  }
  return [];
}

export interface LinkableBusinessItem {
  business_id: string;
  workspace_id?: string | null;
  workspace_status?: string | null;
  workspace_role?: string | null;
  name: string;
  slug: string;
  label: string | null;
  public_status: string;
}

/**
 * Get all businesses that the current user can link an operation to.
 */
export async function getLinkableBusinessesForUser(): Promise<LinkableBusinessItem[]> {
  const { data, error } = await supabase.rpc('get_linkable_businesses_for_user');
  if (error) {
    console.error('Error in getLinkableBusinessesForUser:', error);
    throw new Error(error.message || 'Failed to fetch linkable businesses');
  }
  if (data) {
    if (Array.isArray(data)) {
      return data as LinkableBusinessItem[];
    }
    const anyData = data as any;
    if (anyData.items && Array.isArray(anyData.items)) {
      return anyData.items as LinkableBusinessItem[];
    }
  }
  return [];
}

/**
 * Link an operation to a business.
 */
export async function linkOperationToBusiness(operationId: string, businessId: string): Promise<any> {
  const { data, error } = await supabase.rpc('link_operation_to_business', {
    p_operation_id: operationId,
    p_business_id: businessId,
  });
  if (error) {
    console.error('Error in linkOperationToBusiness:', error);
    throw new Error(error.message || 'Failed to link operation to business');
  }
  return data;
}

/**
 * General Edge Function call handler for business actions.
 */
export async function callBusinessAction(action: string, payload: any): Promise<any> {
  const { data, error } = await supabase.functions.invoke('sanad-v3-business-actions', {
    body: { action, payload }
  });
  if (error) {
    console.error(`Edge Function error in action [${action}]:`, error);
    throw new Error(error.message || `Failed to perform action ${action}`);
  }
  if (data && typeof data === 'object') {
    if (data.error) {
      console.error(`Action [${action}] returned error:`, data.error);
      throw new Error(data.error || `Action ${action} returned an error`);
    }
  }
  return data;
}

export async function updateBusinessProfile(payload: {
  p_business_id?: string;
  business_id?: string;
  businessId?: string;
  p_name?: string;
  name?: string;
  p_slug?: string | null;
  slug?: string | null;
  p_tagline?: string | null;
  tagline?: string | null;
  p_display_tagline?: string | null;
  display_tagline?: string | null;
  p_description?: string | null;
  description?: string | null;
  p_category_id?: string | null;
  category_id?: string | null;
  p_governorate?: string;
  governorate?: string;
  p_city?: string;
  city?: string;
  p_whatsapp?: string | null;
  whatsapp?: string | null;
  p_address_text?: string | null;
  address_text?: string | null;
  p_latitude?: number | null;
  latitude?: number | null;
  p_longitude?: number | null;
  longitude?: number | null;
  p_profile_image_path?: string | null;
  profile_image_path?: string | null;
  p_cover_image_path?: string | null;
  cover_image_path?: string | null;
  p_gallery_paths?: string[] | null;
  gallery_paths?: string[] | null;
  p_working_hours?: any | null;
  working_hours?: any | null;
  p_contact_links?: any | null;
  contact_links?: any | null;
  p_profile_sections?: any | null;
  profile_sections?: any | null;
  p_whatsapp_catalog_url?: string | null;
  whatsapp_catalog_url?: string | null;
  p_resubmit_review?: boolean;
  resubmit_review?: boolean;
}): Promise<BusinessProfile> {
  const rpcPayload = {
    p_business_id: payload.p_business_id ?? payload.business_id ?? payload.businessId,
    p_name: payload.p_name ?? payload.name ?? null,
    p_slug: payload.p_slug ?? payload.slug ?? null,
    p_tagline: payload.p_tagline ?? payload.p_display_tagline ?? payload.tagline ?? payload.display_tagline ?? null,
    p_display_tagline: payload.p_display_tagline ?? payload.p_tagline ?? payload.display_tagline ?? payload.tagline ?? null,
    p_description: payload.p_description ?? payload.description ?? null,
    p_category_id: payload.p_category_id ?? payload.category_id ?? null,
    p_governorate: payload.p_governorate ?? payload.governorate ?? null,
    p_city: payload.p_city ?? payload.city ?? null,
    p_whatsapp: payload.p_whatsapp ?? payload.whatsapp ?? null,
    p_address_text: payload.p_address_text ?? payload.address_text ?? null,
    p_latitude: null,
    p_longitude: null,
    p_cover_image_path: payload.p_cover_image_path ?? payload.cover_image_path ?? null,
    p_profile_image_path: payload.p_profile_image_path ?? payload.profile_image_path ?? null,
    p_gallery_paths: payload.p_gallery_paths ?? payload.gallery_paths ?? null,
    p_working_hours: payload.p_working_hours ?? payload.working_hours ?? null,
    p_contact_links: payload.p_contact_links ?? payload.contact_links ?? null,
    p_profile_sections: payload.p_profile_sections ?? payload.profile_sections ?? null,
    p_whatsapp_catalog_url: payload.p_whatsapp_catalog_url ?? payload.whatsapp_catalog_url ?? null,
    p_resubmit_review: payload.p_resubmit_review ?? payload.resubmit_review ?? false
  };

  const { data, error } = await supabase.rpc('update_business_profile', rpcPayload);

  if (error) {
    console.error('[updateBusinessProfile rpc failed]', { error, rpcPayload });
    throw error;
  }

  const result = data?.business ?? data?.data?.business ?? data?.business_profile ?? data;
  return result as BusinessProfile;
}

export async function getBusinessTeam(businessId: string): Promise<BusinessTeamMember[]> {
  try {
    const { data, error } = await supabase.rpc('get_business_team', { p_business_id: businessId });
    if (!error && data) {
      if (Array.isArray(data)) return data as BusinessTeamMember[];
      const anyData = data as any;
      if (anyData.items && Array.isArray(anyData.items)) return anyData.items as BusinessTeamMember[];
      if (anyData.data && Array.isArray(anyData.data)) return anyData.data as BusinessTeamMember[];
    }
    if (error) {
      console.warn('RPC get_business_team failed, trying business_action_get_team:', error);
    }
  } catch (e) {
    console.warn('RPC get_business_team exception, trying business_action_get_team:', e);
  }

  try {
    const { data, error } = await supabase.rpc('business_action_get_team', { p_payload: { business_id: businessId } });
    if (!error && data) {
      let parsed = data;
      if (typeof data === 'string') {
        try { parsed = JSON.parse(data); } catch(_) {}
      }
      if (Array.isArray(parsed)) return parsed as BusinessTeamMember[];
      const anyData = parsed as any;
      if (anyData.items && Array.isArray(anyData.items)) return anyData.items as BusinessTeamMember[];
      if (anyData.data && Array.isArray(anyData.data)) return anyData.data as BusinessTeamMember[];
    }
    if (error) {
      console.warn('RPC business_action_get_team failed, trying Edge Function:', error);
    }
  } catch (e) {
    console.warn('RPC business_action_get_team exception, trying Edge Function:', e);
  }

  try {
    const res = await callBusinessAction('get_business_team', { p_business_id: businessId });
    if (res) {
      if (Array.isArray(res)) return res as BusinessTeamMember[];
      const anyRes = res as any;
      if (anyRes.items && Array.isArray(anyRes.items)) return anyRes.items as BusinessTeamMember[];
      if (anyRes.data && Array.isArray(anyRes.data)) return anyRes.data as BusinessTeamMember[];
    }
  } catch (err: any) {
    console.error('Edge Function get_business_team failed:', err);
    throw new Error('فشل تحميل أعضاء الفريق من السيرفر. تأكد من اتصالك بالشبكة.');
  }
  return [];
}

/**
 * Get customers for a specific business.
 */
export async function getBusinessCustomers(businessId: string): Promise<any[]> {
  try {
    const { data, error } = await supabase.rpc('get_business_customers', { p_business_id: businessId });
    if (!error && data) {
      if (Array.isArray(data)) return data as any[];
      const anyData = data as any;
      if (anyData.items && Array.isArray(anyData.items)) return anyData.items as any[];
      if (anyData.data && Array.isArray(anyData.data)) return anyData.data as any[];
    }
  } catch (e) {
    // ignore and fallback
  }

  // Fallback: try direct table join to profiles
  try {
    const { data, error } = await supabase
      .from('business_customers')
      .select(`id, user_id, created_at, profiles:profiles(full_name, phone)`)
      .eq('business_id', businessId);
    if (!error && data) {
      return (data as any[]).map((row: any) => ({
        id: row.id,
        user_id: row.user_id,
        created_at: row.created_at,
        full_name: row.profiles?.full_name || null,
        phone: row.profiles?.phone || null
      }));
    }
  } catch (e) {
    console.error('Fallback getBusinessCustomers failed:', e);
  }

  return [];
}

export async function updateBusinessTeamMemberStatus(
  businessId: string,
  memberUserId: string,
  action: 'suspended' | 'reactivated' | 'removed',
  reason?: string | null
): Promise<boolean> {
  const res = await callBusinessAction('update_team_member_status', {
    p_business_id: businessId,
    p_member_user_id: memberUserId,
    p_action: action,
    p_reason: reason || null
  });
  return !!res;
}

export interface UploadMediaResult {
  path: string;
  signedUrl: string;
  asset?: any;
}

export async function uploadBusinessMedia(params: {
  businessId: string;
  assetType: 'cover' | 'profile' | 'gallery';
  file: File;
  displayOrder?: number | null;
  altText?: string | null;
}): Promise<UploadMediaResult> {
  const { businessId, assetType, file, displayOrder = 1, altText = null } = params;

  if (!['cover', 'profile', 'gallery'].includes(assetType)) {
    throw new Error('غير مسموح برفع هذا النوع من الوسائط.');
  }

  let normalizedMimeType = file.type.toLowerCase();
  if (normalizedMimeType === 'image/jpg') {
    normalizedMimeType = 'image/jpeg';
  }

  const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
  if (!validTypes.includes(normalizedMimeType)) {
    throw new Error('نوع الملف غير مدعوم. يرجى اختيار صورة بصيغة JPEG أو PNG أو WEBP.');
  }

  const maxSize = 10 * 1024 * 1024;
  if (file.size > maxSize) {
    throw new Error('حجم الملف كبير جداً. الحد الأقصى هو 10 ميجابايت.');
  }

  const extension = file.name.split('.').pop() || 'jpg';
  const cleanExt = ['jpg', 'jpeg', 'png', 'webp'].includes(extension.toLowerCase()) ? extension.toLowerCase() : 'jpg';
  const filename = `${assetType}-${Date.now()}-${Math.floor(Math.random() * 1000)}.${cleanExt}`;
  const storagePath = `${businessId}/${assetType}/${filename}`;

  console.log('[business-media-upload]', { bucket: 'business-media', path: storagePath, type: normalizedMimeType, size: file.size });

  const { data: uploadData, error: uploadError } = await supabase.storage
    .from('business-media')
    .upload(storagePath, file, {
      contentType: normalizedMimeType,
      cacheControl: '3600',
      upsert: true
    });

  if (uploadError) {
    console.error('Storage upload error:', uploadError);
    throw new Error(uploadError.message || 'فشل رفع الملف إلى المخزن.');
  }

  let asset: any = null;
  try {
    const rpcParams = {
      p_business_id: businessId,
      p_asset_type: assetType,
      p_storage_path: storagePath,
      p_mime_type: normalizedMimeType,
      p_file_name: file.name,
      p_file_size: file.size,
      p_alt_text: altText,
      p_display_order: displayOrder
    };
    const { data, error } = await supabase.rpc('register_business_media_asset', rpcParams);
    if (error) {
      console.warn('register_business_media_asset failed, trying business_action_register_media_asset:', error);
      const { data: data2, error: error2 } = await supabase.rpc('business_action_register_media_asset', {
        p_payload: {
          business_id: businessId,
          asset_type: assetType,
          storage_path: storagePath,
          mime_type: normalizedMimeType,
          file_name: file.name,
          file_size: file.size,
          alt_text: altText,
          display_order: displayOrder
        }
      });
      if (error2) {
        console.error('Fallback register media RPC failed:', error2);
      } else {
        asset = data2;
      }
    } else {
      asset = data;
    }
  } catch (e) {
    console.error('Exception during media registration:', e);
  }

  let signedUrl = '';
  try {
    const { data: signData, error: signError } = await supabase.storage
      .from('business-media')
      .createSignedUrl(storagePath, 3600);
    if (!signError && signData) {
      signedUrl = signData.signedUrl;
    }
  } catch (e) {
    console.error('Failed to create preview signed URL:', e);
  }

  return {
    path: storagePath,
    signedUrl,
    asset
  };
}

export async function setBusinessProfileMedia(payload: {
  p_business_id: string;
  p_cover_image_path: string | null;
  p_profile_image_path: string | null;
  p_gallery_paths: string[] | null;
  p_resubmit_review?: boolean;
}): Promise<boolean> {
  const { data, error } = await supabase.rpc('set_business_profile_media', payload);
  if (error) {
    console.warn('set_business_profile_media RPC failed, trying business_action_set_profile_media:', error);
    const { data: data2, error: error2 } = await supabase.rpc('business_action_set_profile_media', {
      p_payload: {
        business_id: payload.p_business_id,
        cover_image_path: payload.p_cover_image_path,
        profile_image_path: payload.p_profile_image_path,
        gallery_paths: payload.p_gallery_paths,
        resubmit_review: payload.p_resubmit_review || false
      }
    });
    if (error2) {
      console.error('Fallback set profile media RPC failed:', error2);
      throw new Error(error2.message || 'فشل تحديث وسائط الملف التعريفي.');
    }
    return !!data2;
  }
  return !!data;
}

export async function getBusinessMediaSignedUrl(path: string): Promise<string> {
  if (!path) return '';
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }
  try {
    const { data, error } = await supabase.storage
      .from('business-media')
      .createSignedUrl(path, 3600);
    if (error) {
      console.error('Error creating signed URL for', path, error);
      return '';
    }
    return data?.signedUrl || '';
  } catch (e) {
    console.error('Exception creating signed URL:', e);
    return '';
  }
}

import { supabase } from './supabase';

export interface BusinessProfile {
  id: string;
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
  team_businesses: (BusinessProfile & { team_role: string })[];
  customer_businesses: BusinessProfile[];
  pending_invitations: BusinessInvitation[];
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
  return data as BusinessContexts;
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
  return data as BusinessProfile;
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
    throw new Error(error.message || 'Failed to fetch public businesses');
  }
  
  if (data) {
    if (Array.isArray(data)) {
      return data as PublicBusinessListItem[];
    }
    const anyData = data as any;
    if (anyData.items && Array.isArray(anyData.items)) {
      return anyData.items as PublicBusinessListItem[];
    }
  }
  return [];
}

/**
 * Get a public business profile details by slug.
 */
export async function getPublicBusinessProfile(slug: string): Promise<PublicBusinessDetail> {
  const { data, error } = await supabase.rpc('get_public_business_profile', { p_slug: slug });
  if (error) {
    console.error('Error in getPublicBusinessProfile:', error);
    throw new Error(error.message || 'Failed to fetch business profile');
  }
  return data as PublicBusinessDetail;
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

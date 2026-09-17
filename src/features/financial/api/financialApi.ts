import { supabase } from '../../../lib/supabase';
import type {
  AccountBusiness,
  BusinessParty,
  PersonalAccount,
  PersonalCategory,
  PersonalParty,
  RpcResult,
  SettlementCandidates,
} from './financialTypes';

export async function getOwnedBusinesses(): Promise<RpcResult<AccountBusiness[]>> {
  const { data, error } = await supabase.rpc('get_my_account_center_v1');
  const businesses = Array.isArray((data as { businesses?: AccountBusiness[] } | null)?.businesses)
    ? ((data as { businesses?: AccountBusiness[] }).businesses || []).filter((item): item is AccountBusiness => Boolean(item?.id))
    : [];
  return { data: businesses, error };
}

export async function getPersonalMasterData(): Promise<{
  accounts: PersonalAccount[];
  categories: PersonalCategory[];
  parties: PersonalParty[];
  error: { message?: string } | null;
}> {
  const [accountResult, categoryResult, partyResult] = await Promise.all([
    supabase.from('personal_finance_accounts').select('id,name,currency,account_type,system_role').eq('status', 'active').is('system_role', null).order('name'),
    supabase.from('personal_finance_categories').select('id,name,kind').eq('status', 'active').order('name'),
    supabase.from('personal_finance_parties').select('id,display_name,party_type,phone').eq('status', 'active').order('display_name'),
  ]);
  const error = accountResult.error || categoryResult.error || partyResult.error;
  return {
    accounts: (accountResult.data || []) as PersonalAccount[],
    categories: (categoryResult.data || []) as PersonalCategory[],
    parties: (partyResult.data || []) as PersonalParty[],
    error,
  };
}

export async function getBusinessParties(businessId: string): Promise<RpcResult<BusinessParty[]>> {
  const { data, error } = await supabase
    .from('business_parties')
    .select('id,display_name,primary_phone')
    .eq('business_id', businessId)
    .eq('status', 'active')
    .order('display_name');
  return { data: (data || []) as BusinessParty[], error };
}

export function createPersonalAccount(command: {
  name: string;
  account_type: 'asset' | 'liability';
  currency: string;
  opening_balance?: string;
}) {
  return supabase.rpc('create_personal_finance_account_v1', { p_command: { ...command, metadata: { ui_surface: 'financial_actions' } } });
}

export function createPersonalCategory(command: { name: string; kind: 'income' | 'expense' }) {
  return supabase.rpc('create_personal_finance_category_v1', { p_command: { ...command, metadata: { ui_surface: 'financial_actions' } } });
}

export function createPersonalParty(command: {
  display_name: string;
  party_type: 'person' | 'business' | 'household' | 'other';
  phone?: string;
  email?: string;
  notes?: string;
}) {
  return supabase.rpc('create_personal_finance_party_v1', { p_command: { ...command, metadata: { ui_surface: 'financial_actions' } } });
}

export function createBusinessParty(businessId: string, command: { display_name: string; primary_phone?: string }) {
  return supabase.rpc('create_business_party_v1', {
    p_command: { business_id: businessId, ...command, metadata: { ui_surface: 'commercial_actions' } },
  });
}

export async function getSettlementCandidates(businessId: string): Promise<RpcResult<SettlementCandidates>> {
  const { data, error } = await supabase.rpc('get_business_commercial_settlement_candidates_v1', { p_business_id: businessId });
  return { data: (data || null) as SettlementCandidates | null, error };
}

export function settleCommercialDocument(invoiceId: string, paymentId: string, amount: string) {
  return supabase.rpc('settle_business_commercial_document_v1', {
    p_invoice_document_id: invoiceId,
    p_payment_document_id: paymentId,
    p_amount: amount,
  });
}

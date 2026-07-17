import { supabase } from './supabase';
import { callSanadAppFunction } from './sanadFunctions';

export type BusinessReportStatus =
  | 'queued'
  | 'processing'
  | 'ready'
  | 'sent'
  | 'failed'
  | 'cancelled';

export type BusinessReportBackendOperationStatus =
  | 'all'
  | 'verified'
  | 'ready'
  | 'stored'
  | 'received'
  | 'matched'
  | 'failed';

const SUPPORTED_OPERATION_STATUSES: readonly BusinessReportBackendOperationStatus[] = [
  'all',
  'verified',
  'ready',
  'stored',
  'received',
  'matched',
  'failed'
];

export interface BusinessReportFilters {
  currency: 'ALL' | 'YER' | 'SAR' | 'USD';
  status: BusinessReportBackendOperationStatus;
  team_member_user_id: string | null;
  financial_entity: string | null;
  include_details: boolean;
  include_team_performance: boolean;
  include_status_distribution: boolean;
  include_currency_distribution: boolean;
  include_entity_distribution: boolean;
}

export interface BusinessReportHistoryItem {
  id: string;
  report_title: string;
  report_context: string;
  business_id: string;
  date_from: string | null;
  date_to: string | null;
  filters: Partial<BusinessReportFilters> | null;
  status: BusinessReportStatus;
  processing_stage: string | null;
  requested_at: string;
  processed_at: string | null;
  sent_at: string | null;
  destination_phone: string;
  error_message: string | null;
  result_metrics: {
    total_operations_count?: number;
    operation_count?: number;
    [key: string]: unknown;
  } | null;
  attempt_count: number;
}

/**
 * Create a new business report request via RPC.
 */
export async function createBusinessReportRequest(params: {
  businessId: string;
  dateFrom: string | null;
  dateTo: string | null;
  filters: Partial<BusinessReportFilters>;
  destinationPhone: string;
}): Promise<string> {
  const requestedStatus = params.filters.status;
  const safeStatus =
    requestedStatus && SUPPORTED_OPERATION_STATUSES.includes(requestedStatus)
      ? requestedStatus
      : 'all';

  const { data, error } = await supabase.rpc('create_business_report_request', {
    p_business_id: params.businessId,
    p_date_from: params.dateFrom,
    p_date_to: params.dateTo,
    p_filters: { ...params.filters, status: safeStatus },
    p_destination_phone: params.destinationPhone,
  });

  if (error) {
    console.error('Error invoking create_business_report_request RPC:', error);
    throw new Error('تعذر إرسال طلب التقرير. تحقق من البيانات والاتصال ثم أعد المحاولة.');
  }

  const rows = Array.isArray(data) ? data : [data];
  const firstRow = rows[0];
  const reportRequestId =
    firstRow && typeof firstRow === 'object' && 'report_request_id' in firstRow
      ? String(firstRow.report_request_id || '')
      : '';

  if (!reportRequestId) {
    throw new Error('لم يتم استرجاع رقم معرف طلب التقرير من الخادم.');
  }

  return reportRequestId;
}

/**
 * Trigger report processing Edge Function.
 */
export async function triggerBusinessReportProcessing(reportRequestId: string): Promise<boolean> {
  try {
    await callSanadAppFunction('sanad-v3-app-trigger-report', {
      report_request_id: reportRequestId,
    });
    return true;
  } catch (error) {
    console.warn('Failed to trigger report processing function:', error);
    return false;
  }
}

/**
 * Fetch report requests list for a specific business.
 */
export async function getBusinessReportRequests(
  businessId: string
): Promise<BusinessReportHistoryItem[]> {
  const { data, error } = await supabase
    .from('report_requests')
    .select(`
      id,
      report_title,
      report_context,
      business_id,
      date_from,
      date_to,
      filters,
      status,
      processing_stage,
      requested_at,
      processed_at,
      sent_at,
      destination_phone,
      error_message,
      result_metrics,
      attempt_count
    `)
    .eq('business_id', businessId)
    .eq('report_context', 'business')
    .order('requested_at', { ascending: false });

  if (error) {
    console.error('Error fetching business report requests:', error);
    throw new Error('تعذر تحميل سجل طلبات التقارير.');
  }

  return (data || []) as BusinessReportHistoryItem[];
}

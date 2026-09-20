import { supabase } from '../../lib/supabase';
import { SANAD_APP_VERSION } from '../../lib/appVersion';

export type SanadAgentClientMetricScope =
  | 'agent_client_turn'
  | 'thread_load'
  | 'attachment_upload';

export type SanadAgentPerformanceScopeSummary = {
  scope: string;
  count: number;
  failure_count: number;
  failure_rate: number;
  p50_total_ms?: number | null;
  p95_total_ms?: number | null;
  p50_first_progress_ms?: number | null;
  p95_first_progress_ms?: number | null;
  p50_first_answer_ms?: number | null;
  p95_first_answer_ms?: number | null;
  avg_tool_calls?: number | null;
  avg_failed_tool_calls?: number | null;
  avg_retry_count?: number | null;
  cache_ratio?: number | null;
};

export type SanadAgentPerformanceSummary = {
  window_days: number;
  generated_at: string;
  scopes: SanadAgentPerformanceScopeSummary[];
};

export async function recordSanadAgentClientMetric(input: {
  scope: SanadAgentClientMetricScope;
  threadId?: string | null;
  requestId?: string | null;
  status?: 'completed' | 'failed' | 'cancelled';
  transport?: 'sse' | 'json' | 'rpc' | 'storage' | null;
  totalLatencyMs?: number | null;
  firstProgressMs?: number | null;
  firstAnswerMs?: number | null;
  itemCount?: number | null;
  byteCount?: number | null;
}): Promise<void> {
  try {
    await supabase.rpc('record_my_sanad_agent_client_metric_v1', {
      p_scope: input.scope,
      p_thread_id: input.threadId || null,
      p_request_id: input.requestId || null,
      p_status: input.status || 'completed',
      p_transport: input.transport || null,
      p_total_latency_ms: input.totalLatencyMs == null ? null : Math.max(0, Math.round(input.totalLatencyMs)),
      p_first_progress_ms: input.firstProgressMs == null ? null : Math.max(0, Math.round(input.firstProgressMs)),
      p_first_answer_ms: input.firstAnswerMs == null ? null : Math.max(0, Math.round(input.firstAnswerMs)),
      p_item_count: input.itemCount == null ? null : Math.max(0, Math.round(input.itemCount)),
      p_byte_count: input.byteCount == null ? null : Math.max(0, Math.round(input.byteCount)),
      p_app_version: SANAD_APP_VERSION,
    });
  } catch {
    // Observability is intentionally best-effort and must never block the user flow.
  }
}

export async function getMySanadAgentPerformance(days = 7): Promise<SanadAgentPerformanceSummary> {
  const { data, error } = await supabase.rpc('get_my_sanad_agent_performance_v1', {
    p_days: Math.max(1, Math.min(Math.round(days), 90)),
  });
  if (error) throw new Error(error.message || 'تعذر تحميل مؤشرات أداء سند.');
  return data as SanadAgentPerformanceSummary;
}

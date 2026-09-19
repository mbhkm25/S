import { supabase } from '../../lib/supabaseClient';
import type { SanadAssistantResponseContract } from './agentFoundation';

export type SanadAiHistoryTurn = {
  role: 'user' | 'assistant';
  content: string;
};

export type SanadAiAgentTurnRequest = {
  message: string;
  business_id?: string | null;
  history?: SanadAiHistoryTurn[];
};

export type SanadAiToolTrace = {
  name: string;
  status: 'completed' | 'failed';
  latency_ms: number;
  source: string;
  error?: string;
};

export type SanadAiAgentTurnResult = {
  ok: boolean;
  request_id: string;
  runtime_version?: string;
  model?: string;
  thinking_level?: 'low' | 'medium' | 'high';
  response?: SanadAssistantResponseContract;
  verification?: {
    passed: boolean;
    no_currency_merge: boolean;
    missing_currency_mentions_repaired?: string[];
    period_repaired?: boolean;
  };
  tool_trace?: SanadAiToolTrace[];
  usage?: Record<string, number>;
  latency_ms?: number;
  error?: string;
};

export async function runSanadAiAgentTurn(input: SanadAiAgentTurnRequest): Promise<SanadAiAgentTurnResult> {
  const message = input.message.trim();
  if (!message) throw new Error('اكتب رسالتك أولًا.');

  const { data, error } = await supabase.functions.invoke<SanadAiAgentTurnResult>('sanad-ai-agent-v1', {
    body: {
      message,
      business_id: input.business_id || null,
      history: (input.history || []).slice(-8),
    },
  });

  if (error) throw new Error(error.message || 'تعذر الاتصال بمساعد سند.');
  if (!data) throw new Error('لم يُرجع مساعد سند استجابة.');
  if (!data.ok) throw new Error(data.error || 'تعذر إكمال طلب مساعد سند.');
  return data;
}

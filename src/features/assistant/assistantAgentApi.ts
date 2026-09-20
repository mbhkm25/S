import { supabase, supabaseApiUrl, supabasePublicKey } from '../../lib/supabase';
import type { SanadAssistantResponseContract } from './agentFoundation';

export type SanadAiHistoryTurn = {
  role: 'user' | 'assistant';
  content: string;
};

export type SanadAiAgentTurnRequest = {
  message: string;
  business_id?: string | null;
  thread_id?: string | null;
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
  thread_id?: string | null;
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

export type SanadAiStreamEvent =
  | { type: 'run.started'; data: { request_id: string; runtime_version: string; model: string; thinking_level: 'low' | 'medium' | 'high' } }
  | { type: 'agent.status'; data: { status: string; label: string; count?: number; round?: number } }
  | { type: 'tool.started'; data: { name: string; source: string } }
  | { type: 'tool.completed'; data: SanadAiToolTrace }
  | { type: 'answer.final'; data: { text: string } }
  | { type: 'run.completed'; data: SanadAiAgentTurnResult }
  | { type: 'run.error'; data: { request_id?: string; error: string; tool_trace?: SanadAiToolTrace[]; latency_ms?: number } }
  | { type: 'done'; data: { request_id?: string } };

export async function runSanadAiAgentTurn(input: SanadAiAgentTurnRequest): Promise<SanadAiAgentTurnResult> {
  const message = input.message.trim();
  if (!message) throw new Error('اكتب رسالتك أولًا.');

  const { data, error } = await supabase.functions.invoke<SanadAiAgentTurnResult>('sanad-ai-agent-v1', {
    body: {
      message,
      business_id: input.business_id || null,
      thread_id: input.thread_id || null,
      history: (input.history || []).slice(-24),
    },
  });

  if (error) throw new Error(error.message || 'تعذر الاتصال بمساعد سند.');
  if (!data) throw new Error('لم يُرجع مساعد سند استجابة.');
  if (!data.ok) throw new Error(data.error || 'تعذر إكمال طلب مساعد سند.');
  return data;
}

function parseSseBlock(block: string): { event: string; data: unknown } | null {
  let event = 'message';
  const dataLines: string[] = [];

  for (const rawLine of block.split('\n')) {
    const line = rawLine.replace(/\r$/, '');
    if (line.startsWith('event:')) event = line.slice(6).trim();
    if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart());
  }

  if (!dataLines.length) return null;
  const rawData = dataLines.join('\n');
  if (!rawData || rawData === '[DONE]') return null;

  try {
    return { event, data: JSON.parse(rawData) };
  } catch {
    return { event, data: { raw: rawData } };
  }
}

export async function streamSanadAiAgentTurn(
  input: SanadAiAgentTurnRequest,
  onEvent: (event: SanadAiStreamEvent) => void,
): Promise<SanadAiAgentTurnResult> {
  const message = input.message.trim();
  if (!message) throw new Error('اكتب رسالتك أولًا.');

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw new Error(sessionError.message);
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) throw new Error('انتهت جلسة تسجيل الدخول. سجّل الدخول مجددًا.');

  const response = await fetch(`${supabaseApiUrl}/functions/v1/sanad-ai-agent-v1`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      apikey: supabasePublicKey,
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    },
    body: JSON.stringify({
      message,
      business_id: input.business_id || null,
      thread_id: input.thread_id || null,
      history: (input.history || []).slice(-24),
      stream: true,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(body || `تعذر الاتصال بمساعد سند (${response.status}).`);
  }

  if (!response.body) throw new Error('المتصفح لا يدعم تدفق استجابة مساعد سند.');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let result: SanadAiAgentTurnResult | null = null;
  let streamError: string | null = null;

  const dispatch = (block: string) => {
    const parsed = parseSseBlock(block);
    if (!parsed) return;

    const event = { type: parsed.event, data: parsed.data } as SanadAiStreamEvent;
    onEvent(event);

    if (event.type === 'run.completed') result = event.data;
    if (event.type === 'run.error') streamError = event.data.error || 'تعذر إكمال طلب مساعد سند.';
  };

  while (true) {
    const { done, value } = await reader.read();
    if (value) buffer += decoder.decode(value, { stream: !done }).replace(/\r\n/g, '\n');

    let boundary = buffer.indexOf('\n\n');
    while (boundary >= 0) {
      const block = buffer.slice(0, boundary).trim();
      buffer = buffer.slice(boundary + 2);
      if (block) dispatch(block);
      boundary = buffer.indexOf('\n\n');
    }

    if (done) break;
  }

  const tail = buffer.trim();
  if (tail) dispatch(tail);

  if (streamError) throw new Error(streamError);
  if (!result) throw new Error('انتهى تدفق مساعد سند دون نتيجة نهائية.');
  return result;
}

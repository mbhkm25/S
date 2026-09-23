import { supabase } from '../../lib/supabase';
import type { SanadAiAgentTurnResult, SanadAiToolTrace } from './assistantAgentApi';

export type SanadAgentThreadSummary = {
  id: string;
  owner_user_id?: string;
  business_id: string | null;
  title: string;
  status: 'active' | 'archived';
  summary?: string | null;
  last_message_at?: string | null;
  message_count: number;
  my_role?: 'owner' | 'member' | 'viewer';
  last_read_sequence_no?: number;
  unread_count?: number;
  created_at: string;
  updated_at: string;
};

export type SanadAgentStoredMessage = {
  id: string;
  sequence_no: number;
  role: 'user' | 'assistant';
  content: string;
  response?: SanadAiAgentTurnResult['response'] | null;
  tool_trace?: SanadAiToolTrace[];
  request_id?: string | null;
  model?: string | null;
  thinking_level?: 'low' | 'medium' | 'high' | null;
  is_starred?: boolean;
  rating?: -1 | 1 | null;
  rating_updated_at?: string | null;
  attachment_ids?: string[];
  author_user_id?: string | null;
  author_name?: string | null;
  author_avatar_path?: string | null;
  created_at: string;
};

export type SanadAgentThreadDetail = {
  thread: SanadAgentThreadSummary;
  messages: SanadAgentStoredMessage[];
};

export type SanadAgentPreferences = {
  user_id?: string;
  save_history_enabled: boolean;
  memory_enabled: boolean;
  proactive_insights_enabled: boolean;
  response_cards_enabled: boolean;
  created_at?: string;
  updated_at?: string;
};

export type SanadAgentMemory = {
  id: string;
  memory_key: string;
  category: string;
  value_text: string;
  confidence: number;
  updated_at?: string;
};

function rpcError(error: { message?: string } | null, fallback: string): never {
  throw new Error(error?.message || fallback);
}

export async function listSanadAgentThreads(limit = 50): Promise<SanadAgentThreadSummary[]> {
  const { data, error } = await supabase.rpc('list_my_sanad_agent_threads_v2', { p_limit: limit });
  if (error) rpcError(error, 'تعذر تحميل محادثات مساعد سند.');
  return Array.isArray(data) ? data as SanadAgentThreadSummary[] : [];
}

export async function createSanadAgentThread(
  businessId?: string | null,
  title?: string | null,
): Promise<string> {
  const { data, error } = await supabase.rpc('create_my_sanad_agent_thread_v1', {
    p_business_id: businessId || null,
    p_title: title || null,
  });
  if (error) rpcError(error, 'تعذر إنشاء محادثة جديدة.');
  if (typeof data !== 'string' || !data) throw new Error('لم يرجع النظام معرف المحادثة.');
  return data;
}

export async function getSanadAgentThread(
  threadId: string,
  limit = 160,
): Promise<SanadAgentThreadDetail> {
  const { data, error } = await supabase.rpc('get_my_sanad_agent_thread_v2', {
    p_thread_id: threadId,
    p_message_limit: limit,
  });
  if (error) rpcError(error, 'تعذر تحميل المحادثة.');
  const payload = data && typeof data === 'object' ? data as Record<string, unknown> : {};
  return {
    thread: payload.thread as SanadAgentThreadSummary,
    messages: Array.isArray(payload.messages) ? payload.messages as SanadAgentStoredMessage[] : [],
  };
}

export type SanadAgentThreadParticipant = {
  user_id: string;
  role: 'owner' | 'member' | 'viewer';
  status: 'active' | 'removed';
  joined_at?: string | null;
  left_at?: string | null;
  last_read_sequence_no?: number;
  notification_level?: string;
  full_name?: string | null;
  avatar_path?: string | null;
};

export async function listSanadAgentThreadParticipants(
  threadId: string,
): Promise<SanadAgentThreadParticipant[]> {
  const { data, error } = await supabase.rpc('list_my_sanad_agent_thread_participants_v1', {
    p_thread_id: threadId,
  });
  if (error) rpcError(error, 'تعذر تحميل المشاركين في المحادثة.');
  return Array.isArray(data) ? data as SanadAgentThreadParticipant[] : [];
}

export async function addSanadAgentThreadParticipant(
  threadId: string,
  userId: string,
  role: 'member' | 'viewer' = 'member',
): Promise<SanadAgentThreadParticipant> {
  const { data, error } = await supabase.rpc('add_my_sanad_agent_thread_participant_v1', {
    p_thread_id: threadId,
    p_user_id: userId,
    p_role: role,
  });
  if (error) rpcError(error, 'تعذر إضافة المشارك إلى المحادثة.');
  return data as SanadAgentThreadParticipant;
}

export async function removeSanadAgentThreadParticipant(
  threadId: string,
  userId: string,
): Promise<SanadAgentThreadParticipant> {
  const { data, error } = await supabase.rpc('remove_my_sanad_agent_thread_participant_v1', {
    p_thread_id: threadId,
    p_user_id: userId,
  });
  if (error) rpcError(error, 'تعذر إزالة المشارك من المحادثة.');
  return data as SanadAgentThreadParticipant;
}

export async function markSanadAgentThreadRead(
  threadId: string,
  sequenceNo?: number | null,
): Promise<void> {
  const { error } = await supabase.rpc('mark_my_sanad_agent_thread_read_v1', {
    p_thread_id: threadId,
    p_sequence_no: sequenceNo ?? null,
  });
  if (error) rpcError(error, 'تعذر تحديث حالة قراءة المحادثة.');
}

export async function renameSanadAgentThread(threadId: string, title: string): Promise<void> {
  const { error } = await supabase.rpc('update_my_sanad_agent_thread_v1', {
    p_thread_id: threadId,
    p_title: title,
    p_status: null,
    p_business_id: null,
    p_change_business: false,
  });
  if (error) rpcError(error, 'تعذر إعادة تسمية المحادثة.');
}

export async function archiveSanadAgentThread(threadId: string): Promise<void> {
  const { error } = await supabase.rpc('update_my_sanad_agent_thread_v1', {
    p_thread_id: threadId,
    p_title: null,
    p_status: 'archived',
    p_business_id: null,
    p_change_business: false,
  });
  if (error) rpcError(error, 'تعذر أرشفة المحادثة.');
}

export async function bindSanadAgentThreadBusiness(threadId: string, businessId: string | null): Promise<void> {
  const { error } = await supabase.rpc('update_my_sanad_agent_thread_v1', {
    p_thread_id: threadId,
    p_title: null,
    p_status: null,
    p_business_id: businessId,
    p_change_business: true,
  });
  if (error) rpcError(error, 'تعذر تحديث سياق النشاط.');
}

export async function getSanadAgentPreferences(): Promise<SanadAgentPreferences> {
  const { data, error } = await supabase.rpc('get_my_sanad_agent_preferences_v1');
  if (error) rpcError(error, 'تعذر تحميل إعدادات المساعد.');
  const payload = data && typeof data === 'object' ? data as Partial<SanadAgentPreferences> : {};
  return {
    user_id: payload.user_id,
    save_history_enabled: payload.save_history_enabled !== false,
    memory_enabled: payload.memory_enabled !== false,
    proactive_insights_enabled: payload.proactive_insights_enabled !== false,
    response_cards_enabled: payload.response_cards_enabled !== false,
    created_at: payload.created_at,
    updated_at: payload.updated_at,
  };
}

export async function updateSanadAgentPreferences(
  patch: Partial<Pick<SanadAgentPreferences,
    'save_history_enabled' | 'memory_enabled' | 'proactive_insights_enabled' | 'response_cards_enabled'
  >>,
): Promise<SanadAgentPreferences> {
  const { data, error } = await supabase.rpc('update_my_sanad_agent_preferences_v1', {
    p_save_history_enabled: patch.save_history_enabled ?? null,
    p_memory_enabled: patch.memory_enabled ?? null,
    p_proactive_insights_enabled: patch.proactive_insights_enabled ?? null,
    p_response_cards_enabled: patch.response_cards_enabled ?? null,
  });
  if (error) rpcError(error, 'تعذر حفظ إعدادات المساعد.');
  return data as SanadAgentPreferences;
}

export async function getSanadAgentContext(threadId: string): Promise<{ memories: SanadAgentMemory[] }> {
  const { data, error } = await supabase.rpc('get_my_sanad_agent_context_v2', {
    p_thread_id: threadId,
    p_recent_limit: 1,
    p_memory_limit: 60,
  });
  if (error) rpcError(error, 'تعذر تحميل ذاكرة المساعد.');
  const payload = data && typeof data === 'object' ? data as Record<string, unknown> : {};
  return { memories: Array.isArray(payload.memories) ? payload.memories as SanadAgentMemory[] : [] };
}

export async function forgetSanadAgentMemory(memoryId: string): Promise<void> {
  const { data, error } = await supabase.rpc('forget_my_sanad_agent_memory_v1', { p_memory_id: memoryId });
  if (error) rpcError(error, 'تعذر حذف هذه الذاكرة.');
  if (data !== true) throw new Error('لم يتم العثور على الذاكرة المطلوبة.');
}


export async function updateSanadAgentMessageFeedback(
  messageId: string,
  patch: { is_starred?: boolean; rating?: -1 | 1 | null },
): Promise<{ id: string; is_starred: boolean; rating: -1 | 1 | null }> {
  const { data, error } = await supabase.rpc('update_my_sanad_agent_message_feedback_v1', {
    p_message_id: messageId,
    p_is_starred: patch.is_starred ?? null,
    p_rating: patch.rating === null ? null : patch.rating ?? null,
    p_clear_rating: patch.rating === null,
  });
  if (error) rpcError(error, 'تعذر حفظ تفاعل الرسالة.');
  return data as { id: string; is_starred: boolean; rating: -1 | 1 | null };
}

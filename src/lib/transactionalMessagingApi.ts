import { supabase } from './supabase';

export interface TransactionalMessageRule {
  event_type: string;
  display_name: string;
  description: string | null;
  enabled: boolean;
  template_name: string | null;
  template_language: string;
  parameter_keys: string[];
  max_attempts: number;
  updated_at: string;
}

export interface TransactionalMessageItem {
  id: string;
  event_type: string;
  full_name: string | null;
  phone_normalized: string;
  status: string;
  attempt_count: number;
  max_attempts: number;
  external_message_id: string | null;
  last_error: string | null;
  created_at: string;
  sent_at: string | null;
  delivered_at: string | null;
  read_at: string | null;
}

export interface TransactionalMessagingOverview {
  rules: TransactionalMessageRule[];
  stats: { pending: number; processing: number; sent: number; failed: number };
  messages: TransactionalMessageItem[];
}

function throwIfError(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

export async function getTransactionalMessagingOverview(limit = 100): Promise<TransactionalMessagingOverview> {
  const { data, error } = await supabase.rpc('platform_admin_get_transactional_messages', { p_limit: limit });
  throwIfError(error);
  return data as TransactionalMessagingOverview;
}

export async function updateTransactionalMessageRule(payload: {
  eventType: string;
  enabled: boolean;
  templateName: string;
  templateLanguage: string;
  parameterKeys: string[];
  reason: string;
}): Promise<void> {
  const { error } = await supabase.rpc('platform_admin_update_transactional_message_rule', {
    p_event_type: payload.eventType,
    p_enabled: payload.enabled,
    p_template_name: payload.templateName || null,
    p_template_language: payload.templateLanguage || 'ar',
    p_parameter_keys: payload.parameterKeys,
    p_reason: payload.reason
  });
  throwIfError(error);
}

export async function retryTransactionalMessage(messageId: string, reason: string): Promise<void> {
  const { error } = await supabase.rpc('platform_admin_retry_transactional_message', {
    p_message_id: messageId,
    p_reason: reason
  });
  throwIfError(error);
}

export async function runTransactionalMessageWorker(limit = 100): Promise<{ sent: number; failed: number }> {
  const { data, error } = await supabase.functions.invoke('sanad-v3-transactional-message-worker', {
    body: { limit }
  });
  throwIfError(error);
  return data as { sent: number; failed: number };
}

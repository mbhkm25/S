import type { SanadAssistantAnswerCard, SanadAssistantEntity } from './agentFoundation';

/**
 * Presentation-only v4 compatibility adapter. Keeps existing Edge output and
 * action handlers authoritative while exposing a stable seven-family visual
 * taxonomy. A classification never grants or performs an action.
 */
export type SanadInteractiveResultKind =
  | 'snapshot' | 'record' | 'report' | 'draft'
  | 'approval' | 'execution_result' | 'warning';

export function classifySanadAnswerCard(card: SanadAssistantAnswerCard): SanadInteractiveResultKind {
  switch (card.type) {
    case 'metric':
    case 'replica_status':
      return 'snapshot';
    case 'customer_statement':
    case 'document_list':
    case 'payment_inbox_list':
      return 'report';
    case 'warning':
      return 'warning';
    case 'action_review':
      if (card.status === 'failed' || card.status === 'cancelled') return 'warning';
      if (card.status === 'completed') {
        return card.action_type === 'commercial_document_draft' ? 'draft' : 'execution_result';
      }
      return 'approval';
  }
}

export function classifySanadEntity(_entity: SanadAssistantEntity): SanadInteractiveResultKind {
  return 'record';
}

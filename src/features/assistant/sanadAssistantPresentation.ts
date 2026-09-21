import type { SanadVoiceState } from './sanadVoiceRuntime';

export type SanadAssistantPresentationState =
  | 'idle'
  | 'listening'
  | 'transcribing'
  | 'thinking'
  | 'executing'
  | 'waiting_approval'
  | 'success'
  | 'error';

export type SanadAssistantRunPhase =
  | 'idle'
  | 'thinking'
  | 'executing'
  | 'success'
  | 'error';

export type SanadAssistantActionStatus =
  | 'review'
  | 'approved'
  | 'executing'
  | 'completed'
  | 'cancelled'
  | 'failed'
  | null;

export type SanadAssistantPresentationInput = {
  voiceState?: SanadVoiceState | null;
  runPhase?: SanadAssistantRunPhase | null;
  actionStatus?: SanadAssistantActionStatus;
};

export const SANAD_ASSISTANT_STATE_LABELS: Record<SanadAssistantPresentationState, string> = {
  idle: 'جاهز',
  listening: 'يستمع',
  transcribing: 'يحوّل الصوت إلى نص',
  thinking: 'يفكر',
  executing: 'ينفذ',
  waiting_approval: 'ينتظر اعتمادك',
  success: 'تم',
  error: 'تعذر',
};

export function mapVoiceStateToAssistantPresentation(
  voiceState?: SanadVoiceState | null,
): SanadAssistantPresentationState | null {
  if (!voiceState || voiceState === 'idle' || voiceState === 'cancelled') return null;
  if (voiceState === 'listening') return 'listening';
  if (voiceState === 'transcribing') return 'transcribing';
  if (voiceState === 'requesting_permission' || voiceState === 'stopping') return 'thinking';
  if (voiceState === 'review' || voiceState === 'ready_to_send') return 'idle';
  if (
    voiceState === 'permission_denied'
    || voiceState === 'unsupported'
    || voiceState === 'capture_failed'
    || voiceState === 'transcription_failed'
    || voiceState === 'network_failed'
  ) return 'error';
  return null;
}

export function mapActionStatusToAssistantPresentation(
  actionStatus?: SanadAssistantActionStatus,
): SanadAssistantPresentationState | null {
  if (actionStatus === 'review') return 'waiting_approval';
  if (actionStatus === 'approved' || actionStatus === 'executing') return 'executing';
  if (actionStatus === 'completed') return 'success';
  if (actionStatus === 'failed') return 'error';
  return null;
}

export function mapSanadAssistantPresentationState({
  voiceState,
  runPhase = 'idle',
  actionStatus = null,
}: SanadAssistantPresentationInput): SanadAssistantPresentationState {
  const voice = mapVoiceStateToAssistantPresentation(voiceState);
  if (voice) return voice;

  if (runPhase === 'executing') return 'executing';
  if (runPhase === 'thinking') return 'thinking';

  const action = mapActionStatusToAssistantPresentation(actionStatus);
  if (action) return action;

  if (runPhase === 'success') return 'success';
  if (runPhase === 'error') return 'error';

  return 'idle';
}

export function getSanadAssistantStateLabel(state: SanadAssistantPresentationState): string {
  return SANAD_ASSISTANT_STATE_LABELS[state];
}

export function readSanadAssistantPreviewState(
  search: string,
  enabled: boolean,
): SanadAssistantPresentationState | null {
  if (!enabled) return null;
  const value = new URLSearchParams(search).get('assistantState');
  return value && value in SANAD_ASSISTANT_STATE_LABELS
    ? value as SanadAssistantPresentationState
    : null;
}

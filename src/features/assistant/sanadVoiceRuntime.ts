export type SanadVoiceState =
  | 'idle'
  | 'requesting_permission'
  | 'listening'
  | 'stopping'
  | 'transcribing'
  | 'review'
  | 'ready_to_send'
  | 'permission_denied'
  | 'unsupported'
  | 'capture_failed'
  | 'transcription_failed'
  | 'network_failed'
  | 'cancelled';

export type SanadVoiceEvent =
  | 'request_permission'
  | 'permission_granted'
  | 'permission_denied'
  | 'unsupported'
  | 'capture_failed'
  | 'stop'
  | 'stopped'
  | 'cancel'
  | 'transcription_succeeded'
  | 'transcription_failed'
  | 'network_failed'
  | 'review_ready'
  | 'retry'
  | 'reset';

export type SanadVoiceErrorCode =
  | 'permission_denied'
  | 'permission_blocked'
  | 'unsupported'
  | 'no_microphone'
  | 'capture_failed'
  | 'network_failed'
  | 'timeout'
  | 'transcription_failed'
  | 'service_unavailable'
  | 'audio_too_large'
  | 'recording_too_long'
  | 'unsupported_audio_type'
  | 'transcript_empty'
  | 'authentication_required'
  | 'cancelled';

export type MicrophonePermissionState = 'granted' | 'prompt' | 'denied' | 'unknown';

export type SanadVoiceFailure = {
  state: Extract<SanadVoiceState,
    'permission_denied' | 'unsupported' | 'capture_failed' | 'transcription_failed' | 'network_failed' | 'cancelled'
  >;
  code: SanadVoiceErrorCode;
  message: string;
};

export const MAX_RECORDING_MS = 90_000;
export const MAX_AUDIO_BYTES = 4 * 1024 * 1024;
export const VOICE_TRANSCRIPTION_TIMEOUT_MS = 120_000;

export const PREFERRED_VOICE_MIME_TYPES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
  'audio/ogg;codecs=opus',
  'audio/ogg',
] as const;

export function reduceSanadVoiceState(state: SanadVoiceState, event: SanadVoiceEvent): SanadVoiceState {
  switch (event) {
    case 'request_permission':
      return state === 'unsupported' ? state : 'requesting_permission';
    case 'permission_granted':
      return state === 'requesting_permission' ? 'listening' : state;
    case 'permission_denied':
      return 'permission_denied';
    case 'unsupported':
      return 'unsupported';
    case 'capture_failed':
      return 'capture_failed';
    case 'stop':
      return state === 'listening' ? 'stopping' : state;
    case 'stopped':
      return state === 'stopping' || state === 'listening' ? 'transcribing' : state;
    case 'cancel':
      return 'cancelled';
    case 'transcription_succeeded':
      return state === 'transcribing' ? 'review' : state;
    case 'review_ready':
      return state === 'review' ? 'ready_to_send' : state;
    case 'transcription_failed':
      return 'transcription_failed';
    case 'network_failed':
      return 'network_failed';
    case 'retry':
      return state === 'transcription_failed' || state === 'network_failed' ? 'transcribing' : state;
    case 'reset':
      return 'idle';
    default:
      return state;
  }
}

export function chooseSupportedVoiceMimeType(
  recorder: Pick<typeof MediaRecorder, 'isTypeSupported'> | null | undefined,
): string {
  if (!recorder?.isTypeSupported) return '';
  return PREFERRED_VOICE_MIME_TYPES.find((type) => recorder.isTypeSupported(type)) || '';
}

export async function readMicrophonePermissionState(): Promise<MicrophonePermissionState> {
  if (typeof navigator === 'undefined' || !navigator.permissions?.query) return 'unknown';
  try {
    const status = await navigator.permissions.query({ name: 'microphone' as PermissionName });
    return status.state === 'granted' || status.state === 'prompt' || status.state === 'denied'
      ? status.state
      : 'unknown';
  } catch {
    return 'unknown';
  }
}

function errorName(cause: unknown): string {
  if (cause && typeof cause === 'object' && 'name' in cause) return String((cause as { name?: unknown }).name || '');
  return '';
}

export function classifyCaptureFailure(
  cause: unknown,
  permissionState: MicrophonePermissionState = 'unknown',
): SanadVoiceFailure {
  const name = errorName(cause);
  const message = cause instanceof Error ? cause.message : '';

  if (name === 'NotAllowedError' || name === 'SecurityError' || /permission|denied|notallowed/i.test(message)) {
    if (permissionState === 'denied') {
      return {
        state: 'permission_denied',
        code: 'permission_blocked',
        message: 'الميكروفون محظور لهذا الموقع. اسمح به من إعدادات الموقع ثم حاول مجددًا.',
      };
    }
    return {
      state: 'permission_denied',
      code: 'permission_denied',
      message: 'لم يتم منح إذن الميكروفون. يمكنك المحاولة مجددًا.',
    };
  }

  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return {
      state: 'capture_failed',
      code: 'no_microphone',
      message: 'لم يتم العثور على ميكروفون متاح على هذا الجهاز.',
    };
  }

  if (name === 'NotSupportedError') {
    return {
      state: 'unsupported',
      code: 'unsupported',
      message: 'التسجيل الصوتي غير مدعوم في هذا المتصفح.',
    };
  }

  return {
    state: 'capture_failed',
    code: 'capture_failed',
    message: 'تعذر بدء التسجيل الصوتي. تحقق من الميكروفون ثم حاول مجددًا.',
  };
}

export function voiceFailureMessage(code: SanadVoiceErrorCode): string {
  switch (code) {
    case 'permission_denied':
      return 'لم يتم منح إذن الميكروفون. يمكنك المحاولة مجددًا.';
    case 'permission_blocked':
      return 'الميكروفون محظور لهذا الموقع. اسمح به من إعدادات الموقع ثم حاول مجددًا.';
    case 'unsupported':
      return 'التسجيل الصوتي غير مدعوم في هذا المتصفح.';
    case 'no_microphone':
      return 'لم يتم العثور على ميكروفون متاح على هذا الجهاز.';
    case 'network_failed':
      return 'تعذر الاتصال بخدمة تحويل الصوت. تحقق من الشبكة ثم أعد المحاولة.';
    case 'timeout':
      return 'استغرق تحويل الصوت وقتًا أطول من المتوقع. يمكنك إعادة المحاولة دون تسجيل جديد.';
    case 'service_unavailable':
      return 'خدمة تحويل الصوت غير متاحة مؤقتًا. يمكنك إعادة المحاولة.';
    case 'audio_too_large':
      return 'التسجيل أكبر من الحد المسموح. جرّب تسجيلًا أقصر.';
    case 'recording_too_long':
      return 'وصل التسجيل إلى الحد الأقصى. جرّب تسجيلًا أقصر.';
    case 'unsupported_audio_type':
      return 'صيغة التسجيل غير مدعومة على هذا الجهاز.';
    case 'transcript_empty':
      return 'لم أستطع استخراج نص واضح من التسجيل.';
    case 'authentication_required':
      return 'انتهت جلسة تسجيل الدخول. سجّل الدخول مجددًا ثم حاول مرة أخرى.';
    case 'cancelled':
      return 'تم إلغاء التسجيل.';
    default:
      return 'تعذر تحويل الصوت إلى نص. يمكنك إعادة المحاولة دون تسجيل جديد.';
  }
}

export function logVoiceDiagnostic(event: string, details: {
  mimeType?: string;
  durationMs?: number;
  sizeBytes?: number;
  errorCode?: string;
} = {}) {
  if (typeof console === 'undefined') return;
  console.info('[sanad_voice]', {
    event,
    mime_type: details.mimeType || null,
    duration_ms: details.durationMs == null ? null : Math.max(0, Math.round(details.durationMs)),
    size_bytes: details.sizeBytes == null ? null : Math.max(0, Math.round(details.sizeBytes)),
    error_code: details.errorCode || null,
  });
}

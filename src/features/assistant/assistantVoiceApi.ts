import { invokeAuthenticatedSanadFunction } from './assistantEdgeFunctionApi';
import {
  MAX_AUDIO_BYTES,
  VOICE_TRANSCRIPTION_TIMEOUT_MS,
  type SanadVoiceErrorCode,
  voiceFailureMessage,
} from './sanadVoiceRuntime';

const VOICE_PREVIEW_ENABLED = import.meta.env.VITE_SANAD_VOICE_PREVIEW === 'true';
const VOICE_FUNCTION_ENDPOINT = VOICE_PREVIEW_ENABLED
  ? String(import.meta.env.VITE_SANAD_VOICE_ENDPOINT || '').trim()
  : '';

export type SanadVoiceTranscriptionResult = {
  ok: true;
  request_id?: string;
  transcript: string;
  model: string;
  duration_ms?: number | null;
  latency_ms?: number;
  mime_type?: string;
  byte_count?: number;
};

export class SanadVoiceTranscriptionError extends Error {
  code: SanadVoiceErrorCode;
  retryable: boolean;

  constructor(code: SanadVoiceErrorCode, retryable = true, message = voiceFailureMessage(code)) {
    super(message);
    this.name = 'SanadVoiceTranscriptionError';
    this.code = code;
    this.retryable = retryable;
  }
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new SanadVoiceTranscriptionError('transcription_failed', true, 'تعذر قراءة التسجيل الصوتي.'));
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        reject(new SanadVoiceTranscriptionError('transcription_failed', true, 'تعذر تجهيز التسجيل الصوتي.'));
        return;
      }
      resolve(reader.result);
    };
    reader.readAsDataURL(blob);
  });
}

function mapTranscriptionFailure(cause: unknown): SanadVoiceTranscriptionError {
  if (cause instanceof SanadVoiceTranscriptionError) return cause;
  const raw = cause instanceof Error ? cause.message : String(cause || '');
  const code = raw.trim().toLowerCase();

  if (code.includes('voice_transcription_timeout') || code.includes('timeout') || code.includes('timed out')) {
    return new SanadVoiceTranscriptionError('timeout', true);
  }
  if (code.includes('authentication_required') || code.includes('انتهت جلسة')) {
    return new SanadVoiceTranscriptionError('authentication_required', false);
  }
  if (code.includes('recording_too_long')) {
    return new SanadVoiceTranscriptionError('recording_too_long', false);
  }
  if (code.includes('unsupported_audio_type')) {
    return new SanadVoiceTranscriptionError('unsupported_audio_type', false);
  }
  if (code.includes('audio_too_large') || code.includes('413')) {
    return new SanadVoiceTranscriptionError('audio_too_large', false);
  }
  if (code.includes('transcript_empty')) {
    return new SanadVoiceTranscriptionError('transcript_empty', true);
  }
  if (
    code.includes('voice_service_not_configured')
    || code.includes('service_unavailable')
    || code.includes('503')
    || code.includes('502')
  ) {
    return new SanadVoiceTranscriptionError('service_unavailable', true);
  }
  if (
    (typeof navigator !== 'undefined' && navigator.onLine === false)
    || /failed to fetch|networkerror|network error|load failed|تعذر الاتصال/i.test(raw)
  ) {
    return new SanadVoiceTranscriptionError('network_failed', true);
  }

  return new SanadVoiceTranscriptionError('transcription_failed', true);
}

function linkedTimeoutSignal(externalSignal?: AbortSignal): { signal: AbortSignal; cleanup: () => void } {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => {
    controller.abort(new DOMException('voice_transcription_timeout', 'TimeoutError'));
  }, VOICE_TRANSCRIPTION_TIMEOUT_MS);

  const abortFromExternal = () => {
    controller.abort(externalSignal?.reason ?? new DOMException('voice_transcription_cancelled', 'AbortError'));
  };
  if (externalSignal) {
    if (externalSignal.aborted) abortFromExternal();
    else externalSignal.addEventListener('abort', abortFromExternal, { once: true });
  }

  return {
    signal: controller.signal,
    cleanup: () => {
      window.clearTimeout(timeout);
      externalSignal?.removeEventListener('abort', abortFromExternal);
    },
  };
}

export async function transcribeSanadAudio(
  blob: Blob,
  durationMs: number,
  options: { signal?: AbortSignal } = {},
): Promise<SanadVoiceTranscriptionResult> {
  if (!blob.size) throw new SanadVoiceTranscriptionError('transcription_failed', false, 'التسجيل الصوتي فارغ.');
  if (blob.size > MAX_AUDIO_BYTES) throw new SanadVoiceTranscriptionError('audio_too_large', false);

  const dataUrl = await blobToDataUrl(blob);
  const comma = dataUrl.indexOf(',');
  const audioBase64 = comma >= 0 ? dataUrl.slice(comma + 1) : '';
  if (!audioBase64) throw new SanadVoiceTranscriptionError('transcription_failed', true, 'تعذر تجهيز التسجيل الصوتي.');

  const request = linkedTimeoutSignal(options.signal);
  try {
    const data = await invokeAuthenticatedSanadFunction<SanadVoiceTranscriptionResult>(
      'sanad-ai-transcribe-v1',
      {
        body: {
          audio_base64: audioBase64,
          mime_type: blob.type || 'audio/webm',
          duration_ms: Math.max(0, Math.round(durationMs)),
        },
        signal: request.signal,
        endpointUrl: VOICE_FUNCTION_ENDPOINT || undefined,
      },
    );

    if (!data?.ok || !data.transcript?.trim()) {
      throw new SanadVoiceTranscriptionError('transcript_empty', true);
    }
    return { ...data, transcript: data.transcript.trim() };
  } catch (cause) {
    if (options.signal?.aborted) {
      throw new SanadVoiceTranscriptionError('cancelled', false, voiceFailureMessage('cancelled'));
    }
    throw mapTranscriptionFailure(cause);
  } finally {
    request.cleanup();
  }
}

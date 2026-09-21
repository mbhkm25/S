import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Mic, RotateCcw, Square, X } from 'lucide-react';
import {
  SanadVoiceTranscriptionError,
  transcribeSanadAudio,
} from './assistantVoiceApi';
import {
  MAX_RECORDING_MS,
  chooseSupportedVoiceMimeType,
  classifyCaptureFailure,
  logVoiceDiagnostic,
  readMicrophonePermissionState,
  reduceSanadVoiceState,
  type SanadVoiceFailure,
  type SanadVoiceState,
} from './sanadVoiceRuntime';

export type { SanadVoiceState } from './sanadVoiceRuntime';

type Props = {
  disabled?: boolean;
  onTranscript: (text: string) => void;
  onError?: (message: string) => void;
  onStateChange?: (state: SanadVoiceState) => void;
};

type RetryAudio = {
  blob: Blob;
  durationMs: number;
  mimeType: string;
};

function formatElapsed(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(total / 60).toString().padStart(2, '0');
  const seconds = (total % 60).toString().padStart(2, '0');
  return `${minutes}:${seconds}`;
}

function failureEvent(failure: SanadVoiceFailure) {
  switch (failure.state) {
    case 'permission_denied': return 'permission_denied' as const;
    case 'unsupported': return 'unsupported' as const;
    case 'network_failed': return 'network_failed' as const;
    case 'transcription_failed': return 'transcription_failed' as const;
    case 'cancelled': return 'cancel' as const;
    default: return 'capture_failed' as const;
  }
}

function statusLabel(state: SanadVoiceState, elapsedMs: number) {
  switch (state) {
    case 'requesting_permission': return 'بانتظار إذن الميكروفون…';
    case 'listening': return `جاري الاستماع ${formatElapsed(elapsedMs)}`;
    case 'stopping': return 'جارٍ إنهاء التسجيل…';
    case 'transcribing': return 'جارٍ تحويل الصوت إلى نص…';
    case 'review':
    case 'ready_to_send': return 'النص جاهز للمراجعة والإرسال.';
    case 'permission_denied': return 'تعذر استخدام الميكروفون.';
    case 'unsupported': return 'التسجيل الصوتي غير مدعوم.';
    case 'capture_failed': return 'تعذر التقاط الصوت.';
    case 'network_failed': return 'تعذر الاتصال بخدمة الصوت.';
    case 'transcription_failed': return 'تعذر تحويل التسجيل إلى نص.';
    case 'cancelled': return 'تم إلغاء التسجيل.';
    default: return 'إملاء صوتي';
  }
}

export default function SanadVoiceDictationButton({ disabled, onTranscript, onError, onStateChange }: Props) {
  const [state, setState] = useState<SanadVoiceState>('idle');
  const [elapsedMs, setElapsedMs] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const startedAtRef = useRef(0);
  const cancelRef = useRef(false);
  const tickerRef = useRef<number | null>(null);
  const recordingTimeoutRef = useRef<number | null>(null);
  const transcriptionAbortRef = useRef<AbortController | null>(null);
  const retryAudioRef = useRef<RetryAudio | null>(null);
  const mountedRef = useRef(true);

  const transition = useCallback((event: Parameters<typeof reduceSanadVoiceState>[1]) => {
    setState((current) => reduceSanadVoiceState(current, event));
  }, []);

  useEffect(() => {
    onStateChange?.(state);
  }, [onStateChange, state]);

  const clearRecordingTimers = useCallback(() => {
    if (tickerRef.current !== null) window.clearInterval(tickerRef.current);
    if (recordingTimeoutRef.current !== null) window.clearTimeout(recordingTimeoutRef.current);
    tickerRef.current = null;
    recordingTimeoutRef.current = null;
  }, []);

  const releaseStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const cleanupRecorder = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder) {
      recorder.ondataavailable = null;
      recorder.onerror = null;
      recorder.onstop = null;
    }
    recorderRef.current = null;
  }, []);

  const reportFailure = useCallback((failure: SanadVoiceFailure) => {
    transition(failureEvent(failure));
    setNotice(failure.message);
    onError?.(failure.message);
    logVoiceDiagnostic('voice_capture_failed', { errorCode: failure.code });
  }, [onError, transition]);

  const runTranscription = useCallback(async (audio: RetryAudio, retry = false) => {
    if (!mountedRef.current) return;
    if (retry) transition('retry');
    const controller = new AbortController();
    transcriptionAbortRef.current?.abort();
    transcriptionAbortRef.current = controller;

    setNotice('جارٍ تحويل الصوت إلى نص…');
    logVoiceDiagnostic('voice_transcription_requested', {
      mimeType: audio.mimeType,
      durationMs: audio.durationMs,
      sizeBytes: audio.blob.size,
    });

    try {
      const result = await transcribeSanadAudio(audio.blob, audio.durationMs, { signal: controller.signal });
      if (!mountedRef.current) return;
      transition('transcription_succeeded');
      onTranscript(result.transcript);
      retryAudioRef.current = null;
      setNotice('تم تحويل الصوت إلى نص. راجعه قبل الإرسال.');
      logVoiceDiagnostic('voice_transcription_succeeded', {
        mimeType: audio.mimeType,
        durationMs: audio.durationMs,
        sizeBytes: audio.blob.size,
      });
      transition('review_ready');
    } catch (cause) {
      if (!mountedRef.current) return;
      if (cause instanceof SanadVoiceTranscriptionError && cause.code === 'cancelled') {
        transition('cancel');
        setNotice('تم إلغاء التحويل.');
        return;
      }
      const error = cause instanceof SanadVoiceTranscriptionError
        ? cause
        : new SanadVoiceTranscriptionError('transcription_failed', true);
      if (!error.retryable) retryAudioRef.current = null;
      transition(error.code === 'network_failed' || error.code === 'timeout' ? 'network_failed' : 'transcription_failed');
      setNotice(error.message);
      onError?.(error.message);
      logVoiceDiagnostic('voice_transcription_failed', {
        mimeType: audio.mimeType,
        durationMs: audio.durationMs,
        sizeBytes: audio.blob.size,
        errorCode: error.code,
      });
    } finally {
      if (transcriptionAbortRef.current === controller) transcriptionAbortRef.current = null;
      if (mountedRef.current) setElapsedMs(0);
    }
  }, [onError, onTranscript, transition]);

  const finishRecording = useCallback((cancel = false) => {
    cancelRef.current = cancel;
    clearRecordingTimers();

    if (cancel) transition('cancel');
    else transition('stop');

    const recorder = recorderRef.current;
    if (recorder?.state === 'recording') {
      try {
        recorder.stop();
      } catch (cause) {
        releaseStream();
        cleanupRecorder();
        reportFailure(classifyCaptureFailure(cause));
      }
    } else {
      releaseStream();
      cleanupRecorder();
      if (!cancel) {
        reportFailure({
          state: 'capture_failed',
          code: 'capture_failed',
          message: 'تعذر إنهاء التسجيل الصوتي بصورة صحيحة. حاول مجددًا.',
        });
      }
    }
  }, [cleanupRecorder, clearRecordingTimers, releaseStream, reportFailure, transition]);

  useEffect(() => () => {
    mountedRef.current = false;
    cancelRef.current = true;
    clearRecordingTimers();
    transcriptionAbortRef.current?.abort(new DOMException('voice_component_unmounted', 'AbortError'));
    transcriptionAbortRef.current = null;
    const recorder = recorderRef.current;
    if (recorder?.state === 'recording') {
      try { recorder.stop(); } catch { /* Best effort. */ }
    }
    releaseStream();
    cleanupRecorder();
    retryAudioRef.current = null;
    chunksRef.current = [];
  }, [cleanupRecorder, clearRecordingTimers, releaseStream]);

  const startRecording = useCallback(async () => {
    if (disabled || ['requesting_permission', 'listening', 'stopping', 'transcribing'].includes(state)) return;

    retryAudioRef.current = null;
    setNotice(null);
    transition('request_permission');

    if (
      typeof window === 'undefined'
      || !window.isSecureContext
      || !navigator.mediaDevices?.getUserMedia
      || typeof MediaRecorder === 'undefined'
    ) {
      reportFailure({
        state: 'unsupported',
        code: 'unsupported',
        message: 'التسجيل الصوتي يحتاج متصفحًا حديثًا واتصال HTTPS آمنًا.',
      });
      return;
    }

    const permissionBefore = await readMicrophonePermissionState();
    if (permissionBefore === 'denied') {
      reportFailure({
        state: 'permission_denied',
        code: 'permission_blocked',
        message: 'الميكروفون محظور لهذا الموقع. اسمح به من إعدادات الموقع ثم حاول مجددًا.',
      });
      return;
    }

    const mimeType = chooseSupportedVoiceMimeType(MediaRecorder);
    if (!mimeType) {
      reportFailure({
        state: 'unsupported',
        code: 'unsupported',
        message: 'لا يدعم هذا المتصفح صيغة صوت متوافقة مع سند.',
      });
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        },
      });
      if (!mountedRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      streamRef.current = stream;
      chunksRef.current = [];
      cancelRef.current = false;

      const recorder = new MediaRecorder(stream, {
        mimeType,
        audioBitsPerSecond: 48_000,
      });
      recorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data?.size) chunksRef.current.push(event.data);
      };

      recorder.onerror = () => {
        clearRecordingTimers();
        releaseStream();
        cleanupRecorder();
        reportFailure({
          state: 'capture_failed',
          code: 'capture_failed',
          message: 'حدث خطأ أثناء التقاط الصوت. أعد المحاولة.',
        });
      };

      recorder.onstop = () => {
        clearRecordingTimers();
        releaseStream();

        const actualMime = recorder.mimeType || mimeType;
        const durationMs = Math.max(0, Date.now() - startedAtRef.current);
        const cancelled = cancelRef.current;
        const blob = new Blob(chunksRef.current, { type: actualMime });
        chunksRef.current = [];
        cleanupRecorder();

        if (!mountedRef.current) return;

        logVoiceDiagnostic('voice_capture_stopped', {
          mimeType: actualMime,
          durationMs,
          sizeBytes: blob.size,
          errorCode: cancelled ? 'cancelled' : undefined,
        });

        if (cancelled) {
          setElapsedMs(0);
          setNotice('تم إلغاء التسجيل.');
          return;
        }

        if (!blob.size) {
          reportFailure({
            state: 'capture_failed',
            code: 'capture_failed',
            message: 'لم يتم تسجيل صوت واضح.',
          });
          return;
        }

        const retryAudio = { blob, durationMs, mimeType: actualMime };
        retryAudioRef.current = retryAudio;
        transition('stopped');
        void runTranscription(retryAudio);
      };

      recorder.start(250);
      startedAtRef.current = Date.now();
      setElapsedMs(0);
      transition('permission_granted');
      setNotice('أستمع الآن… اضغط إيقاف عند الانتهاء.');
      logVoiceDiagnostic('voice_capture_started', { mimeType });

      tickerRef.current = window.setInterval(() => {
        if (mountedRef.current) setElapsedMs(Date.now() - startedAtRef.current);
      }, 250);
      recordingTimeoutRef.current = window.setTimeout(() => {
        if (!mountedRef.current) return;
        setNotice('وصل التسجيل إلى الحد الأقصى وسيتم تحويله إلى نص.');
        finishRecording(false);
      }, MAX_RECORDING_MS);
    } catch (cause) {
      releaseStream();
      cleanupRecorder();
      const permissionAfter = await readMicrophonePermissionState();
      reportFailure(classifyCaptureFailure(cause, permissionAfter));
    }
  }, [
    cleanupRecorder,
    clearRecordingTimers,
    disabled,
    finishRecording,
    releaseStream,
    reportFailure,
    runTranscription,
    state,
    transition,
  ]);

  const retryTranscription = useCallback(() => {
    const audio = retryAudioRef.current;
    if (!audio || state === 'transcribing') return;
    setNotice(null);
    void runTranscription(audio, true);
  }, [runTranscription, state]);

  const busy = ['requesting_permission', 'stopping', 'transcribing'].includes(state);
  const canRetry = Boolean(retryAudioRef.current)
    && (state === 'network_failed' || state === 'transcription_failed');

  return (
    <div className="flex min-w-0 items-center gap-1">
      {state === 'listening' ? (
        <>
          <button
            type="button"
            onClick={() => finishRecording(false)}
            className="flex h-9 items-center gap-1.5 rounded-xl bg-rose-600 px-2.5 text-[12px] font-medium text-white shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-rose-600 focus-visible:ring-offset-2"
            aria-label={`إيقاف التسجيل. المدة ${formatElapsed(elapsedMs)}`}
          >
            <Square className="h-3.5 w-3.5" fill="currentColor" />
            {formatElapsed(elapsedMs)}
          </button>
          <button
            type="button"
            onClick={() => finishRecording(true)}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 outline-none focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2"
            aria-label="إلغاء التسجيل الصوتي"
          >
            <X className="h-4 w-4" />
          </button>
        </>
      ) : (
        <>
          {canRetry ? (
            <button
              type="button"
              onClick={retryTranscription}
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 outline-none focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2"
              aria-label="إعادة محاولة تحويل التسجيل إلى نص"
              title="إعادة التحويل"
            >
              <RotateCcw className="h-4 w-4" />
            </button>
          ) : null}
          <button
            type="button"
            disabled={disabled || busy || state === 'unsupported'}
            onClick={() => void startRecording()}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 outline-none transition hover:border-slate-300 hover:text-slate-900 focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40"
            title={statusLabel(state, elapsedMs)}
            aria-label={busy ? statusLabel(state, elapsedMs) : 'بدء الإملاء الصوتي'}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mic className="h-4 w-4" />}
          </button>
        </>
      )}

      <span className="sr-only" role="status" aria-live="polite">
        {notice || statusLabel(state, elapsedMs)}
      </span>
      {notice ? (
        <span
          className={`hidden max-w-[180px] truncate text-[10px] font-medium sm:inline ${state === 'listening' ? 'text-rose-600' : 'text-slate-400'}`}
          aria-hidden="true"
        >
          {notice}
        </span>
      ) : null}
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';
import { Loader2, Mic, Square, X } from 'lucide-react';
import { transcribeSanadAudio } from './assistantVoiceApi';

type Props = {
  disabled?: boolean;
  onTranscript: (text: string) => void;
  onError?: (message: string) => void;
};

const MAX_RECORDING_MS = 90_000;
const PREFERRED_MIME_TYPES = [
  'audio/webm;codecs=opus',
  'audio/ogg;codecs=opus',
  'audio/mp4',
  'audio/webm',
];

function chooseMimeType() {
  if (typeof MediaRecorder === 'undefined') return '';
  return PREFERRED_MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type)) || '';
}

function formatElapsed(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(total / 60).toString().padStart(2, '0');
  const seconds = (total % 60).toString().padStart(2, '0');
  return `${minutes}:${seconds}`;
}

export default function SanadVoiceDictationButton({ disabled, onTranscript, onError }: Props) {
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const startedAtRef = useRef(0);
  const cancelRef = useRef(false);
  const tickerRef = useRef<number | null>(null);
  const timeoutRef = useRef<number | null>(null);

  const clearTimers = () => {
    if (tickerRef.current !== null) window.clearInterval(tickerRef.current);
    if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
    tickerRef.current = null;
    timeoutRef.current = null;
  };

  const releaseStream = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  };

  useEffect(() => () => {
    cancelRef.current = true;
    clearTimers();
    releaseStream();
    try {
      if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
    } catch {
      // Best effort cleanup when leaving the page.
    }
  }, []);

  const finish = (cancel = false) => {
    cancelRef.current = cancel;
    clearTimers();
    if (recorderRef.current?.state === 'recording') {
      recorderRef.current.stop();
    } else {
      releaseStream();
      setRecording(false);
    }
  };

  const startRecording = async () => {
    if (disabled || transcribing) return;
    setNotice(null);
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
        throw new Error('التسجيل الصوتي غير مدعوم في هذا المتصفح.');
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        },
      });
      streamRef.current = stream;
      chunksRef.current = [];
      cancelRef.current = false;

      const mimeType = chooseMimeType();
      const recorder = new MediaRecorder(stream, {
        ...(mimeType ? { mimeType } : {}),
        audioBitsPerSecond: 48_000,
      });
      recorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data?.size) chunksRef.current.push(event.data);
      };

      recorder.onerror = () => {
        clearTimers();
        releaseStream();
        setRecording(false);
        const message = 'حدث خطأ أثناء التسجيل الصوتي.';
        setNotice(message);
        onError?.(message);
      };

      recorder.onstop = async () => {
        clearTimers();
        releaseStream();
        setRecording(false);

        if (cancelRef.current) {
          chunksRef.current = [];
          setElapsedMs(0);
          setNotice(null);
          return;
        }

        const durationMs = Math.max(0, Date.now() - startedAtRef.current);
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || mimeType || 'audio/webm' });
        chunksRef.current = [];
        if (!blob.size) {
          const message = 'لم يتم تسجيل صوت واضح.';
          setNotice(message);
          onError?.(message);
          return;
        }

        setTranscribing(true);
        setNotice('جارٍ تحويل الصوت إلى نص…');
        try {
          const result = await transcribeSanadAudio(blob, durationMs);
          onTranscript(result.transcript);
          setNotice('تم تحويل الصوت إلى نص. راجعه قبل الإرسال.');
        } catch (cause) {
          const message = cause instanceof Error ? cause.message : 'تعذر تحويل الصوت إلى نص.';
          setNotice(message);
          onError?.(message);
        } finally {
          setTranscribing(false);
          setElapsedMs(0);
        }
      };

      recorder.start(250);
      startedAtRef.current = Date.now();
      setElapsedMs(0);
      setRecording(true);
      setNotice('أستمع الآن… اضغط إيقاف عند الانتهاء.');

      tickerRef.current = window.setInterval(() => {
        setElapsedMs(Date.now() - startedAtRef.current);
      }, 250);
      timeoutRef.current = window.setTimeout(() => finish(false), MAX_RECORDING_MS);
    } catch (cause) {
      releaseStream();
      const raw = cause instanceof Error ? cause.message : '';
      const message = /permission|denied|notallowed/i.test(raw)
        ? 'اسمح لسند باستخدام الميكروفون ثم حاول مجددًا.'
        : raw || 'تعذر تشغيل الميكروفون.';
      setNotice(message);
      onError?.(message);
    }
  };

  return (
    <div className="flex min-w-0 items-center gap-1.5">
      {recording ? (
        <>
          <button
            type="button"
            onClick={() => finish(false)}
            className="flex h-9 items-center gap-2 rounded-xl bg-rose-600 px-3 text-xs font-semibold text-white shadow-sm"
            title="إيقاف وتحويل إلى نص"
          >
            <Square className="h-3.5 w-3.5" fill="currentColor" />
            {formatElapsed(elapsedMs)}
          </button>
          <button
            type="button"
            onClick={() => finish(true)}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500"
            title="إلغاء التسجيل"
          >
            <X className="h-4 w-4" />
          </button>
        </>
      ) : (
        <button
          type="button"
          disabled={disabled || transcribing}
          onClick={() => void startRecording()}
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:border-slate-300 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-40"
          title="إملاء صوتي"
          aria-label="إملاء صوتي"
        >
          {transcribing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mic className="h-4 w-4" />}
        </button>
      )}
      {notice ? (
        <span className={`hidden max-w-[230px] truncate text-sm font-medium sm:inline ${recording ? 'text-rose-600' : 'text-slate-400'}`}>
          {notice}
        </span>
      ) : null}
    </div>
  );
}

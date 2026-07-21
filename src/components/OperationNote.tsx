import { useEffect, useRef, useState } from 'react';
import {
  CheckCircle2,
  FileText,
  Loader2,
  Mic,
  Play,
  Save,
  Square,
  Trash2,
  X
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { toLatinDigits } from '../utils/numerals';

const AUDIO_BUCKET = 'operation-note-audio';
const MAX_TEXT_LENGTH = 2000;
const MAX_AUDIO_SECONDS = 180;
const MAX_AUDIO_BYTES = 10 * 1024 * 1024;

type NoteType = 'text' | 'audio';

interface OperationNoteRecord {
  id: string;
  operation_id: string;
  author_user_id: string;
  note_type: NoteType;
  text_content: string | null;
  audio_bucket: string | null;
  audio_path: string | null;
  audio_mime_type: string | null;
  audio_duration_seconds: number | null;
  audio_size_bytes: number | null;
  created_at: string;
  updated_at: string;
}

interface OperationNoteProps {
  operationId: string;
  userId: string;
}

const preferredRecorderMimeType = () => {
  if (typeof MediaRecorder === 'undefined') return '';
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/mp4',
    'audio/webm',
    'audio/ogg;codecs=opus'
  ];
  return candidates.find(type => MediaRecorder.isTypeSupported(type)) || '';
};

const normalizeMimeType = (mimeType: string) => {
  const value = mimeType.split(';')[0].toLowerCase();
  if (value === 'audio/x-m4a') return 'audio/x-m4a';
  if (['audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/ogg', 'audio/wav'].includes(value)) {
    return value;
  }
  return 'audio/webm';
};

const extensionForMimeType = (mimeType: string) => {
  switch (normalizeMimeType(mimeType)) {
    case 'audio/mp4':
    case 'audio/x-m4a':
      return 'm4a';
    case 'audio/mpeg':
      return 'mp3';
    case 'audio/ogg':
      return 'ogg';
    case 'audio/wav':
      return 'wav';
    default:
      return 'webm';
  }
};

const formatDuration = (seconds: number) => {
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return toLatinDigits(`${minutes}:${remaining.toString().padStart(2, '0')}`);
};

export default function OperationNote({ operationId, userId }: OperationNoteProps) {
  const [note, setNote] = useState<OperationNoteRecord | null>(null);
  const [mode, setMode] = useState<NoteType>('text');
  const [textValue, setTextValue] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [isRecording, setIsRecording] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordedSeconds, setRecordedSeconds] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const elapsedRef = useRef(0);
  const mountedRef = useRef(true);

  const clearTimer = () => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const stopTracks = () => {
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
  };

  const revokeAudioUrl = () => {
    setAudioUrl(current => {
      if (current?.startsWith('blob:')) URL.revokeObjectURL(current);
      return null;
    });
  };

  const resetDraftAudio = () => {
    revokeAudioUrl();
    setRecordedBlob(null);
    setRecordedSeconds(0);
    elapsedRef.current = 0;
  };

  const loadNote = async () => {
    setLoading(true);
    setError(null);

    const { data, error: noteError } = await supabase
      .from('operation_notes')
      .select('*')
      .eq('operation_id', operationId)
      .eq('author_user_id', userId)
      .maybeSingle();

    if (!mountedRef.current) return;

    if (noteError) {
      setError('تعذر تحميل ملاحظتك الآن.');
      setLoading(false);
      return;
    }

    const currentNote = (data || null) as OperationNoteRecord | null;
    setNote(currentNote);
    setMode(currentNote?.note_type || 'text');
    setTextValue(currentNote?.text_content || '');
    resetDraftAudio();

    if (currentNote?.note_type === 'audio' && currentNote.audio_path) {
      const { data: signedData, error: signedError } = await supabase.storage
        .from(AUDIO_BUCKET)
        .createSignedUrl(currentNote.audio_path, 60 * 60);

      if (!mountedRef.current) return;
      if (signedError || !signedData?.signedUrl) {
        setError('تم تحميل الملاحظة، لكن تعذر تجهيز التسجيل للتشغيل.');
      } else {
        setAudioUrl(signedData.signedUrl);
      }
    }

    setLoading(false);
  };

  useEffect(() => {
    mountedRef.current = true;
    void loadNote();

    return () => {
      mountedRef.current = false;
      clearTimer();
      if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
      stopTracks();
      if (audioUrl?.startsWith('blob:')) URL.revokeObjectURL(audioUrl);
    };
  }, [operationId, userId]);

  const startRecording = async () => {
    setError(null);
    setMessage(null);
    resetDraftAudio();

    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError('التسجيل الصوتي غير مدعوم في هذا المتصفح أو الجهاز.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      elapsedRef.current = 0;
      setRecordedSeconds(0);

      const mimeType = preferredRecorderMimeType();
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      recorderRef.current = recorder;

      recorder.ondataavailable = event => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };

      recorder.onerror = () => {
        setError('حدث خطأ أثناء التسجيل الصوتي.');
        clearTimer();
        stopTracks();
        setIsRecording(false);
      };

      recorder.onstop = () => {
        clearTimer();
        stopTracks();
        setIsRecording(false);

        const actualMimeType = normalizeMimeType(recorder.mimeType || mimeType || 'audio/webm');
        const blob = new Blob(chunksRef.current, { type: actualMimeType });
        chunksRef.current = [];

        if (blob.size === 0 || elapsedRef.current < 1) {
          setError('التسجيل قصير جدًا أو لم يتم التقاط صوت.');
          return;
        }
        if (blob.size > MAX_AUDIO_BYTES) {
          setError('حجم التسجيل تجاوز 10 ميجابايت. سجّل مقطعًا أقصر.');
          return;
        }

        setRecordedBlob(blob);
        setRecordedSeconds(Math.min(elapsedRef.current, MAX_AUDIO_SECONDS));
        revokeAudioUrl();
        setAudioUrl(URL.createObjectURL(blob));
      };

      recorder.start(1000);
      setIsRecording(true);

      timerRef.current = window.setInterval(() => {
        elapsedRef.current += 1;
        setRecordedSeconds(elapsedRef.current);
        if (elapsedRef.current >= MAX_AUDIO_SECONDS && recorder.state === 'recording') {
          recorder.stop();
        }
      }, 1000);
    } catch (recordingError: any) {
      stopTracks();
      const permissionDenied = recordingError?.name === 'NotAllowedError'
        || recordingError?.name === 'PermissionDeniedError';
      setError(
        permissionDenied
          ? 'لم يتم السماح باستخدام الميكروفون. فعّل الإذن من إعدادات المتصفح أو التطبيق.'
          : 'تعذر تشغيل الميكروفون على هذا الجهاز.'
      );
    }
  };

  const stopRecording = () => {
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
  };

  const saveTextNote = async () => {
    const normalized = textValue.trim();
    if (!normalized) {
      setError('اكتب الملاحظة قبل الحفظ.');
      return;
    }
    if (normalized.length > MAX_TEXT_LENGTH) {
      setError('الملاحظة النصية تتجاوز 2000 حرف.');
      return;
    }

    setSaving(true);
    setError(null);
    setMessage(null);

    const oldAudioPath = note?.note_type === 'audio' ? note.audio_path : null;
    const { error: saveError } = await supabase
      .from('operation_notes')
      .upsert({
        operation_id: operationId,
        author_user_id: userId,
        note_type: 'text',
        text_content: normalized,
        audio_bucket: null,
        audio_path: null,
        audio_mime_type: null,
        audio_duration_seconds: null,
        audio_size_bytes: null
      }, { onConflict: 'operation_id,author_user_id' });

    if (saveError) {
      setError('تعذر حفظ الملاحظة. تأكد أنك تحققت من العملية ثم حاول مجددًا.');
      setSaving(false);
      return;
    }

    if (oldAudioPath) {
      await supabase.storage.from(AUDIO_BUCKET).remove([oldAudioPath]);
    }

    setMessage('تم حفظ الملاحظة النصية.');
    await loadNote();
    setSaving(false);
  };

  const saveAudioNote = async () => {
    if (!recordedBlob || recordedSeconds < 1) {
      setError('سجّل ملاحظة صوتية أولًا.');
      return;
    }
    if (recordedBlob.size > MAX_AUDIO_BYTES) {
      setError('حجم التسجيل تجاوز 10 ميجابايت.');
      return;
    }

    setSaving(true);
    setError(null);
    setMessage(null);

    const mimeType = normalizeMimeType(recordedBlob.type);
    const extension = extensionForMimeType(mimeType);
    const filePath = `${userId}/${operationId}/${crypto.randomUUID()}.${extension}`;
    const oldAudioPath = note?.note_type === 'audio' ? note.audio_path : null;

    const { error: uploadError } = await supabase.storage
      .from(AUDIO_BUCKET)
      .upload(filePath, recordedBlob, {
        contentType: mimeType,
        cacheControl: '3600',
        upsert: false
      });

    if (uploadError) {
      setError('تعذر رفع التسجيل الصوتي. تحقق من الاتصال وحاول مجددًا.');
      setSaving(false);
      return;
    }

    const { error: saveError } = await supabase
      .from('operation_notes')
      .upsert({
        operation_id: operationId,
        author_user_id: userId,
        note_type: 'audio',
        text_content: null,
        audio_bucket: AUDIO_BUCKET,
        audio_path: filePath,
        audio_mime_type: mimeType,
        audio_duration_seconds: recordedSeconds,
        audio_size_bytes: recordedBlob.size
      }, { onConflict: 'operation_id,author_user_id' });

    if (saveError) {
      await supabase.storage.from(AUDIO_BUCKET).remove([filePath]);
      setError('رُفع التسجيل، لكن تعذر ربطه بالعملية. لم يتم حفظ الملاحظة.');
      setSaving(false);
      return;
    }

    if (oldAudioPath && oldAudioPath !== filePath) {
      await supabase.storage.from(AUDIO_BUCKET).remove([oldAudioPath]);
    }

    setMessage('تم حفظ الملاحظة الصوتية.');
    await loadNote();
    setSaving(false);
  };

  const deleteNote = async () => {
    if (!note || deleting) return;
    if (!window.confirm('هل تريد حذف ملاحظتك من هذه العملية؟')) return;

    setDeleting(true);
    setError(null);
    setMessage(null);

    const oldAudioPath = note.note_type === 'audio' ? note.audio_path : null;
    const { error: deleteError } = await supabase
      .from('operation_notes')
      .delete()
      .eq('id', note.id)
      .eq('author_user_id', userId);

    if (deleteError) {
      setError('تعذر حذف الملاحظة.');
      setDeleting(false);
      return;
    }

    if (oldAudioPath) {
      await supabase.storage.from(AUDIO_BUCKET).remove([oldAudioPath]);
    }

    setNote(null);
    setTextValue('');
    resetDraftAudio();
    setMode('text');
    setMessage('تم حذف الملاحظة.');
    setDeleting(false);
  };

  if (loading) {
    return (
      <div className="bg-white rounded-3xl border border-slate-200 p-5 flex items-center justify-center gap-2 text-xs text-slate-500">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span>جاري تحميل ملاحظتك...</span>
      </div>
    );
  }

  return (
    <section className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden" dir="rtl">
      <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-slate-900">ملاحظتي على العملية</h3>
          <p className="text-[10px] text-slate-500 mt-1">خاصة بك ولا تظهر لبقية المستخدمين.</p>
        </div>
        {note && (
          <button
            type="button"
            onClick={deleteNote}
            disabled={deleting || saving || isRecording}
            className="w-9 h-9 rounded-xl border border-rose-200 text-rose-600 flex items-center justify-center disabled:opacity-50"
            aria-label="حذف الملاحظة"
          >
            {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
          </button>
        )}
      </div>

      <div className="p-5 space-y-4">
        <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-2xl">
          <button
            type="button"
            onClick={() => {
              if (isRecording) return;
              setMode('text');
              setError(null);
              setMessage(null);
              resetDraftAudio();
            }}
            className={`py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all ${
              mode === 'text' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
            }`}
          >
            <FileText className="w-4 h-4" />
            نصية
          </button>
          <button
            type="button"
            onClick={() => {
              if (isRecording) return;
              setMode('audio');
              setError(null);
              setMessage(null);
            }}
            className={`py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all ${
              mode === 'audio' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
            }`}
          >
            <Mic className="w-4 h-4" />
            صوتية
          </button>
        </div>

        {mode === 'text' ? (
          <div className="space-y-3">
            <textarea
              value={textValue}
              onChange={event => setTextValue(event.target.value.slice(0, MAX_TEXT_LENGTH))}
              maxLength={MAX_TEXT_LENGTH}
              rows={4}
              placeholder="اكتب ملاحظتك على هذه العملية..."
              className="w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
            />
            <div className="flex items-center justify-between text-[10px] text-slate-400">
              <span>حتى 2000 حرف</span>
              <span>{toLatinDigits(`${textValue.length}/${MAX_TEXT_LENGTH}`)}</span>
            </div>
            <button
              type="button"
              onClick={saveTextNote}
              disabled={saving || !textValue.trim()}
              className="w-full bg-slate-900 text-white py-3 rounded-2xl text-xs font-bold flex items-center justify-center gap-2 disabled:opacity-40"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              حفظ الملاحظة النصية
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-center space-y-3">
              {isRecording ? (
                <>
                  <div className="w-14 h-14 mx-auto rounded-full bg-rose-100 text-rose-600 flex items-center justify-center animate-pulse">
                    <Mic className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-900">جاري التسجيل</p>
                    <p className="font-mono text-lg font-bold text-rose-600 mt-1">{formatDuration(recordedSeconds)}</p>
                  </div>
                  <button
                    type="button"
                    onClick={stopRecording}
                    className="mx-auto px-5 py-2.5 rounded-xl bg-rose-600 text-white text-xs font-bold flex items-center justify-center gap-2"
                  >
                    <Square className="w-4 h-4 fill-current" />
                    إيقاف التسجيل
                  </button>
                </>
              ) : audioUrl ? (
                <>
                  <audio src={audioUrl} controls className="w-full" preload="metadata" />
                  <div className="flex items-center justify-center gap-2 text-[10px] text-slate-500">
                    <Play className="w-3.5 h-3.5" />
                    <span>المدة: {formatDuration(recordedBlob ? recordedSeconds : (note?.audio_duration_seconds || 0))}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={startRecording}
                      className="py-2.5 rounded-xl border border-slate-200 text-slate-700 text-xs font-bold flex items-center justify-center gap-2"
                    >
                      <Mic className="w-4 h-4" />
                      تسجيل جديد
                    </button>
                    {recordedBlob && (
                      <button
                        type="button"
                        onClick={resetDraftAudio}
                        className="py-2.5 rounded-xl border border-slate-200 text-slate-500 text-xs font-bold flex items-center justify-center gap-2"
                      >
                        <X className="w-4 h-4" />
                        إلغاء المسودة
                      </button>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <div className="w-14 h-14 mx-auto rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center">
                    <Mic className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-900">سجّل ملاحظة صوتية</p>
                    <p className="text-[10px] text-slate-500 mt-1">الحد الأقصى 3 دقائق</p>
                  </div>
                  <button
                    type="button"
                    onClick={startRecording}
                    className="mx-auto px-5 py-2.5 rounded-xl bg-emerald-600 text-white text-xs font-bold flex items-center justify-center gap-2"
                  >
                    <Mic className="w-4 h-4" />
                    بدء التسجيل
                  </button>
                </>
              )}
            </div>

            {recordedBlob && !isRecording && (
              <button
                type="button"
                onClick={saveAudioNote}
                disabled={saving}
                className="w-full bg-slate-900 text-white py-3 rounded-2xl text-xs font-bold flex items-center justify-center gap-2 disabled:opacity-40"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                حفظ الملاحظة الصوتية
              </button>
            )}
          </div>
        )}

        {message && (
          <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-100 text-emerald-800 text-[11px] flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{message}</span>
          </div>
        )}
        {error && (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-100 text-rose-800 text-[11px]">
            {error}
          </div>
        )}
      </div>
    </section>
  );
}

import { useRef, useState } from 'react';
import {
  AlertTriangle,
  FileJson,
  FileText,
  Image as ImageIcon,
  Link2,
  Loader2,
  Paperclip,
  RefreshCcw,
  Sparkles,
  Trash2,
} from 'lucide-react';
import {
  SANAD_ATTACHMENT_ACCEPT,
  analyzeSanadAgentAttachment,
  deleteSanadAgentAttachment,
  uploadSanadAgentAttachment,
  type SanadAgentAttachment,
} from './assistantAttachmentApi';

type Props = {
  threadId: string | null;
  businessId: string | null;
  disabled?: boolean;
  attachments: SanadAgentAttachment[];
  onChange: (attachments: SanadAgentAttachment[]) => void;
  onRequestThread: () => Promise<string>;
  onError?: (message: string) => void;
};

const MAX_PER_TURN = 3;

function iconForMime(mime: string) {
  if (mime.startsWith('image/')) return ImageIcon;
  if (mime === 'application/json') return FileJson;
  return FileText;
}

function prettySize(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function statusLabel(attachment: SanadAgentAttachment) {
  if (attachment.status === 'analyzing' || attachment.status === 'uploaded') return 'جارٍ التحليل';
  if (attachment.status === 'failed') return 'تعذر التحليل';
  if (attachment.suggestion?.kind === 'link_existing') return 'تطابق محتمل';
  if (attachment.suggestion?.kind === 'draft_candidate') return 'مسودة مقترحة';
  return 'جاهز للمراجعة';
}

function statusClasses(attachment: SanadAgentAttachment) {
  if (attachment.status === 'failed') return 'bg-rose-50 text-rose-700 border-rose-100';
  if (attachment.suggestion?.kind === 'link_existing') return 'bg-sky-50 text-sky-700 border-sky-100';
  if (attachment.suggestion?.kind === 'draft_candidate') return 'bg-violet-50 text-violet-700 border-violet-100';
  if (attachment.status === 'ready') return 'bg-emerald-50 text-emerald-700 border-emerald-100';
  return 'bg-slate-50 text-slate-500 border-slate-100';
}

export function SanadAttachmentPreview({
  attachment,
  compact = false,
}: {
  attachment: SanadAgentAttachment;
  compact?: boolean;
}) {
  const Icon = iconForMime(attachment.mime_type);
  const summary = attachment.analysis?.summary?.trim();
  const target = attachment.suggestion?.target;

  return (
    <div className={`rounded-2xl border border-slate-200/80 bg-white shadow-sm ${compact ? 'p-2.5' : 'p-3'}`}>
      <div className="flex min-w-0 items-start gap-2.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[10px] font-black text-slate-800">{attachment.file_name}</p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <span className="text-[8px] text-slate-400">{prettySize(attachment.file_size)}</span>
            <span className={`rounded-full border px-2 py-0.5 text-[7px] font-black ${statusClasses(attachment)}`}>
              {statusLabel(attachment)}
            </span>
          </div>
        </div>
      </div>

      {!compact && summary ? (
        <p className="mt-2.5 text-[9px] leading-5 text-slate-600">{summary}</p>
      ) : null}

      {!compact && attachment.suggestion?.kind === 'link_existing' && target?.href ? (
        <a
          href={target.href}
          className="mt-2.5 inline-flex items-center gap-1.5 rounded-xl bg-sky-50 px-2.5 py-2 text-[9px] font-black text-sky-700"
        >
          <Link2 className="h-3.5 w-3.5" />
          فتح المستند المطابق المحتمل
        </a>
      ) : null}

      {!compact && attachment.suggestion?.kind === 'draft_candidate' ? (
        <div className="mt-2.5 flex items-start gap-2 rounded-xl bg-violet-50 p-2.5 text-violet-800">
          <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <p className="text-[8px] leading-4">
            استخرج سند بيانات تصلح لتجهيز مسودة، لكن لم تُنشأ أي عملية. يجب مراجعتها واعتمادها في مرحلة الإجراء.
          </p>
        </div>
      ) : null}
    </div>
  );
}

export default function SanadAttachmentComposer({
  threadId,
  businessId,
  disabled,
  attachments,
  onChange,
  onRequestThread,
  onError,
}: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busyNames, setBusyNames] = useState<string[]>([]);

  const report = (cause: unknown, fallback: string) => {
    const message = cause instanceof Error && cause.message ? cause.message : fallback;
    onError?.(message);
  };

  const addFiles = async (files: FileList | null) => {
    if (!files?.length || disabled) return;
    const room = Math.max(0, MAX_PER_TURN - attachments.length);
    if (!room) {
      onError?.('يمكن إرفاق ثلاثة ملفات كحد أقصى في الرسالة الواحدة.');
      return;
    }

    const selected = Array.from(files).slice(0, room);
    let activeThreadId = threadId;
    if (!activeThreadId) {
      try {
        activeThreadId = await onRequestThread();
      } catch (cause) {
        report(cause, 'تعذر تجهيز المحادثة للمرفق.');
        return;
      }
    }

    let nextAttachments = attachments;
    for (const file of selected) {
      setBusyNames((current) => [...current, file.name]);
      try {
        const attachment = await uploadSanadAgentAttachment(file, activeThreadId, businessId);
        nextAttachments = [...nextAttachments.filter((item) => item.id !== attachment.id), attachment];
        onChange(nextAttachments);
      } catch (cause) {
        report(cause, `تعذر رفع ${file.name}.`);
      } finally {
        setBusyNames((current) => current.filter((name) => name !== file.name));
      }
    }

    if (inputRef.current) inputRef.current.value = '';
  };

  const remove = async (attachment: SanadAgentAttachment) => {
    try {
      await deleteSanadAgentAttachment(attachment);
      onChange(attachments.filter((item) => item.id !== attachment.id));
    } catch (cause) {
      report(cause, 'تعذر حذف المرفق.');
    }
  };

  const retry = async (attachment: SanadAgentAttachment) => {
    setBusyNames((current) => [...current, attachment.file_name]);
    try {
      const updated = await analyzeSanadAgentAttachment(attachment.id);
      onChange(attachments.map((item) => item.id === attachment.id ? updated : item));
    } catch (cause) {
      report(cause, 'تعذر إعادة تحليل المرفق.');
    } finally {
      setBusyNames((current) => current.filter((name) => name !== attachment.file_name));
    }
  };

  const busy = busyNames.length > 0;

  return (
    <div className="min-w-0">
      <input
        ref={inputRef}
        type="file"
        accept={SANAD_ATTACHMENT_ACCEPT}
        multiple
        className="hidden"
        onChange={(event) => void addFiles(event.target.files)}
      />

      <button
        type="button"
        disabled={disabled || busy || attachments.length >= MAX_PER_TURN}
        onClick={() => inputRef.current?.click()}
        className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:border-slate-300 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-40"
        title="إرفاق صورة أو مستند"
        aria-label="إرفاق صورة أو مستند"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
      </button>

      {attachments.length > 0 ? (
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {attachments.map((attachment) => {
            const isBusy = busyNames.includes(attachment.file_name);
            return (
              <div key={attachment.id} className="relative">
                <SanadAttachmentPreview attachment={attachment} compact />
                <div className="absolute left-1.5 top-1.5 flex items-center gap-1">
                  {attachment.status === 'failed' ? (
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => void retry(attachment)}
                      className="flex h-7 w-7 items-center justify-center rounded-lg bg-white text-amber-600 shadow-sm ring-1 ring-slate-100"
                      title="إعادة التحليل"
                    >
                      {isBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCcw className="h-3.5 w-3.5" />}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => void remove(attachment)}
                    className="flex h-7 w-7 items-center justify-center rounded-lg bg-white text-slate-400 shadow-sm ring-1 ring-slate-100 hover:text-rose-600"
                    title="إزالة المرفق"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                {attachment.status === 'failed' ? (
                  <div className="mt-1 flex items-center gap-1 px-1 text-[8px] text-rose-600">
                    <AlertTriangle className="h-3 w-3" />
                    {attachment.error_code || 'تعذر تحليل الملف'}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

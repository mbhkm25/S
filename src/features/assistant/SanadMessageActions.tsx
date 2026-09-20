import { useState } from 'react';
import { Check, Copy, Share2, Star, ThumbsDown, ThumbsUp } from 'lucide-react';

type Props = {
  content: string;
  starred: boolean;
  rating: -1 | 1 | null;
  disabled?: boolean;
  onStar: (value: boolean) => void;
  onRate: (value: -1 | 1 | null) => void;
};

export default function SanadMessageActions({
  content,
  starred,
  rating,
  disabled = false,
  onStar,
  onRate,
}: Props) {
  const [copied, setCopied] = useState(false);
  const [shared, setShared] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      setCopied(false);
    }
  };

  const share = async () => {
    try {
      if (navigator.share) {
        await navigator.share({ text: content });
      } else {
        await navigator.clipboard.writeText(content);
      }
      setShared(true);
      window.setTimeout(() => setShared(false), 1400);
    } catch {
      setShared(false);
    }
  };

  const base = 'inline-flex h-8 min-w-8 items-center justify-center rounded-lg px-2 text-[9px] font-bold transition disabled:cursor-not-allowed disabled:opacity-40';

  return (
    <div className="sanad-message-actions flex flex-wrap items-center gap-1" aria-label="إجراءات الرسالة">
      <button type="button" disabled={disabled} onClick={() => void copy()} className={`${base} text-slate-400 hover:bg-slate-100 hover:text-slate-700`} title="نسخ">
        {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
      <button type="button" disabled={disabled} onClick={() => void share()} className={`${base} text-slate-400 hover:bg-slate-100 hover:text-slate-700`} title="مشاركة">
        {shared ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Share2 className="h-3.5 w-3.5" />}
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onStar(!starred)}
        className={`${base} ${starred ? 'bg-amber-50 text-amber-600' : 'text-slate-400 hover:bg-amber-50 hover:text-amber-600'}`}
        title={starred ? 'إزالة التمييز' : 'تمييز'}
        aria-pressed={starred}
      >
        <Star className="h-3.5 w-3.5" fill={starred ? 'currentColor' : 'none'} />
      </button>
      <span className="mx-0.5 h-4 w-px bg-slate-200" aria-hidden="true" />
      <button
        type="button"
        disabled={disabled}
        onClick={() => onRate(rating === 1 ? null : 1)}
        className={`${base} ${rating === 1 ? 'bg-emerald-50 text-emerald-600' : 'text-slate-400 hover:bg-emerald-50 hover:text-emerald-600'}`}
        title="مفيد"
        aria-pressed={rating === 1}
      >
        <ThumbsUp className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onRate(rating === -1 ? null : -1)}
        className={`${base} ${rating === -1 ? 'bg-rose-50 text-rose-600' : 'text-slate-400 hover:bg-rose-50 hover:text-rose-600'}`}
        title="غير مفيد"
        aria-pressed={rating === -1}
      >
        <ThumbsDown className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

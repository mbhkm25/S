import { useEffect, useRef, useState } from 'react';
import { FileImage, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';

type PreviewResponse = {
  ok?: boolean;
  status?: string;
  available?: boolean;
  signed_url?: string;
  retry_after_seconds?: number;
};

export default function PaymentInboxPreview({ publicToken, entity }: { publicToken: string; entity: string }) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [retryTick, setRetryTick] = useState(0);

  useEffect(() => {
    const node = hostRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) {
        setVisible(true);
        observer.disconnect();
      }
    }, { rootMargin: '180px' });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    setUrl(null);
    setRetryTick(0);
  }, [publicToken]);

  useEffect(() => {
    if (!visible || !publicToken || url) return;
    let cancelled = false;
    let retryTimer: number | undefined;
    setLoading(true);

    void supabase.functions.invoke<PreviewResponse>('sanad-operation-preview-access', {
      body: { public_token: publicToken, request_processing: false },
    }).then(({ data, error }) => {
      if (cancelled) return;
      if (!error && data?.ok && data.available && data.signed_url) {
        setUrl(data.signed_url);
        return;
      }

      if (!error && data?.ok && !data.available) {
        const seconds = Math.min(15, Math.max(2, Number(data.retry_after_seconds || 5)));
        retryTimer = window.setTimeout(() => {
          if (!cancelled) setRetryTick(value => value + 1);
        }, seconds * 1000);
      }
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });

    return () => {
      cancelled = true;
      if (retryTimer !== undefined) window.clearTimeout(retryTimer);
    };
  }, [publicToken, retryTick, url, visible]);

  return (
    <div ref={hostRef} className="relative aspect-[16/7] overflow-hidden rounded-[1.65rem] border border-white/80 bg-gradient-to-br from-violet-100 via-rose-50 to-amber-50 shadow-inner">
      {url ? (
        <img src={url} alt={`معاينة إشعار ${entity}`} className="h-full w-full object-cover object-top" loading="lazy" />
      ) : (
        <div className="flex h-full items-center justify-center text-slate-400">
          {loading ? <Loader2 className="h-6 w-6 animate-spin" /> : <FileImage className="h-8 w-8" />}
        </div>
      )}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-slate-950/35 to-transparent" />
      <span className="absolute bottom-3 right-3 rounded-full bg-white/90 px-3 py-1 text-[9px] font-black text-slate-700 shadow-sm backdrop-blur">معاينة الإشعار</span>
    </div>
  );
}

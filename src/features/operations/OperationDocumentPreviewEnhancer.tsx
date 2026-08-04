import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Image as ImageIcon, Loader2, Maximize2, RefreshCw, X, ZoomIn, ZoomOut } from 'lucide-react';
import { supabase } from '../../lib/supabase';

type PreviewResponse = {
  ok?: boolean;
  status?: 'pending' | 'processing' | 'ready' | 'failed' | 'not_required' | string;
  available?: boolean;
  signed_url?: string;
  mime_type?: string;
  size?: number | null;
  width?: number | null;
  height?: number | null;
  generated_at?: string | null;
  retry_after_seconds?: number;
};

type ViewState = 'idle' | 'pending' | 'ready' | 'failed';
const TOKEN_PATTERN = /\/v\/([0-9a-fA-F-]{36})(?:\/|$)/;

function currentToken(): string | null {
  return window.location.pathname.match(TOKEN_PATTERN)?.[1] || null;
}

function findOriginalPreviewContainer(card: HTMLElement): HTMLElement | null {
  const iframe = card.querySelector('iframe');
  if (iframe instanceof HTMLElement) return iframe.parentElement;
  const originalImage = card.querySelector('img[alt="Original Document Evidence"]');
  if (originalImage instanceof HTMLElement) return originalImage.parentElement;
  return null;
}

function formatBytes(value?: number | null): string | null {
  if (!value || value <= 0) return null;
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

export default function OperationDocumentPreviewEnhancer() {
  const [token, setToken] = useState<string | null>(() => currentToken());
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [originalPreview, setOriginalPreview] = useState<HTMLElement | null>(null);
  const [state, setState] = useState<ViewState>('idle');
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const next = currentToken();
      setToken(previous => previous === next ? previous : next);
    }, 350);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!token) {
      setState('idle');
      setPreview(null);
      return;
    }

    let cancelled = false;
    let retryTimer: number | null = null;
    const startedAt = Date.now();

    const load = async () => {
      try {
        const { data, error } = await supabase.functions.invoke<PreviewResponse>('sanad-operation-preview-access', {
          body: { public_token: token, request_processing: true },
        });
        if (cancelled) return;
        if (error || !data?.ok) {
          setState('failed');
          return;
        }
        setPreview(data);
        if (data.available && data.signed_url) {
          setState('ready');
          return;
        }
        if (data.status === 'failed' || data.status === 'not_required') {
          setState('failed');
          return;
        }
        setState('pending');
        if (Date.now() - startedAt < 2 * 60_000) {
          const seconds = Math.max(4, Math.min(Number(data.retry_after_seconds || 8), 15));
          retryTimer = window.setTimeout(load, seconds * 1000);
        }
      } catch {
        if (!cancelled) setState('failed');
      }
    };

    void load();
    return () => {
      cancelled = true;
      if (retryTimer) window.clearTimeout(retryTimer);
    };
  }, [token, attempt]);

  useEffect(() => {
    if (!token) return;
    let disposed = false;
    const attach = () => {
      if (disposed) return;
      const card = document.getElementById('evidence_preview_card');
      if (!card) return;
      const original = findOriginalPreviewContainer(card);
      setOriginalPreview(original);
      let portalHost = document.getElementById('sanad_operation_webp_preview_host');
      if (!(portalHost instanceof HTMLElement)) {
        portalHost = document.createElement('div');
        portalHost.id = 'sanad_operation_webp_preview_host';
        if (original) card.insertBefore(portalHost, original);
        else card.appendChild(portalHost);
      }
      setHost(portalHost);
    };
    attach();
    const observer = new MutationObserver(attach);
    observer.observe(document.body, { childList: true, subtree: true });
    const timer = window.setInterval(attach, 500);
    return () => {
      disposed = true;
      observer.disconnect();
      window.clearInterval(timer);
      document.getElementById('sanad_operation_webp_preview_host')?.remove();
    };
  }, [token]);

  useEffect(() => {
    if (!originalPreview) return;
    const previousDisplay = originalPreview.style.display;
    originalPreview.style.display = state === 'ready' ? 'none' : previousDisplay;
    return () => { originalPreview.style.display = previousDisplay; };
  }, [originalPreview, state]);

  useEffect(() => { if (!fullscreen) setZoom(1); }, [fullscreen]);

  const meta = useMemo(() => {
    const pieces = ['معاينة WebP سريعة'];
    const size = formatBytes(preview?.size);
    if (size) pieces.push(size);
    return pieces.join(' · ');
  }, [preview?.size]);

  if (!host || !token || state === 'idle' || state === 'failed') return null;

  const content = state === 'pending' ? (
    <div className="mb-3 flex items-center justify-between gap-3 rounded-2xl border border-emerald-100 bg-emerald-50/70 px-3 py-2.5" role="status" aria-live="polite">
      <div className="flex min-w-0 items-center gap-2.5">
        <Loader2 className="h-4 w-4 shrink-0 animate-spin text-emerald-600" />
        <div className="min-w-0">
          <p className="text-[11px] font-bold text-slate-800">المستند الأصلي متاح الآن</p>
          <p className="text-[9px] leading-4 text-slate-500">يجري إعداد نسخة محسّنة للعرض، وستحل محل المعاينة تلقائيًا.</p>
        </div>
      </div>
      <button type="button" onClick={() => setAttempt(value => value + 1)} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-emerald-100 bg-white text-slate-600" aria-label="تحديث حالة المعاينة">
        <RefreshCw className="h-3.5 w-3.5" />
      </button>
    </div>
  ) : (
    <div className="space-y-2.5">
      <button type="button" onClick={() => setFullscreen(true)} className="group relative flex min-h-[220px] w-full items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-slate-100" aria-label="فتح معاينة المستند بالحجم الكامل">
        <img src={preview?.signed_url} alt="معاينة سريعة للمستند المالي" className="max-h-[48dvh] w-full object-contain" />
        <span className="absolute bottom-3 left-3 inline-flex items-center gap-1.5 rounded-xl bg-slate-950/75 px-3 py-2 text-[10px] font-bold text-white shadow-lg backdrop-blur"><Maximize2 className="h-3.5 w-3.5" />عرض الصورة</span>
      </button>
      <div className="flex items-center justify-between gap-2 px-1 text-[9px] text-slate-400"><span className="inline-flex items-center gap-1"><ImageIcon className="h-3.5 w-3.5" />{meta}</span><span>الملف الأصلي محفوظ دون تعديل</span></div>
    </div>
  );

  return <>
    {createPortal(content, host)}
    {fullscreen && preview?.signed_url ? createPortal(
      <div className="fixed inset-0 z-[220] flex flex-col bg-black/95" dir="rtl" role="dialog" aria-modal="true" aria-label="معاينة المستند">
        <div className="flex items-center justify-between px-4 pb-3 pt-[calc(12px+env(safe-area-inset-top))] text-white"><div><p className="text-sm font-bold">معاينة المستند</p><p className="text-[10px] text-white/60">نسخة WebP محسّنة للعرض السريع</p></div><button type="button" onClick={() => setFullscreen(false)} className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10" aria-label="إغلاق المعاينة"><X className="h-5 w-5" /></button></div>
        <div className="min-h-0 flex-1 overflow-auto px-3 py-2"><div className="flex min-h-full items-center justify-center"><img src={preview.signed_url} alt="معاينة المستند بالحجم الكامل" className="max-w-none origin-center object-contain transition-transform" style={{ width: `${Math.max(100, zoom * 100)}%`, transform: `scale(${zoom})` }} /></div></div>
        <div className="flex items-center justify-center gap-3 border-t border-white/10 bg-black/80 px-4 pb-[calc(12px+env(safe-area-inset-bottom))] pt-3"><button type="button" onClick={() => setZoom(value => Math.max(0.75, value - 0.25))} className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white" aria-label="تصغير"><ZoomOut className="h-5 w-5" /></button><span className="min-w-16 text-center text-xs font-bold text-white">{Math.round(zoom * 100)}%</span><button type="button" onClick={() => setZoom(value => Math.min(3, value + 0.25))} className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white" aria-label="تكبير"><ZoomIn className="h-5 w-5" /></button></div>
      </div>, document.body) : null}
  </>;
}

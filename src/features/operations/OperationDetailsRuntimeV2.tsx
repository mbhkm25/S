import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock3,
  ExternalLink,
  History,
  Inbox,
  Loader2,
  Maximize2,
  RefreshCw,
  ShieldCheck,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import FinancialEntityLogo from '../../components/FinancialEntityLogo';
import { supabase } from '../../lib/supabase';
import { requestOperationFileAccess } from '../../lib/operationFileAccess';
import { claimPaymentInboxItem, type PaymentInboxItem } from '../../lib/paymentInboxApi';
import { toLatinDigits } from '../../lib/digits';
import { getCurrencyPresentation } from '../../lib/currencyRegistry';

type Tab = 'operation' | 'document' | 'record';
type PreviewState = 'idle' | 'pending' | 'ready' | 'failed';
type AnalysisState = 'ready' | 'processing' | 'retrying' | 'failed';

type Runtime = {
  contract_version: number;
  read_only: boolean;
  operation: {
    id: string;
    public_token: string;
    status?: string | null;
    ai_status?: string | null;
    financial_entity?: string | null;
    financial_entity_code?: string | null;
    amount?: number | string | null;
    currency?: string | null;
    receiver_name?: string | null;
    receiver_account?: string | null;
    reference_number?: string | null;
    confidence_score?: number | null;
    review_status?: string | null;
  };
  timing: {
    transaction_at?: string | null;
    received_at?: string | null;
    delta_seconds?: number | null;
  };
  document: {
    original_mime_type?: string | null;
    preview_status?: string | null;
    preview_size?: number | null;
    preview_pipeline_version?: string | null;
  };
  inbox?: null | {
    id: string;
    business_id: string;
    business_name?: string | null;
    status: string;
    row_version: number;
    claimed_by_name?: string | null;
    completed_by_name?: string | null;
    is_supervisor?: boolean;
    permissions?: {
      can_claim?: boolean;
      can_complete?: boolean;
    };
  };
  verification: {
    verified_by_name?: string | null;
    verified_at?: string | null;
  };
};

type PreviewResponse = {
  status?: string;
  available?: boolean;
  signed_url?: string;
  retry_after_seconds?: number;
};

const TOKEN_PATTERN = /\/v\/([0-9a-fA-F-]{36})(?:\/|$)/;
const ANALYSIS_POLL_MS = 3500;
const MIN_PREVIEW_ZOOM = 1;
const MAX_PREVIEW_ZOOM = 4;

type PreviewPoint = { x: number; y: number };
type PreviewGesture = {
  distance: number;
  center: PreviewPoint;
  zoom: number;
  pan: PreviewPoint;
};

function clampPreviewZoom(value: number) {
  return Math.min(MAX_PREVIEW_ZOOM, Math.max(MIN_PREVIEW_ZOOM, value));
}

function pointerDistance(a: PreviewPoint, b: PreviewPoint) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function pointerCenter(a: PreviewPoint, b: PreviewPoint): PreviewPoint {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function currentToken() {
  return window.location.pathname.match(TOKEN_PATTERN)?.[1] || null;
}

function fmt(value?: string | null, fallback = 'غير متوفر') {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return toLatinDigits(new Intl.DateTimeFormat('ar-YE', {
    year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(date));
}

function fmtBytes(value?: number | null) {
  if (!value) return null;
  if (value < 1024) return `${value} B`;
  if (value < 1048576) return `${Math.round(value / 1024)} KB`;
  return `${(value / 1048576).toFixed(1)} MB`;
}

function delayLabel(seconds?: number | null) {
  if (seconds === null || seconds === undefined) return null;
  const abs = Math.abs(seconds);
  const suffix = seconds < 0 ? 'قبل وقت العملية المستخرج' : 'بعد العملية';
  if (abs < 60) return 'وصل إلى سند في الوقت نفسه تقريبًا';
  if (abs < 3600) return `وصل إلى سند ${suffix} بـ ${toLatinDigits(String(Math.round(abs / 60)))} دقيقة`;
  if (abs < 86400) return `وصل إلى سند ${suffix} بـ ${toLatinDigits(String(Math.round(abs / 3600)))} ساعة`;
  return `وصل إلى سند ${suffix} بـ ${toLatinDigits(String(Math.round(abs / 86400)))} يوم`;
}

function statusMeta(status?: string | null): [string, string] {
  if (status === 'new' || status === 'released') return ['جديدة', 'bg-blue-50 text-blue-700 border-blue-100'];
  if (status === 'claimed') return ['قيد المعالجة', 'bg-amber-50 text-amber-800 border-amber-100'];
  if (status === 'review_required') return ['تحتاج مراجعة', 'bg-orange-50 text-orange-800 border-orange-100'];
  if (status === 'completed') return ['مكتملة', 'bg-emerald-50 text-emerald-700 border-emerald-100'];
  if (status === 'rejected') return ['مرفوضة', 'bg-rose-50 text-rose-700 border-rose-100'];
  return ['للاطلاع', 'bg-slate-50 text-slate-600 border-slate-100'];
}

function analysisState(aiStatus?: string | null): AnalysisState {
  if (aiStatus === 'completed') return 'ready';
  if (aiStatus === 'failed') return 'failed';
  if (aiStatus === 'retrying' || aiStatus === 'extraction_retrying') return 'retrying';
  return 'processing';
}

function validRuntime(value: unknown): value is Runtime {
  const runtime = value as Runtime | null;
  return Boolean(runtime?.contract_version && runtime.contract_version >= 2 && runtime.read_only === true && runtime.operation?.id && runtime.operation?.public_token && runtime.timing && runtime.document && runtime.verification);
}

function Fact({ label, value, mono = false, wide = false }: { label: string; value?: string | null; mono?: boolean; wide?: boolean }) {
  if (!value) return null;
  return (
    <div className={`${wide ? 'col-span-2' : ''} min-w-0 rounded-2xl border border-slate-200 bg-slate-50/70 px-3 py-2.5`}>
      <span className="block text-[9px] font-bold text-slate-400">{label}</span>
      <b className={`mt-1 block break-words text-[12px] leading-5 text-slate-900 ${mono ? 'font-mono' : ''}`} dir={mono ? 'ltr' : undefined}>{value}</b>
    </div>
  );
}

function AnalysisNotice({ state }: { state: AnalysisState }) {
  if (state === 'ready') return null;
  const failed = state === 'failed';
  return (
    <div className={`rounded-2xl border p-3 ${failed ? 'border-rose-200 bg-rose-50' : 'border-amber-200 bg-amber-50'}`}>
      <div className="flex items-start gap-2.5">
        {failed ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" /> : <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-amber-600" />}
        <div><p className={`text-[11px] font-black ${failed ? 'text-rose-800' : 'text-amber-900'}`}>{failed ? 'تعذر تحليل بيانات الإشعار تلقائيًا' : 'جارِ تحليل بيانات الإشعار'}</p><p className="mt-1 text-[10px] leading-5 text-slate-600">المستند محفوظ، وستظهر البيانات فور اكتمال المعالجة.</p></div>
      </div>
    </div>
  );
}

export default function OperationDetailsRuntimeV2() {
  const [token, setToken] = useState<string | null>(() => currentToken());
  const [runtime, setRuntime] = useState<Runtime | null>(null);
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [tab, setTab] = useState<Tab>('operation');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [acting, setActing] = useState(false);
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewState, setPreviewState] = useState<PreviewState>('idle');
  const [fullscreen, setFullscreen] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<PreviewPoint>({ x: 0, y: 0 });
  const hiddenRef = useRef(new Map<HTMLElement, string>());
  const previewPointersRef = useRef(new Map<number, PreviewPoint>());
  const previewGestureRef = useRef<PreviewGesture | null>(null);
  const previewDragRef = useRef<{ point: PreviewPoint; pan: PreviewPoint } | null>(null);
  const previewHistoryRef = useRef(false);

  useEffect(() => {
    const id = window.setInterval(() => setToken((value) => currentToken() === value ? value : currentToken()), 300);
    return () => window.clearInterval(id);
  }, []);

  const fetchRuntime = useCallback(async () => {
    if (!token) return null;
    const { data, error: runtimeError } = await supabase.rpc('get_operation_details_runtime', { p_public_token: token });
    if (runtimeError) throw runtimeError;
    if (!validRuntime(data)) throw new Error('عقد تفاصيل العملية غير مكتمل.');
    return data;
  }, [token]);

  const load = useCallback(async () => {
    if (!token) return;
    setError(null);
    try {
      const { data: access, error: accessError } = await supabase.rpc('open_operation_access', { p_public_token: token, p_source: 'app' });
      if (accessError || !access?.allowed) throw accessError || new Error('تعذر فتح العملية.');
      const data = await fetchRuntime();
      if (!data) return;
      setRuntime(data);
      const original = await requestOperationFileAccess(token, 'open').catch(() => null);
      setOriginalUrl(original?.signedUrl || null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذر تجهيز تفاصيل العملية.');
    }
  }, [fetchRuntime, token]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!runtime || !token) return;
    let disposed = false;
    const attach = () => {
      if (disposed) return;
      const details = document.getElementById('details_view');
      if (!details) return;
      let mount = document.getElementById('operation_details_runtime_v2_mount');
      if (!(mount instanceof HTMLElement)) {
        mount = document.createElement('div');
        mount.id = 'operation_details_runtime_v2_mount';
        details.prepend(mount);
      }
      Array.from(details.children).forEach((child) => {
        if (!(child instanceof HTMLElement) || child === mount) return;
        if (!hiddenRef.current.has(child)) hiddenRef.current.set(child, child.style.display);
        child.style.display = 'none';
      });
      details.dataset.operationRuntimeV2 = 'active';
      setHost(mount);
    };
    attach();
    const observer = new MutationObserver(attach);
    observer.observe(document.body, { childList: true, subtree: true });
    const timer = window.setInterval(attach, 500);
    return () => {
      disposed = true;
      observer.disconnect();
      window.clearInterval(timer);
      hiddenRef.current.forEach((display, node) => { node.style.display = display; });
      hiddenRef.current.clear();
      document.getElementById('operation_details_runtime_v2_mount')?.remove();
      document.getElementById('details_view')?.removeAttribute('data-operation-runtime-v2');
      setHost(null);
    };
  }, [runtime, token]);

  useEffect(() => {
    if (token) return;
    setRuntime(null); setHost(null); setFullscreen(false); setPreviewUrl(null); setOriginalUrl(null); setError(null); setMessage(null);
  }, [token]);

  useEffect(() => {
    if (fullscreen) return;
    setZoom(1);
    setPan({ x: 0, y: 0 });
    previewPointersRef.current.clear();
    previewGestureRef.current = null;
    previewDragRef.current = null;
  }, [fullscreen]);

  useEffect(() => {
    if (!runtime || analysisState(runtime.operation.ai_status) === 'ready') return;
    const id = window.setInterval(() => { void fetchRuntime().then((data) => data && setRuntime(data)).catch(() => null); }, ANALYSIS_POLL_MS);
    return () => window.clearInterval(id);
  }, [fetchRuntime, runtime?.operation.ai_status, runtime?.operation.id]);

  useEffect(() => {
    if (!token || !runtime) return;
    let cancelled = false;
    let timer: number | undefined;
    const started = Date.now();
    const poll = async () => {
      const { data, error: previewError } = await supabase.functions.invoke<PreviewResponse>('sanad-operation-preview-access', { body: { public_token: token, request_processing: true } });
      if (cancelled) return;
      if (!previewError && data?.available && data.signed_url) { setPreviewUrl(data.signed_url); setPreviewState('ready'); return; }
      if (previewError || data?.status === 'failed' || Date.now() - started > 30000) { setPreviewState('failed'); return; }
      setPreviewState('pending');
      timer = window.setTimeout(poll, Math.max(4000, Number(data?.retry_after_seconds || 6) * 1000));
    };
    setPreviewState('pending'); void poll();
    return () => { cancelled = true; if (timer) window.clearTimeout(timer); };
  }, [token, runtime?.operation.id]);

  const refresh = useCallback(async () => { const data = await fetchRuntime(); if (data) setRuntime(data); }, [fetchRuntime]);

  const openDocumentPreview = useCallback(() => {
    if (fullscreen) return;
    window.history.pushState({ ...window.history.state, sanadDocumentPreview: true }, '', window.location.href);
    previewHistoryRef.current = true;
    setFullscreen(true);
  }, [fullscreen]);

  const closeDocumentPreview = useCallback(() => {
    if (previewHistoryRef.current && window.history.state?.sanadDocumentPreview) {
      window.history.back();
      return;
    }
    previewHistoryRef.current = false;
    setFullscreen(false);
  }, []);

  useEffect(() => {
    if (!fullscreen) return;
    const handlePopState = () => {
      previewHistoryRef.current = false;
      setFullscreen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeDocumentPreview();
    };
    window.addEventListener('popstate', handlePopState);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('popstate', handlePopState);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [closeDocumentPreview, fullscreen]);

  const updatePreviewZoom = useCallback((nextZoom: number) => {
    const clamped = clampPreviewZoom(nextZoom);
    setZoom(clamped);
    if (clamped === 1) setPan({ x: 0, y: 0 });
  }, []);

  const handlePreviewPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = { x: event.clientX, y: event.clientY };
    previewPointersRef.current.set(event.pointerId, point);
    const points = Array.from(previewPointersRef.current.values()) as PreviewPoint[];
    if (points.length >= 2) {
      const [first, second] = points;
      previewGestureRef.current = {
        distance: Math.max(1, pointerDistance(first, second)),
        center: pointerCenter(first, second),
        zoom,
        pan,
      };
      previewDragRef.current = null;
    } else if (zoom > 1) {
      previewDragRef.current = { point, pan };
    }
  }, [pan, zoom]);

  const handlePreviewPointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (!previewPointersRef.current.has(event.pointerId)) return;
    const point = { x: event.clientX, y: event.clientY };
    previewPointersRef.current.set(event.pointerId, point);
    const points = Array.from(previewPointersRef.current.values()) as PreviewPoint[];
    if (points.length >= 2 && previewGestureRef.current) {
      event.preventDefault();
      const [first, second] = points;
      const gesture = previewGestureRef.current;
      const center = pointerCenter(first, second);
      const nextZoom = clampPreviewZoom(gesture.zoom * (pointerDistance(first, second) / gesture.distance));
      setZoom(nextZoom);
      setPan({
        x: gesture.pan.x + center.x - gesture.center.x,
        y: gesture.pan.y + center.y - gesture.center.y,
      });
      return;
    }
    if (points.length === 1 && zoom > 1 && previewDragRef.current) {
      event.preventDefault();
      const drag = previewDragRef.current;
      setPan({ x: drag.pan.x + point.x - drag.point.x, y: drag.pan.y + point.y - drag.point.y });
    }
  }, [zoom]);

  const handlePreviewPointerEnd = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    previewPointersRef.current.delete(event.pointerId);
    const points = Array.from(previewPointersRef.current.values()) as PreviewPoint[];
    if (points.length < 2) previewGestureRef.current = null;
    if (points.length === 1 && zoom > 1) previewDragRef.current = { point: points[0], pan };
    else if (points.length === 0) previewDragRef.current = null;
    if (zoom <= 1) setPan({ x: 0, y: 0 });
  }, [pan, zoom]);

  const claim = async () => {
    if (!runtime?.inbox) return;
    setActing(true); setError(null); setMessage(null);
    try {
      await claimPaymentInboxItem({ id: runtime.inbox.id, operation_id: runtime.operation.id, public_token: runtime.operation.public_token, business_id: runtime.inbox.business_id, status: runtime.inbox.status, row_version: runtime.inbox.row_version } as PaymentInboxItem);
      await refresh(); setMessage('تم استلام العملية وستبقى مسندة إليك حتى إجراء صريح.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'تعذر استلام العملية.'); }
    finally { setActing(false); }
  };

  const complete = async () => {
    if (!runtime?.inbox || !token) return;
    setActing(true); setError(null); setMessage(null);
    try {
      const { data, error: completeError } = await supabase.rpc('complete_operation_workflow', {
        p_operation_id: runtime.operation.id,
        p_token: token,
        p_business_id: runtime.inbox.business_id,
        p_inbox_id: runtime.inbox.id,
        p_note: null,
        p_source: 'operation_details',
      });
      if (completeError) throw completeError;
      if (data && typeof data === 'object' && (data as { ok?: boolean }).ok === false) throw new Error('تغيرت حالة العملية قبل تنفيذ الاعتماد.');
      await refresh(); setMessage('تم اعتماد العملية وتحديث سجل وارد المدفوعات باسمك.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'تعذر اعتماد العملية.'); }
    finally { setActing(false); }
  };

  const personalVerify = async () => {
    if (!token) return;
    setActing(true); setError(null); setMessage(null);
    try { const { error: verifyError } = await supabase.rpc('verify_operation', { p_token: token, p_note: null }); if (verifyError) throw verifyError; await refresh(); setMessage('تم تسجيل تحققك الشخصي.'); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'تعذر تسجيل التحقق.'); }
    finally { setActing(false); }
  };

  const retryPreview = async () => {
    if (!runtime) return;
    setPreviewState('pending'); setPreviewUrl(null);
    const { error: retryError } = await supabase.rpc('requeue_operation_preview_v2', { p_operation_id: runtime.operation.id });
    if (retryError) { setPreviewState('failed'); setError(retryError.message); return; }
    await supabase.functions.invoke('sanad-operation-preview-worker', { body: {} }).catch(() => null);
  };

  const inboxUrl = useMemo(() => runtime?.inbox ? `/business/manage/operations?${new URLSearchParams({ view: runtime.inbox.status === 'review_required' && runtime.inbox.is_supervisor ? 'payment-inbox-admin' : 'payment-inbox', business_id: runtime.inbox.business_id, operation_id: runtime.operation.id })}` : null, [runtime]);

  if (!runtime || !host) return null;

  const [statusLabel, statusClass] = statusMeta(runtime.inbox?.status);
  const currentAnalysisState = analysisState(runtime.operation.ai_status);
  const analysisReady = currentAnalysisState === 'ready';
  const currency = getCurrencyPresentation(runtime.operation.currency);
  const amount = analysisReady && runtime.operation.amount !== null && runtime.operation.amount !== undefined ? toLatinDigits(String(runtime.operation.amount)) : '—';
  const lag = delayLabel(runtime.timing.delta_seconds);
  const mime = runtime.document.original_mime_type || 'application/pdf';
  const documentUrl = previewState === 'ready' && previewUrl ? previewUrl : originalUrl;

  const action = runtime.inbox ? (
    <div className="grid grid-cols-2 gap-2">
      {runtime.inbox.permissions?.can_claim ? <button onClick={() => void claim()} disabled={acting || !analysisReady || runtime.operation.review_status === 'needs_review'} className="h-12 rounded-2xl border border-slate-200 bg-white text-xs font-black text-slate-800 disabled:opacity-40">استلام العملية</button> : null}
      {runtime.inbox.permissions?.can_complete ? <button onClick={() => void complete()} disabled={acting || !analysisReady || runtime.operation.review_status === 'needs_review'} className="h-12 rounded-2xl bg-emerald-600 text-xs font-black text-white shadow-lg shadow-emerald-600/20 disabled:opacity-40">{acting ? 'جارٍ التنفيذ...' : 'اعتماد العملية'}</button> : null}
      {runtime.inbox.status === 'review_required' && inboxUrl ? <a href={inboxUrl} className="col-span-2 flex h-12 items-center justify-center rounded-2xl bg-amber-600 text-xs font-black text-white">مراجعة العملية في وارد المدفوعات</a> : null}
      {runtime.inbox.status === 'completed' ? <div className="col-span-2 flex h-12 items-center justify-center gap-2 rounded-2xl bg-emerald-50 text-xs font-black text-emerald-700"><CheckCircle2 className="h-4 w-4" />اعتمدها {runtime.inbox.completed_by_name || 'عضو الفريق'}</div> : null}
    </div>
  ) : <button onClick={() => void personalVerify()} disabled={acting || !analysisReady || runtime.operation.review_status === 'needs_review'} className="h-12 w-full rounded-2xl bg-emerald-600 text-xs font-black text-white disabled:opacity-40">تسجيل تحقق شخصي</button>;

  return <>
    {createPortal(
      <section dir="rtl" className="mx-auto max-w-2xl space-y-3 pb-6 font-arabic">
        <div className="flex items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-[10px] text-slate-500 shadow-sm">
          <button type="button" onClick={() => window.history.back()} className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-600" aria-label="الرجوع"><ArrowRight className="h-4 w-4" /></button>
          <span className="inline-flex min-w-0 flex-1 items-center gap-1.5"><Clock3 className="h-3.5 w-3.5 shrink-0" /><span className="truncate">وصل إلى سند: <b className="text-slate-700">{fmt(runtime.timing.received_at)}</b></span></span>
          <span className={`shrink-0 rounded-full border px-2.5 py-1 font-black ${statusClass}`}>{statusLabel}</span>
        </div>

        <article className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm">
          <div className="grid grid-cols-[48px_minmax(0,1fr)_auto] items-center gap-3">
            <FinancialEntityLogo entity={runtime.operation.financial_entity || 'جهة أخرى'} className="h-12 w-12 rounded-2xl border border-slate-100" />
            <div className="min-w-0"><p className="text-[9px] font-bold text-slate-400">الجهة المالية</p><h1 className="truncate text-[15px] font-black text-slate-950">{analysisReady ? runtime.operation.financial_entity || 'جهة مالية أخرى' : 'قيد التحليل'}</h1>{analysisReady && runtime.operation.confidence_score !== null && runtime.operation.confidence_score !== undefined ? <span className="text-[9px] text-slate-400">ثقة الاستخراج {Math.round(Number(runtime.operation.confidence_score) * 100)}%</span> : null}</div>
            <div className="min-w-[92px] text-left"><div className="flex items-end justify-end gap-1.5"><strong className="text-[38px] font-black leading-none tracking-tight text-slate-950">{amount}</strong><span className="mb-0.5 text-[11px] font-black text-emerald-700">{currency.code || runtime.operation.currency || ''}</span></div><span className="mt-1 block text-[9px] font-bold text-slate-500">{analysisReady ? currency.arabicName : 'لم تعتمد العملة بعد'}</span></div>
          </div>
          <div className="my-3 h-px bg-slate-100" />
          <AnalysisNotice state={currentAnalysisState} />
          {analysisReady ? <div className="grid grid-cols-2 gap-2.5"><Fact label="المستلم" value={runtime.operation.receiver_name || undefined} wide /><Fact label="رقم الحساب" value={runtime.operation.receiver_account ? toLatinDigits(String(runtime.operation.receiver_account)) : undefined} mono /><Fact label="المرجع" value={runtime.operation.reference_number ? toLatinDigits(String(runtime.operation.reference_number)) : undefined} mono /><Fact label="وقت العملية" value={fmt(runtime.timing.transaction_at, 'لم يستخرج')} /><Fact label="وصل إلى سند" value={fmt(runtime.timing.received_at)} />{lag ? <div className="col-span-2 rounded-2xl border border-emerald-100 bg-emerald-50/70 px-3 py-2.5 text-[10px] font-bold text-emerald-800">{lag}</div> : null}</div> : null}
        </article>

        <nav className="grid grid-cols-3 rounded-2xl border border-slate-200 bg-slate-100 p-1">{([['operation', 'العملية'], ['document', 'المستند'], ['record', 'السجل']] as Array<[Tab, string]>).map(([value, label]) => <button key={value} onClick={() => setTab(value)} className={`h-10 rounded-xl text-[11px] font-black ${tab === value ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500'}`}>{label}</button>)}</nav>

        {error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-[11px] leading-5 text-rose-700">{error}</div> : null}
        {message ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-[11px] leading-5 text-emerald-800">{message}</div> : null}

        {tab === 'operation' ? <div className="space-y-3"><section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" /><div><h2 className="text-sm font-black text-slate-900">حالة المطابقة والتشغيل</h2><p className="mt-1 text-[11px] leading-6 text-slate-500">فتح الصفحة أو المستند لا يغير حالة العملية. تتغير الحالة فقط عند تنفيذ إجراء صريح.</p></div></div>{runtime.inbox ? <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-[11px] leading-6 text-slate-600"><b className="text-slate-900">{runtime.inbox.business_name}</b><br />الحالة الحالية: {statusLabel}{runtime.inbox.claimed_by_name ? ` · المسؤول: ${runtime.inbox.claimed_by_name}` : ''}</div> : null}</section>{inboxUrl ? <a href={inboxUrl} className="flex h-12 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white text-xs font-black text-slate-800"><Inbox className="h-4 w-4" />فتح وارد المدفوعات</a> : null}</div> : null}

        {tab === 'document' ? <section className="rounded-3xl border border-slate-200 bg-white p-3 shadow-sm"><div className="mb-3 flex items-center justify-between px-1"><div><h2 className="text-sm font-black text-slate-900">المستند المالي</h2><p className="text-[9px] text-slate-400">الأصل محفوظ دون تعديل</p></div><span className="text-[9px] font-bold text-slate-400">{previewState === 'ready' ? 'معاينة كاملة' : 'الأصل'}</span></div>{documentUrl ? <button onClick={openDocumentPreview} className="relative block w-full overflow-hidden rounded-2xl border border-slate-200 bg-white"><div className="flex min-h-[220px] items-center justify-center bg-white">{previewState === 'ready' || !mime.includes('pdf') ? <img src={documentUrl} alt="معاينة المستند" className="block h-auto max-h-[68dvh] w-full object-contain" /> : <iframe src={documentUrl} title="المستند الأصلي" className="h-[520px] w-full bg-white" />}</div><span className="absolute bottom-3 left-3 inline-flex items-center gap-1.5 rounded-xl bg-slate-950/80 px-3 py-2 text-[10px] font-bold text-white"><Maximize2 className="h-3.5 w-3.5" />تكبير</span></button> : <div className="flex min-h-[240px] items-center justify-center rounded-2xl bg-slate-50"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>}{previewState === 'failed' ? <div className="mt-3 flex items-center justify-between gap-2 rounded-2xl bg-slate-50 p-3 text-[10px] text-slate-500"><span>تعذر إعداد المعاينة؛ يعرض سند الأصل.</span><button onClick={() => void retryPreview()} className="inline-flex items-center gap-1 font-black text-slate-700"><RefreshCw className="h-3.5 w-3.5" />إعادة المحاولة</button></div> : null}<div className="mt-3 grid grid-cols-2 gap-2"><button onClick={openDocumentPreview} className="h-11 rounded-2xl border border-slate-200 text-[11px] font-black text-slate-700">تكبير المعاينة</button>{originalUrl ? <a href={originalUrl} target="_blank" rel="noreferrer" className="flex h-11 items-center justify-center gap-1.5 rounded-2xl bg-emerald-600 text-[11px] font-black text-white"><ExternalLink className="h-3.5 w-3.5" />فتح الأصل</a> : null}</div><div className="mt-2 px-1 text-[9px] text-slate-400">{[runtime.document.preview_pipeline_version, fmtBytes(runtime.document.preview_size)].filter(Boolean).join(' · ')}</div></section> : null}

        {tab === 'record' ? <section className="space-y-3 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-center gap-2"><History className="h-5 w-5 text-slate-500" /><h2 className="text-sm font-black text-slate-900">سجل العملية</h2></div><div className="grid grid-cols-2 gap-2 text-[11px]"><Fact label="وقت الإدخال" value={fmt(runtime.timing.received_at)} /><Fact label="وقت العملية" value={fmt(runtime.timing.transaction_at)} /><div className="col-span-2 rounded-2xl border border-slate-200 bg-slate-50 p-3"><span className="text-slate-400">التحقق</span><b className="mt-1 block text-slate-900">{runtime.verification.verified_by_name ? `تحقق ${runtime.verification.verified_by_name}` : 'لم يسجل تحقق شخصي بعد'}</b>{runtime.verification.verified_at ? <span className="mt-1 block text-slate-500">{fmt(runtime.verification.verified_at)}</span> : null}</div></div></section> : null}

        <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm" aria-label="إجراءات العملية"><div className="mb-3"><h2 className="text-sm font-black text-slate-900">إجراءات العملية</h2><p className="mt-1 text-[10px] leading-5 text-slate-500">إجراءات ثابتة داخل الصفحة، وتختفي تلقائيًا عند الرجوع أو الانتقال.</p></div>{action}</section>
      </section>, host)}

    {fullscreen && documentUrl ? createPortal(<div className="fixed inset-0 z-[220] flex flex-col bg-black/95" dir="rtl"><div className="flex items-center justify-between px-4 pb-3 pt-[calc(12px+env(safe-area-inset-top))] text-white"><div><p className="text-sm font-bold">معاينة المستند</p><p className="text-[10px] text-white/60">{previewState === 'ready' ? 'قرّب بإصبعين واسحب الصورة' : 'المستند الأصلي'}</p></div><button onClick={closeDocumentPreview} className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10"><X className="h-5 w-5" /></button></div><div className="min-h-0 flex-1 overflow-hidden px-3 py-2">{previewState === 'ready' || !mime.includes('pdf') ? <div className="flex h-full min-h-full touch-none select-none items-center justify-center overflow-hidden" style={{ touchAction: 'none' }} onPointerDown={handlePreviewPointerDown} onPointerMove={handlePreviewPointerMove} onPointerUp={handlePreviewPointerEnd} onPointerCancel={handlePreviewPointerEnd} onDoubleClick={() => updatePreviewZoom(zoom > 1 ? 1 : 2)}><img src={documentUrl} alt="المستند" draggable={false} className="max-h-full w-full max-w-full origin-center object-contain will-change-transform" style={{ transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})`, transition: previewPointersRef.current.size ? 'none' : 'transform 120ms ease-out' }} /></div> : <iframe src={documentUrl} title="المستند الأصلي" className="h-full min-h-[80dvh] w-full bg-white" />}</div>{previewState === 'ready' || !mime.includes('pdf') ? <div className="flex items-center justify-center gap-3 border-t border-white/10 bg-black/80 px-4 pb-[calc(12px+env(safe-area-inset-bottom))] pt-3"><button onClick={() => updatePreviewZoom(zoom - .25)} className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white" aria-label="تصغير"><ZoomOut className="h-5 w-5" /></button><button onClick={() => updatePreviewZoom(1)} className="min-w-16 rounded-full px-3 py-2 text-center text-xs font-bold text-white" aria-label="إعادة الضبط">{Math.round(zoom * 100)}%</button><button onClick={() => updatePreviewZoom(zoom + .25)} className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white" aria-label="تكبير"><ZoomIn className="h-5 w-5" /></button></div> : null}</div>, document.body) : null}
  </>;
}

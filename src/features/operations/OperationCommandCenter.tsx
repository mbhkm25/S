import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle, CheckCircle2, Clock3, ExternalLink, FileText, History,
  Inbox, Landmark, Loader2, Maximize2, MessageSquareText, RefreshCw,
  ShieldCheck, X, ZoomIn, ZoomOut
} from 'lucide-react';
import FinancialEntityLogo from '../../components/FinancialEntityLogo';
import { supabase } from '../../lib/supabase';
import { requestOperationFileAccess } from '../../lib/operationFileAccess';
import { claimPaymentInboxItem, type PaymentInboxItem } from '../../lib/paymentInboxApi';
import { toLatinDigits } from '../../lib/digits';

type Tab = 'operation' | 'document' | 'record';
type PreviewState = 'idle' | 'pending' | 'ready' | 'failed';

type OperationalContext = {
  operation_id: string;
  public_token: string;
  transaction_datetime?: string | null;
  received_at?: string | null;
  read_only_open?: boolean;
  inbox?: {
    id: string;
    business_id: string;
    business_name?: string | null;
    status: string;
    row_version: number;
    claimed_by_name?: string | null;
    completed_by_name?: string | null;
    completed_at?: string | null;
    review_reason?: string | null;
    is_mine?: boolean;
    is_supervisor?: boolean;
    permissions?: { can_claim?: boolean; can_complete?: boolean; can_review?: boolean; can_view?: boolean };
  } | null;
};

type PreviewResponse = {
  ok?: boolean;
  status?: string;
  available?: boolean;
  signed_url?: string;
  retry_after_seconds?: number;
};

const TOKEN_PATTERN = /\/v\/([0-9a-fA-F-]{36})(?:\/|$)/;

function getToken() {
  return window.location.pathname.match(TOKEN_PATTERN)?.[1] || null;
}

function formatDateTime(value?: string | null) {
  if (!value) return 'غير متوفر';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'غير متوفر';
  return toLatinDigits(new Intl.DateTimeFormat('ar-YE', {
    year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit'
  }).format(date));
}

function formatTimeOnly(value?: string | null) {
  if (!value) return 'غير متوفر';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'غير متوفر';
  return toLatinDigits(new Intl.DateTimeFormat('ar-YE', { hour: '2-digit', minute: '2-digit' }).format(date));
}

function elapsedLabel(transaction?: string | null, received?: string | null) {
  if (!transaction || !received) return null;
  const delta = new Date(received).getTime() - new Date(transaction).getTime();
  if (!Number.isFinite(delta)) return null;
  const minutes = Math.round(Math.abs(delta) / 60000);
  const direction = delta >= 0 ? 'بعد العملية' : 'قبل وقت العملية المستخرج';
  if (minutes < 1) return 'وصل إلى سند في الوقت نفسه تقريبًا';
  if (minutes < 60) return `وصل إلى سند ${direction} بـ ${toLatinDigits(String(minutes))} دقيقة`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `وصل إلى سند ${direction} بـ ${toLatinDigits(String(hours))} ساعة`;
  const days = Math.round(hours / 24);
  return `وصل إلى سند ${direction} بـ ${toLatinDigits(String(days))} يوم`;
}

function statusMeta(status?: string | null) {
  if (status === 'new' || status === 'released') return { label: 'جديدة', className: 'bg-blue-50 text-blue-700 border-blue-100' };
  if (status === 'claimed') return { label: 'قيد المعالجة', className: 'bg-amber-50 text-amber-800 border-amber-100' };
  if (status === 'review_required') return { label: 'تحتاج مراجعة', className: 'bg-orange-50 text-orange-800 border-orange-100' };
  if (status === 'completed') return { label: 'مكتملة', className: 'bg-emerald-50 text-emerald-700 border-emerald-100' };
  if (status === 'rejected') return { label: 'مرفوضة', className: 'bg-rose-50 text-rose-700 border-rose-100' };
  return { label: 'للاطلاع', className: 'bg-slate-50 text-slate-600 border-slate-100' };
}

function field(operation: any, ...keys: string[]) {
  for (const key of keys) {
    const value = operation?.[key];
    if (value !== undefined && value !== null && String(value).trim() !== '') return value;
  }
  return null;
}

export default function OperationCommandCenter() {
  const [token, setToken] = useState<string | null>(() => getToken());
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [operation, setOperation] = useState<any | null>(null);
  const [context, setContext] = useState<OperationalContext | null>(null);
  const [tab, setTab] = useState<Tab>('operation');
  const [loading, setLoading] = useState(false);
  const [acting, setActing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewState, setPreviewState] = useState<PreviewState>('idle');
  const [fullscreen, setFullscreen] = useState(false);
  const [zoom, setZoom] = useState(1);
  const hiddenRef = useRef(new Map<HTMLElement, string>());

  useEffect(() => {
    const timer = window.setInterval(() => setToken(current => getToken() === current ? current : getToken()), 350);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!token) return;
    let disposed = false;
    const attach = () => {
      if (disposed) return;
      const details = document.getElementById('details_view');
      if (!details) return;
      let mount = document.getElementById('operation_command_center_mount');
      if (!(mount instanceof HTMLElement)) {
        mount = document.createElement('div');
        mount.id = 'operation_command_center_mount';
        details.prepend(mount);
      }
      Array.from(details.children).forEach(child => {
        if (!(child instanceof HTMLElement) || child === mount) return;
        if (!hiddenRef.current.has(child)) hiddenRef.current.set(child, child.style.display);
        child.style.display = 'none';
      });
      details.dataset.commandCenter = 'active';
      setHost(mount);
    };
    attach();
    const observer = new MutationObserver(attach);
    observer.observe(document.body, { childList: true, subtree: true });
    const timer = window.setInterval(attach, 400);
    return () => {
      disposed = true;
      observer.disconnect();
      window.clearInterval(timer);
      hiddenRef.current.forEach((display, node) => { node.style.display = display; });
      hiddenRef.current.clear();
      document.getElementById('operation_command_center_mount')?.remove();
      document.getElementById('details_view')?.removeAttribute('data-command-center');
    };
  }, [token]);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const [{ data: access, error: accessError }, { data: operational, error: operationalError }] = await Promise.all([
        supabase.rpc('open_operation_access', { p_public_token: token, p_source: 'app' }),
        supabase.rpc('get_operation_operational_context', { p_public_token: token })
      ]);
      if (accessError || !access?.allowed || !access.operation) throw accessError || new Error('تعذر فتح العملية.');
      if (operationalError) throw operationalError;
      setOperation(access.operation);
      setContext(operational as OperationalContext);
      const original = await requestOperationFileAccess(token, 'open').catch(() => null);
      setOriginalUrl(original?.signedUrl || null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذر تجهيز تفاصيل العملية.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    let timer: number | null = null;
    const started = Date.now();
    const poll = async () => {
      const { data, error: previewError } = await supabase.functions.invoke<PreviewResponse>('sanad-operation-preview-access', {
        body: { public_token: token, request_processing: true }
      });
      if (cancelled) return;
      if (!previewError && data?.available && data.signed_url) {
        setPreviewUrl(data.signed_url);
        setPreviewState('ready');
        return;
      }
      if (previewError || data?.status === 'failed' || Date.now() - started > 20_000) {
        setPreviewState('failed');
        return;
      }
      setPreviewState('pending');
      timer = window.setTimeout(poll, Math.max(4000, Number(data?.retry_after_seconds || 6) * 1000));
    };
    setPreviewState('pending');
    void poll();
    return () => { cancelled = true; if (timer) window.clearTimeout(timer); };
  }, [token]);

  const refreshContext = useCallback(async () => {
    if (!token) return;
    const { data, error: contextError } = await supabase.rpc('get_operation_operational_context', { p_public_token: token });
    if (contextError) throw contextError;
    setContext(data as OperationalContext);
  }, [token]);

  const claim = async () => {
    if (!context?.inbox) return;
    setActing(true); setError(null); setMessage(null);
    try {
      await claimPaymentInboxItem({
        id: context.inbox.id,
        operation_id: context.operation_id,
        public_token: context.public_token,
        business_id: context.inbox.business_id,
        status: context.inbox.status,
        row_version: context.inbox.row_version
      } as PaymentInboxItem);
      await refreshContext();
      setMessage('تم استلام العملية، وستبقى مسندة إليك حتى تتخذ إجراءً صريحًا.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'تعذر استلام العملية.'); }
    finally { setActing(false); }
  };

  const complete = async () => {
    if (!context?.inbox || !token) return;
    setActing(true); setError(null); setMessage(null);
    try {
      const { data, error: completeError } = await supabase.rpc('complete_operation_workflow', {
        p_operation_id: context.operation_id,
        p_token: token,
        p_business_id: context.inbox.business_id,
        p_inbox_id: context.inbox.id,
        p_note: null,
        p_source: 'operation_details'
      });
      if (completeError) throw completeError;
      if (data && typeof data === 'object' && (data as any).ok === false) throw new Error('تعذر اعتماد العملية بعد تغير حالتها.');
      await refreshContext();
      setMessage('تم اعتماد العملية وتحديث سجل وارد المدفوعات باسمك.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'تعذر اعتماد العملية.'); }
    finally { setActing(false); }
  };

  const personalVerify = async () => {
    if (!token) return;
    setActing(true); setError(null); setMessage(null);
    try {
      const { error: verifyError } = await supabase.rpc('verify_operation', { p_token: token, p_note: null });
      if (verifyError) throw verifyError;
      setMessage('تم تسجيل تحققك الشخصي. لم تتغير أي حالة في وارد المدفوعات.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'تعذر تسجيل التحقق.'); }
    finally { setActing(false); }
  };

  const inboxUrl = useMemo(() => {
    if (!context?.inbox) return null;
    const admin = context.inbox.status === 'review_required' && context.inbox.is_supervisor;
    const params = new URLSearchParams({ view: admin ? 'payment-inbox-admin' : 'payment-inbox', business_id: context.inbox.business_id });
    return `/business/manage/operations?${params.toString()}`;
  }, [context?.inbox]);

  if (!host || !token) return null;
  if (loading && !operation) return createPortal(<div className="flex min-h-[55vh] items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-emerald-600" /></div>, host);

  const transactionAt = field(operation, 'transaction_datetime') || context?.transaction_datetime;
  const receivedAt = context?.received_at || field(operation, 'created_at', 'received_at');
  const amount = field(operation, 'amount');
  const currency = field(operation, 'currency') || '—';
  const entity = field(operation, 'financial_entity', 'financial_entity_name') || 'جهة مالية أخرى';
  const receiver = field(operation, 'resolved_account_holder_name', 'account_holder_name', 'receiver_name') || 'غير متوفر';
  const account = field(operation, 'credited_account_normalized', 'receiver_account_normalized', 'receiver_account', 'document_account_normalized');
  const reference = field(operation, 'reference_number', 'bank_reference_number');
  const mime = String(field(operation, 'file_mime_type', 'mime_type') || 'application/pdf');
  const status = statusMeta(context?.inbox?.status);
  const lag = elapsedLabel(transactionAt, receivedAt);
  const displayDocumentUrl = previewState === 'ready' && previewUrl ? previewUrl : originalUrl;

  const actionBar = context?.inbox ? (
    <div className="grid grid-cols-2 gap-2">
      {context.inbox.permissions?.can_claim ? <button onClick={() => void claim()} disabled={acting} className="h-12 rounded-2xl border border-slate-200 bg-white text-xs font-black text-slate-800 disabled:opacity-50">استلام العملية</button> : null}
      {(context.inbox.status === 'new' || context.inbox.status === 'released' || context.inbox.permissions?.can_complete) ? <button onClick={() => void complete()} disabled={acting} className="h-12 rounded-2xl bg-emerald-600 text-xs font-black text-white shadow-lg shadow-emerald-600/20 disabled:opacity-50">{acting ? 'جارٍ التنفيذ...' : 'اعتماد العملية'}</button> : null}
      {context.inbox.status === 'review_required' && inboxUrl ? <a href={inboxUrl} className="col-span-2 flex h-12 items-center justify-center rounded-2xl bg-amber-600 text-xs font-black text-white">مراجعة العملية في وارد المدفوعات</a> : null}
      {context.inbox.status === 'completed' ? <div className="col-span-2 flex h-12 items-center justify-center gap-2 rounded-2xl bg-emerald-50 text-xs font-black text-emerald-700"><CheckCircle2 className="h-4 w-4" />اعتمدها {context.inbox.completed_by_name || 'عضو الفريق'}</div> : null}
    </div>
  ) : (
    <button onClick={() => void personalVerify()} disabled={acting} className="h-12 w-full rounded-2xl bg-emerald-600 text-xs font-black text-white disabled:opacity-50">تسجيل تحقق شخصي</button>
  );

  return <>
    {createPortal(
      <section dir="rtl" className="mx-auto max-w-2xl space-y-3 pb-32 font-arabic">
        <div className="flex items-center justify-between gap-3 px-1 text-[10px] text-slate-500">
          <span className="inline-flex items-center gap-1.5"><Clock3 className="h-3.5 w-3.5" />وصل إلى سند: <b className="text-slate-700">{formatDateTime(receivedAt)}</b></span>
          <span className={`rounded-full border px-2.5 py-1 font-black ${status.className}`}>{status.label}</span>
        </div>

        <article className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-start gap-3">
            <FinancialEntityLogo entity={entity} className="h-12 w-12 rounded-2xl border border-slate-100" />
            <div className="min-w-0 flex-1"><p className="text-[10px] font-bold text-slate-400">الجهة المالية</p><h1 className="truncate text-base font-black text-slate-950">{entity}</h1></div>
            <div className="text-left"><strong className="block text-4xl font-black tracking-tight text-slate-950">{amount ?? '—'}</strong><span className="text-[10px] font-black text-emerald-700">{currency}</span></div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-slate-100 pt-4 text-[11px]">
            <div className="col-span-2"><span className="block text-slate-400">المستلم</span><b className="mt-1 block text-sm text-slate-900">{receiver}</b></div>
            <div><span className="block text-slate-400">رقم الحساب</span><b dir="ltr" className="mt-1 block font-mono text-slate-800">{account ? toLatinDigits(String(account)) : '—'}</b></div>
            <div><span className="block text-slate-400">المرجع</span><b dir="ltr" className="mt-1 block font-mono text-slate-800">{reference ? toLatinDigits(String(reference)) : '—'}</b></div>
            <div className="col-span-2 rounded-2xl bg-slate-50 px-3 py-2.5"><span className="block text-slate-400">وقت العملية بحسب الإشعار الأصلي</span><b className="mt-1 block text-sm text-slate-900">{formatDateTime(transactionAt)}</b>{lag ? <span className="mt-1 block text-[10px] text-slate-500">{lag}</span> : null}</div>
          </div>
        </article>

        <nav className="grid grid-cols-3 rounded-2xl border border-slate-200 bg-slate-100 p-1" aria-label="أقسام تفاصيل العملية">
          {([['operation','العملية'],['document','المستند'],['record','السجل']] as Array<[Tab,string]>).map(([value,label]) => <button key={value} onClick={() => setTab(value)} className={`h-10 rounded-xl text-[11px] font-black ${tab === value ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500'}`}>{label}</button>)}
        </nav>

        {error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-[11px] leading-5 text-rose-700">{error}</div> : null}
        {message ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-[11px] leading-5 text-emerald-800">{message}</div> : null}

        {tab === 'operation' ? <div className="space-y-3">
          <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" /><div><h2 className="text-sm font-black text-slate-900">حالة المطابقة والتشغيل</h2><p className="mt-1 text-[11px] leading-6 text-slate-500">فتح هذه الصفحة ومعاينة المستند لا يغيران حالة العملية. تتغير الحالة فقط عند تنفيذ إجراء صريح.</p></div></div>
            {context?.inbox ? <div className="mt-3 rounded-2xl bg-slate-50 p-3 text-[11px] leading-6 text-slate-600"><b className="text-slate-900">{context.inbox.business_name}</b><br />الحالة الحالية: {status.label}{context.inbox.claimed_by_name ? ` · المسؤول: ${context.inbox.claimed_by_name}` : ''}</div> : <div className="mt-3 rounded-2xl bg-slate-50 p-3 text-[11px] text-slate-600">هذه العملية ليست مرتبطة حاليًا بوارد نشاط يمكنك تشغيله.</div>}
          </section>
          {inboxUrl ? <a href={inboxUrl} className="flex h-12 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white text-xs font-black text-slate-800"><Inbox className="h-4 w-4" />فتح وارد المدفوعات</a> : null}
        </div> : null}

        {tab === 'document' ? <section className="rounded-3xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="mb-3 flex items-center justify-between px-1"><div><h2 className="text-sm font-black text-slate-900">المستند الأصلي</h2><p className="text-[9px] text-slate-400">الملف الأصلي محفوظ دون تعديل</p></div><span className="text-[9px] font-bold text-slate-400">{previewState === 'ready' ? 'معاينة محسنة' : 'المستند الأصلي'}</span></div>
          {displayDocumentUrl ? <button onClick={() => setFullscreen(true)} className="relative flex min-h-[300px] w-full items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
            {previewState === 'ready' || !mime.includes('pdf') ? <img src={displayDocumentUrl} alt="معاينة المستند" className="max-h-[55vh] w-full object-contain" /> : <iframe src={displayDocumentUrl} title="المستند الأصلي" className="h-[430px] w-full bg-white" />}
            <span className="absolute bottom-3 left-3 inline-flex items-center gap-1.5 rounded-xl bg-slate-950/80 px-3 py-2 text-[10px] font-bold text-white"><Maximize2 className="h-3.5 w-3.5" />تكبير</span>
          </button> : <div className="flex min-h-[260px] items-center justify-center rounded-2xl bg-slate-50"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>}
          {previewState === 'pending' ? <p className="mt-3 text-center text-[10px] text-slate-500">يجري إعداد نسخة محسنة، بينما يبقى المستند الأصلي متاحًا الآن.</p> : null}
          {previewState === 'failed' ? <p className="mt-3 text-center text-[10px] text-slate-500">تعذر إعداد المعاينة السريعة؛ يعرض سند المستند الأصلي بدلًا منها.</p> : null}
          <div className="mt-3 grid grid-cols-2 gap-2"><button onClick={() => setFullscreen(true)} className="h-11 rounded-2xl border border-slate-200 text-[11px] font-black text-slate-700">تكبير المعاينة</button>{originalUrl ? <a href={originalUrl} target="_blank" rel="noreferrer" className="flex h-11 items-center justify-center gap-2 rounded-2xl bg-emerald-600 text-[11px] font-black text-white"><ExternalLink className="h-4 w-4" />فتح الأصل</a> : null}</div>
        </section> : null}

        {tab === 'record' ? <section className="space-y-3 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2"><History className="h-5 w-5 text-slate-500" /><h2 className="text-sm font-black text-slate-900">سجل العملية</h2></div>
          <div className="grid gap-2 text-[11px]"><div className="rounded-2xl bg-slate-50 p-3"><span className="text-slate-400">وقت الإدخال إلى سند</span><b className="mt-1 block text-slate-800">{formatDateTime(receivedAt)}</b></div><div className="rounded-2xl bg-slate-50 p-3"><span className="text-slate-400">وقت العملية المستخرج</span><b className="mt-1 block text-slate-800">{formatDateTime(transactionAt)}</b></div>{context?.inbox?.completed_at ? <div className="rounded-2xl bg-emerald-50 p-3"><span className="text-emerald-700">وقت الاعتماد</span><b className="mt-1 block text-emerald-900">{formatDateTime(context.inbox.completed_at)} بواسطة {context.inbox.completed_by_name || 'عضو الفريق'}</b></div> : null}</div>
          <div className="rounded-2xl border border-slate-100 p-3 text-[10px] leading-6 text-slate-500"><div className="flex items-center gap-2 text-slate-700"><MessageSquareText className="h-4 w-4" /><b>البيانات المتقدمة</b></div><p className="mt-1">تبقى بيانات التحليل الذكي والمعلومات التقنية محفوظة في السجل، لكنها لا تزاحم قرار التشغيل الأساسي.</p></div>
        </section> : null}
      </section>, host)}

    {createPortal(<div dir="rtl" className="fixed inset-x-3 bottom-[calc(76px+env(safe-area-inset-bottom))] z-[180] mx-auto max-w-2xl rounded-3xl border border-slate-200 bg-white/95 p-3 shadow-2xl backdrop-blur-xl">{actionBar}</div>, document.body)}

    {fullscreen && displayDocumentUrl ? createPortal(<div className="fixed inset-0 z-[240] flex flex-col bg-black/95" dir="rtl">
      <div className="flex items-center justify-between px-4 pb-3 pt-[calc(12px+env(safe-area-inset-top))] text-white"><div><p className="text-sm font-black">معاينة المستند</p><p className="text-[10px] text-white/60">{previewState === 'ready' ? 'نسخة محسنة للعرض السريع' : 'المستند الأصلي'}</p></div><button onClick={() => setFullscreen(false)} className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10"><X className="h-5 w-5" /></button></div>
      <div className="min-h-0 flex-1 overflow-auto p-3"><div className="flex min-h-full items-center justify-center">{previewState === 'ready' || !mime.includes('pdf') ? <img src={displayDocumentUrl} alt="المستند" className="max-w-none object-contain" style={{ width: `${Math.max(100,zoom*100)}%`, transform: `scale(${zoom})` }} /> : <iframe src={displayDocumentUrl} title="المستند الأصلي" className="h-full min-h-[80vh] w-full bg-white" />}</div></div>
      <div className="flex items-center justify-center gap-3 border-t border-white/10 px-4 pb-[calc(12px+env(safe-area-inset-bottom))] pt-3">{previewState === 'ready' || !mime.includes('pdf') ? <><button onClick={() => setZoom(v => Math.max(.75,v-.25))} className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white"><ZoomOut className="h-5 w-5" /></button><span className="min-w-16 text-center text-xs font-black text-white">{Math.round(zoom*100)}%</span><button onClick={() => setZoom(v => Math.min(3,v+.25))} className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white"><ZoomIn className="h-5 w-5" /></button></> : <span className="text-xs text-white/70">استخدم أدوات عارض PDF للتكبير والتنقل</span>}</div>
    </div>, document.body) : null}
  </>;
}

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Profile } from '../types';
import { Camera, Check, CheckCircle2, Clipboard, ExternalLink, FileImage, FileText, ImagePlus, Loader2, PlusCircle, QrCode, RefreshCw, Share2, UploadCloud } from 'lucide-react';
import QRCode from 'qrcode';
import { getPublicAppUrl } from '../lib/urlUtils';
import { toLatinDigits } from '../lib/digits';
import { preparePaymentFile, ProcessedPaymentFile } from '../lib/paymentImageProcessing';
import { localOperationRepository } from '../features/local-first/localOperationRepository';
import { drainLocalSyncQueue } from '../features/local-first/syncEngine';
import { getLocalOperation, getLocalOperationFile } from '../features/local-first/localStore';
import TouchZoomImage from './TouchZoomImage';

type UploadProps = {
  user: any;
  profile: Profile;
  onNavigateToDetails: (token: string) => void;
  onNavigate: (page: string) => void;
  ensureProfileComplete?: (action: () => void) => void;
};

type UploadStage = 'idle' | 'optimizing' | 'saving-local';
type NativePaymentCapturePayload = { status?: 'success' | 'cancelled' | 'error'; name?: string; mimeType?: string; base64?: string; gallerySaved?: boolean; message?: string };
type SuccessData = { localId: string; cloudOperationId: string | null; publicToken: string | null; qrUrl: string | null; localQrCodeDataUrl: string | null; synced: boolean };
type SuccessPreview = { url: string; mimeType: string; name: string };

declare global {
  interface Window {
    AndroidPaymentCapture?: { startCapture: () => void; getCapturedData: () => string | null; clearCapturedData: () => void };
  }
}

const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const MAX_PDF_BYTES = 10 * 1024 * 1024;
const ALLOWED_PDF_TYPE = 'application/pdf';
const DIRECT_CAPTURE_KEY = 'sanad_direct_capture_once';
const DIRECT_CAPTURE_EVENT = 'sanadDirectCaptureRequested';
const stageLabels: Record<UploadStage, string> = { idle: '', optimizing: 'جاري تحسين الصورة…', 'saving-local': 'جاري حفظ العملية على الجهاز…' };

function formatMegabytes(bytes: number): string { return `${(bytes / 1024 / 1024).toFixed(bytes >= 1024 * 1024 ? 2 : 3)} MB`; }
function sleep(milliseconds: number): Promise<void> { return new Promise((resolve) => window.setTimeout(resolve, milliseconds)); }
function nativeBase64ToFile(base64: string, name: string, mimeType: string): File {
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new File([bytes], name, { type: mimeType, lastModified: Date.now() });
}
async function buildCloudPresentation(publicToken: string) {
  const qrUrl = `${getPublicAppUrl()}/v/${publicToken}`;
  const localQrCodeDataUrl = await QRCode.toDataURL(qrUrl, { width: 240, margin: 2, color: { dark: '#111111', light: '#ffffff' } });
  return { qrUrl, localQrCodeDataUrl };
}

export default function UploadNotification({ user, profile, onNavigateToDetails, onNavigate, ensureProfileComplete }: UploadProps) {
  const [file, setFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [uploadStage, setUploadStage] = useState<UploadStage>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [openingDetails, setOpeningDetails] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [processedSummary, setProcessedSummary] = useState<ProcessedPaymentFile['metadata'] | null>(null);
  const [successData, setSuccessData] = useState<SuccessData | null>(null);
  const [successPreview, setSuccessPreview] = useState<SuccessPreview | null>(null);
  const [copied, setCopied] = useState(false);
  const [gallerySavedForCurrentFile, setGallerySavedForCurrentFile] = useState(false);

  const formRef = useRef<HTMLFormElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const autoSubmitCaptureRef = useRef(false);
  const uploading = uploadStage !== 'idle';
  const nativePaymentCaptureAvailable = typeof window.AndroidPaymentCapture?.startCapture === 'function';

  const validateAndSetFile = (selectedFile: File): boolean => {
    setErrorMessage(null);
    setProcessedSummary(null);
    const isImage = selectedFile.type.startsWith('image/');
    const isPdf = selectedFile.type === ALLOWED_PDF_TYPE || selectedFile.name.toLowerCase().endsWith('.pdf');
    if (!isImage && !isPdf) { setErrorMessage('اختر صورة واضحة أو ملف PDF لإشعار الدفع أو إيصال ماكينة الدفع.'); return false; }
    const maxBytes = isImage ? MAX_IMAGE_BYTES : MAX_PDF_BYTES;
    if (selectedFile.size > maxBytes) { setErrorMessage(isImage ? 'حجم الصورة يتجاوز 15 ميجابايت. التقطها بدقة أقل أو اختر صورة أخرى.' : 'حجم ملف PDF يتجاوز 10 ميجابايت.'); return false; }
    setFile(selectedFile);
    return true;
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (selectedFile) { setGallerySavedForCurrentFile(false); validateAndSetFile(selectedFile); }
    event.target.value = '';
  };
  const handleFallbackCameraChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (selectedFile) { setGallerySavedForCurrentFile(false); if (validateAndSetFile(selectedFile)) autoSubmitCaptureRef.current = true; }
    event.target.value = '';
  };

  useEffect(() => {
    const handleNativePaymentCapture = () => {
      const bridge = window.AndroidPaymentCapture;
      if (!bridge) return;
      const rawPayload = bridge.getCapturedData();
      bridge.clearCapturedData();
      if (!rawPayload) return;
      try {
        const payload = JSON.parse(rawPayload) as NativePaymentCapturePayload;
        if (payload.status === 'cancelled') return;
        if (payload.status !== 'success' || !payload.base64) {
          setGallerySavedForCurrentFile(Boolean(payload.gallerySaved));
          setErrorMessage(payload.message || 'تعذر استلام الصورة من الكاميرا. حاول مرة أخرى.');
          return;
        }
        const capturedFile = nativeBase64ToFile(payload.base64, payload.name || `SANAD_${Date.now()}.jpg`, payload.mimeType || 'image/jpeg');
        setGallerySavedForCurrentFile(Boolean(payload.gallerySaved));
        if (validateAndSetFile(capturedFile)) autoSubmitCaptureRef.current = true;
      } catch (error) {
        console.warn('Native payment capture payload failed:', error);
        setErrorMessage('تم التقاط الصورة، لكن تعذر تجهيزها داخل سند. يمكنك اختيارها من الاستوديو.');
      }
    };
    window.addEventListener('sanadNativePaymentCaptureReady', handleNativePaymentCapture);
    return () => window.removeEventListener('sanadNativePaymentCaptureReady', handleNativePaymentCapture);
  }, []);

  useEffect(() => {
    if (!file || uploading || !autoSubmitCaptureRef.current) return;
    autoSubmitCaptureRef.current = false;
    window.requestAnimationFrame(() => formRef.current?.requestSubmit());
  }, [file, uploading]);

  useEffect(() => {
    let disposed = false;
    let objectUrl: string | null = null;
    setSuccessPreview(null);
    if (!successData?.localId) return undefined;
    void getLocalOperationFile(successData.localId).then((storedFile) => {
      if (!storedFile || disposed) return;
      objectUrl = URL.createObjectURL(storedFile.blob);
      setSuccessPreview({ url: objectUrl, mimeType: storedFile.mimeType, name: storedFile.name });
    }).catch((error) => console.warn('SANAD success preview unavailable', error));
    return () => {
      disposed = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [successData?.localId]);

  const startCameraCapture = useCallback(() => {
    setErrorMessage(null);
    if (nativePaymentCaptureAvailable) { window.AndroidPaymentCapture?.startCapture(); return; }
    cameraInputRef.current?.click();
  }, [nativePaymentCaptureAvailable]);

  useEffect(() => {
    const consumeDirectCapture = () => {
      let requested = false;
      try {
        requested = Boolean(sessionStorage.getItem(DIRECT_CAPTURE_KEY));
        if (requested) sessionStorage.removeItem(DIRECT_CAPTURE_KEY);
      } catch {
        requested = true;
      }
      if (!requested) return;
      window.requestAnimationFrame(() => startCameraCapture());
    };

    consumeDirectCapture();
    window.addEventListener(DIRECT_CAPTURE_EVENT, consumeDirectCapture);
    return () => window.removeEventListener(DIRECT_CAPTURE_EVENT, consumeDirectCapture);
  }, [startCameraCapture]);

  const handleDrag = (event: React.DragEvent) => {
    event.preventDefault(); event.stopPropagation();
    if (event.type === 'dragenter' || event.type === 'dragover') setDragActive(true);
    if (event.type === 'dragleave') setDragActive(false);
  };
  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault(); event.stopPropagation(); setDragActive(false);
    const selectedFile = event.dataTransfer.files?.[0];
    if (selectedFile) { setGallerySavedForCurrentFile(false); validateAndSetFile(selectedFile); }
  };

  const syncOperationInBackground = useCallback(async (localId: string) => {
    if (!navigator.onLine) return;
    try {
      await drainLocalSyncQueue();
      const stored = await getLocalOperation(localId);
      if (!stored?.cloudOperationId || !stored.publicToken) return;
      const presentation = await buildCloudPresentation(stored.publicToken);
      setSuccessData(current => current?.localId === localId
        ? { localId: stored.localId, cloudOperationId: stored.cloudOperationId, publicToken: stored.publicToken, qrUrl: presentation.qrUrl, localQrCodeDataUrl: presentation.localQrCodeDataUrl, synced: true }
        : current);
    } catch (error) {
      console.warn('Background local operation sync failed; durable queue will retry:', error);
    }
  }, []);

  const handleUploadSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!file || !user || !profile || uploading) return;
    const performUpload = async () => {
      setErrorMessage(null);
      try {
        setUploadStage(file.type.startsWith('image/') ? 'optimizing' : 'saving-local');
        const prepared = await preparePaymentFile(file);
        setProcessedSummary(prepared.metadata);
        const uploadFile = prepared.file;
        const phone = profile.phone || (profile as Profile & { pending_phone?: string | null }).pending_phone || null;
        setUploadStage('saving-local');
        const local = await localOperationRepository.create({
          source: 'pwa_upload', submittedByUserId: user.id, submittedByPhone: phone, submittedByName: profile.full_name, file: uploadFile,
          clientMetadata: { userAgent: navigator.userAgent, uploadedAt: new Date().toISOString(), app_upload: true, upload_experience: 'react_local_first_v2', local_first: true, local_success_before_cloud: true, local_gallery_saved: gallerySavedForCurrentFile, capture_flow: gallerySavedForCurrentFile ? 'android_native_gallery_capture_v1' : 'standard_picker_v1', ...prepared.metadata },
        });
        await localOperationRepository.queueForCloud(local);

        // Local durability is the completion boundary for the user's action.
        // Never hold the success screen behind Cloud upload or analysis.
        setSuccessData({ localId: local.identity.localId, cloudOperationId: null, publicToken: null, qrUrl: null, localQrCodeDataUrl: null, synced: false });
        setUploadStage('idle');

        // Cloud promotion is deliberately detached from the interaction. The
        // durable queue and device-led runtime will also retry after reconnect/restart.
        if (navigator.onLine) void syncOperationInBackground(local.identity.localId);
      } catch (error) {
        console.warn('Local-first payment intake failed:', error);
        const baseMessage = error instanceof Error ? error.message : 'تعذر حفظ العملية على هذا الجهاز. حاول مرة أخرى.';
        setErrorMessage(gallerySavedForCurrentFile ? `${baseMessage} الصورة الأصلية ما زالت محفوظة في الاستوديو.` : baseMessage);
      } finally { setUploadStage('idle'); }
    };
    if (ensureProfileComplete) ensureProfileComplete(performUpload); else await performUpload();
  };

  const openDetailsWhenReady = async () => {
    if (!successData?.publicToken || openingDetails) return;
    setOpeningDetails(true); setErrorMessage(null);
    for (const delay of [0, 450, 900, 1800]) {
      if (delay) await sleep(delay);
      try {
        const { data, error } = await supabase.rpc('open_operation_access', { p_public_token: successData.publicToken, p_source: 'app' });
        if (!error && data?.allowed === true && data?.operation) { onNavigateToDetails(successData.publicToken); setOpeningDetails(false); return; }
      } catch (error) { console.warn('Operation readiness check failed:', error); }
    }
    setOpeningDetails(false);
    setErrorMessage('تمت مزامنة العملية، لكن صفحة التفاصيل لم تصبح جاهزة بعد. افتحها من سجل العمليات بعد لحظات.');
  };

  const copyQrUrlToClipboard = () => {
    if (!successData?.qrUrl) return;
    void navigator.clipboard.writeText(successData.qrUrl); setCopied(true); window.setTimeout(() => setCopied(false), 2500);
  };
  const shareQrUrl = async () => {
    if (!successData?.qrUrl) return;
    if (!navigator.share) { copyQrUrlToClipboard(); return; }
    try { await navigator.share({ title: 'عملية دفع في سند', text: 'رابط مراجعة عملية الدفع عبر سند.', url: successData.qrUrl }); }
    catch (error) { if ((error as DOMException)?.name !== 'AbortError') console.warn('Payment link sharing failed:', error); }
  };
  const resetUpload = () => {
    setFile(null); setSuccessData(null); setSuccessPreview(null); setProcessedSummary(null); setErrorMessage(null); setCopied(false); setShowQr(false); setGallerySavedForCurrentFile(false); autoSubmitCaptureRef.current = false;
  };

  return (
    <div className="space-y-5 font-arabic" id="upload_view" dir="rtl">
      <header className="text-right"><p className="text-[10px] font-bold text-emerald-700">سند المالي</p><h2 className="mt-1 text-lg font-bold text-slate-950">إضافة عملية دفع</h2><p className="mt-1 text-[11px] leading-5 text-slate-500">صوّر أو أضف إشعار دفع. يحفظه سند على الجهاز أولًا، ويكمل المزامنة والتحليل في الخلفية.</p></header>
      {errorMessage && <div className="rounded-2xl border border-rose-100 bg-rose-50 p-3 text-right text-xs text-rose-800"><strong className="mb-1 block">تعذر إكمال الإجراء</strong><span>{errorMessage}</span></div>}

      {!successData ? (
        <form ref={formRef} onSubmit={handleUploadSubmit} className="space-y-4" id="upload_form">
          <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" onChange={handleFallbackCameraChange} className="hidden" />
          <input ref={fileInputRef} type="file" accept="image/*,application/pdf" onChange={handleFileChange} className="hidden" />
          <div className="grid grid-cols-2 gap-3">
            <button type="button" onClick={startCameraCapture} disabled={uploading} className="flex min-h-28 flex-col items-center justify-center rounded-[1.6rem] bg-slate-950 px-3 py-5 text-white shadow-[0_14px_35px_rgba(15,23,42,0.16)] disabled:opacity-50"><span className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10"><Camera className="h-5 w-5" /></span><strong className="text-xs">التقاط بالكاميرا</strong><span className="mt-1 text-[9px] text-white/60">{nativePaymentCaptureAvailable ? 'يحفظ في الاستوديو ويبدأ تلقائيًا' : 'إشعار أو إيصال ورقي'}</span></button>
            <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploading} className="flex min-h-28 flex-col items-center justify-center rounded-[1.6rem] border border-slate-200 bg-white px-3 py-5 text-slate-900 shadow-sm disabled:opacity-50"><span className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100"><ImagePlus className="h-5 w-5" /></span><strong className="text-xs">اختيار مستند</strong><span className="mt-1 text-[9px] text-slate-400">صورة أو PDF</span></button>
          </div>
          <div onDragEnter={handleDrag} onDragOver={handleDrag} onDragLeave={handleDrag} onDrop={handleDrop} className={`rounded-[1.4rem] border border-dashed p-4 transition-all ${dragActive ? 'border-slate-700 bg-slate-50' : 'border-slate-200 bg-white'}`}>
            {file ? <div className="flex items-center gap-3"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">{file.type === ALLOWED_PDF_TYPE ? <FileText className="h-5 w-5" /> : <FileImage className="h-5 w-5" />}</span><div className="min-w-0 flex-1 text-right"><strong className="block truncate text-xs text-slate-900" dir="auto">{toLatinDigits(file.name)}</strong><span className="mt-1 block text-[10px] text-slate-400">الحجم الأصلي: {formatMegabytes(file.size)}</span>{gallerySavedForCurrentFile && <span className="mt-1 block text-[9px] font-bold text-emerald-700">نسخة محفوظة في الاستوديو · Pictures/SANAD</span>}</div>{!uploading && <button type="button" onClick={() => { setFile(null); setGallerySavedForCurrentFile(false); }} className="rounded-xl bg-slate-100 px-3 py-2 text-[10px] font-bold text-slate-600">تغيير</button>}</div> : <div className="flex items-center justify-center gap-2 py-2 text-[10px] text-slate-400"><UploadCloud className="h-4 w-4" /><span>يمكنك أيضًا سحب المستند وإفلاته هنا</span></div>}
          </div>
          {file && !uploading && <div className="rounded-2xl bg-sky-50 px-4 py-3 text-[10px] leading-5 text-sky-900">يحفظ سند المستند محليًا أولًا. الصور الكبيرة تُحسّن إلى WebP، وملفات PDF تبقى كما هي.</div>}
          <button type="submit" disabled={!file || uploading} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#111111] px-4 py-3.5 text-xs font-bold text-white shadow-sm transition-all disabled:bg-slate-300">{uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlusCircle className="h-4 w-4" />}<span>{uploading ? stageLabels[uploadStage] : 'إنشاء عملية الدفع'}</span></button>
        </form>
      ) : (
        <section className="space-y-4 rounded-[1.8rem] border border-slate-200/70 bg-white p-5 text-center shadow-sm" id="success_qr_screen">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-emerald-100 bg-emerald-50 text-emerald-600"><CheckCircle2 className="h-6 w-6" /></span>
          <div><h2 className="text-base font-bold text-slate-950">تم حفظ الإشعار بنجاح</h2><p className="mt-1 px-2 text-[10px] leading-5 text-slate-500">يمكنك مراجعة الإشعار أو متابعة عملك فورًا. يكمل سند المزامنة والتحليل في الخلفية دون تعطيلك.</p></div>

          <div className={`mx-auto inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[9px] font-bold ${successData.synced ? 'bg-emerald-50 text-emerald-700' : navigator.onLine ? 'bg-sky-50 text-sky-700' : 'bg-amber-50 text-amber-700'}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${successData.synced ? 'bg-emerald-500' : navigator.onLine ? 'bg-sky-500 animate-pulse' : 'bg-amber-500'}`} />
            {successData.synced ? 'تمت المزامنة مع سند' : navigator.onLine ? 'جاري الاستكمال في الخلفية' : 'بانتظار الاتصال لإكمال المزامنة'}
          </div>

          {successPreview && <div className="rounded-2xl border border-slate-100 bg-slate-50 p-3 text-right"><div className="mb-2"><strong className="block text-[11px] text-slate-900">الإشعار الذي تم حفظه</strong><span className="block truncate text-[9px] text-slate-400" dir="auto">{successPreview.name}</span></div>{successPreview.mimeType.startsWith('image/') ? <TouchZoomImage src={successPreview.url} alt="الإشعار المالي الذي تم حفظه" /> : successPreview.mimeType === ALLOWED_PDF_TYPE ? <iframe src={successPreview.url} title="الإشعار المالي الذي تم حفظه" className="h-[58vh] w-full rounded-2xl bg-white" /> : null}</div>}

          {gallerySavedForCurrentFile && <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-right text-[10px] leading-5 text-emerald-800"><strong className="block">نسخة إضافية محفوظة في الاستوديو</strong><span>الصورة الأصلية موجودة أيضًا في Pictures/SANAD، بالإضافة إلى النسخة المحفوظة داخل سند.</span></div>}

          {processedSummary?.compressionApplied && <div className="rounded-2xl bg-emerald-50 px-4 py-3 text-right text-[10px] text-emerald-800"><strong className="block">تم تحسين الصورة قبل الحفظ داخل سند</strong><span className="mt-1 block">{formatMegabytes(processedSummary.originalSize)} ← {formatMegabytes(processedSummary.processedSize)} بصيغة WebP</span></div>}
          {successData.synced && successData.publicToken && <button type="button" onClick={openDetailsWhenReady} disabled={openingDetails} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 py-3.5 text-xs font-bold text-white shadow-sm disabled:opacity-60">{openingDetails ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}<span>{openingDetails ? 'جاري تجهيز التفاصيل…' : 'فتح تفاصيل العملية'}</span></button>}
          {successData.synced && successData.qrUrl && <><button type="button" onClick={() => setShowQr((current) => !current)} className="flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-[11px] font-bold text-slate-700"><QrCode className="h-4 w-4" /><span>{showQr ? 'إخفاء رابط وQR' : 'عرض رابط وQR للمشاركة'}</span></button>{showQr && <div className="space-y-3 rounded-2xl border border-slate-100 bg-slate-50/70 p-4">{successData.localQrCodeDataUrl && <img src={successData.localQrCodeDataUrl} alt="رمز العملية" className="mx-auto h-36 w-36 rounded-xl bg-white p-2 object-contain" />}<div className="flex items-center rounded-xl border border-slate-200 bg-white p-1 pr-3"><div className="min-w-0 flex-1 truncate px-1 text-left font-mono text-[9px] text-slate-500" dir="ltr">{successData.qrUrl}</div><button type="button" onClick={copyQrUrlToClipboard} className={`flex h-8 shrink-0 items-center gap-1 rounded-lg px-3 text-[10px] font-bold ${copied ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-950 text-white'}`}>{copied ? <Check className="h-3 w-3" /> : <Clipboard className="h-3 w-3" />}<span>{copied ? 'تم النسخ' : 'نسخ'}</span></button></div><button type="button" onClick={shareQrUrl} className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-3 py-2.5 text-[10px] font-bold text-white"><Share2 className="h-3.5 w-3.5" /> مشاركة الرابط</button></div>}</>}
          <div className="grid grid-cols-2 gap-2 border-t border-slate-100 pt-4"><button type="button" onClick={() => onNavigate('my-operations')} className="flex items-center justify-center gap-1.5 rounded-xl bg-slate-950 px-3 py-2.5 text-[10px] font-bold text-white"><FileText className="h-3.5 w-3.5" /> سجل العمليات</button><button type="button" onClick={resetUpload} className="flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[10px] font-bold text-slate-700"><RefreshCw className="h-3.5 w-3.5" /> إضافة عملية أخرى</button></div>
        </section>
      )}
    </div>
  );
}

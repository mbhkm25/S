import React, { useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Profile } from '../types';
import {
  Camera,
  Check,
  CheckCircle2,
  Clipboard,
  ExternalLink,
  FileImage,
  FileText,
  ImagePlus,
  Loader2,
  PlusCircle,
  QrCode,
  RefreshCw,
  Share2,
  UploadCloud,
} from 'lucide-react';
import QRCode from 'qrcode';
import { callSanadAppFunction } from '../lib/sanadFunctions';
import { getPublicAppUrl } from '../lib/urlUtils';
import { preparePaymentFile, ProcessedPaymentFile } from '../lib/paymentImageProcessing';

interface UploadProps {
  user: any;
  profile: Profile;
  onNavigateToDetails: (token: string) => void;
  onNavigate: (page: string) => void;
  ensureProfileComplete?: (action: () => void) => void;
}

type UploadStage = 'idle' | 'optimizing' | 'uploading' | 'creating' | 'starting-analysis';

const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const MAX_PDF_BYTES = 10 * 1024 * 1024;
const ALLOWED_PDF_TYPE = 'application/pdf';

const stageLabels: Record<UploadStage, string> = {
  idle: '',
  optimizing: 'جاري تحسين الصورة وتقليل حجمها…',
  uploading: 'جاري رفع المستند بأمان…',
  creating: 'جاري إنشاء العملية…',
  'starting-analysis': 'جاري بدء تحليل البيانات…',
};

function formatMegabytes(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(bytes >= 1024 * 1024 ? 2 : 3)} MB`;
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

export default function UploadNotification({
  user,
  profile,
  onNavigateToDetails,
  onNavigate,
  ensureProfileComplete,
}: UploadProps) {
  const [file, setFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [uploadStage, setUploadStage] = useState<UploadStage>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [openingDetails, setOpeningDetails] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [processedSummary, setProcessedSummary] = useState<ProcessedPaymentFile['metadata'] | null>(null);
  const [successData, setSuccessData] = useState<{
    id: string;
    publicToken: string;
    qrUrl: string;
    localQrCodeDataUrl: string;
    analysisTriggerFailed?: boolean;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  const cameraInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploading = uploadStage !== 'idle';

  const validateAndSetFile = (selectedFile: File) => {
    setErrorMessage(null);
    setProcessedSummary(null);

    const isImage = selectedFile.type.startsWith('image/');
    const isPdf = selectedFile.type === ALLOWED_PDF_TYPE || selectedFile.name.toLowerCase().endsWith('.pdf');

    if (!isImage && !isPdf) {
      setErrorMessage('اختر صورة واضحة أو ملف PDF لإشعار الدفع أو إيصال ماكينة الدفع.');
      return;
    }

    const maxBytes = isImage ? MAX_IMAGE_BYTES : MAX_PDF_BYTES;
    if (selectedFile.size > maxBytes) {
      setErrorMessage(
        isImage
          ? 'حجم الصورة يتجاوز 15 ميجابايت. التقطها بدقة أقل أو اختر صورة أخرى.'
          : 'حجم ملف PDF يتجاوز 10 ميجابايت.',
      );
      return;
    }

    setFile(selectedFile);
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (selectedFile) validateAndSetFile(selectedFile);
    event.target.value = '';
  };

  const handleDrag = (event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (event.type === 'dragenter' || event.type === 'dragover') setDragActive(true);
    if (event.type === 'dragleave') setDragActive(false);
  };

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setDragActive(false);
    const selectedFile = event.dataTransfer.files?.[0];
    if (selectedFile) validateAndSetFile(selectedFile);
  };

  const handleUploadSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!file || !user || !profile || uploading) return;

    const performUpload = async () => {
      setErrorMessage(null);
      let storagePath: string | null = null;

      try {
        setUploadStage(file.type.startsWith('image/') ? 'optimizing' : 'uploading');
        const prepared = await preparePaymentFile(file);
        setProcessedSummary(prepared.metadata);

        const uploadFile = prepared.file;
        setUploadStage('uploading');
        const safeFileName = uploadFile.name.replace(/[^a-zA-Z0-9.-]/g, '_') || 'payment-document';
        storagePath = `${user.id}/${Date.now()}-${safeFileName}`;

        const { error: storageError } = await supabase.storage
          .from('operation-files')
          .upload(storagePath, uploadFile, {
            cacheControl: '3600',
            upsert: false,
            contentType: uploadFile.type || 'application/octet-stream',
          });

        if (storageError) {
          throw new Error('تعذر رفع المستند. تحقق من اتصال الإنترنت وحاول مرة أخرى.');
        }

        setUploadStage('creating');
        const phone = profile.phone || (profile as Profile & { pending_phone?: string | null }).pending_phone || null;
        const clientMetadata = {
          userAgent: navigator.userAgent,
          uploadedAt: new Date().toISOString(),
          app_upload: true,
          upload_experience: 'unified_payment_upload_v1',
          ...prepared.metadata,
        };

        const { data: opData, error: dbError } = await supabase
          .from('operations')
          .insert({
            source: 'pwa_upload',
            upload_origin: 'pwa',
            submitted_by_user_id: user.id,
            submitted_by_phone: phone,
            submitted_by_name: profile.full_name,
            file_bucket: 'operation-files',
            file_path: storagePath,
            file_original_name: uploadFile.name,
            file_mime_type: uploadFile.type || file.type,
            file_size: uploadFile.size,
            original_file_status: 'stored',
            qr_status: 'created',
            status: 'stored',
            ai_status: 'pending',
            client_upload_metadata: clientMetadata,
          })
          .select('id, public_token')
          .single();

        if (dbError || !opData) {
          await supabase.storage.from('operation-files').remove([storagePath]).catch(() => undefined);
          throw new Error('تم رفع الملف، لكن تعذر إنشاء العملية. لم يتم الاحتفاظ بالملف غير المرتبط.');
        }

        const operationUrl = `${getPublicAppUrl()}/v/${opData.public_token}`;
        const qrDataUrl = await QRCode.toDataURL(operationUrl, {
          width: 240,
          margin: 2,
          color: { dark: '#111111', light: '#ffffff' },
        });

        setSuccessData({
          id: opData.id,
          publicToken: opData.public_token,
          qrUrl: operationUrl,
          localQrCodeDataUrl: qrDataUrl,
          analysisTriggerFailed: false,
        });

        setUploadStage('starting-analysis');
        try {
          await callSanadAppFunction('sanad-v3-app-trigger-analysis', {
            operation_id: opData.id,
            public_token: opData.public_token,
            source: 'pwa_upload',
          });
        } catch (analysisError) {
          console.warn('Payment operation analysis trigger failed:', analysisError);
          setSuccessData((previous) => previous ? { ...previous, analysisTriggerFailed: true } : previous);
        }
      } catch (error) {
        console.warn('Unified payment upload failed:', error);
        setErrorMessage(error instanceof Error ? error.message : 'تعذر إنشاء العملية. حاول مرة أخرى.');
      } finally {
        setUploadStage('idle');
      }
    };

    if (ensureProfileComplete) ensureProfileComplete(performUpload);
    else await performUpload();
  };

  const openDetailsWhenReady = async () => {
    if (!successData || openingDetails) return;
    setOpeningDetails(true);
    setErrorMessage(null);

    const delays = [0, 450, 900, 1800];
    for (const delay of delays) {
      if (delay) await sleep(delay);
      try {
        const { data, error } = await supabase.rpc('open_operation_access', {
          p_public_token: successData.publicToken,
          p_source: 'app',
        });
        if (!error && data?.allowed === true && data?.operation) {
          onNavigateToDetails(successData.publicToken);
          setOpeningDetails(false);
          return;
        }
      } catch (error) {
        console.warn('Operation readiness check failed:', error);
      }
    }

    setOpeningDetails(false);
    setErrorMessage('تم إنشاء العملية، لكن صفحة التفاصيل لم تصبح جاهزة بعد. افتحها من سجل العمليات بعد لحظات.');
  };

  const copyQrUrlToClipboard = () => {
    if (!successData) return;
    void navigator.clipboard.writeText(successData.qrUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2500);
  };

  const shareQrUrl = async () => {
    if (!successData) return;
    if (!navigator.share) {
      copyQrUrlToClipboard();
      return;
    }

    try {
      await navigator.share({
        title: 'عملية دفع في سند',
        text: 'رابط مراجعة عملية الدفع عبر سند.',
        url: successData.qrUrl,
      });
    } catch (error) {
      if ((error as DOMException)?.name !== 'AbortError') console.warn('Payment link sharing failed:', error);
    }
  };

  const resetUpload = () => {
    setFile(null);
    setSuccessData(null);
    setProcessedSummary(null);
    setErrorMessage(null);
    setCopied(false);
    setShowQr(false);
  };

  return (
    <div className="space-y-5 font-arabic" id="upload_view" dir="rtl">
      <header className="text-right">
        <p className="text-[10px] font-bold text-emerald-700">سند المالي</p>
        <h2 className="mt-1 text-lg font-bold text-slate-950">إضافة عملية دفع</h2>
        <p className="mt-1 text-[11px] leading-5 text-slate-500">
          صوّر أو أضف إشعار دفع أو إيصال ماكينة دفع، وسيُحفظ ضمن سجل عملياتك ويُحلل تلقائيًا.
        </p>
      </header>

      {errorMessage && (
        <div className="rounded-2xl border border-rose-100 bg-rose-50 p-3 text-right text-xs text-rose-800">
          <strong className="mb-1 block">تعذر إكمال الإجراء</strong>
          <span>{errorMessage}</span>
        </div>
      )}

      {!successData ? (
        <form onSubmit={handleUploadSubmit} className="space-y-4" id="upload_form">
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleFileChange}
            className="hidden"
          />
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,application/pdf"
            onChange={handleFileChange}
            className="hidden"
          />

          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => cameraInputRef.current?.click()}
              disabled={uploading}
              className="flex min-h-28 flex-col items-center justify-center rounded-[1.6rem] bg-slate-950 px-3 py-5 text-white shadow-[0_14px_35px_rgba(15,23,42,0.16)] disabled:opacity-50"
            >
              <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10">
                <Camera className="h-5 w-5" />
              </span>
              <strong className="text-xs">التقاط بالكاميرا</strong>
              <span className="mt-1 text-[9px] text-white/60">إشعار أو إيصال ورقي</span>
            </button>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="flex min-h-28 flex-col items-center justify-center rounded-[1.6rem] border border-slate-200 bg-white px-3 py-5 text-slate-900 shadow-sm disabled:opacity-50"
            >
              <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100">
                <ImagePlus className="h-5 w-5" />
              </span>
              <strong className="text-xs">اختيار مستند</strong>
              <span className="mt-1 text-[9px] text-slate-400">صورة أو PDF</span>
            </button>
          </div>

          <div
            onDragEnter={handleDrag}
            onDragOver={handleDrag}
            onDragLeave={handleDrag}
            onDrop={handleDrop}
            className={`rounded-[1.4rem] border border-dashed p-4 transition-all ${
              dragActive ? 'border-slate-700 bg-slate-50' : 'border-slate-200 bg-white'
            }`}
          >
            {file ? (
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
                  {file.type === ALLOWED_PDF_TYPE ? <FileText className="h-5 w-5" /> : <FileImage className="h-5 w-5" />}
                </span>
                <div className="min-w-0 flex-1 text-right">
                  <strong className="block truncate text-xs text-slate-900" dir="auto">{file.name}</strong>
                  <span className="mt-1 block text-[10px] text-slate-400">الحجم الأصلي: {formatMegabytes(file.size)}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setFile(null)}
                  disabled={uploading}
                  className="rounded-xl bg-slate-100 px-3 py-2 text-[10px] font-bold text-slate-600"
                >
                  تغيير
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-center gap-2 py-2 text-[10px] text-slate-400">
                <UploadCloud className="h-4 w-4" />
                <span>يمكنك أيضًا سحب المستند وإفلاته هنا</span>
              </div>
            )}
          </div>

          {file && (
            <div className="rounded-2xl bg-sky-50 px-4 py-3 text-[10px] leading-5 text-sky-900">
              تُحسّن الصور الكبيرة تلقائيًا إلى WebP قبل الرفع، مع الحفاظ على وضوح النصوص والأرقام. ملفات PDF تبقى كما هي.
            </div>
          )}

          <button
            type="submit"
            disabled={!file || uploading}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#111111] px-4 py-3.5 text-xs font-bold text-white shadow-sm transition-all disabled:bg-slate-300"
          >
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlusCircle className="h-4 w-4" />}
            <span>{uploading ? stageLabels[uploadStage] : 'إنشاء عملية الدفع'}</span>
          </button>
        </form>
      ) : (
        <section className="space-y-4 rounded-[1.8rem] border border-slate-200/70 bg-white p-5 text-center shadow-sm" id="success_qr_screen">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-emerald-100 bg-emerald-50 text-emerald-600">
            <CheckCircle2 className="h-6 w-6" />
          </span>

          <div>
            <h2 className="text-base font-bold text-slate-950">تم إنشاء العملية بنجاح</h2>
            <p className="mt-1 px-2 text-[10px] leading-5 text-slate-500">
              حُفظ المستند وبدأ تحليل بياناته. افتح التفاصيل لمراجعة النتائج ثم سجل تحققك من العملية.
            </p>
          </div>

          {processedSummary?.compressionApplied && (
            <div className="rounded-2xl bg-emerald-50 px-4 py-3 text-right text-[10px] text-emerald-800">
              <strong className="block">تم تحسين الصورة قبل الرفع</strong>
              <span className="mt-1 block">
                {formatMegabytes(processedSummary.originalSize)} ← {formatMegabytes(processedSummary.processedSize)} بصيغة WebP
              </span>
            </div>
          )}

          {successData.analysisTriggerFailed && (
            <div className="rounded-2xl border border-amber-100 bg-amber-50 p-3 text-[10px] font-bold text-amber-800">
              تم إنشاء العملية، لكن تعذر بدء التحليل تلقائيًا. ستظل العملية محفوظة ويمكن إعادة المحاولة لاحقًا.
            </div>
          )}

          <button
            type="button"
            onClick={openDetailsWhenReady}
            disabled={openingDetails}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 py-3.5 text-xs font-bold text-white shadow-sm disabled:opacity-60"
          >
            {openingDetails ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
            <span>{openingDetails ? 'جاري تجهيز التفاصيل…' : 'فتح تفاصيل العملية'}</span>
          </button>

          <button
            type="button"
            onClick={() => setShowQr((current) => !current)}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-[11px] font-bold text-slate-700"
          >
            <QrCode className="h-4 w-4" />
            <span>{showQr ? 'إخفاء رابط وQR' : 'عرض رابط وQR للمشاركة'}</span>
          </button>

          {showQr && (
            <div className="space-y-3 rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
              <img
                src={successData.localQrCodeDataUrl}
                alt="رمز العملية"
                className="mx-auto h-36 w-36 rounded-xl bg-white p-2 object-contain"
              />
              <div className="flex items-center rounded-xl border border-slate-200 bg-white p-1 pr-3">
                <div className="min-w-0 flex-1 truncate px-1 text-left font-mono text-[9px] text-slate-500" dir="ltr">
                  {successData.qrUrl}
                </div>
                <button
                  type="button"
                  onClick={copyQrUrlToClipboard}
                  className={`flex h-8 shrink-0 items-center gap-1 rounded-lg px-3 text-[10px] font-bold ${
                    copied ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-950 text-white'
                  }`}
                >
                  {copied ? <Check className="h-3 w-3" /> : <Clipboard className="h-3 w-3" />}
                  <span>{copied ? 'تم النسخ' : 'نسخ'}</span>
                </button>
              </div>
              <button
                type="button"
                onClick={shareQrUrl}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-3 py-2.5 text-[10px] font-bold text-white"
              >
                <Share2 className="h-3.5 w-3.5" /> مشاركة الرابط
              </button>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2 border-t border-slate-100 pt-4">
            <button
              type="button"
              onClick={() => onNavigate('my-operations')}
              className="flex items-center justify-center gap-1.5 rounded-xl bg-slate-950 px-3 py-2.5 text-[10px] font-bold text-white"
            >
              <FileText className="h-3.5 w-3.5" /> سجل العمليات
            </button>
            <button
              type="button"
              onClick={resetUpload}
              className="flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[10px] font-bold text-slate-700"
            >
              <RefreshCw className="h-3.5 w-3.5" /> إضافة عملية أخرى
            </button>
          </div>
        </section>
      )}
    </div>
  );
}

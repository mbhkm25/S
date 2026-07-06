import React, { useState, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { Profile } from '../types';
import { Upload, FileCode, CheckCircle2, QrCode, Clipboard, Loader2, RefreshCw, FileText, ArrowLeft, Check, Share2, ExternalLink, PlusCircle } from 'lucide-react';
import QRCode from 'qrcode';
import { callSanadAppFunction } from '../lib/sanadFunctions';

interface UploadProps {
  user: any;
  profile: Profile;
  onNavigateToDetails: (token: string) => void;
  onNavigate: (page: string) => void;
  ensureProfileComplete?: (action: () => void) => void;
}

export default function UploadNotification({ user, profile, onNavigateToDetails, onNavigate, ensureProfileComplete }: UploadProps) {
  const [dragActive, setDragActive] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  
  // Successful state data
  const [successData, setSuccessData] = useState<{
    id: string;
    publicToken: string;
    qrUrl: string;
    localQrCodeDataUrl: string;
    analysisTriggerFailed?: boolean;
  } | null>(null);

  const [copied, setCopied] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // File Drag-Drop triggers
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      validateAndSetFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      validateAndSetFile(e.target.files[0]);
    }
  };

  const validateAndSetFile = (selectedFile: File) => {
    setErrorMessage(null);
    if (selectedFile.size > 10 * 1024 * 1024) {
      setErrorMessage('حجم الملف كبير جداً. الحد الأقصى المسموح به هو 10 ميجابايت.');
      return;
    }
    setFile(selectedFile);
  };

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !user || !profile) return;

    const performUpload = async () => {
      setUploading(true);
      setErrorMessage(null);

      const isDev = import.meta.env.DEV;

      if (isDev) {
        console.log('[upload_start] notice upload initiated');
        console.log(`[file_selected] name: ${file.name}, type: ${file.type}, size: ${file.size} bytes`);
      }

      try {
        if (isDev) {
          console.log('[storage_upload_start] reading file into array buffer');
        }

        // Convert File to Blob inside memory to bypass Android WebView file reference sandbox restrictions
        let fileBlob: Blob;
        try {
          const fileData = await file.arrayBuffer();
          fileBlob = new Blob([fileData], { type: file.type });
        } catch (readErr: any) {
          console.error('Failed to read file locally:', readErr);
          throw new Error('تعذر اختيار أو قراءة المستند المالي من جهازك.');
        }

        const safeFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
        const storagePath = `${user.id}/${Date.now()}-${safeFileName}`;

        if (isDev) {
          console.log(`[storage_upload_start] uploading blob to path: ${storagePath}`);
        }

        // Upload the in-memory Blob with explicit contentType to Supabase Storage
        const { data: storageData, error: storageError } = await supabase.storage
          .from('operation-files')
          .upload(storagePath, fileBlob, {
            cacheControl: '3600',
            upsert: false,
            contentType: file.type
          });

        if (storageError) {
          if (isDev) {
            console.error('[storage_upload_failure]', storageError);
          }
          throw new Error('تعذر رفع الملف إلى مخزن التخزين السحابي. تحقق من الشبكة وحاول مرة أخرى.');
        }

        if (isDev) {
          console.log('[storage_upload_success] file uploaded to Supabase Storage', storageData);
        }

        const clientMetadata = {
          userAgent: navigator.userAgent,
          uploadedAt: new Date().toISOString(),
          originalName: file.name,
          size: file.size,
          type: file.type,
          app_upload: true
        };

        if (isDev) {
          console.log('[operation_insert_start] inserting operation row to DB');
        }

        const { data: opData, error: dbError } = await supabase
          .from('operations')
          .insert({
            source: 'pwa_upload', // Keeping PWA upload source code literal for DB enum compatibility
            upload_origin: 'pwa',
            submitted_by_user_id: user.id,
            submitted_by_phone: profile.phone,
            submitted_by_name: profile.full_name,
            file_bucket: 'operation-files',
            file_path: storagePath,
            file_original_name: file.name,
            file_mime_type: file.type,
            file_size: file.size,
            original_file_status: 'stored',
            qr_status: 'created',
            status: 'stored',
            ai_status: 'pending',
            client_upload_metadata: clientMetadata
          })
          .select('id, public_token')
          .single();

        if (dbError) {
          if (isDev) {
            console.error('[operation_insert_failure]', dbError);
          }
          throw new Error('تم رفع الملف بنجاح، ولكن تعذر إنشاء سجل العملية المالي في قاعدة البيانات.');
        }

        if (!opData) {
          throw new Error('لم يرجع خادم قاعدة البيانات معرف العملية.');
        }

        if (isDev) {
          console.log('[operation_insert_success] operation database row created', opData);
        }

        // Dynamically resolve target URL. Falling back to production domain if in mobile webview/development environments
        let baseDomain = window.location.origin;
        if (baseDomain.includes('localhost') || baseDomain.includes('capacitor') || baseDomain.startsWith('file:')) {
          baseDomain = 'https://sanadflow.com';
        }
        const base = import.meta.env.VITE_APP_BASE_PATH || '/';
        const cleanBase = base.endsWith('/') ? base : `${base}/`;
        const operationUrl = `${baseDomain}${cleanBase}v/${opData.public_token}`;

        const qrDataUrl = await QRCode.toDataURL(operationUrl, {
          width: 260,
          margin: 2,
          color: {
            dark: '#111111',
            light: '#ffffff'
          }
        });

        setSuccessData({
          id: opData.id,
          publicToken: opData.public_token,
          qrUrl: operationUrl,
          localQrCodeDataUrl: qrDataUrl,
          analysisTriggerFailed: false
        });

        if (isDev) {
          console.log('[analysis_trigger_start] triggering remote analysis function');
        }

        // Fire-and-forget background analysis gateway call (non-blocking)
        callSanadAppFunction('sanad-v3-app-trigger-analysis', {
          operation_id: opData.id,
          public_token: opData.public_token,
          source: 'pwa_upload'
        }).then(() => {
          if (isDev) {
            console.log('[analysis_trigger_success] intermediate analysis function triggered successfully');
          }
        }).catch((error) => {
          if (isDev) {
            console.warn('[analysis_trigger_failure] failed triggering intermediate analysis function:', error);
          }
          setSuccessData(prev => prev ? { ...prev, analysisTriggerFailed: true } : null);
        });

        if (isDev) {
          console.log('[final_success] upload flow completed successfully');
        }

      } catch (err: any) {
        if (isDev) {
          console.error('[final_failure] error inside upload flow:', err);
        }
        setErrorMessage(err.message || 'تعذر الاتصال بالخادم. تحقق من الإنترنت وحاول مرة أخرى.');
      } finally {
        setUploading(false);
      }
    };

    if (ensureProfileComplete) {
      ensureProfileComplete(performUpload);
    } else {
      performUpload();
    }
  };

  const copyQrUrlToClipboard = () => {
    if (!successData) return;
    navigator.clipboard.writeText(successData.qrUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const shareQrUrl = async () => {
    if (!successData) return;
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'تحقق من إشعار مالي - سند',
          text: 'يرجى استخدام هذا الرابط للتحقق من تفاصيل وموثوقية الإشعار المالي عبر تطبيق سند.',
          url: successData.qrUrl,
        });
      } catch (err) {
        console.log('Error sharing via API:', err);
      }
    } else {
      copyQrUrlToClipboard();
    }
  };

  const resetUpload = () => {
    setFile(null);
    setSuccessData(null);
    setErrorMessage(null);
    setCopied(false);
  };

  return (
    <div className="space-y-5" id="upload_view">
      
      {/* Header */}
      <div className="text-right">
        <h2 className="text-base font-bold text-slate-950 font-arabic">رفع إشعار مالي</h2>
        <p className="text-[11px] text-slate-500 font-arabic mt-1 leading-relaxed">
          قم بتحميل مستند مالي أصلي (صورة أو PDF) لتوليد رمز التحقق الفوري ومطابقة البيانات آلياً.
        </p>
      </div>

      {errorMessage && (
        <div className="p-3 bg-rose-50 border border-rose-100 text-rose-800 rounded-2xl text-xs text-right font-arabic">
          <span className="font-semibold block mb-0.5">تنبيه:</span>
          <span>{errorMessage}</span>
        </div>
      )}

      {!successData ? (
        /* Upload Form */
        <form onSubmit={handleUploadSubmit} className="space-y-4" id="upload_form">
          <div
            onDragEnter={handleDrag}
            onDragOver={handleDrag}
            onDragLeave={handleDrag}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            id="drag_drop_zone"
            className={`border-2 border-dashed rounded-3xl p-6 text-center cursor-pointer transition-all ${
              dragActive
                ? 'border-neutral-800 bg-slate-50/50 scale-[1.01]'
                : 'border-slate-200 bg-white hover:bg-slate-50/50'
            }`}
          >
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept="image/*,application/pdf"
              className="hidden"
            />
            
            <div className="flex flex-col items-center">
              <div className="w-12 h-12 rounded-xl bg-slate-50 flex items-center justify-center text-slate-400 mb-3.5 border border-slate-100">
                <Upload className="w-5 h-5 text-[#111111]" />
              </div>
              
              {file ? (
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-emerald-700 font-mono" dir="ltr">{file.name}</p>
                  <p className="text-[10px] text-slate-400">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                </div>
              ) : (
                <div className="space-y-1">
                  <p className="text-xs font-bold text-slate-800 font-arabic">اسحب الملف وأفلته هنا أو انقر للاختيار</p>
                  <p className="text-[10px] text-slate-400 font-arabic">يدعم الصور ومستندات PDF حتى 10 ميجابايت</p>
                </div>
              )}
            </div>
          </div>

          {file && (
            <button
              type="submit"
              disabled={uploading}
              id="upload_submit_btn"
              className="w-full bg-[#111111] hover:bg-black disabled:bg-slate-300 text-white font-bold py-3 px-4 rounded-2xl shadow-sm transition-all flex items-center justify-center gap-1.5 cursor-pointer text-xs font-arabic"
            >
              {uploading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-white" />
                  <span>جاري رفع وتوثيق المستند...</span>
                </>
              ) : (
                <>
                  <FileCode className="w-4 h-4 text-white" />
                  <span>توليد وتوثيق الإشعار المالي</span>
                </>
              )}
            </button>
          )}
        </form>
      ) : (
        /* Success screen - Elegant, minimal PWA Style */
        <div className="bg-white rounded-3xl border border-slate-200/60 p-5 text-center space-y-4 animate-fade-in" id="success_qr_screen">
          <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-100">
            <CheckCircle2 className="w-5 h-5" />
          </div>

          <div className="space-y-1">
            <h2 className="text-sm font-bold text-slate-950 font-arabic">تم الرفع والتوثيق بنجاح</h2>
            <p className="text-[10px] text-slate-500 leading-relaxed font-arabic px-3">
              تم تشفير المستند المالي بأمان وتوليد رابط التحقق الموثق. شارك الرابط أو رمز الاستجابة.
            </p>
          </div>

          {successData.analysisTriggerFailed && (
            <div className="p-2.5 bg-amber-50 border border-amber-100 rounded-xl text-[10px] text-amber-800 font-bold font-arabic">
              تم رفع الإشعار بنجاح، لكن تعذر بدء التحليل تلقائياً. يمكنك المحاولة لاحقاً.
            </div>
          )}

          {/* QR Render block */}
          <div className="flex flex-col items-center justify-center py-1">
            <div className="bg-white p-3 rounded-2xl border border-slate-100 shadow-sm">
              <img
                src={successData.localQrCodeDataUrl}
                alt="رمز الاستجابة السريعة"
                className="w-40 h-40 object-contain"
              />
            </div>
          </div>

          {/* Shareable field */}
          <div className="space-y-1 text-right">
            <span className="block text-[10px] font-bold text-slate-400 mr-1 font-arabic">رابط التحقق المباشر</span>
            <div className="relative flex items-center bg-slate-50 border border-slate-200 rounded-xl p-1 pr-3">
              <div className="flex-1 text-left font-mono text-[10px] text-slate-600 truncate break-all px-1.5 select-all" dir="ltr">
                {successData.qrUrl}
              </div>
              <button
                type="button"
                onClick={copyQrUrlToClipboard}
                className={`shrink-0 h-7.5 px-3 rounded-lg font-bold text-[10px] flex items-center gap-1 transition-all ${
                  copied 
                    ? 'bg-emerald-50 text-emerald-700' 
                    : 'bg-[#111111] hover:bg-black text-white'
                }`}
              >
                {copied ? (
                  <>
                    <Check className="w-3 h-3" />
                    <span>تم النسخ</span>
                  </>
                ) : (
                  <>
                    <Clipboard className="w-3 h-3" />
                    <span>نسخ</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Navigation Controls */}
          <div className="pt-4 border-t border-slate-100 space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={shareQrUrl}
                className="bg-[#111111] hover:bg-black text-white font-bold py-2.5 px-3 rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer text-[11px] font-arabic"
              >
                <Share2 className="w-3.5 h-3.5" />
                <span>مشاركة الرابط</span>
              </button>

              <button
                onClick={() => onNavigateToDetails(successData.publicToken)}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 px-3 rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer text-[11px] font-arabic"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>فتح التفاصيل</span>
              </button>
            </div>

            <button
              onClick={() => onNavigate('my-operations')}
              className="w-full bg-[#111111] hover:bg-black text-white font-bold py-2.5 px-4 rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer text-xs font-arabic"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>الذهاب إلى سجل العمليات</span>
            </button>

            <button
              onClick={resetUpload}
              className="w-full bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 font-bold py-2.5 px-4 rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer text-xs font-arabic"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span>رفع إشعار آخر</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

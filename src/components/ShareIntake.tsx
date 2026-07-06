import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Profile } from '../types';
import { Upload, CheckCircle2, Clipboard, Loader2, FileText, Check, AlertTriangle, Share2, PlusCircle, Home } from 'lucide-react';
import QRCode from 'qrcode';
import { callSanadAppFunction } from '../lib/sanadFunctions';

interface ShareIntakeProps {
  user: any;
  profile: Profile;
  onNavigateToDetails: (token: string) => void;
  onNavigate: (page: string) => void;
  ensureProfileComplete?: (action: () => void) => void;
}

// IndexedDB helpers
const openShareDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('sanad-share-db', 1);
    request.onupgradeneeded = (e: any) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('shares')) {
        db.createObjectStore('shares', { keyPath: 'id' });
      }
    };
    request.onsuccess = (e: any) => resolve(e.target.result);
    request.onerror = (e: any) => reject(e.target.error);
  });
};

const getShareData = (): Promise<any> => {
  return openShareDB().then((db) => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction('shares', 'readonly');
      const store = tx.objectStore('shares');
      const request = store.get('latest-share');
      request.onsuccess = (e: any) => resolve(e.target.result);
      request.onerror = (e: any) => reject(request.error);
    });
  });
};

const deleteShareData = (): Promise<void> => {
  return openShareDB().then((db) => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction('shares', 'readwrite');
      const store = tx.objectStore('shares');
      const request = store.delete('latest-share');
      tx.oncomplete = () => resolve();
      tx.onerror = (e: any) => reject(tx.error);
    });
  });
};

function resolveSharedMimeType(name: string, rawType?: string | null): string {
  const type = (rawType || '').toLowerCase().trim();
  const lowerName = (name || '').toLowerCase();

  if (type && type !== 'image/*') {
    return type;
  }

  if (lowerName.endsWith('.jpg') || lowerName.endsWith('.jpeg')) {
    return 'image/jpeg';
  }

  if (lowerName.endsWith('.png')) {
    return 'image/png';
  }

  if (lowerName.endsWith('.webp')) {
    return 'image/webp';
  }

  if (lowerName.endsWith('.pdf')) {
    return 'application/pdf';
  }

  // Android sometimes sends screenshots as image/*
  // Fallback to jpeg because most screenshots shared from Android can be safely uploaded as image/jpeg metadata.
  if (type === 'image/*' || type.startsWith('image/')) {
    return 'image/jpeg';
  }

  return 'application/octet-stream';
}

export default function ShareIntake({ user, profile, onNavigateToDetails, onNavigate, ensureProfileComplete }: ShareIntakeProps) {
  const [loadingShare, setLoadingShare] = useState(true);
  const [shareItem, setShareItem] = useState<any | null>(null);
  const [status, setStatus] = useState<'idle' | 'uploading' | 'db_saving' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Success state data
  const [successData, setSuccessData] = useState<{
    id: string;
    publicToken: string;
    qrUrl: string;
    localQrCodeDataUrl: string;
  } | null>(null);

  // Load shared data on mount
  useEffect(() => {
    const loadData = async () => {
      try {
        const data = await getShareData();
        if (data && data.files && data.files.length > 0) {
          setShareItem(data);
        } else if (data) {
          // Received non-file share (text / url)
          setShareItem(data);
        } else {
          setErrorMessage('لم يتم العثور على أي بيانات مستلمة من قائمة المشاركة.');
        }
      } catch (err) {
        console.error('Failed to load shared data:', err);
        setErrorMessage('فشل في استلاف الملف المشارك من النظام.');
      } finally {
        setLoadingShare(false);
      }
    };
    loadData();
  }, []);

  const handleUploadAndCreate = async () => {
    if (!shareItem || !user || !profile) return;

    const performUpload = async () => {
      setStatus('uploading');
      setErrorMessage(null);

      try {
        // Find the shared file
        const sharedFile = shareItem.files?.[0];
        if (!sharedFile || !sharedFile.blob) {
          throw new Error('يرجى مشاركة صورة إشعار أو ملف PDF صالح.');
        }

        // Resolve, normalize, and validate MIME type
        const resolvedMimeType = resolveSharedMimeType(sharedFile.name, sharedFile.type);
        const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

        if (!allowedTypes.includes(resolvedMimeType)) {
          throw new Error('الملف غير مدعوم. يرجى مشاركة صورة JPG أو PNG أو WEBP أو ملف PDF.');
        }

        // Validate file size (10MB limit)
        if (sharedFile.size > 10 * 1024 * 1024) {
          throw new Error('حجم الملف كبير جداً. الحد الأقصى المسموح به هو 10 ميجابايت.');
        }

        const safeFileName = sharedFile.name.replace(/[^a-zA-Z0-9.-]/g, '_');
        const storagePath = `${user.id}/${Date.now()}-${safeFileName}`;

        // Instantiate safe upload blob with correct type
        const uploadBlob =
          sharedFile.blob?.type === resolvedMimeType
            ? sharedFile.blob
            : new Blob([sharedFile.blob], { type: resolvedMimeType });

        // 1. Upload to storage
        const { data: storageData, error: storageError } = await supabase.storage
          .from('operation-files')
          .upload(storagePath, uploadBlob, {
            cacheControl: '3600',
            upsert: false,
            contentType: resolvedMimeType
          });

        if (storageError) {
          throw new Error(`فشل رفع الملف في المخزن: ${storageError.message}`);
        }

        setStatus('db_saving');

        // 2. Insert record in operations database
        const clientMetadata = {
          userAgent: navigator.userAgent,
          uploadedAt: new Date().toISOString(),
          originalName: sharedFile.name,
          size: sharedFile.size,
          type: resolvedMimeType,
          originalType: sharedFile.type || null,
          pwa_share_target: true
        };

        const { data: opData, error: dbError } = await supabase
          .from('operations')
          .insert({
            source: 'share_target', // CORRECT source literal to prevent operations_source_check violation
            upload_origin: 'pwa',
            submitted_by_user_id: user.id,
            submitted_by_phone: profile.phone,
            submitted_by_name: profile.full_name,
            file_bucket: 'operation-files',
            file_path: storagePath,
            file_original_name: sharedFile.name,
            file_mime_type: resolvedMimeType,
            file_size: sharedFile.size,
            original_file_status: 'stored',
            qr_status: 'created',
            status: 'stored',
            ai_status: 'pending',
            client_upload_metadata: clientMetadata
          })
          .select('id, public_token')
          .single();

        if (dbError) {
          throw new Error(`فشل حفظ السجل في قاعدة البيانات: ${dbError.message}`);
        }

        if (!opData) {
          throw new Error('لم يرجع خادم قاعدة البيانات معرف العملية.');
        }

        // 3. Generate QR Code pointing to public verification path
        const baseDomain = window.location.origin;
        const operationUrl = `${baseDomain}/app/v/${opData.public_token}`;
        const qrDataUrl = await QRCode.toDataURL(operationUrl, {
          width: 320, // Enlarged QR code for better visibility and scanning
          margin: 2,
          color: {
            dark: '#111111',
            light: '#ffffff'
          }
        });

        // 4. Set Success Data
        setSuccessData({
          id: opData.id,
          publicToken: opData.public_token,
          qrUrl: operationUrl,
          localQrCodeDataUrl: qrDataUrl
        });
        setStatus('success');

        // 5. Fire-and-forget background analysis gateway call (non-blocking)
        callSanadAppFunction('sanad-v3-app-trigger-analysis', {
          operation_id: opData.id,
          public_token: opData.public_token,
          source: 'share_target'
        }).catch((error) => {
          console.warn("Background analysis trigger failed", error);
        });

        // Delete temporary IndexedDB data after successful upload
        await deleteShareData();

      } catch (err: any) {
        console.error('PWA Share Upload Error:', err);
        setErrorMessage(err.message || 'حدث خطأ غير متوقع أثناء الرفع والتوثيق.');
        setStatus('error');
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

  const handleUploadAnother = async () => {
    await deleteShareData();
    onNavigate('upload');
  };

  const handleClear = async () => {
    await deleteShareData();
    onNavigate('home');
  };

  if (loadingShare) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center space-y-4" id="share_intake_loading">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
        <p className="text-xs text-slate-500 font-arabic">جاري استلام المستند المشارك...</p>
      </div>
    );
  }

  return (
    <div className="space-y-5" id="share_intake_view">
      {/* Header */}
      {status !== 'success' && (
        <div className="text-right">
          <h2 className="text-base font-bold text-slate-950 font-arabic">مشاركة المستندات المباشرة</h2>
          <p className="text-[11px] text-slate-500 font-arabic mt-1 leading-relaxed">
            استلام ومشاركة الإشعارات المالية مباشرة من التطبيقات الأخرى لرفعها وتوليد رمز QR الخاص بها.
          </p>
        </div>
      )}

      {errorMessage && (
        <div className="p-4 bg-rose-50 border border-rose-100 text-rose-800 rounded-2xl text-xs text-right font-arabic space-y-2">
          <div className="flex items-center gap-1.5 font-bold">
            <AlertTriangle className="w-4 h-4 text-rose-600" />
            <span>تنبيه:</span>
          </div>
          <p className="text-[11px] leading-relaxed">{errorMessage}</p>
          <div className="pt-2">
            <button
              onClick={handleClear}
              className="px-3 py-1.5 bg-rose-600 text-white font-bold rounded-lg text-[10px]"
            >
              العودة للرئيسية ومسح الكاش
            </button>
          </div>
        </div>
      )}

      {status === 'idle' && shareItem && (
        <div className="bg-white rounded-3xl border border-slate-200/60 p-6 space-y-4 text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-slate-50 text-slate-400 border border-slate-100 mb-2">
            <Upload className="w-5 h-5 text-emerald-600 animate-bounce" />
          </div>

          <div className="space-y-1">
            <h3 className="text-sm font-bold text-slate-900 font-arabic">تم استلام مستند مالي بنجاح</h3>
            {shareItem.files?.[0] ? (
              <div className="space-y-1 py-2">
                <p className="text-xs font-semibold text-emerald-700 font-mono" dir="ltr">
                  {shareItem.files[0].name}
                </p>
                <p className="text-[10px] text-slate-400">
                  {(shareItem.files[0].size / 1024 / 1024).toFixed(2)} MB
                </p>
              </div>
            ) : (
              <p className="text-xs text-slate-500 font-arabic">
                تمت مشاركة رابط أو نص من النظام.
              </p>
            )}
          </div>

          <div className="pt-3 border-t border-slate-100 space-y-2">
            <button
              onClick={handleUploadAndCreate}
              className="w-full bg-[#111111] hover:bg-black text-white font-bold py-3 px-4 rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer text-xs font-arabic"
            >
              <Upload className="w-4 h-4 text-white" />
              <span>رفع وإنشاء QR</span>
            </button>

            <button
              onClick={handleClear}
              className="w-full bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 font-bold py-2 px-4 rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer text-xs font-arabic"
            >
              <span>إلغاء الأمر</span>
            </button>
          </div>
        </div>
      )}

      {(status === 'uploading' || status === 'db_saving') && (
        <div className="bg-white rounded-3xl border border-slate-200/60 p-8 text-center space-y-4">
          <Loader2 className="w-8 h-8 animate-spin text-emerald-600 mx-auto" />
          <div className="space-y-1">
            <h3 className="text-sm font-bold text-slate-900 font-arabic">
              {status === 'uploading' ? 'جاري رفع الإشعار المالي...' : 'جاري إنشاء رمز QR...'}
            </h3>
            <p className="text-[10px] text-slate-400 font-arabic">
              يرجى عدم إغلاق التطبيق حتى يتم الرفع بأمان.
            </p>
          </div>
        </div>
      )}

      {status === 'success' && successData && (
        <div className="bg-white rounded-3xl border border-slate-200/60 p-6 text-center space-y-5 animate-fade-in" id="share_success_screen">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-100">
            <CheckCircle2 className="w-6 h-6" />
          </div>

          <div className="space-y-1">
            <h2 className="text-base font-bold text-slate-950 font-arabic">تم رفع الإشعار بنجاح</h2>
            <p className="text-xs text-slate-500 leading-relaxed font-arabic px-4">
              يمكنك الآن مشاركة رمز QR أو الرابط مع الطرف الآخر للتحقق من الإشعار.
            </p>
            <p className="text-[11px] text-emerald-600 font-bold font-arabic mt-1 px-4">
              سيتم تحليل بيانات الإشعار في الخلفية خلال لحظات.
            </p>
          </div>

          {/* Large, High-Contrast QR Code */}
          <div className="flex flex-col items-center justify-center py-2">
            <div className="bg-white p-4 rounded-3xl border-2 border-slate-100 shadow-md">
              <img
                src={successData.localQrCodeDataUrl}
                alt="رمز الاستجابة السريعة للتحقق"
                className="w-56 h-56 object-contain"
              />
            </div>
            <p className="text-[10px] text-slate-400 font-arabic mt-2">
              امسح الكود ضوئياً لفتح تفاصيل الإشعار المالي والتحقق من صحته.
            </p>
          </div>

          {/* Link Display Box */}
          <div className="space-y-1 text-right">
            <span className="block text-[10px] font-bold text-slate-400 mr-1 font-arabic">رابط التحقق المباشر</span>
            <div className="relative flex items-center bg-slate-50 border border-slate-200 rounded-2xl p-1.5 pr-4">
              <div className="flex-1 text-left font-mono text-[10px] text-slate-600 truncate break-all px-1.5 select-all" dir="ltr">
                {successData.qrUrl}
              </div>
              <button
                type="button"
                onClick={copyQrUrlToClipboard}
                className={`shrink-0 h-8.5 px-3 rounded-xl font-bold text-[10px] flex items-center gap-1 transition-all ${
                  copied 
                    ? 'bg-emerald-50 text-emerald-700' 
                    : 'bg-[#111111] hover:bg-black text-white'
                }`}
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>تم النسخ</span>
                  </>
                ) : (
                  <>
                    <Clipboard className="w-3.5 h-3.5" />
                    <span>نسخ</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Main Action Buttons */}
          <div className="pt-4 border-t border-slate-100 grid grid-cols-2 gap-2">
            <button
              onClick={shareQrUrl}
              className="bg-[#111111] hover:bg-black text-white font-bold py-2.5 px-3 rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer text-[11px] font-arabic"
            >
              <Share2 className="w-3.5 h-3.5" />
              <span>مشاركة الرابط</span>
            </button>

            <button
              onClick={handleUploadAnother}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 px-3 rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer text-[11px] font-arabic"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span>رفع إشعار آخر</span>
            </button>
          </div>

          <button
            onClick={() => onNavigate('home')}
            className="w-full bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 font-bold py-2.5 px-4 rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer text-xs font-arabic"
          >
            <Home className="w-3.5 h-3.5" />
            <span>العودة إلى الرئيسية</span>
          </button>
        </div>
      )}
    </div>
  );
}


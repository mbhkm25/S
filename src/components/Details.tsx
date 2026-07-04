import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { FileText, ShieldAlert, CheckCircle2, Calendar, FileDown, ExternalLink, ShieldCheck, Loader2, KeyRound, Clock, UserCheck, RefreshCw, X } from 'lucide-react';
import QRCode from 'qrcode';
import { toLatinDigits, formatYemeniDisplay, formatArabicDate, formatArabicTime } from '../lib/digits';
import ProUpgradeModal from './ProUpgradeModal';

interface DetailsProps {
  token: string;
  user: any;
  onNavigateToLogin: () => void;
  ensureProfileComplete?: (action: () => void) => void;
  onNavigate?: (page: any, token?: string, source?: string) => void;
  source?: 'link' | 'qr' | 'search' | 'app';
}

export default function NotificationDetails({ token, user, onNavigateToLogin, ensureProfileComplete, onNavigate, source }: DetailsProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [operation, setOperation] = useState<any | null>(null);
  
  // Storage link
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string | null>(null);

  // On-demand Secure File Action States
  const [fileActionLoading, setFileActionLoading] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewMimeType, setPreviewMimeType] = useState<string | null>(null);
  
  // Verification progress states
  const [verifying, setVerifying] = useState(false);
  const [verifiedSuccessMessage, setVerifiedSuccessMessage] = useState<string | null>(null);
  const [isVerifiedByMe, setIsVerifiedByMe] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  // Access control states
  const [accessReason, setAccessReason] = useState<string | null>(null);
  const [accessUsage, setAccessUsage] = useState<any | null>(null);
  const [showProModal, setShowProModal] = useState(false);

  const isUploader = user && operation && (user.id === operation.submitted_by_user_id);

  const copyLinkToClipboard = () => {
    navigator.clipboard.writeText(`${window.location.origin}/v/${token}`);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  // Load operation data
  const loadDetails = async () => {
    setLoading(true);
    setError(null);
    setAccessReason(null);
    setAccessUsage(null);
    setOperation(null);
    try {
      // Call open_operation_access to obtain operation details with security gating
      const { data, error: rpcError } = await supabase.rpc('open_operation_access', { 
        p_public_token: token,
        p_source: source || 'link'
      });

      if (rpcError) {
        console.warn('SANAD operation access failed');
        // If error message includes unauthorized / unauthenticated, default to login view
        if (rpcError.message?.includes('unauthenticated') || (rpcError.code === 'P0001' && rpcError.message?.includes('not_authenticated'))) {
          setAccessReason('not_authenticated');
          return;
        }
        throw new Error('تعذر فتح العملية الآن. حاول مرة أخرى.');
      }

      if (!data) {
        throw new Error('تعذر فتح العملية الآن. حاول مرة أخرى.');
      }

      // Record access usage if available
      if (data.usage) {
        setAccessUsage(data.usage);
      }

      if (data.allowed === true) {
        const opData = data.operation;
        if (!opData) {
          throw new Error('لم يتم العثور على إشعار بهذا الرمز أو انتهت صلاحيته.');
        }

        setOperation(opData);

        // 3. Generate QR code for the operation URL
        const operationUrl = `${window.location.origin}/v/${token}`;
        const qrDataUrl = await QRCode.toDataURL(operationUrl, {
          width: 180,
          margin: 1
        });
        setQrCodeDataUrl(qrDataUrl);

        // 4. Query whether current user verified this operation
        if (user && opData) {
          const { data: linkData, error: linkError } = await supabase
            .from('operation_user_links')
            .select('id')
            .eq('operation_id', opData.id)
            .eq('user_id', user.id)
            .eq('relation_type', 'verifier')
            .maybeSingle();
          if (!linkError && linkData) {
            setIsVerifiedByMe(true);
          } else {
            setIsVerifiedByMe(false);
          }
        }
      } else {
        // data.allowed === false
        setAccessReason(data.reason || 'unknown');
      }

    } catch (err: any) {
      console.warn('SANAD operation access failed');
      let errMsg = err.message || 'تعذر فتح العملية الآن. حاول مرة أخرى.';
      if (errMsg.includes('Failed to fetch') || err.name === 'TypeError') {
        errMsg = 'فشل الاتصال بالخادم (Failed to fetch). يرجى التأكد من جودة اتصال الإنترنت وصحة تهيئة مفاتيح Supabase.';
      }
      setError(errMsg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) {
      loadDetails();
    }
  }, [token]);

  // Handle Verify RPC call
  const handleVerifyClick = async () => {
    if (!user) {
      onNavigateToLogin();
      return;
    }

    const performVerify = async () => {
      setVerifying(true);
      setError(null);
      setVerifiedSuccessMessage(null);

      try {
        // Standard remote RPC verification
        const { error: verifyError } = await supabase.rpc('verify_operation', {
          p_token: token,
          p_note: null // pass null as requested
        });

        if (verifyError) {
          throw verifyError;
        }

        setVerifiedSuccessMessage('تم تسجيل تحققك من هذا الإشعار.');

        // Trigger n8n webhook notification if operation object exists
        if (operation) {
          fetch('https://n8n.sanadflow.com/webhook/sanad-v3-notify-verification', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              operation_id: operation.id,
              public_token: operation.public_token,
              source: 'pwa_verify',
              event: 'operation_verified'
            })
          }).catch(() => {
            console.warn('SANAD verification notification webhook failed');
          });
        }
        
        // Reload details to get fresh verified status/link counts
        await loadDetails();

      } catch (err: any) {
        console.error('Verify Operation Error:', err);
        setError(err.message || 'فشل في إكمال عملية التحقق من الإشعار المالي.');
      } finally {
        setVerifying(false);
      }
    };

    if (ensureProfileComplete) {
      ensureProfileComplete(performVerify);
    } else {
      performVerify();
    }
  };

  const handleFileAction = async (action: 'inline' | 'download' | 'new_tab') => {
    if (!operation) return;
    
    setFileError(null);
    setFileActionLoading(true);
    
    const fileBucket = operation.file_bucket || 'operation-files';
    const filePath = operation.file_path;
    
    if (!filePath) {
      setFileError('لا يوجد ملف أصلي مرتبط بهذه العملية.');
      setFileActionLoading(false);
      return;
    }
    
    // Create new tab synchronously for 'new_tab' to avoid popup blocking
    let newTab: Window | null = null;
    if (action === 'new_tab') {
      newTab = window.open('about:blank', '_blank');
    }
    
    try {
      const { data: signedData, error: signError } = await supabase.storage
        .from(fileBucket)
        .createSignedUrl(filePath, 900); // 15 minutes expiration (900 seconds)
        
      if (signError || !signedData?.signedUrl) {
        console.error('Error generating signed URL:', signError);
        if (newTab) newTab.close();
        
        const errMsg = signError?.message || '';
        const isBucketError = errMsg.toLowerCase().includes('bucket not found') || 
                              errMsg.toLowerCase().includes('bucket_not_found');
        
        if (isBucketError) {
          setFileError('تعذر الوصول إلى مخزن الملف. يرجى المحاولة لاحقًا أو التواصل مع الدعم.');
        } else {
          setFileError('تعذر فتح الملف الأصلي. قد يكون الملف غير متاح أو انتهت صلاحية رابط الوصول. حاول مرة أخرى.');
        }
        return;
      }
      
      const targetUrl = signedData.signedUrl;
      
      if (action === 'new_tab') {
        if (newTab) {
          newTab.location.href = targetUrl;
        }
      } else if (action === 'download') {
        const response = await fetch(targetUrl);
        if (!response.ok) throw new Error('فشل تحميل الملف للتنزيل.');
        const blob = await response.blob();
        const blobUrl = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = operation.file_original_name || 'document';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(blobUrl);
      } else if (action === 'inline') {
        setPreviewUrl(targetUrl);
        setPreviewMimeType(operation.file_mime_type || 'application/pdf');
        setPreviewOpen(true);
      }
    } catch (err: any) {
      console.error('File action error:', err);
      if (newTab) newTab.close();
      setFileError('تعذر فتح الملف الأصلي. قد يكون الملف غير متاح أو انتهت صلاحية رابط الوصول. حاول مرة أخرى.');
    } finally {
      setFileActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] space-y-3" id="details_loader">
        <Loader2 className="w-8 h-8 text-emerald-600 animate-spin" />
        <p className="text-slate-500 text-sm font-arabic">جاري جلب تفاصيل الإشعار المالي الموثق...</p>
      </div>
    );
  }

  // 1. Gate: Not Authenticated
  if (accessReason === 'not_authenticated') {
    return (
      <div className="bg-white rounded-3xl border border-slate-200/80 p-8 text-center space-y-5 max-w-md mx-auto shadow-sm" id="gate_not_authenticated">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-emerald-50 text-emerald-600 mb-2">
          <KeyRound className="w-6 h-6" />
        </div>
        <div className="space-y-2">
          <h3 className="text-lg font-bold text-slate-900 font-arabic">عملية مالية عبر سند</h3>
          <p className="text-xs text-slate-500 leading-relaxed font-arabic px-4">
            للوصول إلى تفاصيل العملية والتحقق من صحتها، يرجى تسجيل الدخول إلى حسابك في سند.
          </p>
        </div>
        <button
          onClick={onNavigateToLogin}
          className="w-full max-w-xs mx-auto py-3.5 bg-[#111111] hover:bg-black text-white font-bold rounded-2xl text-xs transition-all cursor-pointer shadow-md flex items-center justify-center gap-2"
        >
          <KeyRound className="w-4 h-4" />
          <span className="font-arabic font-bold">الدخول إلى سند</span>
        </button>
      </div>
    );
  }

  // 2. Gate: Profile Incomplete
  if (accessReason === 'profile_incomplete') {
    return (
      <div className="bg-white rounded-3xl border border-slate-200/80 p-8 text-center space-y-5 max-w-md mx-auto shadow-sm" id="gate_profile_incomplete">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-amber-50 text-amber-600 mb-2">
          <UserCheck className="w-6 h-6" />
        </div>
        <div className="space-y-2">
          <h3 className="text-lg font-bold text-slate-900 font-arabic">إكمال البيانات الأساسية مطلوب</h3>
          <p className="text-xs text-slate-500 leading-relaxed font-arabic px-4">
            للوصول إلى تفاصيل العملية داخل سند، أكمل بياناتك الأساسية أولًا لضمان مصداقية التوثيق والتحقق.
          </p>
        </div>
        <button
          onClick={() => {
            if (ensureProfileComplete) {
              ensureProfileComplete(() => {
                // After profile is successfully updated, retry loading details
                loadDetails();
              });
            }
          }}
          className="w-full max-w-xs mx-auto py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-2xl text-xs transition-all cursor-pointer shadow-md flex items-center justify-center gap-2"
        >
          <UserCheck className="w-4 h-4" />
          <span className="font-arabic font-bold">أكمل بياناتك الأساسية</span>
        </button>
      </div>
    );
  }

  // 3. Gate: Limit Reached
  if (accessReason === 'monthly_access_limit_reached') {
    return (
      <div className="bg-white rounded-3xl border border-slate-200/80 p-8 text-center space-y-6 max-w-md mx-auto shadow-sm" id="gate_limit_reached">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-amber-50 text-amber-600 mb-1">
          <Clock className="w-6 h-6" />
        </div>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <h3 className="text-lg font-bold text-slate-900 font-arabic">وصلت إلى حد الوصول المجاني</h3>
            <p className="text-sm font-bold text-amber-600 font-arabic">لقد استخدمت 50 عملية وصول مجانية هذا الشهر.</p>
          </div>
          
          <div className="bg-slate-50 p-4 rounded-2xl text-right space-y-2.5 border border-slate-150">
            <p className="text-xs text-slate-500 leading-relaxed font-arabic">
              <span className="font-bold text-slate-700">توضيح:</span> عملية الوصول تعني فتح تفاصيل عملية مالية عبر رابط أو QR أو البحث داخل سند.
            </p>
            <p className="text-xs text-emerald-700 font-medium leading-relaxed font-arabic">
              فعّل سند Pro لمتابعة الوصول إلى تفاصيل العمليات والتحقق منها ومطابقتها بشكل غير محدود.
            </p>
          </div>

          <div className="py-2.5 border-y border-slate-100 flex items-center justify-between px-2 text-right">
            <span className="text-xs text-slate-400 font-arabic">الاشتراك الموصى به:</span>
            <span className="text-sm font-bold text-slate-800 font-arabic">سند Pro — 3,500 ريال يمني شهريًا</span>
          </div>
        </div>

        <div className="space-y-3">
          <button
            onClick={() => setShowProModal(true)}
            className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-2xl text-xs transition-all cursor-pointer shadow-md shadow-emerald-600/10 hover:shadow-emerald-600/20 active:scale-95 flex items-center justify-center gap-2"
          >
            <span className="font-arabic font-bold">تفعيل سند Pro</span>
          </button>
          
          <button
            onClick={() => {
              if (onNavigate) {
                onNavigate('home');
              } else {
                window.location.href = '/';
              }
            }}
            className="w-full py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-2xl text-xs transition-all cursor-pointer"
          >
            <span className="font-arabic font-bold">العودة للرئيسية</span>
          </button>
        </div>

        {/* Pro Activation Modal overlay */}
        {showProModal && (
          <ProUpgradeModal
            user={user}
            onClose={() => setShowProModal(false)}
            onSuccess={loadDetails}
          />
        )}
      </div>
    );
  }

  // 4. Gate: Other errors (Not found / Expired / Inactive)
  if (accessReason === 'operation_not_found' || accessReason === 'token_not_active' || accessReason === 'token_expired') {
    let errorTitle = 'تعذر العثور على العملية';
    let errorDesc = 'الرابط المستخدم غير صالح أو ربما تم حذفه.';
    if (accessReason === 'token_not_active') {
      errorTitle = 'رابط العملية غير نشط';
      errorDesc = 'هذا الرابط لم يتم تفعيله بعد أو تم إيقافه من قبل منشئ السجل.';
    } else if (accessReason === 'token_expired') {
      errorTitle = 'انتهت صلاحية الرابط';
      errorDesc = 'انتهت الصلاحية الزمنية المحددة للوصول إلى تفاصيل هذا الإشعار.';
    }

    return (
      <div className="bg-white rounded-3xl border border-rose-100 p-8 text-center space-y-4 max-w-md mx-auto shadow-sm" id="gate_error_screen">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-rose-50 text-rose-600">
          <ShieldAlert className="w-6 h-6" />
        </div>
        <div>
          <h3 className="text-lg font-bold text-slate-900 font-arabic">{errorTitle}</h3>
          <p className="text-xs text-slate-500 mt-1 font-arabic leading-relaxed px-4">{errorDesc}</p>
        </div>
        <button
          onClick={() => {
            if (onNavigate) {
              onNavigate('home');
            } else {
              window.location.href = '/';
            }
          }}
          className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl text-xs transition-all cursor-pointer font-arabic font-bold"
        >
          العودة للرئيسية
        </button>
      </div>
    );
  }

  if (error || !operation) {
    return (
      <div className="bg-white rounded-3xl border border-rose-100 p-8 text-center space-y-4 max-w-md mx-auto" id="details_error_screen">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-rose-50 text-rose-600">
          <ShieldAlert className="w-6 h-6" />
        </div>
        <div>
          <h3 className="text-lg font-bold text-slate-900">عذراً، لم نتمكن من العثور على الإشعار</h3>
          <p className="text-xs text-slate-500 mt-1">{error || 'الرابط المستخدم غير صالح أو تم حذفه.'}</p>
        </div>
        <button
          onClick={loadDetails}
          className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl text-xs transition-all cursor-pointer"
        >
          إعادة المحاولة
        </button>
      </div>
    );
  }

  // Parse structured data and raw AI fields
  const data = operation.structured_data || operation.raw_ai_json || {};

  const recipientName = data.receiver_name || operation.receiver_name || null;

  const totalAmountRaw = operation.amount && operation.currency
    ? `${operation.amount} ${operation.currency}`
    : data.amount && data.currency
      ? `${data.amount} ${data.currency}`
      : operation.amount 
        ? `${operation.amount}` 
        : data.amount 
          ? `${data.amount}` 
          : null;
  const totalAmount = totalAmountRaw ? toLatinDigits(totalAmountRaw) : null;

  const referenceNumberRaw = operation.reference_number || data.reference_number || null;
  const referenceNumber = referenceNumberRaw ? toLatinDigits(referenceNumberRaw) : null;

  const financialEntity = operation.financial_entity || data.financial_entity || null;

  const senderName = data.sender_name || null;

  const senderAccountRaw = data.sender_account || null;
  const senderAccount = senderAccountRaw ? toLatinDigits(senderAccountRaw) : null;

  const receiverAccountRaw = data.receiver_account || null;
  const receiverAccount = receiverAccountRaw ? toLatinDigits(receiverAccountRaw) : null;

  const summary = operation.summary || data.summary || null;

  const confidenceScore = operation.confidence_score !== undefined && operation.confidence_score !== null
    ? operation.confidence_score
    : data.confidence_score !== undefined && data.confidence_score !== null
      ? data.confidence_score
      : null;

  return (
    <div className="space-y-6" id="details_view">
      
      {/* Bento Cell 1: Header Brand Block */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 flex flex-col sm:flex-row items-center gap-5 justify-between relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-50 rounded-full translate-x-12 -translate-y-12 blur-xl pointer-events-none" />
        
        <div className="flex items-center gap-4 text-right relative">
          <div className="p-3.5 bg-emerald-50 text-emerald-600 rounded-2xl shrink-0">
            <FileText className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-emerald-600 tracking-wide block">إشعار مالي موثق</span>
              <button
                onClick={loadDetails}
                className="p-1 text-slate-400 hover:text-emerald-600 hover:bg-slate-100 rounded-lg transition-all cursor-pointer"
                title="تحديث حالة التحليل"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>
            <h1 className="text-base font-bold text-slate-900 truncate max-w-[240px] sm:max-w-xs mt-0.5">
              {operation.file_original_name || 'سند مالي'}
            </h1>
            <p className="text-xs text-slate-400 flex items-center gap-1.5 mt-1 font-mono">
              <Calendar className="w-3.5 h-3.5" />
              <span>{operation.created_at ? `${formatArabicDate(operation.created_at)} | ${formatArabicTime(operation.created_at)}` : '-'}</span>
            </p>

            {/* Non-intrusive usage counter */}
            {accessUsage && (
              <div className="mt-2 text-[10px] font-medium font-arabic flex items-center gap-1">
                {accessUsage.plan === 'sanad_pro' ? (
                  <span className="inline-flex items-center gap-1 text-emerald-600 font-bold bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100/30">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    سند Pro مفعّل
                  </span>
                ) : (
                  <span className="text-slate-400 bg-slate-50 border border-slate-200/50 px-2.5 py-0.5 rounded-full">
                    استخدمت {toLatinDigits(String(accessUsage.used))} من {toLatinDigits(String(accessUsage.limit))} عملية وصول مجانية هذا الشهر
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {qrCodeDataUrl && (
          <div className="shrink-0 border border-slate-200 p-2 rounded-2xl bg-slate-50 shadow-inner relative group">
            <img src={qrCodeDataUrl} alt="QR Code" className="w-16 h-16 object-contain" />
            <span className="text-[9px] text-slate-400 font-mono block text-center mt-1">QR CODE</span>
          </div>
        )}
      </div>

      {/* Success banner if verified */}
      {verifiedSuccessMessage && (
        <div className="p-4 bg-emerald-50 border border-emerald-100 text-emerald-800 rounded-2xl text-sm flex gap-3 items-start animate-fade-in" id="verification_success_banner">
          <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-600 mt-0.5" />
          <div>
            <p className="font-semibold">{verifiedSuccessMessage}</p>
            <p className="text-xs text-emerald-600 mt-0.5">تم توثيق اسمك ورقم هاتفك كمدقق شخصي لهذه العملية.</p>
          </div>
        </div>
      )}

      {/* Structured Financial Fields Block */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 space-y-4 animate-fade-in animate-duration-300" id="financial_fields_card">
        <div>
          <span className="text-[10px] font-bold text-slate-400 block uppercase tracking-wider mb-1">البيانات المالية الهيكلية</span>
          <h3 className="text-sm font-bold text-slate-900">ملخص المعاملة ومطابقة البيانات</h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Field: Amount */}
          <div className="bg-slate-50 border border-slate-150 rounded-2xl p-4 text-right">
            <span className="text-[10px] font-bold text-slate-400 block mb-1">المبلغ المالي الإجمالي</span>
            <span className="text-sm font-bold text-slate-800">
              {totalAmount || (
                <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-100 font-arabic">
                  بانتظار المطابقة اليدوية
                </span>
              )}
            </span>
          </div>

          {/* Field: Reference Number */}
          <div className="bg-slate-50 border border-slate-150 rounded-2xl p-4 text-right">
            <span className="text-[10px] font-bold text-slate-400 block mb-1">رقم مرجع العملية (Ref)</span>
            <span className="text-sm font-mono font-bold text-slate-800">
              {referenceNumber || (
                <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-100 font-arabic">
                  بانتظار المطابقة اليدوية
                </span>
              )}
            </span>
          </div>

          {/* Field: Sender Name */}
          <div className="bg-slate-50 border border-slate-150 rounded-2xl p-4 text-right">
            <span className="text-[10px] font-bold text-slate-400 block mb-1">اسم الطرف المرسل</span>
            <span className="text-sm font-bold text-slate-800">
              {senderName || (
                <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-100 font-arabic">
                  بانتظار المطابقة اليدوية
                </span>
              )}
            </span>
          </div>

          {/* Field: Beneficiary */}
          <div className="bg-slate-50 border border-slate-150 rounded-2xl p-4 text-right">
            <span className="text-[10px] font-bold text-slate-400 block mb-1">اسم الطرف المستفيد</span>
            <span className="text-sm font-bold text-slate-800">
              {recipientName || (
                <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-100 font-arabic">
                  بانتظار المطابقة اليدوية
                </span>
              )}
            </span>
          </div>

          {/* Field: Sender Account */}
          <div className="bg-slate-50 border border-slate-150 rounded-2xl p-4 text-right">
            <span className="text-[10px] font-bold text-slate-400 block mb-1">رقم حساب / آيبان المرسل</span>
            <span className="text-sm font-mono font-bold text-slate-800">
              {senderAccount || (
                <span className="text-xs text-slate-400 bg-slate-100/50 px-2 py-0.5 rounded-full border border-slate-200/60 font-arabic">
                  غير متوفر
                </span>
              )}
            </span>
          </div>

          {/* Field: Receiver Account */}
          <div className="bg-slate-50 border border-slate-150 rounded-2xl p-4 text-right">
            <span className="text-[10px] font-bold text-slate-400 block mb-1">رقم حساب / آيبان المستفيد</span>
            <span className="text-sm font-mono font-bold text-slate-800">
              {receiverAccount || (
                <span className="text-xs text-slate-400 bg-slate-100/50 px-2 py-0.5 rounded-full border border-slate-200/60 font-arabic">
                  غير متوفر
                </span>
              )}
            </span>
          </div>

          {/* Field: Bank/Source */}
          <div className="bg-slate-50 border border-slate-150 rounded-2xl p-4 text-right">
            <span className="text-[10px] font-bold text-slate-400 block mb-1">البنك / جهة التحويل</span>
            <span className="text-sm font-bold text-slate-800">
              {financialEntity || (
                <span className="text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200 font-arabic">
                  غير محدد من التحليل
                </span>
              )}
            </span>
          </div>

          {/* Field: Transaction Type */}
          <div className="bg-slate-50 border border-slate-150 rounded-2xl p-4 text-right">
            <span className="text-[10px] font-bold text-slate-400 block mb-1">نوع العملية</span>
            <span className="text-sm font-bold text-slate-800 font-mono capitalize">
              {operation.transaction_type || data.transaction_type || (
                <span className="text-xs text-slate-400 bg-slate-100/50 px-2 py-0.5 rounded-full border border-slate-200/60 font-arabic">
                  غير متوفر
                </span>
              )}
            </span>
          </div>
        </div>

        {/* Smart Summary Card */}
        {summary && (
          <div className="p-4 bg-emerald-50/20 border border-emerald-100/50 rounded-2xl text-right space-y-1">
            <span className="text-[10px] font-bold text-emerald-600 block uppercase tracking-wider font-arabic">الملخص الذكي (AI Summary)</span>
            <p className="text-xs text-slate-700 leading-relaxed font-arabic">
              {summary}
            </p>
          </div>
        )}

        {/* Extraction Confidence Card */}
        {confidenceScore !== null && (
          <div className="p-4 bg-slate-50 border border-slate-150 rounded-2xl flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-emerald-700 font-mono">
                {typeof confidenceScore === 'number'
                  ? `${Math.round(confidenceScore <= 1 ? confidenceScore * 100 : confidenceScore)}%`
                  : confidenceScore}
              </span>
              <div className="w-20 sm:w-32 bg-slate-200 h-2 rounded-full overflow-hidden">
                <div 
                  className="bg-emerald-500 h-full rounded-full transition-all duration-500"
                  style={{ 
                    width: `${typeof confidenceScore === 'number' 
                      ? Math.min(100, Math.round(confidenceScore <= 1 ? confidenceScore * 100 : confidenceScore)) 
                      : 100}%` 
                  }}
                />
              </div>
            </div>
            <span className="text-xs font-bold text-slate-600 font-arabic">ثقة استخراج الحقول الذكية (Confidence)</span>
          </div>
        )}

        {/* Additional metadata attention points */}
        {data.sanad_attention_points && data.sanad_attention_points.length > 0 && (
          <div className="p-4 bg-amber-50/30 border border-amber-100/50 rounded-2xl text-right space-y-1">
            <span className="text-[10px] font-bold text-amber-700 block">نقاط اهتمام وتنبيهات</span>
            <ul className="list-disc list-inside text-xs text-slate-700 space-y-1 font-arabic">
              {Array.isArray(data.sanad_attention_points) 
                ? data.sanad_attention_points.map((p: string, i: number) => <li key={i}>{p}</li>)
                : <li>{data.sanad_attention_points}</li>
              }
            </ul>
          </div>
        )}

        {(() => {
          if (operation.ai_status === 'completed') {
            return (
              <div className="p-3.5 bg-emerald-50/50 border border-emerald-100 rounded-2xl text-[11px] text-emerald-800 flex items-start gap-2 text-right">
                <ShieldCheck className="w-4 h-4 shrink-0 text-emerald-600 mt-0.5" />
                <p className="leading-relaxed font-arabic">
                  <strong>تم التحليل والتحقق التلقائي:</strong> تم مطابقة مستند العملية واستخراج كافة الحقول الذكية رقمياً وبنجاح.
                </p>
              </div>
            );
          } else if (operation.ai_status === 'running') {
            return (
              <div className="p-3.5 bg-indigo-50/50 border border-indigo-100 rounded-2xl text-[11px] text-indigo-800 flex items-start gap-2 text-right animate-pulse">
                <Loader2 className="w-4 h-4 shrink-0 text-indigo-600 mt-0.5 animate-spin" />
                <p className="leading-relaxed font-arabic">
                  <strong>التحليل جارٍ الآن:</strong> جاري استخراج الحقول المالية والمطابقة الذكية للمستند حالياً... يرجى الانتظار أو التحديث.
                </p>
              </div>
            );
          } else if (operation.ai_status === 'failed') {
            return (
              <div className="p-3.5 bg-rose-50/50 border border-rose-100 rounded-2xl text-[11px] text-rose-800 flex items-start gap-2 text-right">
                <ShieldAlert className="w-4 h-4 shrink-0 text-rose-600 mt-0.5" />
                <p className="leading-relaxed font-arabic">
                  <strong>فشل التحليل الذكي:</strong> لم يكتمل التحليل التلقائي بنجاح. يمكنك التحقق ومطابقة البيانات يدوياً عبر فتح المستند بالأسفل.
                </p>
              </div>
            );
          } else { // pending or default
            return (
              <div className="p-3.5 bg-amber-50/50 border border-amber-100 rounded-2xl text-[11px] text-amber-800 flex items-start gap-2 text-right">
                <Loader2 className="w-4 h-4 shrink-0 text-amber-600 mt-0.5 animate-spin" />
                <p className="leading-relaxed font-arabic">
                  <strong>التحليل بانتظار المعالجة:</strong> الملف بانتظار بدء التحليل الذكي التلقائي. يمكنك المتابعة والتحقق يدوياً الآن.
                </p>
              </div>
            );
          }
        })()}
      </div>

      {/* Structured Bento Grid for States & Financial Info */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5" id="details_states_grid">
        
        {/* Bento Card: Original File State */}
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 space-y-3 flex flex-col justify-between">
          <div>
            <span className="text-[10px] font-bold text-slate-400 block uppercase tracking-wider">حالة الملف الأصلي</span>
            <div className="flex items-center gap-2 mt-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-sm font-bold text-slate-800">
                {operation.original_file_status === 'stored' ? 'مرفوع ومحمي بسحابية مشفرة' : operation.original_file_status || 'محفوظ'}
              </span>
            </div>
          </div>
          <p className="text-xs text-slate-500 leading-relaxed">
            تم حفظ المستند الأصلي بصيغته الثنائية في مخزن سحابي مشفر لمنع أي تلاعب بالبيانات أو تعديلها لاحقاً.
          </p>
        </div>

        {/* Bento Card: QR Code Status */}
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 space-y-3 flex flex-col justify-between">
          <div>
            <span className="text-[10px] font-bold text-slate-400 block uppercase tracking-wider">رمز التحقق السريع</span>
            <div className="flex items-center gap-2 mt-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-sm font-bold text-slate-800">
                {operation.qr_status === 'created' ? 'مفعّل ومطابق ومحكم' : operation.qr_status || 'مفعّل'}
              </span>
            </div>
          </div>
          <p className="text-xs text-slate-500 leading-relaxed">
            تم تشفير الرمز التعريفي الفريد ومطابقة التوقيع الرقمي للتحقق الفوري بنقرة واحدة من أي قارئ كاميرا.
          </p>
        </div>
      </div>

      {/* Bento Card: Original File Action Block */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 space-y-4" id="file_view_block">
        <div>
          <span className="text-[10px] font-bold text-emerald-600 block uppercase tracking-wider mb-1 font-arabic">الملف الأصلي</span>
          <h3 className="text-sm font-bold text-slate-900 font-arabic mb-3">مراجعة وتدقيق المستند المالي الأصلي</h3>
          
          <div className="bg-slate-50 border border-slate-150 rounded-2xl p-4 text-right space-y-2 mb-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500 font-arabic">اسم الملف:</span>
              <span className="font-mono font-semibold text-slate-800 truncate max-w-[200px]" dir="ltr">
                {operation.file_original_name || 'document'}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs border-t border-slate-100 pt-2">
              <span className="text-slate-500 font-arabic">نوع الملف:</span>
              <span className="font-mono text-slate-700">
                {operation.file_mime_type || 'غير معروف'}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs border-t border-slate-100 pt-2">
              <span className="text-slate-500 font-arabic">الحجم:</span>
              <span className="font-mono text-slate-700">
                {operation.file_size ? `${(operation.file_size / 1024).toFixed(1)} كيلوبايت` : 'غير معروف'}
              </span>
            </div>
          </div>

          {fileError && (
            <div className="p-3 bg-rose-50 border border-rose-100 text-rose-800 rounded-xl text-xs text-right font-arabic">
              {fileError}
            </div>
          )}

          {fileActionLoading && (
            <div className="flex items-center justify-center gap-2 p-2 text-xs text-slate-500 font-arabic">
              <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
              <span>جاري تحضير رابط الوصول الآمن...</span>
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-2.5 pt-1">
          <a
            href="#"
            onClick={(e) => { e.preventDefault(); handleFileAction('new_tab'); }}
            id="view_original_file_link"
            className="px-5 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-2xl text-xs transition-all inline-flex items-center gap-2 shadow-sm cursor-pointer font-arabic"
          >
            <ExternalLink className="w-4 h-4" />
            <span>فتح في نافذة جديدة</span>
          </a>
          <a
            href="#"
            onClick={(e) => { e.preventDefault(); handleFileAction('download'); }}
            id="download_original_file_link"
            className="px-5 py-3 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 font-bold rounded-2xl text-xs transition-all inline-flex items-center gap-2 cursor-pointer font-arabic"
          >
            <FileDown className="w-4 h-4" />
            <span>تنزيل الملف</span>
          </a>
          
          <button
            onClick={() => handleFileAction('inline')}
            type="button"
            className="px-5 py-3 bg-slate-800 hover:bg-slate-900 text-white font-bold rounded-2xl text-xs transition-all inline-flex items-center gap-2 cursor-pointer font-arabic"
          >
            <FileText className="w-4 h-4" />
            <span>عرض داخل سند</span>
          </button>
        </div>
      </div>

      {/* Automated AI Status Warning Section */}
      <div className="bg-slate-50 border border-slate-200 rounded-3xl p-6 space-y-3" id="ai_status_block">
        <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
          <Clock className="w-4.5 h-4.5 text-amber-500" />
          <span>التحليل الذكي للبيانات والتدقيق التلقائي</span>
        </h3>
        
        {operation.ai_status === 'pending' ? (
          <p className="text-xs text-slate-600 leading-relaxed">
            تم حفظ الإشعار الأصلي بنجاح. عملية التحليل التلقائي معلقة حالياً، ويمكنك التحقق والمطابقة بالاطلاع على المستند الفعلي أعلاه.
          </p>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-slate-600">
              حالة استخراج الحقول: <span className="font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full text-[11px] inline-block">{operation.ai_status || 'مكتمل'}</span>
            </p>
            {operation.extracted_metadata && (
              <div className="bg-white p-4 rounded-2xl border border-slate-200 text-xs font-mono text-slate-700 space-y-2">
                {Object.entries(operation.extracted_metadata).map(([k, v]: [string, any]) => (
                  <div key={k} className="flex justify-between border-b border-slate-50 pb-1.5 last:border-none last:pb-0">
                    <span className="text-slate-400">{k}:</span>
                    <span className="text-slate-800 font-semibold">{JSON.stringify(v)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Metadata Section - Bento Layout Grid */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 space-y-4" id="operation_metadata">
        <h3 className="text-sm font-bold text-slate-900">بيانات التوثيق السحابي والسجل الرقمي</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs pt-1">
          <div className="flex justify-between items-center border-b border-slate-100 pb-2.5">
            <span className="text-slate-400">منشئ السجل (الرافع):</span>
            <span className="font-bold text-slate-800">{operation.submitted_by_name || 'غير معروف'}</span>
          </div>
          <div className="flex justify-between items-center border-b border-slate-100 pb-2.5">
            <span className="text-slate-400">هاتف مرسل الإشعار:</span>
            <span className="font-mono font-bold text-slate-800" dir="ltr">{formatYemeniDisplay(operation.submitted_by_phone) || '-'}</span>
          </div>
          <div className="flex justify-between items-center border-b border-slate-100 pb-2.5 md:border-none md:pb-0">
            <span className="text-slate-400">الرمز الفريد الموثق:</span>
            <span className="font-mono text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-full select-all">
              {operation.public_token}
            </span>
          </div>
          <div className="flex justify-between items-center pb-0">
            <span className="text-slate-400">حجم ملف الإثبات:</span>
            <span className="font-mono font-bold text-slate-800">
              {operation.file_size ? `${(operation.file_size / 1024).toFixed(1)} كيلوبايت` : '-'}
            </span>
          </div>
        </div>
      </div>

      {/* Verification or Share Action Block based on User Role */}
      {isUploader ? (
        <div className="bg-slate-50 border border-slate-200 p-6 rounded-3xl text-center space-y-4 animate-fade-in" id="uploader_info_box">
          <div className="max-w-md mx-auto space-y-2">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 mb-1 border border-emerald-100">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-bold text-slate-900">هذه عملية أرسلتها إلى سند</h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              لقد قمت برفع هذا الإشعار المالي بنجاح. يمكنك مشاركة رمز الاستجابة السريعة أو الرابط أدناه مع الطرف الآخر لتسجيل تحققه ومطابقة العملية.
            </p>
          </div>

          <div className="flex flex-col items-center justify-center p-4 bg-white border border-slate-150 rounded-2xl max-w-sm mx-auto space-y-3 shadow-inner">
            {qrCodeDataUrl && (
              <img src={qrCodeDataUrl} alt="رمز الاستجابة السريعة" className="w-32 h-32 object-contain" />
            )}
            <div className="w-full text-right space-y-1.5">
              <span className="block text-[10px] font-bold text-slate-400">رابط التحقق الخاص بالإشعار:</span>
              <div className="relative flex items-center bg-slate-50 border border-slate-200 rounded-xl p-1">
                <div className="flex-1 text-left font-mono text-[10px] text-slate-500 truncate px-2 select-all font-semibold" dir="ltr">
                  {`${window.location.origin}/v/${token}`}
                </div>
                <button
                  type="button"
                  onClick={copyLinkToClipboard}
                  className={`shrink-0 font-bold text-[10px] py-1.5 px-3 rounded-lg transition-all ${
                    copiedLink
                      ? 'bg-emerald-50 text-emerald-600 border border-emerald-100 font-arabic'
                      : 'bg-emerald-600 hover:bg-emerald-700 text-white active:scale-95'
                  }`}
                >
                  {copiedLink ? 'تم النسخ' : 'نسخ الرابط'}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : isVerifiedByMe ? (
        <div className="bg-emerald-50/50 border border-emerald-200 p-6 rounded-3xl text-center space-y-3 animate-fade-in" id="already_verified_box">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-bold text-slate-900">لقد قمت بالتحقق من هذا الإشعار مسبقاً</h3>
          <p className="text-xs text-slate-600 max-w-sm mx-auto leading-relaxed">
            تم تسجيل توقيعك الشخصي وتأكيد مطابقة البيانات بنجاح في قاعدة بيانات سند الموثقة.
          </p>
        </div>
      ) : (
        /* Verification Action Button for Verifier */
        <div className="bg-slate-50 border border-slate-200 p-6 rounded-3xl text-center space-y-4 animate-fade-in" id="verification_box">
          <div className="max-w-md mx-auto space-y-2">
            <h3 className="text-sm font-bold text-slate-900">تأكيد ومطابقة الإشعار المالي الشخصي</h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              بنقرك على الزر أدناه، تؤكد بصفتك مدققاً رسمياً ومسؤولاً أن المستند المالي الأصلي سليم ومطابق للمبلغ الفعلي للعملية المعروضة.
            </p>
          </div>

          {user ? (
            <button
              onClick={handleVerifyClick}
              disabled={verifying}
              id="btn_confirm_verify"
              className="w-full max-w-sm mx-auto bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white font-bold py-3.5 px-6 rounded-2xl shadow-lg shadow-emerald-600/10 hover:shadow-emerald-600/20 active:scale-[0.98] transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              {verifying ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>جاري تسجيل التحقق من الإشعار...</span>
                </>
              ) : (
                <>
                  <UserCheck className="w-5 h-5" />
                  <span>تم التحقق (مطابق وصحيح)</span>
                </>
              )}
            </button>
          ) : (
            <div className="max-w-sm mx-auto p-4 bg-white border border-slate-200 rounded-2xl space-y-3">
              <p className="text-xs text-slate-500">يتطلب التوثيق والتحقق الشخصي من العمليات تسجيل الدخول إلى حسابك الموثق.</p>
              <button
                onClick={onNavigateToLogin}
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-2xl text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-sm"
              >
                <KeyRound className="w-4 h-4" />
                <span>تسجيل الدخول للتحقق الآن</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* Inline File Preview Modal */}
      {previewOpen && previewUrl && (
        <div className="fixed inset-0 bg-slate-900/85 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in" style={{ direction: 'rtl' }}>
          <div className="bg-white rounded-3xl w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-scale-up border border-slate-200">
            {/* Modal Header */}
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <button
                type="button"
                onClick={() => { setPreviewOpen(false); setPreviewUrl(null); }}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200/50 rounded-xl transition-all cursor-pointer"
                title="إغلاق"
              >
                <X className="w-5 h-5" />
              </button>
              
              <h4 className="text-sm font-bold text-slate-800 font-arabic truncate max-w-md text-right">
                {operation.file_original_name || 'عرض المستند الأصلي'}
              </h4>
            </div>
            
            {/* Modal Content */}
            <div className="p-4 flex-1 overflow-auto bg-slate-100/50 flex items-center justify-center min-h-[300px]">
              {previewMimeType?.startsWith('image/') ? (
                <img
                  src={previewUrl}
                  alt={operation.file_original_name || 'document'}
                  className="max-w-full max-h-[70vh] rounded-2xl object-contain shadow-sm"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <object
                  data={previewUrl}
                  type="application/pdf"
                  className="w-full h-[70vh] rounded-2xl"
                >
                  <iframe
                    src={previewUrl}
                    className="w-full h-[70vh] rounded-2xl border-none"
                    title="PDF Viewer"
                  />
                </object>
              )}
            </div>
            
            {/* Modal Footer */}
            <div className="p-3 border-t border-slate-100 flex justify-end bg-slate-50">
              <button
                type="button"
                onClick={() => { setPreviewOpen(false); setPreviewUrl(null); }}
                className="px-5 py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded-xl text-xs transition-all cursor-pointer font-arabic"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

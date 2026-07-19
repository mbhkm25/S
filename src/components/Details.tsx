import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { FileText, ShieldAlert, CheckCircle2, Calendar, FileDown, ExternalLink, ShieldCheck, Loader2, KeyRound, Clock, UserCheck, RefreshCw, X, Store, Copy, Check, ZoomIn, ZoomOut, Maximize2, AlertCircle } from 'lucide-react';
import QRCode from 'qrcode';
import { formatYemeniDisplay } from '../lib/digits';
import { toLatinDigits, formatYemenDate, formatYemenTime } from '../utils/numerals';
import ProUpgradeModal from './ProUpgradeModal';
import FinancialEntityLogo from './FinancialEntityLogo';
import { callSanadAppFunction } from '../lib/sanadFunctions';
import {
  getLinkableBusinessesForUser, linkOperationToBusiness,
  LinkableBusinessItem
} from '../lib/businessApi';

interface DetailsProps {
  token: string;
  user: any;
  onNavigateToLogin: () => void;
  ensureProfileComplete?: (action: () => void) => void;
  onNavigate?: (page: any, token?: string, source?: string) => void;
  source?: 'link' | 'qr' | 'search' | 'app';
}

// Helper to extract file metadata from database field variants
const getOperationFileMeta = (op: any) => {
  if (!op) return { fileBucket: 'operation-files', filePath: null, mimeType: 'application/pdf', originalName: 'document', size: null };
  const fileBucket = op.file_bucket || op.storage_bucket || op.original_file_bucket || 'operation-files';
  const filePath = op.file_path || op.storage_path || op.original_file_path || null;
  const mimeType = op.file_mime_type || op.mime_type || 'application/pdf';
  const originalName = op.file_original_name || op.file_name || op.name || 'document';
  const size = op.file_size || op.size || null;

  return { fileBucket, filePath, mimeType, originalName, size };
};


// Time discrepancy warning helper
const calculateTimeDiscrepancy = (txTimeStr: string, verifiedTimeStr: string) => {
  if (!txTimeStr) return { diffMinutes: 0, text: 'وقت العملية غير متوفر', isWarning: false, isFuture: false };

  try {
    const txDate = new Date(txTimeStr);
    const verifiedDate = new Date(verifiedTimeStr);

    if (isNaN(txDate.getTime()) || isNaN(verifiedDate.getTime())) {
      return { diffMinutes: 0, text: 'تنسيق الوقت غير صالح', isWarning: false, isFuture: false };
    }

    const diffMs = txDate.getTime() - verifiedDate.getTime();
    const absDiffMs = Math.abs(diffMs);
    const diffMinutes = Math.floor(absDiffMs / (1000 * 60));

    if (diffMinutes <= 7) {
      return { diffMinutes, text: 'الوقت متوافق', isWarning: false, isFuture: false };
    }

    // Human readable duration formatter
    const formatDuration = (minutes: number) => {
      if (minutes < 60) {
        return toLatinDigits(`${minutes} دقيقة`);
      }
      const hours = Math.floor(minutes / 60);
      const remainingMinutes = minutes % 60;
      if (hours < 24) {
        return remainingMinutes > 0
          ? toLatinDigits(`${hours} ساعة و ${remainingMinutes} دقيقة`)
          : toLatinDigits(`${hours} ساعة`);
      }
      const days = Math.floor(hours / 24);
      const remainingHours = hours % 24;
      return remainingHours > 0
        ? toLatinDigits(`${days} يوم و ${remainingHours} ساعة`)
        : toLatinDigits(`${days} يوم`);
    };

    const durationText = formatDuration(diffMinutes);
    const isFuture = diffMs > 0; // Transaction date is in the future relative to verification date

    let text = "";
    if (isFuture) {
      text = toLatinDigits(`وقت العملية المسجل بعد وقت التحقق بـ ${durationText}`);
    } else {
      text = toLatinDigits(`تمت العملية قبل التحقق بـ ${durationText}`);
    }

    return {
      diffMinutes,
      text,
      isWarning: true,
      isFuture
    };
  } catch (e) {
    return { diffMinutes: 0, text: 'تعذر حساب الفرق الزمني', isWarning: false, isFuture: false };
  }
};

// Static color map for Currency badges
const currencyMap: Record<string, { label: string; style: string }> = {
  YER: {
    label: 'ريال يمني (YER)',
    style: 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/20 dark:text-amber-400 dark:border-amber-900/30'
  },
  SAR: {
    label: 'ريال سعودي (SAR)',
    style: 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/20 dark:text-emerald-400 dark:border-emerald-900/30'
  },
  USD: {
    label: 'دولار أمريكي (USD)',
    style: 'bg-blue-50 text-blue-800 border-blue-200 dark:bg-blue-950/20 dark:text-blue-400 dark:border-blue-900/30'
  }
};

const getCurrencyDetails = (currency: string) => {
  const code = (currency || "").toUpperCase().trim();
  return currencyMap[code] || {
    label: code,
    style: 'bg-slate-50 text-slate-800 border-slate-200 dark:bg-slate-800/40 dark:text-slate-300 dark:border-slate-700/30'
  };
};

export default function NotificationDetails({ token, user, onNavigateToLogin, ensureProfileComplete, onNavigate, source }: DetailsProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [operation, setOperation] = useState<any | null>(null);
  const fileMeta = getOperationFileMeta(operation);

  // Storage preview links
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string | null>(null);

  // Secure File Action States
  const [fileActionLoading, setFileActionLoading] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [fileStatusMessage, setFileStatusMessage] = useState<string | null>(null);

  // Verification progress states
  const [verifying, setVerifying] = useState(false);
  const [verifiedSuccessMessage, setVerifiedSuccessMessage] = useState<string | null>(null);
  const [isVerifiedByMe, setIsVerifiedByMe] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  // Access control states
  const [accessReason, setAccessReason] = useState<string | null>(null);
  const [accessUsage, setAccessUsage] = useState<any | null>(null);
  const [showProModal, setShowProModal] = useState(false);

  // Business association state variables
  const [linkableBusinesses, setLinkableBusinesses] = useState<LinkableBusinessItem[]>([]);
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [linkingBusiness, setLinkingBusiness] = useState(false);
  const [linkSuccess, setLinkSuccess] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);

  // Custom UI redesign layout states
  const [openSections, setOpenSections] = useState({
    extracted: false,
    ai: false,
    verification: false,
    technical: false
  });
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [signedUrlError, setSignedUrlError] = useState(false);
  const [isFullscreenPreviewOpen, setIsFullscreenPreviewOpen] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1);

  const mountedRef = useRef(true);

  const isUploader = user && operation && (user.id === operation.submitted_by_user_id);

  const copyLinkToClipboard = () => {
    navigator.clipboard.writeText(`${window.location.origin}/v/${token}`);
    setCopiedLink(true);
    setTimeout(() => {
      if (mountedRef.current) setCopiedLink(false);
    }, 2000);
  };

  const handleCopyText = (text: string, fieldId: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedField(fieldId);
    setTimeout(() => {
      if (mountedRef.current) setCopiedField(null);
    }, 1500);
  };

  const handleZoomIn = () => setZoomLevel(prev => Math.min(prev + 0.25, 3));
  const handleZoomOut = () => setZoomLevel(prev => Math.max(prev - 0.25, 0.75));
  const handleResetZoom = () => setZoomLevel(1);

  // Load operation details with access restrictions
  const loadDetails = async () => {
    setLoading(true);
    setError(null);
    setAccessReason(null);
    setAccessUsage(null);
    setOperation(null);
    setSignedUrl(null);
    setSignedUrlError(false);

    try {
      const { data, error: rpcError } = await supabase.rpc('open_operation_access', {
        p_public_token: token,
        p_source: source || 'link'
      });

      if (rpcError) {
        console.warn('SANAD operation access failed');
        if (rpcError.message?.includes('unauthenticated') || (rpcError.code === 'P0001' && rpcError.message?.includes('not_authenticated'))) {
          setAccessReason('not_authenticated');
          return;
        }
        throw new Error('تعذر فتح العملية الآن. حاول مرة أخرى.');
      }

      if (!data) {
        throw new Error('تعذر فتح العملية الآن. حاول مرة أخرى.');
      }

      if (data.usage) {
        setAccessUsage(data.usage);
      }

      if (data.allowed === true) {
        const opData = data.operation;
        if (!opData) {
          throw new Error('لم يتم العثور على إشعار بهذا الرمز أو انتهت صلاحيته.');
        }

        setOperation(opData);

        // Automatically fetch signed URL for inline document preview
        const meta = getOperationFileMeta(opData);
        if (meta.filePath) {
          fetchBackendSignedUrl(opData.public_token, 'open')
            .then(url => {
              if (mountedRef.current) {
                setSignedUrl(url);
              }
            })
            .catch(err => {
              console.warn('Failed to auto-fetch signed URL for inline document preview:', err);
              if (mountedRef.current) {
                setSignedUrlError(true);
              }
            });
        }

        // Generate QR code for the operation URL
        const operationUrl = `${window.location.origin}/v/${token}`;
        const qrDataUrl = await QRCode.toDataURL(operationUrl, {
          width: 180,
          margin: 1
        });
        setQrCodeDataUrl(qrDataUrl);

        // Query whether current user verified this operation
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

  const retryFetchSignedUrl = async () => {
    if (!operation || !operation.public_token) return;
    setSignedUrlError(false);
    setSignedUrl(null);
    try {
      const url = await fetchBackendSignedUrl(operation.public_token, 'open');
      if (mountedRef.current) {
        setSignedUrl(url);
      }
    } catch (err) {
      console.error('Failed to retry signed URL fetch:', err);
      if (mountedRef.current) {
        setSignedUrlError(true);
      }
    }
  };

  useEffect(() => {
    mountedRef.current = true;
    if (token) {
      loadDetails();
    }
    return () => {
      mountedRef.current = false;
    };
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
        const { error: verifyError } = await supabase.rpc('verify_operation', {
          p_token: token,
          p_note: null
        });

        if (verifyError) {
          throw verifyError;
        }

        setVerifiedSuccessMessage('تم تسجيل تحققك من هذا الإشعار.');

        if (operation) {
          callSanadAppFunction('sanad-v3-app-trigger-notify-verification', {
            operation_id: operation.id,
            public_token: operation.public_token,
            source: 'pwa_verify',
            event: 'operation_verified'
          }).catch(() => {
            console.warn('SANAD verification notification trigger failed');
          });
        }

        await loadDetails();

        try {
          const linkable = await getLinkableBusinessesForUser();
          if (linkable && linkable.length > 0) {
            setLinkableBusinesses(linkable);
            setShowLinkModal(true);
          }
        } catch (linkErr) {
          console.warn('Failed to fetch linkable businesses:', linkErr);
        }

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

  const handleLinkToBusiness = async (businessId: string) => {
    if (!operation) return;
    setLinkingBusiness(true);
    setLinkError(null);
    setLinkSuccess(false);
    try {
      await linkOperationToBusiness(operation.id, businessId);
      setLinkSuccess(true);
      setTimeout(() => {
        if (mountedRef.current) {
          setShowLinkModal(false);
          setLinkSuccess(false);
        }
      }, 2000);
    } catch (err: any) {
      setLinkError(err.message || 'تعذر ربط العملية بالنشاط. حاول مرة أخرى.');
    } finally {
      setLinkingBusiness(false);
    }
  };

  const fetchBackendSignedUrl = async (
    publicToken: string,
    purpose: 'open' | 'download'
  ): Promise<string> => {
    const isDev = import.meta.env.DEV;

    if (isDev) {
      console.log('[file_access_function_start] initiating edge function call');
    }

    try {
      const { data, error: invokeError } = await supabase.functions.invoke('sanad-file-access', {
        method: 'POST',
        body: {
          public_token: publicToken,
          purpose: purpose
        }
      });

      if (!invokeError && data?.ok && data?.signed_url) {
        return data.signed_url;
      }

      if (invokeError || (data && !data.ok)) {
        const errorMsg = invokeError?.message || data?.message || data?.error || 'Unknown error';
        console.warn('supabase.functions.invoke returned error, falling back to manual fetch:', errorMsg);
      }
    } catch (invokeCatch) {
      console.warn('supabase.functions.invoke threw exception, falling back to manual fetch:', invokeCatch);
    }

    // Fallback: Manual fetch request
    const metaEnv = (import.meta as any).env || {};
    const supabaseUrl = metaEnv.VITE_SUPABASE_URL || 'https://api.sanadflow.com';
    const isJWT = (key: any) => typeof key === 'string' && key.startsWith('eyJ');

    let resolvedKey = '';
    if (isJWT(metaEnv.VITE_SUPABASE_ANON_KEY)) {
      resolvedKey = metaEnv.VITE_SUPABASE_ANON_KEY;
    } else if (isJWT(metaEnv.VITE_SUPABASE_PUBLISHABLE_KEY)) {
      resolvedKey = metaEnv.VITE_SUPABASE_PUBLISHABLE_KEY;
    } else {
      resolvedKey = metaEnv.VITE_SUPABASE_ANON_KEY || metaEnv.VITE_SUPABASE_PUBLISHABLE_KEY || '';
    }

    if (!resolvedKey || resolvedKey === 'dummy-publishable-key-placeholder') {
      resolvedKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh1ZGJ6bGdjbGdobGhhemxkdWFzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI4NzI3NzEsImV4cCI6MjA5ODQ0ODc3MX0.mQvUtmAwmRXPdMJdynPemP56PSeONMUpw_k0rz_pUag';
    }

    let authHeader = `Bearer ${resolvedKey}`;
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (sessionData?.session?.access_token) {
        authHeader = `Bearer ${sessionData.session.access_token}`;
      }
    } catch (e) {
      // Ignore
    }

    const endpointUrl = `${supabaseUrl}/functions/v1/sanad-file-access`;

    const response = await fetch(endpointUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': resolvedKey,
        'Authorization': authHeader
      },
      body: JSON.stringify({
        public_token: publicToken,
        purpose: purpose
      })
    });

    if (!response.ok) {
      throw new Error(`تعذر تجهيز رابط الملف الأصلي. (رمز الحالة: ${response.status})`);
    }

    const resData = await response.json();
    if (!resData.ok || !resData.signed_url) {
      throw new Error(resData.message || resData.error || 'تعذر تجهيز رابط الملف الأصلي.');
    }

    return resData.signed_url;
  };

  const openOriginalFile = async () => {
    if (!operation || !operation.public_token) return;
    setFileError(null);
    setFileStatusMessage('جاري تجهيز الملف للفتح...');
    setFileActionLoading(true);

    const { filePath } = getOperationFileMeta(operation);
    if (!filePath) {
      setFileError('لا يوجد ملف أصلي مرتبط بهذه العملية.');
      setFileActionLoading(false);
      setFileStatusMessage(null);
      return;
    }

    const isCapacitor = !!(window as any).Capacitor;

    let newTab: Window | null = null;
    if (!isCapacitor) {
      newTab = window.open('about:blank', '_blank');
    }

    try {
      const targetUrl = signedUrl || await fetchBackendSignedUrl(operation.public_token, 'open');

      if (isCapacitor) {
        window.open(targetUrl, '_system');
        setFileStatusMessage('تم فتح الملف في المتصفح الخارجي');
      } else {
        if (newTab) {
          newTab.location.href = targetUrl;
        } else {
          window.open(targetUrl, '_blank');
        }
        setFileStatusMessage('تم فتح الملف في نافذة جديدة');
      }
    } catch (err: any) {
      console.error('Failed to open file:', err);
      if (newTab) newTab.close();

      const errMsg = err.message || '';
      if (errMsg.toLowerCase().includes('expired') || errMsg.toLowerCase().includes('صلاحية')) {
        setFileError('انتهت صلاحية رابط الملف، حاول مرة أخرى.');
      } else if (errMsg.toLowerCase().includes('no file') || errMsg.toLowerCase().includes('لا يوجد ملف')) {
        setFileError('لا يوجد ملف أصلي مرتبط بهذه العملية.');
      } else {
        setFileError(errMsg || 'تعذر تجهيز رابط الملف الأصلي.');
      }
    } finally {
      setFileActionLoading(false);
      setTimeout(() => {
        if (mountedRef.current) setFileStatusMessage(null);
      }, 3000);
    }
  };

  const downloadOriginalFile = async () => {
    if (!operation || !operation.public_token) return;
    setFileError(null);
    setFileStatusMessage('جاري تجهيز الملف للتنزيل...');
    setFileActionLoading(true);

    const { filePath } = getOperationFileMeta(operation);
    if (!filePath) {
      setFileError('لا يوجد ملف أصلي مرتبط بهذه العملية.');
      setFileActionLoading(false);
      setFileStatusMessage(null);
      return;
    }

    const isCapacitor = !!(window as any).Capacitor;

    try {
      const targetUrl = await fetchBackendSignedUrl(operation.public_token, 'download');

      if (isCapacitor) {
        window.open(targetUrl, '_system');
        setFileStatusMessage('تم بدء التنزيل في المتصفح الخارجي');
      } else {
        const link = document.createElement('a');
        link.href = targetUrl;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setFileStatusMessage('تم بدء التنزيل بنجاح');
      }
    } catch (err: any) {
      console.error('Failed to download file:', err);

      const errMsg = err.message || '';
      if (errMsg.toLowerCase().includes('expired') || errMsg.toLowerCase().includes('صلاحية')) {
        setFileError('انتهت صلاحية رابط الملف، حاول مرة أخرى.');
      } else if (errMsg.toLowerCase().includes('no file') || errMsg.toLowerCase().includes('لا يوجد ملف')) {
        setFileError('لا يوجد ملف أصلي مرتبط بهذه العملية.');
      } else {
        setFileError(errMsg || 'تعذر تجهيز رابط الملف الأصلي.');
      }
    } finally {
      setFileActionLoading(false);
      setTimeout(() => {
        if (mountedRef.current) setFileStatusMessage(null);
      }, 3000);
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

  // Gates & error screens
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
            className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-2xl text-xs transition-all cursor-pointer shadow-md flex items-center justify-center gap-2"
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
      <div className="bg-white rounded-3xl border border-rose-100 p-8 text-center space-y-4 max-w-md mx-auto animate-fade-in" id="details_error_screen">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-rose-50 text-rose-600">
          <ShieldAlert className="w-6 h-6" />
        </div>
        <div>
          <h3 className="text-lg font-bold text-slate-900 font-arabic">عذراً، لم نتمكن من العثور على الإشعار</h3>
          <p className="text-xs text-slate-500 mt-1 font-arabic">{error || 'الرابط المستخدم غير صالح أو تم حذفه.'}</p>
        </div>
        <button
          onClick={loadDetails}
          className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl text-xs transition-all cursor-pointer font-arabic font-bold"
        >
          إعادة المحاولة
        </button>
      </div>
    );
  }

  // Parse structured data and raw AI fields
  const data = operation.structured_data || operation.raw_ai_json || {};

  const recipientName = toLatinDigits(data.receiver_name || operation.receiver_name || null) || null;
  const referenceNumberRaw = operation.reference_number || data.reference_number || null;
  const referenceNumber = referenceNumberRaw ? toLatinDigits(referenceNumberRaw) : null;
  const financialEntity = toLatinDigits(operation.financial_entity || data.financial_entity || null) || null;
  const senderName = toLatinDigits(data.sender_name || null) || null;
  const senderAccountRaw = data.sender_account || null;
  const senderAccount = senderAccountRaw ? toLatinDigits(senderAccountRaw) : null;
  const receiverAccountRaw = data.receiver_account || null;
  const receiverAccount = receiverAccountRaw ? toLatinDigits(receiverAccountRaw) : null;
  const summary = toLatinDigits(operation.summary || data.summary || null) || null;
  const confidenceScore = operation.confidence_score !== undefined && operation.confidence_score !== null
    ? operation.confidence_score
    : data.confidence_score !== undefined && data.confidence_score !== null
      ? data.confidence_score
      : null;

  const roundedConfidence = confidenceScore !== null
    ? Math.round(confidenceScore <= 1 ? confidenceScore * 100 : confidenceScore)
    : null;

  // Retrieve timezone fields
  const txTimeStr = operation.transaction_datetime || data.transaction_datetime || null;
  const verifiedTimeStr = operation.verified_at || operation.confirmed_at || operation.created_at;

  // Compile alerts and discrepancy metrics
  const alerts: { type: 'critical' | 'warning' | 'info'; text: string; subtext?: string }[] = [];
  const timeInfo = calculateTimeDiscrepancy(txTimeStr || "", verifiedTimeStr || "");

  if (timeInfo.isWarning) {
    alerts.push({
      type: timeInfo.isFuture ? 'critical' : 'warning',
      text: timeInfo.text,
      subtext: timeInfo.isFuture ? 'تحقق من تاريخ الإشعار والمنطقة الزمنية.' : undefined
    });
  }

  if (operation.ai_status === 'failed') {
    alerts.push({
      type: 'critical',
      text: 'فشل التحليل الذكي التلقائي للمستند.',
      subtext: 'يرجى مراجعة وتدقيق المستند يدوياً بالأسفل.'
    });
  }

  if (signedUrlError) {
    alerts.push({
      type: 'warning',
      text: 'تعذر تحميل المستند الأصلي.',
      subtext: 'انتهت صلاحية الرابط الآمن أو هناك مشكلة بالاتصال.'
    });
  }

  if (!receiverAccount) {
    alerts.push({
      type: 'warning',
      text: 'رقم الحساب المستلم غير متوفر في المستند.'
    });
  }

  if (!recipientName) {
    alerts.push({
      type: 'warning',
      text: 'اسم الطرف المستفيد غير متوفر في المستند.'
    });
  }

  if (!referenceNumber) {
    alerts.push({
      type: 'warning',
      text: 'رقم المرجع البنكي (Ref) غير متوفر.'
    });
  }

  if (roundedConfidence !== null && roundedConfidence < 85) {
    alerts.push({
      type: 'warning',
      text: `نسبة ثقة التحليل منخفضة (${roundedConfidence}%).`,
      subtext: 'قد تحتوي بعض الحقول المستخرجة على عدم دقة.'
    });
  }

  if (!txTimeStr) {
    alerts.push({
      type: 'info',
      text: 'وقت وتاريخ العملية غير متوفر في الإشعار.'
    });
  }

  // Prioritize alerts: critical first, then warning, then info
  const sortedAlerts = [...alerts].sort((a, b) => {
    const priority = { critical: 0, warning: 1, info: 2 };
    return priority[a.type] - priority[b.type];
  });

  const mainAlert = sortedAlerts[0] || null;
  const secondaryAlerts = sortedAlerts.slice(1);

  return (
    <div className="space-y-4 pb-12 font-arabic select-none" id="details_view" dir="rtl">

      {/* Sticky Compact Header */}
      <div className="sticky top-0 z-40 bg-white/95 border-b border-slate-100 px-4 py-3 flex items-center justify-between" style={{ marginTop: '-1rem' }}>
        <button
          onClick={() => {
            if (onNavigate) {
              onNavigate('home');
            } else {
              window.history.back();
            }
          }}
          className="w-10 h-10 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-700 transition-all active:scale-90 cursor-pointer"
          aria-label="العودة"
        >
          <X className="w-5 h-5" />
        </button>
        <h2 className="text-sm font-bold text-slate-900 font-arabic">تفاصيل العملية</h2>
        {(() => {
          if (operation.ai_status === 'completed') {
            return <span className="bg-emerald-50 text-emerald-700 border border-emerald-100 text-[10px] font-bold px-2.5 py-0.5 rounded-full font-arabic">موثقة</span>;
          } else if (operation.ai_status === 'running') {
            return <span className="bg-indigo-50 text-indigo-700 border border-indigo-100 text-[10px] font-bold px-2.5 py-0.5 rounded-full font-arabic">جاري التحليل</span>;
          } else if (operation.ai_status === 'failed') {
            return <span className="bg-rose-50 text-rose-700 border border-rose-100 text-[10px] font-bold px-2.5 py-0.5 rounded-full font-arabic">تحتاج مراجعة</span>;
          } else {
            return <span className="bg-amber-50 text-amber-700 border border-amber-100 text-[10px] font-bold px-2.5 py-0.5 rounded-full font-arabic">غير مطابقة</span>;
          }
        })()}
      </div>

      {/* Success banner if verified in this session */}
      {verifiedSuccessMessage && (
        <div className="p-3 bg-emerald-50 border border-emerald-100 text-emerald-800 rounded-2xl text-xs flex gap-2.5 items-start animate-fade-in mx-1" id="verification_success_banner">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 mt-0.5" />
          <div>
            <p className="font-semibold">{verifiedSuccessMessage}</p>
            <p className="text-[10px] text-emerald-600 mt-0.5">تم توثيق اسمك ورقم هاتفك كمدقق معتمد لهذه العملية.</p>
          </div>
        </div>
      )}

      {/* 1. Quick Summary Card */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-4.5 space-y-4 text-right relative overflow-hidden" id="quick_summary_card">
        <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
          <div className="flex items-center gap-2">
            <FinancialEntityLogo
              entity={financialEntity}
              className="h-10 w-10 rounded-xl border border-slate-100"
              imageClassName="h-full w-full object-contain p-1"
              decorative
            />
            <div>
              <span className="block text-[10px] font-bold text-slate-400 font-arabic">ملخص التحقق السريع</span>
              {financialEntity && <strong className="mt-0.5 block text-[11px] text-slate-800 font-arabic">{financialEntity}</strong>}
            </div>
          </div>
          {accessUsage && accessUsage.plan === 'sanad_pro' && (
            <span className="text-[9px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100/30">سند Pro مفعّل</span>
          )}
        </div>

        {/* Visual Amount & Currency focal point */}
        <div className="flex flex-col items-center justify-center py-4.5 bg-slate-50 border border-slate-150 rounded-2xl">
          <span className="text-[9px] font-bold text-slate-400 block mb-1 uppercase tracking-wider font-arabic">المبلغ المالي الإجمالي</span>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-extrabold font-mono text-slate-900 tracking-tight tabular-nums">
              {operation.amount ? toLatinDigits(operation.amount) : (data.amount ? toLatinDigits(data.amount) : '-')}
            </span>
            {operation.currency && (
              <span className={`px-2 py-0.5 rounded-lg border text-[10px] font-bold font-arabic ${getCurrencyDetails(operation.currency).style}`}>
                {getCurrencyDetails(operation.currency).label}
              </span>
            )}
          </div>
          {roundedConfidence !== null && (
            <span className="text-[9px] font-medium text-slate-400 font-arabic mt-1">
              ثقة استخراج البيانات: {roundedConfidence}%
            </span>
          )}
        </div>

        {/* Grid info: accounts & ref */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          {/* Receiver / Beneficiary */}
          <div className="border-b border-slate-100 sm:border-b-0 sm:border-l sm:border-slate-150 pb-2 sm:pb-0 sm:pl-3.5">
            <span className="text-[9px] font-bold text-slate-400 block mb-0.5">الحساب المستلم</span>
            <span className="font-bold text-slate-800 text-xs block">{recipientName || <span className="text-[10px] text-amber-600 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-100">غير متوفر</span>}</span>
            {receiverAccount && (
              <div className="flex items-center gap-1 mt-1 justify-end">
                <span className="font-mono text-slate-600 text-[10px]" dir="ltr">{receiverAccount}</span>
                <button
                  type="button"
                  onClick={() => handleCopyText(receiverAccount, 'receiverAccount')}
                  className="p-1 text-slate-400 hover:text-emerald-600 hover:bg-slate-100 rounded transition-all cursor-pointer relative"
                  aria-label="نسخ رقم الحساب"
                >
                  <Copy className="w-3 h-3" />
                  {copiedField === 'receiverAccount' && (
                    <span className="absolute -top-6 left-1/2 -translate-x-1/2 bg-emerald-600 text-white text-[9px] font-arabic py-0.5 px-1.5 rounded shadow-sm whitespace-nowrap z-30 animate-scale-up">تم النسخ</span>
                  )}
                </button>
              </div>
            )}
          </div>

          {/* Financial Entity */}
          <div className="border-b border-slate-100 sm:border-b-0 pb-2 sm:pb-0">
            <span className="text-[9px] font-bold text-slate-400 block mb-0.5">الجهة المالية / البنك</span>
            <span className="font-bold text-slate-800 text-xs block">{financialEntity || <span className="text-[10px] text-slate-400 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200">غير متوفر</span>}</span>
          </div>

          {/* Time & Dates */}
          <div className="border-b border-slate-100 sm:border-b-0 sm:border-l sm:border-slate-150 pb-2 sm:pb-0 sm:pl-3.5 pt-1 sm:pt-0">
            <span className="text-[9px] font-bold text-slate-400 block mb-0.5">وقت العملية</span>
            <span className="font-semibold text-slate-700 text-xs block font-arabic leading-tight">
              {txTimeStr ? `${formatYemenDate(txTimeStr)} - ${formatYemenTime(txTimeStr)}` : <span className="text-[10px] text-slate-400 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200">غير متوفر</span>}
            </span>
          </div>

          {/* Reference Ref */}
          <div className="pt-1 sm:pt-0">
            <span className="text-[9px] font-bold text-slate-400 block mb-0.5">رقم المرجع البنكي (Ref)</span>
            {referenceNumber ? (
              <div className="flex items-center gap-1 justify-end">
                <span className="font-mono font-bold text-slate-800 text-xs">{referenceNumber}</span>
                <button
                  type="button"
                  onClick={() => handleCopyText(referenceNumber, 'ref')}
                  className="p-1 text-slate-400 hover:text-emerald-600 hover:bg-slate-100 rounded transition-all cursor-pointer relative"
                  aria-label="نسخ رقم المرجع"
                >
                  <Copy className="w-3 h-3" />
                  {copiedField === 'ref' && (
                    <span className="absolute -top-6 left-1/2 -translate-x-1/2 bg-emerald-600 text-white text-[9px] font-arabic py-0.5 px-1.5 rounded shadow-sm whitespace-nowrap z-30 animate-scale-up">تم النسخ</span>
                  )}
                </button>
              </div>
            ) : (
              <span className="text-[10px] text-amber-600 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-100 font-arabic inline-block mt-0.5">غير متوفر</span>
            )}
          </div>
        </div>
      </div>

      {/* 2. Main Discrepancy / Alert Banner */}
      {mainAlert && (
        <div className={`p-4 mx-1 rounded-2xl flex gap-3 text-right border ${
          mainAlert.type === 'critical'
            ? 'bg-rose-50 border-rose-200 text-rose-900'
            : mainAlert.type === 'warning'
              ? 'bg-amber-50 border-amber-200 text-amber-900'
              : 'bg-blue-50 border-blue-200 text-blue-900'
        }`} id="main_alert_banner">
          <ShieldAlert className={`w-5 h-5 shrink-0 mt-0.5 ${
            mainAlert.type === 'critical'
              ? 'text-rose-600'
              : mainAlert.type === 'warning'
                ? 'text-amber-600'
                : 'text-blue-600'
          }`} />
          <div>
            <p className="font-bold text-xs font-arabic">{mainAlert.text}</p>
            {mainAlert.subtext && <p className="text-[10px] text-slate-500 mt-1">{mainAlert.subtext}</p>}
          </div>
        </div>
      )}

      {/* 3. Original Evidence Preview Area */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-4.5 space-y-3" id="evidence_preview_card">
        <div className="flex items-center justify-between border-b border-slate-100 pb-2">
          <span className="text-[10px] font-bold text-slate-400 block uppercase tracking-wider">الإشعار أو المستند الأصلي</span>
          <FileText className="w-3.5 h-3.5 text-slate-400" />
        </div>

        {!fileMeta.filePath ? (
          <div className="p-5 bg-slate-50 border border-slate-150 rounded-2xl text-center text-xs text-slate-500 font-arabic font-semibold">
            لا يوجد مستند مرتبط بهذه العملية.
          </div>
        ) : signedUrlError ? (
          <div className="flex flex-col items-center justify-center p-6 bg-rose-50/50 border border-rose-100 rounded-2xl text-center space-y-3">
            <ShieldAlert className="w-6 h-6 text-rose-500" />
            <div className="space-y-1">
              <p className="text-xs font-bold text-slate-900 font-arabic">فشل تحميل المستند الأصلي</p>
              <p className="text-[10px] text-slate-500 font-arabic">انتهت صلاحية الرابط الآمن أو تعذر جلبه حالياً.</p>
            </div>
            <button
              type="button"
              onClick={retryFetchSignedUrl}
              className="px-4 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold rounded-xl text-[10px] font-arabic flex items-center gap-1 cursor-pointer"
            >
              <RefreshCw className="w-3 h-3 text-slate-500 animate-spin" />
              <span>إعادة تحميل المستند</span>
            </button>
          </div>
        ) : !signedUrl ? (
          <div className="flex flex-col items-center justify-center h-[200px] bg-slate-50 border border-slate-150 rounded-2xl space-y-2">
            <Loader2 className="w-6 h-6 text-emerald-600 animate-spin" />
            <span className="text-xs text-slate-500 font-arabic">جاري تحميل المستند الأصلي...</span>
          </div>
        ) : (
          <div className="space-y-3">
            {fileMeta.mimeType.startsWith('image/') ? (
              <div className="relative w-full max-h-[38dvh] min-h-[180px] bg-slate-150 rounded-2xl flex items-center justify-center overflow-hidden border border-slate-200 cursor-zoom-in relative">
                <img
                  src={signedUrl}
                  alt="Original Document Evidence"
                  className="max-w-full max-h-[38dvh] object-contain transition-transform active:scale-95"
                  onClick={() => setIsFullscreenPreviewOpen(true)}
                />
                <button
                  type="button"
                  onClick={() => setIsFullscreenPreviewOpen(true)}
                  className="absolute bottom-3 left-3 bg-black/60 hover:bg-black/80 text-white rounded-lg p-2 flex items-center gap-1.5 text-[10px] font-arabic pointer-events-auto shadow-sm"
                  aria-label="عرض ملء الشاشة"
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                  <span>تكبير المستند</span>
                </button>
              </div>
            ) : (
              <div className="relative w-full h-[40dvh] bg-slate-100 rounded-2xl overflow-hidden border border-slate-200">
                <iframe
                  src={signedUrl}
                  className="w-full h-full border-0"
                  title="PDF Document Viewer"
                />
              </div>
            )}

            {/* Quick action buttons for the file */}
            <div className="flex gap-2.5 pt-1">
              <button
                type="button"
                onClick={openOriginalFile}
                disabled={fileActionLoading}
                className="flex-1 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white font-bold rounded-xl text-[11px] transition-all inline-flex items-center justify-center gap-1.5 cursor-pointer shadow-sm"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>فتح الملف الأصلي</span>
              </button>

              <button
                type="button"
                onClick={downloadOriginalFile}
                disabled={fileActionLoading}
                className="flex-1 px-4 py-2.5 bg-slate-50 hover:bg-slate-100 disabled:bg-slate-100 text-slate-700 border border-slate-200 font-bold rounded-xl text-[11px] transition-all inline-flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <FileDown className="w-3.5 h-3.5" />
                <span>تنزيل المستند</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 4. Secondary Review Notes List */}
      {secondaryAlerts.length > 0 && (
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-right space-y-2 mx-1">
          <h4 className="text-[11px] font-bold text-slate-800 flex items-center gap-1.5 justify-end">
            <span>ملاحظات المراجعة والتدقيق</span>
            <AlertCircle className="w-3.5 h-3.5 text-slate-500" />
          </h4>
          <ul className="list-disc list-inside space-y-1.5 text-[10px] text-slate-600 font-arabic">
            {secondaryAlerts.map((alt, idx) => (
              <li key={idx} className="list-item">
                <span className="font-semibold">{alt.text}</span>
                {alt.subtext && <span className="text-[9px] text-slate-400 block mr-3.5">{alt.subtext}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 5. Verification & Linking Box based on User Role */}
      {isUploader ? (
        <div className="bg-slate-50 border border-slate-200 p-5 rounded-3xl text-center space-y-4" id="uploader_info_box">
          <div className="max-w-md mx-auto space-y-1">
            <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-emerald-50 text-emerald-600 mb-1 border border-emerald-100">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <h3 className="text-xs font-bold text-slate-900">هذه العملية منشأة بواسطتك في سند</h3>
            <p className="text-[10px] text-slate-500 leading-relaxed">
              لقد قمت برفع مستند هذه العملية بنجاح. شارك رمز الاستجابة السريعة (QR) أو الرابط مع الطرف الآخر للمطابقة والتأكيد المتبادل.
            </p>
          </div>

          <div className="flex flex-col items-center justify-center p-3 bg-white border border-slate-150 rounded-2xl max-w-xs mx-auto space-y-2 shadow-inner">
            {qrCodeDataUrl && (
              <img src={qrCodeDataUrl} alt="رمز الاستجابة السريعة" className="w-24 h-24 object-contain" />
            )}
            <div className="w-full text-right space-y-1.5">
              <div className="relative flex items-center bg-slate-50 border border-slate-200 rounded-xl p-1">
                <div className="flex-1 text-left font-mono text-[9px] text-slate-500 truncate px-2 select-all font-semibold" dir="ltr">
                  {`${window.location.origin}/v/${token}`}
                </div>
                <button
                  type="button"
                  onClick={copyLinkToClipboard}
                  className={`shrink-0 font-bold text-[9px] py-1 px-2.5 rounded-lg transition-all ${
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
        <div className="bg-emerald-50/50 border border-emerald-200 p-5 rounded-3xl text-center space-y-2" id="already_verified_box">
          <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <h3 className="text-xs font-bold text-slate-900">لقد قمت بالتحقق من هذا الإشعار مسبقاً</h3>
          <p className="text-[10px] text-slate-650 max-w-xs mx-auto leading-relaxed">
            تم تسجيل توقيعك الشخصي وتأكيد مطابقة البيانات بنجاح في قاعدة بيانات سند الموثقة.
          </p>
        </div>
      ) : (
        <div className="bg-slate-50 border border-slate-200 p-5 rounded-3xl text-center space-y-3.5" id="verification_box">
          <div className="max-w-md mx-auto space-y-1">
            <h3 className="text-xs font-bold text-slate-900">تأكيد ومطابقة الإشعار المالي الشخصي</h3>
            <p className="text-[10px] text-slate-500 leading-relaxed">
              بنقرك على الزر أدناه، تؤكد بصفتك مدققاً رسمياً ومسؤولاً أن المستند المالي الأصلي سليم ومطابق للمبلغ الفعلي للعملية المعروضة.
            </p>
          </div>

          {user ? (
            <button
              onClick={handleVerifyClick}
              disabled={verifying}
              id="btn_confirm_verify"
              className="w-full max-w-xs mx-auto bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white font-bold py-3 px-5 rounded-2xl shadow-md active:scale-[0.98] transition-all flex items-center justify-center gap-1.5 cursor-pointer text-xs"
            >
              {verifying ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>جاري تسجيل التحقق...</span>
                </>
              ) : (
                <>
                  <UserCheck className="w-4 h-4" />
                  <span>تم التحقق (مطابق وصحيح)</span>
                </>
              )}
            </button>
          ) : (
            <div className="max-w-xs mx-auto p-3.5 bg-white border border-slate-200 rounded-2xl space-y-2.5">
              <p className="text-[10px] text-slate-550">يتطلب التوثيق والتحقق الشخصي من العمليات تسجيل الدخول إلى حسابك الموثق.</p>
              <button
                onClick={onNavigateToLogin}
                className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-[10px] flex items-center justify-center gap-1 transition-all cursor-pointer shadow-sm"
              >
                <KeyRound className="w-3.5 h-3.5" />
                <span>تسجيل الدخول للتحقق الآن</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* 6. Accordion for Additional Details */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden" id="additional_details_accordion_card">
        <div className="px-4.5 py-3 border-b border-slate-100 flex items-center justify-between">
          <span className="text-xs font-bold text-slate-800 font-arabic">تفاصيل إضافية للتدقيق</span>
          <FileText className="w-3.5 h-3.5 text-slate-400" />
        </div>

        {/* Accordion Row 1: Extracted Details */}
        <div className="border-b border-slate-100">
          <button
            type="button"
            onClick={() => setOpenSections(prev => ({ ...prev, extracted: !prev.extracted }))}
            aria-expanded={openSections.extracted}
            className="w-full px-5 py-3 flex items-center justify-between hover:bg-slate-50 transition-all text-right font-arabic font-bold text-xs text-slate-700"
          >
            <span className="shrink-0 text-slate-400 text-[10px]">{openSections.extracted ? '▲' : '▼'}</span>
            <span>البيانات المستخرجة</span>
          </button>

          {openSections.extracted && (
            <div className="px-5 pb-3.5 pt-1 bg-slate-50/50 border-t border-slate-100 text-right text-xs space-y-2.5 animate-fade-in">
              <div className="grid grid-cols-2 gap-3.5">
                <div>
                  <span className="text-[9px] text-slate-400 block">اسم المرسل</span>
                  <span className="font-semibold text-slate-800">{senderName || 'غير متوفر'}</span>
                </div>
                <div>
                  <span className="text-[9px] text-slate-400 block">رقم حساب المرسل</span>
                  <span className="font-mono font-semibold text-slate-800">{senderAccount || 'غير متوفر'}</span>
                </div>
                <div>
                  <span className="text-[9px] text-slate-400 block">اسم المستفيد</span>
                  <span className="font-semibold text-slate-800">{recipientName || 'غير متوفر'}</span>
                </div>
                <div>
                  <span className="text-[9px] text-slate-400 block">رقم حساب المستفيد</span>
                  <span className="font-mono font-semibold text-slate-800">{receiverAccount || 'غير متوفر'}</span>
                </div>
                <div>
                  <span className="text-[9px] text-slate-400 block">نوع العملية</span>
                  <span className="font-semibold text-slate-800 capitalize">{operation.transaction_type || data.transaction_type || 'غير متوفر'}</span>
                </div>
                <div>
                  <span className="text-[9px] text-slate-400 block">جهة التحويل</span>
                  <span className="font-semibold text-slate-800">{financialEntity || 'غير متوفر'}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Accordion Row 2: AI Analysis */}
        <div className="border-b border-slate-100">
          <button
            type="button"
            onClick={() => setOpenSections(prev => ({ ...prev, ai: !prev.ai }))}
            aria-expanded={openSections.ai}
            className="w-full px-5 py-3 flex items-center justify-between hover:bg-slate-50 transition-all text-right font-arabic font-bold text-xs text-slate-700"
          >
            <span className="shrink-0 text-slate-400 text-[10px]">{openSections.ai ? '▲' : '▼'}</span>
            <span>التحليل الذكي (AI Analysis)</span>
          </button>

          {openSections.ai && (
            <div className="px-5 pb-3.5 pt-1 bg-slate-50/50 border-t border-slate-100 text-right text-xs space-y-2.5 animate-fade-in">
              {confidenceScore !== null && (
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono font-bold text-emerald-700">{toLatinDigits(roundedConfidence)}%</span>
                    <div className="w-20 bg-slate-200 h-1.5 rounded-full overflow-hidden">
                      <div className="bg-emerald-500 h-full rounded-full" style={{ width: `${roundedConfidence}%` }} />
                    </div>
                  </div>
                  <span className="text-slate-500">نسبة ثقة استخراج الحقول:</span>
                </div>
              )}
              {summary && (
                <div className="space-y-1">
                  <span className="text-[9px] text-slate-400 block">ملخص الذكاء الاصطناعي:</span>
                  <p className="leading-relaxed text-slate-700 text-[11px]">{summary}</p>
                </div>
              )}
              {data.sanad_attention_points && data.sanad_attention_points.length > 0 && (
                <div className="border-t border-slate-100 pt-2 space-y-1">
                  <span className="text-[9px] text-slate-400 block">نقاط الاهتمام والتنبيهات:</span>
                  <ul className="list-disc list-inside text-slate-700 space-y-1 text-[11px]">
                    {Array.isArray(data.sanad_attention_points)
                      ? data.sanad_attention_points.map((p: string, i: number) => <li key={i}>{toLatinDigits(p)}</li>)
                      : <li>{toLatinDigits(data.sanad_attention_points)}</li>
                    }
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Accordion Row 3: Verification Logs */}
        <div className="border-b border-slate-100">
          <button
            type="button"
            onClick={() => setOpenSections(prev => ({ ...prev, verification: !prev.verification }))}
            aria-expanded={openSections.verification}
            className="w-full px-5 py-3 flex items-center justify-between hover:bg-slate-50 transition-all text-right font-arabic font-bold text-xs text-slate-700"
          >
            <span className="shrink-0 text-slate-400 text-[10px]">{openSections.verification ? '▲' : '▼'}</span>
            <span>التحقق والمطابقة</span>
          </button>

          {openSections.verification && (
            <div className="px-5 pb-3.5 pt-1 bg-slate-50/50 border-t border-slate-100 text-right text-xs space-y-2 animate-fade-in">
              <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                <span className="font-semibold text-slate-800">
                  {isVerifiedByMe ? 'نعم، قمت بالتحقق' : 'لا، لم يتم التحقق منك بعد'}
                </span>
                <span className="text-slate-400">حالة تحققك الشخصي:</span>
              </div>
              <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                <span className="font-semibold text-slate-800">
                  {operation.verified_at ? `${formatYemenDate(operation.verified_at)} - ${formatYemenTime(operation.verified_at)}` : 'غير متوفر'}
                </span>
                <span className="text-slate-400">وقت التحقق الأخير:</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="font-semibold text-slate-800">
                  {operation.verified_by_user_id ? 'موثق ومعتمد' : 'بانتظار الاعتماد'}
                </span>
                <span className="text-slate-400">اعتماد السجل:</span>
              </div>
            </div>
          )}
        </div>

        {/* Accordion Row 4: Technical & File Metadata */}
        <div>
          <button
            type="button"
            onClick={() => setOpenSections(prev => ({ ...prev, technical: !prev.technical }))}
            aria-expanded={openSections.technical}
            className="w-full px-5 py-3 flex items-center justify-between hover:bg-slate-50 transition-all text-right font-arabic font-bold text-xs text-slate-700"
          >
            <span className="shrink-0 text-slate-400 text-[10px]">{openSections.technical ? '▲' : '▼'}</span>
            <span>معلومات السجل والملف التقنية</span>
          </button>

          {openSections.technical && (
            <div className="px-5 pb-3.5 pt-1 bg-slate-50/50 border-t border-slate-100 text-right text-xs space-y-2 animate-fade-in">
              <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                <span className="font-semibold text-slate-800">{operation.submitted_by_name || 'غير معروف'}</span>
                <span className="text-slate-400">منشئ السجل:</span>
              </div>
              <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                <span className="font-mono font-semibold text-slate-800" dir="ltr">{formatYemeniDisplay(operation.submitted_by_phone) || '-'}</span>
                <span className="text-slate-400">هاتف منشئ السجل:</span>
              </div>
              <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                <span className="font-mono text-[9px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full select-all">{operation.public_token}</span>
                <span className="text-slate-400">الرمز الفريد للعملية:</span>
              </div>
              <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                <span className="font-mono text-slate-750">{fileMeta.mimeType}</span>
                <span className="text-slate-400">نوع الملف:</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="font-mono font-semibold text-slate-750">
                  {operation.file_size ? toLatinDigits(`${(operation.file_size / 1024).toFixed(1)} كيلوبايت`) : '-'}
                </span>
                <span className="text-slate-400">حجم الملف:</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Fullscreen Lightbox Image Preview Modal */}
      {isFullscreenPreviewOpen && signedUrl && (
        <div className="fixed inset-0 z-[110] bg-black/95 flex flex-col justify-between select-none" dir="rtl">
          {/* Header */}
          <div className="w-full flex items-center justify-between p-4 bg-gradient-to-b from-black/80 to-transparent">
            <button
              onClick={() => {
                setIsFullscreenPreviewOpen(false);
                setZoomLevel(1);
              }}
              className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center cursor-pointer"
              aria-label="إغلاق معاينة ملء الشاشة"
            >
              <X className="w-5 h-5" />
            </button>
            <span className="text-white text-xs font-bold font-arabic truncate max-w-[200px]">{fileMeta.originalName}</span>
            <div className="w-10" />
          </div>

          {/* Body */}
          <div className="flex-1 flex items-center justify-center overflow-auto p-4">
            <img
              src={signedUrl}
              alt="Fullscreen Evidence"
              style={{ transform: `scale(${zoomLevel})` }}
              className="max-w-full max-h-[80vh] object-contain transition-transform duration-200"
            />
          </div>

          {/* Footer controls */}
          <div className="w-full p-4 bg-gradient-to-t from-black/80 to-transparent flex items-center justify-center gap-4">
            <button
              onClick={handleZoomIn}
              className="w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center cursor-pointer"
              aria-label="تكبير الصورة"
            >
              <ZoomIn className="w-5 h-5" />
            </button>
            <button
              onClick={handleResetZoom}
              className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white font-arabic text-xs font-bold cursor-pointer"
              aria-label="إعادة ضبط التكبير"
            >
              إعادة ضبط
            </button>
            <button
              onClick={handleZoomOut}
              className="w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center cursor-pointer"
              aria-label="تصغير الصورة"
            >
              <ZoomOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      {/* Business Linking Modal Overlay */}
      {showLinkModal && linkableBusinesses.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs font-arabic animate-fade-in" dir="rtl">
          <div className="bg-white rounded-3xl border border-slate-200 p-6 w-full max-w-sm space-y-4 shadow-xl text-right">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
              <Store className="w-5 h-5 text-slate-900" />
              <h3 className="text-sm font-bold text-slate-900">ربط العملية بنشاط تجاري</h3>
            </div>

            {linkSuccess ? (
              <div className="p-4 bg-emerald-50 border border-emerald-100 text-emerald-800 text-xs rounded-2xl flex items-center gap-2 justify-center py-6 animate-scale-up">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                <span className="font-bold">تم ربط العملية بالنشاط التجاري بنجاح.</span>
              </div>
            ) : (
              <div className="space-y-4">
                {linkError && (
                  <div className="p-3 bg-rose-50 border border-rose-100 text-rose-800 text-[11px] rounded-xl flex items-center gap-1.5">
                    <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0" />
                    <span>{linkError}</span>
                  </div>
                )}

                {linkableBusinesses.length === 1 ? (
                  <div className="space-y-3">
                    <p className="text-xs text-slate-650 leading-relaxed">
                      أنت عضو في فريق <strong className="text-slate-900">{linkableBusinesses[0].name}</strong>. هل تريد ربط هذه العملية بهذا النشاط؟
                    </p>
                    <div className="flex gap-2.5 pt-2">
                      <button
                        disabled={linkingBusiness}
                        onClick={() => handleLinkToBusiness(linkableBusinesses[0].business_id)}
                        className="flex-1 bg-[#111111] hover:bg-black text-white text-xs font-bold py-2.5 px-4 rounded-xl transition-all flex items-center justify-center gap-1 disabled:opacity-50"
                      >
                        {linkingBusiness ? (
                          <Loader2 className="w-4 h-4 animate-spin text-white" />
                        ) : (
                          'ربط بالنشاط'
                        )}
                      </button>
                      <button
                        disabled={linkingBusiness}
                        onClick={() => setShowLinkModal(false)}
                        className="flex-1 border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold py-2.5 px-4 rounded-xl transition-all"
                      >
                        لا، عملية شخصية
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <p className="text-xs text-slate-650 leading-relaxed">
                      هل تريد ربط هذه العملية بأحد الأنشطة التي تعمل ضمن فريقها؟
                    </p>
                    <div className="space-y-2 pt-1 max-h-48 overflow-y-auto">
                      {linkableBusinesses.map((biz) => (
                        <button
                          key={biz.business_id}
                          disabled={linkingBusiness}
                          onClick={() => handleLinkToBusiness(biz.business_id)}
                          className="w-full text-right bg-slate-50 hover:bg-slate-100 border border-slate-200/80 p-3 rounded-xl transition-all flex items-center justify-between text-xs text-slate-800 disabled:opacity-50"
                        >
                          <span className="font-bold">{biz.name}</span>
                          <span className="text-[10px] text-slate-400 font-arabic">({biz.label || 'موظف'})</span>
                        </button>
                      ))}
                    </div>
                    <div className="pt-2">
                      <button
                        disabled={linkingBusiness}
                        onClick={() => setShowLinkModal(false)}
                        className="w-full border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold py-2.5 px-4 rounded-xl transition-all"
                      >
                        لا، عملية شخصية
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

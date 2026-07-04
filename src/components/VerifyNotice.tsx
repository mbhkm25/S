import React, { useState, useRef, useEffect } from 'react';
import { Search, QrCode, Image, AlertCircle, Clipboard, Camera, Loader2, Check, RefreshCw } from 'lucide-react';
import { Html5Qrcode } from 'html5-qrcode';
import { toLatinDigits } from '../lib/digits';

interface VerifyNoticeProps {
  onNavigateToDetails: (token: string) => void;
  directCameraOnly?: boolean;
  onCancelDirectCamera?: () => void;
}

/**
 * Extracts the first valid UUID (public_token) from a given input string.
 * Supporting: UUID only, absolute/relative URLs (/v/<uuid>, /verify/<uuid>), and messy raw text.
 */
export function extractPublicToken(input: string): string | null {
  if (!input) return null;
  const cleaned = toLatinDigits(input.trim());
  // Standard UUID format (v4 or similar): 8-4-4-4-12 hex characters
  const uuidRegex = /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/;
  const match = cleaned.match(uuidRegex);
  return match ? match[0] : null;
}

export default function VerifyNotice({ onNavigateToDetails, directCameraOnly = false, onCancelDirectCamera }: VerifyNoticeProps) {
  const [inputVal, setInputVal] = useState('');
  const [copiedText, setCopiedText] = useState(false);
  const [generalError, setGeneralError] = useState<string | null>(null);

  // Camera state
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const html5QrCodeRef = useRef<Html5Qrcode | null>(null);

  // File Scanning state
  const [scanningFile, setScanningFile] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Keep track of mounting lifecycle to prevent setting state or executing camera code after unmount
  const isMountedRef = useRef<boolean>(true);
  const timeoutRef = useRef<any>(null);

  // Stop camera on unmount and track mount status
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      if (html5QrCodeRef.current) {
        const scanner = html5QrCodeRef.current;
        html5QrCodeRef.current = null;
        if (scanner.isScanning) {
          scanner.stop().catch(err => {
            console.warn("Error stopping scanner on unmount:", err);
          });
        }
      }
    };
  }, []);

  // Handle Pasting
  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setInputVal(toLatinDigits(text));
      setGeneralError(null);
      setCopiedText(true);
      setTimeout(() => setCopiedText(false), 2000);
    } catch (err) {
      setGeneralError('يرجى كتابة الرابط أو الرمز التعريفي يدويًا.');
    }
  };

  // Submit link/token
  const handleVerifySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setGeneralError(null);
    const cleanInput = inputVal.trim();

    if (!cleanInput) {
      setGeneralError('يرجى إدخال رابط التحقق أو الرمز التعريفي.');
      return;
    }

    const token = extractPublicToken(cleanInput);

    if (!token) {
      setGeneralError('الرابط أو الرمز التعريفي المدخل غير صحيح.');
      return;
    }

    onNavigateToDetails(token);
  };

  // Camera Start
  const startCamera = async () => {
    setGeneralError(null);
    setCameraError(null);
    setFileError(null);
    setIsCameraActive(true);

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(async () => {
      if (!isMountedRef.current) return;

      try {
        const scannerId = "camera-reader";
        const element = document.getElementById(scannerId);
        if (!element) {
          throw new Error("عنصر الكاميرا غير متوفر.");
        }

        // Stop any active scanner instance before instantiating a new one
        if (html5QrCodeRef.current) {
          const prevScanner = html5QrCodeRef.current;
          html5QrCodeRef.current = null;
          try {
            if (prevScanner.isScanning) {
              await prevScanner.stop();
            }
          } catch (e) {
            console.warn("Error stopping existing scanner before starting new:", e);
          }
        }

        const scanner = new Html5Qrcode(scannerId);
        html5QrCodeRef.current = scanner;

        const qrBoxConfig = (width: number, height: number) => {
          const minSize = Math.min(width, height);
          const boxSize = Math.floor(minSize * 0.7);
          return {
            width: boxSize < 180 ? 180 : (boxSize > 240 ? 240 : boxSize),
            height: boxSize < 180 ? 180 : (boxSize > 240 ? 240 : boxSize)
          };
        };

        const onScanSuccess = async (decodedText: string) => {
          try {
            if (scanner.isScanning) {
              await scanner.stop();
            }
          } catch (e) {
            console.error("Failed to stop scanner:", e);
          }
          if (isMountedRef.current) {
            setIsCameraActive(false);
          }

          const token = extractPublicToken(decodedText);
          if (token) {
            onNavigateToDetails(token);
          } else {
            if (isMountedRef.current) {
              setGeneralError("رمز QR لا يحتوي على رابط تحقق صالح.");
            }
          }
        };

        const onScanFailure = () => {};

        try {
          await scanner.start(
            { facingMode: "environment" },
            { fps: 10, qrbox: qrBoxConfig },
            onScanSuccess,
            onScanFailure
          );
        } catch (errBack) {
          if (!isMountedRef.current) return;
          try {
            await scanner.start(
              { facingMode: "user" },
              { fps: 10, qrbox: qrBoxConfig },
              onScanSuccess,
              onScanFailure
            );
          } catch (errFront) {
            if (!isMountedRef.current) return;
            const devices = await Html5Qrcode.getCameras();
            if (devices && devices.length > 0) {
              await scanner.start(
                devices[0].id,
                { fps: 10, qrbox: qrBoxConfig },
                onScanSuccess,
                onScanFailure
              );
            } else {
              throw new Error("No camera found");
            }
          }
        }
      } catch (err: any) {
        console.error("Camera start failed:", err);
        if (isMountedRef.current) {
          setIsCameraActive(false);
          let errMsg = "تعذر تشغيل الكاميرا. يمكنك لصق الرابط أو رفع صورة QR.";
          if (err.name === "NotAllowedError" || err.message?.includes("Permission denied")) {
            errMsg = "لم يتم السماح باستخدام الكاميرا. يرجى تفعيل الصلاحية.";
          }
          setCameraError(errMsg);
        }
      }
    }, 150);
  };

  const stopCamera = async () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    if (html5QrCodeRef.current) {
      const scanner = html5QrCodeRef.current;
      html5QrCodeRef.current = null;
      try {
        if (scanner.isScanning) {
          await scanner.stop();
        }
      } catch (e) {
        console.error("Error manual stopping camera:", e);
      }
    }
    setIsCameraActive(false);
  };

  // Auto-start camera if directCameraOnly is true
  useEffect(() => {
    if (directCameraOnly) {
      startCamera();
    }
  }, [directCameraOnly]);

  // Image decode
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileError(null);
    setGeneralError(null);
    setCameraError(null);
    setScanningFile(true);

    try {
      const scanner = new Html5Qrcode("file-qr-reader-temp");
      const decodedText = await scanner.scanFile(file, false);
      
      const token = extractPublicToken(decodedText);
      if (token) {
        onNavigateToDetails(token);
      } else {
        setFileError("لم يتم العثور على رابط تحقق في الصورة.");
      }
    } catch (err) {
      console.error("File decode error:", err);
      setFileError("تعذر قراءة رمز QR من الصورة. يرجى تجربة صورة أكثر وضوحاً.");
    } finally {
      setScanningFile(false);
      if (e.target) {
        e.target.value = '';
      }
    }
  };

  if (directCameraOnly) {
    return (
      <div className="space-y-5" id="direct_scan_view">
        {/* CSS Animation for Viewfinder Laser */}
        <style>{`
          @keyframes scanLaser {
            0%, 100% { top: 6%; opacity: 0.8; }
            50% { top: 92%; opacity: 1; }
          }
          .animate-scan-laser {
            animation: scanLaser 2.2s ease-in-out infinite;
          }
        `}</style>

        {/* Temp Hidden Div required by html5-qrcode */}
        <div id="file-qr-reader-temp" className="hidden" />

        {/* Title block */}
        <div className="text-right flex items-center justify-between">
          {onCancelDirectCamera && (
            <button
              onClick={onCancelDirectCamera}
              className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-all font-arabic cursor-pointer border border-slate-200"
            >
              العودة للرئيسية
            </button>
          )}
          <div className="text-right">
            <h2 className="text-base font-bold text-slate-950 font-arabic">مسح سريع لرمز QR</h2>
            <p className="text-[11px] text-slate-500 font-arabic mt-1 leading-relaxed">
              وجه الكاميرا نحو رمز QR على الإشعار المالي لفتحه مباشرة.
            </p>
          </div>
        </div>

        {/* Camera Scanner Panel */}
        <div className="bg-white border border-slate-200/60 rounded-3xl p-5 shadow-sm space-y-4 text-center">
          {cameraError ? (
            <div className="space-y-4">
              <div className="flex items-start gap-2 text-xs text-rose-600 bg-rose-50 p-4 rounded-2xl border border-rose-100 text-right">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-500 mt-0.5" />
                <span>{cameraError}</span>
              </div>
              <button
                type="button"
                onClick={startCamera}
                className="w-full bg-[#111111] hover:bg-black text-white font-bold py-3 px-4 rounded-2xl flex items-center justify-center gap-2 transition-all cursor-pointer shadow-sm text-xs font-arabic"
              >
                <Camera className="w-4 h-4 text-white" />
                <span>إعادة المحاولة لتشغيل الكاميرا</span>
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="relative w-full max-w-[280px] mx-auto aspect-square bg-black rounded-3xl overflow-hidden shadow-inner">
                <div id="camera-reader" className="w-full h-full" />
                <div className="absolute inset-0 border-2 border-emerald-500/20 rounded-3xl pointer-events-none">
                  <div className="absolute top-5 left-5 w-5 h-5 border-t-2 border-l-2 border-emerald-500" />
                  <div className="absolute top-5 right-5 w-5 h-5 border-t-2 border-r-2 border-emerald-500" />
                  <div className="absolute bottom-5 left-5 w-5 h-5 border-b-2 border-l-2 border-emerald-500" />
                  <div className="absolute bottom-5 right-5 w-5 h-5 border-b-2 border-r-2 border-emerald-500" />
                  <div className="absolute left-5 right-5 h-0.5 bg-emerald-500 shadow-[0_0_8px_#10b981] animate-scan-laser" />
                </div>
              </div>

              {generalError && (
                <div className="flex items-start gap-2 text-xs text-rose-600 bg-rose-50 p-3 rounded-xl border border-rose-100 text-right">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-500 mt-0.5" />
                  <span>{generalError}</span>
                </div>
              )}

              <div className="flex items-center justify-center gap-2 text-slate-400 text-[10px] font-arabic">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span>جاري البحث التلقائي عن رمز QR...</span>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5" id="verify_notice_view">
      
      {/* CSS Animation for Viewfinder Laser */}
      <style>{`
        @keyframes scanLaser {
          0%, 100% { top: 6%; opacity: 0.8; }
          50% { top: 92%; opacity: 1; }
        }
        .animate-scan-laser {
          animation: scanLaser 2.2s ease-in-out infinite;
        }
      `}</style>

      {/* Temp Hidden Div required by html5-qrcode */}
      <div id="file-qr-reader-temp" className="hidden" />

      {/* Title block */}
      <div className="text-right">
        <h2 className="text-base font-bold text-slate-950 font-arabic">تحقق من إشعار</h2>
        <p className="text-[11px] text-slate-500 font-arabic mt-1 leading-relaxed">
          تحقق من صحة المستندات المالية الفورية ومطابقة بياناتها مباشرة من الخادم المعتمد عبر ثلاث قنوات مدمجة.
        </p>
      </div>

      {/* Camera Panel (Path 1) */}
      <div className="bg-white border border-slate-200/60 rounded-3xl p-4.5 shadow-sm space-y-3.5">
        <div className="flex items-center gap-2 justify-end text-slate-400">
          <span className="text-[10px] font-bold font-arabic">فحص مباشر</span>
          <Camera className="w-3.5 h-3.5" />
        </div>

        {isCameraActive ? (
          <div className="space-y-3" id="active_camera_panel">
            <div className="relative w-full max-w-[260px] mx-auto aspect-square bg-black rounded-2xl overflow-hidden">
              <div id="camera-reader" className="w-full h-full" />
              <div className="absolute inset-0 border-2 border-emerald-500/20 rounded-2xl pointer-events-none">
                <div className="absolute top-4 left-4 w-4 h-4 border-t-2 border-l-2 border-emerald-500" />
                <div className="absolute top-4 right-4 w-4 h-4 border-t-2 border-r-2 border-emerald-500" />
                <div className="absolute bottom-4 left-4 w-4 h-4 border-b-2 border-l-2 border-emerald-500" />
                <div className="absolute bottom-4 right-4 w-4 h-4 border-b-2 border-r-2 border-emerald-500" />
                <div className="absolute left-4 right-4 h-0.5 bg-emerald-500 shadow-[0_0_8px_#10b981] animate-scan-laser" />
              </div>
            </div>

            <button
              type="button"
              onClick={stopCamera}
              className="w-full bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold py-2.5 px-4 rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer text-xs font-arabic"
            >
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              <span>إيقاف تشغيل الكاميرا</span>
            </button>
          </div>
        ) : (
          <div className="space-y-3" id="inactive_camera_panel">
            {cameraError && (
              <div className="flex items-start gap-2 text-xs text-rose-600 bg-rose-50 p-3 rounded-2xl border border-rose-100 text-right">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-500 mt-0.5" />
                <span>{cameraError}</span>
              </div>
            )}

            <button
              type="button"
              onClick={startCamera}
              className="w-full bg-[#111111] hover:bg-black text-white font-bold py-3 px-4 rounded-2xl flex items-center justify-center gap-2 transition-all cursor-pointer shadow-sm text-xs font-arabic"
            >
              <Camera className="w-4 h-4 text-white" />
              <span>تشغيل الكاميرا للمسح المباشر</span>
            </button>
          </div>
        )}
      </div>

      {/* Link Input (Path 2) */}
      <div className="bg-white border border-slate-200/60 rounded-3xl p-4.5 shadow-sm space-y-3.5">
        <div className="flex items-center gap-2 justify-end text-slate-400">
          <span className="text-[10px] font-bold font-arabic">إدخال يدوي</span>
          <Clipboard className="w-3.5 h-3.5" />
        </div>

        <form onSubmit={handleVerifySubmit} className="space-y-3">
          <div className="relative rounded-xl overflow-hidden border border-slate-200 bg-slate-50 focus-within:bg-white focus-within:border-slate-400 transition-all">
            <input
              type="text"
              dir="ltr"
              value={inputVal}
              onChange={(e) => {
                setInputVal(toLatinDigits(e.target.value));
                setGeneralError(null);
              }}
              placeholder="UUID أو الرابط الكامل للتحقق..."
              className="w-full text-left font-mono text-xs pl-20 pr-10 py-3 bg-transparent outline-none border-none text-slate-800"
            />
            <div className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400">
              <Search className="w-4 h-4" />
            </div>
            <button
              type="button"
              onClick={handlePaste}
              className={`absolute left-1.5 top-1/2 -translate-y-1/2 h-7 px-2.5 rounded-lg font-bold text-[10px] flex items-center gap-1 transition-all ${
                copiedText
                  ? 'bg-emerald-50 text-emerald-700'
                  : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              {copiedText ? (
                <>
                  <Check className="w-3 h-3" />
                  <span>تم اللصق</span>
                </>
              ) : (
                <span>لصق الرابط</span>
              )}
            </button>
          </div>

          {generalError && (
            <div className="flex items-start gap-2 text-xs text-rose-600 bg-rose-50 p-3 rounded-2xl border border-rose-100 text-right">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-500 mt-0.5" />
              <span>{generalError}</span>
            </div>
          )}

          <button
            type="submit"
            className="w-full bg-[#111111] hover:bg-black text-white font-bold py-3 px-4 rounded-2xl shadow-sm active:scale-[0.99] transition-all flex items-center justify-center gap-1.5 cursor-pointer text-xs font-arabic"
          >
            <span>البحث والتحقق من الإشعار</span>
          </button>
        </form>
      </div>

      {/* Image Upload (Path 3) */}
      <div className="bg-white border border-slate-200/60 rounded-3xl p-4.5 shadow-sm space-y-3.5">
        <div className="flex items-center gap-2 justify-end text-slate-400">
          <span className="text-[10px] font-bold font-arabic">قراءة صورة محفوظة</span>
          <Image className="w-3.5 h-3.5" />
        </div>

        <div className="space-y-2">
          {fileError && (
            <div className="flex items-start gap-2 text-xs text-rose-600 bg-rose-50 p-3 rounded-2xl border border-rose-100 text-right">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-500 mt-0.5" />
              <span>{fileError}</span>
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            className="hidden"
            id="qr-image-uploader-unified"
          />

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={scanningFile}
            className="w-full bg-slate-50 hover:bg-slate-100 disabled:opacity-75 text-slate-700 border border-slate-200 py-3 px-4 rounded-2xl flex items-center justify-center gap-2 transition-all cursor-pointer text-xs font-arabic"
          >
            {scanningFile ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
                <span>جاري تحليل الصورة محلياً...</span>
              </>
            ) : (
              <>
                <QrCode className="w-4 h-4 text-slate-500" />
                <span>اختيار لقطة شاشة لرمز QR</span>
              </>
            )}
          </button>
          
          <p className="text-[9px] text-slate-400 text-center font-arabic leading-relaxed">
            يتم استخراج الرمز محلياً في المتصفح تماماً دون رفع الملف لأي خادم خارجي.
          </p>
        </div>
      </div>

    </div>
  );
}

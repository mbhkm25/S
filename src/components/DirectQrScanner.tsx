import { ChangeEvent, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Camera, Flashlight, Image as ImageIcon, Loader2, RotateCcw, X } from 'lucide-react';
import { Html5Qrcode } from 'html5-qrcode';
import { toLatinDigits } from '../lib/digits';

interface DirectQrScannerProps {
  onNavigateToDetails: (token: string) => void;
  onCancel: () => void;
}

type ScannerMode = 'native' | 'html5';
type ScannerStatus = 'starting' | 'scanning' | 'error';

const TOKEN_REGEX = /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/;
const FALLBACK_ELEMENT_ID = 'sanad-direct-qr-fallback';

function extractToken(value: string): string | null {
  return toLatinDigits(value || '').match(TOKEN_REGEX)?.[0] || null;
}

function getCameraErrorMessage(error: any): string {
  const name = error?.name || '';
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
    return 'لم يتم السماح لسند باستخدام الكاميرا. فعّل الإذن أو التقط صورة QR بكاميرا الهاتف.';
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return 'لم يتم العثور على كاميرا متاحة. يمكنك التقاط صورة QR بكاميرا الهاتف أو اختيار صورة محفوظة.';
  }
  if (name === 'NotReadableError' || name === 'TrackStartError') {
    return 'الكاميرا مستخدمة في تطبيق آخر. أغلق التطبيق الآخر أو استخدم كاميرا الهاتف لالتقاط صورة QR.';
  }
  return 'تعذر تشغيل الماسح الحي. استخدم كاميرا الهاتف لالتقاط صورة QR أو اختر صورة محفوظة.';
}

export default function DirectQrScanner({ onNavigateToDetails, onCancel }: DirectQrScannerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const html5Ref = useRef<Html5Qrcode | null>(null);
  const rafRef = useRef<number | null>(null);
  const detectedRef = useRef(false);
  const mountedRef = useRef(true);
  const decodingRef = useRef(false);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [mode, setMode] = useState<ScannerMode>('native');
  const [status, setStatus] = useState<ScannerStatus>('starting');
  const [error, setError] = useState<string | null>(null);
  const [hasTorch, setHasTorch] = useState(false);
  const [torchOn, setTorchOn] = useState(false);

  const stop = async () => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;

    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.srcObject = null;
    }

    if (html5Ref.current) {
      const scanner = html5Ref.current;
      html5Ref.current = null;
      try {
        if (scanner.isScanning) await scanner.stop();
      } catch {}
      try {
        await scanner.clear();
      } catch {}
    }
  };

  const finish = async (rawValue: string) => {
    if (detectedRef.current) return;
    const token = extractToken(rawValue);
    if (!token) return;
    detectedRef.current = true;
    await stop();
    onNavigateToDetails(token);
  };

  const applyCameraQuality = async (track: MediaStreamTrack) => {
    try {
      const caps: any = track.getCapabilities?.() || {};
      const advanced: any = {};
      if (caps.focusMode?.includes('continuous')) advanced.focusMode = 'continuous';
      if (caps.exposureMode?.includes('continuous')) advanced.exposureMode = 'continuous';
      if (caps.whiteBalanceMode?.includes('continuous')) advanced.whiteBalanceMode = 'continuous';
      if (Object.keys(advanced).length > 0) {
        await track.applyConstraints({ advanced: [advanced] } as any);
      }
      setHasTorch(Boolean(caps.torch));
    } catch {
      setHasTorch(false);
    }
  };

  const startBarcodeLoop = () => {
    const Detector = (window as any).BarcodeDetector;
    const detector = new Detector({ formats: ['qr_code'] });
    let lastScanAt = 0;

    const tick = async (time: number) => {
      if (!mountedRef.current || detectedRef.current || !streamRef.current) return;
      const video = videoRef.current;

      if (video && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && time - lastScanAt >= 120 && !decodingRef.current) {
        lastScanAt = time;
        decodingRef.current = true;
        try {
          const codes = await detector.detect(video);
          if (codes?.[0]?.rawValue) await finish(codes[0].rawValue);
        } catch {
          // A transient decoder failure must not stop the camera preview.
        } finally {
          decodingRef.current = false;
        }
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
  };

  const startHtml5Fallback = async () => {
    setMode('html5');
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));

    const scanner = new Html5Qrcode(FALLBACK_ELEMENT_ID);
    html5Ref.current = scanner;

    await scanner.start(
      { facingMode: 'environment' },
      {
        fps: 12,
        qrbox: (width, height) => {
          const size = Math.max(220, Math.floor(Math.min(width, height) * 0.68));
          return { width: size, height: size };
        },
        disableFlip: true,
        videoConstraints: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          frameRate: { ideal: 30, max: 30 },
        },
      },
      decodedText => void finish(decodedText),
      () => {},
    );

    if (mountedRef.current) setStatus('scanning');
  };

  const start = async () => {
    detectedRef.current = false;
    decodingRef.current = false;
    setMode('native');
    setStatus('starting');
    setError(null);
    setTorchOn(false);
    setHasTorch(false);
    await stop();

    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus('error');
      setError('هذا الجهاز لا يتيح الماسح الحي داخل سند. التقط صورة QR بكاميرا الهاتف أو اختر صورة محفوظة.');
      return;
    }

    try {
      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          frameRate: { ideal: 30, max: 30 },
        },
        audio: false,
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      const track = stream.getVideoTracks()[0];
      if (track) await applyCameraQuality(track);

      const video = videoRef.current;
      if (!video) throw new Error('video_unavailable');

      video.srcObject = stream;
      video.setAttribute('playsinline', 'true');
      await video.play();

      if (!mountedRef.current) return;
      setStatus('scanning');

      if ('BarcodeDetector' in window) {
        startBarcodeLoop();
      } else {
        stream.getTracks().forEach(item => item.stop());
        streamRef.current = null;
        video.srcObject = null;
        await startHtml5Fallback();
      }
    } catch (cameraError: any) {
      try {
        await startHtml5Fallback();
      } catch {
        if (!mountedRef.current) return;
        setStatus('error');
        setError(getCameraErrorMessage(cameraError));
      }
    }
  };

  const toggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    const next = !torchOn;
    try {
      await track.applyConstraints({ advanced: [{ torch: next } as any] });
      setTorchOn(next);
    } catch {
      setHasTorch(false);
    }
  };

  const scanImage = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setStatus('starting');
    setError(null);

    try {
      await stop();
      setMode('html5');
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
      const scanner = new Html5Qrcode(FALLBACK_ELEMENT_ID);
      html5Ref.current = scanner;
      const decoded = await scanner.scanFile(file, true);
      await finish(decoded);
    } catch {
      if (!mountedRef.current) return;
      setStatus('error');
      setError('لم يتم العثور على رمز QR صالح في الصورة. التقط الرمز كاملًا بوضوح أو اختر صورة أخرى.');
    }
  };

  useEffect(() => {
    mountedRef.current = true;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    void start();

    return () => {
      mountedRef.current = false;
      document.body.style.overflow = previousOverflow;
      void stop();
    };
  }, []);

  const scanner = (
    <section
      className="fixed inset-0 z-[2147483647] h-[100dvh] w-screen overflow-hidden bg-black text-white"
      dir="rtl"
      aria-label="ماسح رمز QR"
    >
      {mode === 'native' && (
        <video
          ref={videoRef}
          className="absolute inset-0 h-full w-full bg-black object-cover"
          playsInline
          muted
          autoPlay
        />
      )}

      {mode === 'html5' && (
        <div
          id={FALLBACK_ELEMENT_ID}
          className="absolute inset-0 h-full w-full overflow-hidden bg-black [&_video]:!h-full [&_video]:!w-full [&_video]:!object-cover"
        />
      )}

      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0,transparent_28%,rgba(0,0,0,0.08)_29%,rgba(0,0,0,0.74)_70%)]" />

      <header className="absolute inset-x-0 top-0 z-20 flex items-center justify-between px-4 pb-4 pt-[max(1rem,env(safe-area-inset-top))]">
        <button
          type="button"
          onClick={() => {
            void stop();
            onCancel();
          }}
          className="flex h-12 w-12 items-center justify-center rounded-full bg-black/55 backdrop-blur-md active:scale-95"
          aria-label="إغلاق الماسح"
        >
          <X className="h-6 w-6" />
        </button>

        <strong className="rounded-full bg-black/55 px-4 py-2 text-xs backdrop-blur-md">مسح QR</strong>

        {hasTorch && mode === 'native' ? (
          <button
            type="button"
            onClick={toggleTorch}
            className={`flex h-12 w-12 items-center justify-center rounded-full backdrop-blur-md active:scale-95 ${torchOn ? 'bg-amber-400 text-black' : 'bg-black/55'}`}
            aria-label={torchOn ? 'إيقاف الإضاءة' : 'تشغيل الإضاءة'}
          >
            <Flashlight className="h-5 w-5" />
          </button>
        ) : (
          <span className="h-12 w-12" aria-hidden="true" />
        )}
      </header>

      <div className="pointer-events-none absolute left-1/2 top-1/2 h-[min(74vw,340px)] w-[min(74vw,340px)] -translate-x-1/2 -translate-y-1/2 rounded-[2rem] border-2 border-emerald-400 shadow-[0_0_0_1px_rgba(255,255,255,0.25),0_0_42px_rgba(16,185,129,0.28)]">
        <span className="absolute -left-0.5 -top-0.5 h-12 w-12 rounded-tl-[2rem] border-l-4 border-t-4 border-white" />
        <span className="absolute -right-0.5 -top-0.5 h-12 w-12 rounded-tr-[2rem] border-r-4 border-t-4 border-white" />
        <span className="absolute -bottom-0.5 -left-0.5 h-12 w-12 rounded-bl-[2rem] border-b-4 border-l-4 border-white" />
        <span className="absolute -bottom-0.5 -right-0.5 h-12 w-12 rounded-br-[2rem] border-b-4 border-r-4 border-white" />
      </div>

      <footer className="absolute inset-x-0 bottom-0 z-20 flex flex-col items-center gap-3 px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] text-center">
        {status === 'starting' && (
          <div className="flex items-center gap-2 rounded-full bg-black/60 px-4 py-2 text-xs backdrop-blur-md">
            <Loader2 className="h-4 w-4 animate-spin" />
            جاري تجهيز الكاميرا…
          </div>
        )}

        {status === 'scanning' && (
          <p className="rounded-full bg-black/60 px-4 py-2 text-xs backdrop-blur-md">ضع رمز QR كاملًا داخل الإطار</p>
        )}

        {status === 'error' && (
          <div className="w-full max-w-sm rounded-3xl bg-black/80 p-4 backdrop-blur-md">
            <p className="text-xs leading-6 text-rose-100">{error}</p>
            <button
              type="button"
              onClick={() => void start()}
              className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-white px-3 py-3 text-xs font-bold text-black"
            >
              <RotateCcw className="h-4 w-4" />
              إعادة تشغيل الماسح الحي
            </button>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => cameraInputRef.current?.click()}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-3 py-3 text-xs font-bold text-white"
              >
                <Camera className="h-4 w-4" />
                التقاط صورة QR
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white/15 px-3 py-3 text-xs font-bold text-white"
              >
                <ImageIcon className="h-4 w-4" />
                اختيار صورة
              </button>
            </div>
          </div>
        )}

        {status !== 'error' && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => cameraInputRef.current?.click()}
              className="inline-flex items-center gap-2 rounded-full bg-emerald-600/90 px-4 py-2 text-[11px] font-bold backdrop-blur-md"
            >
              <Camera className="h-4 w-4" />
              تصوير QR
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-2 rounded-full bg-black/55 px-4 py-2 text-[11px] font-bold backdrop-blur-md"
            >
              <ImageIcon className="h-4 w-4" />
              صورة محفوظة
            </button>
          </div>
        )}

        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={scanImage}
        />
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={scanImage}
        />
      </footer>
    </section>
  );

  return createPortal(scanner, document.body);
}

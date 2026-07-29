import { useEffect, useRef, useState } from 'react';
import { Flashlight, Loader2, RotateCcw, X } from 'lucide-react';
import { Html5Qrcode } from 'html5-qrcode';
import { toLatinDigits } from '../lib/digits';

interface DirectQrScannerProps {
  onNavigateToDetails: (token: string) => void;
  onCancel: () => void;
}

const TOKEN_REGEX = /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/;

function extractToken(value: string): string | null {
  return toLatinDigits(value || '').match(TOKEN_REGEX)?.[0] || null;
}

export default function DirectQrScanner({ onNavigateToDetails, onCancel }: DirectQrScannerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const html5Ref = useRef<Html5Qrcode | null>(null);
  const rafRef = useRef<number | null>(null);
  const detectedRef = useRef(false);
  const mountedRef = useRef(true);
  const [status, setStatus] = useState<'starting' | 'scanning' | 'error'>('starting');
  const [error, setError] = useState<string | null>(null);
  const [hasTorch, setHasTorch] = useState(false);
  const [torchOn, setTorchOn] = useState(false);

  const stop = async () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    if (html5Ref.current) {
      const scanner = html5Ref.current;
      html5Ref.current = null;
      try { if (scanner.isScanning) await scanner.stop(); } catch {}
      try { await scanner.clear(); } catch {}
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

  const startBarcodeLoop = () => {
    const Detector = (window as any).BarcodeDetector;
    const detector = new Detector({ formats: ['qr_code'] });
    let lastScan = 0;
    const tick = async (time: number) => {
      if (!mountedRef.current || detectedRef.current || !streamRef.current) return;
      const video = videoRef.current;
      if (video && video.readyState >= 2 && time - lastScan >= 90) {
        lastScan = time;
        try {
          const codes = await detector.detect(video);
          if (codes?.[0]?.rawValue) await finish(codes[0].rawValue);
        } catch {}
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  };

  const applyCameraQuality = async (track: MediaStreamTrack) => {
    try {
      const caps: any = track.getCapabilities?.() || {};
      const advanced: any = {};
      if (caps.focusMode?.includes('continuous')) advanced.focusMode = 'continuous';
      if (caps.exposureMode?.includes('continuous')) advanced.exposureMode = 'continuous';
      if (caps.whiteBalanceMode?.includes('continuous')) advanced.whiteBalanceMode = 'continuous';
      if (Object.keys(advanced).length) await track.applyConstraints({ advanced: [advanced] } as any);
      setHasTorch(Boolean(caps.torch));
    } catch {
      setHasTorch(false);
    }
  };

  const startHtml5Fallback = async () => {
    const scanner = new Html5Qrcode('direct-qr-fallback');
    html5Ref.current = scanner;
    await scanner.start(
      { facingMode: { exact: 'environment' } },
      {
        fps: 12,
        qrbox: (viewfinderWidth, viewfinderHeight) => {
          const size = Math.floor(Math.min(viewfinderWidth, viewfinderHeight) * 0.72);
          return { width: size, height: size };
        },
        aspectRatio: 1.7777778,
        disableFlip: true,
        videoConstraints: {
          facingMode: { exact: 'environment' },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          frameRate: { ideal: 30, max: 30 }
        }
      },
      decodedText => void finish(decodedText),
      () => {}
    );
    setStatus('scanning');
  };

  const start = async () => {
    detectedRef.current = false;
    setStatus('starting');
    setError(null);
    setTorchOn(false);
    await stop();

    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus('error');
      setError('هذا الجهاز لا يتيح تشغيل الكاميرا داخل سند.');
      return;
    }

    try {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { exact: 'environment' },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
            frameRate: { ideal: 30, max: 30 }
          },
          audio: false
        });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
            frameRate: { ideal: 30, max: 30 }
          },
          audio: false
        });
      }

      streamRef.current = stream;
      const track = stream.getVideoTracks()[0];
      if (track) await applyCameraQuality(track);

      const video = videoRef.current;
      if (!video) throw new Error('video_unavailable');
      video.srcObject = stream;
      await video.play();
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
      setStatus('error');
      const name = cameraError?.name || '';
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        setError('لم يتم السماح لسند باستخدام الكاميرا الخلفية. فعّل الإذن من إعدادات التطبيق.');
      } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
        setError('لم يتم العثور على كاميرا خلفية متاحة.');
      } else {
        setError('تعذر تشغيل الكاميرا الآن. أغلق أي تطبيق يستخدمها ثم أعد المحاولة.');
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
    } catch {}
  };

  useEffect(() => {
    mountedRef.current = true;
    void start();
    return () => {
      mountedRef.current = false;
      void stop();
    };
  }, []);

  return (
    <section className="fixed inset-0 z-[100] bg-black text-white" dir="rtl" aria-label="ماسح رمز QR">
      <video ref={videoRef} className="h-full w-full object-cover" playsInline muted autoPlay />
      <div id="direct-qr-fallback" className="absolute inset-0 h-full w-full overflow-hidden" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0,transparent_34%,rgba(0,0,0,0.18)_35%,rgba(0,0,0,0.72)_72%)]" />

      <header className="absolute inset-x-0 top-0 flex items-center justify-between px-4 pb-4 pt-[max(1rem,env(safe-area-inset-top))]">
        <button type="button" onClick={() => { void stop(); onCancel(); }} className="rounded-full bg-black/45 p-3 backdrop-blur" aria-label="إغلاق">
          <X className="h-5 w-5" />
        </button>
        <strong className="rounded-full bg-black/45 px-4 py-2 text-xs backdrop-blur">مسح QR</strong>
        {hasTorch ? (
          <button type="button" onClick={toggleTorch} className={`rounded-full p-3 backdrop-blur ${torchOn ? 'bg-amber-400 text-black' : 'bg-black/45'}`} aria-label="تشغيل الإضاءة">
            <Flashlight className="h-5 w-5" />
          </button>
        ) : <span className="h-11 w-11" />}
      </header>

      <div className="pointer-events-none absolute left-1/2 top-1/2 h-[min(72vw,330px)] w-[min(72vw,330px)] -translate-x-1/2 -translate-y-1/2 rounded-[2rem] border-2 border-emerald-400 shadow-[0_0_0_1px_rgba(255,255,255,0.25),0_0_45px_rgba(16,185,129,0.25)]" />

      <footer className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-3 px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] text-center">
        {status === 'starting' && (
          <div className="flex items-center gap-2 rounded-full bg-black/55 px-4 py-2 text-xs backdrop-blur"><Loader2 className="h-4 w-4 animate-spin" /> جاري تشغيل الكاميرا الخلفية…</div>
        )}
        {status === 'scanning' && <p className="rounded-full bg-black/55 px-4 py-2 text-xs backdrop-blur">وجّه الكاميرا نحو رمز QR</p>}
        {status === 'error' && (
          <div className="w-full max-w-sm rounded-3xl bg-black/75 p-4 backdrop-blur">
            <p className="text-xs leading-6 text-rose-100">{error}</p>
            <button type="button" onClick={() => void start()} className="mt-3 inline-flex items-center gap-2 rounded-2xl bg-white px-4 py-3 text-xs font-bold text-black">
              <RotateCcw className="h-4 w-4" /> إعادة المحاولة
            </button>
          </div>
        )}
      </footer>
    </section>
  );
}

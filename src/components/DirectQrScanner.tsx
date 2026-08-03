import { ChangeEvent, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Camera,
  Flashlight,
  Image as ImageIcon,
  Loader2,
  RotateCcw,
  X
} from 'lucide-react';
import { Html5Qrcode } from 'html5-qrcode';
import { toLatinDigits } from '../lib/digits';

interface DirectQrScannerProps {
  onNavigateToDetails: (token: string) => void;
  onCancel: () => void;
}

type ScannerMode = 'native' | 'html5';
type ScannerStatus = 'starting' | 'scanning' | 'error';

type PreparedRearCamera = {
  stream: MediaStream;
  deviceId: string | null;
  candidates: MediaDeviceInfo[];
};

const TOKEN_REGEX = /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/;
const FALLBACK_ELEMENT_ID = 'sanad-direct-qr-fallback';
const CAMERA_IDEAL_WIDTH = 4096;
const CAMERA_IDEAL_HEIGHT = 2160;
const CAMERA_IDEAL_FRAME_RATE = 60;
const VIDEO_FRAME_TIMEOUT_MS = 4000;

const FRONT_CAMERA_TERMS = [
  'front',
  'facing front',
  'user',
  'selfie',
  'face camera',
  'امامي',
  'امامية'
];

const REAR_CAMERA_TERMS = [
  'back',
  'facing back',
  'rear',
  'environment',
  'خلفي',
  'خلفية'
];

const AUXILIARY_CAMERA_TERMS = [
  'ultra wide',
  'ultrawide',
  'ultra-wide',
  '0.5x',
  'telephoto',
  'tele',
  'macro',
  'depth',
  'virtual',
  'aux'
];

function extractToken(value: string): string | null {
  return toLatinDigits(value || '').match(TOKEN_REGEX)?.[0] || null;
}

function normalizeCameraLabel(label: string): string {
  return String(label || '')
    .trim()
    .toLowerCase()
    .replace(/[إأآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/\s+/g, ' ');
}

function includesAny(value: string, terms: string[]): boolean {
  return terms.some(term => value.includes(term));
}

function rearCameraScore(device: MediaDeviceInfo): number {
  const label = normalizeCameraLabel(device.label);
  if (!label || includesAny(label, FRONT_CAMERA_TERMS)) return Number.NEGATIVE_INFINITY;
  if (!includesAny(label, REAR_CAMERA_TERMS)) return Number.NEGATIVE_INFINITY;

  let score = 200;
  if (label.includes('facing back')) score += 100;
  if (label.includes('main') || label.includes('primary')) score += 80;
  if ((label.includes('wide') || label.includes('1x')) && !label.includes('ultra')) score += 35;
  if (/camera2?\s*0\b/.test(label)) score += 30;
  if (includesAny(label, AUXILIARY_CAMERA_TERMS)) score -= 160;
  return score;
}

function selectRearCameraCandidates(devices: MediaDeviceInfo[]): MediaDeviceInfo[] {
  return devices
    .filter(device => device.kind === 'videoinput')
    .map(device => ({ device, score: rearCameraScore(device) }))
    .filter(item => Number.isFinite(item.score))
    .sort((a, b) => b.score - a.score || a.device.deviceId.localeCompare(b.device.deviceId))
    .map(item => item.device);
}

function getCameraErrorMessage(error: any): string {
  const name = error?.name || '';
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
    return 'لم يتم السماح لسند باستخدام الكاميرا. فعّل الإذن أو التقط صورة QR بكاميرا الهاتف.';
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return 'لم يتم العثور على كاميرا خلفية متاحة. يمكنك التقاط صورة QR بكاميرا الهاتف أو اختيار صورة محفوظة.';
  }
  if (name === 'NotReadableError' || name === 'TrackStartError') {
    return 'الكاميرا مستخدمة في تطبيق آخر. أغلق التطبيق الآخر أو استخدم كاميرا الهاتف لالتقاط صورة QR.';
  }
  if (name === 'OverconstrainedError' || name === 'ConstraintNotSatisfiedError') {
    return 'تعذر تشغيل الكاميرا الخلفية بالإعدادات المتاحة. أعد المحاولة أو استخدم صورة محفوظة.';
  }
  if (error?.message === 'rear_camera_frame_unavailable') {
    return 'لم تصل صورة فعلية من الكاميرا الخلفية. أعد المحاولة أو أغلق أي تطبيق آخر يستخدم الكاميرا.';
  }
  return 'تعذر تشغيل الماسح الحي بالكاميرا الخلفية. استخدم كاميرا الهاتف لالتقاط صورة QR أو اختر صورة محفوظة.';
}

function highQualityVideoConstraints(
  deviceId?: string,
  exactRear = true
): MediaTrackConstraints {
  return {
    ...(deviceId
      ? { deviceId: { exact: deviceId } }
      : { facingMode: exactRear ? { exact: 'environment' } : { ideal: 'environment' } }),
    width: { ideal: CAMERA_IDEAL_WIDTH },
    height: { ideal: CAMERA_IDEAL_HEIGHT },
    frameRate: { ideal: CAMERA_IDEAL_FRAME_RATE },
    resizeMode: 'none'
  } as MediaTrackConstraints;
}

function stopMediaStream(stream: MediaStream | null | undefined): void {
  stream?.getTracks().forEach(track => track.stop());
}

function isFrontFacingTrack(track: MediaStreamTrack, devices: MediaDeviceInfo[]): boolean {
  const settings = track.getSettings?.() || {};
  if (settings.facingMode === 'user') return true;
  const label = normalizeCameraLabel(
    devices.find(device => device.deviceId === settings.deviceId)?.label || track.label
  );
  return Boolean(label && includesAny(label, FRONT_CAMERA_TERMS));
}

function waitForVideoFrame(
  video: HTMLVideoElement,
  timeoutMs = VIDEO_FRAME_TIMEOUT_MS
): Promise<boolean> {
  return new Promise(resolve => {
    let settled = false;
    let callbackId: number | null = null;

    const finish = (ready: boolean) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      video.removeEventListener('loadeddata', checkReady);
      video.removeEventListener('playing', checkReady);
      if (callbackId !== null && 'cancelVideoFrameCallback' in video) {
        (video as any).cancelVideoFrameCallback(callbackId);
      }
      resolve(ready);
    };

    const checkReady = () => {
      if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth > 0 && video.videoHeight > 0) {
        if ('requestVideoFrameCallback' in video) {
          callbackId = (video as any).requestVideoFrameCallback(() => finish(true));
        } else {
          requestAnimationFrame(() => finish(true));
        }
      }
    };

    const timeoutId = window.setTimeout(() => finish(false), timeoutMs);
    video.addEventListener('loadeddata', checkReady);
    video.addEventListener('playing', checkReady);
    checkReady();
  });
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
  const activeRearDeviceIdRef = useRef<string | null>(null);

  const [mode, setMode] = useState<ScannerMode>('native');
  const [status, setStatus] = useState<ScannerStatus>('starting');
  const [error, setError] = useState<string | null>(null);
  const [hasTorch, setHasTorch] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [previewReady, setPreviewReady] = useState(false);

  const stop = async () => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    stopMediaStream(streamRef.current);
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

  const applyCameraCapabilities = async (track: MediaStreamTrack) => {
    const capabilities: any = track.getCapabilities?.() || {};

    try {
      const quality: any = {};
      if (capabilities.width?.max) quality.width = { ideal: capabilities.width.max };
      if (capabilities.height?.max) quality.height = { ideal: capabilities.height.max };
      if (capabilities.frameRate?.max) quality.frameRate = { ideal: capabilities.frameRate.max };
      if (Array.isArray(capabilities.resizeMode) && capabilities.resizeMode.includes('none')) {
        quality.resizeMode = 'none';
      }
      if (Object.keys(quality).length > 0) await track.applyConstraints(quality);
    } catch {
      // Keep the opened rear-camera stream if advertised maximums cannot be combined.
    }

    try {
      const continuous: any = {};
      if (capabilities.focusMode?.includes('continuous')) continuous.focusMode = 'continuous';
      if (capabilities.exposureMode?.includes('continuous')) continuous.exposureMode = 'continuous';
      if (capabilities.whiteBalanceMode?.includes('continuous')) continuous.whiteBalanceMode = 'continuous';
      if (Object.keys(continuous).length > 0) {
        await track.applyConstraints({ advanced: [continuous] } as any);
      }
    } catch {
      // Continuous controls are enhancements and must not block scanning.
    }

    try {
      track.contentHint = 'detail';
    } catch {
      // contentHint is optional.
    }

    setHasTorch(Boolean(capabilities.torch));

    if (import.meta.env.DEV) {
      const settings = track.getSettings?.() || {};
      console.info('[SANAD QR] active rear camera settings', {
        width: settings.width,
        height: settings.height,
        frameRate: settings.frameRate,
        facingMode: settings.facingMode,
        deviceId: settings.deviceId,
        label: track.label
      });
    }
  };

  const openRearStream = async (deviceId?: string): Promise<MediaStream> => {
    if (deviceId) {
      return navigator.mediaDevices.getUserMedia({
        video: highQualityVideoConstraints(deviceId),
        audio: false
      });
    }

    try {
      return await navigator.mediaDevices.getUserMedia({
        video: highQualityVideoConstraints(undefined, true),
        audio: false
      });
    } catch (error: any) {
      if (error?.name !== 'OverconstrainedError' && error?.name !== 'ConstraintNotSatisfiedError') {
        throw error;
      }
      return navigator.mediaDevices.getUserMedia({
        video: highQualityVideoConstraints(undefined, false),
        audio: false
      });
    }
  };

  const prepareRearCamera = async (): Promise<PreparedRearCamera> => {
    let stream = await openRearStream();
    let track = stream.getVideoTracks()[0];
    if (!track) {
      stopMediaStream(stream);
      throw new DOMException('Rear camera unavailable', 'NotFoundError');
    }

    let devices: MediaDeviceInfo[] = [];
    try {
      devices = await navigator.mediaDevices.enumerateDevices();
    } catch {
      devices = [];
    }

    if (isFrontFacingTrack(track, devices)) {
      stopMediaStream(stream);
      throw new DOMException('Front camera rejected', 'OverconstrainedError');
    }

    const candidates = selectRearCameraCandidates(devices);
    const preferred = candidates[0];
    const currentDeviceId = track.getSettings?.().deviceId || null;

    if (preferred?.deviceId && preferred.deviceId !== currentDeviceId) {
      stopMediaStream(stream);
      try {
        stream = await openRearStream(preferred.deviceId);
        track = stream.getVideoTracks()[0];
      } catch {
        stream = await openRearStream();
        track = stream.getVideoTracks()[0];
      }
    }

    if (!track || isFrontFacingTrack(track, devices)) {
      stopMediaStream(stream);
      throw new DOMException('Front camera rejected', 'OverconstrainedError');
    }

    return {
      stream,
      deviceId: track.getSettings?.().deviceId || preferred?.deviceId || null,
      candidates
    };
  };

  const startBarcodeLoop = () => {
    const Detector = (window as any).BarcodeDetector;
    const detector = new Detector({ formats: ['qr_code'] });
    let lastScanAt = 0;

    const tick = async (time: number) => {
      if (!mountedRef.current || detectedRef.current || !streamRef.current) return;
      const video = videoRef.current;

      if (
        video &&
        video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
        time - lastScanAt >= 100 &&
        !decodingRef.current
      ) {
        lastScanAt = time;
        decodingRef.current = true;
        try {
          const codes = await detector.detect(video);
          if (codes?.[0]?.rawValue) await finish(codes[0].rawValue);
        } catch {
          // A transient decoder failure must not stop the rear camera preview.
        } finally {
          decodingRef.current = false;
        }
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
  };

  const attachNativePreview = async (stream: MediaStream): Promise<boolean> => {
    const track = stream.getVideoTracks()[0];
    if (!track) return false;

    await applyCameraCapabilities(track);

    const video = videoRef.current;
    if (!video) throw new Error('video_unavailable');

    streamRef.current = stream;
    video.srcObject = stream;
    video.setAttribute('playsinline', 'true');
    video.disablePictureInPicture = true;
    await video.play();
    return waitForVideoFrame(video);
  };

  const startHtml5Fallback = async (deviceId?: string) => {
    setMode('html5');
    setPreviewReady(false);
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));

    const scanner = new Html5Qrcode(FALLBACK_ELEMENT_ID);
    html5Ref.current = scanner;

    await scanner.start(
      deviceId ? { deviceId: { exact: deviceId } } : { facingMode: 'environment' },
      {
        fps: 20,
        qrbox: (width, height) => {
          const size = Math.max(240, Math.floor(Math.min(width, height) * 0.76));
          return { width: size, height: size };
        },
        disableFlip: true,
        videoConstraints: highQualityVideoConstraints(deviceId, true)
      },
      decodedText => void finish(decodedText),
      () => {}
    );

    const fallbackVideo = document.querySelector(`#${FALLBACK_ELEMENT_ID} video`) as HTMLVideoElement | null;
    const ready = fallbackVideo ? await waitForVideoFrame(fallbackVideo) : true;
    if (!ready) throw new Error('rear_camera_frame_unavailable');

    if (mountedRef.current) {
      setPreviewReady(true);
      setStatus('scanning');
    }
  };

  const start = async () => {
    detectedRef.current = false;
    decodingRef.current = false;
    setMode('native');
    setStatus('starting');
    setError(null);
    setTorchOn(false);
    setHasTorch(false);
    setPreviewReady(false);
    await stop();

    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus('error');
      setError('هذا الجهاز لا يتيح الماسح الحي داخل سند. التقط صورة QR بكاميرا الهاتف أو اختر صورة محفوظة.');
      return;
    }

    let prepared: PreparedRearCamera | null = null;

    try {
      prepared = await prepareRearCamera();
      activeRearDeviceIdRef.current = prepared.deviceId;

      if (!('BarcodeDetector' in window)) {
        stopMediaStream(prepared.stream);
        prepared.stream = new MediaStream();
        await startHtml5Fallback(prepared.deviceId || undefined);
        return;
      }

      let ready = await attachNativePreview(prepared.stream);

      if (!ready) {
        await stop();
        const alternatives = prepared.candidates.filter(
          device => device.deviceId && device.deviceId !== prepared?.deviceId
        );

        for (const candidate of alternatives) {
          const candidateStream = await openRearStream(candidate.deviceId);
          const candidateTrack = candidateStream.getVideoTracks()[0];
          if (!candidateTrack || isFrontFacingTrack(candidateTrack, prepared.candidates)) {
            stopMediaStream(candidateStream);
            continue;
          }

          activeRearDeviceIdRef.current = candidate.deviceId;
          ready = await attachNativePreview(candidateStream);
          if (ready) break;
          await stop();
        }
      }

      if (!ready) throw new Error('rear_camera_frame_unavailable');
      if (!mountedRef.current) return;

      setPreviewReady(true);
      setStatus('scanning');
      startBarcodeLoop();
    } catch (cameraError: any) {
      await stop();
      try {
        await startHtml5Fallback(activeRearDeviceIdRef.current || prepared?.deviceId || undefined);
      } catch {
        if (!mountedRef.current) return;
        setPreviewReady(false);
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
    setPreviewReady(false);

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
      className="fixed inset-0 z-[2147483647] h-[100dvh] w-screen overflow-hidden bg-slate-950 text-white"
      dir="rtl"
      aria-label="ماسح رمز QR بالكاميرا الخلفية"
    >
      {mode === 'native' && (
        <video
          ref={videoRef}
          className={`absolute inset-0 h-full w-full bg-slate-950 object-cover transition-opacity duration-200 ${previewReady ? 'opacity-100' : 'opacity-0'}`}
          playsInline
          muted
          autoPlay
        />
      )}

      {mode === 'html5' && (
        <div
          id={FALLBACK_ELEMENT_ID}
          className={`absolute inset-0 h-full w-full overflow-hidden bg-slate-950 transition-opacity duration-200 [&_video]:!h-full [&_video]:!w-full [&_video]:!object-cover ${previewReady ? 'opacity-100' : 'opacity-0'}`}
        />
      )}

      <header className="absolute inset-x-0 top-0 z-30 flex items-center justify-between px-4 pb-4 pt-[max(1rem,env(safe-area-inset-top))]">
        <button
          type="button"
          onClick={() => {
            void stop();
            onCancel();
          }}
          className="flex h-12 w-12 items-center justify-center rounded-full bg-black/45 shadow-lg backdrop-blur-md transition active:scale-95"
          aria-label="إغلاق الماسح"
        >
          <X className="h-6 w-6" />
        </button>

        <strong className="rounded-full border border-white/10 bg-black/45 px-4 py-2 text-sm font-bold shadow-lg backdrop-blur-md">
          مسح QR
        </strong>

        {hasTorch && mode === 'native' ? (
          <button
            type="button"
            onClick={toggleTorch}
            className={`flex h-12 w-12 items-center justify-center rounded-full shadow-lg backdrop-blur-md transition active:scale-95 ${torchOn ? 'bg-amber-400 text-black' : 'bg-black/45'}`}
            aria-label={torchOn ? 'إيقاف الإضاءة' : 'تشغيل الإضاءة'}
          >
            <Flashlight className="h-5 w-5" />
          </button>
        ) : (
          <span className="h-12 w-12" aria-hidden="true" />
        )}
      </header>

      <div
        className="pointer-events-none absolute left-1/2 top-1/2 h-[min(78vw,380px)] w-[min(78vw,380px)] -translate-x-1/2 -translate-y-1/2 rounded-[1.8rem] border border-emerald-300/90 bg-transparent shadow-[0_0_0_9999px_rgba(0,0,0,0.32),0_0_0_1px_rgba(255,255,255,0.22),0_0_36px_rgba(16,185,129,0.22)]"
        aria-hidden="true"
      >
        <span className="absolute -left-0.5 -top-0.5 h-11 w-11 rounded-tl-[1.8rem] border-l-[3px] border-t-[3px] border-white" />
        <span className="absolute -right-0.5 -top-0.5 h-11 w-11 rounded-tr-[1.8rem] border-r-[3px] border-t-[3px] border-white" />
        <span className="absolute -bottom-0.5 -left-0.5 h-11 w-11 rounded-bl-[1.8rem] border-b-[3px] border-l-[3px] border-white" />
        <span className="absolute -bottom-0.5 -right-0.5 h-11 w-11 rounded-br-[1.8rem] border-b-[3px] border-r-[3px] border-white" />
      </div>

      <footer className="absolute inset-x-0 bottom-0 z-30 flex flex-col items-center gap-3 px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] text-center">
        {status === 'starting' && (
          <div className="flex items-center gap-2 rounded-full border border-white/10 bg-black/55 px-4 py-2 text-sm backdrop-blur-md">
            <Loader2 className="h-4 w-4 animate-spin" />
            جاري تشغيل الكاميرا الخلفية…
          </div>
        )}

        {status === 'scanning' && (
          <p className="rounded-full border border-white/10 bg-black/50 px-4 py-2 text-sm font-medium backdrop-blur-md">
            ضع رمز QR كاملًا داخل الإطار
          </p>
        )}

        {status === 'error' && (
          <div className="w-full max-w-sm rounded-3xl border border-white/10 bg-black/80 p-4 shadow-2xl backdrop-blur-md">
            <p className="text-sm leading-7 text-rose-100">{error}</p>
            <button
              type="button"
              onClick={() => void start()}
              className="mt-3 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-white px-3 py-3 text-sm font-bold text-black"
            >
              <RotateCcw className="h-4 w-4" />
              إعادة تشغيل الكاميرا الخلفية
            </button>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => cameraInputRef.current?.click()}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-3 py-3 text-sm font-bold text-white"
              >
                <Camera className="h-4 w-4" />
                التقاط صورة QR
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-white/15 px-3 py-3 text-sm font-bold text-white"
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
              className="inline-flex min-h-12 items-center gap-2 rounded-full bg-emerald-600/95 px-5 py-3 text-sm font-bold shadow-lg backdrop-blur-md transition active:scale-95"
            >
              <Camera className="h-5 w-5" />
              تصوير QR
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex min-h-12 items-center gap-2 rounded-full border border-white/10 bg-black/45 px-5 py-3 text-sm font-bold shadow-lg backdrop-blur-md transition active:scale-95"
            >
              <ImageIcon className="h-5 w-5" />
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

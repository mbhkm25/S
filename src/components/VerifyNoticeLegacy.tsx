import React, { useState, useRef, useEffect } from 'react';
import { Search, QrCode, Image, AlertCircle, Clipboard, Camera, Loader2, Check, RefreshCw, X, Zap } from 'lucide-react';
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

  // Unified Scanner States
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [scannerStatus, setScannerStatus] = useState<'initializing' | 'scanning' | 'detected' | 'invalid' | 'permission_denied' | 'unavailable'>('initializing');

  // Intelligent Device Selection States
  const [logicalFacing, setLogicalFacing] = useState<'rear' | 'front'>('rear');
  const [isStarting, setIsStarting] = useState(false);
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [hasSwitchOption, setHasSwitchOption] = useState(false);
  const [activeDeviceId, setActiveDeviceId] = useState<string | null>(null);
  const [hasFlash, setHasFlash] = useState(false);
  const [isFlashOn, setIsFlashOn] = useState(false);

  // File Scanning state
  const [scanningFile, setScanningFile] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Refs for custom implementation lifecycle and safety guards
  const html5QrCodeRef = useRef<Html5Qrcode | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const mountedRef = useRef<boolean>(true);
  const startingRef = useRef<boolean>(false);
  const decodingRef = useRef<boolean>(false);
  const detectedRef = useRef<boolean>(false);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const visibilityRestartRef = useRef<boolean>(false);
  const facingRef = useRef<'rear' | 'front'>('rear');

  // Cache/cooldown refs for invalid QRs
  const lastInvalidValueRef = useRef<string | null>(null);
  const lastInvalidTimeRef = useRef<number>(0);

  // Setup mount lifecycle guard and central cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;

    // Check version. If version is not '2', clear old session cache keys
    const currentVersion = sessionStorage.getItem('sanad_camera_selection_version');
    if (currentVersion !== '2') {
      sessionStorage.removeItem('sanad_best_rear_camera');
      sessionStorage.removeItem('sanad_best_front_camera');
      sessionStorage.removeItem('sanad_best_rear_camera_v2');
      sessionStorage.removeItem('sanad_best_front_camera_v2');
      sessionStorage.removeItem('sanad_camera_selection_version');
    }

    const bestRear = sessionStorage.getItem('sanad_best_rear_camera_v2');
    const bestFront = sessionStorage.getItem('sanad_best_front_camera_v2');
    if (bestRear && bestFront) {
      try {
        const rears = JSON.parse(bestRear);
        const fronts = JSON.parse(bestFront);
        setHasSwitchOption(rears.length > 0 && fronts.length > 0);
      } catch (e) {
        setHasSwitchOption(false);
      }
    } else {
      setHasSwitchOption(false);
    }

    return () => {
      mountedRef.current = false;
      stopCameraOnly();
    };
  }, []);

  // Handle Pasting
  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setInputVal(toLatinDigits(text));
      setGeneralError(null);
      setCopiedText(true);
      setTimeout(() => {
        if (mountedRef.current) setCopiedText(false);
      }, 2000);
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

  // Centralized stream and scan cleanup
  const stopCameraOnly = async () => {
    // 1. Cancel animation frame
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    // 2. Turn off torch and stop stream tracks
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => {
        try {
          track.applyConstraints({ advanced: [{ torch: false } as any] }).catch(() => {});
          track.stop();
        } catch (e) {}
      });
      streamRef.current = null;
    }

    // 3. Stop tracks on videoRef srcObject
    if (videoRef.current && videoRef.current.srcObject instanceof MediaStream) {
      videoRef.current.srcObject.getTracks().forEach(track => {
        try {
          track.stop();
        } catch (e) {}
      });
      videoRef.current.srcObject = null;
    }

    // 4. Stop html5-qrcode instance if active
    if (html5QrCodeRef.current) {
      const scanner = html5QrCodeRef.current;
      html5QrCodeRef.current = null;
      try {
        if (scanner.isScanning) {
          await scanner.stop();
        }
      } catch (e) {
        console.warn("Failed to stop scanner library:", e);
      }
    }

    // 5. Query and stop any dynamically injected video streams in container
    try {
      const html5Video = document.querySelector('#camera-reader video') as HTMLVideoElement;
      if (html5Video && html5Video.srcObject instanceof MediaStream) {
        html5Video.srcObject.getTracks().forEach(track => {
          try {
            track.stop();
          } catch (e) {}
        });
        html5Video.srcObject = null;
      }
    } catch (e) {}

    // 6. Clear video srcObject reference
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    // Reset loop locks
    decodingRef.current = false;
  };

  // Handles closing/canceling the scanner
  const handleCancel = async () => {
    await stopCameraOnly();
    if (mountedRef.current) {
      setIsCameraActive(false);
    }
    if (directCameraOnly && onCancelDirectCamera) {
      onCancelDirectCamera();
    }
  };

  // Sequential Discovery of Best Lenses for Rear and Front positions using max capabilities
  const discoverBestDevices = async (videoInputs: MediaDeviceInfo[]) => {
    let candidates: {
      deviceId: string;
      label: string;
      facing: 'rear' | 'front';
      score: number;
      maxWidth: number;
      maxHeight: number;
      actualWidth: number;
      actualHeight: number;
      maxFps: number;
    }[] = [];

    for (let idx = 0; idx < videoInputs.length; idx++) {
      const candidate = videoInputs[idx];
      let stream: MediaStream | null = null;
      try {
        // Query candidate stream capabilities using getUserMedia sequentially
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            deviceId: { exact: candidate.deviceId },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
            frameRate: { ideal: 30, max: 30 }
          },
          audio: false
        });

        if (!stream) continue;

        const track = stream.getVideoTracks()[0];
        if (track) {
          const initialSettings = track.getSettings();
          const caps: any = typeof track.getCapabilities === 'function' ? track.getCapabilities() : {};

          const maxWidth = caps.width?.max ?? initialSettings.width ?? 0;
          const maxHeight = caps.height?.max ?? initialSettings.height ?? 0;
          const maxFps = caps.frameRate?.max ?? initialSettings.frameRate ?? 0;

          // Attempt constraint modification to discover the true achievable resolution
          try {
            const testConstraints: any = {
              width: { ideal: Math.min(maxWidth, 1920) },
              height: { ideal: Math.min(maxHeight, 1080) },
              frameRate: { ideal: Math.min(maxFps, 30), max: 30 }
            };
            if (caps.focusMode?.includes("continuous")) {
              testConstraints.focusMode = "continuous";
            }
            await track.applyConstraints({ advanced: [testConstraints] } as any);
          } catch (e) {
            // Safe fallback inside try
          }

          const finalSettings = track.getSettings();
          const actualWidth = finalSettings.width || initialSettings.width || 0;
          const actualHeight = finalSettings.height || initialSettings.height || 0;
          const actualFps = finalSettings.frameRate || initialSettings.frameRate || 0;
          const facingMode = finalSettings.facingMode || initialSettings.facingMode || "";

          // Stop temporary stream immediately
          stream.getTracks().forEach(t => t.stop());
          stream = null;

          // Classification logic (settings face mode -> label heuristics -> default rear)
          let facing: 'rear' | 'front' | null = null;
          if (facingMode === 'environment') {
            facing = 'rear';
          } else if (facingMode === 'user') {
            facing = 'front';
          } else {
            const label = (candidate.label || "").toLowerCase();
            if (label.includes('front') || label.includes('user') || label.includes('face') || label.includes('أمامية')) {
              facing = 'front';
            } else if (label.includes('back') || label.includes('rear') || label.includes('environment') || label.includes('خلفية')) {
              facing = 'rear';
            }
          }

          if (!facing) {
            facing = 'rear'; // Fallback guess
          }

          // Calculate score based on capability limits and tested constraint results
          const maxCapabilityPixels = maxWidth * maxHeight;
          const actualPixelsAfterConstraints = actualWidth * actualHeight;
          let score = maxCapabilityPixels + (actualPixelsAfterConstraints * 0.5) + (actualFps * 1000);

          const label = (candidate.label || "").toLowerCase();

          // Apply label-based priority adjustments
          if (
            label.includes('ultra wide') ||
            label.includes('ultrawide') ||
            label.includes('macro') ||
            label.includes('depth') ||
            label.includes('telephoto') ||
            label.includes('auxiliary') ||
            label.includes('aux')
          ) {
            score -= 500000; // Penalize sub-lenses heavily
          }

          if (
            label.includes('main') ||
            label.includes('wide') ||
            label.includes('back camera') ||
            label.includes('rear camera')
          ) {
            score += 100000; // Boost main sensors
          }

          candidates.push({
            deviceId: candidate.deviceId,
            label: candidate.label || "Unknown Camera",
            facing,
            score,
            maxWidth,
            maxHeight,
            actualWidth,
            actualHeight,
            maxFps
          });

          // Developer Logging of actual values on phone
          if (import.meta.env.DEV) {
            console.log(`[Camera Selection] candidateIndex: ${idx}
              Label: "${candidate.label}"
              deviceIdHash: "${candidate.deviceId.substring(0, 6)}..."
              facingMode: "${facingMode}" -> logicalFacing: "${facing}"
              currentSettingsResolution: ${initialSettings.width}x${initialSettings.height}
              maxCapabilityResolution: ${maxWidth}x${maxHeight}
              resolutionAfterApplyConstraints: ${actualWidth}x${actualHeight}
              finalScore: ${score}
            `);
          }
        }
      } catch (err) {
        console.warn(`Failed to inspect device capabilities for ID=${candidate.deviceId.substring(0, 6)}... :`, err);
        if (stream) {
          stream.getTracks().forEach(t => t.stop());
        }
      }
    }

    const rearCandidates = candidates.filter(c => c.facing === 'rear').sort((a, b) => b.score - a.score);
    const frontCandidates = candidates.filter(c => c.facing === 'front').sort((a, b) => b.score - a.score);

    // Cache chosen IDs in sessionStorage
    if (rearCandidates.length > 0) {
      sessionStorage.setItem('sanad_best_rear_camera_v2', JSON.stringify(rearCandidates.map(c => c.deviceId)));
    } else {
      sessionStorage.removeItem('sanad_best_rear_camera_v2');
    }
    if (frontCandidates.length > 0) {
      sessionStorage.setItem('sanad_best_front_camera_v2', JSON.stringify(frontCandidates.map(c => c.deviceId)));
    } else {
      sessionStorage.removeItem('sanad_best_front_camera_v2');
    }

    sessionStorage.setItem('sanad_camera_selection_version', '2');

    return {
      rearCandidates: rearCandidates.map(c => c.deviceId),
      frontCandidates: frontCandidates.map(c => c.deviceId)
    };
  };

  // Camera Acquisition and Setup Pipeline
  const startCamera = async (targetFacing: 'rear' | 'front' = facingRef.current) => {
    if (startingRef.current) return;

    startingRef.current = true;
    setIsStarting(true);
    detectedRef.current = false;
    facingRef.current = targetFacing;
    setLogicalFacing(targetFacing);
    setGeneralError(null);
    setCameraError(null);
    setScannerStatus('initializing');

    let startedSuccessfully = false;

    try {
      // Clean up any existing state first
      await stopCameraOnly();

      // Retrieve sorted candidate lists
      let rearListStr = sessionStorage.getItem('sanad_best_rear_camera_v2');
      let frontListStr = sessionStorage.getItem('sanad_best_front_camera_v2');

      let candidateIds: string[] = [];
      if (targetFacing === 'rear' && rearListStr) {
        try { candidateIds = JSON.parse(rearListStr); } catch (e) {}
      } else if (targetFacing === 'front' && frontListStr) {
        try { candidateIds = JSON.parse(frontListStr); } catch (e) {}
      }

      // 1. Perform camera discovery if cache is empty
      if (candidateIds.length === 0) {
        setIsDiscovering(true);
        try {
          const devices = await navigator.mediaDevices.enumerateDevices();
          const videoInputs = devices.filter(d => d.kind === 'videoinput');

          if (videoInputs.length > 0) {
            const result = await discoverBestDevices(videoInputs);
            setHasSwitchOption(result.rearCandidates.length > 0 && result.frontCandidates.length > 0);
            candidateIds = targetFacing === 'rear' ? result.rearCandidates : result.frontCandidates;
          }
        } catch (err) {
          console.warn("Camera discovery failed:", err);
        } finally {
          setIsDiscovering(false);
        }
      }

      let stream: MediaStream | null = null;
      let errorName = "";
      let activeTrack: MediaStreamTrack | null = null;

      // 2. Loop through candidate lists sequentially and request constraints
      for (const devId of candidateIds) {
        const constraints = {
          video: {
            deviceId: { exact: devId },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
            frameRate: { ideal: 30, max: 30 }
          },
          audio: false
        };

        try {
          stream = await navigator.mediaDevices.getUserMedia(constraints);
          if (stream) {
            const track = stream.getVideoTracks()[0];
            if (track) {
              let settings = track.getSettings();
              let currentWidth = settings.width || 0;
              let currentHeight = settings.height || 0;

              // If current resolution is less than 1280x720, try forcing high resolution
              if (currentWidth < 1280 || currentHeight < 720) {
                const caps: any = typeof track.getCapabilities === 'function' ? track.getCapabilities() : {};

                // A. Try applying ideal constraints (1080p)
                try {
                  const maxWidth = caps.width?.max ?? 1920;
                  const maxHeight = caps.height?.max ?? 1080;
                  await track.applyConstraints({
                    width: { ideal: Math.min(maxWidth, 1920) },
                    height: { ideal: Math.min(maxHeight, 1080) }
                  } as any);

                  settings = track.getSettings();
                  currentWidth = settings.width || 0;
                  currentHeight = settings.height || 0;
                } catch (e) {}

                // B. Try exact 720p constraints if capabilities confirm support
                if ((currentWidth < 1280 || currentHeight < 720) && caps.width?.max >= 1280 && caps.height?.max >= 720) {
                  try {
                    await track.applyConstraints({
                      width: { exact: 1280 },
                      height: { exact: 720 }
                    } as any);

                    settings = track.getSettings();
                    currentWidth = settings.width || 0;
                    currentHeight = settings.height || 0;
                  } catch (e) {}
                }
              }

              // Check if resolution is too low (less than 720p) and another candidate exists in the list to try instead
              if ((currentWidth < 1280 || currentHeight < 720) && candidateIds.indexOf(devId) < candidateIds.length - 1) {
                if (import.meta.env.DEV) {
                  console.log(`[Camera Selection] Rejecting camera ID=${devId.substring(0, 6)}... due to low actual resolution: ${currentWidth}x${currentHeight}`);
                }
                stream.getTracks().forEach(t => t.stop());
                stream = null;
                continue;
              }

              // Found suitable lens
              activeTrack = track;
              break;
            }
          }
        } catch (err: any) {
          errorName = err.name || "";
          console.warn(`Failed to start candidate ID=${devId.substring(0, 6)}...:`, errorName);
          if (stream) {
            stream.getTracks().forEach(t => t.stop());
            stream = null;
          }
        }
      }

      const isBarcodeDetectorSupported = typeof window !== 'undefined' && 'BarcodeDetector' in window;

      // 3. Fallback: If still no stream, request via direct facingMode constraints
      if (!stream) {
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: targetFacing === 'rear' ? { ideal: 'environment' } : { ideal: 'user' },
              width: { ideal: 1920 },
              height: { ideal: 1080 },
              frameRate: { ideal: 30, max: 30 }
            },
            audio: false
          });
        } catch (err: any) {
          errorName = err.name || "";
        }
      }

      // 4. Fallback: Lower resolution constraints
      if (!stream) {
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: targetFacing === 'rear' ? { ideal: 'environment' } : { ideal: 'user' },
              width: { ideal: 1280 },
              height: { ideal: 720 },
              frameRate: { ideal: 30, max: 30 }
            },
            audio: false
          });
        } catch (err: any) {
          errorName = err.name || "";
        }
      }

      // 5. Fallback: video: true as last resort
      if (!stream) {
        try {
          stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        } catch (err: any) {
          errorName = err.name || "";
        }
      }

      // Handle stream launch failure
      if (!stream) {
        if (mountedRef.current) {
          let errMsg = "تعذر تشغيل الكاميرا.";
          let status: typeof scannerStatus = 'unavailable';
          if (errorName === "NotAllowedError" || errorName === "PermissionDeniedError") {
            errMsg = "لم يتم السماح لسند باستخدام الكاميرا.";
            status = 'permission_denied';
          } else if (errorName === "NotFoundError" || errorName === "DevicesNotFoundError") {
            errMsg = "لم يتم العثور على كاميرا متاحة.";
            status = 'unavailable';
          } else if (errorName === "NotReadableError" || errorName === "TrackStartError") {
            errMsg = "الكاميرا مستخدمة من تطبيق آخر أو تعذر تشغيلها.";
            status = 'unavailable';
          }
          setCameraError(errMsg);
          setScannerStatus(status);
        }
        return;
      }

      // If BarcodeDetector is not supported, delegate to html5-qrcode fallback
      if (!isBarcodeDetectorSupported) {
        stream.getTracks().forEach(t => t.stop());
        stream = null;
        await startHtml5QrcodeFallback();
        startedSuccessfully = true;
        startingRef.current = false;
        setIsStarting(false);
        return;
      }

      streamRef.current = stream;
      const videoTrack = activeTrack || stream.getVideoTracks()[0];

      if (videoTrack && mountedRef.current) {
        try {
          const caps: any = videoTrack.getCapabilities?.();
          setHasFlash(!!(caps && 'torch' in caps));
          const settings = videoTrack.getSettings();
          if (settings.deviceId) {
            setActiveDeviceId(settings.deviceId);
          }
        } catch (e) {
          console.warn("Failed to read settings from active track:", e);
        }
      }

      // Wait until video element is rendered and bind stream
      const videoElement = videoRef.current;
      if (videoElement) {
        videoElement.srcObject = stream;

        const onVideoPlay = async () => {
          if (!mountedRef.current) {
            startingRef.current = false;
            setIsStarting(false);
            return;
          }

          // Logging actual values after video.play() in development only
          if (import.meta.env.DEV && videoElement && videoTrack) {
            const trackSettings = videoTrack.getSettings();
            const devIdHash = (trackSettings.deviceId || "").substring(0, 6);
            console.log(`[Camera Active Stream Settings]
              video.videoWidth: ${videoElement.videoWidth}
              video.videoHeight: ${videoElement.videoHeight}
              track.width: ${trackSettings.width}
              track.height: ${trackSettings.height}
              track.frameRate: ${trackSettings.frameRate}
              track.facingMode: "${trackSettings.facingMode}"
              track.deviceIdHash: "${devIdHash}..."
            `);
          }

          if (videoTrack) {
            try {
              const caps: any = videoTrack.getCapabilities?.();
              const adv: any = {};
              if (caps && caps.focusMode?.includes("continuous")) {
                adv.focusMode = "continuous";
              }
              if (caps && caps.exposureMode?.includes("continuous")) {
                adv.exposureMode = "continuous";
              }
              if (caps && caps.whiteBalanceMode?.includes("continuous")) {
                adv.whiteBalanceMode = "continuous";
              }

              // Apply 1.2 zoom constraint under precise conditions
              if (caps && caps.zoom && targetFacing === 'rear') {
                const label = (videoTrack.label || "").toLowerCase();
                const isWide = label.includes('wide') || label.includes('ultrawide');
                if (isWide && caps.zoom.min <= 1.2 && 1.2 <= caps.zoom.max) {
                  adv.zoom = 1.2;
                }
              }

              if (Object.keys(adv).length > 0) {
                await videoTrack.applyConstraints({ advanced: [adv] } as any);
              }
            } catch (e) {
              if (import.meta.env.DEV) {
                console.log("Advanced constraints not fully supported:", e);
              }
            }
          }

          startingRef.current = false;
          setIsStarting(false);
          if (mountedRef.current) {
            setScannerStatus('scanning');
            startBarcodeDetectorLoop();
          }
        };

        videoElement.onloadedmetadata = () => {
          if (videoElement) {
            videoElement.play().then(onVideoPlay).catch(err => {
              console.error("Video play failed:", err);
              startingRef.current = false;
              setIsStarting(false);
            });
          } else {
            startingRef.current = false;
            setIsStarting(false);
          }
        };
        startedSuccessfully = true;
      }
    } catch (err) {
      console.error("Camera starting exception:", err);
      if (mountedRef.current) {
        setScannerStatus('unavailable');
        setCameraError("تعذر تشغيل الكاميرا.");
      }
    } finally {
      if (!startedSuccessfully) {
        startingRef.current = false;
        setIsStarting(false);
      }
    }
  };

  // Path A: High-Speed Native Barcode Detector Loop
  const startBarcodeDetectorLoop = () => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
    }

    const detector = new (window as any).BarcodeDetector({ formats: ['qr_code'] });
    let lastScanTime = 0;

    const tick = () => {
      if (!mountedRef.current || !streamRef.current || detectedRef.current) return;

      const video = videoRef.current;
      if (video && video.readyState >= 2) { // HAVE_CURRENT_DATA
        const now = performance.now();
        if (now - lastScanTime >= 85) { // 10-12 checks per second
          lastScanTime = now;

          if (!decodingRef.current) {
            try {
              // Calculate responsive coordinates of the viewport scanning cutout
              const vw = window.innerWidth;
              const vh = window.innerHeight;
              const boxSize = Math.min(vw * 0.76, 330);
              const boxLeft = (vw - boxSize) / 2;
              const boxTop = (vh - boxSize) / 2;

              const videoWidth = video.videoWidth;
              const videoHeight = video.videoHeight;

              if (videoWidth > 0 && videoHeight > 0) {
                const videoAspect = videoWidth / videoHeight;
                const viewportAspect = vw / vh;
                let scale = 1;
                let srcX = 0;
                let srcY = 0;
                let srcWidth = videoWidth;
                let srcHeight = videoHeight;

                // Adjust mapping coordinates for object-fit: cover
                if (viewportAspect > videoAspect) {
                  const scaledHeight = vw / videoAspect;
                  const yOffset = (scaledHeight - vh) / 2;
                  scale = videoWidth / vw;
                  srcX = boxLeft * scale;
                  srcY = (boxTop + yOffset) * scale;
                  srcWidth = boxSize * scale;
                  srcHeight = boxSize * scale;
                } else {
                  const scaledWidth = vh * videoAspect;
                  const xOffset = (scaledWidth - vw) / 2;
                  scale = videoHeight / vh;
                  srcX = (boxLeft + xOffset) * scale;
                  srcY = boxTop * scale;
                  srcWidth = boxSize * scale;
                  srcHeight = boxSize * scale;
                }

                // Render ROI onto offscreen canvas (350x350)
                const canvas = canvasRef.current;
                if (canvas) {
                  const ctx = canvas.getContext('2d');
                  if (ctx) {
                    ctx.clearRect(0, 0, 350, 350);
                    ctx.drawImage(video, srcX, srcY, srcWidth, srcHeight, 0, 0, 350, 350);

                    decodingRef.current = true;
                    detector.detect(canvas)
                      .then((barcodes: any[]) => {
                        decodingRef.current = false;
                        if (barcodes && barcodes.length > 0) {
                          handleScanSuccess(barcodes[0].rawValue);
                        }
                      })
                      .catch(() => {
                        decodingRef.current = false;
                      });
                  }
                }
              }
            } catch (err) {
              decodingRef.current = false;
            }
          }
        }
      }

      if (mountedRef.current && streamRef.current && !detectedRef.current) {
        rafRef.current = requestAnimationFrame(tick);
      }
    };

    rafRef.current = requestAnimationFrame(tick);
  };

  // Path B: Fallback to html5-qrcode's streaming engine
  const startHtml5QrcodeFallback = async () => {
    try {
      const scannerId = "camera-reader";
      const element = document.getElementById(scannerId);
      if (!element) {
        throw new Error("عنصر الكاميرا غير متوفر.");
      }

      if (html5QrCodeRef.current) {
        const prevScanner = html5QrCodeRef.current;
        html5QrCodeRef.current = null;
        try {
          if (prevScanner.isScanning) {
            await prevScanner.stop();
          }
        } catch (e) {}
      }

      const scanner = new Html5Qrcode(scannerId);
      html5QrCodeRef.current = scanner;

      const qrBoxConfig = (width: number, height: number) => {
        const minSize = Math.min(width, height);
        const boxSize = Math.floor(minSize * 0.76);
        const finalSize = Math.min(boxSize, 330);
        return { width: finalSize, height: finalSize };
      };

      await scanner.start(
        { facingMode: facingRef.current === 'rear' ? "environment" : "user" },
        { fps: 8, qrbox: qrBoxConfig },
        (decodedText) => {
          handleScanSuccess(decodedText);
        },
        () => {}
      );

      if (mountedRef.current) {
        setScannerStatus('scanning');
      }
    } catch (err: any) {
      console.error("Fallback scanner start failed:", err);
      if (mountedRef.current) {
        let errMsg = "تعذر تشغيل الكاميرا.";
        let status: typeof scannerStatus = 'unavailable';
        if (err.name === "NotAllowedError" || err.message?.includes("Permission denied")) {
          errMsg = "لم يتم السماح لسند باستخدام الكاميرا.";
          status = 'permission_denied';
        }
        setCameraError(errMsg);
        setScannerStatus(status);
      }
    }
  };

  // Global handler for successful decode results
  const handleScanSuccess = async (decodedText: string) => {
    if (detectedRef.current) return;

    const token = extractPublicToken(decodedText);
    if (token) {
      detectedRef.current = true;
      setScannerStatus('detected');
      navigator.vibrate?.(70);

      // Instantly shut down the camera stream to turn off indicators on Android
      await stopCameraOnly();

      // Short UI hold before routing
      setTimeout(() => {
        onNavigateToDetails(token);
      }, 300);
    } else {
      // Cooldown check for invalid/unsupported QRs
      const now = Date.now();
      if (
        lastInvalidValueRef.current === decodedText &&
        now - lastInvalidTimeRef.current < 2000
      ) {
        return; // Skip decoding/alerting on the same code within 2 seconds
      }

      // Record invalid value and trigger warning
      lastInvalidValueRef.current = decodedText;
      lastInvalidTimeRef.current = now;

      setScannerStatus('invalid');
      // Very short single vibration (30ms)
      navigator.vibrate?.(30);

      // Display warning for exactly 1000ms (within 800-1200ms range)
      setTimeout(() => {
        if (mountedRef.current && !detectedRef.current) {
          setScannerStatus('scanning');
        }
      }, 1000);
    }
  };

  // Flashlight toggle
  const toggleFlash = async () => {
    const track = getActiveTrack();
    if (!track) return;

    try {
      const nextFlashState = !isFlashOn;
      await track.applyConstraints({
        advanced: [{ torch: nextFlashState } as any]
      });
      setIsFlashOn(nextFlashState);
    } catch (err) {
      console.warn("Failed to toggle torch:", err);
    }
  };

  // Camera switcher
  const switchCamera = async () => {
    if (startingRef.current) return;

    const nextFacing = facingRef.current === 'rear' ? 'front' : 'rear';
    facingRef.current = nextFacing;
    setLogicalFacing(nextFacing);

    if (isFlashOn) {
      try {
        const track = getActiveTrack();
        if (track) {
          await track.applyConstraints({ advanced: [{ torch: false } as any] });
        }
      } catch (e) {}
      setIsFlashOn(false);
    }

    await startCamera(nextFacing);
  };

  // Helper to extract active MediaStreamTrack in both paths
  const getActiveTrack = (): MediaStreamTrack | null => {
    if (streamRef.current) {
      return streamRef.current.getVideoTracks()[0] || null;
    }
    const video = document.querySelector('#camera-reader video') as HTMLVideoElement;
    if (video && video.srcObject instanceof MediaStream) {
      return video.srcObject.getVideoTracks()[0] || null;
    }
    return null;
  };

  // Check and register active track capabilities (flash support)
  const checkCapabilities = () => {
    const track = getActiveTrack();
    if (track) {
      try {
        const caps: any = track.getCapabilities?.();
        setHasFlash(!!(caps && 'torch' in caps));
      } catch (e) {
        setHasFlash(false);
      }
    } else {
      setHasFlash(false);
    }
  };

  // Polling checks for flashlight hardware capabilities while scanning
  useEffect(() => {
    if (scannerStatus === 'scanning') {
      const timer = setTimeout(() => {
        checkCapabilities();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [scannerStatus]);

  // Unified camera switch trigger
  useEffect(() => {
    if (isCameraActive) {
      startCamera();
    } else {
      stopCameraOnly();
    }
    return () => {
      stopCameraOnly();
    };
  }, [isCameraActive]);

  // Synchronize direct camera mode
  useEffect(() => {
    if (directCameraOnly) {
      setIsCameraActive(true);
    }
  }, [directCameraOnly]);

  // Visibility state change observer for app pause/resume behavior
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        stopCameraOnly();
        visibilityRestartRef.current = true;
      } else if (document.visibilityState === 'visible') {
        if (
          visibilityRestartRef.current &&
          mountedRef.current &&
          isCameraActive &&
          !startingRef.current &&
          !streamRef.current &&
          !detectedRef.current &&
          scannerStatus !== 'permission_denied'
        ) {
          visibilityRestartRef.current = false;
          startCamera();
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isCameraActive, scannerStatus]);

  // File image picker decoding
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

  // IMMERSIVE FULL-SCREEN CAMERA SCANNER VIEW
  if (isCameraActive) {
    const isBarcodeDetectorSupported = typeof window !== 'undefined' && 'BarcodeDetector' in window;

    return (
      <div className="fixed inset-0 w-screen h-[100dvh] bg-black z-[100] flex flex-col justify-between overflow-hidden select-none" id="immersive-scanner-view">
        <style>{`
          @keyframes scanLaser {
            0%, 100% { top: 6%; opacity: 0.8; }
            50% { top: 92%; opacity: 1; }
          }
          .animate-scan-laser {
            animation: scanLaser 2.2s ease-in-out infinite;
          }
          #camera-reader {
            width: 100% !important;
            height: 100% !important;
          }
          #camera-reader video {
            width: 100% !important;
            height: 100% !important;
            object-fit: cover !important;
          }
          #camera-reader__header_message, #camera-reader__scan_region {
            display: none !important;
          }
        `}</style>

        {/* Temporary Off-screen and Canvas Helpers */}
        <div id="file-qr-reader-temp" className="hidden" />
        <canvas ref={canvasRef} width={350} height={350} className="hidden" />

        {/* Viewport Camera Stream */}
        <div className="absolute inset-0 bg-black overflow-hidden">
          {isBarcodeDetectorSupported ? (
            <video
              ref={videoRef}
              className="w-full h-full object-cover bg-black"
              playsInline
              muted
              autoPlay
            />
          ) : (
            <div id="camera-reader" className="w-full h-full bg-black" />
          )}
        </div>

        {/* Gradients overlays for text/controls contrast */}
        <div className="absolute top-0 left-0 right-0 h-32 bg-gradient-to-b from-black/80 to-transparent pointer-events-none z-10" />
        <div className="absolute bottom-0 left-0 right-0 h-40 bg-gradient-to-t from-black/90 to-transparent pointer-events-none z-10" />

        {/* Header Bar */}
        <div className="absolute top-0 left-0 right-0 px-4 py-4 z-20 flex items-center justify-between pointer-events-none" style={{ paddingTop: 'calc(1rem + env(safe-area-inset-top, 0px))' }}>
          <button
            type="button"
            onClick={handleCancel}
            aria-label="إغلاق الكاميرا"
            className="pointer-events-auto w-11 h-11 rounded-full bg-black/40 hover:bg-black/60 border border-white/10 flex items-center justify-center text-white transition-all active:scale-95 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="text-right">
            <h2 className="text-sm font-bold text-white font-arabic">مسح رمز QR</h2>
            <p className="text-[10px] text-white/70 font-arabic mt-0.5">
              وجّه الكاميرا نحو الرمز
            </p>
          </div>
        </div>

        {/* Center viewfinder cutout */}
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-10">
          <div
            className="relative rounded-[28px] pointer-events-auto shadow-[0_0_0_9999px_rgba(0,0,0,0.6)]"
            style={{
              width: 'min(76vw, 330px)',
              height: 'min(76vw, 330px)'
            }}
          >
            {/* Glowing borders */}
            <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-emerald-500 rounded-tl-[24px]" />
            <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-emerald-500 rounded-tr-[24px]" />
            <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-emerald-500 rounded-bl-[24px]" />
            <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-emerald-500 rounded-br-[24px]" />

            {/* Scanning line indicator */}
            {scannerStatus === 'scanning' && (
              <div className="absolute left-4 right-4 h-0.5 bg-emerald-500 shadow-[0_0_8px_#10b981] animate-scan-laser" />
            )}
          </div>
        </div>

        {/* Bottom panel */}
        <div className="absolute bottom-0 left-0 right-0 px-6 pb-6 z-20 flex flex-col items-center gap-4 pointer-events-none" style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom, 0px))' }}>
          {/* Controls */}
          <div className="flex gap-4 pointer-events-auto">
            {hasFlash && (
              <button
                type="button"
                onClick={toggleFlash}
                disabled={isStarting || isDiscovering}
                aria-label="تشغيل الفلاش"
                className={`w-11 h-11 rounded-full border transition-all flex items-center justify-center cursor-pointer ${
                  isFlashOn
                    ? 'bg-emerald-500 border-emerald-400 text-white'
                    : 'bg-black/40 border-white/10 hover:bg-black/60 text-white'
                } ${(isStarting || isDiscovering) ? 'opacity-40 pointer-events-none' : ''}`}
              >
                <Zap className="w-4 h-4" />
              </button>
            )}

            {hasSwitchOption && (
              <button
                type="button"
                onClick={switchCamera}
                disabled={isStarting || isDiscovering}
                aria-label="تبديل الكاميرا"
                className={`w-11 h-11 rounded-full bg-black/40 border border-white/10 flex items-center justify-center text-white transition-all active:scale-95 cursor-pointer ${
                  (isStarting || isDiscovering) ? 'opacity-40 pointer-events-none' : 'hover:bg-black/60'
                }`}
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Status Display Card */}
          <div className="pointer-events-auto w-full max-w-[280px] bg-black/70 backdrop-blur-md border border-white/10 rounded-2xl p-3 flex flex-col items-center text-center">
            <span className="text-xs font-arabic text-white/90 font-medium">
              {scannerStatus === 'initializing' && (isDiscovering ? "جاري فحص وتحديد أفضل كاميرا..." : "جاري تشغيل الكاميرا...")}
              {scannerStatus === 'scanning' && "جاري البحث عن رمز QR..."}
              {scannerStatus === 'detected' && "تم العثور على الرمز"}
              {scannerStatus === 'invalid' && "رمز QR غير مدعوم"}
              {scannerStatus === 'permission_denied' && "لم يتم السماح لسند باستخدام الكاميرا."}
              {scannerStatus === 'unavailable' && "تعذر تشغيل الكاميرا."}
            </span>

            {(scannerStatus === 'permission_denied' || scannerStatus === 'unavailable' || cameraError) && (
              <div className="w-full mt-3 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => startCamera()}
                  disabled={isStarting || isDiscovering}
                  className={`w-full bg-white hover:bg-slate-100 text-black font-bold py-2 rounded-xl text-[11px] font-arabic transition-all cursor-pointer ${
                    (isStarting || isDiscovering) ? 'opacity-50 pointer-events-none' : ''
                  }`}
                >
                  إعادة المحاولة
                </button>
                <button
                  type="button"
                  onClick={handleCancel}
                  className="w-full bg-white/10 hover:bg-white/20 text-white border border-white/10 font-bold py-2 rounded-xl text-[11px] font-arabic transition-all cursor-pointer"
                >
                  العودة
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // DEFAULT VIEW (IMAGE SELECTOR & MANUAL INPUTS)
  return (
    <div className="space-y-5" id="verify_notice_view">
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

        <div className="space-y-3" id="inactive_camera_panel">
          {cameraError && (
            <div className="flex items-start gap-2 text-xs text-rose-600 bg-rose-50 p-3 rounded-2xl border border-rose-100 text-right">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-500 mt-0.5" />
              <span>{cameraError}</span>
            </div>
          )}

          <button
            type="button"
            onClick={() => setIsCameraActive(true)}
            className="w-full bg-[#111111] hover:bg-black text-white font-bold py-3 px-4 rounded-2xl flex items-center justify-center gap-2 transition-all cursor-pointer shadow-sm text-xs font-arabic"
          >
            <Camera className="w-4 h-4 text-white" />
            <span>تشغيل الكاميرا للمسح المباشر</span>
          </button>
        </div>
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
              className={`absolute left-1.5 top-1/2 -translate-y-1/2 h-7 px-2.5 rounded-lg font-bold text-[10px] flex items-center gap-1 transition-all cursor-pointer ${
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

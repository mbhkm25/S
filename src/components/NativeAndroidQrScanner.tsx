import { useEffect, useRef, useState } from 'react';
import { Loader2, ScanLine, X } from 'lucide-react';
import DirectQrScanner from './DirectQrScanner';
import { toLatinDigits } from '../lib/digits';

interface Props {
  onNavigateToDetails: (token: string) => void;
  onCancel: () => void;
}

type NativeResult = {
  status?: 'success' | 'cancelled' | 'error';
  value?: string;
  message?: string;
};

declare global {
  interface Window {
    AndroidQrScanner?: {
      startScan: () => void;
    };
  }
}

const TOKEN_REGEX = /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/;

function extractToken(value: string): string | null {
  return toLatinDigits(value || '').match(TOKEN_REGEX)?.[0] || null;
}

export default function NativeAndroidQrScanner({ onNavigateToDetails, onCancel }: Props) {
  const [useWebFallback, setUseWebFallback] = useState(!window.AndroidQrScanner);
  const [message, setMessage] = useState('جارٍ فتح ماسح Android الأصلي…');
  const launchedRef = useRef(false);

  useEffect(() => {
    if (!window.AndroidQrScanner || useWebFallback || launchedRef.current) return;
    launchedRef.current = true;

    const handleResult = (event: Event) => {
      const result = (event as CustomEvent<NativeResult>).detail || {};
      if (result.status === 'cancelled') {
        onCancel();
        return;
      }
      if (result.status === 'success' && result.value) {
        const token = extractToken(result.value);
        if (token) {
          onNavigateToDetails(token);
          return;
        }
        setMessage('الرمز المقروء لا يحتوي على رابط عملية سند. سيتم فتح الماسح الاحتياطي.');
        setUseWebFallback(true);
        return;
      }
      setMessage(result.message || 'تعذر تشغيل ماسح Android الأصلي. سيتم فتح الماسح الاحتياطي.');
      setUseWebFallback(true);
    };

    window.addEventListener('sanadNativeQrResult', handleResult);
    try {
      window.AndroidQrScanner.startScan();
    } catch {
      setUseWebFallback(true);
    }

    return () => window.removeEventListener('sanadNativeQrResult', handleResult);
  }, [onCancel, onNavigateToDetails, useWebFallback]);

  if (useWebFallback) {
    return <DirectQrScanner onNavigateToDetails={onNavigateToDetails} onCancel={onCancel} />;
  }

  return (
    <section className="fixed inset-0 z-[2147483647] grid h-[100dvh] place-items-center bg-slate-950 px-6 text-white" dir="rtl">
      <button
        type="button"
        onClick={onCancel}
        className="absolute right-4 top-[max(1rem,env(safe-area-inset-top))] flex h-12 w-12 items-center justify-center rounded-full bg-white/10"
        aria-label="إغلاق الماسح"
      >
        <X className="h-6 w-6" />
      </button>
      <div className="flex max-w-xs flex-col items-center text-center">
        <span className="mb-5 grid h-20 w-20 place-items-center rounded-3xl bg-emerald-500/15 text-emerald-300">
          <ScanLine className="h-10 w-10" />
        </span>
        <Loader2 className="mb-4 h-6 w-6 animate-spin text-emerald-300" />
        <p className="text-sm font-bold">{message}</p>
        <p className="mt-2 text-xs leading-6 text-slate-300">يستخدم سند ماسح Android الأصلي مع التركيز والتكبير التلقائي.</p>
      </div>
    </section>
  );
}

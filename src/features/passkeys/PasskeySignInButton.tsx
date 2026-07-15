import { useEffect, useRef, useState } from 'react';
import { Fingerprint, Loader2 } from 'lucide-react';
import { signInWithPasskey } from './passkeyApi';
import { isPasskeySupported } from './passkeySupport';

interface PasskeySignInButtonProps {
  onError: (message: string) => void;
}

export default function PasskeySignInButton({ onError }: PasskeySignInButtonProps) {
  const [supported, setSupported] = useState(false);
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const inFlightRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    void isPasskeySupported().then((result) => {
      if (mountedRef.current) setSupported(result.status === 'supported');
    });
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
    };
  }, []);

  if (!supported) return null;

  const handleSignIn = async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setLoading(true);
    onError('');
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      await signInWithPasskey(controller.signal);
      // Supabase dispatches SIGNED_IN; App.onAuthStateChange is the sole session/bootstrap owner.
    } catch (error) {
      if (mountedRef.current) {
        onError(error instanceof Error ? error.message : 'تعذر تسجيل الدخول بالبصمة.');
      }
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      inFlightRef.current = false;
      if (mountedRef.current) setLoading(false);
    }
  };

  return (
    <div className="mb-5 space-y-4">
      <button
        type="button"
        onClick={handleSignIn}
        disabled={loading}
        className="w-full min-h-12 rounded-xl border border-slate-300 bg-white text-slate-900 text-sm font-bold flex items-center justify-center gap-2 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:opacity-60"
      >
        {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Fingerprint className="w-5 h-5" />}
        <span>{loading ? 'جاري التحقق...' : 'الدخول بالبصمة'}</span>
      </button>
      <div className="flex items-center gap-3 text-[11px] text-slate-400" aria-hidden="true">
        <span className="h-px flex-1 bg-slate-200" />
        <span>أو</span>
        <span className="h-px flex-1 bg-slate-200" />
      </div>
    </div>
  );
}

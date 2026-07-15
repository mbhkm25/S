import { useState } from 'react';
import { enablePushNotifications } from './pushSubscription';
import { reportPushError } from './pushErrors';

const COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;

export function getPromptDismissal(userId: string, now = Date.now()): number | null {
  const key = `sanad:push-prompt-dismissed:${userId}`;
  let raw: string | null;
  try {
    raw = localStorage.getItem(key);
  } catch {
    return null;
  }
  if (!raw) return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0 || value > now) {
    try { localStorage.removeItem(key); } catch { /* Storage can be unavailable in private contexts. */ }
    return null;
  }
  if (now - value >= COOLDOWN_MS) {
    try { localStorage.removeItem(key); } catch { /* Storage can be unavailable in private contexts. */ }
    return null;
  }
  return value;
}

interface PushPermissionPromptProps {
  userId: string;
  onDone?: () => void;
}

export default function PushPermissionPrompt({ userId, onDone }: PushPermissionPromptProps) {
  const [hidden, setHidden] = useState(() => getPromptDismissal(userId) !== null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (hidden || typeof Notification === 'undefined' || Notification.permission !== 'default') return null;

  const dismiss = () => {
    try {
      localStorage.setItem(`sanad:push-prompt-dismissed:${userId}`, String(Date.now()));
    } catch { /* Dismiss for this render even when storage is unavailable. */ }
    setHidden(true);
  };

  const enable = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await enablePushNotifications();
      setHidden(true);
      onDone?.();
    } catch (caught) {
      setError(reportPushError(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <aside className="rounded-3xl border border-slate-200 bg-white p-4 text-right shadow-2xs space-y-3">
      <div>
        <h3 className="text-sm font-bold text-slate-800">فعّل إشعارات الجوال</h3>
        <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
          استقبل تنبيهات العمليات والتقارير والتحديثات المهمة حتى عندما يكون سند مغلقًا.
        </p>
      </div>
      {error && <p className="text-[11px] text-rose-700">{error}</p>}
      <div className="grid grid-cols-2 gap-2">
        <button type="button" disabled={busy} onClick={() => void enable()} className="min-h-12 rounded-2xl bg-slate-900 text-xs font-bold text-white focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:opacity-50">
          {busy ? 'جاري التفعيل...' : 'تفعيل الآن'}
        </button>
        <button type="button" disabled={busy} onClick={dismiss} className="min-h-12 rounded-2xl border border-slate-200 text-xs font-bold text-slate-600 focus-visible:ring-2 focus-visible:ring-slate-400 disabled:opacity-50">
          ليس الآن
        </button>
      </div>
    </aside>
  );
}

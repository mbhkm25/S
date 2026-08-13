import { supabase } from '../../lib/supabase';
import { refreshCompleteDeviceLedger } from './deviceOperationLedger';
import { drainLocalSyncQueue } from './syncEngine';

let refreshPromise: Promise<void> | null = null;

async function refreshActiveUserLedger(): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    const { data: { session } } = await supabase.auth.getSession();
    const userId = session?.user?.id;
    if (!userId) return;

    await drainLocalSyncQueue();
    await refreshCompleteDeviceLedger(userId);
  })().catch((error) => {
    console.warn('SANAD device ledger background refresh failed', error);
  }).finally(() => {
    refreshPromise = null;
  });

  return refreshPromise;
}

export function installDeviceLedgerRuntime(): () => void {
  if (typeof window === 'undefined') return () => undefined;

  const onOnline = () => void refreshActiveUserLedger();
  const onVisibility = () => {
    if (document.visibilityState === 'visible' && navigator.onLine !== false) void refreshActiveUserLedger();
  };

  const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
    if (session?.user && navigator.onLine !== false) void refreshActiveUserLedger();
  });

  window.addEventListener('online', onOnline);
  document.addEventListener('visibilitychange', onVisibility);
  if (navigator.onLine !== false) void refreshActiveUserLedger();

  return () => {
    subscription.unsubscribe();
    window.removeEventListener('online', onOnline);
    document.removeEventListener('visibilitychange', onVisibility);
  };
}

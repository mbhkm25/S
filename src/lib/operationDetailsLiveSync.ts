import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from './supabase';

export type OperationLiveSyncState = 'idle' | 'connecting' | 'live' | 'fallback' | 'error';

const PENDING_AI_STATUSES = new Set([
  'pending',
  'queued',
  'processing',
  'running',
  'analyzing',
  'uploaded',
  'received'
]);

export function isOperationAnalysisPending(operation: any): boolean {
  if (!operation) return false;
  const aiStatus = String(operation.ai_status || '').trim().toLowerCase();
  const status = String(operation.status || '').trim().toLowerCase();
  if (PENDING_AI_STATUSES.has(aiStatus)) return true;
  if (!aiStatus && PENDING_AI_STATUSES.has(status)) return true;
  return false;
}

interface Options {
  operationId?: string | null;
  pending: boolean;
  onRefresh: () => Promise<void>;
  pollIntervalMs?: number;
}

export function useOperationDetailsLiveSync({
  operationId,
  pending,
  onRefresh,
  pollIntervalMs = 6000
}: Options) {
  const [state, setState] = useState<OperationLiveSyncState>('idle');
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const refreshRef = useRef(onRefresh);
  const inFlightRef = useRef(false);
  const queuedRef = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    refreshRef.current = onRefresh;
  }, [onRefresh]);

  const refresh = useCallback(async () => {
    if (inFlightRef.current) {
      queuedRef.current = true;
      return;
    }
    inFlightRef.current = true;
    try {
      await refreshRef.current();
      setLastSyncedAt(new Date());
    } finally {
      inFlightRef.current = false;
      if (queuedRef.current) {
        queuedRef.current = false;
        void refresh();
      }
    }
  }, []);

  const scheduleRefresh = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => void refresh(), 350);
  }, [refresh]);

  useEffect(() => {
    if (!operationId) {
      setState('idle');
      return;
    }

    let disposed = false;
    setState('connecting');

    const channel = supabase
      .channel(`operation-details:${operationId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'operations',
          filter: `id=eq.${operationId}`
        },
        () => scheduleRefresh()
      )
      .subscribe((status) => {
        if (disposed) return;
        if (status === 'SUBSCRIBED') setState('live');
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') setState('fallback');
        else if (status === 'CLOSED') setState(pending ? 'fallback' : 'idle');
      });

    const handleResume = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    const handleFocus = () => void refresh();

    document.addEventListener('visibilitychange', handleResume);
    window.addEventListener('focus', handleFocus);

    const pollTimer = pending
      ? window.setInterval(() => {
          if (document.visibilityState === 'visible') void refresh();
        }, pollIntervalMs)
      : null;

    return () => {
      disposed = true;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (pollTimer !== null) window.clearInterval(pollTimer);
      document.removeEventListener('visibilitychange', handleResume);
      window.removeEventListener('focus', handleFocus);
      void supabase.removeChannel(channel);
      setState('idle');
    };
  }, [operationId, pending, pollIntervalMs, refresh, scheduleRefresh]);

  return {
    state,
    lastSyncedAt,
    refreshNow: refresh
  };
}

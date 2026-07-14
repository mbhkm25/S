import React, { createContext, useState, useEffect, useRef, useCallback, useMemo, ReactNode } from 'react';
import { getUnreadCount } from './notificationApi';

export type UnreadCountStatus = 'idle' | 'loading' | 'ready' | 'error';

interface NotificationContextProps {
  unreadCount: number;
  unreadCountStatus: UnreadCountStatus;
  refreshUnreadCount: () => Promise<void>;
  decrementUnreadCount: () => void;
  resetUnreadCount: () => void;
  markAllReadGlobally: () => void;
}

export const NotificationContext = createContext<NotificationContextProps | undefined>(undefined);

interface NotificationProviderProps {
  children: ReactNode;
  userId: string | null;
  isAuthenticated: boolean;
}

export function NotificationProvider({ children, userId, isAuthenticated }: NotificationProviderProps) {
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [unreadCountStatus, setUnreadCountStatus] = useState<UnreadCountStatus>('idle');
  
  const currentUserIdRef = useRef<string | null>(userId);
  const activeRequestGenRef = useRef<number>(0);

  // Sync ref to current userId
  useEffect(() => {
    currentUserIdRef.current = userId;
  }, [userId]);

  // Fetch count function with user verification and request generation check
  const refreshUnreadCount = useCallback(async () => {
    if (!isAuthenticated || !userId) {
      setUnreadCount(0);
      setUnreadCountStatus('idle');
      return;
    }

    const currentGen = ++activeRequestGenRef.current;
    setUnreadCountStatus('loading');

    try {
      const count = await getUnreadCount();
      
      // Prevent stale state updates if userId changed or new request superseded this one
      if (currentUserIdRef.current === userId && currentGen === activeRequestGenRef.current) {
        setUnreadCount(count);
        setUnreadCountStatus('ready');
      }
    } catch (err) {
      if (currentUserIdRef.current === userId && currentGen === activeRequestGenRef.current) {
        setUnreadCountStatus('error');
      }
    }
  }, [userId, isAuthenticated]);

  // Decrement by 1 (clamped to 0)
  const decrementUnreadCount = useCallback(() => {
    setUnreadCount(prev => Math.max(0, prev - 1));
  }, []);

  // Reset/Clear count completely
  const resetUnreadCount = useCallback(() => {
    setUnreadCount(0);
  }, []);

  // Mark all read globally (optimistically set count to 0)
  const markAllReadGlobally = useCallback(() => {
    setUnreadCount(0);
  }, []);

  // Handle session change: fetch count or reset state
  useEffect(() => {
    if (isAuthenticated && userId) {
      refreshUnreadCount();
    } else {
      // Clear all state when logging out
      setUnreadCount(0);
      setUnreadCountStatus('idle');
      activeRequestGenRef.current++;
    }
  }, [userId, isAuthenticated, refreshUnreadCount]);

  const contextValue = useMemo(() => ({
    unreadCount,
    unreadCountStatus,
    refreshUnreadCount,
    decrementUnreadCount,
    resetUnreadCount,
    markAllReadGlobally
  }), [
    unreadCount,
    unreadCountStatus,
    refreshUnreadCount,
    decrementUnreadCount,
    resetUnreadCount,
    markAllReadGlobally
  ]);

  return (
    <NotificationContext.Provider value={contextValue}>
      {children}
    </NotificationContext.Provider>
  );
}

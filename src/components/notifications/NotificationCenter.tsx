import React, { useState, useEffect, useRef } from 'react';
import { 
  Bell, 
  CheckCheck, 
  WifiOff, 
  ChevronLeft, 
  AlertCircle,
  RefreshCw
} from 'lucide-react';
import { 
  getNotifications, 
  markNotificationRead, 
  markAllNotificationsRead, 
  archiveNotification 
} from '../../features/notifications/notificationApi';
import { handleNotificationAction } from '../../features/notifications/notificationActions';
import { useNotifications } from '../../features/notifications/useNotifications';
import { NotificationItem, NotificationCursor } from '../../features/notifications/types';
import NotificationItemComponent from './NotificationItem';
import { NotificationListSkeleton } from '../Skeletons';

interface NotificationCenterProps {
  userId: string | null;
  onNavigate: (page: string, token?: string, source?: 'link' | 'qr' | 'search' | 'app') => void;
}

export default function NotificationCenter({ userId, onNavigate }: NotificationCenterProps) {
  const { 
    unreadCount, 
    decrementUnreadCount, 
    refreshUnreadCount, 
    markAllReadGlobally 
  } = useNotifications();

  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadOnlyFilter, setUnreadOnlyFilter] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<NotificationCursor | null>(null);
  
  // Connection states
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  
  // Double-click mutation guards using Refs
  const pendingReadIdsRef = useRef(new Set<string>());
  const pendingArchiveIdsRef = useRef(new Set<string>());
  const [pendingReadIds, setPendingReadIds] = useState<Set<string>>(new Set());
  const [pendingArchiveIds, setPendingArchiveIds] = useState<Set<string>>(new Set());

  // Error handling
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [actionInProgress, setActionInProgress] = useState(false);

  // Request cancellation / race condition guard
  const requestGenRef = useRef(0);

  // Account switch protection refs
  const activeUserIdRef = useRef<string | null>(userId);
  const mountedRef = useRef(true);

  // Synchronously update activeUserIdRef during render
  activeUserIdRef.current = userId;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      requestGenRef.current++;
    };
  }, []);

  // Track online/offline status
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Fetch initial page with generation check
  const fetchInitialNotifications = async (unreadOnly: boolean) => {
    if (!navigator.onLine) {
      setIsOnline(false);
      setLoading(false);
      return;
    }

    const currentGen = ++requestGenRef.current;
    const requestUserId = userId;
    setLoading(true);
    setGlobalError(null);
    setLocalError(null);

    try {
      const response = await getNotifications({
        limit: 20,
        cursor: null,
        unreadOnly
      });

      if (mountedRef.current && activeUserIdRef.current === requestUserId && currentGen === requestGenRef.current) {
        setNotifications(response.items);
        setHasMore(response.has_more);
        setNextCursor(response.next_cursor);
        setLoading(false);
      }
    } catch (err) {
      if (mountedRef.current && activeUserIdRef.current === requestUserId && currentGen === requestGenRef.current) {
        const errMsg = err instanceof Error ? err.message : '';
        setGlobalError(errMsg || 'تعذر تحميل الإشعارات.');
        setLoading(false);
      }
    }
  };

  // Fetch more items with race condition guards
  const fetchMoreNotifications = async () => {
    if (loadingMore || !hasMore || !nextCursor || !isOnline) return;

    const currentGen = requestGenRef.current;
    const requestUserId = userId;
    const currentFilter = unreadOnlyFilter;

    setLoadingMore(true);
    setLocalError(null);

    try {
      const response = await getNotifications({
        limit: 20,
        cursor: nextCursor,
        unreadOnly: unreadOnlyFilter
      });

      if (mountedRef.current && activeUserIdRef.current === requestUserId && requestGenRef.current === currentGen && unreadOnlyFilter === currentFilter) {
        setNotifications(prev => {
          const existingIds = new Set(prev.map(n => n.id));
          const filteredNew = response.items.filter(n => !existingIds.has(n.id));
          return [...prev, ...filteredNew];
        });
        setHasMore(response.has_more);
        setNextCursor(response.next_cursor);
      }
    } catch {
      if (mountedRef.current && activeUserIdRef.current === requestUserId && requestGenRef.current === currentGen && unreadOnlyFilter === currentFilter) {
        setLocalError('تعذر تحميل المزيد من الإشعارات.');
        setTimeout(() => {
          if (mountedRef.current && activeUserIdRef.current === requestUserId && requestGenRef.current === currentGen) {
            setLocalError(null);
          }
        }, 4000);
      }
    } finally {
      if (mountedRef.current && activeUserIdRef.current === requestUserId && requestGenRef.current === currentGen && unreadOnlyFilter === currentFilter) {
        setLoadingMore(false);
      }
    }
  };

  // Unified load trigger on mount, user switch, or filter changes
  useEffect(() => {
    if (userId) {
      fetchInitialNotifications(unreadOnlyFilter);
      refreshUnreadCount();
    } else {
      requestGenRef.current++;
      setNotifications([]);
      setHasMore(false);
      setNextCursor(null);
      setGlobalError(null);
      setLocalError(null);
      setLoadingMore(false);
      setLoading(false);
      setActionInProgress(false);
    }
  }, [userId, unreadOnlyFilter, refreshUnreadCount]);

  // Handle Mark Read on Click
  const handleItemClick = async (item: NotificationItem) => {
    if (pendingReadIdsRef.current.has(item.id) || pendingArchiveIdsRef.current.has(item.id) || !isOnline) return;

    const requestUserId = userId;
    const requestGeneration = requestGenRef.current;
    const isUnread = !item.read_at;

    let mutationSuccess = false;

    if (isUnread) {
      pendingReadIdsRef.current.add(item.id);
      setPendingReadIds(new Set(pendingReadIdsRef.current));

      // Optimistic mark as read
      setNotifications(prev => 
        prev.map(n => n.id === item.id ? { ...n, read_at: new Date().toISOString() } : n)
      );
      decrementUnreadCount();

      try {
        await markNotificationRead(item.id);
        mutationSuccess = true;
      } catch (err) {
        if (mountedRef.current && activeUserIdRef.current === requestUserId && requestGenRef.current === requestGeneration) {
          // Rollback read status
          setNotifications(prev => 
            prev.map(n => n.id === item.id ? { ...n, read_at: null } : n)
          );
          await refreshUnreadCount();
          setLocalError('تعذر تحديث حالة الإشعار كـ مقروء.');
          setTimeout(() => {
            if (mountedRef.current && activeUserIdRef.current === requestUserId && requestGenRef.current === requestGeneration) {
              setLocalError(null);
            }
          }, 4000);
        }
      } finally {
        pendingReadIdsRef.current.delete(item.id);
        if (mountedRef.current && activeUserIdRef.current === requestUserId && requestGenRef.current === requestGeneration) {
          setPendingReadIds(new Set(pendingReadIdsRef.current));
        }
      }
    } else {
      // If already read, mutation is considered "successful" (no-op)
      mutationSuccess = true;
    }

    // Only route navigation if mutation succeeded AND active user/gen matches
    if (mutationSuccess && mountedRef.current && activeUserIdRef.current === requestUserId && requestGenRef.current === requestGeneration) {
      handleNotificationAction(
        item.action_type,
        item.action_payload,
        onNavigate,
        (msg) => {
          if (mountedRef.current && activeUserIdRef.current === requestUserId && requestGenRef.current === requestGeneration) {
            setLocalError(msg);
            setTimeout(() => {
              if (mountedRef.current && activeUserIdRef.current === requestUserId && requestGenRef.current === requestGeneration) {
                setLocalError(null);
              }
            }, 4000);
          }
        }
      );
    }
  };

  // Handle Archive Click
  const handleArchiveClick = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (pendingReadIdsRef.current.has(id) || pendingArchiveIdsRef.current.has(id) || !isOnline) return;

    const requestUserId = userId;
    const requestGeneration = requestGenRef.current;

    const itemIndex = notifications.findIndex(n => n.id === id);
    if (itemIndex === -1) return;
    
    const item = notifications[itemIndex];
    const isUnread = !item.read_at;

    pendingArchiveIdsRef.current.add(id);
    setPendingArchiveIds(new Set(pendingArchiveIdsRef.current));

    // Optimistically remove from list
    setNotifications(prev => prev.filter(n => n.id !== id));
    if (isUnread) {
      decrementUnreadCount();
    }

    try {
      await archiveNotification(id);
    } catch {
      if (mountedRef.current && activeUserIdRef.current === requestUserId && requestGenRef.current === requestGeneration) {
        // Rollback to original index to preserve sorting
        setNotifications(prev => {
          const updated = [...prev];
          updated.splice(itemIndex, 0, item);
          return updated;
        });
        if (isUnread) {
          await refreshUnreadCount();
        }
        setLocalError('تعذر أرشفة الإشعار المطلوب.');
        setTimeout(() => {
          if (mountedRef.current && activeUserIdRef.current === requestUserId && requestGenRef.current === requestGeneration) {
            setLocalError(null);
          }
        }, 4000);
      }
    } finally {
      pendingArchiveIdsRef.current.delete(id);
      if (mountedRef.current && activeUserIdRef.current === requestUserId && requestGenRef.current === requestGeneration) {
        setPendingArchiveIds(new Set(pendingArchiveIdsRef.current));
      }
    }
  };

  // Handle Mark All Read Click
  const handleMarkAllRead = async () => {
    if (unreadCount <= 0 || actionInProgress || !isOnline) return;
    
    const requestUserId = userId;
    const requestGeneration = requestGenRef.current;

    setActionInProgress(true);
    setLocalError(null);

    // Optimistic read status in current view list
    setNotifications(prev => 
      prev.map(n => ({ ...n, read_at: n.read_at || new Date().toISOString() }))
    );
    markAllReadGlobally();

    try {
      await markAllNotificationsRead();

      if (mountedRef.current && activeUserIdRef.current === requestUserId && requestGenRef.current === requestGeneration) {
        // Clear lists if viewing unread only
        if (unreadOnlyFilter) {
          setNotifications([]);
          setHasMore(false);
          setNextCursor(null);
        }
        setActionInProgress(false);
      }
    } catch {
      if (mountedRef.current && activeUserIdRef.current === requestUserId && requestGenRef.current === requestGeneration) {
        // Rollback by reloading list from server
        await fetchInitialNotifications(unreadOnlyFilter);
        await refreshUnreadCount();
        setLocalError('تعذر تحديث جميع الإشعارات كمقروءة.');
        setTimeout(() => {
          if (mountedRef.current && activeUserIdRef.current === requestUserId && requestGenRef.current === requestGeneration) {
            setLocalError(null);
          }
        }, 4000);
        setActionInProgress(false);
      }
    }
  };

  const handleRetry = () => {
    fetchInitialNotifications(unreadOnlyFilter);
    refreshUnreadCount();
  };

  // Filter options toggle
  const toggleFilter = (unread: boolean) => {
    if (unread === unreadOnlyFilter) return;
    requestGenRef.current++; // cancel pending fetches
    setNotifications([]);
    setHasMore(false);
    setNextCursor(null);
    setLoadingMore(false);
    setGlobalError(null);
    setLocalError(null);
    setUnreadOnlyFilter(unread);
  };

  const showMarkAllReadBtn = unreadCount > 0 || notifications.some(n => !n.read_at);

  return (
    <div className="space-y-5 max-w-2xl mx-auto px-1 py-1 pb-16 text-right font-arabic">
      
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-200/50 pb-4">
        <div className="space-y-1">
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2 justify-end">
            <span>الإشعارات</span>
            <Bell className="w-5 h-5 text-slate-600" />
          </h2>
          <p className="text-[11px] text-slate-500 leading-relaxed">
            آخر التحديثات المتعلقة بحسابك وعملياتك
          </p>
        </div>

        {showMarkAllReadBtn && (
          <button
            onClick={handleMarkAllRead}
            disabled={actionInProgress || !isOnline}
            className="self-end sm:self-center bg-slate-100 hover:bg-slate-200 disabled:opacity-50 disabled:hover:bg-slate-100 text-slate-700 font-bold text-[10px] py-2 px-3.5 rounded-2xl transition-all flex items-center gap-1.5 justify-center cursor-pointer"
          >
            <span>تحديد الكل كمقروء</span>
            <CheckCheck className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Floating Error Alert Banner */}
      {localError && (
        <div className="bg-rose-50 border border-rose-100 text-rose-700 p-3 rounded-2xl text-[10px] font-bold flex items-center gap-2 justify-end animate-fade-in">
          <span>{localError}</span>
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
        </div>
      )}

      {/* Connection Offline Indicator */}
      {!isOnline && (
        <div className="bg-amber-50 border border-amber-100 text-amber-800 p-4 rounded-3xl text-center space-y-3">
          <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center mx-auto text-amber-600">
            <WifiOff className="w-5 h-5" />
          </div>
          <div className="space-y-1">
            <h4 className="text-xs font-bold text-slate-800">لا يوجد اتصال بالإنترنت</h4>
            <p className="text-[10px] text-slate-500 leading-normal">
              أنت تتصفح الإشعارات المسجلة حالياً. يرجى التحقق من اتصال الشبكة لتلقي إشعارات جديدة.
            </p>
          </div>
          <button
            onClick={handleRetry}
            className="bg-amber-600 hover:bg-amber-700 text-white font-bold text-[10px] py-1.5 px-4 rounded-xl transition-all cursor-pointer"
          >
            إعادة المحاولة
          </button>
        </div>
      )}

      {/* Segment Filter Tabs */}
      <div className="flex bg-slate-100 p-1 rounded-2xl border border-slate-200/40">
        <button
          onClick={() => toggleFilter(false)}
          className={`flex-1 text-center py-2 text-[11px] font-bold rounded-xl transition-all cursor-pointer ${
            !unreadOnlyFilter 
              ? 'bg-white text-slate-900 shadow-xs' 
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          الكل
        </button>
        <button
          onClick={() => toggleFilter(true)}
          className={`flex-1 text-center py-2 text-[11px] font-bold rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
            unreadOnlyFilter 
              ? 'bg-white text-slate-900 shadow-xs' 
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <span>غير المقروءة</span>
          {unreadCount > 0 && (
            <span className="bg-rose-500 text-white font-black text-[9px] px-1.5 py-0.5 rounded-full leading-none">
              {unreadCount}
            </span>
          )}
        </button>
      </div>

      {/* Global Fetch Error State */}
      {globalError && (
        <div className="bg-white border border-slate-200/60 rounded-3xl p-6 text-center space-y-4 shadow-2xs">
          <div className="w-10 h-10 bg-rose-50 rounded-full flex items-center justify-center mx-auto text-rose-500">
            <AlertCircle className="w-5 h-5" />
          </div>
          <div className="space-y-1">
            <h4 className="text-xs font-bold text-slate-800">{globalError}</h4>
            <p className="text-[10px] text-slate-400 leading-normal">
              يرجى التحقق من الشبكة وإعادة المحاولة مجدداً
            </p>
          </div>
          <button
            onClick={handleRetry}
            className="bg-slate-900 hover:bg-slate-800 text-white font-bold text-[10px] py-2 px-5 rounded-2xl transition-all flex items-center gap-1.5 mx-auto cursor-pointer"
          >
            <span>إعادة المحاولة</span>
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Notifications List */}
      {!globalError && (
        loading ? (
          <NotificationListSkeleton />
        ) : notifications.length === 0 ? (
          <div className="bg-white border border-slate-200/55 rounded-3xl py-12 px-6 text-center space-y-2 shadow-2xs">
            <p className="text-xs font-bold text-slate-700 leading-normal">
              {unreadOnlyFilter ? 'لا توجد إشعارات غير مقروءة' : 'لا توجد إشعارات حتى الآن'}
            </p>
            <p className="text-[10px] text-slate-400 max-w-xs mx-auto leading-relaxed">
              {unreadOnlyFilter 
                ? 'لقد قرأت جميع الإشعارات الواردة، عمل رائع!'
                : 'عند حدوث أي عمليات، ستظهر تحديثاتها وتنبيهاتها هنا فوراً.'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {notifications.map((item) => (
              <NotificationItemComponent
                key={item.id}
                item={item}
                pendingRead={pendingReadIds.has(item.id)}
                pendingArchive={pendingArchiveIds.has(item.id)}
                onItemClick={handleItemClick}
                onArchiveClick={handleArchiveClick}
              />
            ))}

            {/* Pagination Load More Button */}
            {hasMore && (
              <button
                onClick={fetchMoreNotifications}
                disabled={loadingMore || !isOnline}
                className="w-full py-3 bg-white hover:bg-slate-50 border border-slate-200/55 text-slate-600 disabled:opacity-50 font-bold text-[10px] rounded-3xl transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs mt-2"
              >
                {loadingMore ? (
                  <span>جاري التحميل...</span>
                ) : (
                  <>
                    <span>تحميل الإشعارات السابقة</span>
                    <ChevronLeft className="w-4 h-4" />
                  </>
                )}
              </button>
            )}
          </div>
        )
      )}
    </div>
  );
}

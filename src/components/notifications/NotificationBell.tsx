import { Bell } from 'lucide-react';
import { useNotifications } from '../../features/notifications/useNotifications';

interface NotificationBellProps {
  onNavigate: () => void;
}

export default function NotificationBell({ onNavigate }: NotificationBellProps) {
  const { unreadCount } = useNotifications();

  return (
    <button
      onClick={onNavigate}
      className="relative p-2 rounded-xl hover:bg-slate-100/70 text-slate-600 hover:text-slate-900 transition-all flex items-center justify-center min-w-[44px] min-h-[44px] cursor-pointer"
      aria-label="فتح الإشعارات"
      title="الإشعارات"
    >
      <Bell className="w-5.5 h-5.5" />
      {unreadCount > 0 && (
        <span className="absolute top-1 right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[9px] font-black flex items-center justify-center leading-none select-none animate-scale-in">
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      )}
    </button>
  );
}

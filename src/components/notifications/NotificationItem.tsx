import React from 'react';
import { 
  FileText, 
  Sparkles, 
  Users, 
  CreditCard, 
  ShieldAlert, 
  Bell, 
  Archive 
} from 'lucide-react';
import { NotificationItem, NotificationCategory } from '../../features/notifications/types';

interface NotificationItemProps {
  item: NotificationItem;
  pendingRead: boolean;
  pendingArchive: boolean;
  onItemClick: (item: NotificationItem) => Promise<void>;
  onArchiveClick: (id: string, e: React.MouseEvent) => Promise<void>;
}

function formatRelativeTime(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return '';
    
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHr = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHr / 24);

    if (diffSec < 60) return 'الآن';
    
    if (diffMin < 60) {
      if (diffMin === 1) return 'منذ دقيقة';
      if (diffMin === 2) return 'منذ دقيقتين';
      if (diffMin >= 3 && diffMin <= 10) return `منذ ${diffMin} دقائق`;
      return `منذ ${diffMin} دقيقة`;
    }
    
    if (diffHr < 24) {
      if (diffHr === 1) return 'منذ ساعة';
      if (diffHr === 2) return 'منذ ساعتين';
      if (diffHr >= 3 && diffHr <= 10) return `منذ ${diffHr} ساعات`;
      return `منذ ${diffHr} ساعة`;
    }
    
    if (diffDay === 1) return 'أمس';
    if (diffDay === 2) return 'قبل يومين';
    if (diffDay < 7) return `منذ ${diffDay} أيام`;
    
    return new Intl.DateTimeFormat('ar-YE', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    }).format(date);
  } catch (err) {
    return '';
  }
}

function getCategoryIcon(category: NotificationCategory) {
  const sizeClass = "w-5 h-5";
  switch (category) {
    case 'operations':
      return {
        icon: <FileText className={sizeClass} />,
        bg: 'bg-emerald-50 text-emerald-600 border-emerald-100/50'
      };
    case 'reports':
      return {
        icon: <Sparkles className={sizeClass} />,
        bg: 'bg-violet-50 text-violet-600 border-violet-100/50'
      };
    case 'business':
      return {
        icon: <Users className={sizeClass} />,
        bg: 'bg-blue-50 text-blue-600 border-blue-100/50'
      };
    case 'subscription':
      return {
        icon: <CreditCard className={sizeClass} />,
        bg: 'bg-amber-50 text-amber-600 border-amber-100/50'
      };
    case 'security':
      return {
        icon: <ShieldAlert className={sizeClass} />,
        bg: 'bg-rose-50 text-rose-600 border-rose-100/50'
      };
    default:
      return {
        icon: <Bell className={sizeClass} />,
        bg: 'bg-slate-50 text-slate-600 border-slate-100/50'
      };
  }
}

const NotificationItemComponent: React.FC<NotificationItemProps> = ({ 
  item, 
  pendingRead,
  pendingArchive,
  onItemClick, 
  onArchiveClick 
}) => {
  const isUnread = !item.read_at;
  const { icon, bg } = getCategoryIcon(item.category);
  const hasAction = item.action_type !== 'none';

  const handleClick = () => {
    // Prevent action click if read or archive operation is in progress
    if (pendingRead || pendingArchive) return;
    
    // Unread items can always be clicked to mark them read (even if action_type is none)
    if (isUnread || hasAction) {
      onItemClick(item);
    }
  };

  const handleArchive = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (pendingRead || pendingArchive) return;
    onArchiveClick(item.id, e);
  };

  // Unread items and items with actions are clickable
  const isClickable = isUnread || hasAction;

  return (
    <div 
      onClick={handleClick}
      className={`group relative p-4 rounded-3xl border transition-all text-right select-none flex items-start gap-3.5 ${
        isUnread 
          ? 'bg-white border-slate-200/80 shadow-xs ring-1 ring-slate-100/30' 
          : 'bg-slate-50/50 border-slate-100 text-slate-600 hover:bg-slate-50'
      } ${isClickable ? 'cursor-pointer hover:border-slate-300/80 hover:shadow-xs' : ''} ${
        (pendingRead || pendingArchive) ? 'opacity-60 pointer-events-none' : ''
      }`}
    >
      {/* Unread indicator dot */}
      {isUnread && (
        <span className="absolute top-4 left-4 w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
      )}

      {/* Category Icon Container */}
      <div className={`w-10 h-10 rounded-2xl flex items-center justify-center border shrink-0 ${bg}`}>
        {icon}
      </div>

      {/* Title & Body */}
      <div className="flex-1 min-w-0 space-y-1 pl-6">
        <div className="flex items-center gap-2">
          <h4 className={`text-xs font-bold font-arabic leading-snug truncate ${isUnread ? 'text-slate-900' : 'text-slate-600'}`}>
            {item.title}
          </h4>
        </div>
        <p className="text-[11px] text-slate-500 font-arabic leading-relaxed break-words whitespace-pre-line">
          {item.body}
        </p>
        <span className="text-[9px] text-slate-400 font-arabic block pt-0.5">
          {formatRelativeTime(item.created_at)}
        </span>
      </div>

      {/* Action panel (Archive) */}
      <div className="flex flex-col gap-1 items-end justify-between self-stretch shrink-0">
        <button
          onClick={handleArchive}
          disabled={pendingRead || pendingArchive}
          className="p-1.5 rounded-xl hover:bg-rose-50 text-slate-400 hover:text-rose-500 disabled:opacity-30 disabled:hover:bg-transparent transition-colors cursor-pointer"
          title="أرشفة"
          aria-label="أرشفة الإشعار"
        >
          <Archive className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

export default NotificationItemComponent;

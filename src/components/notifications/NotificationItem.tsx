import React from 'react';
import {
  Archive,
  Bell,
  Building2,
  CreditCard,
  FileText,
  Megaphone,
  ShieldAlert,
  Sparkles
} from 'lucide-react';
import type { NotificationCategory, NotificationItem, NotificationSeverity } from '../../features/notifications/types';
import { toLatinDigits } from '../../lib/digits';

interface NotificationItemProps {
  item: NotificationItem;
  pendingRead: boolean;
  pendingArchive: boolean;
  onItemClick: (item: NotificationItem) => Promise<void>;
  onArchiveClick: (id: string, e: React.MouseEvent) => Promise<void>;
}

function formatRelativeTime(dateStr: string): string {
  const timestamp = new Date(dateStr).getTime();
  if (!Number.isFinite(timestamp)) return '';
  const deltaSeconds = Math.round((timestamp - Date.now()) / 1000);
  const absoluteSeconds = Math.abs(deltaSeconds);
  const formatter = new Intl.RelativeTimeFormat('ar-u-nu-latn', { numeric: 'auto' });
  if (absoluteSeconds < 60) return 'الآن';
  if (absoluteSeconds < 3600) return toLatinDigits(formatter.format(Math.round(deltaSeconds / 60), 'minute'));
  if (absoluteSeconds < 86400) return toLatinDigits(formatter.format(Math.round(deltaSeconds / 3600), 'hour'));
  if (absoluteSeconds < 604800) return toLatinDigits(formatter.format(Math.round(deltaSeconds / 86400), 'day'));
  return toLatinDigits(new Intl.DateTimeFormat('ar-YE-u-nu-latn', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    numberingSystem: 'latn'
  }).format(new Date(timestamp)));
}

function getCategoryMeta(category: NotificationCategory) {
  const iconClass = 'h-5 w-5';
  switch (category) {
    case 'operations':
      return { label: 'إشعار مالي', icon: <FileText className={iconClass} />, iconTone: 'bg-emerald-50 text-emerald-700' };
    case 'reports':
      return { label: 'تقرير', icon: <Sparkles className={iconClass} />, iconTone: 'bg-violet-50 text-violet-700' };
    case 'business':
      return { label: 'نشاط تجاري', icon: <Building2 className={iconClass} />, iconTone: 'bg-sky-50 text-sky-700' };
    case 'subscription':
      return { label: 'اشتراك', icon: <CreditCard className={iconClass} />, iconTone: 'bg-amber-50 text-amber-700' };
    case 'security':
      return { label: 'أمان', icon: <ShieldAlert className={iconClass} />, iconTone: 'bg-rose-50 text-rose-700' };
    case 'system':
      return { label: 'تحديث عام', icon: <Megaphone className={iconClass} />, iconTone: 'bg-slate-100 text-slate-700' };
    default:
      return { label: 'إشعار', icon: <Bell className={iconClass} />, iconTone: 'bg-slate-100 text-slate-700' };
  }
}

function getSeverityTone(severity: NotificationSeverity, unread: boolean) {
  if (severity === 'error') return 'bg-rose-50/80 shadow-[0_12px_32px_rgba(190,24,93,0.08)]';
  if (severity === 'warning') return 'bg-amber-50/80 shadow-[0_12px_32px_rgba(180,83,9,0.08)]';
  if (severity === 'success') return 'bg-emerald-50/65 shadow-[0_12px_32px_rgba(5,150,105,0.07)]';
  return unread ? 'bg-white shadow-[0_12px_32px_rgba(15,23,42,0.07)]' : 'bg-white/70 shadow-[0_8px_24px_rgba(15,23,42,0.035)]';
}

const NotificationItemComponent: React.FC<NotificationItemProps> = ({
  item,
  pendingRead,
  pendingArchive,
  onItemClick,
  onArchiveClick
}) => {
  const isUnread = !item.read_at;
  const category = getCategoryMeta(item.category);
  const hasAction = item.action_type !== 'none';
  const isClickable = isUnread || hasAction;

  const handleClick = () => {
    if (pendingRead || pendingArchive || !isClickable) return;
    void onItemClick(item);
  };

  const handleArchive = (event: React.MouseEvent) => {
    event.stopPropagation();
    if (pendingRead || pendingArchive) return;
    void onArchiveClick(item.id, event);
  };

  return (
    <article
      onClick={handleClick}
      className={`relative flex items-start gap-3.5 rounded-[1.7rem] p-4 text-right transition-all ${getSeverityTone(item.severity, isUnread)} ${isClickable ? 'cursor-pointer active:scale-[0.995]' : ''} ${pendingRead || pendingArchive ? 'pointer-events-none opacity-60' : ''}`}
    >
      <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${category.iconTone}`}>
        {category.icon}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-white/70 px-2.5 py-1 text-[9px] font-bold text-slate-500">{category.label}</span>
          {isUnread && <span className="flex items-center gap-1 text-[9px] font-bold text-emerald-700"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />جديد</span>}
        </div>
        <h3 className={`mt-2 text-sm font-bold leading-6 ${isUnread ? 'text-slate-950' : 'text-slate-700'}`}>{item.title}</h3>
        <p className="mt-1.5 whitespace-pre-line break-words text-xs leading-6 text-slate-600">{item.body}</p>
        <time className="mt-2 block text-[10px] text-slate-400">{formatRelativeTime(item.created_at)}</time>
      </div>

      <button
        onClick={handleArchive}
        disabled={pendingRead || pendingArchive}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/70 text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600 disabled:opacity-30"
        title="أرشفة"
        aria-label="أرشفة الإشعار"
      >
        <Archive className="h-4 w-4" />
      </button>
    </article>
  );
};

export default NotificationItemComponent;

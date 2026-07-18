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
import { toLatinDigits } from '../../lib/digits';
import FinancialEntityLogo from '../FinancialEntityLogo';
import { detectFinancialEntityFromText } from '../../lib/financialEntities';

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
    const diffMs = Date.now() - date.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHr = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHr / 24);

    if (diffSec < 60) return 'الآن';
    if (diffMin < 60) return toLatinDigits(`منذ ${diffMin} دقيقة`);
    if (diffHr < 24) return toLatinDigits(`منذ ${diffHr} ساعة`);
    if (diffDay === 1) return 'أمس';
    if (diffDay < 7) return toLatinDigits(`منذ ${diffDay} أيام`);

    return toLatinDigits(new Intl.DateTimeFormat('ar-YE-u-nu-latn', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      numberingSystem: 'latn'
    }).format(date));
  } catch {
    return '';
  }
}

function getCategoryIcon(category: NotificationCategory) {
  const sizeClass = 'w-5 h-5';
  switch (category) {
    case 'operations':
      return { icon: <FileText className={sizeClass} />, bg: 'bg-emerald-50 text-emerald-600' };
    case 'reports':
      return { icon: <Sparkles className={sizeClass} />, bg: 'bg-violet-50 text-violet-600' };
    case 'business':
      return { icon: <Users className={sizeClass} />, bg: 'bg-blue-50 text-blue-600' };
    case 'subscription':
      return { icon: <CreditCard className={sizeClass} />, bg: 'bg-amber-50 text-amber-600' };
    case 'security':
      return { icon: <ShieldAlert className={sizeClass} />, bg: 'bg-rose-50 text-rose-600' };
    default:
      return { icon: <Bell className={sizeClass} />, bg: 'bg-slate-50 text-slate-600' };
  }
}

function severityClasses(item: NotificationItem, unread: boolean): string {
  if (item.severity === 'error') return 'bg-rose-50/90 shadow-[0_10px_28px_rgba(225,29,72,0.07)]';
  if (item.severity === 'warning') return 'bg-amber-50/90 shadow-[0_10px_28px_rgba(217,119,6,0.07)]';
  if (item.severity === 'success') return 'bg-emerald-50/80 shadow-[0_10px_28px_rgba(5,150,105,0.06)]';
  return unread ? 'bg-white shadow-[0_10px_28px_rgba(15,23,42,0.07)]' : 'bg-slate-50/70 shadow-sm';
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
  const isClickable = isUnread || hasAction;
  const payloadEntity = item.action_payload?.financial_entity || item.action_payload?.entity;
  const financialEntity = item.category === 'operations'
    ? detectFinancialEntityFromText(payloadEntity, item.title, item.body)
    : null;

  const handleClick = () => {
    if (pendingRead || pendingArchive) return;
    if (isClickable) void onItemClick(item);
  };

  const handleArchive = (event: React.MouseEvent) => {
    event.stopPropagation();
    if (pendingRead || pendingArchive) return;
    void onArchiveClick(item.id, event);
  };

  return (
    <div
      onClick={handleClick}
      className={`group relative flex items-start gap-3.5 rounded-[1.6rem] p-4 text-right transition-all select-none ${severityClasses(item, isUnread)} ${
        isClickable ? 'cursor-pointer active:scale-[0.995]' : ''
      } ${(pendingRead || pendingArchive) ? 'opacity-60 pointer-events-none' : ''}`}
    >
      {isUnread && <span className="absolute left-4 top-4 rounded-full bg-emerald-500 px-2 py-0.5 text-[8px] font-bold text-white">جديد</span>}

      {financialEntity ? (
        <FinancialEntityLogo
          entity={financialEntity.nameAr}
          className="h-12 w-12 rounded-2xl"
          imageClassName="h-full w-full object-contain p-1.5"
        />
      ) : (
        <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${bg}`}>{icon}</div>
      )}

      <div className="min-w-0 flex-1 space-y-1.5 pl-7">
        <div className="flex items-center gap-2">
          <h4 className={`truncate text-sm font-bold leading-snug ${isUnread ? 'text-slate-950' : 'text-slate-700'}`}>{item.title}</h4>
        </div>
        <p className="whitespace-pre-line break-words text-xs leading-6 text-slate-600">{item.body}</p>
        <div className="flex items-center gap-2 pt-0.5 text-[9px] text-slate-400">
          <span>{item.category === 'operations' ? 'إشعار مالي' : item.category === 'reports' ? 'تقرير' : item.category === 'business' ? 'نشاط تجاري' : item.category === 'security' ? 'أمان' : item.category === 'subscription' ? 'اشتراك' : 'تحديث عام'}</span>
          <span>·</span>
          <span>{formatRelativeTime(item.created_at)}</span>
        </div>
      </div>

      <button
        onClick={handleArchive}
        disabled={pendingRead || pendingArchive}
        className="absolute bottom-3 left-3 rounded-xl p-2 text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-500 disabled:opacity-30"
        title="أرشفة"
        aria-label="أرشفة الإشعار"
      >
        <Archive className="h-4 w-4" />
      </button>
    </div>
  );
};

export default NotificationItemComponent;

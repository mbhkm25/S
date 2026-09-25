import type { MouseEvent } from 'react';
import { BriefcaseBusiness, CalendarCheck2, MoreHorizontal, UserRound } from 'lucide-react';
import {
  navigateProduct,
  productHref,
  shouldHandleProductLinkClick,
} from '../../lib/productNavigation';

type NavItem = {
  id: 'today' | 'personal-manager' | 'business' | 'more';
  label: string;
  path: string;
  icon: typeof CalendarCheck2;
};

type Props = {
  onNavigate?: () => void;
  compact?: boolean;
};

const ITEMS: NavItem[] = [
  { id: 'today', label: 'اليوم', path: 'today', icon: CalendarCheck2 },
  { id: 'personal-manager', label: 'المدير الشخصي', path: 'financial', icon: UserRound },
  { id: 'business', label: 'الأعمال', path: 'commercial', icon: BriefcaseBusiness },
  { id: 'more', label: 'المزيد', path: 'more', icon: MoreHorizontal },
];

function isActive(item: NavItem): boolean {
  const current = window.location.pathname.replace(/\/+$/, '') || '/';
  const target = productHref(item.path).replace(/\/+$/, '');

  if (item.id === 'today') return current === target || /\/work\/(?:tasks|approvals|automations)\/?$/.test(current);
  if (item.id === 'personal-manager') return current === target || current.startsWith(`${target}/`);
  if (item.id === 'business') {
    return current === target
      || current.startsWith(`${target}/`)
      || /\/business\/manage(?:\/|$)/.test(current);
  }
  if (item.id === 'more') {
    return current === target
      || /\/(?:library|connections|account-center)\/?$/.test(current);
  }
  return false;
}

function handleClick(event: MouseEvent<HTMLAnchorElement>, path: string, onNavigate?: () => void): void {
  if (!shouldHandleProductLinkClick(event)) return;
  event.preventDefault();
  navigateProduct(path);
  onNavigate?.();
}

export default function SanadUnifiedNavLinks({ onNavigate, compact = false }: Props) {
  return (
    <nav aria-label="تنقل سند" data-sanad-unified-navigation="true" className="space-y-1">
      {ITEMS.map((item) => {
        const active = isActive(item);
        const Icon = item.icon;
        return (
          <a
            key={item.id}
            href={productHref(item.path)}
            onClick={(event) => handleClick(event, item.path, onNavigate)}
            aria-current={active ? 'page' : undefined}
            title={item.label}
            data-sanad-nav-item={item.id}
            data-active={active ? 'true' : 'false'}
            className={`sanad-focus-ring group flex min-h-11 min-w-0 items-center gap-2.5 rounded-[var(--sanad-radius-md)] px-2.5 text-[13px] leading-5 transition-colors ${compact ? 'lg:justify-center' : ''} ${active
              ? 'bg-[var(--sanad-nav-active-bg)] font-medium text-[var(--sanad-text-strong)]'
              : 'font-normal text-[var(--sanad-text-muted)] hover:bg-[var(--sanad-nav-hover-bg)] hover:text-[var(--sanad-text-strong)]'}`}
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--sanad-radius-sm)]">
              <Icon className="h-[18px] w-[18px]" strokeWidth={active ? 2 : 1.75} aria-hidden="true" />
            </span>
            <span className={`min-w-0 flex-1 truncate ${compact ? 'lg:sr-only' : ''}`}>{item.label}</span>
          </a>
        );
      })}
    </nav>
  );
}

import type { MouseEvent } from 'react';
import { BriefcaseBusiness, CalendarCheck2, Ellipsis, UserRound } from 'lucide-react';
import { navigateProduct, productHref, shouldHandleProductLinkClick } from '../../lib/productNavigation';
import { readSanadProject } from '../../features/assistant/sanadProjectContext';

type Item = { id: string; label: string; path: string; icon: typeof CalendarCheck2 };
type Props = { onNavigate?: () => void; compact?: boolean };
const MAIN: Item[] = [
  { id: 'today', label: 'اليوم', path: 'today', icon: CalendarCheck2 },
  { id: 'personal', label: 'المدير الشخصي', path: 'financial', icon: UserRound },
  { id: 'business', label: 'الأعمال', path: 'commercial', icon: BriefcaseBusiness },
  { id: 'more', label: 'المزيد', path: 'more', icon: Ellipsis },
];

function isCurrent(item: Item): boolean {
  const path = window.location.pathname.replace(/\/+$/, '');
  const project = path.endsWith('/sanad-ai') ? readSanadProject(window.location.search) : null;
  if (item.id === 'personal') {
    return /\/financial(?:\/|$)/.test(path)
      || (path.endsWith('/sanad-ai') && project?.kind === 'personal');
  }
  if (item.id === 'business') {
    return /\/(commercial|business\/manage)(?:\/|$)/.test(path)
      || (path.endsWith('/sanad-ai') && project?.kind === 'business');
  }
  if (item.id === 'today') return /\/(today|work\/(?:tasks|approvals|automations))\/?$/.test(path);
  return /\/(more|library|connections)\/?$/.test(path);
}

function onLink(event: MouseEvent<HTMLAnchorElement>, path: string, onNavigate?: () => void) {
  if (!shouldHandleProductLinkClick(event)) return;
  event.preventDefault();
  navigateProduct(path);
  onNavigate?.();
}

/** One global navigation: no general chats and no New Chat outside a project. */
export default function SanadUnifiedNavLinks({ onNavigate, compact = false }: Props) {
  return (
    <nav aria-label="التنقل الرئيسي لسند" data-sanad-unified-navigation="true" className="space-y-1">
      {MAIN.map(item => {
        const Icon = item.icon;
        const active = isCurrent(item);
        return (
          <a key={item.id} href={productHref(item.path)}
            onClick={e => onLink(e, item.path, onNavigate)}
            aria-current={active ? 'page' : undefined}
            title={item.label}
            data-sanad-nav-item={item.id}
            data-active={active ? 'true' : 'false'}
            className={`sanad-focus-ring flex min-h-11 min-w-0 items-center gap-2.5 rounded-[var(--sanad-radius-md)] px-2 text-[13px] transition-colors ${compact ? 'lg:justify-center' : ''} ${active
              ? 'bg-[var(--sanad-nav-active-bg)] font-medium text-[var(--sanad-text-strong)]'
              : 'text-[var(--sanad-text-muted)] hover:bg-[var(--sanad-nav-hover-bg)]'}`}>
            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--sanad-radius-md)] ${active ? 'bg-[var(--sanad-interactive-soft)]' : ''}`}>
              <Icon className="h-[19px] w-[19px]" strokeWidth={active ? 2 : 1.75} aria-hidden="true"/>
            </span>
            <span className={`min-w-0 flex-1 truncate ${compact ? 'lg:sr-only' : ''}`}>{item.label}</span>
          </a>
        );
      })}
    </nav>
  );
}

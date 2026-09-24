import { useEffect, useState, type MouseEvent } from 'react';
import {
  BadgeCheck,
  BookOpen,
  BriefcaseBusiness,
  CalendarCheck2,
  ChevronDown,
  Library,
  ListTodo,
  Plug,
  WalletCards,
} from 'lucide-react';
import {
  navigateProduct,
  productHref,
  shouldHandleProductLinkClick,
} from '../../lib/productNavigation';

type NavItem = {
  id: string;
  label: string;
  path: string;
  icon: typeof CalendarCheck2;
};

type NavSection = 'primary' | 'work' | 'capabilities' | 'connections';

type Props = {
  onNavigate?: () => void;
  sections?: NavSection[];
  compact?: boolean;
};

const PRIMARY: NavItem[] = [
  { id: 'today', label: 'اليوم', path: 'today', icon: CalendarCheck2 },
  { id: 'library', label: 'المكتبة', path: 'library', icon: Library },
];

const WORK: NavItem[] = [
  { id: 'tasks', label: 'المهام', path: 'work/tasks', icon: ListTodo },
  { id: 'approvals', label: 'الموافقات', path: 'work/approvals', icon: BadgeCheck },
  { id: 'automations', label: 'الأتمتة', path: 'work/automations', icon: BookOpen },
];

const CAPABILITIES: NavItem[] = [
  { id: 'financial', label: 'المال الشخصي', path: 'financial', icon: WalletCards },
  { id: 'business', label: 'الأعمال', path: 'commercial', icon: BriefcaseBusiness },
];

const CONNECTIONS: NavItem[] = [
  { id: 'connections', label: 'الاتصالات', path: 'connections', icon: Plug },
];

function isActive(path: string): boolean {
  const current = window.location.pathname.replace(/\/+$/, '') || '/';
  const target = productHref(path).replace(/\/+$/, '');
  if (path === 'commercial') {
    return current === target
      || current.startsWith(`${target}/`)
      || /\/business\/manage(?:\/|$)/.test(current);
  }
  if (path === 'financial') return current === target || current.startsWith(`${target}/`);
  return current === target || current.startsWith(`${target}/`);
}

function handleClick(event: MouseEvent<HTMLAnchorElement>, path: string, onNavigate?: () => void): void {
  if (!shouldHandleProductLinkClick(event)) return;
  event.preventDefault();
  navigateProduct(path);
  onNavigate?.();
}

function NavRow({ item, compact, onNavigate }: {
  item: NavItem;
  key?: string;
  compact: boolean;
  onNavigate?: () => void;
}) {
  const active = isActive(item.path);
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
      className={`sanad-focus-ring group flex min-h-10 min-w-0 items-center gap-2.5 rounded-[var(--sanad-radius-md)] px-2.5 text-[13px] leading-5 transition-colors ${compact ? 'lg:justify-center' : ''} ${active
        ? 'bg-[var(--sanad-nav-active-bg)] font-medium text-[var(--sanad-text-strong)]'
        : 'font-normal text-[var(--sanad-text-muted)] hover:bg-[var(--sanad-nav-hover-bg)] hover:text-[var(--sanad-text-strong)]'}`}
    >
      <Icon className="h-[17px] w-[17px] shrink-0" strokeWidth={active ? 2 : 1.75} aria-hidden="true" />
      <span className={`min-w-0 flex-1 truncate ${compact ? 'lg:sr-only' : ''}`}>{item.label}</span>
      <span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--sanad-brand-mint)] transition-opacity ${compact ? 'lg:hidden' : ''} ${active ? 'opacity-100' : 'opacity-0 group-hover:opacity-40'}`} />
    </a>
  );
}

function Group({ title, items, compact, onNavigate }: {
  title?: string;
  items: NavItem[];
  compact: boolean;
  onNavigate?: () => void;
}) {
  const activeGroup = items.some((item) => isActive(item.path));
  const [expanded, setExpanded] = useState(activeGroup);
  useEffect(() => {
    if (activeGroup) setExpanded(true);
  }, [activeGroup]);

  return (
    <div className="space-y-0.5">
      {title ? (
        <button
          type="button"
          data-sanad-sidebar-group={title}
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
          className={`sanad-sidebar-section-heading sanad-focus-ring flex w-full items-center gap-2 text-right text-[12px] font-semibold text-[var(--sanad-text-strong)] ${compact ? 'lg:hidden' : ''}`}
        >
          <span className="min-w-0 flex-1">{title}</span>
          <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-[var(--sanad-text-muted)] transition-transform ${expanded ? '' : '-rotate-90'}`} aria-hidden="true" />
        </button>
      ) : null}
      <div className={title && !expanded ? (compact ? 'hidden lg:block' : 'hidden') : 'block'}>
        {items.map((item) => <NavRow key={item.id} item={item} compact={compact} onNavigate={onNavigate} />)}
      </div>
    </div>
  );
}

export default function SanadUnifiedNavLinks({
  onNavigate,
  sections = ['primary', 'work', 'capabilities', 'connections'],
  compact = false,
}: Props) {
  const visible = new Set(sections);
  return (
    <nav aria-label="تنقل سند" data-sanad-unified-navigation="true" className="space-y-2">
      {visible.has('primary') ? <Group items={PRIMARY} compact={compact} onNavigate={onNavigate} /> : null}
      {visible.has('work') ? <Group title="العمل" items={WORK} compact={compact} onNavigate={onNavigate} /> : null}
      {visible.has('capabilities') ? <Group title="القدرات" items={CAPABILITIES} compact={compact} onNavigate={onNavigate} /> : null}
      {visible.has('connections') ? <Group items={CONNECTIONS} compact={compact} onNavigate={onNavigate} /> : null}
    </nav>
  );
}

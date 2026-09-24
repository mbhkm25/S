import type { MouseEvent } from 'react';
import {
  BadgeCheck,
  BookOpen,
  BriefcaseBusiness,
  CalendarCheck2,
  Library,
  ListTodo,
  Plug,
  Settings2,
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

type NavSection = 'primary' | 'work' | 'capabilities' | 'utility';

type Props = {
  onNavigate?: () => void;
  sections?: NavSection[];
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

const UTILITY: NavItem[] = [
  { id: 'settings', label: 'الحساب والإعدادات', path: 'account-center', icon: Settings2 },
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
  return current === target;
}

function handleClick(event: MouseEvent<HTMLAnchorElement>, path: string, onNavigate?: () => void): void {
  if (!shouldHandleProductLinkClick(event)) return;
  event.preventDefault();
  navigateProduct(path);
  onNavigate?.();
}

function Group({ title, items, onNavigate }: {
  title?: string;
  items: NavItem[];
  onNavigate?: () => void;
}) {
  return (
    <div className="space-y-0.5">
      {title ? (
        <p className="px-3 pb-1 pt-3 text-[11px] font-medium leading-5 tracking-normal text-[var(--sanad-text-subtle)]">
          {title}
        </p>
      ) : null}
      {items.map(({ id, path, label, icon: Icon }) => {
        const active = isActive(path);
        return (
          <a
            key={id}
            href={productHref(path)}
            onClick={(event) => handleClick(event, path, onNavigate)}
            aria-current={active ? 'page' : undefined}
            title={label}
            data-sanad-nav-item={id}
            data-active={active ? 'true' : 'false'}
            className={`sanad-focus-ring group flex min-h-10 min-w-0 items-center gap-2.5 rounded-[var(--sanad-radius-md)] px-2.5 text-[13px] leading-5 transition-colors ${active
              ? 'bg-[var(--sanad-nav-active-bg)] font-medium text-[var(--sanad-text-strong)]'
              : 'font-normal text-[var(--sanad-text-muted)] hover:bg-[var(--sanad-nav-hover-bg)] hover:text-[var(--sanad-text-strong)]'}`}
          >
            <Icon className="h-[17px] w-[17px] shrink-0" strokeWidth={active ? 2 : 1.75} aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate">{label}</span>
            <span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--sanad-brand-mint)] transition-opacity ${active ? 'opacity-100' : 'opacity-0 group-hover:opacity-40'}`} />
          </a>
        );
      })}
    </div>
  );
}

export default function SanadUnifiedNavLinks({
  onNavigate,
  sections = ['primary', 'work', 'capabilities', 'utility'],
}: Props) {
  const visible = new Set(sections);
  return (
    <nav aria-label="تنقل سند" data-sanad-unified-navigation="true" className="space-y-1">
      {visible.has('primary') ? <Group items={PRIMARY} onNavigate={onNavigate} /> : null}
      {visible.has('work') ? <Group title="العمل" items={WORK} onNavigate={onNavigate} /> : null}
      {visible.has('capabilities') ? (
        <>
          <Group title="القدرات" items={CAPABILITIES} onNavigate={onNavigate} />
          <Group items={CONNECTIONS} onNavigate={onNavigate} />
        </>
      ) : null}
      {visible.has('utility') ? <Group items={UTILITY} onNavigate={onNavigate} /> : null}
    </nav>
  );
}

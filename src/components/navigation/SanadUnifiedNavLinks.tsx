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
  dense?: boolean;
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
  { id: 'connections', label: 'الاتصالات', path: 'connections', icon: Plug },
];

const UTILITY: NavItem[] = [
  { id: 'settings', label: 'الحساب والإعدادات', path: 'account-center', icon: Settings2 },
];

function normalizedPathname(): string {
  return window.location.pathname.replace(/\/+$/, '') || '/';
}

function isActive(path: string): boolean {
  const pathname = normalizedPathname();
  const target = productHref(path).replace(/\/+$/, '');
  if (path === 'financial') return pathname === target || pathname.startsWith(`${target}/`);
  if (path === 'commercial') return pathname === target || pathname.startsWith(`${target}/`);
  if (path === 'work/tasks') return pathname === target;
  if (path === 'work/approvals') return pathname === target;
  if (path === 'work/automations') return pathname === target;
  return pathname === target;
}

function handleClick(
  event: MouseEvent<HTMLAnchorElement>,
  path: string,
  onNavigate?: () => void,
): void {
  if (!shouldHandleProductLinkClick(event)) return;
  event.preventDefault();
  navigateProduct(path);
  onNavigate?.();
}

function Group({
  title,
  items,
  dense,
  onNavigate,
}: {
  title?: string;
  items: NavItem[];
  dense: boolean;
  onNavigate?: () => void;
}) {
  return (
    <div className={dense ? 'space-y-0.5' : 'space-y-1'}>
      {title ? (
        <p className="px-2 pb-1 pt-2 text-[10px] font-medium text-[var(--sanad-text-subtle)]">
          {title}
        </p>
      ) : null}
      {items.map((item) => {
        const Icon = item.icon;
        const active = isActive(item.path);
        return (
          <a
            key={item.id}
            href={productHref(item.path)}
            onClick={(event) => handleClick(event, item.path, onNavigate)}
            aria-current={active ? 'page' : undefined}
            className={`sanad-focus-ring flex min-h-9 items-center gap-2.5 rounded-[var(--sanad-radius-md)] px-2.5 text-[12px] transition ${active
              ? 'bg-[var(--sanad-surface-inverse)] font-medium text-white'
              : 'font-medium text-[var(--sanad-text-muted)] hover:bg-[var(--sanad-surface-2)] hover:text-[var(--sanad-text-strong)]'}`}
          >
            <Icon className="h-4 w-4 shrink-0" strokeWidth={active ? 2 : 1.8} />
            <span className="truncate">{item.label}</span>
          </a>
        );
      })}
    </div>
  );
}

export default function SanadUnifiedNavLinks({
  dense = false,
  onNavigate,
  sections = ['primary', 'work', 'capabilities', 'utility'],
}: Props) {
  const visible = new Set(sections);
  return (
    <nav aria-label="تنقل سند" data-sanad-unified-navigation="true" className={dense ? 'space-y-1' : 'space-y-2'}>
      {visible.has('primary') ? <Group items={PRIMARY} dense={dense} onNavigate={onNavigate} /> : null}
      {visible.has('work') ? <Group title="العمل" items={WORK} dense={dense} onNavigate={onNavigate} /> : null}
      {visible.has('capabilities') ? <Group title="القدرات" items={CAPABILITIES} dense={dense} onNavigate={onNavigate} /> : null}
      {visible.has('utility') ? <Group items={UTILITY} dense={dense} onNavigate={onNavigate} /> : null}
    </nav>
  );
}

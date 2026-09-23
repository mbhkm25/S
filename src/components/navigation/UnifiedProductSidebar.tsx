import type { MouseEvent } from 'react';
import {
  BriefcaseBusiness,
  PanelRightClose,
  PanelRightOpen,
  Settings2,
  WalletCards,
} from 'lucide-react';
import SanadIntelligenceMark from '../../features/assistant/SanadIntelligenceMark';
import { prefetchProductArea } from '../../features/financial/productRouteLoaders';
import {
  navigateProduct,
  productHref,
  shouldHandleProductLinkClick,
  type ProductArea,
} from '../../lib/productNavigation';

type Props = {
  activeArea: ProductArea;
  collapsed: boolean;
  compactOnly?: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
};

const PRIMARY_ITEMS = [
  {
    id: 'assistant' as const,
    label: 'سند',
    description: 'المحادثة والذكاء التشغيلي',
    path: 'sanad-ai',
    icon: null,
  },
  {
    id: 'financial' as const,
    label: 'المالي',
    description: 'الأموال والعمليات الشخصية',
    path: 'financial',
    icon: WalletCards,
  },
  {
    id: 'business' as const,
    label: 'الأعمال',
    description: 'الأنشطة والعملاء والتشغيل',
    path: 'commercial',
    icon: BriefcaseBusiness,
  },
];

function handleProductClick(event: MouseEvent<HTMLAnchorElement>, path: string): void {
  if (!shouldHandleProductLinkClick(event)) return;
  event.preventDefault();
  navigateProduct(path);
}

function NavItem({
  item,
  active,
  collapsed,
}: {
  item: (typeof PRIMARY_ITEMS)[number];
  active: boolean;
  collapsed: boolean;
}) {
  const Icon = item.icon;

  return (
    <a
      href={productHref(item.path)}
      onClick={(event) => handleProductClick(event, item.path)}
      onPointerEnter={() => prefetchProductArea(item.id)}
      onFocus={() => prefetchProductArea(item.id)}
      aria-current={active ? 'page' : undefined}
      title={effectiveCollapsed ? item.label : undefined}
      data-active={active ? 'true' : 'false'}
      className={[
        'sanad-focus-ring group flex min-h-12 items-center rounded-[var(--sanad-radius-md)] transition',
        effectiveCollapsed ? 'justify-center px-2' : 'gap-3 px-3',
        active
          ? 'bg-[var(--sanad-surface-inverse)] text-white shadow-[var(--sanad-shadow-1)]'
          : 'text-[var(--sanad-text-muted)] hover:bg-[var(--sanad-surface-2)] hover:text-[var(--sanad-text-strong)]',
      ].join(' ')}
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center">
        {item.id === 'assistant' ? (
          <SanadIntelligenceMark
            state="idle"
            size={19}
            monochrome
            className={active ? 'text-white' : 'text-current'}
          />
        ) : Icon ? (
          <Icon className="h-[18px] w-[18px]" strokeWidth={active ? 2 : 1.8} />
        ) : null}
      </span>

      {!effectiveCollapsed ? (
        <span className="min-w-0 flex-1 text-right">
          <strong className="block truncate text-[13px] font-semibold">{item.label}</strong>
          <span className={`mt-0.5 block truncate text-[10px] ${active ? 'text-white/65' : 'text-[var(--sanad-text-subtle)]'}`}>
            {item.description}
          </span>
        </span>
      ) : null}
    </a>
  );
}

export default function UnifiedProductSidebar({
  activeArea,
  collapsed,
  compactOnly = false,
  onCollapsedChange,
}: Props) {
  const effectiveCollapsed = compactOnly || collapsed;

  return (
    <aside
      data-sanad-unified-sidebar
      data-collapsed={effectiveCollapsed ? 'true' : 'false'}
      className={[
        'sticky top-0 z-[70] hidden h-dvh shrink-0 flex-col border-l border-[var(--sanad-border-subtle)] bg-[var(--sanad-surface-1)] lg:flex',
        'transition-[width] duration-200 motion-reduce:transition-none',
        effectiveCollapsed ? 'w-[76px]' : 'w-[264px]',
      ].join(' ')}
      dir="rtl"
      aria-label="التنقل الرئيسي في سند"
    >
      <div className={`flex h-[68px] shrink-0 items-center border-b border-[var(--sanad-border-subtle)] ${effectiveCollapsed ? 'justify-center px-2' : 'justify-between gap-2 px-3'}`}>
        {!effectiveCollapsed ? (
          <a
            href={productHref('sanad-ai')}
            onClick={(event) => handleProductClick(event, 'sanad-ai')}
            className="sanad-focus-ring flex min-w-0 items-center gap-2 rounded-xl px-1.5 py-1"
            aria-label="فتح سند"
          >
            <img
              src={`${import.meta.env.BASE_URL}logo.png`}
              alt="سند"
              className="h-9 w-auto max-w-[126px] object-contain"
            />
          </a>
        ) : (
          <a
            href={productHref('sanad-ai')}
            onClick={(event) => handleProductClick(event, 'sanad-ai')}
            className="sanad-focus-ring flex h-10 w-10 items-center justify-center rounded-xl text-[var(--sanad-text-strong)]"
            aria-label="فتح سند"
          >
            <SanadIntelligenceMark state="idle" size={22} monochrome />
          </a>
        )}

        {!effectiveCollapsed && !compactOnly ? (
          <button
            type="button"
            onClick={() => onCollapsedChange(true)}
            className="sanad-focus-ring flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[var(--sanad-text-subtle)] transition hover:bg-[var(--sanad-surface-2)] hover:text-[var(--sanad-text-strong)]"
            aria-label="طي الشريط الجانبي"
            title="طي الشريط الجانبي"
          >
            <PanelRightClose className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-3">
        {effectiveCollapsed ? (
          <button
            type="button"
            onClick={() => onCollapsedChange(false)}
            className="sanad-focus-ring mb-2 flex h-10 w-full items-center justify-center rounded-xl text-[var(--sanad-text-subtle)] transition hover:bg-[var(--sanad-surface-2)] hover:text-[var(--sanad-text-strong)]"
            aria-label="توسيع الشريط الجانبي"
            title="توسيع الشريط الجانبي"
          >
            <PanelRightOpen className="h-4 w-4" />
          </button>
        ) : effectiveCollapsed ? null : (
          <p className="mb-2 px-3 text-[10px] font-medium text-[var(--sanad-text-subtle)]">مساحات سند</p>
        )}

        <nav className="space-y-1" aria-label="مساحات سند">
          {PRIMARY_ITEMS.map((item) => (
            <NavItem
              key={item.id}
              item={item}
              active={activeArea === item.id}
              collapsed={effectiveCollapsed}
            />
          ))}
        </nav>
      </div>

      <div className="shrink-0 border-t border-[var(--sanad-border-subtle)] p-2">
        <a
          href={productHref('account-center')}
          onClick={(event) => handleProductClick(event, 'account-center')}
          aria-current={activeArea === 'account' ? 'page' : undefined}
          title={effectiveCollapsed ? 'الحساب والإعدادات' : undefined}
          className={[
            'sanad-focus-ring flex min-h-11 items-center rounded-[var(--sanad-radius-md)] transition',
            effectiveCollapsed ? 'justify-center px-2' : 'gap-3 px-3',
            activeArea === 'account'
              ? 'bg-[var(--sanad-surface-2)] text-[var(--sanad-text-strong)]'
              : 'text-[var(--sanad-text-muted)] hover:bg-[var(--sanad-surface-2)] hover:text-[var(--sanad-text-strong)]',
          ].join(' ')}
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center">
            <Settings2 className="h-[18px] w-[18px]" />
          </span>
          {!effectiveCollapsed ? (
            <span className="min-w-0">
              <strong className="block truncate text-[12px] font-semibold">الحساب والإعدادات</strong>
              <span className="mt-0.5 block truncate text-[10px] text-[var(--sanad-text-subtle)]">الهوية، الأمان، الاشتراك والتفضيلات</span>
            </span>
          ) : null}
        </a>
      </div>
    </aside>
  );
}

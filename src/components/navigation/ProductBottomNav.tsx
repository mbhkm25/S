import type { MouseEvent } from 'react';
import { BriefcaseBusiness, UserRound, WalletCards } from 'lucide-react';
import SanadIntelligenceMark from '../../features/assistant/SanadIntelligenceMark';
import {
  navigateProduct,
  productHref,
  shouldHandleProductLinkClick,
  type ProductArea,
} from '../../lib/productNavigation';
import { prefetchProductArea } from '../../features/financial/productRouteLoaders';

type Props = {
  activeArea?: ProductArea;
  legacyPage?: string;
  layoutMode?: 'document' | 'viewport';
};

function inferArea(pathname: string, legacyPage?: string): ProductArea {
  if (/\/(sanad-ai)\/?$/.test(pathname)) return 'assistant';
  if (/\/(commercial)(?:\/actions)?\/?$/.test(pathname) || pathname.includes('/business/')) return 'business';
  if (/\/(account-center)\/?$/.test(pathname) || pathname.includes('/profile') || pathname.includes('/notifications')) return 'account';
  if (/\/(financial)(?:\/(?:actions|accounts|transactions|obligations|budgets|goals|parties))?\/?$/.test(pathname)) return 'financial';

  if (legacyPage && ['business-create', 'business-manage', 'business-operations', 'business-team', 'business-manage-profile', 'business-whatsapp-catalog', 'business-customers', 'business-community'].includes(legacyPage)) return 'business';
  if (legacyPage && ['profile', 'notifications'].includes(legacyPage)) return 'account';
  if (legacyPage && ['upload', 'my-operations', 'verify-notice', 'scan-qr', 'reports', 'share-intake', 'home', 'details'].includes(legacyPage)) return 'financial';
  return 'financial';
}

const ITEMS = [
  { id: 'assistant' as const, label: 'سند', path: 'sanad-ai', icon: null },
  { id: 'financial' as const, label: 'سند المالي', path: 'financial', icon: WalletCards },
  { id: 'business' as const, label: 'سند للأعمال', path: 'commercial', icon: BriefcaseBusiness },
  { id: 'account' as const, label: 'حسابي', path: 'account-center', icon: UserRound },
];

function handleProductClick(event: MouseEvent<HTMLAnchorElement>, path: string): void {
  if (!shouldHandleProductLinkClick(event)) return;
  event.preventDefault();
  navigateProduct(path);
}

export default function ProductBottomNav({ activeArea, legacyPage, layoutMode = 'document' }: Props) {
  const active = activeArea || inferArea(window.location.pathname, legacyPage);
  const spaNavigation = legacyPage === undefined;
  const viewportMode = layoutMode === 'viewport';

  return (
    <nav
      data-product-navigation="primary"
      data-layout-mode={layoutMode}
      className={`${viewportMode ? 'relative shrink-0' : 'fixed inset-x-0 bottom-0'} z-50 border-t border-slate-200/70 bg-white/95 px-2 pb-[max(.45rem,env(safe-area-inset-bottom))] pt-2 shadow-[0_-8px_24px_rgba(15,23,42,0.05)] backdrop-blur-xl lg:fixed lg:inset-x-auto lg:bottom-auto lg:left-5 lg:top-1/2 lg:w-[92px] lg:-translate-y-1/2 lg:rounded-[1.65rem] lg:border lg:border-slate-200/80 lg:px-2 lg:py-3 lg:shadow-[0_14px_40px_rgba(15,23,42,0.08)]`}
      aria-label="أقسام سند الرئيسية"
      dir="rtl"
    >
      <div className="mx-auto grid w-full max-w-2xl grid-cols-4 gap-1 lg:grid-cols-1 lg:gap-1.5">
        {ITEMS.map((item) => {
          const Icon = item.icon;
          const selected = active === item.id;
          return (
            <a
              key={item.id}
              href={productHref(item.path)}
              onClick={spaNavigation ? (event) => handleProductClick(event, item.path) : undefined}
              onPointerEnter={spaNavigation ? () => prefetchProductArea(item.id) : undefined}
              onFocus={spaNavigation ? () => prefetchProductArea(item.id) : undefined}
              aria-current={selected ? 'page' : undefined}
              title={item.label}
              className={`group flex min-w-0 flex-col items-center justify-center gap-1 rounded-2xl px-1 py-1.5 text-center transition active:scale-[.98] lg:px-2 lg:py-2.5 ${selected ? 'text-slate-950' : 'text-slate-400 hover:bg-slate-50 hover:text-slate-700'}`}
            >
              <span className={`flex h-9 w-11 items-center justify-center rounded-2xl transition ${selected ? 'bg-slate-950 text-white shadow-sm' : 'bg-transparent group-hover:bg-white'}`}>
                {item.id === 'assistant' ? (
                  <SanadIntelligenceMark state="idle" size={18} className={selected ? 'text-white' : 'text-current'} />
                ) : Icon ? (
                  <Icon className="h-[18px] w-[18px]" strokeWidth={selected ? 2 : 1.8} />
                ) : null}
              </span>
              <span className={`max-w-full truncate text-[11px] ${selected ? 'font-semibold text-slate-950' : 'font-medium'}`}>{item.label}</span>
            </a>
          );
        })}
      </div>
    </nav>
  );
}

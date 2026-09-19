import { Bot, BriefcaseBusiness, UserRound, WalletCards } from 'lucide-react';

type ProductArea = 'assistant' | 'financial' | 'business' | 'account';

type Props = {
  activeArea?: ProductArea;
  legacyPage?: string;
};

function basePath(): string {
  const value = import.meta.env.VITE_APP_BASE_PATH || '/';
  return value.endsWith('/') ? value : `${value}/`;
}

function inferArea(pathname: string, legacyPage?: string): ProductArea {
  if (/\/(sanad-ai)\/?$/.test(pathname)) return 'assistant';
  if (/\/(commercial)(?:\/actions)?\/?$/.test(pathname) || pathname.includes('/business/')) return 'business';
  if (/\/(account-center)\/?$/.test(pathname) || pathname.includes('/profile') || pathname.includes('/notifications')) return 'account';
  if (/\/(financial)(?:\/actions)?\/?$/.test(pathname)) return 'financial';

  if (legacyPage && ['business-create', 'business-manage', 'business-operations', 'business-team', 'business-manage-profile', 'business-whatsapp-catalog', 'business-customers', 'business-community'].includes(legacyPage)) return 'business';
  if (legacyPage && ['profile', 'notifications'].includes(legacyPage)) return 'account';
  if (legacyPage && ['upload', 'my-operations', 'verify-notice', 'scan-qr', 'reports', 'share-intake', 'home', 'details'].includes(legacyPage)) return 'financial';
  return 'financial';
}

export default function ProductBottomNav({ activeArea, legacyPage }: Props) {
  const active = activeArea || inferArea(window.location.pathname, legacyPage);
  const base = basePath();

  const items = [
    { id: 'assistant' as const, label: 'مساعد سند', path: 'sanad-ai', icon: Bot },
    { id: 'financial' as const, label: 'سند المالي', path: 'financial', icon: WalletCards },
    { id: 'business' as const, label: 'سند للأعمال', path: 'commercial', icon: BriefcaseBusiness },
    { id: 'account' as const, label: 'حسابي', path: 'account-center', icon: UserRound },
  ];

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-50 border-t border-slate-200/70 bg-white/95 px-2 pb-[max(.45rem,env(safe-area-inset-bottom))] pt-2 shadow-[0_-10px_30px_rgba(15,23,42,0.06)] backdrop-blur-xl lg:inset-x-auto lg:bottom-auto lg:left-5 lg:top-1/2 lg:w-24 lg:-translate-y-1/2 lg:rounded-[1.75rem] lg:border lg:border-slate-200/80 lg:px-2 lg:py-3 lg:shadow-[0_18px_50px_rgba(15,23,42,0.10)]"
      aria-label="أقسام سند الرئيسية"
      dir="rtl"
    >
      <div className="mx-auto grid w-full max-w-2xl grid-cols-4 gap-1 lg:grid-cols-1 lg:gap-2">
        {items.map((item) => {
          const Icon = item.icon;
          const selected = active === item.id;
          return (
            <a
              key={item.id}
              href={`${base}${item.path}`}
              aria-current={selected ? 'page' : undefined}
              className="flex min-w-0 flex-col items-center justify-center gap-1 rounded-2xl px-1 py-1.5 text-center transition active:scale-[.98] lg:px-2 lg:py-2.5"
            >
              <span className={`flex h-9 w-11 items-center justify-center rounded-2xl transition ${selected ? 'bg-slate-950 text-white shadow-sm' : 'text-slate-400'}`}>
                <Icon className="h-4.5 w-4.5" />
              </span>
              <span className={`max-w-full truncate text-[9px] font-bold ${selected ? 'text-slate-950' : 'text-slate-400'}`}>{item.label}</span>
            </a>
          );
        })}
      </div>
    </nav>
  );
}

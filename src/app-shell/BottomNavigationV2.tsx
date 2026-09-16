import {
  BriefcaseBusiness,
  Sparkles,
  UserRound,
  WalletCards,
  type LucideIcon,
} from 'lucide-react';
import {
  SANAD_PRIMARY_DOMAINS,
  type SanadPrimaryDomain,
} from './domainNavigation';

type Props = {
  activeDomain: SanadPrimaryDomain;
  onSelect: (domain: SanadPrimaryDomain) => void;
};

const ICONS: Record<SanadPrimaryDomain, LucideIcon> = {
  ai: Sparkles,
  financial: WalletCards,
  business: BriefcaseBusiness,
  account: UserRound,
};

export default function BottomNavigationV2({ activeDomain, onSelect }: Props) {
  return (
    <nav
      id="bottom_nav_v2"
      aria-label="أقسام سند الرئيسية"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-slate-200/70 bg-white/95 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 shadow-[0_-8px_28px_rgba(15,23,42,0.06)] backdrop-blur-xl"
      dir="rtl"
    >
      <div className="mx-auto grid w-full max-w-2xl grid-cols-4 gap-1">
        {SANAD_PRIMARY_DOMAINS.map((domain) => {
          const Icon = ICONS[domain.id];
          const active = domain.id === activeDomain;
          return (
            <button
              key={domain.id}
              type="button"
              onClick={() => onSelect(domain.id)}
              aria-current={active ? 'page' : undefined}
              aria-label={domain.ariaLabel}
              className="group flex min-h-14 items-center justify-center rounded-2xl px-1 outline-none transition active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-slate-900/20"
            >
              <span
                className={`flex min-w-14 flex-col items-center justify-center gap-1 rounded-2xl px-3 py-2 transition ${
                  active
                    ? 'bg-slate-950 text-white shadow-sm'
                    : 'text-slate-400 group-active:bg-slate-100 group-active:text-slate-700'
                }`}
              >
                <Icon className="h-[18px] w-[18px]" aria-hidden />
                <span className={`text-[10px] font-bold ${domain.id === 'ai' ? 'font-sans' : 'font-arabic'}`}>
                  {domain.label}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

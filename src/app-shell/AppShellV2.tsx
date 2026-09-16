import type { ReactNode } from 'react';
import BottomNavigationV2 from './BottomNavigationV2';
import type { SanadPrimaryDomain } from './domainNavigation';

type Props = {
  activeDomain: SanadPrimaryDomain;
  onDomainChange: (domain: SanadPrimaryDomain) => void;
  children: ReactNode;
  showBottomNavigation?: boolean;
};

export default function AppShellV2({
  activeDomain,
  onDomainChange,
  children,
  showBottomNavigation = true,
}: Props) {
  return (
    <div className="min-h-screen bg-[#F7F7F5] text-slate-800" data-sanad-shell="v2">
      <div className={showBottomNavigation ? 'pb-24' : undefined}>{children}</div>
      {showBottomNavigation && (
        <BottomNavigationV2
          activeDomain={activeDomain}
          onSelect={onDomainChange}
        />
      )}
    </div>
  );
}

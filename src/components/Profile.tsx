import { useEffect, useState } from 'react';
import type { ComponentProps } from 'react';
import MyBusinessRelationshipsOverview from './business/MyBusinessRelationshipsOverview';
import OperationsCenter from './OperationsCenter';
import PhoneVerificationStatusCard from './PhoneVerificationStatusCard';
import ProfileOverviewV3 from './ProfileOverviewV3';
import ProfileV2 from './ProfileV2';

// BusinessWorkspacesAccess is rendered inside ProfileOverviewV3 to keep the overview compact.

type Props = ComponentProps<typeof ProfileV2>;

type ProfileView = 'overview' | 'relationships' | 'operations-center' | 'other';

function currentView(): ProfileView {
  const path = window.location.pathname.replace(/\/+$/, '');
  if (path.endsWith('/profile/relationships')) return 'relationships';
  if (path.endsWith('/profile/operations-center')) return 'operations-center';
  if (path.endsWith('/profile') || path === 'profile') return 'overview';
  return 'other';
}

export default function Profile(props: Props) {
  const [view, setView] = useState<ProfileView>(currentView);

  useEffect(() => {
    const sync = () => setView(currentView());
    const originalPush = window.history.pushState.bind(window.history);
    const originalReplace = window.history.replaceState.bind(window.history);
    window.history.pushState = ((...args: Parameters<History['pushState']>) => { originalPush(...args); sync(); }) as History['pushState'];
    window.history.replaceState = ((...args: Parameters<History['replaceState']>) => { originalReplace(...args); sync(); }) as History['replaceState'];
    window.addEventListener('popstate', sync);
    return () => {
      window.history.pushState = originalPush;
      window.history.replaceState = originalReplace;
      window.removeEventListener('popstate', sync);
    };
  }, []);

  const profilePath = (suffix = '') => {
    const base = import.meta.env.VITE_APP_BASE_PATH || '/';
    const cleanBase = base.endsWith('/') ? base : `${base}/`;
    return `${cleanBase}profile${suffix}`;
  };

  const openRelationships = () => {
    window.history.pushState({}, '', profilePath('/relationships'));
    setView('relationships');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const openOperationsCenter = () => {
    window.history.pushState({}, '', profilePath('/operations-center'));
    setView('operations-center');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const backToProfile = () => {
    window.history.pushState({}, '', profilePath());
    setView('overview');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (view === 'relationships') {
    return <MyBusinessRelationshipsOverview mode="page" onNavigate={props.onNavigate} onBack={backToProfile} />;
  }

  if (view === 'operations-center') {
    return <OperationsCenter onNavigate={props.onNavigate} onBack={backToProfile} />;
  }

  return (
    <div className={view === 'overview' ? 'profile-overview-shell' : undefined}>
      {view === 'overview' ? (
        <ProfileOverviewV3
          user={props.user}
          profile={props.profile}
          onLogout={props.onLogout}
          onNavigate={props.onNavigate}
          openOperationsCenter={openOperationsCenter}
          openRelationships={openRelationships}
        />
      ) : (
        <ProfileV2 {...props} />
      )}
      <PhoneVerificationStatusCard profile={props.profile} refreshProfile={props.refreshProfile} />
    </div>
  );
}

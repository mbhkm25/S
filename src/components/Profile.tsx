import type { ComponentProps } from 'react';
import MyBusinessRelationshipsOverview from './business/MyBusinessRelationshipsOverview';
import ProfileV2 from './ProfileV2';

type Props = ComponentProps<typeof ProfileV2>;

export default function Profile(props: Props) {
  const isOverview = (() => {
    const path = window.location.pathname.replace(/\/+$/, '');
    return path.endsWith('/profile') || path === 'profile';
  })();

  return (
    <>
      <ProfileV2 {...props} />
      {isOverview && <MyBusinessRelationshipsOverview onNavigate={props.onNavigate} />}
    </>
  );
}

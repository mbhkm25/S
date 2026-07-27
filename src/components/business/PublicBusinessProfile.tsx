import PublicBusinessProfileV3 from './PublicBusinessProfileV3';

interface Props {
  slug: string;
  onNavigate: (page: string, token?: string) => void;
  initialTab?: 'overview' | 'products' | 'services' | 'financial' | 'complaints';
}

/**
 * Public business profiles are discovery surfaces only.
 * Customer-specific relationship controls live exclusively under:
 * Account → My business relationships → Manage.
 */
export default function PublicBusinessProfile(props: Props) {
  return <PublicBusinessProfileV3 {...props} />;
}

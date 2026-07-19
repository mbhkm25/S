import BusinessCommunityV2 from './BusinessCommunityV2';

interface Props {
  onNavigate: (page: string, token?: string) => void;
}

export default function BusinessCommunity({ onNavigate }: Props) {
  return (
    <div className="-mx-3 sm:mx-0 [&_.max-w-5xl]:!max-w-none [&>div>header]:!px-1 [&>div>main]:!px-1 sm:[&>div>header]:!px-3 sm:[&>div>main]:!px-3 lg:[&>div>header]:!px-5 lg:[&>div>main]:!px-5">
      <BusinessCommunityV2 onNavigate={onNavigate} />
    </div>
  );
}

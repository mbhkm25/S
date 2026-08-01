import BusinessManageV3 from './BusinessManageV3';

interface Props {
  onNavigate: (page: string, token?: string) => void;
}

export default function BusinessManage(props: Props) {
  return <BusinessManageV3 {...props} />;
}

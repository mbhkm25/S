import BusinessCatalogManagerV2 from './BusinessCatalogManagerV2';

interface Props {
  onNavigate?: (page: string, token?: string) => void;
  businessId?: string;
}

export default function BusinessWhatsAppCatalog({ businessId }: Props) {
  return <BusinessCatalogManagerV2 businessId={businessId} />;
}

import { useEffect, useState } from 'react';
import { Settings2 } from 'lucide-react';
import { getUserBusinessContexts } from '../../lib/businessApi';
import CustomerBusinessRelationshipManager from './CustomerBusinessRelationshipManager';
import PublicBusinessProfileV3 from './PublicBusinessProfileV3';

interface Props {
  slug: string;
  onNavigate: (page: string, token?: string) => void;
  initialTab?: 'overview' | 'products' | 'services' | 'financial' | 'complaints';
}

export default function PublicBusinessProfile(props: Props) {
  const [relationship, setRelationship] = useState<{ id: string; name: string } | null>(null);
  const [managerOpen, setManagerOpen] = useState(false);

  useEffect(() => {
    let active = true;
    void getUserBusinessContexts()
      .then((contexts) => {
        const item = contexts.customer_businesses?.find((business) => business.slug === props.slug);
        if (active && item && item.customer_status === 'active') {
          setRelationship({ id: item.id, name: item.name });
        }
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, [props.slug]);

  return (
    <>
      <PublicBusinessProfileV3 {...props} />
      {relationship && (
        <button
          type="button"
          onClick={() => setManagerOpen(true)}
          className="fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] left-4 z-50 flex min-h-11 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-xs font-bold text-slate-900 shadow-[0_14px_38px_rgba(15,23,42,.22)]"
        >
          <Settings2 className="h-4 w-4" />
          إدارة علاقتك
        </button>
      )}
      {relationship && (
        <CustomerBusinessRelationshipManager
          businessId={relationship.id}
          businessName={relationship.name}
          open={managerOpen}
          onClose={() => setManagerOpen(false)}
          onRelationshipEnded={() => {
            setRelationship(null);
            window.setTimeout(() => setManagerOpen(false), 900);
          }}
        />
      )}
    </>
  );
}
